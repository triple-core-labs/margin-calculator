import {
  LOT_STEP,
  directionFromStop,
  floorToStep,
  levelFromPips,
  percentFromRisk,
  pipsFromLevel,
  riskFromPercent,
  sizePosition,
  SizingInput,
} from './size';

/** US dollar value of one unit of each currency, matching the hand worked example. */
const RATES: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  JPY: 0.0067,
  CHF: 1.12,
  AUD: 0.66,
  CAD: 0.74,
  NZD: 0.61,
};

/** The worked example: a long EUR/USD off a ten thousand dollar account risking one per cent. */
const WORKED: SizingInput = {
  base: 'EUR',
  quote: 'USD',
  account: 'USD',
  balance: 10000,
  riskAmount: 100,
  entry: 1.08,
  stop: 1.078,
  take: 1.086,
  leverage: 30,
};

function sized(overrides: Partial<SizingInput> = {}) {
  return sizePosition({ ...WORKED, ...overrides }, RATES);
}

describe('riskFromPercent and percentFromRisk', () => {
  it('turn a share of the balance into money and back again', () => {
    expect(riskFromPercent(10000, 1)).toBe(100);
    expect(riskFromPercent(10000, 2.5)).toBe(250);
    expect(percentFromRisk(10000, 250)).toBe(2.5);
  });

  it('leave the pair in step through a round trip', () => {
    expect(percentFromRisk(7350, riskFromPercent(7350, 1.75))).toBeCloseTo(1.75, 10);
  });

  it('report nothing rather than infinity when there is no balance to take a share of', () => {
    expect(percentFromRisk(0, 100)).toBeNull();
    expect(riskFromPercent(0, 1)).toBe(0);
  });
});

describe('levelFromPips and pipsFromLevel', () => {
  it('place a level a distance from the entry, on the side asked for', () => {
    expect(levelFromPips(1.08, 20, 0.0001, 'below')).toBeCloseTo(1.078, 10);
    expect(levelFromPips(1.08, 20, 0.0001, 'above')).toBeCloseTo(1.082, 10);
    expect(levelFromPips(156.2, 30, 0.01, 'below')).toBeCloseTo(155.9, 10);
  });

  it('measure the distance back out of a level, whichever side it sits', () => {
    expect(pipsFromLevel(1.08, 1.078, 0.0001)).toBeCloseTo(20, 8);
    expect(pipsFromLevel(1.08, 1.082, 0.0001)).toBeCloseTo(20, 8);
    expect(pipsFromLevel(156.2, 155.9, 0.01)).toBeCloseTo(30, 8);
  });
});

describe('directionFromStop', () => {
  it('reads a stop below the entry as a long and one above it as a short', () => {
    expect(directionFromStop(1.08, 1.078)).toBe('long');
    expect(directionFromStop(1.08, 1.082)).toBe('short');
  });

  it('reads a stop at the entry as no direction at all', () => {
    expect(directionFromStop(1.08, 1.08)).toBeNull();
  });
});

describe('floorToStep', () => {
  it('always rounds down, never to the nearest', () => {
    expect(floorToStep(0.6666666666, 0.01)).toBe(0.66);
    expect(floorToStep(0.599, 0.01)).toBe(0.59);
    expect(floorToStep(0.5978, 0.01)).toBe(0.59);
    expect(floorToStep(1.9999, 0.01)).toBe(1.99);
  });

  it('keeps a value that already sits on a step, however the binary arithmetic left it', () => {
    expect(floorToStep(0.3, 0.01)).toBe(0.3);
    expect(floorToStep(0.1 + 0.2, 0.01)).toBe(0.3);
    expect(floorToStep(29.999999999999996 / 100, 0.01)).toBe(0.3);
  });

  it('takes a value below the first step down to nothing', () => {
    expect(floorToStep(0.0099, 0.01)).toBe(0);
  });
});

