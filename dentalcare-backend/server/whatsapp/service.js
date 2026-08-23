// whatsapp/service.js — إرسال مع سجل وتفادي التكرار
const { withTenantClient, withSystemClient } = require('../db/pool');
const { getAccountBalance } = require('../accounting/engine');
const { resolveWhatsappConfig } = require('./config');
const { sendWhatsappMessage } = require('./client');
const {
  appointmentConfirmText,
  appointmentReminderText,
  paymentConfirmText,
  balanceText,
} = require('./messages');

async function loadTenantWaRow(tenantId) {
  return withTenantClient(tenantId, async (client) => {
    const result = await client.query(
      `SELECT wa_enabled, wa_provider, wa_api_token, wa_phone_number_id, wa_base_url,
              wa_default_country, wa_template_appointment, wa_template_reminder,
              wa_template_payment, wa_template_balance,
              wa_auto_appointment, wa_auto_reminder, wa_auto_payment
       FROM tenant_settings WHERE tenant_id = $1`,
      [tenantId]
    );
    return result.rows[0] || null;
  });
}

async function loadClinicName(tenantId) {
  return withSystemClient(async (client) => {
    const r = await client.query(`SELECT name FROM tenants WHERE id = $1`, [tenantId]);
    return r.rows[0]?.name || null;
  });
}

async function resolvePatientId(tenantId, { patientId, patientAccountId }) {
  if (patientId) return patientId;
  if (!patientAccountId) return null;
  return withTenantClient(tenantId, async (client) => {
    const r = await client.query(
      `SELECT id FROM parties WHERE account_id = $1 AND tenant_id = $2 AND party_type = 'PATIENT' LIMIT 1`,
      [patientAccountId, tenantId]
    );
    return r.rows[0]?.id || null;
  });
}

async function logMessage(tenantId, {
  patientId = null,
  appointmentId = null,
  kind,
  toPhone,
  bodyPreview,
  status,
  providerRef = null,
  error = null,
}) {
  await withTenantClient(tenantId, async (client) => {
    await client.query(
      `INSERT INTO whatsapp_messages
         (tenant_id, patient_id, appointment_id, kind, to_phone, body_preview, status, provider_ref, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        tenantId,
        patientId,
        appointmentId,
        kind,
        toPhone,
        bodyPreview ? String(bodyPreview).slice(0, 500) : null,
        status,
        providerRef,
        error ? String(error).slice(0, 1000) : null,
      ]
    );
  });
}

async function alreadySent(tenantId, { kind, appointmentId, patientId, withinHours = 20 }) {
  return withTenantClient(tenantId, async (client) => {
    if (appointmentId) {
      const r = await client.query(
        `SELECT id FROM whatsapp_messages
         WHERE tenant_id = $1 AND kind = $2 AND appointment_id = $3 AND status = 'SENT'
         LIMIT 1`,
        [tenantId, kind, appointmentId]
      );
      return r.rowCount > 0;
    }
    if (patientId && kind === 'balance') {
      const r = await client.query(
        `SELECT id FROM whatsapp_messages
         WHERE tenant_id = $1 AND kind = $2 AND patient_id = $3 AND status = 'SENT'
           AND created_at > now() - ($4 || ' hours')::interval
         LIMIT 1`,
        [tenantId, kind, patientId, String(withinHours)]
      );
      return r.rowCount > 0;
    }
    return false;
  });
}

async function loadPatient(tenantId, patientId) {
  return withTenantClient(tenantId, async (client) => {
    const r = await client.query(
      `SELECT id, name, phone, account_id FROM parties
       WHERE id = $1 AND tenant_id = $2 AND party_type = 'PATIENT'`,
      [patientId, tenantId]
    );
    return r.rows[0] || null;
  });
}

async function loadAppointment(tenantId, appointmentId) {
  return withTenantClient(tenantId, async (client) => {
    const r = await client.query(
      `SELECT a.id, a.patient_id, a.appointment_date, a.slot, a.status,
              p.name AS patient_name, p.phone
       FROM appointments a
       JOIN parties p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [appointmentId, tenantId]
    );
    return r.rows[0] || null;
  });
}

function templateForKind(config, kind) {
  const map = {
    appointment: config.templates.appointment,
    reminder: config.templates.reminder,
    payment: config.templates.payment,
    balance: config.templates.balance,
  };
  return map[kind] || null;
}

/**
 * @param {'appointment'|'reminder'|'payment'|'balance'} kind
 */
