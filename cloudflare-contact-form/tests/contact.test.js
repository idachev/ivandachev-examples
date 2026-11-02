import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { onRequestGet, onRequestOptions, onRequestPost } from "../functions/api/contact.js";
import { ALLOWED_ORIGIN, makeEnv, makeRequest, stubFetch, turnstileHandler, validBody } from "./helpers/fake-env.js";

const ALLOW_ORIGIN_HEADER = "Access-Control-Allow-Origin";
const EVIL_ORIGIN = "https://evil.com";
const LOCAL_ORIGIN = "http://localhost:8788";
const PREVIEW_URL = "https://abc123.contact-form-app.pages.dev";
const SUBMISSION_ID = "submission_1";
const ADMIN_KEY = "admin-key";

/** Stubs fetch for Turnstile and restores it after the test. */
function withTurnstile(t, success = true) {
  const stub = stubFetch(turnstileHandler(success));
  t.after(() => stub.restore());
  return stub;
}

async function post(env, options = {}) {
  const request = makeRequest("POST", { body: validBody(), ...options });
  const response = await onRequestPost({ request, env });
  const json = await response.json();
  return { response, json };
}

function submissionKeys(env) {
  return env.CONTACT_SUBMISSIONS.keysWithPrefix("submission_");
}

describe("POST origin rules", () => {
  test("exact allowed origin passes and is echoed", async (t) => {
    const stub = withTurnstile(t);
    const env = makeEnv();
    const { response, json } = await post(env, { origin: "https://www.yourdomain.com" });
    assert.equal(response.status, 200);
    assert.equal(json.success, true);
    assert.match(json.id, /^submission_/);
    assert.equal(typeof json.message, "string");
    assert.equal(typeof json.timestamp, "string");
    assert.equal(response.headers.get(ALLOW_ORIGIN_HEADER), "https://www.yourdomain.com");
    assert.equal(response.headers.get("Vary"), "Origin");
    assert.equal(submissionKeys(env).length, 1);
    assert.equal(stub.calls.length, 1);
  });

  test("missing Origin → 403, nothing stored, no Turnstile call", async (t) => {
    const stub = withTurnstile(t);
    const env = makeEnv();
    const { response, json } = await post(env, { origin: null });
    assert.equal(response.status, 403);
    assert.deepEqual(json, { error: "Forbidden" });
    assert.equal(response.headers.get(ALLOW_ORIGIN_HEADER), null);
    assert.equal(env.CONTACT_SUBMISSIONS.puts.length, 0);
    assert.equal(stub.calls.length, 0);
  });

  test("prefix-like, truncated and foreign origins are refused", async (t) => {
    const stub = withTurnstile(t);
    const env = makeEnv();
    for (const origin of ["https://yourdomain.com.evil.com", "https://yourdomain.co", EVIL_ORIGIN]) {
      const { response } = await post(env, { origin });
      assert.equal(response.status, 403, origin);
      assert.equal(response.headers.get(ALLOW_ORIGIN_HEADER), null, origin);
    }
    assert.equal(env.CONTACT_SUBMISSIONS.puts.length, 0);
    assert.equal(stub.calls.length, 0);
  });

  test('localhost refused unless ALLOW_LOCALHOST is "true"', async (t) => {
    withTurnstile(t);
    const refused = await post(makeEnv(), { origin: LOCAL_ORIGIN });
    assert.equal(refused.response.status, 403);

    const envLocal = makeEnv({ ALLOW_LOCALHOST: "true" });
    const local = await post(envLocal, { origin: LOCAL_ORIGIN });
    assert.equal(local.response.status, 200);
    assert.equal(local.response.headers.get(ALLOW_ORIGIN_HEADER), LOCAL_ORIGIN);

    const loopback = await post(envLocal, { origin: "http://127.0.0.1:4000", ip: "5.6.7.8" });
    assert.equal(loopback.response.status, 200);

    const httpsLocal = await post(envLocal, { origin: "https://localhost:8788", ip: "9.9.9.9" });
    assert.equal(httpsLocal.response.status, 403);

    const noPort = await post(envLocal, { origin: "http://localhost", ip: "9.9.9.9" });
    assert.equal(noPort.response.status, 403);
  });

  test('ALLOW_LOCALHOST must be the string "true"', async (t) => {
    withTurnstile(t);
    const { response } = await post(makeEnv({ ALLOW_LOCALHOST: true }), { origin: LOCAL_ORIGIN });
    assert.equal(response.status, 403);
  });

  test("explicit localhost entry in ALLOWED_ORIGINS passes without ALLOW_LOCALHOST", async (t) => {
    withTurnstile(t);
    const env = makeEnv({ ALLOWED_ORIGINS: `${ALLOWED_ORIGIN},${LOCAL_ORIGIN}` });
    const { response } = await post(env, { origin: LOCAL_ORIGIN });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get(ALLOW_ORIGIN_HEADER), LOCAL_ORIGIN);

    const otherPort = await post(env, { origin: "http://localhost:4000", ip: "5.6.7.8" });
    assert.equal(otherPort.response.status, 403);
  });

  test("same-origin request passes without being listed (preview host)", async (t) => {
    withTurnstile(t);
    const env = makeEnv();
    const { response } = await post(env, { origin: PREVIEW_URL, siteUrl: PREVIEW_URL });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get(ALLOW_ORIGIN_HEADER), PREVIEW_URL);
  });

  test("foreign origin posting to the preview host is refused", async (t) => {
    withTurnstile(t);
    const env = makeEnv();
    const { response } = await post(env, { origin: EVIL_ORIGIN, siteUrl: PREVIEW_URL });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get(ALLOW_ORIGIN_HEADER), null);
    assert.equal(env.CONTACT_SUBMISSIONS.puts.length, 0);
  });

  test("empty ALLOWED_ORIGINS refuses every cross-origin request", async (t) => {
    withTurnstile(t);
    const { response } = await post(makeEnv({ ALLOWED_ORIGINS: undefined }));
    assert.equal(response.status, 403);
  });
});

