// accounting/fiscalYears.js — قفل السنوات المقفلة + إدارة بسيطة
const { withTenantClient } = require('../db/pool');

class ClosedFiscalYearError extends Error {
  constructor(yearLabel) {
    super(`لا يمكن الترحيل في سنة مالية مقفلة (${yearLabel})`);
    this.name = 'ClosedFiscalYearError';
    this.statusCode = 400;
    this.yearLabel = yearLabel;
  }
}

function calendarBounds(year) {
  const y = Number(year);
  return {
    yearLabel: y,
    startsOn: `${y}-01-01`,
    endsOn: `${y}-12-31`,
  };
}

async function ensureCurrentOpenYear(client, tenantId, asOfDate = null) {
  const day = asOfDate || new Date().toISOString().slice(0, 10);
  const year = Number(String(day).slice(0, 4));
  const bounds = calendarBounds(year);
  await client.query(
    `INSERT INTO fiscal_years (tenant_id, year_label, starts_on, ends_on, status)
     VALUES ($1, $2, $3, $4, 'OPEN')
     ON CONFLICT (tenant_id, year_label) DO NOTHING`,
    [tenantId, bounds.yearLabel, bounds.startsOn, bounds.endsOn]
  );
  return bounds;
}

async function assertEntryDateAllowed(tenantId, entryDate, client = null) {
  const day = entryDate && /^\d{4}-\d{2}-\d{2}$/.test(String(entryDate).slice(0, 10))
    ? String(entryDate).slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const run = async (c) => {
    try {
      await ensureCurrentOpenYear(c, tenantId, day);
      const closed = await c.query(
        `SELECT year_label FROM fiscal_years
         WHERE tenant_id = $1 AND status = 'CLOSED'
           AND starts_on <= $2::date AND ends_on >= $2::date
         LIMIT 1`,
        [tenantId, day]
      );
      if (closed.rowCount > 0) {
        throw new ClosedFiscalYearError(closed.rows[0].year_label);
      }
    } catch (err) {
      if (err.code === '42P01') return; // الجدول غير مرحّل بعد
      throw err;
    }
  };

  if (client) return run(client);
  return withTenantClient(tenantId, run);
}

async function listFiscalYears(tenantId) {
  return withTenantClient(tenantId, async (client) => {
    await ensureCurrentOpenYear(client, tenantId);
    const result = await client.query(
      `SELECT id, year_label, starts_on, ends_on, status, closed_at, closed_by, created_at
       FROM fiscal_years WHERE tenant_id = $1
       ORDER BY year_label DESC`,
      [tenantId]
    );
    return result.rows.map((r) => ({
      id: r.id,
      yearLabel: r.year_label,
      startsOn: r.starts_on,
      endsOn: r.ends_on,
      status: r.status,
      closedAt: r.closed_at,
      closedBy: r.closed_by,
      createdAt: r.created_at,
    }));
  });
}

async function closeFiscalYear(tenantId, yearLabel, userId) {
  const y = Number(yearLabel);
  if (!Number.isFinite(y)) {
    const err = new Error('سنة غير صالحة');
    err.statusCode = 400;
    throw err;
  }
  const bounds = calendarBounds(y);
  const next = calendarBounds(y + 1);

  return withTenantClient(tenantId, async (client) => {
    await client.query(
      `INSERT INTO fiscal_years (tenant_id, year_label, starts_on, ends_on, status)
       VALUES ($1, $2, $3, $4, 'OPEN')
       ON CONFLICT (tenant_id, year_label) DO NOTHING`,
      [tenantId, bounds.yearLabel, bounds.startsOn, bounds.endsOn]
    );

    const current = await client.query(
      `SELECT id, status FROM fiscal_years WHERE tenant_id = $1 AND year_label = $2`,
      [tenantId, y]
    );
    if (current.rowCount === 0) {
      const err = new Error('السنة غير موجودة');
      err.statusCode = 404;
      throw err;
    }
    if (current.rows[0].status === 'CLOSED') {
      const err = new Error('السنة مقفلة مسبقًا');
      err.statusCode = 400;
      throw err;
    }

    await client.query(
      `UPDATE fiscal_years
       SET status = 'CLOSED', closed_at = now(), closed_by = $3
       WHERE tenant_id = $1 AND year_label = $2`,
      [tenantId, y, userId || null]
    );

    await client.query(
      `INSERT INTO fiscal_years (tenant_id, year_label, starts_on, ends_on, status)
       VALUES ($1, $2, $3, $4, 'OPEN')
       ON CONFLICT (tenant_id, year_label) DO NOTHING`,
      [tenantId, next.yearLabel, next.startsOn, next.endsOn]
    );

    return {
      closed: { yearLabel: y, startsOn: bounds.startsOn, endsOn: bounds.endsOn, status: 'CLOSED' },
      opened: { yearLabel: next.yearLabel, startsOn: next.startsOn, endsOn: next.endsOn, status: 'OPEN' },
    };
  });
}

module.exports = {
  ClosedFiscalYearError,
  calendarBounds,
  assertEntryDateAllowed,
  listFiscalYears,
  closeFiscalYear,
  ensureCurrentOpenYear,
};
