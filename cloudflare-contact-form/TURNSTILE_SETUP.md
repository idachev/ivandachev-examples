# Cloudflare Turnstile Setup Guide

This guide explains how Cloudflare Turnstile is integrated into the contact form's public code.

## Overview

The contact form uses Cloudflare Turnstile to protect against spam and automated submissions. Turnstile is integrated into the frontend HTML and validated in the client-side JavaScript.

## Integration in Public Code

### 1. HTML Integration (`public/index.html`)

The Turnstile widget is included in the form:

```html
<!-- Turnstile widget container -->
<div class="cf-turnstile" data-sitekey="YOUR_TURNSTILE_SITE_KEY"></div>

<!-- Turnstile API script -->
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
```

The widget is placed within the form, before the submit button. When users interact with it, Turnstile automatically creates a hidden input field `cf-turnstile-response` containing the verification token.

### 2. Client-Side Validation (`public/contact-form-validation.js`)

The validation script checks for the Turnstile token before form submission:

```javascript
// Lines 78-86: Validate Turnstile
const turnstileResponse = document.querySelector('[name="cf-turnstile-response"]');
if (!turnstileResponse || !turnstileResponse.value) {
  isValid = false;
  showError(
    ERROR_MESSAGE_HOLDER,
    lang === "bg" ? "Моля, завършете проверката за сигурност" : "Please complete the security challenge"
  );
}
```

### 3. Form Submission

When the form is submitted, the Turnstile token is automatically included in the form data:

```javascript
// Lines 24-26: Form data includes Turnstile token
const formData = new FormData(event.target);
const data = Object.fromEntries(formData);
// data now includes: { name, email, message, 'cf-turnstile-response': 'token...' }
```

## Configuration

### Site Key Configuration

The Turnstile site key needs to be configured in two places:

1. **In `public/index.html`**: Replace `YOUR_TURNSTILE_SITE_KEY` with your actual site key
2. **In `wrangler.jsonc`**: Set the `TURNSTILE_SITE_KEY` variable (though not used in public code)

### Secret Key Configuration (for Cloudflare Pages)

The secret key is set using the Cloudflare Pages CLI:

```bash
npx wrangler pages secret put TURNSTILE_SECRET_KEY --project-name contact-form-app
# Enter your secret key when prompted
```

## Widget Customization

You can customize the Turnstile widget appearance by adding data attributes:

```html
<div
  class="cf-turnstile"
  data-sitekey="YOUR_SITE_KEY"
  data-theme="light"        <!-- Options: "light", "dark", "auto" -->
  data-size="normal"         <!-- Options: "normal", "compact" -->
  data-appearance="always"   <!-- Options: "always", "execute", "interaction-only" -->
  data-language="en"         <!-- Language code or "auto" -->
></div>
```

## How It Works

1. **Page Load**: The Turnstile API script loads and renders the widget
2. **User Interaction**: User completes the Turnstile challenge
3. **Token Generation**: Turnstile creates a hidden input with the verification token
4. **Form Validation**: JavaScript validates that the token exists before submission
5. **Form Submission**: Token is sent with form data to the backend for verification

## Development and Testing

For local development:

- Add `localhost` to your Turnstile site's allowed domains
- Use test keys for development:
  - Always passes: `1x00000000000000000000AA`
  - Always fails: `2x00000000000000000000AB`

## Important Notes

- The token expires after 5 minutes
- Each token can only be used once
- Client-side validation provides immediate feedback but server-side verification is essential
- The widget supports multiple languages through the `data-language` attribute
