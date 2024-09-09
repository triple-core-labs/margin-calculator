import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, startWith } from 'rxjs/operators';

import { CURRENCY_NAMES } from '../margin/currencies';
import { RateSnapshot, RatesState, REQUIRED_CURRENCIES } from './rates';

/** Primary feed: 166 currencies, with its own publication and next update times. */
export const ER_API_URL = 'https://open.er-api.com/v6/latest/USD';

/** Fallback feed: European Central Bank reference rates, quoted against the euro. */
export const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1/latest';

/** The spoken name of every currency the central bank publishes a rate for. */
export const CURRENCY_NAMES_URL = 'https://api.frankfurter.dev/v1/currencies';

/** Hour of the day, in UTC, the central bank is assumed to publish its reference rates at. */
const ECB_PUBLICATION_HOUR_UTC = 15;

const DAY_MS = 24 * 60 * 60 * 1000;

const UNAVAILABLE =
  'Reference rates are unavailable, so no figure can be trusted. Check the connection and retry.';

interface ErApiResponse {
  rates?: Record<string, number>;
  time_last_update_unix?: number;
  time_next_update_unix?: number;
}

/** A currency code is three capitals, and a name is words. */
const CODE = /^[A-Z]{3}$/;

interface FrankfurterResponse {
  base?: string;
  date?: string;
  rates?: Record<string, number>;
}

function isUsable(rate: unknown): rate is number {
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0;
}

/**
 * Keep only a table that covers every currency the calculator offers. A partial
 * table is treated as a failed fetch, because a missing leg would silently
 * remove a pair rather than announce a problem.
 */
function complete(usdPerUnit: Record<string, number>): Record<string, number> {
  for (const code of REQUIRED_CURRENCIES) {
    if (!isUsable(usdPerUnit[code])) {
      throw new Error(`rate feed is missing ${code}`);
    }
  }
  return usdPerUnit;
}

/**
 * The primary feed quotes units of each currency per US dollar, which is the
 * reciprocal of what the arithmetic wants.
 */
function readErApi(body: ErApiResponse): RateSnapshot {
  const rates = body.rates ?? {};
  const usdPerUnit: Record<string, number> = {};
  for (const [code, rate] of Object.entries(rates)) {
    if (isUsable(rate)) {
      usdPerUnit[code] = 1 / rate;
    }
  }

  const updated = body.time_last_update_unix;
  if (!isUsable(updated)) {
    throw new Error('rate feed carries no publication time');
  }
  const next = body.time_next_update_unix;

  return {
    usdPerUnit: complete(usdPerUnit),
    updatedAt: new Date(updated * 1000),
    nextUpdateAt: isUsable(next) ? new Date(next * 1000) : null,
    source: 'open.er-api.com',
  };
}

/**
 * The fallback feed quotes every currency against the euro and dates the set by
 * day only, so publication is placed at the central bank's usual hour. That hour
 * is an assumption and not a time the feed gave: it is right in winter, an hour
 * late through the summer, and later still on a day the bank publishes off its
 * usual schedule. The snapshot is marked as dated by day so that nothing
 * downstream reads an age off it as though the provider had timed it.
 */
function readFrankfurter(body: FrankfurterResponse): RateSnapshot {
  const rates = body.rates ?? {};
  const base = body.base ?? 'EUR';
  const usdPerBase = rates['USD'];
  if (!isUsable(usdPerBase)) {
    throw new Error('rate feed carries no dollar rate');
  }

  const usdPerUnit: Record<string, number> = { [base]: usdPerBase };
  for (const [code, rate] of Object.entries(rates)) {
    if (isUsable(rate)) {
      usdPerUnit[code] = usdPerBase / rate;
    }
  }

  const date = body.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('rate feed carries no publication date');
  }
  const updatedAt = new Date(`${date}T00:00:00Z`);
  updatedAt.setUTCHours(ECB_PUBLICATION_HOUR_UTC);

  return {
    usdPerUnit: complete(usdPerUnit),
    updatedAt,
    nextUpdateAt: new Date(updatedAt.getTime() + DAY_MS),
    datedByDay: true,
    source: 'api.frankfurter.dev',
  };
}

/**
 * Merge the published names into the ones the app already carries, taking only
 * the entries that look like a currency and a name.
 */
function readNames(body: unknown): Record<string, string> {
  const published: Record<string, string> = {};
  for (const [code, name] of Object.entries(body as Record<string, unknown>)) {
    if (CODE.test(code) && typeof name === 'string' && name.length > 0) {
      published[code] = name;
    }
  }
  return { ...CURRENCY_NAMES, ...published };
}

/**
 * Fetches reference rates from a keyless public feed, with a central bank feed
 * as fallback. It never serves a snapshot it could not verify: when both feeds
 * fail the state becomes an error and no figures are offered.
 */
@Injectable({ providedIn: 'root' })
export class RatesService {
  private readonly state = new BehaviorSubject<RatesState>({ status: 'loading' });

  readonly state$: Observable<RatesState> = this.state.asObservable();

  /**
   * The spoken name of as many currencies as can be named.
   *
   * The rate feed prices a hundred and sixty six currencies and names none of
   * them, so the names are fetched from the provider that publishes them and
   * laid over the ones the app already knows. A currency nobody names is still
   * tradeable, it is simply found by its code alone, so a failure here changes
   * nothing but the gloss beside a symbol.
   */
  readonly names$: Observable<Record<string, string>>;

  constructor(private readonly http: HttpClient) {
    this.names$ = this.http.get<Record<string, string>>(CURRENCY_NAMES_URL).pipe(
      map(readNames),
      catchError(() => of(CURRENCY_NAMES as Record<string, string>)),
      startWith(CURRENCY_NAMES as Record<string, string>),
      shareReplay({ bufferSize: 1, refCount: false })
    );
  }

  /** Fetch a fresh snapshot, replacing whatever the screen is currently showing. */
  refresh(): void {
    this.state.next({ status: 'loading' });

    this.http
      .get<ErApiResponse>(ER_API_URL)
      .pipe(
        map(readErApi),
        catchError(() =>
          this.http.get<FrankfurterResponse>(FRANKFURTER_URL).pipe(map(readFrankfurter))
        )
      )
      .subscribe({
        next: (snapshot) => this.state.next({ status: 'ready', snapshot }),
        error: () => this.state.next({ status: 'error', message: UNAVAILABLE }),
      });
  }
}
