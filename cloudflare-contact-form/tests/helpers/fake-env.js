// Test doubles for the contact Pages Function: in-memory KV, fetch stub, request builders.

/** In-memory KV namespace with the parts of the Workers KV API contact.js uses. */
export class FakeKV {
  constructor() {
    this.store = new Map();
    this.puts = [];
  }

  async get(key) {
    const entry = this.store.get(key);
    return entry ? entry.value : null;
  }

  async put(key, value, options = {}) {
    this.puts.push({ key, value, options });
    this.store.set(key, { value: String(value), metadata: options.metadata ?? null });
  }

  async list({ prefix = "", limit = 1000 } = {}) {
    const names = [...this.store.keys()].filter((name) => name.startsWith(prefix)).sort();
    const keys = names.slice(0, limit).map((name) => ({ name }));
    return { keys, list_complete: true };
  }

  /** Test helper: stored keys that start with a prefix. */
  keysWithPrefix(prefix) {
    return [...this.store.keys()].filter((name) => name.startsWith(prefix)).sort();
  }
}

/** Replaces globalThis.fetch; returns {calls, restore}. */
export function stubFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(url, init);
  };
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

/** A fetch handler that answers Turnstile siteverify with the given success flag. */
export function turnstileHandler(success) {
  return async () =>
    new Response(JSON.stringify({ success }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
}

export const SITE_URL = "https://contact.example.com";
export const ALLOWED_ORIGIN = "https://yourdomain.com";
export const CONTACT_PATH = "/api/contact";

/** A contact env with the wrangler.jsonc vars (numbers and strings mixed on purpose). */
export function makeEnv(overrides = {}) {
  return {
    CONTACT_SUBMISSIONS: new FakeKV(),
    TURNSTILE_SECRET_KEY: "test-secret",
    ALLOWED_ORIGINS: "https://yourdomain.com, https://www.yourdomain.com",
    ALLOW_LOCALHOST: "false",
    MIN_NAME_LENGTH: 2,
    MAX_NAME_LENGTH: 200,
    MIN_MESSAGE_LENGTH: 50,
    MAX_MESSAGE_LENGTH: 8000,
    SUBMISSION_EXPIRATION_DAYS: 90,
    RATE_LIMIT_WINDOW_SECONDS: 60,
    MAX_REQUESTS_PER_IP: 5,
    ...overrides,
  };
}

/** Builds a request to /api/contact; `origin: null` sends no Origin header. */
export function makeRequest(
  method,
  { origin = ALLOWED_ORIGIN, siteUrl = SITE_URL, ip = "1.2.3.4", body, headers = {} } = {}
) {
  const allHeaders = {
    "CF-Connecting-IP": ip,
    "CF-IPCountry": "BG",
    "User-Agent": "test-agent",
    ...headers,
  };
  if (body !== undefined) {
    allHeaders["Content-Type"] = "application/json";
  }
  if (origin !== null) {
    allHeaders.Origin = origin;
  }
  return new Request(`${siteUrl}${CONTACT_PATH}`, {
    method,
    headers: allHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function validBody(overrides = {}) {
  return {
    name: "Maria",
    email: "maria@example.com",
    message: "Hello, this is a test message that is long enough to pass the validation rules.",
    "cf-turnstile-response": "token-123",
    ...overrides,
  };
}
