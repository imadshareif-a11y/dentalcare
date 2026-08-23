/** رصيد العرض حسب نوع الحساب (ذمة مدينة / دائنة). */
function displayBalance(accountType, totalDebit, totalCredit) {
  const debit = Number(totalDebit) || 0;
  const credit = Number(totalCredit) || 0;
  if (accountType === 'LIABILITY') return credit - debit;
  return debit - credit;
}

module.exports = { displayBalance };
