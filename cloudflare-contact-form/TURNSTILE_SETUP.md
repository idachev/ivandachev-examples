# Cloudflare Turnstile Setup Guide

This guide explains how to set up Cloudflare Turnstile for the contact form.

## Prerequisites

- A Cloudflare account
- Access to your Cloudflare dashboard

## Step 1: Create a Turnstile Site

1. Log in to your [Cloudflare dashboard](https://dash.cloudflare.com/)
2. Navigate to **Turnstile** in the sidebar
3. Click **Add Site**
4. Configure your site:
   - **Site name**: Your site name (e.g., "Contact Form")
   - **Domain**: Your domain(s) where the form will be used
   - **Widget Mode**: Choose "Managed" (recommended) or "Invisible"
   - **Pre-clearance**: Optional - for returning visitors
5. Click **Create**
6. Copy the **Site Key** and **Secret Key**

## Step 2: Configure the Application

### Update HTML

Replace `YOUR_TURNSTILE_SITE_KEY` in `public/index.html` with your actual site key:

```html
<div class="cf-turnstile" data-sitekey="0x4AAAAAABl2bABjZGRahwXR"></div>
```

### Update Wrangler Configuration

Replace `YOUR_TURNSTILE_SITE_KEY` in `wrangler.jsonc`:

```json
"TURNSTILE_SITE_KEY": "0x4AAAAAABl2bABjZGRahwXR"
```

### Set the Secret Key

Use Wrangler CLI to set the secret key:

```bash
wrangler secret put TURNSTILE_SECRET_KEY
# When prompted, paste your secret key
```

## Step 3: Test Your Setup

1. Run the development server:

   ```bash
   npm run dev
   ```

2. Open the contact form in your browser
3. You should see the Turnstile widget above the submit button
4. Try submitting the form:
   - Without completing Turnstile → Should show client-side error
   - With completed Turnstile → Should submit successfully

## Turnstile Widget Options

You can customize the widget appearance by adding data attributes:

```html
<div
  class="cf-turnstile"
  data-sitekey="YOUR_SITE_KEY"
  data-theme="light"
  data-size="normal"
  data-appearance="always"
></div>
```

### Available Options:

- `data-theme`: "light", "dark", "auto" (default: "auto")
- `data-size`: "normal", "compact" (default: "normal")
- `data-appearance`: "always", "execute", "interaction-only" (default: "always")
- `data-language`: "auto" or specific language code (e.g., "en", "bg")

## Security Notes

1. **Never expose your Secret Key** - It should only be stored as a Wrangler secret
2. **Always verify on server-side** - Client-side validation can be bypassed
3. **Token expiration** - Turnstile tokens expire after 5 minutes
4. **One-time use** - Each token can only be verified once

## Troubleshooting

### Widget not appearing

- Check that the site key is correct
- Ensure the domain is added to your Turnstile site configuration
- Check browser console for errors

### Verification failing

- Verify the secret key is set correctly
- Check that the token is being sent with the form data
- Ensure the domain matches your Turnstile configuration

### Development/Testing

- For local development, add `localhost` to your Turnstile domains
- You can use Turnstile's test keys for development:
  - Always passes: `1x00000000000000000000AA`
  - Always fails: `2x00000000000000000000AB`
