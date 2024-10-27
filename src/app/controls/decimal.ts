/** Characters used to space a figure out, none of which carry meaning. */
const SPACING = /[\s'  ]/g;

/**
 * Read a number out of a field, accepting either separator as the decimal
 * point.
 *
 * The rule is one sentence: a separator on its own is the decimal point,
 * whichever character it is, and grouping is only recognised where both
 * characters are present or one is repeated. So 210,885 and 210.885 are the
 * same price, 58,097.04 and 58.097,04 are the same amount, and 1,250,000 is a
 * million and a quarter. A comma has to read as a decimal point because that is
 * what the trader's own keyboard and locale put under their thumb, while the
 * ticket prints its answers the other way round.
 *
 * Grouping is only read where the digits are actually grouped, in threes. A
 * figure like 1.08.09 is neither a decimal nor a grouping, and reading it as
 * 10809 would hand a broker a price a thousand times the one that was typed,
 * so it is refused and the field says it holds no number.
 */
export function parseDecimal(text: string): number | null {
  const clean = String(text).replace(SPACING, '');
  if (clean.length === 0) {
    return null;
  }

  const lastComma = clean.lastIndexOf(',');
  const lastDot = clean.lastIndexOf('.');
  const commas = (clean.match(/,/g) ?? []).length;
  const dots = (clean.match(/\./g) ?? []).length;

  let normalised: string;
  if (commas > 0 && dots > 0) {
    const decimal = lastComma > lastDot ? ',' : '.';
    const grouping = decimal === ',' ? '.' : ',';
    const point = clean.lastIndexOf(decimal);
    const whole = clean.slice(0, point);
    if (!grouped(whole, grouping)) {
      return null;
    }
    normalised = `${whole.split(grouping).join('')}.${clean.slice(point + 1)}`;
  } else if (commas > 1 || dots > 1) {
    const grouping = commas > 1 ? ',' : '.';
    if (!grouped(clean, grouping)) {
      return null;
    }
    normalised = clean.split(grouping).join('');
  } else {
    normalised = clean.replace(',', '.');
  }

  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}

/**
 * Whether a separator really is splitting the digits into groups.
 *
 * Grouping runs in threes everywhere it is used, so 1,250,000 is a figure and
 * 1.08.09 is a mistake. Anything the separator does not divide into a leading
 * group of one to three digits followed by groups of exactly three is a
 * mistake, whatever the trader meant by it.
 */
function grouped(text: string, separator: string): boolean {
  const digits = /^[+-]/.test(text) ? text.slice(1) : text;
  const groups = digits.split(separator);
  if (groups.length < 2) {
    return /^\d*$/.test(digits);
  }
  return /^\d{1,3}$/.test(groups[0]) && groups.slice(1).every((group) => /^\d{3}$/.test(group));
}

/** How many decimals a value is written to when it is exact. */
const MAX_DECIMALS = 12;

/**
 * Write a number the one way the ticket reads numbers, with a point for the
 * decimal and nothing for a field that holds no value. Exponent notation is
 * never produced, because no field on a ticket is read that way.
 */
export function formatDecimal(value: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '';
  }
  const plain = String(value);
  if (!plain.includes('e') && !plain.includes('E')) {
    return plain;
  }
  return value.toFixed(MAX_DECIMALS).replace(/0+$/, '').replace(/\.$/, '');
}

/** The decimals a step moves in, so stepping never leaves binary dust behind. */
export function decimalsOf(step: number): number {
  const plain = formatDecimal(step);
  const point = plain.indexOf('.');
  return point < 0 ? 0 : plain.length - point - 1;
}

/** A value moved one step up or down, starting from nothing when the field is empty. */
export function stepValue(value: number | null, step: number, direction: 1 | -1): number {
  const from = value === null || !Number.isFinite(value) ? 0 : value;
  return Number((from + direction * step).toFixed(decimalsOf(step)));
}
