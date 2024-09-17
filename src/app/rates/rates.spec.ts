import { describeRateAge, RateSnapshot, STALE_AFTER_MS } from './rates';

function snapshot(partial: Partial<RateSnapshot>): RateSnapshot {
  return {
    usdPerUnit: { USD: 1 },
    updatedAt: new Date('2026-09-04T00:00:00Z'),
    nextUpdateAt: new Date('2026-09-05T00:00:00Z'),
    source: 'open.er-api.com',
    ...partial,
  };
}

describe('describeRateAge', () => {
  it('reads a rate published minutes ago as fresh', () => {
    const age = describeRateAge(
      snapshot({}),
      new Date('2026-09-04T00:12:00Z')
    );

    expect(age.stale).toBeFalse();
    expect(age.ageMs).toBe(12 * 60 * 1000);
    expect(age.label).toBe('12 min ago');
  });

  it('rounds a rate published hours ago to whole hours', () => {
    const age = describeRateAge(
      snapshot({}),
      new Date('2026-09-04T04:40:00Z')
    );

    expect(age.label).toBe('4 h ago');
    expect(age.stale).toBeFalse();
  });

  it('goes stale once the provider is past its own next update time', () => {
    const age = describeRateAge(
      snapshot({}),
      new Date('2026-09-05T00:00:01Z')
    );

    expect(age.stale).toBeTrue();
  });

  it('goes stale after a day when the provider names no next update', () => {
    const fresh = describeRateAge(
      snapshot({ nextUpdateAt: null }),
      new Date('2026-09-04T20:00:00Z')
    );
    expect(fresh.stale).toBeFalse();

    const old = describeRateAge(
      snapshot({ nextUpdateAt: null }),
      new Date(new Date('2026-09-04T00:00:00Z').getTime() + STALE_AFTER_MS + 1)
    );
    expect(old.stale).toBeTrue();
    expect(old.label).toBe('1 d ago');
  });

  it('never reports a negative age when the clock disagrees with the provider', () => {
    const age = describeRateAge(
      snapshot({}),
      new Date('2026-09-03T22:00:00Z')
    );

    expect(age.ageMs).toBe(0);
    expect(age.label).toBe('just now');
  });
});

describe('describeRateAge on a set the provider dated by day only', () => {
  it('names the publication day rather than an age it had to infer', () => {
    const age = describeRateAge(
      snapshot({
        updatedAt: new Date('2026-09-03T15:00:00Z'),
        nextUpdateAt: new Date('2026-09-04T15:00:00Z'),
        source: 'api.frankfurter.dev',
        datedByDay: true,
      }),
      new Date('2026-09-04T04:40:00Z')
    );

    expect(age.label).toBe('dated 3 Sep');
  });

  it('still goes stale once the provider is past the update it promised', () => {
    const age = describeRateAge(
      snapshot({
        updatedAt: new Date('2026-09-03T15:00:00Z'),
        nextUpdateAt: new Date('2026-09-04T15:00:00Z'),
        source: 'api.frankfurter.dev',
        datedByDay: true,
      }),
      new Date('2026-09-04T15:00:01Z')
    );

    expect(age.stale).toBeTrue();
    expect(age.label).toBe('dated 3 Sep');
  });

  it('never reads as fresher than the day it carries, whatever hour is assumed', () => {
    const age = describeRateAge(
      snapshot({
        updatedAt: new Date('2026-09-03T15:00:00Z'),
        source: 'api.frankfurter.dev',
        datedByDay: true,
      }),
      new Date('2026-09-03T14:00:00Z')
    );

    expect(age.label).toBe('dated 3 Sep');
  });
});
