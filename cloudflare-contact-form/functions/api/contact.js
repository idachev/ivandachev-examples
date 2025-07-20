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

function createJsonResponse(data, status = 200, corsHeaders = {}) {
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
    status: 204,
    headers: getCorsHeaders(request, env),
  });
}

async function checkRateLimit(env, clientIp) {
  const rateLimitWindow = (env.RATE_LIMIT_WINDOW || 60) * 1000;
  const maxRequests = env.MAX_REQUESTS || 5;
  const rateLimitKey = `ratelimit-${clientIp}`;
  const attempts = await env.CONTACT_SUBMISSIONS.get(rateLimitKey);

  if (attempts && parseInt(attempts) >= maxRequests) {
    return { limited: true };
  }

  await env.CONTACT_SUBMISSIONS.put(rateLimitKey, String((parseInt(attempts) || 0) + 1), {
    expirationTtl: rateLimitWindow / 1000,
  });

  return { limited: false };
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

  try {
    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";

    if (!env.CONTACT_SUBMISSIONS) {
      return createJsonResponse(
        { error: "Contact form is not configured properly. Please try again later." },
        503,
        corsHeaders
      );
    }

    const rateLimitResult = await checkRateLimit(env, clientIp);
    if (rateLimitResult.limited) {
      return createJsonResponse({ error: "Too many requests. Please try again later." }, 429, corsHeaders);
    }

    const formData = await parseFormData(request);
    if (!formData) {
      return createJsonResponse({ error: "Unsupported content type" }, 400, corsHeaders);
    }

    let { name, email, message } = formData;
    name = (name || "").trim();
    email = (email || "").trim();
    message = (message || "").trim();

    const validation = validateFormFields(name, email, message, env);
    if (validation.error) {
      return createJsonResponse({ error: validation.error }, 400, corsHeaders);
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
      expirationTtl: 60 * 60 * 24 * 90, // 90 days
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
      200,
      corsHeaders
    );
  } catch (error) {
    console.error("Error processing contact form:", error);

    return createJsonResponse({ error: "An internal error occurred. Please try again later." }, 500, corsHeaders);
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
      200,
      corsHeaders
    );
  }

  if (!env.CONTACT_SUBMISSIONS) {
    return createJsonResponse({ error: "KV not configured" }, 500, corsHeaders);
  }

  try {
    const limit = parseInt(url.searchParams.get("limit")) || 100;
    const cursor = url.searchParams.get("cursor") || undefined;
    const maxLimit = 1000;

    if (limit < 1 || limit > maxLimit) {
      return createJsonResponse({ error: `Limit must be between 1 and ${maxLimit}` }, 400, corsHeaders);
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
      200,
      corsHeaders
    );
  } catch (error) {
    console.error("Error fetching submissions:", error);

    return createJsonResponse({ error: "Failed to fetch submissions" }, 500, corsHeaders);
  }
}
