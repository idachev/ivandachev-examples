# Cloudflare Contact Form Example

## Project Overview

This is a serverless contact form built with Cloudflare Pages Functions. It features client-side validation, form submission handling, and stores submissions in Cloudflare KV storage.

## Project Structure

```
cloudflare-contact-form/
├── functions/
│   └── api/
│       └── contact.js      # Serverless function handling form submissions
├── public/
│   ├── index.html         # Main contact form page
│   ├── success.html       # Success page after form submission
│   └── contact-form-validation.js  # Client-side form validation
├── package.json           # Project dependencies and scripts
├── wrangler.toml         # Cloudflare configuration
└── eslint.config.js      # ESLint configuration
```

## Key Features

- **Client-side validation**: Real-time form validation with custom error messages
- **Serverless backend**: Cloudflare Pages Functions for form processing
- **KV Storage**: Form submissions stored in Cloudflare KV
- **Redirect on success**: Redirects to success page after successful submission

## Form Validation Rules

- **Name**: 2-200 characters
- **Email**: Valid email format
- **Message**: 50-8000 characters

## Development Commands

```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Deploy to Cloudflare Pages
npm run deploy

# Create KV namespace
npm run kv:create

# Code quality checks
npm run format          # Format all files with Prettier
npm run format:check    # Check formatting without changes
npm run lint           # Run ESLint on JavaScript files
npm run lint:fix       # Fix ESLint issues automatically
npm run lint:css       # Run Stylelint on CSS files
```

## API Endpoints

- `POST /api/contact`: Submit contact form
  - Request body: `{ name, email, message }`
  - Response: `{ success: true }` or `{ error: "Error message" }`

## Environment Variables

- `CONTACT_FORM_SUBMISSIONS`: KV namespace binding for storing form submissions

## Important Notes

- The form uses JSON format for API requests (not FormData)
- Client-side validation provides immediate feedback
- Server-side validation ensures data integrity
- Form submissions are stored with timestamp and unique ID
- Success page redirect URL is configurable via hidden input field

## Code Style

- ESLint with SonarJS plugin for code quality
- Prettier for consistent formatting
- Browser globals configured in ESLint
- No TypeScript - pure JavaScript project

# IMPORTANT DO NOT SKIP THESE STEPS

Important !!! DO NOT add additional code explanation summary unless requested by the user. After
working on files, just stop or state "ALL TASKS DONE" if all tasks are completed.

# IMPORTANT: Implementation Guidelines

When the user asks for a new solution or significant changes:

1. **STOP and DESCRIBE** the proposed solution first
2. **WAIT for user approval** before implementing
3. **DO NOT start coding** until the user confirms they want to proceed
4. This is especially important for:
   - Creating new files or solutions
   - Major refactoring
   - Switching between different technical approaches
   - Adding new dependencies or services