describe('sizePosition', () => {
  it('matches the hand worked example', () => {
    const result = sized();

    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.direction).toBe('long');
    expect(result.pipSize).toBe(0.0001);
    expect(result.pipValuePerLot).toBeCloseTo(10, 8);
    expect(result.stopPips).toBeCloseTo(20, 8);
    expect(result.takePips).toBeCloseTo(60, 8);
    expect(result.lots).toBe(0.5);
    expect(result.moneyAtRisk).toBeCloseTo(100, 6);
    expect(result.requiredMargin).toBeCloseTo(1800, 6);
    expect(result.reward).toBeCloseTo(300, 6);
    expect(result.rMultiple).toBeCloseTo(3, 8);
    expect(result.pipValue).toBeCloseTo(5, 8);
    expect(result.units).toBe(50000);
    expect(result.positionValue).toBeCloseTo(54000, 6);
  });

  it('rounds the lot size down to the broker step and never up', () => {
    const result = sized({ stop: 1.0785 });

    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.stopPips).toBeCloseTo(15, 8);
    expect(result.lotsExact).toBeCloseTo(2 / 3, 8);
    expect(result.lots).toBe(0.66);
    expect(result.moneyAtRisk).toBeCloseTo(99, 6);
  });

  it('never puts more at risk than was asked for, whatever the stop distance', () => {
    for (let pips = 3; pips <= 97; pips += 1) {
      const result = sized({ stop: 1.08 - pips * 0.0001, riskAmount: 137.5 });
      expect(result.ok).withContext(`${pips} pips`).toBeTrue();
      if (!result.ok) continue;

      expect(result.moneyAtRisk).withContext(`${pips} pips`).toBeLessThanOrEqual(137.5 + 1e-9);
      const nextStep = result.lots + LOT_STEP;
      expect(nextStep * result.stopPips * result.pipValuePerLot)
        .withContext(`${pips} pips`)
        .toBeGreaterThan(137.5);
    }
  });

  it('rounds down even when the exact size sits nearer the step above', () => {
    const result = sized({ riskAmount: 137.5, stop: 1.08 - 23 * 0.0001 });

    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.lotsExact).toBeGreaterThan(0.595);
    expect(result.lots).toBe(0.59);
    expect(result.moneyAtRisk).toBeCloseTo(135.7, 6);
  });

  it('prices the notional from the entry the trader gave rather than from the feed', () => {
    const low = sized({ entry: 1.08, stop: 1.0785, take: 1.086 });
    const high = sized({ entry: 2, stop: 1.9985, take: 2.006 });

    expect(low.ok).toBeTrue();
    expect(high.ok).toBeTrue();
    if (!low.ok || !high.ok) return;

    expect(low.stopPips).toBeCloseTo(15, 6);
    expect(high.stopPips).toBeCloseTo(15, 6);
    expect(high.lots).toBe(low.lots);

    expect(low.positionValue).toBeCloseTo(low.units * 1.08, 6);
    expect(high.positionValue).toBeCloseTo(high.units * 2, 6);
    expect(low.requiredMargin).toBeCloseTo(2376, 6);
    expect(high.requiredMargin).toBeCloseTo(4400, 6);
  });

  it('leaves the pip value alone when only the entry moves, because no base leg enters it', () => {
    const low = sized({ entry: 1.08, stop: 1.0785, take: 1.086 });
    const high = sized({ entry: 2, stop: 1.9985, take: 2.006 });

    expect(low.ok).toBeTrue();
    expect(high.ok).toBeTrue();
    if (!low.ok || !high.ok) return;

    expect(high.pipValuePerLot).toBeCloseTo(low.pipValuePerLot, 10);
    expect(high.pipValue).toBeCloseTo(low.pipValue, 10);
    expect(high.moneyAtRisk).toBeCloseTo(low.moneyAtRisk, 10);
  });

  it('takes the notional as the entry itself when the account currency is the quote currency', () => {
    const result = sized({ entry: 1.0925, stop: 1.0905, take: 1.0985 });

    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.positionValue).toBeCloseTo(result.units * 1.0925, 6);
  });

  it('carries the quote leg into an account currency the pair does not touch', () => {
    const result = sizePosition(
      {
        base: 'EUR',
        quote: 'USD',
        account: 'GBP',
        balance: 10000,
        riskAmount: 100,
        entry: 1.08,
        stop: 1.078,
        take: 1.086,
        leverage: 30,
      },
      RATES
    );

    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.positionValue).toBeCloseTo(result.units * 1.08 * (1 / 1.27), 6);
    expect(result.pipValuePerLot).toBeCloseTo(0.0001 * 100000 * (1 / 1.27), 10);
  });

  it('reads a stop above the entry as a short and takes the profit below it', () => {
    const result = sized({ stop: 1.082, take: 1.074 });

    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.direction).toBe('short');
    expect(result.stopPips).toBeCloseTo(20, 8);
    expect(result.takePips).toBeCloseTo(60, 8);
    expect(result.rMultiple).toBeCloseTo(3, 8);
  });

  it('prices the pip in the quote currency of a yen pair, at a hundredth', () => {
    const result = sizePosition(
      {
        base: 'USD',
        quote: 'JPY',
        account: 'USD',
        balance: 10000,
        riskAmount: 100,
        entry: 150,
        stop: 149.7,
        take: 150.6,
        leverage: 30,
      },
      RATES
    );

    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.pipSize).toBe(0.01);
    expect(result.pipValuePerLot).toBeCloseTo(0.01 * 100000 * 0.0067, 8);
    expect(result.stopPips).toBeCloseTo(30, 6);
    expect(result.lots).toBe(floorToStep(100 / (30 * 6.7), 0.01));
  });

  it('expresses every figure in a non dollar account currency', () => {
    const result = sized({ account: 'EUR', riskAmount: 108 });

    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.pipValuePerLot).toBeCloseTo(10 / 1.08, 8);
    expect(result.lots).toBe(floorToStep(108 / (20 * (10 / 1.08)), 0.01));
    expect(result.requiredMargin).toBeCloseTo((result.lots * 100000 * 1.08) / 1.08 / 30, 6);
  });

  it('leaves the reward unanswered when no take is given', () => {
    const result = sized({ take: null });

    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.takePips).toBeNull();
    expect(result.reward).toBeNull();
    expect(result.rMultiple).toBeNull();
    expect(result.lots).toBe(0.5);
  });

  it('refuses a stop sitting on the entry rather than guessing a size', () => {
    const result = sized({ stop: 1.08 });

    expect(result.ok).toBeFalse();
    if (result.ok) return;
    expect(result.reason).toBe('stop');
  });

  it('refuses a take on the same side of the entry as the stop', () => {
    const below = sized({ stop: 1.078, take: 1.077 });
    expect(below.ok).toBeFalse();
    if (!below.ok) expect(below.reason).toBe('take');

    const above = sized({ stop: 1.082, take: 1.083 });
    expect(above.ok).toBeFalse();
    if (!above.ok) expect(above.reason).toBe('take');

    const flat = sized({ take: 1.08 });
    expect(flat.ok).toBeFalse();
    if (!flat.ok) expect(flat.reason).toBe('take');
  });

  it('refuses a size the broker would not accept and says what the stop would cost', () => {
    const result = sized({ balance: 100, riskAmount: 0.5 });

    expect(result.ok).toBeFalse();
    if (result.ok) return;
    expect(result.reason).toBe('below-minimum');
    expect(result.minimumRisk).toBeCloseTo(2, 6);
  });

  it('refuses an account balance, a risk or a leverage that cannot be acted on', () => {
    const noBalance = sized({ balance: 0 });
    expect(noBalance.ok).toBeFalse();
    if (!noBalance.ok) expect(noBalance.reason).toBe('balance');

    const noRisk = sized({ riskAmount: 0 });
    expect(noRisk.ok).toBeFalse();
    if (!noRisk.ok) expect(noRisk.reason).toBe('risk');

    const overRisk = sized({ riskAmount: 20000 });
    expect(overRisk.ok).toBeFalse();
    if (!overRisk.ok) expect(overRisk.reason).toBe('risk');

    const noLeverage = sized({ leverage: 0 });
    expect(noLeverage.ok).toBeFalse();
    if (!noLeverage.ok) expect(noLeverage.reason).toBe('leverage');
  });

  it('refuses an entry price that is not a price', () => {
    const result = sized({ entry: 0 });

    expect(result.ok).toBeFalse();
    if (result.ok) return;
    expect(result.reason).toBe('entry');
  });

  it('refuses a pair the rate table cannot price', () => {
    const result = sizePosition({ ...WORKED, quote: 'MXN' }, RATES);

    expect(result.ok).toBeFalse();
    if (result.ok) return;
    expect(result.reason).toBe('rate');
  });
});

