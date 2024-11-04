import { decimalsOf, formatDecimal, parseDecimal, stepValue } from './decimal';

describe('parseDecimal', () => {
  it('reads a plain number', () => {
    expect(parseDecimal('1.08')).toBe(1.08);
    expect(parseDecimal('210.885')).toBe(210.885);
    expect(parseDecimal('10000')).toBe(10000);
    expect(parseDecimal('0')).toBe(0);
  });

  it('reads a comma as the decimal separator, because that is what half the world types', () => {
    expect(parseDecimal('1,08')).toBe(1.08);
    expect(parseDecimal('210,885')).toBe(210.885);
  });

  it('reads a figure copied off the ticket, where the two are used together', () => {
    expect(parseDecimal('58,097.04')).toBe(58097.04);
    expect(parseDecimal('1,250,000.50')).toBe(1250000.5);
    expect(parseDecimal('58.097,04')).toBe(58097.04);
  });

  it('reads a repeated separator as grouping rather than as a decimal point', () => {
    expect(parseDecimal('1,250,000')).toBe(1250000);
    expect(parseDecimal('1.250.000')).toBe(1250000);
  });

  it('ignores the spacing a figure may be pasted with', () => {
    expect(parseDecimal(' 1 250 000.50 ')).toBe(1250000.5);
    expect(parseDecimal("1'250'000.50")).toBe(1250000.5);
  });

  it('reads a sign', () => {
    expect(parseDecimal('-2.5')).toBe(-2.5);
    expect(parseDecimal('+2.5')).toBe(2.5);
  });

  it('reads nothing out of an empty or unfinished field', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('   ')).toBeNull();
    expect(parseDecimal('.')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
  });

  it('reads a number out of a field still being typed into', () => {
    expect(parseDecimal('1.')).toBe(1);
    expect(parseDecimal('.5')).toBe(0.5);
    expect(parseDecimal(',5')).toBe(0.5);
  });
});

describe('formatDecimal', () => {
  it('writes a number the one way the ticket reads numbers', () => {
    expect(formatDecimal(1.08)).toBe('1.08');
    expect(formatDecimal(210.885)).toBe('210.885');
    expect(formatDecimal(10000)).toBe('10000');
    expect(formatDecimal(0)).toBe('0');
  });

  it('writes nothing for a field with no value', () => {
    expect(formatDecimal(null)).toBe('');
    expect(formatDecimal(Number.NaN)).toBe('');
  });

  it('never falls back on exponent notation for a small price', () => {
    expect(formatDecimal(0.00001)).toBe('0.00001');
    expect(formatDecimal(0.0000001)).toBe('0.0000001');
  });
});

describe('decimalsOf and stepValue', () => {
  it('counts the decimals a step moves in', () => {
    expect(decimalsOf(1)).toBe(0);
    expect(decimalsOf(0.1)).toBe(1);
    expect(decimalsOf(0.00001)).toBe(5);
  });

  it('steps a value up and down without leaving binary dust behind', () => {
    expect(stepValue(1.08, 0.00001, 1)).toBe(1.08001);
    expect(stepValue(1.08, 0.00001, -1)).toBe(1.07999);
    expect(stepValue(20, 0.1, 1)).toBe(20.1);
    expect(stepValue(0.3, 0.1, -1)).toBe(0.2);
  });

  it('starts from nothing when the field is empty', () => {
    expect(stepValue(null, 0.1, 1)).toBe(0.1);
  });
});

describe('parseDecimal on a separator pattern that is neither', () => {
  it('refuses a repeated separator whose groups are not groups of three', () => {
    expect(parseDecimal('1.08.09')).toBeNull();
    expect(parseDecimal('1,08,09')).toBeNull();
    expect(parseDecimal('1.250.00')).toBeNull();
    expect(parseDecimal('12.34.567')).toBeNull();
  });

  it('refuses a mixed pair whose grouping is not grouping', () => {
    expect(parseDecimal('1,08.09')).toBeNull();
    expect(parseDecimal('1234,56.78')).toBeNull();
    expect(parseDecimal('1,2345.67')).toBeNull();
  });

  it('still reads every grouping a figure is really written with', () => {
    expect(parseDecimal('1,250,000')).toBe(1250000);
    expect(parseDecimal('1.250.000')).toBe(1250000);
    expect(parseDecimal('58,097.04')).toBe(58097.04);
    expect(parseDecimal('58.097,04')).toBe(58097.04);
    expect(parseDecimal('-1.250.000')).toBe(-1250000);
    expect(parseDecimal('999,999,999.99')).toBe(999999999.99);
  });
});
