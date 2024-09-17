import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { RatesService, CURRENCY_NAMES_URL, ER_API_URL, FRANKFURTER_URL } from './rates.service';
import { RatesState } from './rates';

const ER_API_PAYLOAD = {
  result: 'success',
  time_last_update_unix: Date.UTC(2026, 8, 4, 0, 2, 31) / 1000,
  time_next_update_unix: Date.UTC(2026, 8, 5, 0, 17, 1) / 1000,
  base_code: 'USD',
  rates: {
    USD: 1,
    EUR: 0.860629,
    GBP: 0.739834,
    JPY: 155.9,
    CHF: 0.808206,
    AUD: 1.389669,
    CAD: 1.379274,
    NZD: 1.702,
    SEK: 9.4,
  },
};

const FRANKFURTER_PAYLOAD = {
  amount: 1,
  base: 'EUR',
  date: '2026-09-03',
  rates: {
    AUD: 1.6147,
    CAD: 1.6019,
    CHF: 0.939,
    GBP: 0.86055,
    JPY: 181.21,
    NZD: 1.978,
    USD: 1.1615,
  },
};

describe('RatesService', () => {
  let service: RatesService;
  let http: HttpTestingController;
  let states: RatesState[];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(RatesService);
    http = TestBed.inject(HttpTestingController);
    states = [];
    service.state$.subscribe((state) => states.push(state));
  });

  afterEach(() => http.verify());

  it('starts loading before any rate has arrived', () => {
    expect(states[0].status).toBe('loading');
  });

  it('converts the primary feed into the dollar value of one unit of each currency', () => {
    service.refresh();
    http.expectOne(ER_API_URL).flush(ER_API_PAYLOAD);

    const state = states[states.length - 1];
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.snapshot.source).toBe('open.er-api.com');
    expect(state.snapshot.usdPerUnit['USD']).toBe(1);
    expect(state.snapshot.usdPerUnit['EUR']).toBeCloseTo(1 / 0.860629, 10);
    expect(state.snapshot.usdPerUnit['JPY']).toBeCloseTo(1 / 155.9, 10);
  });

  it('keeps the publication and next update times the primary feed reports', () => {
    service.refresh();
    http.expectOne(ER_API_URL).flush(ER_API_PAYLOAD);

    const state = states[states.length - 1];
    if (state.status !== 'ready') {
      fail('expected rates to be ready');
      return;
    }
    expect(state.snapshot.updatedAt.toISOString()).toBe('2026-09-04T00:02:31.000Z');
    expect(state.snapshot.nextUpdateAt?.toISOString()).toBe('2026-09-05T00:17:01.000Z');
  });

  it('falls back to the central bank feed when the primary request fails', () => {
    service.refresh();
    http.expectOne(ER_API_URL).error(new ProgressEvent('offline'));
    http.expectOne(FRANKFURTER_URL).flush(FRANKFURTER_PAYLOAD);

    const state = states[states.length - 1];
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.snapshot.source).toBe('api.frankfurter.dev');
    expect(state.snapshot.usdPerUnit['EUR']).toBeCloseTo(1.1615, 10);
    expect(state.snapshot.usdPerUnit['USD']).toBe(1);
    expect(state.snapshot.usdPerUnit['GBP']).toBeCloseTo(1.1615 / 0.86055, 10);
    expect(state.snapshot.updatedAt.toISOString()).toBe('2026-09-03T15:00:00.000Z');
  });

  it('marks the central bank set as dated by day, because it carries no publication time', () => {
    service.refresh();
    http.expectOne(ER_API_URL).error(new ProgressEvent('offline'));
    http.expectOne(FRANKFURTER_URL).flush(FRANKFURTER_PAYLOAD);

    const state = states[states.length - 1];
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.snapshot.datedByDay).toBeTrue();
  });

  it('leaves the primary set unmarked, because it publishes its own time', () => {
    service.refresh();
    http.expectOne(ER_API_URL).flush(ER_API_PAYLOAD);

    const state = states[states.length - 1];
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.snapshot.datedByDay).toBeFalsy();
  });

  it('falls back when the primary response is missing a currency the calculator needs', () => {
    const incomplete = {
      ...ER_API_PAYLOAD,
      rates: { ...ER_API_PAYLOAD.rates, NZD: undefined },
    };

    service.refresh();
    http.expectOne(ER_API_URL).flush(incomplete);
    http.expectOne(FRANKFURTER_URL).flush(FRANKFURTER_PAYLOAD);

    expect(states[states.length - 1].status).toBe('ready');
  });

  it('reports an error rather than any figure when both feeds fail', () => {
    service.refresh();
    http.expectOne(ER_API_URL).error(new ProgressEvent('offline'));
    http.expectOne(FRANKFURTER_URL).error(new ProgressEvent('offline'));

    const state = states[states.length - 1];
    expect(state.status).toBe('error');
    if (state.status !== 'error') return;
    expect(state.message).toContain('retry');
    expect(states.some((s) => s.status === 'ready')).toBeFalse();
  });

  it('returns to loading when a failed fetch is retried', () => {
    service.refresh();
    http.expectOne(ER_API_URL).error(new ProgressEvent('offline'));
    http.expectOne(FRANKFURTER_URL).error(new ProgressEvent('offline'));
    expect(states[states.length - 1].status).toBe('error');

    service.refresh();
    expect(states[states.length - 1].status).toBe('loading');
    http.expectOne(ER_API_URL).flush(ER_API_PAYLOAD);
    expect(states[states.length - 1].status).toBe('ready');
  });
});

describe('RatesService currency names', () => {
  let service: RatesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(RatesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('offers the names the app already knows before the provider has answered', () => {
    let names: Record<string, string> = {};
    service.names$.subscribe((published) => (names = published));

    expect(names['USD']).toBe('US Dollar');

    http.expectOne(CURRENCY_NAMES_URL).flush({ THB: 'Thai Baht' });
  });

  it('adds every name the provider publishes to the ones it already had', () => {
    const seen: Record<string, string>[] = [];
    service.names$.subscribe((published) => seen.push(published));

    http.expectOne(CURRENCY_NAMES_URL).flush({ THB: 'Thai Baht', PLN: 'Polish Zloty' });

    expect(seen.length).toBe(2);
    expect(seen[1]['THB']).toBe('Thai Baht');
    expect(seen[1]['PLN']).toBe('Polish Zloty');
    expect(seen[1]['USD']).toBe('US Dollar');
  });

  it('keeps the names it already had when the provider cannot be reached', () => {
    let names: Record<string, string> = {};
    service.names$.subscribe((published) => (names = published));

    http.expectOne(CURRENCY_NAMES_URL).error(new ProgressEvent('offline'));

    expect(names['USD']).toBe('US Dollar');
  });

  it('asks the provider once however many readers there are', () => {
    service.names$.subscribe();
    service.names$.subscribe();

    expect(http.match(CURRENCY_NAMES_URL).length).toBe(1);
  });

  it('ignores anything the provider sends that is not a name', () => {
    let names: Record<string, string> = {};
    service.names$.subscribe((published) => (names = published));

    http.expectOne(CURRENCY_NAMES_URL).flush({ THB: 'Thai Baht', XX: 'Short', ZZZ: 42 });

    expect(names['THB']).toBe('Thai Baht');
    expect(names['XX']).toBeUndefined();
    expect(names['ZZZ']).toBeUndefined();
  });
});
