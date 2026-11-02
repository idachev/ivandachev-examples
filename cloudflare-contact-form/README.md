# Cloudflare Contact Form Example

This example demonstrates a serverless contact form using Cloudflare Pages Functions and KV Store.

📖 **Blog Post**: Read the full tutorial at [Building a Serverless Contact Form with Cloudflare Pages Functions and KV Store](https://ivandachev.com/blog/cloudflare-contact-form-kv-pages-functions)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a KV namespace:

   ```bash
   npm run kv:create
   ```

   Copy the generated namespace ID and update it in `wrangler.jsonc`.

3. Generate and set the API key secret (for retrieving submissions):

   ```bash
   # Generate a secure API key
   openssl rand -hex 32

   # Set the API key as a secret
   npx wrangler pages secret put API_KEY --project-name contact-form-app
   # Enter the generated key when prompted

   # Verify the secret was uploaded
   npx wrangler pages secret list --project-name contact-form-app
   ```

4. Configure Cloudflare Turnstile (for spam protection):
   - See [TURNSTILE_SETUP.md](./TURNSTILE_SETUP.md) for detailed instructions
   - Set `TURNSTILE_SITE_KEY` in `wrangler.jsonc`
   - Set the secret key (required: without it a POST from an allowed origin returns
     `500 {"error": "server not configured"}` and nothing is stored):
     ```bash
     npx wrangler pages secret put TURNSTILE_SECRET_KEY --project-name contact-form-app
     ```

5. Configure allowed origins (update in `wrangler.jsonc`):
   - Set `ALLOWED_ORIGINS` to your domain(s), comma-separated
   - Each entry must equal the browser's `Origin` exactly: scheme, host and port, no trailing
     slash (`https://yourdomain.com`, not `https://yourdomain.com/`). There is no prefix or
     wildcard matching
   - See [Origin rules](#origin-rules) below

## Development

Run the development server:

```bash
npm run dev
```

Visit `http://localhost:8788` to see the contact form.

A page served by `wrangler pages dev` posts to its own origin, so it passes the same-origin rule.
To post from another local port (for example a site generator on `http://localhost:4000`), set
`ALLOW_LOCALHOST=true` in your local `.dev.vars` (not in the production vars), or list that exact
origin in `ALLOWED_ORIGINS`. The dev server also needs `TURNSTILE_SECRET_KEY` in `.dev.vars`; the
Turnstile test secret `1x0000000000000000000000000000000AA` always passes.

## Tests

```bash
npm test
```

Unit tests for `functions/api/contact.js` use the built-in `node:test` runner with an in-memory
KV and a stubbed Turnstile `fetch`; run `npm install` first.

## API Endpoints

### Submit Contact Form

- **POST** `/api/contact`
- Body: JSON with `name`, `email`, `message`, and `cf-turnstile-response` fields
- Requires valid Cloudflare Turnstile token
- Requires an allowed `Origin` header (see [Origin rules](#origin-rules)); otherwise
  `403 {"error": "Forbidden"}` and nothing is stored
- From an allowed origin, returns `500 {"error": "server not configured"}` when
  `TURNSTILE_SECRET_KEY` is not set (a missing or refused origin still gets 403 first)

### Get Submissions (requires API key)

- **GET** `/api/contact?api_key=YOUR_API_KEY`
- **GET** `/api/contact` with header `X-API-Key: YOUR_API_KEY`
- Returns list of all submissions
- No `Origin` header is required, so it works from `curl`

### Check API Status

- **GET** `/api/contact`
- Returns API status (no authentication required)

## Deployment

Deploy to Cloudflare Pages:

```bash
npm run deploy
```

## Features

- ✅ Form validation
- ✅ Cloudflare Turnstile CAPTCHA protection
- ✅ Rate limiting (5 submissions per minute per IP)
- ✅ KV storage for submissions
- ✅ Simple API for retrieving submissions
- ✅ No backend infrastructure required

## Security

- **Turnstile CAPTCHA**: Protects against bots and spam submissions
- **Rate Limiting**: Prevents abuse by limiting submissions per IP
- **API Key Authentication**: Secure access to view submissions
- **Origin Check**: POST is accepted only from an allowed origin; CORS headers are sent only to
  allowed origins

## Origin Rules

An `Origin` is allowed when it:

1. equals the function's own origin (same-origin). Production and Cloudflare Pages preview hosts
   (`*.pages.dev`) work without being listed. The Turnstile widget's hostname list still has to
   cover a preview host (see [TURNSTILE_SETUP.md](./TURNSTILE_SETUP.md#hostnames-and-origins));
2. equals one `ALLOWED_ORIGINS` entry exactly (entries are trimmed; empty entries are ignored).
   An explicit entry always passes, a localhost one too;
3. matches `http://localhost:<port>` or `http://127.0.0.1:<port>` and `ALLOW_LOCALHOST` is the
   string `"true"` (local development only; https and port-less forms are refused).

For an allowed origin the response carries `Access-Control-Allow-Origin: <origin>` and
`Vary: Origin`. A refused origin gets no `Access-Control-Allow-Origin` header. A POST with a
missing or refused origin gets `403 {"error": "Forbidden"}` before any KV write or Turnstile call.
GET and OPTIONS are not refused; only their CORS header follows these rules.
