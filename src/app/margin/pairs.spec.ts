import { MAJOR_PAIRS, QUOTE_ORDER, buildPairs, orientPair, priceablePairs } from './pairs';

/** A feed of the size the primary endpoint actually returns. */
function feedCodes(count: number): string[] {
  const codes = [...QUOTE_ORDER, 'SEK', 'NOK', 'DKK', 'PLN', 'HUF', 'CZK', 'TRY', 'ZAR', 'MXN'];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let index = 0;
  while (codes.length < count) {
    const code = `X${letters[Math.floor(index / 26)]}${letters[index % 26]}`;
    if (!codes.includes(code)) {
      codes.push(code);
    }
    index += 1;
  }
  return codes.slice(0, count);
}

function rateTable(codes: readonly string[]): Record<string, number> {
  const rates: Record<string, number> = {};
  for (const code of codes) {
    rates[code] = 1;
  }
  return rates;
}

describe('orientPair', () => {
  it('names the pair in the conventional quoting order, whichever way round it is asked', () => {
    expect(orientPair('USD', 'EUR').label).toBe('EUR/USD');
    expect(orientPair('EUR', 'USD').label).toBe('EUR/USD');
    expect(orientPair('JPY', 'USD').label).toBe('USD/JPY');
    expect(orientPair('CHF', 'USD').label).toBe('USD/CHF');
    expect(orientPair('CAD', 'USD').label).toBe('USD/CAD');
    expect(orientPair('GBP', 'EUR').label).toBe('EUR/GBP');
    expect(orientPair('JPY', 'GBP').label).toBe('GBP/JPY');
    expect(orientPair('NZD', 'AUD').label).toBe('AUD/NZD');
  });

  it('takes the conventional currency as the base of an exotic pair', () => {
    expect(orientPair('TRY', 'USD').label).toBe('USD/TRY');
    expect(orientPair('SEK', 'EUR').label).toBe('EUR/SEK');
    expect(orientPair('ZAR', 'GBP').label).toBe('GBP/ZAR');
  });

  it('orders two currencies the convention does not rank by their code, either way round', () => {
    expect(orientPair('THB', 'AED').label).toBe('AED/THB');
    expect(orientPair('AED', 'THB').label).toBe('AED/THB');
  });

  it('labels a pair as its base over its quote', () => {
    const pair = orientPair('USD', 'JPY');
    expect(pair.base).toBe('USD');
    expect(pair.quote).toBe('JPY');
    expect(pair.label).toBe('USD/JPY');
  });
});

describe('the majors', () => {
  it('are the seven currencies of the convention against the dollar', () => {
    expect(MAJOR_PAIRS.map((p) => p.label)).toEqual([
      'EUR/USD',
      'GBP/USD',
      'AUD/USD',
      'NZD/USD',
      'USD/CAD',
      'USD/CHF',
      'USD/JPY',
    ]);
  });
});

describe('buildPairs', () => {
  it('takes every combination of the fetched currencies exactly once', () => {
    const pairs = buildPairs(['EUR', 'USD', 'JPY']);

    expect(pairs.map((p) => p.label).sort()).toEqual(['EUR/JPY', 'EUR/USD', 'USD/JPY']);
  });

  it('builds the whole market the primary feed can price', () => {
    const codes = feedCodes(166);

    expect(buildPairs(codes).length).toBe((166 * 165) / 2);
  });

  it('never pairs a currency with itself and never repeats a symbol', () => {
    const pairs = buildPairs(feedCodes(60));
    const labels = new Set<string>();

    for (const pair of pairs) {
      expect(pair.base).not.toBe(pair.quote);
      expect(labels.has(pair.label)).withContext(pair.label).toBeFalse();
      labels.add(pair.label);
    }
  });

  it('ignores a code the feed repeats and anything that is not a currency code', () => {
    const pairs = buildPairs(['EUR', 'USD', 'EUR', '', 'usd']);

    expect(pairs.map((p) => p.label)).toEqual(['EUR/USD']);
  });

  it('ranks the seven majors ahead of everything else, in the order the convention names them', () => {
    const pairs = buildPairs(feedCodes(166));

    expect(pairs.slice(0, 7).map((p) => p.label)).toEqual(MAJOR_PAIRS.map((p) => p.label));
  });

  it('ranks the crosses of the convention currencies ahead of any pair with an exotic leg', () => {
    const pairs = buildPairs(feedCodes(166));
    const core = new Set<string>(QUOTE_ORDER);
    const crossCount = (QUOTE_ORDER.length * (QUOTE_ORDER.length - 1)) / 2;

    for (const pair of pairs.slice(0, crossCount)) {
      expect(core.has(pair.base) && core.has(pair.quote))
        .withContext(pair.label)
        .toBeTrue();
    }
    expect(pairs.slice(crossCount).every((p) => !core.has(p.base) || !core.has(p.quote))).toBeTrue();
  });

  it('quotes an exotic against the dollar before any other anchor', () => {
    const pairs = buildPairs(feedCodes(166)).map((p) => p.label);

    expect(pairs.indexOf('USD/TRY')).toBeLessThan(pairs.indexOf('EUR/TRY'));
    expect(pairs.indexOf('EUR/TRY')).toBeLessThan(pairs.indexOf('GBP/TRY'));
  });

  it('ranks a pair with one anchored leg ahead of a pair with neither', () => {
    const pairs = buildPairs(feedCodes(166)).map((p) => p.label);
    const anchored = pairs.findIndex((label) => label === 'USD/ZAR');
    const orphan = pairs.findIndex((label) => label.startsWith('X') && label.includes('/X'));

    expect(anchored).toBeGreaterThan(-1);
    expect(orphan).toBeGreaterThan(anchored);
  });

  it('is stable, so the same feed always produces the same list', () => {
    const codes = feedCodes(40);

    expect(buildPairs(codes).map((p) => p.label)).toEqual(
      buildPairs([...codes].reverse()).map((p) => p.label)
    );
  });
});

describe('priceablePairs', () => {
  it('drops a pair the feed cannot price on either leg', () => {
    const pairs = buildPairs(['EUR', 'USD', 'JPY', 'CHF']);
    const priceable = priceablePairs(pairs, { USD: 1, EUR: 1.08, JPY: 0.0064 });

    expect(priceable.some((p) => p.label.includes('CHF'))).toBeFalse();
    expect(priceable.map((p) => p.label).sort()).toEqual(['EUR/JPY', 'EUR/USD', 'USD/JPY']);
  });

  it('rejects a leg the feed carries as an unusable number', () => {
    const pairs = buildPairs(['EUR', 'USD', 'GBP']);

    expect(priceablePairs(pairs, { USD: 1, EUR: 0, GBP: Number.NaN })).toEqual([]);
  });

  it('keeps every pair when the feed covers all of them', () => {
    const codes = feedCodes(30);
    const pairs = buildPairs(codes);

    expect(priceablePairs(pairs, rateTable(codes)).length).toBe(pairs.length);
  });
});
