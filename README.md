# SMS Management & Sending Platform

A focused, production-ready SMS panel:

- **Users** log in and get a simple **Send SMS** page.
- A **Super Admin** manages the whole system: users, SMS providers, routes/pricing and settings.
- **Multi-provider architecture** — Twilio and Vonage are built-in adapters; any HTTP/REST API needs no code; more can be added without rewriting the app.

## Architecture

- **Next.js 16 (App Router) + TypeScript + Tailwind CSS 4**
- **PostgreSQL** (Supabase in production, embedded local Postgres for development) accessed via `pg` — schema in [`db/schema.sql`](db/schema.sql)
- **Auth**: email + password (bcrypt), JWT session cookie (`jose`, HTTP-only, SameSite=Lax), roles `SUPER_ADMIN` / `USER`, server-side authorization on every API route, optimistic redirects in [`src/proxy.ts`](src/proxy.ts)
- **Provider abstraction** ([`src/services/sms/`](src/services/sms)):

```
SMS send API ──► send-service ──► SmsProvider interface
                                     ├─ GenericHttpProvider (any HTTP/REST SMS API — fully admin-configured)
                                     ├─ TwilioProvider      (built-in)
                                     ├─ VonageProvider      (built-in)
                                     └─ MockProvider        (development only)
```


