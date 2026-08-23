-- تتبع جلسات المستخدمين وحركات تسجيل الدخول/الخروج

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS user_login_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  tenant_id        UUID REFERENCES tenants(id) ON DELETE CASCADE,
  username_attempt VARCHAR(100),
  event_type       VARCHAR(20) NOT NULL,
  ip_address       TEXT,
  user_agent       TEXT,
  session_id       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_login_events_tenant_created_idx
  ON user_login_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_login_events_user_created_idx
  ON user_login_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_login_events_created_idx
  ON user_login_events (created_at DESC);

CREATE TABLE IF NOT EXISTS user_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  ip_address    TEXT,
  user_agent    TEXT,
  session_kind  VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_sessions_active_tenant_idx
  ON user_sessions (tenant_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS user_sessions_active_user_idx
  ON user_sessions (user_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;
