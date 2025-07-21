import { StatusCodes } from "http-status-codes";

function getCorsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : ["http://localhost:8788", "http://localhost:4000"];

  let allowedOrigin = allowedOrigins.find((allowed) => origin.startsWith(allowed));

  if (!allowedOrigin && origin.match(/^http:\/\/localhost:\d+$/)) {
    allowedOrigin = origin;
  }

  return {
    "Access-Control-Allow-Origin": allowedOrigin || allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
    "Access-Control-Max-Age": "86400",
  };
}

function createJsonResponse(data, status = StatusCodes.OK, corsHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

export async function onRequestOptions({ request, env }) {
  return new Response(null, {
    status: StatusCodes.NO_CONTENT,
    headers: getCorsHeaders(request, env),
  });
}

async function checkRateLimit(env, clientIp) {
  const rateLimitWindowSeconds = (env.RATE_LIMIT_WINDOW_SECONDS || 60) * 1000;
  const maxRequestsPerIP = env.MAX_REQUESTS_PER_IP || 5;
  const rateLimitKey = `ratelimit-${clientIp}`;
  const attempts = await env.CONTACT_SUBMISSIONS.get(rateLimitKey);

  if (attempts && parseInt(attempts) >= maxRequestsPerIP) {
    return { limited: true };
  }

  await env.CONTACT_SUBMISSIONS.put(rateLimitKey, String((parseInt(attempts) || 0) + 1), {
    expirationTtl: rateLimitWindowSeconds / 1000,
  });

  return { limited: false };
}

async function verifyTurnstile(token, secretKey, clientIp) {
  const verifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

  const formData = new FormData();
  formData.append("secret", secretKey);
  formData.append("response", token);
  if (clientIp) {
    formData.append("remoteip", clientIp);
  }

  const response = await fetch(verifyUrl, {
    method: "POST",
    body: formData,
  });

  const result = await response.json();
  return result.success === true;
}

async function parseFormData(request) {
  const contentType = request.headers.get("Content-Type") || "";

  if (contentType.includes("application/json")) {
    return await request.json();
  } else if (contentType.includes("form-data") || contentType.includes("x-www-form-urlencoded")) {
    const formData = await request.formData();

    return {
      name: formData.get("name"),
      email: formData.get("email"),
      message: formData.get("message"),
      "cf-turnstile-response": formData.get("cf-turnstile-response"),
    };
  }

  return null;
}

function validateFormFields(name, email, message, env) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const minNameLength = env.MIN_NAME_LENGTH || 2;
  const maxNameLength = env.MAX_NAME_LENGTH || 200;
  const minMessageLength = env.MIN_MESSAGE_LENGTH || 50;
  const maxMessageLength = env.MAX_MESSAGE_LENGTH || 8000;

  if (!name || !email || !message) {
    return { error: "All fields are required" };
  }

  if (!emailRegex.test(email)) {
    return { error: "Invalid email address" };
  }

  if (name.length < minNameLength || name.length > maxNameLength) {
    return { error: `Name must be between ${minNameLength} and ${maxNameLength} characters` };
  }

  if (message.length < minMessageLength || message.length > maxMessageLength) {
    return { error: `Message must be between ${minMessageLength} and ${maxMessageLength} characters` };
  }

  return { valid: true };
}

