/**
 * The spoken name of every currency the calculator can quote, so a pair can be
 * found by typing what the trader calls it rather than only its ISO code.
 */
export const CURRENCY_NAMES: Readonly<Record<string, string>> = {
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  JPY: 'Japanese Yen',
  CHF: 'Swiss Franc',
  CAD: 'Canadian Dollar',
  AUD: 'Australian Dollar',
  NZD: 'New Zealand Dollar',
  SEK: 'Swedish Krona',
  NOK: 'Norwegian Krone',
  DKK: 'Danish Krone',
  PLN: 'Polish Zloty',
  HUF: 'Hungarian Forint',
  CZK: 'Czech Koruna',
  TRY: 'Turkish Lira',
  ZAR: 'South African Rand',
  MXN: 'Mexican Peso',
  SGD: 'Singapore Dollar',
  HKD: 'Hong Kong Dollar',
  CNH: 'Offshore Chinese Yuan',
};

/** The name a currency is known by, falling back to its code. */
export function currencyName(code: string): string {
  return CURRENCY_NAMES[code] ?? code;
}
