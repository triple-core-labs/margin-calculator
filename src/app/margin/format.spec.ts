import {
  formatAmount,
  formatLots,
  formatMultiple,
  formatPips,
  formatPrice,
  formatUnits,
} from './format';

describe('formatAmount', () => {
  it('carries two decimals on a figure a trader reads to the cent', () => {
    expect(formatAmount(3600)).toBe('3,600.00');
    expect(formatAmount(10)).toBe('10.00');
    expect(formatAmount(116194.086)).toBe('116,194.09');
  });

  it('drops the cents once the figure passes a million, where they are noise', () => {
    expect(formatAmount(263605930.52)).toBe('263,605,931');
    expect(formatAmount(1000000)).toBe('1,000,000');
  });

  it('keeps the cents right up to the million', () => {
    expect(formatAmount(999999.99)).toBe('999,999.99');
  });
});

describe('formatPrice', () => {
  it('quotes a yen pair to three decimals and every other pair to five', () => {
    expect(formatPrice(210.885123, 'JPY')).toBe('210.885');
    expect(formatPrice(1.161943, 'USD')).toBe('1.16194');
  });
});

describe('formatUnits', () => {
  it('groups the contract size and never shows a fraction of a unit', () => {
    expect(formatUnits(1250000)).toBe('1,250,000');
    expect(formatUnits(100000)).toBe('100,000');
  });
});

describe('formatLots', () => {
  it('prints the size to the hundredth of a lot the broker steps in', () => {
    expect(formatLots(0.5)).toBe('0.50');
    expect(formatLots(0.66)).toBe('0.66');
    expect(formatLots(12)).toBe('12.00');
    expect(formatLots(1234.5)).toBe('1,234.50');
  });
});

describe('formatMultiple', () => {
  it('names the reward in what is being risked', () => {
    expect(formatMultiple(3)).toBe('3.00R');
    expect(formatMultiple(1.955)).toBe('1.96R');
  });
});

describe('formatPips', () => {
  it('keeps a whole pip count whole and shows a fraction only where there is one', () => {
    expect(formatPips(20)).toBe('20');
    expect(formatPips(15.5)).toBe('15.5');
    expect(formatPips(1234)).toBe('1,234');
    expect(formatPips(20.04)).toBe('20');
  });
});
