import { CONTRACT_SIZE, pipSizeFor } from './margin';

/**
 * The smallest change in size a retail broker accepts, one micro lot.
 *
 * Every size the calculator answers with is a whole number of these.
 */
export const LOT_STEP = 0.01;

/** Which way the trade is read, taken from the side the stop sits. */
export type Direction = 'long' | 'short';

/** Which side of the entry a level is placed on. */
export type Side = 'above' | 'below';

/** Everything the arithmetic needs to answer with a size. */
export interface SizingInput {
  base: string;
  quote: string;
  account: string;
  /** The whole account, in the account currency. */
  balance: number;
  /** What the trader is prepared to lose on this trade, in the account currency. */
  riskAmount: number;
  entry: number;
  stop: number;
  /** Where the trade is closed in profit, or nothing if the trader has not said. */
  take: number | null;
  leverage: number;
}

/** The size to type into the terminal, and everything that follows from it. */
export interface SizingFigures {
  ok: true;
  direction: Direction;
  pipSize: number;
  /** What one pip is worth on one standard lot, in the account currency. */
  pipValuePerLot: number;
  stopPips: number;
  takePips: number | null;
  /** The size a broker will accept, rounded down to the lot step. */
  lots: number;
  /** The size before it was rounded down, which is never what a trader types. */
  lotsExact: number;
  /** What the trader asked to risk. */
  riskRequested: number;
  /** What the rounded size actually risks, which is never more than was asked. */
  moneyAtRisk: number;
  reward: number | null;
  /** The reward measured in what the size being taken actually risks. */
  rMultiple: number | null;
  requiredMargin: number;
  /**
   * Whether the margin this size locks is larger than the whole account.
   *
   * A broker refuses an order it cannot lock the margin for, so a size that
   * needs more than the balance is a size that cannot be entered, however
   * correctly it answers the risk that was asked for.
   */
  marginExceedsBalance: boolean;
  /**
   * Whether the entry is too far from the fetched cross rate to be a price of
   * this pair at all.
   *
   * The entry is the trader's to overwrite and the feed publishes once a day,
   * so any ordinary disagreement between the two is expected and says nothing.
   * A disagreement of an order of magnitude is a different thing: a price that
   * far out is a decimal that landed in the wrong place, and it leaves the
   * margin and the money at risk looking right while the size is out by the
   * same factor.
   */
  entryFarFromRate: boolean;
  /** What one pip is worth on the size being taken. */
  pipValue: number;
  units: number;
  positionValue: number;
}

/** Why no size could be given. */
export type SizingReason =
  | 'balance'
  | 'risk'
  | 'leverage'
  | 'entry'
  | 'rate'
  | 'stop'
  | 'take'
  | 'below-minimum';

export interface SizingRejected {
  ok: false;
  reason: SizingReason;
  /** For a size below the minimum, what one micro lot on this stop would cost. */
  minimumRisk?: number;
}

export type SizingResult = SizingFigures | SizingRejected;

function usdValue(rates: Record<string, number>, code: string): number | null {
  const rate = rates[code];
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null;
}

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** The money a share of the balance comes to. */
export function riskFromPercent(balance: number, percent: number): number {
  return (balance * percent) / 100;
}

/**
 * The share of the balance a sum of money comes to, or nothing when there is no
 * balance to take a share of.
 */
export function percentFromRisk(balance: number, amount: number): number | null {
  return positive(balance) ? (amount / balance) * 100 : null;
}

/** The price a given number of pips from the entry, on the side asked for. */
export function levelFromPips(
  entry: number,
  pips: number,
  pipSize: number,
  side: Side
): number {
  return entry + (side === 'above' ? 1 : -1) * pips * pipSize;
}

/** How many pips a level sits from the entry, whichever side it sits. */
export function pipsFromLevel(entry: number, level: number, pipSize: number): number {
  return Math.abs(level - entry) / pipSize;
}

/**
 * Which way a trade is read. A stop below the entry protects a long and a stop
 * above it protects a short; a stop on the entry says nothing at all.
 */
export function directionFromStop(entry: number, stop: number): Direction | null {
  if (stop < entry) {
    return 'long';
  }
  if (stop > entry) {
    return 'short';
  }
  return null;
}

/**
 * How far the entry may sit from the fetched cross rate before it stops being a
 * price of that pair.
 *
 * A daily reference rate and a live quote differ by fractions of a per cent, and
 * even a currency in trouble does not move a tenth of its value between two
 * publications. An order of magnitude is therefore never a market move and
 * always a misread price.
 */
const ENTRY_SANITY_FACTOR = 10;

/** How near a value has to be to a step before it counts as sitting on it. */
const STEP_TOLERANCE = 1e-9;

