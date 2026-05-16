# Deploy Lumina Scan on Render

## What is already prepared

- Docker-based deployment via [Dockerfile](/Users/dipanudas/Desktop/PDF_convertor/LuminaScanApp/Dockerfile:1)
- Render blueprint via [render.yaml](/Users/dipanudas/Desktop/PDF_convertor/LuminaScanApp/render.yaml:1)
- Health check endpoint at `/healthz`

## Before you deploy

Set these environment variables in Render:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `EXPO_PUBLIC_RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `WEBSITE_PUBLIC_URL`

## Render dashboard steps

1. Push this repo to GitHub.
2. Sign in to Render.
3. Click `New +`.
4. Click `Blueprint`.
5. Connect the GitHub repo that contains this project.
6. Select the repo and branch.
7. Render will detect [render.yaml](/Users/dipanudas/Desktop/PDF_convertor/LuminaScanApp/render.yaml:1).
8. Review the service name and plan.
9. Fill in all required environment variables.
10. Create the blueprint and let Render build the Docker image.

## After deploy

Verify these URLs:

- `/healthz`
- `/`
- `/pdf-editor.html`

## Important note

This app currently keeps PDF sessions in local memory and temporary files. That is fine for a single web instance, but not ideal for horizontal scaling. Start with one instance on Render.
