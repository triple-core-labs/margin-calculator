import { SelectOption, filterOptions, normalizeQuery, optionMatches, typeaheadIndex } from './option-filter';

const USD_JPY: SelectOption = {
  value: 'USD/JPY',
  label: 'USD/JPY',
  detail: 'US Dollar / Japanese Yen',
  terms: ['USD', 'JPY', 'US Dollar', 'Japanese Yen'],
};

const OPTIONS: SelectOption[] = [
  { value: 'EUR/USD', label: 'EUR/USD', detail: 'Euro / US Dollar', terms: ['EUR', 'USD', 'Euro', 'US Dollar'] },
  USD_JPY,
  { value: 'GBP/JPY', label: 'GBP/JPY', detail: 'British Pound / Japanese Yen', terms: ['GBP', 'JPY'] },
];

describe('normalizeQuery', () => {
  it('ignores case, slashes and spaces so a symbol can be typed any way round', () => {
    expect(normalizeQuery('usd/jpy')).toBe('usdjpy');
    expect(normalizeQuery('  USD JPY ')).toBe('usdjpy');
    expect(normalizeQuery('USDJPY')).toBe('usdjpy');
  });
});

describe('optionMatches', () => {
  it('finds a pair by its full symbol however it is punctuated', () => {
    expect(optionMatches(USD_JPY, 'USDJPY')).toBeTrue();
    expect(optionMatches(USD_JPY, 'usd/jpy')).toBeTrue();
  });

  it('finds a pair by either leg', () => {
    expect(optionMatches(USD_JPY, 'JPY')).toBeTrue();
    expect(optionMatches(USD_JPY, 'usd')).toBeTrue();
  });

  it('finds a pair by the spoken name of a leg', () => {
    expect(optionMatches(USD_JPY, 'yen')).toBeTrue();
    expect(optionMatches(USD_JPY, 'Dollar')).toBeTrue();
  });

  it('does not match a pair that shares neither leg nor name', () => {
    expect(optionMatches(USD_JPY, 'chf')).toBeFalse();
    expect(optionMatches(USD_JPY, 'franc')).toBeFalse();
  });

  it('treats an empty query as matching everything', () => {
    expect(optionMatches(USD_JPY, '')).toBeTrue();
    expect(optionMatches(USD_JPY, '   ')).toBeTrue();
  });
});

describe('filterOptions', () => {
  it('keeps only the matching options and their order', () => {
    expect(filterOptions(OPTIONS, 'jpy').map((o) => o.label)).toEqual(['USD/JPY', 'GBP/JPY']);
    expect(filterOptions(OPTIONS, 'yen').map((o) => o.label)).toEqual(['USD/JPY', 'GBP/JPY']);
    expect(filterOptions(OPTIONS, 'usd/jpy').map((o) => o.label)).toEqual(['USD/JPY']);
  });

  it('returns nothing when nothing matches', () => {
    expect(filterOptions(OPTIONS, 'zzz')).toEqual([]);
  });

  it('returns every option for a blank query', () => {
    expect(filterOptions(OPTIONS, '').length).toBe(OPTIONS.length);
  });
});

describe('typeaheadIndex', () => {
  const codes: SelectOption[] = [
    { value: 'USD', label: 'USD' },
    { value: 'EUR', label: 'EUR' },
    { value: 'GBP', label: 'GBP' },
    { value: 'JPY', label: 'JPY' },
  ];

  it('jumps to the next option starting with the letter', () => {
    expect(typeaheadIndex(codes, 'g', 0)).toBe(2);
  });

  it('wraps past the end of the list', () => {
    expect(typeaheadIndex(codes, 'e', 2)).toBe(1);
  });

  it('moves off the current option when several share a first letter', () => {
    const doubled: SelectOption[] = [
      { value: 'CAD', label: 'CAD' },
      { value: 'CHF', label: 'CHF' },
    ];
    expect(typeaheadIndex(doubled, 'c', 0)).toBe(1);
    expect(typeaheadIndex(doubled, 'c', 1)).toBe(0);
  });

  it('reports no match as minus one', () => {
    expect(typeaheadIndex(codes, 'z', 0)).toBe(-1);
  });

  it('matches a leverage ratio by the number rather than the colon', () => {
    const ratios: SelectOption[] = [
      { value: 30, label: '1:30', terms: ['30'] },
      { value: 500, label: '1:500', terms: ['500'] },
    ];
    expect(typeaheadIndex(ratios, '5', 0)).toBe(1);
  });
});

describe('filterOptions under a limit', () => {
  const many: SelectOption[] = Array.from({ length: 500 }, (_, i) => ({
    value: `P${i}`,
    label: `P${i}/USD`,
    terms: ['USD'],
  }));

  it('returns at most the number of rows asked for', () => {
    expect(filterOptions(many, '', 50).length).toBe(50);
    expect(filterOptions(many, 'usd', 50).length).toBe(50);
  });

  it('keeps the most prominent matches, which are the ones the catalogue lists first', () => {
    expect(filterOptions(many, '', 3).map((o) => o.label)).toEqual([
      'P0/USD',
      'P1/USD',
      'P2/USD',
    ]);
  });

  it('returns everything when fewer rows match than the limit allows', () => {
    expect(filterOptions(many, 'p499', 50).map((o) => o.label)).toEqual(['P499/USD']);
  });

  it('leaves the list whole when no limit is given', () => {
    expect(filterOptions(many, '').length).toBe(500);
  });
});
