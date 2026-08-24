const { resolveAccountCurrency, foreignToBase } = require('./accountCurrency');

/**
 * سطران متوازنان: صندوق/حافظة (بعملة الحساب) ↔ ذمة/مستفيد (بالعملة الأساسية).
 * direction: IN = قبض (مدين صندوق)، OUT = صرف (دائن صندوق).
 */
async function buildCashMovementLines(client, {
  cashAccountId,
  counterAccountId,
  foreignAmount,
  direction,
  currencyContext,
}) {
  const cashCurrency = await resolveAccountCurrency(client, cashAccountId);
  if (!cashCurrency) {
    throw Object.assign(new Error('تعذّر تحديد عملة حساب الصندوق'), { statusCode: 400 });
  }

  const amount = Number(foreignAmount) || 0;
  if (amount <= 0) {
    throw Object.assign(new Error('المبلغ يجب أن يكون أكبر من صفر'), { statusCode: 400 });
  }

  const rate = Number(currencyContext?.rate) > 0
    ? Number(currencyContext.rate)
    : cashCurrency.rate;
  const places = cashCurrency.decimalPlaces;
  const baseAmount = foreignToBase(amount, rate, places);

  const cashLine = {
    accountId: cashAccountId,
    currencyId: cashCurrency.currencyId,
    exchangeRate: rate,
  };
  const counterLine = {
    accountId: counterAccountId,
    currencyId: null,
    exchangeRate: 1,
    foreignDebit: 0,
    foreignCredit: 0,
  };

  if (direction === 'IN') {
    cashLine.foreignDebit = amount;
    cashLine.foreignCredit = 0;
    cashLine.debit = baseAmount;
    cashLine.credit = 0;
    counterLine.debit = 0;
    counterLine.credit = baseAmount;
  } else {
    cashLine.foreignDebit = 0;
    cashLine.foreignCredit = amount;
    cashLine.debit = 0;
    cashLine.credit = baseAmount;
    counterLine.debit = baseAmount;
    counterLine.credit = 0;
  }

  return [cashLine, counterLine];
}

module.exports = { buildCashMovementLines };