describe('sizePosition against the hand worked example', () => {
  it('gives one lot of EUR/USD at 1:30 on a dollar account 108,000 notional, 3,600 margin and 10 a pip', () => {
    const result = sized({ riskAmount: 200 });

    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.lots).toBe(1);
    expect(result.units).toBe(100000);
    expect(result.positionValue).toBeCloseTo(108000, 6);
    expect(result.requiredMargin).toBeCloseTo(3600, 6);
    expect(result.pipValue).toBeCloseTo(10, 6);
  });

  it('prices a cross that never touches the dollar from both legs', () => {
    const result = sizePosition(
      {
        base: 'EUR',
        quote: 'GBP',
        account: 'USD',
        balance: 100000,
        riskAmount: 20 * 0.0001 * 100000 * 1.27,
        entry: 1.08 / 1.27,
        stop: 1.08 / 1.27 - 20 * 0.0001,
        take: null,
        leverage: 20,
      },
      RATES
    );

    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.lots).toBe(1);
    expect(result.pipValue).toBeCloseTo(12.7, 6);
    expect(result.positionValue).toBeCloseTo(108000, 6);
    expect(result.requiredMargin).toBeCloseTo(5400, 6);
  });
});

describe('the reward measured in what the trade actually risks', () => {
  it('reads the reward against the risk the rounded size takes, not the risk asked for', () => {
    const result = sized({ stop: 1.0785, take: 1.086 });

    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.lots).toBe(0.66);
    expect(result.moneyAtRisk).toBeCloseTo(99, 6);
    expect(result.reward).toBeCloseTo(396, 6);
    expect(result.rMultiple).toBeCloseTo(4, 8);
  });

  it('agrees with the distances it is glossed by, whatever the rounding did', () => {
    for (let pips = 3; pips <= 97; pips += 1) {
      const result = sized({ stop: 1.08 - pips * 0.0001, take: 1.08 + 2 * pips * 0.0001 });
      expect(result.ok).withContext(`${pips} pips`).toBeTrue();
      if (!result.ok || result.rMultiple === null || result.takePips === null) continue;

      expect(result.rMultiple)
        .withContext(`${pips} pips`)
        .toBeCloseTo(result.takePips / result.stopPips, 8);
    }
  });
});

