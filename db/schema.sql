-- SMS Management Panel schema (PostgreSQL / Supabase)
-- Applied idempotently by scripts/migrate.mjs
-- The platform stores MANAGEMENT data only: users, providers, routes, settings,
-- rate-limit buckets and aggregate usage counters.
-- It intentionally has NO tables for leads, contacts, recipients or SMS bodies.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('SUPER_ADMIN', 'USER')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS providers (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('TWILIO', 'MOCK', 'HTTP')),

  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  priority        INTEGER NOT NULL DEFAULT 100,
  api_base_url    TEXT,
  -- credentials are stored AES-256-GCM encrypted (see src/lib/crypto.ts)
  account_sid_enc TEXT,
  api_key_enc     TEXT,
  api_secret_enc  TEXT,
  sender_id       TEXT,
  config          JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sms_routes (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  country           TEXT NOT NULL,
  country_code      TEXT,
  carrier           TEXT NOT NULL,
  provider_id       TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  sender_id         TEXT,
  price_per_segment NUMERIC(12, 6) NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'USD',
  priority          INTEGER NOT NULL DEFAULT 100,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fixed-window rate limiting + duplicate-send guard (serverless-safe).
-- Keys never contain raw PII (only user ids or HMAC hashes).
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key          TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

-- Aggregate, PII-free usage counters (no bodies, no recipients).
CREATE TABLE IF NOT EXISTS usage_counters (
  day      DATE NOT NULL,
  user_id  TEXT NOT NULL,
  messages INTEGER NOT NULL DEFAULT 0,
  segments INTEGER NOT NULL DEFAULT 0,
  failed   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, user_id)
);

-- Final delivery outcomes reported by providers via status webhooks
-- (e.g. Twilio's StatusCallback). This stores ONLY the provider's opaque
-- message id, the normalized status, an error code and the owning user —
-- NEVER the recipient, sender or message body, so it carries no PII.
CREATE TABLE IF NOT EXISTS sms_deliveries (
  provider_message_id TEXT PRIMARY KEY,
  provider_type       TEXT NOT NULL DEFAULT 'TWILIO',
  user_id             TEXT,
  status              TEXT NOT NULL DEFAULT 'submitted'
                        CHECK (status IN ('submitted','sent','delivered','undelivered','failed')),
  error_code          INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_routes_provider ON sms_routes(provider_id);
CREATE INDEX IF NOT EXISTS idx_sms_routes_active ON sms_routes(is_active);
CREATE INDEX IF NOT EXISTS idx_providers_active ON providers(is_active);
CREATE INDEX IF NOT EXISTS idx_sms_deliveries_user_day ON sms_deliveries(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sms_deliveries_status ON sms_deliveries(status);
