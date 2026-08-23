const crypto = require('crypto');
const { ensureUserSessionsSchema } = require('../db/ensureUserSessions');

const ACTIVE_WINDOW_MINUTES = 5;

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || null;
}

function clientUserAgent(req) {
  const ua = req.headers['user-agent'];
  return ua ? String(ua).slice(0, 500) : null;
}

async function logLoginEvent(client, {
  userId = null,
  tenantId = null,
  eventType,
  req,
  sessionId = null,
  usernameAttempt = null,
}) {
  await client.query(
    `INSERT INTO user_login_events
       (user_id, tenant_id, username_attempt, event_type, ip_address, user_agent, session_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      userId,
      tenantId,
      usernameAttempt,
      eventType,
      clientIp(req),
      clientUserAgent(req),
      sessionId,
    ]
  );
}

async function createSession(client, {
  userId,
  tenantId,
  req,
  expiresAt,
  sessionKind = 'NORMAL',
}) {
  const sessionId = crypto.randomUUID();
  await client.query(
    `INSERT INTO user_sessions
       (id, user_id, tenant_id, ip_address, user_agent, expires_at, session_kind)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [sessionId, userId, tenantId, clientIp(req), clientUserAgent(req), expiresAt, sessionKind]
  );
  return sessionId;
}

async function startLoginSession(client, {
  user,
  req,
  expiresInMs,
  sessionKind = 'NORMAL',
}) {
  await ensureUserSessionsSchema();
  const expiresAt = new Date(Date.now() + expiresInMs);
  const sessionId = await createSession(client, {
    userId: user.id,
    tenantId: user.tenant_id || null,
    req,
    expiresAt,
    sessionKind,
  });
  await logLoginEvent(client, {
    userId: user.id,
    tenantId: user.tenant_id || null,
    eventType: 'LOGIN_SUCCESS',
    req,
    sessionId,
  });
  await client.query(
    `UPDATE users SET last_login_at = now() WHERE id = $1`,
    [user.id]
  );
  return sessionId;
}

async function recordFailedLogin(client, { username, req }) {
  await ensureUserSessionsSchema();
  await logLoginEvent(client, {
    eventType: 'LOGIN_FAILED',
    req,
    usernameAttempt: username,
  });
}

async function endSession(client, { sessionId, userId, tenantId, req }) {
  if (!sessionId) return;
  await ensureUserSessionsSchema();
  await client.query(
    `UPDATE user_sessions
     SET revoked_at = now()
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [sessionId, userId]
  );
  await logLoginEvent(client, {
    userId,
    tenantId,
    eventType: 'LOGOUT',
    req,
    sessionId,
  });
}

async function isSessionActive(client, sessionId) {
  const result = await client.query(
    `SELECT id FROM user_sessions
     WHERE id = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [sessionId]
  );
  return result.rowCount > 0;
}

async function touchSession(client, sessionId) {
  await client.query(
    `UPDATE user_sessions
     SET last_seen_at = now()
     WHERE id = $1
       AND revoked_at IS NULL
       AND expires_at > now()
       AND last_seen_at < now() - interval '2 minutes'`,
    [sessionId]
  );
}

function mapAuthEvent(row) {
  return {
    id: row.id,
    eventType: row.event_type,
    userId: row.user_id,
    userName: row.user_name || null,
    username: row.username || row.username_attempt || null,
    role: row.role || null,
    createdAt: row.created_at,
    ipAddress: row.ip_address || null,
    sessionId: row.session_id || null,
  };
}

function mapActiveSession(row) {
  return {
    sessionId: row.id,
    userId: row.user_id,
    userName: row.user_name,
    username: row.username,
    role: row.role,
    sessionKind: row.session_kind,
    loginAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    ipAddress: row.ip_address || null,
    userAgent: row.user_agent || null,
  };
}

async function fetchTenantActiveUsers(client, tenantId) {
  await ensureUserSessionsSchema();
  const result = await client.query(
    `SELECT s.id, s.user_id, s.session_kind, s.created_at, s.last_seen_at, s.ip_address, s.user_agent,
            u.name AS user_name, u.username, u.role
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.tenant_id = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
       AND s.last_seen_at > now() - ($2 || ' minutes')::interval
       AND LOWER(u.username) NOT LIKE 'support.%'
     ORDER BY s.last_seen_at DESC`,
    [tenantId, String(ACTIVE_WINDOW_MINUTES)]
  );
  return result.rows.map(mapActiveSession);
}

