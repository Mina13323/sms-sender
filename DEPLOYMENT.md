# Deployment Guide (Vercel + Supabase)

## 1. Supabase database

1. Create a project at [supabase.com](https://supabase.com).
2. Go to **Project Settings → Database → Connection string** and copy the **URI**.
   - For Vercel (serverless) use the **pooler** connection string
     (`...pooler.supabase.com:6543/postgres` — transaction mode is fine; the app
     does not use prepared statements or long transactions).
3. Apply the schema and seed the super admin from your machine:

```bash
DATABASE_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres' \
ADMIN_EMAIL='admin@yourdomain.com' \
ADMIN_PASSWORD='<strong password, min 10 chars>' \
sh -c 'pnpm db:migrate && pnpm db:seed'
```

The app connects with TLS automatically for non-localhost hosts.

## 2. Vercel project

1. **Add New → Project**, import this repository.
2. Framework preset: Next.js (auto-detected). No special build settings needed.
3. Add Environment Variables (Production):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase pooler connection string |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `APP_ENCRYPTION_KEY` | `openssl rand -base64 32` — **keep safe**; losing it makes stored provider credentials unreadable |

`ADMIN_EMAIL` / `ADMIN_PASSWORD` are **not** needed on Vercel (seed runs locally).

4. Deploy.

Serverless notes: the app uses a small `pg` pool per lambda, DB-backed rate
limiting (no in-memory state) and no filesystem persistence — fully compatible
with Vercel's serverless runtime.

## 3. Configure the real SMS provider

1. Open your deployment, log in with the seeded super admin.
2. **Admin → Providers → Add provider** → Twilio: Account SID, Auth Token, From number. Mark **Active** + **Default**.
3. Click **Test connection** → must show `CONNECTED`.
4. Delete/disable the Mock provider — production must never use mock.
5. (Optional) **Admin → Routes & Pricing**: add your country/carrier routes with real prices.

## 4. Production smoke test (real SMS)

1. Log in as an enabled user.
2. **Send SMS** → one authorized test number (international format), short message.
3. Send → expect "SMS submitted successfully."
4. Confirm the message arrives on the device, and check the provider console for the accepted message.

Do **not** run bulk sends during testing.

## 5. Security checklist

- [ ] `AUTH_SECRET` and `APP_ENCRYPTION_KEY` are unique, random and stored only in Vercel env vars.
- [ ] Super admin password is strong; change the seeded password after first login if it was shared.
- [ ] Mock provider disabled/removed.
- [ ] Rate limits reviewed in **Admin → Settings**.
- [ ] No provider credentials in the repository or in `NEXT_PUBLIC_*` variables (the app never uses `NEXT_PUBLIC_*` for secrets).
