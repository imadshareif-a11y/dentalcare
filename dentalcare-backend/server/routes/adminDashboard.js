const express = require('express');
const router = express.Router();
const { requireAuth, requireAnyPermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { displayBalance } = require('../accounting/balanceDisplay');
const { ensureAppointmentsSchema } = require('../db/ensureAppointments');

const ADMIN_ACCESS = requireAnyPermission([
  ['admin', 'view'],
  ['reports', 'view'],
]);

function slotToMinutes(value) {
  const raw = String(value || '').trim();
  const m = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function nowLocalMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function todayIsoLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function classifyAppointment(row, nowMin) {
  const start = slotToMinutes(row.slot);
  const end = slotToMinutes(row.end_slot || row.slot);
  if (start == null || end == null) return 'unknown';
  if (nowMin >= start && nowMin <= end) return 'now';
  if (nowMin < start) return 'upcoming';
  return 'past';
}

router.get('/admin/dashboard', requireAuth, ADMIN_ACCESS, async (req, res) => {
  const activityLimit = Math.min(Math.max(Number(req.query.activityLimit) || 40, 1), 100);
  const today = todayIsoLocal();
  const nowMin = nowLocalMinutes();

  try {
    await ensureAppointmentsSchema();
    const data = await withTenantClient(req.user.tenantId, async (client) => {
      const baseCurrency = await client.query(
        `SELECT id, code, symbol FROM currencies WHERE tenant_id = $1 AND is_base = TRUE LIMIT 1`,
        [req.user.tenantId]
      );
      const base = baseCurrency.rows[0] || { code: 'ILS', symbol: '₪' };

      const cashRows = await client.query(
        `SELECT cb.id, cb.name, cb.box_kind, cb.currency_id,
                c.code AS currency_code, c.symbol AS currency_symbol, c.is_base,
                c.rate_to_base,
                a.account_type,
                COALESCE(SUM(l.debit), 0) AS total_debit,
                COALESCE(SUM(l.credit), 0) AS total_credit
         FROM cash_boxes cb
         JOIN chart_of_accounts a ON a.id = cb.account_id
         JOIN currencies c ON c.id = cb.currency_id
         LEFT JOIN journal_entry_lines l ON l.account_id = cb.account_id
         WHERE cb.tenant_id = $1 AND cb.is_active = TRUE
         GROUP BY cb.id, cb.name, cb.box_kind, cb.currency_id,
                  c.code, c.symbol, c.is_base, c.rate_to_base, a.account_type
         ORDER BY cb.box_kind, c.is_base DESC, cb.name`,
        [req.user.tenantId]
      );

      const cashBoxes = cashRows.rows.map((row) => {
        const balance = displayBalance(row.account_type, row.total_debit, row.total_credit);
        const rate = Number(row.rate_to_base) > 0 ? Number(row.rate_to_base) : 1;
        return {
          id: row.id,
          name: row.name,
          boxKind: row.box_kind,
          currencyCode: row.currency_code,
          currencySymbol: row.currency_symbol,
          balance,
          balanceBase: row.is_base ? balance : balance * rate,
        };
      });

      const cashTotalBase = cashBoxes
        .filter((b) => b.boxKind === 'CASH')
        .reduce((sum, b) => sum + b.balanceBase, 0);

      const receivablesResult = await client.query(
        `SELECT COALESCE(SUM(GREATEST(sub.balance, 0)), 0) AS total
         FROM (
           SELECT COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) AS balance
           FROM parties p
           LEFT JOIN journal_entry_lines l ON l.account_id = p.account_id
           WHERE p.party_type = 'PATIENT'
           GROUP BY p.id
         ) sub`
      );

      const payablesResult = await client.query(
        `SELECT COALESCE(SUM(GREATEST(sub.balance, 0)), 0) AS total
         FROM (
           SELECT COALESCE(SUM(l.credit), 0) - COALESCE(SUM(l.debit), 0) AS balance
           FROM parties p
           LEFT JOIN journal_entry_lines l ON l.account_id = p.account_id
           WHERE p.party_type = 'SUPPLIER'
           GROUP BY p.id
         ) sub`
      );

      const patientsWithDebt = await client.query(
        `SELECT COUNT(*)::int AS cnt
         FROM (
           SELECT p.id,
                  COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) AS balance
           FROM parties p
           LEFT JOIN journal_entry_lines l ON l.account_id = p.account_id
           WHERE p.party_type = 'PATIENT'
           GROUP BY p.id
           HAVING COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) > 0
         ) sub`
      );

      const activityResult = await client.query(
        `SELECT je.id, je.entry_number, je.source_type, je.memo,
                to_char(COALESCE(je.entry_date, (je.created_at AT TIME ZONE 'UTC')::date), 'YYYY-MM-DD') AS entry_date,
                je.created_at,
                u.name AS created_by_name,
                u.username AS created_by_username,
                COALESCE(SUM(l.debit), 0) AS total_debit,
                (
                  SELECT string_agg(DISTINCT p.name, '، ')
                  FROM journal_entry_lines lx
                  JOIN chart_of_accounts ax ON ax.id = lx.account_id
                  JOIN parties p ON p.account_id = ax.id
                  WHERE lx.journal_entry_id = je.id
                ) AS party_names
         FROM journal_entries je
         LEFT JOIN journal_entry_lines l ON l.journal_entry_id = je.id
         LEFT JOIN users u ON u.id = je.created_by
         WHERE je.tenant_id = $1
         GROUP BY je.id, je.entry_number, je.source_type, je.memo, je.entry_date, je.created_at, u.name, u.username
         ORDER BY je.created_at DESC
         LIMIT $2`,
        [req.user.tenantId, activityLimit]
      );

      const apptResult = await client.query(
        `SELECT a.id, a.patient_id, a.doctor_id, a.room_id, a.status,
                a.appointment_date::text AS appointment_date,
                a.slot, COALESCE(a.end_slot, a.slot) AS end_slot,
                a.notes,
                p.name AS patient_name,
                d.name AS doctor_name,
                r.name AS room_name, r.name_en AS room_name_en, r.name_he AS room_name_he
         FROM appointments a
         JOIN parties p ON p.id = a.patient_id
         LEFT JOIN parties d ON d.id = a.doctor_id
         LEFT JOIN rooms r ON r.id = a.room_id
         WHERE a.appointment_date = $1::date AND a.status <> 'CANCELLED'
         ORDER BY a.slot ASC, r.name ASC NULLS LAST`,
        [today]
      );

      const locale = req.user.locale || 'ar';
      const appointments = apptResult.rows.map((row) => {
        const phase = classifyAppointment(row, nowMin);
        const roomName = row[`room_name_${locale}`] || row.room_name || '—';
        return {
          id: row.id,
          patientId: row.patient_id,
          patientName: row.patient_name,
          doctorId: row.doctor_id,
          doctorName: row.doctor_name || '—',
          roomId: row.room_id,
          roomName,
          slot: row.slot,
          endSlot: row.end_slot,
          status: row.status,
          notes: row.notes,
          phase,
        };
      });

      const activeNow = appointments.filter((a) => a.phase === 'now' && a.status === 'SCHEDULED');
      const upcoming = appointments.filter((a) => a.phase === 'upcoming' && a.status === 'SCHEDULED');
      const roomsInUse = [...new Map(
        activeNow.filter((a) => a.roomId).map((a) => [a.roomId, a])
      ).values()];

      return {
        generatedAt: new Date().toISOString(),
        today,
        baseCurrency: { code: base.code, symbol: base.symbol },
        summary: {
          cashTotalBase,
          patientReceivables: Number(receivablesResult.rows[0]?.total) || 0,
          supplierPayables: Number(payablesResult.rows[0]?.total) || 0,
          patientsWithDebt: Number(patientsWithDebt.rows[0]?.cnt) || 0,
          appointmentsToday: appointments.filter((a) => a.status === 'SCHEDULED').length,
          activeNow: activeNow.length,
        },
        cashBoxes,
        activity: activityResult.rows.map((row) => ({
          id: row.id,
          entryNumber: row.entry_number,
          sourceType: row.source_type,
          memo: row.memo,
          date: row.entry_date,
          createdAt: row.created_at,
          createdByName: row.created_by_name || null,
          createdByUsername: row.created_by_username || null,
          totalDebit: Number(row.total_debit) || 0,
          partyNames: row.party_names || null,
        })),
        appointments: {
          activeNow,
          upcoming: upcoming.slice(0, 12),
          all: appointments,
          roomsInUse,
        },
      };
    });

    res.json(data);
  } catch (err) {
    console.error('Admin dashboard failed:', err);
    res.status(500).json({ error: 'تعذّر تحميل اللوحة الإدارية' });
  }
});

module.exports = router;