async function fetchTenantAuthEvents(client, tenantId, limit = 30) {
  await ensureUserSessionsSchema();
  const result = await client.query(
    `SELECT e.id, e.event_type, e.user_id, e.username_attempt, e.ip_address, e.session_id, e.created_at,
            u.name AS user_name, u.username, u.role
     FROM user_login_events e
     LEFT JOIN users u ON u.id = e.user_id
     WHERE e.tenant_id = $1
       AND (u.id IS NULL OR LOWER(u.username) NOT LIKE 'support.%')
     ORDER BY e.created_at DESC
     LIMIT $2`,
    [tenantId, limit]
  );
  return result.rows.map(mapAuthEvent);
}

async function fetchPlatformMonitoring(client) {
  await ensureUserSessionsSchema();
  const activeWindow = String(ACTIVE_WINDOW_MINUTES);

  const summaryResult = await client.query(
    `SELECT
       (SELECT COUNT(*)::int FROM user_sessions s
         WHERE s.revoked_at IS NULL AND s.expires_at > now()
           AND s.last_seen_at > now() - ($1 || ' minutes')::interval) AS active_users,
       (SELECT COUNT(*)::int FROM tenants WHERE status = 'ACTIVE') AS active_clinics,
       (SELECT COUNT(*)::int FROM tenants) AS total_clinics,
       (SELECT COUNT(*)::int FROM user_login_events
         WHERE event_type = 'LOGIN_FAILED'
           AND created_at > now() - interval '24 hours') AS failed_logins_24h,
       (SELECT COUNT(*)::int FROM user_login_events
         WHERE event_type = 'LOGIN_SUCCESS'
           AND created_at >= date_trunc('day', now())) AS logins_today`,
    [activeWindow]
  );

  const activeSessionsResult = await client.query(
    `SELECT s.id, s.user_id, s.tenant_id, s.session_kind, s.created_at, s.last_seen_at, s.ip_address, s.user_agent,
            u.name AS user_name, u.username, u.role,
            t.name AS clinic_name
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN tenants t ON t.id = s.tenant_id
     WHERE s.revoked_at IS NULL
       AND s.expires_at > now()
       AND s.last_seen_at > now() - ($1 || ' minutes')::interval
     ORDER BY s.last_seen_at DESC`,
    [activeWindow]
  );

  const usersResult = await client.query(
    `SELECT u.id, u.name, u.username, u.role, u.tenant_id, u.is_active, u.last_login_at, u.created_at,
            t.name AS clinic_name,
            EXISTS (
              SELECT 1 FROM user_sessions s
              WHERE s.user_id = u.id
                AND s.revoked_at IS NULL
                AND s.expires_at > now()
                AND s.last_seen_at > now() - ($1 || ' minutes')::interval
            ) AS is_online
     FROM users u
     LEFT JOIN tenants t ON t.id = u.tenant_id
     WHERE u.role <> 'SUPER_ADMIN'
       AND LOWER(u.username) NOT LIKE 'support.%'
     ORDER BY u.last_login_at DESC NULLS LAST, u.name ASC`,
    [activeWindow]
  );

  const eventsResult = await client.query(
    `SELECT e.id, e.event_type, e.user_id, e.username_attempt, e.ip_address, e.session_id, e.created_at,
            u.name AS user_name, u.username, u.role,
            t.name AS clinic_name
     FROM user_login_events e
     LEFT JOIN users u ON u.id = e.user_id
     LEFT JOIN tenants t ON t.id = e.tenant_id
     ORDER BY e.created_at DESC
     LIMIT 50`
  );

  const summary = summaryResult.rows[0] || {};

  return {
    generatedAt: new Date().toISOString(),
    activeWindowMinutes: ACTIVE_WINDOW_MINUTES,
    summary: {
      activeUsers: Number(summary.active_users) || 0,
      activeClinics: Number(summary.active_clinics) || 0,
      totalClinics: Number(summary.total_clinics) || 0,
      failedLogins24h: Number(summary.failed_logins_24h) || 0,
      loginsToday: Number(summary.logins_today) || 0,
    },
    activeSessions: activeSessionsResult.rows.map((row) => ({
      ...mapActiveSession(row),
      tenantId: row.tenant_id,
      clinicName: row.clinic_name || null,
    })),
    users: usersResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      username: row.username,
      role: row.role,
      tenantId: row.tenant_id,
      clinicName: row.clinic_name || null,
      isActive: row.is_active,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
      isOnline: Boolean(row.is_online),
    })),
    recentEvents: eventsResult.rows.map((row) => ({
      ...mapAuthEvent(row),
      clinicName: row.clinic_name || null,
    })),
  };
}

module.exports = {
  ACTIVE_WINDOW_MINUTES,
  clientIp,
  startLoginSession,
  recordFailedLogin,
  endSession,
  isSessionActive,
  touchSession,
  fetchTenantActiveUsers,
  fetchTenantAuthEvents,
  fetchPlatformMonitoring,
};
