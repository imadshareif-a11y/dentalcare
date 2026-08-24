export function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function toBaseAmount(foreign, rate) {
  return roundMoney((Number(foreign) || 0) * (Number(rate) || 1));
}

export function rateForCurrency(currencyId, currencies) {
  const cur = currencies.find((c) => String(c.id) === String(currencyId));
  return Number(cur?.rate_to_base) > 0 ? Number(cur.rate_to_base) : 1;
}

export function foreignToBase(foreign, currencyId, currencies) {
  return toBaseAmount(foreign, rateForCurrency(currencyId, currencies));
}
