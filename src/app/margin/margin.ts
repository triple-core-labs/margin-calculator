/** Units of the base currency in one standard lot. */
export const CONTRACT_SIZE = 100000;

/** Pip size for a pair quoted to two or three decimal places. */
const HUNDREDTH_PIP = 0.01;

/** Pip size for a pair quoted to four or five decimal places. */
const TEN_THOUSANDTH_PIP = 0.0001;

/**
 * Quote currencies a pair is conventionally priced to two or three decimals in,
 * rather than the usual four or five.
 *
 * The convention follows the size of the number on the ticket, not the region.
 * One unit of the base buys hundreds of Japanese yen and hundreds of Hungarian
 * forint, so those pairs print as 156.019 and 313.535 and the pip is the second
 * decimal. Every other quote currency the calculator offers buys the base back
 * in single digits or low tens, so it prints to four or five decimals and the
 * pip is the fourth: that covers the dollar, euro, pound, franc, Canadian,
 * Australian and New Zealand dollars, the Scandinavian krona, krone and krone,
 * the zloty, koruna, lira, rand, peso, Singapore and Hong Kong dollars and the
 * offshore yuan. The koruna and the lira sit highest of that group in the low
 * tens and are still quoted to four decimals, which is where the line falls.
 */
export const HUNDREDTH_PIP_QUOTES: ReadonlySet<string> = new Set(['JPY', 'HUF']);

/**
 * A pip is the last decimal a pair is conventionally quoted to, which depends
 * only on the quote currency. Pairs quoted in one of the hundredth pip
 * currencies move in hundredths; every other pair moves in ten thousandths.
 */
export function pipSizeFor(quote: string): number {
  return HUNDREDTH_PIP_QUOTES.has(quote) ? HUNDREDTH_PIP : TEN_THOUSANDTH_PIP;
}

/**
 * Decimal places a pair's price is conventionally quoted to, which is one past
 * the pip in both buckets: the fractional pip brokers show as a small digit.
 */
export function priceDecimalsFor(quote: string): number {
  return HUNDREDTH_PIP_QUOTES.has(quote) ? 3 : 5;
}

/** Decimal places needed to print a pip size exactly. */
export function pipDecimalsFor(quote: string): number {
  return HUNDREDTH_PIP_QUOTES.has(quote) ? 2 : 4;
}
