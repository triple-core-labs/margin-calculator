/** Currencies the calculator needs a rate for. */
export const REQUIRED_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CHF',
  'AUD',
  'CAD',
  'NZD',
] as const;

/** Endpoints the rates can come from, in the order they are tried. */
export type RateSource = 'open.er-api.com' | 'api.frankfurter.dev';

/** A rate is treated as stale a day after publication when the provider names no next update. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/** One published set of reference rates, with the provenance a trader needs. */
export interface RateSnapshot {
  /** US dollar value of one unit of each supported currency. */
  usdPerUnit: Record<string, number>;
  /** When the provider published this set. */
  updatedAt: Date;
  /** When the provider expects to publish the next set, where it says. */
  nextUpdateAt: Date | null;
  /**
   * Whether the provider dated this set by calendar day alone, leaving the hour
   * of publication to be assumed. An assumed hour can be out by hours, so it is
   * never presented as though it were a time the provider gave.
   */
  datedByDay?: boolean;
  source: RateSource;
}

/** How old a snapshot is, and whether that age should worry the reader. */
export interface RateAge {
  ageMs: number;
  stale: boolean;
  label: string;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Describe how old a snapshot is relative to a moment, and decide whether it
 * has gone stale. A snapshot is stale once the provider is past the next update
 * it promised, or, when it promised none, once it is older than a day.
 *
 * A set the provider dated by day alone is named by that day rather than by an
 * age. The hour of publication is assumed for such a set, so an age read off it
 * carries a precision the provider never gave and can read hours fresher than
 * the rates are, which is the one direction a rate line must not err in.
 */
export function describeRateAge(snapshot: RateSnapshot, now: Date): RateAge {
  const ageMs = Math.max(0, now.getTime() - snapshot.updatedAt.getTime());
  const overdue = snapshot.nextUpdateAt !== null && now.getTime() >= snapshot.nextUpdateAt.getTime();
  const stale = overdue || ageMs >= STALE_AFTER_MS;
  const label = snapshot.datedByDay ? formatDay(snapshot.updatedAt) : formatAge(ageMs);

  return { ageMs, stale, label };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The calendar day a set was published on, read the way a date is spoken. */
function formatDay(published: Date): string {
  return `dated ${published.getUTCDate()} ${MONTHS[published.getUTCMonth()]}`;
}

function formatAge(ageMs: number): string {
  if (ageMs < MINUTE) {
    return 'just now';
  }
  if (ageMs < HOUR) {
    return `${Math.floor(ageMs / MINUTE)} min ago`;
  }
  if (ageMs < DAY) {
    return `${Math.floor(ageMs / HOUR)} h ago`;
  }
  return `${Math.floor(ageMs / DAY)} d ago`;
}

/** What the screen knows about the rates at any moment. */
export type RatesState =
  | { status: 'loading' }
  | { status: 'ready'; snapshot: RateSnapshot }
  | { status: 'error'; message: string };
