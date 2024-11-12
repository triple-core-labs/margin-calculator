/** One row of a ticket dropdown. */
export interface SelectOption {
  /** The value written back to the form when the row is chosen. */
  value: string | number;
  /** What the control shows once the row is chosen. */
  label: string;
  /** A dim gloss shown beside the label, also matched by a search. */
  detail?: string;
  /** Further words a search matches, beyond the label and the gloss. */
  terms?: readonly string[];
}

/**
 * Reduce a query or a label to the letters and digits in it, in lower case.
 *
 * A symbol is typed in whatever shape is quickest, so USDJPY, usd/jpy and
 * "usd jpy" all have to reach the same row, and a leverage ratio has to be
 * reachable by its number rather than by the colon in front of it.
 */
export function normalizeQuery(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The normalised text of a row, kept against the row itself.
 *
 * The catalogue is every pair the feed can price, which is thousands of rows,
 * and every keystroke filters all of them. Reducing a row to its letters costs
 * more than comparing them, so it is done once per row rather than once per
 * keystroke.
 */
const TEXTS = new WeakMap<SelectOption, string[]>();

function searchTexts(option: SelectOption): string[] {
  const cached = TEXTS.get(option);
  if (cached) {
    return cached;
  }
  const parts = [option.label, option.detail ?? '', ...(option.terms ?? [])];
  const texts = parts.map(normalizeQuery).filter((part) => part.length > 0);
  TEXTS.set(option, texts);
  return texts;
}

/**
 * Whether a row answers a query. The query has to appear somewhere in the
 * symbol, in either leg, or in the spoken name of either leg, so both "yen" and
 * "JPY" reach USD/JPY. A blank query matches every row.
 */
export function optionMatches(option: SelectOption, query: string): boolean {
  return matchesNeedle(option, normalizeQuery(query));
}

function matchesNeedle(option: SelectOption, needle: string): boolean {
  if (needle.length === 0) {
    return true;
  }
  return searchTexts(option).some((text) => text.includes(needle));
}

/**
 * The rows a query leaves, in the order the catalogue lists them, up to a
 * limit.
 *
 * The catalogue is ordered by how much of the market a pair carries, so the
 * first rows a query matches are also the best answers to it. Stopping at the
 * limit is therefore a way of keeping the list quick without losing anything
 * the trader was likely to pick: thirteen thousand rows of markup would cost
 * more than the answer is worth.
 */
export function filterOptions(
  options: readonly SelectOption[],
  query: string,
  limit = Number.POSITIVE_INFINITY
): SelectOption[] {
  const needle = normalizeQuery(query);
  const found: SelectOption[] = [];
  for (const option of options) {
    if (found.length >= limit) {
      break;
    }
    if (matchesNeedle(option, needle)) {
      found.push(option);
    }
  }
  return found;
}

/**
 * The next row after `fromIndex` whose label, gloss or terms start with the
 * character typed, wrapping past the end of the list. Returns -1 when nothing
 * in the list starts with it.
 */
export function typeaheadIndex(
  options: readonly SelectOption[],
  character: string,
  fromIndex: number
): number {
  const needle = normalizeQuery(character);
  if (needle.length === 0 || options.length === 0) {
    return -1;
  }

  const start = fromIndex < 0 ? 0 : fromIndex;
  for (let step = 1; step <= options.length; step += 1) {
    const index = (start + step) % options.length;
    if (searchTexts(options[index]).some((text) => text.startsWith(needle))) {
      return index;
    }
  }
  return -1;
}
