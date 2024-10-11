import { pipDecimalsFor, priceDecimalsFor } from './margin';

/** Above this, the cents are noise beside the magnitude and cost the figure its legibility. */
const CENTS_CEILING = 1000000;

function grouped(value: number, decimals: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** An amount in the account currency, read to the cent until it passes a million. */
export function formatAmount(value: number): string {
  return grouped(value, Math.abs(value) >= CENTS_CEILING ? 0 : 2);
}

/** A pair's price, to the decimals that pair is conventionally quoted to. */
export function formatPrice(value: number, quote: string): string {
  return grouped(value, priceDecimalsFor(quote));
}

/** Units of the base currency, which are always whole. */
export function formatUnits(value: number): string {
  return grouped(value, 0);
}

/** A position size, in the hundredths of a lot a broker accepts. */
export function formatLots(value: number): string {
  return grouped(value, 2);
}

/** A reward measured in what is being risked, which is read to the hundredth. */
export function formatMultiple(value: number): string {
  return `${value.toFixed(2)}R`;
}

/** A distance in pips, whole where it is whole and to a tenth where it is not. */
export function formatPips(value: number): string {
  const tenths = Math.round(value * 10) / 10;
  return grouped(tenths, Number.isInteger(tenths) ? 0 : 1);
}

/** A pip size, printed to exactly the decimals that quote currency needs. */
export function formatPipSize(value: number, quote: string): string {
  return value.toFixed(pipDecimalsFor(quote));
}