- **Credential security**: provider secrets are AES-256-GCM encrypted at rest (`APP_ENCRYPTION_KEY`) and never returned by any API (only masked values / boolean flags).
- **Privacy by design**: no leads/contacts/message tables exist. Recipient numbers and message bodies are never persisted and never logged. Only aggregate usage counters (message/segment/failure counts per user per day) and provider delivery outcomes (keyed by the provider's opaque message id — never the recipient or body) are stored.
- **Delivery tracking**: because "submitted to the provider" ≠ "received on the phone", Twilio is asked to POST a delivery-status callback (`POST /api/sms/status`, HMAC-signed and verified against the owning account's Auth Token). Final `delivered`/`undelivered`/`failed` outcomes surface on the admin dashboard. Send results also show the provider's message id (e.g. the Twilio SID) and, on failure, a plain-language explanation of the error code. Set `APP_PUBLIC_BASE_URL` to enable callbacks.
- **Rate limiting**: database-backed fixed windows (serverless-safe) for login attempts and SMS sending, plus a duplicate-send guard (HMAC fingerprint, no PII).

### Pages

| Route | Access | Purpose |
|---|---|---|
| `/login` | public | Sign in |
| `/send` | authenticated | Send SMS (recipients, message, char/segment count, optional route) |
| `/admin` | super admin | Dashboard (users/providers/routes/usage) |
| `/admin/users` | super admin | Create, enable/disable, reset passwords, roles |
| `/admin/providers` | super admin | Add/configure providers, test connection, enable/disable, default |
| `/admin/routes` | super admin | Country/carrier/provider/sender/price-per-segment routes |
| `/admin/settings` | super admin | Rate limit + max recipients |

### API

`POST /api/auth/login|logout`, `GET /api/auth/me`, `POST /api/sms/send`, `POST /api/sms/status` (Twilio webhook), `GET /api/routes`,
`GET|POST /api/admin/users`, `PATCH /api/admin/users/:id`,
`GET|POST /api/admin/providers`, `PATCH|DELETE /api/admin/providers/:id`, `POST /api/admin/providers/:id/test`,
`GET|POST /api/admin/routes`, `PATCH|DELETE /api/admin/routes/:id`,
`GET|PATCH /api/admin/settings`, `GET /api/admin/stats`.

## Setup

### 1. Environment

Copy `.env.example` to `.env` and fill in:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Supabase in production) |
| `AUTH_SECRET` | Session signing secret — `openssl rand -base64 32` |
| `APP_ENCRYPTION_KEY` | 32-byte base64 key for credential encryption — `openssl rand -base64 32` |
| `APP_PUBLIC_BASE_URL` | _(optional)_ public base URL so Twilio can POST delivery callbacks (`…/api/sms/status`). Enables delivery tracking. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Initial super admin (seed script only) |

### 2. Database

```bash
pnpm install

# local development database (embedded PostgreSQL on port 5433):
pnpm db:local          # keep running in a separate terminal
# DATABASE_URL=postgresql://sms:sms@localhost:5433/sms_panel

pnpm db:migrate        # applies db/schema.sql (idempotent)
pnpm db:seed           # creates the super admin (+ mock provider)
# SEED_EXAMPLE_ROUTES=1 pnpm db:seed   # optionally seed example routes
```

For **Supabase**: create a project, take the connection string from
*Project Settings → Database* (use the **pooler** URI on serverless), set it as
`DATABASE_URL` and run `pnpm db:migrate && pnpm db:seed` once.

### 3. Run

```bash
pnpm dev        # http://localhost:3000
```

Log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## Provider setup (Twilio)

1. Log in as super admin → **Admin → Providers → Add provider**.
2. Type: **Twilio**. Enter Account SID, Auth Token and the `From` number (E.164) or approved Sender ID.
3. Mark it **Active** and (usually) **Default**, save, then click **Test connection** → should show `CONNECTED`.
4. Disable or delete the Mock provider in production. The system never falls back from a failed real provider to mock.

Credentials are encrypted before storage and are never sent back to the browser.

> **"Submitted" is not "delivered".** A successful send only means Twilio accepted the message into its queue (status `queued`/`submitted`). The actual handset delivery happens asynchronously — to see it, set `APP_PUBLIC_BASE_URL` so Twilio reports the final status back, then watch the **Delivery** panel on the admin dashboard. To debug a specific send, use the **provider message id** (the Twilio `SM…` SID) shown on the send result to look the message up in the Twilio console logs.

## Provider setup (Vonage)

1. Log in as super admin → **Admin → Providers → Add provider**.
2. Type: **Vonage**. Enter your **API key** and **API secret** (from dashboard.vonage.com → API settings), and a **From** value — a number rented from Vonage or an alphanumeric sender approved for the destination.
3. Mark it **Active** and (usually) **Default**, save, then click **Test connection** → should show `CONNECTED` with your account balance.
4. Run `pnpm db:migrate` once so the `providers.type` CHECK allows `VONAGE` (the migration is idempotent and upgrades existing databases).

> Vonage's SMS API returns HTTP 200 for both success and logical failure — the outcome is in `messages[].status` (`"0"` = accepted). The Vonage adapter reads that field so failures (e.g. invalid credentials, quota exceeded, invalid sender) are reported as failures with a plain-language hint, instead of being masked as a successful 200.

## Adding another provider

**Most providers need zero code changes.** In **Admin → Providers → Add provider** choose **Generic HTTP / REST** and configure:

- Endpoint URL + HTTP method (POST/GET)
- Authentication: None / Bearer / API key (header or query) / Basic / custom header
- Request body template with whitelisted variables — field names are fully provider-specific:
  `{{to}}`, `{{message}}`, `{{from}}`, `{{sender}}`, `{{country}}`, `{{apiKey}}`, `{{apiSecret}}`, `{{username}}`, `{{password}}`
- Custom headers and query parameters (templates allowed)
- Response mapping via JSONPath-lite (`$.data.id`, `$.status`), success status codes, timeout

Templates are data-only substitution (no code execution). All generic requests run server-side through an SSRF guard: HTTPS required in production, localhost/private/link-local/metadata addresses blocked (including DNS-resolved IPs), redirects refused, timeouts and response size caps enforced. `SMS_HTTP_ALLOW_LOCAL=1` (dev only) permits loopback targets for local stub testing.

Only a provider with a fundamentally non-HTTP protocol needs a coded adapter:

1. Implement `SmsProvider` (`sendSms`, `validateConfiguration`) in `src/services/sms/providers/<name>-provider.ts`.
2. Register it in `createProviderAdapter` (`src/services/sms/factory.ts`).
3. Add its form metadata to `PROVIDER_TYPES` (`src/services/sms/sms-provider.ts`) and the type to the `providers.type` CHECK constraint in `db/schema.sql`.


## Routes & pricing

**Admin → Routes & Pricing** manages `Country / Carrier / Provider / Sender / Price per segment / Priority / Status`. Prices are fully configurable per route — nothing is hardcoded. Users can optionally pick a route on the send page (with a cost estimate), otherwise the default active provider is used.

## Testing

```bash
pnpm test        # unit tests (segments, phone parsing, crypto, status mapping)
pnpm typecheck
pnpm lint
pnpm build
```

Before going live, perform one **real SMS test**: configure the real provider, log in, send a short message to a single authorized test number and confirm it arrives.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) (Vercel + Supabase).

## Repository extras

- [`systemic-form-assistant.user.js`](systemic-form-assistant.user.js) — a standalone Tampermonkey operator-assist userscript kept from an earlier phase of the project (unrelated to the panel runtime).