async function sendPatientWhatsapp(tenantId, {
  kind,
  patientId = null,
  patientAccountId = null,
  appointmentId = null,
  amount = null,
  entryDate = null,
  skipDedupe = false,
}) {
  const row = await loadTenantWaRow(tenantId);
  const config = resolveWhatsappConfig(row);
  const clinicName = await loadClinicName(tenantId);

  let patient = null;
  let appointment = null;
  let phone = null;
  let text = '';
  let templateParams = [];

  if (kind === 'balance' || kind === 'payment') {
    patientId = await resolvePatientId(tenantId, { patientId, patientAccountId });
  }

  if (kind === 'appointment' || kind === 'reminder') {
    if (!appointmentId) {
      const err = new Error('معرف الموعد مطلوب');
      err.statusCode = 400;
      throw err;
    }
    appointment = await loadAppointment(tenantId, appointmentId);
    if (!appointment) {
      const err = new Error('الموعد غير موجود');
      err.statusCode = 404;
      throw err;
    }
    patientId = appointment.patient_id;
    phone = appointment.phone;
    const dateStr = String(appointment.appointment_date).slice(0, 10);
    const slot = appointment.slot;
    const patientName = appointment.patient_name;
    text = kind === 'reminder'
      ? appointmentReminderText({ clinicName, patientName, date: dateStr, slot })
      : appointmentConfirmText({ clinicName, patientName, date: dateStr, slot });
    templateParams = [patientName || '', dateStr, slot, clinicName || ''];
  } else if (kind === 'balance') {
    if (!patientId) {
      const err = new Error('معرف المريض مطلوب');
      err.statusCode = 400;
      throw err;
    }
    patient = await loadPatient(tenantId, patientId);
    if (!patient) {
      const err = new Error('المريض غير موجود');
      err.statusCode = 404;
      throw err;
    }
    phone = patient.phone;
    const balance = patient.account_id
      ? await getAccountBalance({ tenantId, accountId: patient.account_id })
      : 0;
    text = balanceText({ clinicName, patientName: patient.name, balance });
    templateParams = [patient.name || '', String(balance), clinicName || ''];
  } else if (kind === 'payment') {
    if (!patientId) {
      const err = new Error('معرف المريض مطلوب');
      err.statusCode = 400;
      throw err;
    }
    patient = await loadPatient(tenantId, patientId);
    if (!patient) {
      const err = new Error('المريض غير موجود');
      err.statusCode = 404;
      throw err;
    }
    phone = patient.phone;
    const amt = amount != null ? Number(amount) : 0;
    const dateStr = entryDate ? String(entryDate).slice(0, 10) : null;
    text = paymentConfirmText({
      clinicName,
      patientName: patient.name,
      amount: amt,
      date: dateStr,
    });
    templateParams = [patient.name || '', String(amt), dateStr || '', clinicName || ''];
  } else {
    const err = new Error('نوع الرسالة غير مدعوم');
    err.statusCode = 400;
    throw err;
  }

  if (!phone) {
    const err = new Error('لا يوجد رقم هاتف للمريض');
    err.statusCode = 400;
    throw err;
  }

  if (!skipDedupe && (kind === 'appointment' || kind === 'reminder')) {
    const dup = await alreadySent(tenantId, { kind, appointmentId });
    if (dup) {
      return { skipped: true, reason: 'already_sent' };
    }
  }

  const templateName = config.provider === 'meta' ? templateForKind(config, kind) : null;

  try {
    const result = await sendWhatsappMessage(config, {
      phone,
      text,
      templateName,
      templateParams,
    });
    await logMessage(tenantId, {
      patientId,
      appointmentId,
      kind,
      toPhone: result.toPhone || phone,
      bodyPreview: text,
      status: 'SENT',
      providerRef: result.providerRef,
    });
    return { success: true, providerRef: result.providerRef, toPhone: result.toPhone || null };
  } catch (err) {
    await logMessage(tenantId, {
      patientId,
      appointmentId,
      kind,
      toPhone: phone,
      bodyPreview: text,
      status: 'FAILED',
      error: err.message,
    }).catch(() => {});
    throw err;
  }
}

/** إرسال صامت للأتمتة — لا يرمي للمسار الرئيسي */
async function tryAutoSend(tenantId, opts) {
  try {
    const row = await loadTenantWaRow(tenantId);
    const config = resolveWhatsappConfig(row);
    if (!config.available) return { skipped: true, reason: 'unavailable' };

    if (opts.kind === 'appointment' && !config.autoAppointment) {
      return { skipped: true, reason: 'auto_off' };
    }
    if (opts.kind === 'reminder' && !config.autoReminder) {
      return { skipped: true, reason: 'auto_off' };
    }
    if (opts.kind === 'payment' && !config.autoPayment) {
      return { skipped: true, reason: 'auto_off' };
    }

    return await sendPatientWhatsapp(tenantId, opts);
  } catch (err) {
    console.error('WhatsApp auto-send failed:', err.message);
    return { success: false, error: err.message };
  }
}

/** تذكير مواعيد الغد التي لم يُرسل لها تذكير */
async function sendTomorrowReminders(tenantId) {
  const row = await loadTenantWaRow(tenantId);
  const config = resolveWhatsappConfig(row);
  if (!config.available || !config.autoReminder) {
    return { sent: 0, skipped: true, reason: !config.available ? 'unavailable' : 'auto_off' };
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day = tomorrow.toISOString().slice(0, 10);

  const appointments = await withTenantClient(tenantId, async (client) => {
    const r = await client.query(
      `SELECT a.id
       FROM appointments a
       WHERE a.appointment_date = $1::date
         AND a.status = 'SCHEDULED'
         AND NOT EXISTS (
           SELECT 1 FROM whatsapp_messages w
           WHERE w.appointment_id = a.id AND w.kind = 'reminder' AND w.status = 'SENT'
         )`,
      [day]
    );
    return r.rows;
  });

  let sent = 0;
  let failed = 0;
  for (const appt of appointments) {
    try {
      const result = await sendPatientWhatsapp(tenantId, {
        kind: 'reminder',
        appointmentId: appt.id,
      });
      if (result?.success) sent += 1;
    } catch {
      failed += 1;
    }
  }
  return { sent, failed, total: appointments.length, date: day };
}

module.exports = {
  loadTenantWaRow,
  sendPatientWhatsapp,
  tryAutoSend,
  sendTomorrowReminders,
};
