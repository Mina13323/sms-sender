# Deployment Guide

This guide explains how to deploy the SMS Lead Form application to Vercel.

## 1. Create a Vercel Project
1. Log in to your [Vercel account](https://vercel.com).
2. Click **Add New...** -> **Project**.
3. Import your Git repository containing this project.

## 2. Add Environment Variables
In the Vercel deployment settings, add the following environment variables:

- `SMS_PROVIDER`: Set to your provider (e.g. `mock`, `twilio`)
- `SMS_API_KEY`: Your actual SMS provider API key (kept secure server-side)
- `SMS_FROM`: The phone number messages will be sent from (e.g., `+1234567890`)
- `NEXT_PUBLIC_APP_URL`: Your Vercel production domain (e.g., `https://my-sms-app.vercel.app`)

## 3. Deploy
1. Click **Deploy**. Vercel will automatically detect Next.js and run the standard build process.
2. Wait for the deployment to complete.

## 4. Webhook Configuration (If applicable)
*Note: Because this application does not persist data (by explicit requirement), there is no database to store delivery statuses. Thus, an SMS delivery webhook is not required for the core functionality.*
If your provider requires a webhook for compliance reasons, ensure it's configured in the provider's dashboard, but no application-level configuration is needed unless you add a specific webhook handler endpoint.

## 5. Production Smoke Test
1. Visit your live Vercel domain.
2. Fill out the public form with test data and a valid phone number.
3. Check the consent box and submit.
4. Verify you receive the "Message sent successfully!" feedback on the UI.
5. Verify that the SMS message actually arrives on the test phone number via your provider logs/device.
