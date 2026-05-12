import { useCurrencyStore } from '../store/currencyStore';

export function formatPrice(amount: number, currencyOrCode?: string | { code: string }): string {
  let code = useCurrencyStore.getState().currency.code;
  if (typeof currencyOrCode === 'string') {
    code = currencyOrCode;
  } else if (currencyOrCode && typeof currencyOrCode === 'object') {
    code = currencyOrCode.code;
  }
  
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
