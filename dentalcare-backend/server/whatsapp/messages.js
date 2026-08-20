// whatsapp/messages.js — نصوص الرسائل بالعربية

function formatMoneySimple(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount ?? '');
  return n.toFixed(2);
}

function clinicLabel(clinicName) {
  return clinicName || 'العيادة';
}

function appointmentConfirmText({ clinicName, patientName, date, slot }) {
  return [
    `مرحباً ${patientName || ''},`.trim(),
    `تم تأكيد موعدك في ${clinicLabel(clinicName)}.`,
    `التاريخ: ${date}`,
    `الوقت: ${slot}`,
    'نراك قريباً.',
  ].join('\n');
}

function appointmentReminderText({ clinicName, patientName, date, slot }) {
  return [
    `تذكير: لديك موعد غداً في ${clinicLabel(clinicName)}.`,
    `المريض: ${patientName || ''}`,
    `التاريخ: ${date}`,
    `الوقت: ${slot}`,
    'للإلغاء أو التأجيل يرجى التواصل معنا.',
  ].join('\n');
}

function paymentConfirmText({ clinicName, patientName, amount, date }) {
  return [
    `مرحباً ${patientName || ''},`.trim(),
    `تم استلام دفعة في ${clinicLabel(clinicName)}.`,
    `المبلغ: ${formatMoneySimple(amount)}`,
    date ? `التاريخ: ${date}` : null,
    'شكراً لثقتكم.',
  ].filter(Boolean).join('\n');
}

function balanceText({ clinicName, patientName, balance }) {
  const bal = Number(balance) || 0;
  const line = bal > 0
    ? `الرصيد المستحق عليكم: ${formatMoneySimple(bal)}`
    : bal < 0
      ? `رصيد دائن لكم: ${formatMoneySimple(Math.abs(bal))}`
      : 'لا يوجد رصيد مستحق حالياً.';
  return [
    `مرحباً ${patientName || ''},`.trim(),
    `${clinicLabel(clinicName)} — كشف رصيد سريع:`,
    line,
  ].join('\n');
}

module.exports = {
  appointmentConfirmText,
  appointmentReminderText,
  paymentConfirmText,
  balanceText,
  formatMoneySimple,
};