export async function onRequestPost({ request, env }) {
  const corsHeaders = getCorsHeaders(request, env);
  const submissionExpirationDays = env.SUBMISSION_EXPIRATION_DAYS || 90;

  try {
    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";

    if (!env.CONTACT_SUBMISSIONS) {
      return createJsonResponse(
        { error: "Contact form is not configured properly. Please try again later." },
        StatusCodes.SERVICE_UNAVAILABLE,
        corsHeaders
      );
    }

    const rateLimitResult = await checkRateLimit(env, clientIp);
    if (rateLimitResult.limited) {
      return createJsonResponse(
        { error: "Too many requests. Please try again later." },
        StatusCodes.TOO_MANY_REQUESTS,
        corsHeaders
      );
    }

    const formData = await parseFormData(request);
    if (!formData) {
      return createJsonResponse({ error: "Unsupported content type" }, StatusCodes.BAD_REQUEST, corsHeaders);
    }

    // Verify Turnstile token
    const turnstileToken = formData["cf-turnstile-response"];
    if (!turnstileToken) {
      return createJsonResponse(
        { error: "Please complete the security challenge" },
        StatusCodes.BAD_REQUEST,
        corsHeaders
      );
    }

    if (env.TURNSTILE_SECRET_KEY) {
      const isValidToken = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, clientIp);
      if (!isValidToken) {
        return createJsonResponse(
          { error: "Security challenge verification failed. Please try again." },
          StatusCodes.BAD_REQUEST,
          corsHeaders
        );
      }
    }

    let { name, email, message } = formData;
    name = (name || "").trim();
    email = (email || "").trim();
    message = (message || "").trim();

    const validation = validateFormFields(name, email, message, env);
    if (validation.error) {
      return createJsonResponse({ error: validation.error }, StatusCodes.BAD_REQUEST, corsHeaders);
    }

    const timestamp = Date.now();
    const submissionId = `submission_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;

    const submission = {
      id: submissionId,
      name: name,
      email: email.toLowerCase(),
      message: message,
      timestamp: new Date(timestamp).toISOString(),
      ip: clientIp,
      country: request.headers.get("CF-IPCountry") || "unknown",
      userAgent: request.headers.get("User-Agent") || "unknown",
      read: false,
    };

    await env.CONTACT_SUBMISSIONS.put(submissionId, JSON.stringify(submission), {
      expirationTtl: submissionExpirationDays * 24 * 60 * 60,
      metadata: {
        email: submission.email,
        timestamp: submission.timestamp,
      },
    });

    console.log(`Contact form submission stored: ${submissionId}`);

    return createJsonResponse(
      {
        success: true,
        id: submissionId,
        message: "Your message has been sent successfully!",
        timestamp: submission.timestamp,
      },
      StatusCodes.OK,
      corsHeaders
    );
  } catch (error) {
    console.error("Error processing contact form:", error);

    return createJsonResponse(
      { error: "An internal error occurred. Please try again later." },
      StatusCodes.INTERNAL_SERVER_ERROR,
      corsHeaders
    );
  }
}

export async function onRequestGet({ request, env }) {
  const corsHeaders = getCorsHeaders(request, env);

  const url = new URL(request.url);
  const apiKey = url.searchParams.get("api_key") || request.headers.get("X-API-Key");

  if (!env.API_KEY || apiKey !== env.API_KEY) {
    return createJsonResponse(
      {
        status: "Contact form API is running",
        timestamp: new Date().toISOString(),
      },
      StatusCodes.OK,
      corsHeaders
    );
  }

  if (!env.CONTACT_SUBMISSIONS) {
    return createJsonResponse({ error: "KV not configured" }, StatusCodes.INTERNAL_SERVER_ERROR, corsHeaders);
  }

  try {
    const limit = parseInt(url.searchParams.get("limit")) || 100;
    const cursor = url.searchParams.get("cursor") || undefined;
    const maxLimit = 1000;

    if (limit < 1 || limit > maxLimit) {
      return createJsonResponse(
        { error: `Limit must be between 1 and ${maxLimit}` },
        StatusCodes.BAD_REQUEST,
        corsHeaders
      );
    }

    const {
      keys,
      list_complete,
      cursor: nextCursor,
    } = await env.CONTACT_SUBMISSIONS.list({
      prefix: "submission_",
      limit,
      cursor,
    });

    const submissions = [];

    for (const key of keys) {
      const data = await env.CONTACT_SUBMISSIONS.get(key.name);

      if (data) {
        submissions.push(JSON.parse(data));
      }
    }

    return createJsonResponse(
      {
        submissions,
        list_complete,
        cursor: list_complete ? null : nextCursor,
        count: submissions.length,
        timestamp: new Date().toISOString(),
      },
      StatusCodes.OK,
      corsHeaders
    );
  } catch (error) {
    console.error("Error fetching submissions:", error);

    return createJsonResponse({ error: "Failed to fetch submissions" }, StatusCodes.INTERNAL_SERVER_ERROR, corsHeaders);
  }
}
