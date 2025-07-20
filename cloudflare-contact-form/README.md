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
   wrangler secret put API_KEY
   # Enter the generated key when prompted
   ```

4. Configure allowed origins for CORS (update in `wrangler.jsonc`):
   - Set `ALLOWED_ORIGINS` to your domain(s)
   - Multiple origins can be comma-separated

## Development

Run the development server:

```bash
npm run dev
```

Visit `http://localhost:8788` to see the contact form.

## API Endpoints

### Submit Contact Form

- **POST** `/api/contact`
- Body: JSON with `name`, `email`, and `message` fields

### Get Submissions (requires API key)

- **GET** `/api/contact?api_key=YOUR_API_KEY`
- **GET** `/api/contact` with header `X-API-Key: YOUR_API_KEY`
- Returns list of all submissions

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
- ✅ Rate limiting (5 submissions per minute per IP)
- ✅ KV storage for submissions
- ✅ Simple API for retrieving submissions
- ✅ No backend infrastructure required
