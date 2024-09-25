/** A tradeable pair, named the way a broker names it. */
export interface CurrencyPair {
  label: string;
  base: string;
  quote: string;
}

/**
 * The order the market decides which leg of a pair is the base.
 *
 * A pair is not named alphabetically. The convention is a fixed precedence
 * among the currencies that carry the market, so the euro is the base of
 * everything it appears in and the yen is the quote of everything it appears
 * in: EUR/USD and never USD/EUR, USD/JPY and never JPY/USD. Anything the
 * convention does not name sits after all of these and takes the quote side.
 */
export const QUOTE_ORDER = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'] as const;

/**
 * The order a currency outside the convention is anchored to one inside it.
 *
 * This is precedence of liquidity rather than of naming: an exotic is quoted
 * against the dollar first and the euro second, whatever the naming order of
 * the two says about which is the base.
 */
export const ANCHOR_ORDER = ['USD', 'EUR', 'GBP', 'AUD', 'NZD', 'CAD', 'CHF', 'JPY'] as const;

/** What the feed has to look like for a code to be treated as a currency. */
const CODE = /^[A-Z]{3}$/;

const QUOTE_RANK = new Map<string, number>(QUOTE_ORDER.map((code, index) => [code, index]));
const ANCHOR_RANK = new Map<string, number>(ANCHOR_ORDER.map((code, index) => [code, index]));

/** Ranks reserved above every core cross, so an exotic can never outrank one. */
const EXOTIC_TIER = 200;

/** Ranks reserved above every anchored exotic, for a pair with no anchor at all. */
const ORPHAN_TIER = 400;

const OUTSIDE = QUOTE_ORDER.length;

function quoteRank(code: string): number {
  return QUOTE_RANK.get(code) ?? OUTSIDE;
}

function pair(base: string, quote: string): CurrencyPair {
  return { label: `${base}/${quote}`, base, quote };
}

/**
 * Name a pair of currencies the way the market names it, whichever way round
 * the two are handed over. The currency the convention ranks higher takes the
 * base position; two currencies it does not rank at all are ordered by their
 * code, which is arbitrary but stable.
 */
export function orientPair(a: string, b: string): CurrencyPair {
  const rankA = quoteRank(a);
  const rankB = quoteRank(b);
  if (rankA !== rankB) {
    return rankA < rankB ? pair(a, b) : pair(b, a);
  }
  return a <= b ? pair(a, b) : pair(b, a);
}

/** The seven pairs that carry most of the market, each one against the dollar. */
export const MAJOR_PAIRS: readonly CurrencyPair[] = QUOTE_ORDER.filter(
  (code) => code !== 'USD'
).map((code) => orientPair(code, 'USD'));

const MAJOR_RANK = new Map<string, number>(MAJOR_PAIRS.map((p, index) => [p.label, index]));

/**
 * How near the front of the list a pair belongs.
 *
 * The feed carries every currency it can price, most of which no broker
 * quotes, so an untyped list has to open on the pairs a trader actually
 * trades: the majors first in the order the convention names them, then the
 * crosses among the same currencies, then everything anchored to one of them,
 * and last the pairs that touch the convention nowhere.
 */
function prominence(candidate: CurrencyPair): number {
  const major = MAJOR_RANK.get(candidate.label);
  if (major !== undefined) {
    return major;
  }

  const base = quoteRank(candidate.base);
  const quote = quoteRank(candidate.quote);
  if (base < OUTSIDE && quote < OUTSIDE) {
    return 10 + base * 10 + quote;
  }
  if (base < OUTSIDE || quote < OUTSIDE) {
    const anchor = base < OUTSIDE ? candidate.base : candidate.quote;
    return EXOTIC_TIER + (ANCHOR_RANK.get(anchor) ?? OUTSIDE);
  }
  return ORPHAN_TIER;
}

/**
 * Every pair the fetched currencies can make, most prominent first.
 *
 * The feed decides the universe rather than a catalogue written here, so a
 * currency the provider adds is tradeable the day it appears. Anything the
 * feed sends that is not a three letter code is dropped, and a code it repeats
 * is taken once.
 */
export function buildPairs(codes: readonly string[]): CurrencyPair[] {
  const clean = [...new Set(codes.filter((code) => CODE.test(code)))];

  const pairs: CurrencyPair[] = [];
  for (let i = 0; i < clean.length; i += 1) {
    for (let j = i + 1; j < clean.length; j += 1) {
      pairs.push(orientPair(clean[i], clean[j]));
    }
  }

  const ranked = pairs.map((p) => ({ pair: p, rank: prominence(p) }));
  ranked.sort((a, b) => a.rank - b.rank || (a.pair.label < b.pair.label ? -1 : 1));
  return ranked.map((entry) => entry.pair);
}

function priceable(rates: Record<string, number>, code: string): boolean {
  const rate = rates[code];
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0;
}

/**
 * Keep only the pairs the fetched rates can actually price.
 *
 * The feed decides the universe, not the catalogue: the central bank fallback
 * carries thirty currencies where the primary feed carries a hundred and
 * sixty six. Offering a symbol whose legs are missing would put a pair on
 * screen that can only ever answer with an error.
 */
export function priceablePairs(
  pairs: readonly CurrencyPair[],
  rates: Record<string, number>
): CurrencyPair[] {
  return pairs.filter((p) => priceable(rates, p.base) && priceable(rates, p.quote));
}
