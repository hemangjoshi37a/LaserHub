import { useCurrencyStore, CURRENCY_LIST } from '../store/currencyStore';

/**
 * Format a USD amount in the active (or explicitly passed) currency.
 *
 * Amounts in the app are stored/passed in USD (base currency). This helper
 * converts the USD `amount` into the target currency by multiplying by that
 * currency's exchange `rate`, then formats it with the correct symbol/code.
 *
 * @param amount         USD amount (base currency)
 * @param currencyOrCode optional target currency; pass a currency code string
 *                       (e.g. "INR") or an object with a `code`. Defaults to
 *                       the currency currently selected in the store.
 */
export function formatPrice(amount: number, currencyOrCode?: string | { code: string }): string {
  const current = useCurrencyStore.getState().currency;

  // Resolve the target currency code.
  let code = current.code;
  if (typeof currencyOrCode === 'string') {
    code = currencyOrCode;
  } else if (currencyOrCode && typeof currencyOrCode === 'object') {
    code = currencyOrCode.code;
  }

  // Resolve the exchange rate for that code. Use the store's current currency
  // when it matches (avoids a lookup); otherwise find it in the currency table.
  const rate =
    code === current.code
      ? current.rate
      : CURRENCY_LIST.find((c) => c.code === code)?.rate ?? 1;

  // Convert USD -> target currency before formatting.
  const converted = amount * rate;

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(converted);
}