describe("POST configuration and Turnstile", () => {
  test("missing Turnstile secret → 500 server not configured, nothing stored", async (t) => {
    const stub = withTurnstile(t);
    const env = makeEnv({ TURNSTILE_SECRET_KEY: undefined });
    const { response, json } = await post(env);
    assert.equal(response.status, 500);
    assert.deepEqual(json, { error: "server not configured" });
    assert.equal(env.CONTACT_SUBMISSIONS.puts.length, 0);
    assert.equal(stub.calls.length, 0);
  });

  test("failed Turnstile verification → 400 with the existing message, nothing stored", async (t) => {
    const stub = withTurnstile(t, false);
    const env = makeEnv();
    const { response, json } = await post(env);
    assert.equal(response.status, 400);
    assert.deepEqual(json, { error: "Security challenge verification failed. Please try again." });
    assert.deepEqual(submissionKeys(env), []);
    assert.equal(stub.calls.length, 1);
  });

  test("missing Turnstile token → 400 with the existing message", async (t) => {
    const stub = withTurnstile(t);
    const env = makeEnv();
    const request = makeRequest("POST", { body: validBody({ "cf-turnstile-response": "" }) });
    const response = await onRequestPost({ request, env });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Please complete the security challenge" });
    assert.equal(stub.calls.length, 0);
  });
});

describe("OPTIONS", () => {
  test("allowed origin gets CORS headers", async () => {
    const response = await onRequestOptions({ request: makeRequest("OPTIONS"), env: makeEnv() });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get(ALLOW_ORIGIN_HEADER), ALLOWED_ORIGIN);
    assert.match(response.headers.get("Access-Control-Allow-Methods"), /POST/);
    assert.equal(response.headers.get("Vary"), "Origin");
  });

  test("refused origin gets no Access-Control-Allow-Origin", async () => {
    const request = makeRequest("OPTIONS", { origin: EVIL_ORIGIN });
    const response = await onRequestOptions({ request, env: makeEnv() });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get(ALLOW_ORIGIN_HEADER), null);
  });
});

describe("GET", () => {
  test("status check without Origin is not refused and has no CORS origin", async () => {
    const response = await onRequestGet({ request: makeRequest("GET", { origin: null }), env: makeEnv() });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "Contact form API is running");
    assert.equal(response.headers.get(ALLOW_ORIGIN_HEADER), null);
  });

  test("foreign origin gets no Access-Control-Allow-Origin", async () => {
    const response = await onRequestGet({ request: makeRequest("GET", { origin: EVIL_ORIGIN }), env: makeEnv() });
    assert.equal(response.headers.get(ALLOW_ORIGIN_HEADER), null);
  });

  test("listing with the API key works without Origin", async () => {
    const env = makeEnv({ API_KEY: ADMIN_KEY });
    await env.CONTACT_SUBMISSIONS.put(SUBMISSION_ID, JSON.stringify({ id: SUBMISSION_ID }));
    const request = makeRequest("GET", { origin: null, headers: { "X-API-Key": ADMIN_KEY } });
    const response = await onRequestGet({ request, env });
    assert.equal(response.status, 200);
    const json = await response.json();
    assert.equal(json.count, 1);
    assert.equal(json.submissions[0].id, SUBMISSION_ID);
  });
});
