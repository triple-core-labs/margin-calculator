import { pipSizeFor, priceDecimalsFor, CONTRACT_SIZE, HUNDREDTH_PIP_QUOTES } from './margin';

describe('pipSizeFor', () => {
  it('is a hundredth for every currency quoted to two or three decimals', () => {
    expect(pipSizeFor('JPY')).toBe(0.01);
    expect(pipSizeFor('HUF')).toBe(0.01);
  });

  it('names the hundredth bucket as exactly the yen and the forint', () => {
    expect([...HUNDREDTH_PIP_QUOTES].sort()).toEqual(['HUF', 'JPY']);
  });

  it('is a ten thousandth for every other quote currency the calculator offers', () => {
    for (const code of [
      'USD',
      'EUR',
      'GBP',
      'CHF',
      'CAD',
      'AUD',
      'NZD',
      'SEK',
      'NOK',
      'DKK',
      'PLN',
      'CZK',
      'TRY',
      'ZAR',
      'MXN',
      'SGD',
      'HKD',
      'CNH',
    ]) {
      expect(pipSizeFor(code)).withContext(code).toBe(0.0001);
    }
  });

  it('reads the quote currency and not the base, so the forint is only special as a quote', () => {
    expect(pipSizeFor('HUF')).toBe(0.01);
    expect(pipSizeFor('USD')).toBe(0.0001);
  });
});

describe('priceDecimalsFor', () => {
  it('quotes the hundredth pip currencies to three decimals', () => {
    expect(priceDecimalsFor('JPY')).toBe(3);
    expect(priceDecimalsFor('HUF')).toBe(3);
  });

  it('quotes every other currency to five decimals', () => {
    expect(priceDecimalsFor('USD')).toBe(5);
    expect(priceDecimalsFor('CZK')).toBe(5);
    expect(priceDecimalsFor('SEK')).toBe(5);
  });
});

describe('CONTRACT_SIZE', () => {
  it('is the hundred thousand units of the base currency a standard lot carries', () => {
    expect(CONTRACT_SIZE).toBe(100000);
  });
});