describe('a size the account cannot post the margin for', () => {
  it('says so when the margin the size locks is larger than the whole balance', () => {
    const result = sized({ stop: 1.0798 });

    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.lots).toBe(5);
    expect(result.requiredMargin).toBeCloseTo(18000, 6);
    expect(result.marginExceedsBalance).toBeTrue();
  });

  it('stays quiet when the balance covers the margin', () => {
    const result = sized();

    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.requiredMargin).toBeCloseTo(1800, 6);
    expect(result.marginExceedsBalance).toBeFalse();
  });

  it('stays quiet when the margin comes to exactly the balance', () => {
    const result = sized({ balance: 18000, riskAmount: 100, stop: 1.0798 });

    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.requiredMargin).toBeCloseTo(18000, 6);
    expect(result.marginExceedsBalance).toBeFalse();
  });
});

describe('sizePosition on a pair quoted in a hundredth pip currency', () => {
  it('takes the notional through the quote leg of a yen pair', () => {
    const result = sizePosition(
      {
        base: 'USD',
        quote: 'JPY',
        account: 'USD',
        balance: 100000,
        riskAmount: 201,
        entry: 1 / 0.0067,
        stop: 1 / 0.0067 - 0.3,
        take: null,
        leverage: 100,
      },
      RATES
    );

    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.lots).toBe(1);
    expect(result.pipValue).toBeCloseTo(6.7, 6);
    expect(result.positionValue).toBeCloseTo(100000, 6);
    expect(result.requiredMargin).toBeCloseTo(1000, 6);
  });

  it('prices the pip of a forint quoted cross in the quote currency', () => {
    const result = sizePosition(
      {
        base: 'EUR',
        quote: 'HUF',
        account: 'USD',
        balance: 100000,
        riskAmount: 81,
        entry: 400,
        stop: 399.7,
        take: null,
        leverage: 30,
      },
      { ...RATES, HUF: 0.0027 }
    );

    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.pipSize).toBe(0.01);
    expect(result.pipValuePerLot).toBeCloseTo(0.01 * 100000 * 0.0027, 8);
    expect(result.stopPips).toBeCloseTo(30, 6);
    expect(result.lots).toBe(1);
    expect(result.positionValue).toBeCloseTo(100000 * 400 * 0.0027, 6);
  });
});

describe('an entry that cannot belong to the pair it was typed against', () => {
  it('says so when the entry sits an order of magnitude off the fetched cross rate', () => {
    const result = sizePosition(
      {
        base: 'USD',
        quote: 'KRW',
        account: 'USD',
        balance: 10000,
        riskAmount: 100,
        entry: 1.3573,
        stop: 1.35,
        take: null,
        leverage: 30,
      },
      { ...RATES, KRW: 1 / 1357.3 }
    );

    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.entryFarFromRate).toBeTrue();
  });

  it('stays quiet on an entry the trader moved off the daily rate towards a live quote', () => {
    const moved = sized({ entry: 1.0925, stop: 1.0905, take: 1.0985 });

    expect(moved.ok).toBeTrue();
    if (!moved.ok) return;
    expect(moved.entryFarFromRate).toBeFalse();
  });

  it('stays quiet across the whole band a day of trading could move a price through', () => {
    for (const factor of [0.11, 0.5, 0.9, 1, 1.1, 2, 9]) {
      const entry = 1.08 * factor;
      const result = sized({ entry, stop: entry * 0.99, take: null });
      expect(result.ok).withContext(`${factor}`).toBeTrue();
      if (!result.ok) continue;
      expect(result.entryFarFromRate).withContext(`${factor}`).toBeFalse();
    }
  });

  it('says so when the entry is a thousand times the rate as well as a thousandth of it', () => {
    const high = sized({ entry: 1080, stop: 1079.998, take: null });
    const low = sized({ entry: 0.00108, stop: 0.00107, take: null });

    expect(high.ok).toBeTrue();
    expect(low.ok).toBeTrue();
    if (!high.ok || !low.ok) return;
    expect(high.entryFarFromRate).toBeTrue();
    expect(low.entryFarFromRate).toBeTrue();
  });
});