/**
 * The largest whole number of steps that fits inside a value.
 *
 * Rounding is downwards and never to the nearest, because the step above puts
 * more at risk than the trader asked for. A value that binary arithmetic has
 * left a hair under a step still counts as sitting on it: the tolerance is far
 * smaller than a step and far larger than the error a division leaves behind.
 */
export function floorToStep(value: number, step: number): number {
  const steps = value / step;
  const nearest = Math.round(steps);
  const whole = Math.abs(steps - nearest) < STEP_TOLERANCE ? nearest : Math.floor(steps);
  return whole / (1 / step);
}

/** Whether a price sits outside the band around the rate a market move can reach. */
function farFromRate(entry: number, rate: number): boolean {
  return entry > rate * ENTRY_SANITY_FACTOR || entry < rate / ENTRY_SANITY_FACTOR;
}

/**
 * Answer a trade idea with the size to type into the terminal.
 *
 * The stop distance and the value of a pip decide the size: risking a fixed sum
 * over a known distance is a division, and the only subtlety is which way the
 * answer is rounded. It is rounded down, so the size taken risks at most what
 * was asked. Everything else follows from that size: the margin the broker
 * locks, what the position makes if the take is reached, and how that compares
 * with what is being risked.
 *
 * The notional is priced at the entry rather than at the fetched rate. The entry
 * is the base against quote leg of the trade, and the trader may have overwritten
 * it because the feed publishes once a day while they are reading a live quote;
 * a margin taken from the feed would then belong to a different price from the
 * size beside it. The feed is still needed for the second leg, carrying the quote
 * currency into the account currency, which collapses to one when the account
 * currency is the quote currency. The base leg's own rate refuses a pair the
 * feed cannot price on both sides, and gives the cross rate the entry is
 * sanity checked against; no figure here is computed from it.
 */
export function sizePosition(input: SizingInput, rates: Record<string, number>): SizingResult {
  const balance = Number(input.balance);
  if (!positive(balance)) {
    return { ok: false, reason: 'balance' };
  }

  const riskRequested = Number(input.riskAmount);
  if (!positive(riskRequested) || riskRequested > balance) {
    return { ok: false, reason: 'risk' };
  }

  const leverage = Number(input.leverage);
  if (!Number.isFinite(leverage) || leverage < 1) {
    return { ok: false, reason: 'leverage' };
  }

  const entry = Number(input.entry);
  if (!positive(entry)) {
    return { ok: false, reason: 'entry' };
  }

  const usdBase = usdValue(rates, input.base);
  const usdQuote = usdValue(rates, input.quote);
  const usdAccount = usdValue(rates, input.account);
  if (usdBase === null || usdQuote === null || usdAccount === null) {
    return { ok: false, reason: 'rate' };
  }

  const stop = Number(input.stop);
  if (!positive(stop)) {
    return { ok: false, reason: 'stop' };
  }
  const direction = directionFromStop(entry, stop);
  if (direction === null) {
    return { ok: false, reason: 'stop' };
  }

  const take = input.take === null ? null : Number(input.take);
  if (take !== null) {
    const profitable = direction === 'long' ? take > entry : take < entry;
    if (!positive(take) || !profitable) {
      return { ok: false, reason: 'take' };
    }
  }

  const pipSize = pipSizeFor(input.quote);
  const quoteToAccount = usdQuote / usdAccount;
  const pipValuePerLot = pipSize * CONTRACT_SIZE * quoteToAccount;
  const stopPips = pipsFromLevel(entry, stop, pipSize);
  const riskPerLot = stopPips * pipValuePerLot;
  if (!positive(riskPerLot)) {
    return { ok: false, reason: 'stop' };
  }

  const lotsExact = riskRequested / riskPerLot;
  const lots = floorToStep(lotsExact, LOT_STEP);
  if (lots < LOT_STEP) {
    return { ok: false, reason: 'below-minimum', minimumRisk: LOT_STEP * riskPerLot };
  }

  const takePips = take === null ? null : pipsFromLevel(entry, take, pipSize);
  const reward = takePips === null ? null : takePips * pipValuePerLot * lots;
  const units = lots * CONTRACT_SIZE;
  const positionValue = units * entry * quoteToAccount;
  const moneyAtRisk = lots * riskPerLot;
  const requiredMargin = positionValue / leverage;

  return {
    ok: true,
    direction,
    pipSize,
    pipValuePerLot,
    stopPips,
    takePips,
    lots,
    lotsExact,
    riskRequested,
    moneyAtRisk,
    reward,
    rMultiple: reward === null ? null : reward / moneyAtRisk,
    requiredMargin,
    marginExceedsBalance: requiredMargin > balance,
    entryFarFromRate: farFromRate(entry, usdBase / usdQuote),
    pipValue: lots * pipValuePerLot,
    units,
    positionValue,
  };
}
