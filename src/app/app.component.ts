import { Component, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { combineLatest, interval, Observable } from 'rxjs';
import { map, shareReplay, startWith, tap } from 'rxjs/operators';

import { SelectOption } from './controls/option-filter';
import { currencyName } from './margin/currencies';
import {
  formatAmount,
  formatLots,
  formatMultiple,
  formatPipSize,
  formatPips,
  formatPrice,
  formatUnits,
} from './margin/format';
import { priceDecimalsFor, pipSizeFor } from './margin/margin';
import { CurrencyPair, buildPairs, priceablePairs } from './margin/pairs';
import {
  Direction,
  LOT_STEP,
  levelFromPips,
  percentFromRisk,
  pipsFromLevel,
  riskFromPercent,
  sizePosition,
  SizingReason,
} from './margin/size';
import { describeRateAge, RateSource, RatesState } from './rates/rates';
import { RatesService } from './rates/rates.service';

/** Whether the risk is given as a share of the balance or as a sum of money. */
export type RiskMode = 'percent' | 'money';

/** Whether the levels are given as prices or as distances from the entry. */
export type LevelMode = 'price' | 'pips';

/** The pairs the current feed can price, built once for each set of rates. */
interface Market {
  state: RatesState;
  rates: Record<string, number>;
  pairs: readonly CurrencyPair[];
}

const NO_MARKET: Market = { state: { status: 'loading' }, rates: {}, pairs: [] };

/** A pair offered as a dropdown row, findable by symbol, leg or spoken name. */
function pairOption(pair: CurrencyPair, names: Record<string, string>): SelectOption {
  const base = names[pair.base];
  const quote = names[pair.quote];
  const detail =
    base || quote ? `${base ?? pair.base} / ${quote ?? pair.quote}` : undefined;

  return {
    value: pair.label,
    label: pair.label,
    detail,
    terms: [pair.base, pair.quote, base ?? '', quote ?? ''].filter((term) => term.length > 0),
  };
}

/** The figures the ticket prints, already formatted for the account currency. */
export interface TicketFigures {
  account: string;
  pairLabel: string;
  base: string;
  sizeText: string;
  directionText: string;
  atRiskText: string;
  riskAskedText: string;
  rewardText: string | null;
  rewardPipsText: string | null;
  rMultipleText: string | null;
  rMultipleGlossText: string | null;
  marginText: string;
  leverageText: string;
  /** Said beside the margin when the balance would not cover it. */
  marginOverBalanceText: string | null;
  pipValueText: string;
  pipSizeText: string;
  positionValueText: string;
  unitsText: string;
  priceText: string;
}

/** Provenance of the price the ticket just printed. */
export interface RateLine {
  source: RateSource;
  /** How old the rates are, and that they are past due when they are. */
  ageText: string;
  /**
   * The same reading with the publication time spelt out.
   *
   * The exact time used to live in a `title`, which a phone cannot hover and a
   * screen reader does not read, so the only reader who could reach it was the
   * one sitting at a mouse.
   */
  ageSpoken: string;
  stale: boolean;
  /** Machine readable publication time, for anything that parses one. */
  updatedAt: string;
  /** The publication time written the way a trader reads a clock. */
  updatedAtText: string;
}

export type TicketStatus = 'loading' | 'error' | 'invalid' | 'ready';

/** A line of the ticket the calculator can name as the one it refused. */
export type TicketField = 'pair' | 'leverage' | 'balance' | 'risk' | 'entry' | 'stop' | 'take';

/** Everything the template renders, flattened so it needs no logic of its own. */
export interface TicketView {
  status: TicketStatus;
  message: string;
  /** The line the message is about, so the field itself can carry the refusal. */
  problemField: TicketField | null;
  figures: TicketFigures | null;
  rate: RateLine | null;
}

/** Which line of the ticket each refusal belongs to. */
const PROBLEM_FIELDS: Record<SizingReason, TicketField> = {
  balance: 'balance',
  risk: 'risk',
  leverage: 'leverage',
  entry: 'entry',
  rate: 'pair',
  stop: 'stop',
  take: 'take',
  'below-minimum': 'risk',
};

/** Names the message the refused field points a screen reader at. */
export const PROBLEM_ID = 'ticket-problem';

/** How often the rate age on screen is recomputed. */
const AGE_TICK_MS = 30000;

/** Decimals a derived pip distance is written back to the ticket with. */
const PIP_DECIMALS = 2;

const PROBLEMS: Record<Exclude<SizingReason, 'below-minimum'>, string> = {
  balance: 'Enter the account balance the risk is taken from.',
  risk: 'Enter a risk above zero and no larger than the balance.',
  leverage: 'Choose a leverage ratio of at least 1:1.',
  entry: 'Enter the price you expect to be filled at, as a number above zero.',
  rate: 'The current feed carries no rate for this pair. Refresh to fetch a complete set.',
  stop: 'A stop at the entry leaves no distance to size against. Move it above or below the entry.',
  take: 'The take is on the same side of the entry as the stop, so the trade would close in loss at both ends.',
};

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit {
  readonly accountCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD'];

  readonly leverageOptions = [30, 50, 100, 500];

  readonly accountRows: SelectOption[] = this.accountCurrencies.map((code) => ({
    value: code,
    label: code,
    detail: currencyName(code),
  }));

  readonly leverageRows: SelectOption[] = this.leverageOptions.map((ratio) => ({
    value: ratio,
    label: `1:${ratio}`,
    terms: [String(ratio)],
  }));

  readonly form: FormGroup;
  readonly view$: Observable<TicketView>;

  /**
   * Every pair the fetched rates can price, most prominent first.
   *
   * The feed decides the universe: whatever currencies it carries are combined
   * into pairs and named the way the market names them, so nothing on the list
   * is a symbol the arithmetic would have to refuse.
   */
  readonly pairRows$: Observable<SelectOption[]>;

  riskMode: RiskMode = 'percent';
  levelMode: LevelMode = 'price';

  private market: Market = NO_MARKET;
  private entryTouched = false;

  constructor(fb: FormBuilder, private readonly rates: RatesService) {
    this.form = fb.group({
      pair: ['EUR/USD', Validators.required],
      accountCurrency: ['USD', Validators.required],
      leverage: [30, [Validators.required, Validators.min(1)]],
      balance: [10000, [Validators.required, Validators.min(0.01)]],
      riskPercent: [1, [Validators.required, Validators.min(0)]],
      riskMoney: [100, [Validators.required, Validators.min(0)]],
      direction: ['long' as Direction],
      entry: [null as number | null],
      stop: [null as number | null],
      take: [null as number | null],
      stopPips: [20, [Validators.required, Validators.min(0)]],
      takePips: [40, Validators.min(0)],
    });

    const market$ = this.rates.state$.pipe(
      map((state) => this.readMarket(state)),
      tap((market) => {
        this.market = market;
        this.entryTouched = false;
        this.prefillEntry();
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );

    this.pairRows$ = combineLatest([market$, this.rates.names$]).pipe(
      map(([market, names]) => market.pairs.map((pair) => pairOption(pair, names)))
    );

    this.view$ = combineLatest([
      this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
      market$,
      interval(AGE_TICK_MS).pipe(startWith(0)),
    ]).pipe(map(([, market]) => this.project(market, new Date())));

    this.keepRiskInStep();
    this.keepLevelsInStep();
  }

  ngOnInit(): void {
    this.rates.refresh();
  }

  /** Fetch the rates again, after a failure or when the ones on screen look old. */
  refresh(): void {
    this.rates.refresh();
  }

  /** Read the risk as a share of the balance, or as a sum of money. */
  setRiskMode(mode: RiskMode): void {
    this.riskMode = mode;
  }

  /** Read the levels as prices, or as distances from the entry. */
  setLevelMode(mode: LevelMode): void {
    this.levelMode = mode;
  }

  /** Marks the one field the calculator refused, and nothing else. */
  faultFlag(view: TicketView, field: TicketField): 'true' | null {
    return view.problemField === field ? 'true' : null;
  }

  /** Points the refused field at the message that says what to do about it. */
  faultDescription(view: TicketView, field: TicketField): string | null {
    return view.problemField === field ? PROBLEM_ID : null;
  }

  /** Turn the trade around, which mirrors the stop and the take about the entry. */
  setDirection(direction: Direction): void {
    this.form.patchValue({ direction });
  }

  /** The risk as a share of the balance, for the gloss beside the money. */
  get riskPercentText(): string {
    return Number(this.form.getRawValue().riskPercent ?? 0).toFixed(2);
  }

  /** The risk as money in the account currency, for the gloss beside the share. */
  get riskMoneyText(): string {
    return formatAmount(Number(this.form.getRawValue().riskMoney ?? 0));
  }

  get direction(): Direction {
    return this.form.getRawValue().direction as Direction;
  }

  /** The account currency, which every figure on the ticket is expressed in. */
  get accountCode(): string {
    return String(this.form.getRawValue().accountCurrency);
  }

  /** The step a price field moves in, which is a tenth of a pip. */
  get priceStep(): number {
    return this.pipSize / 10;
  }

  private get pipSize(): number {
    return pipSizeFor(this.pairFor(String(this.form.getRawValue().pair))?.quote ?? 'USD');
  }

  private pairFor(label: string): CurrencyPair | undefined {
    return this.market.pairs.find((pair) => pair.label === label);
  }

  private control(name: string): AbstractControl {
    return this.form.get(name) as AbstractControl;
  }

  private set(values: Record<string, unknown>): void {
    this.form.patchValue(values, { emitEvent: false });
  }

  /**
   * Keep the two ways of saying the same risk in step.
   *
   * A share of the balance and a sum of money are one number written twice, so
   * whichever the trader edits, the other follows. The balance moving keeps the
   * share and moves the money, because a share is what a trader holds fixed.
   */
  private keepRiskInStep(): void {
    this.control('balance').valueChanges.subscribe(() => this.moneyFromPercent());
    this.control('riskPercent').valueChanges.subscribe(() => this.moneyFromPercent());
    this.control('riskMoney').valueChanges.subscribe(() => {
      const { balance, riskMoney } = this.form.getRawValue();
      const percent = percentFromRisk(Number(balance), Number(riskMoney));
      if (percent !== null) {
        this.set({ riskPercent: round(percent, 4) });
      }
    });
  }

  private moneyFromPercent(): void {
    const { balance, riskPercent } = this.form.getRawValue();
    this.set({ riskMoney: round(riskFromPercent(Number(balance), Number(riskPercent)), 2) });
  }

  /**
   * Keep the prices and the distances in step.
   *
   * In prices the stop and the take are what the trader typed and the distances
   * follow, along with the direction the stop implies. In pips the entry, the
   * distances and the direction are what the trader typed and the prices
   * follow. Either way the ticket holds both.
   */
  private keepLevelsInStep(): void {
    this.control('pair').valueChanges.subscribe(() => {
      this.entryTouched = false;
      this.prefillEntry();
    });
    this.control('entry').valueChanges.subscribe(() => {
      this.entryTouched = true;
      if (this.levelMode === 'price') {
        this.pipsFromPrices();
      } else {
        this.pricesFromPips();
      }
    });
    this.control('stop').valueChanges.subscribe(() => this.pipsFromPrices());
    this.control('take').valueChanges.subscribe(() => this.pipsFromPrices());
    this.control('stopPips').valueChanges.subscribe(() => this.pricesFromPips());
    this.control('takePips').valueChanges.subscribe(() => this.pricesFromPips());
    this.control('direction').valueChanges.subscribe(() => this.pricesFromPips());
  }

  private pipsFromPrices(): void {
    const { entry, stop, take } = this.form.getRawValue();
    if (!isPrice(entry)) {
      return;
    }
    const pipSize = this.pipSize;
    const next: Record<string, unknown> = {};

    if (isPrice(stop)) {
      next['stopPips'] = round(pipsFromLevel(entry, stop, pipSize), PIP_DECIMALS);
      if (stop !== entry) {
        next['direction'] = stop < entry ? 'long' : 'short';
      }
    }
    if (isPrice(take)) {
      next['takePips'] = round(pipsFromLevel(entry, take, pipSize), PIP_DECIMALS);
    }
    this.set(next);
  }

  private pricesFromPips(): void {
    const { entry, stopPips, takePips, direction } = this.form.getRawValue();
    if (!isPrice(entry)) {
      return;
    }
    const pipSize = this.pipSize;
    const decimals = priceDecimalsFor(this.pairFor(String(this.form.getRawValue().pair))?.quote ?? 'USD');
    const long = direction === 'long';
    const next: Record<string, unknown> = {};

    if (isPrice(stopPips)) {
      next['stop'] = round(levelFromPips(entry, stopPips, pipSize, long ? 'below' : 'above'), decimals);
    }
    if (isPrice(takePips)) {
      next['take'] = round(levelFromPips(entry, takePips, pipSize, long ? 'above' : 'below'), decimals);
    }
    this.set(next);
  }

  /**
   * Start the entry at the fetched rate, and leave it alone once the trader has
   * touched it. The rate is a daily reference and the trader is looking at a
   * live quote, so it is a starting value rather than an authority.
   */
  private prefillEntry(): void {
    if (this.entryTouched) {
      return;
    }
    const pair = this.pairFor(String(this.form.getRawValue().pair));
    if (!pair) {
      return;
    }
    const usdBase = this.market.rates[pair.base];
    const usdQuote = this.market.rates[pair.quote];
    if (!usdBase || !usdQuote) {
      return;
    }

    this.set({ entry: round(usdBase / usdQuote, priceDecimalsFor(pair.quote)) });
    this.pricesFromPips();
  }

  private readMarket(state: RatesState): Market {
    if (state.status !== 'ready') {
      return { state, rates: {}, pairs: [] };
    }
    const rates = state.snapshot.usdPerUnit;
    return { state, rates, pairs: priceablePairs(buildPairs(Object.keys(rates)), rates) };
  }

  private project(market: Market, now: Date): TicketView {
    const state = market.state;
    if (state.status === 'loading') {
      return { status: 'loading', message: '', problemField: null, figures: null, rate: null };
    }
    if (state.status === 'error') {
      return {
        status: 'error',
        message: state.message,
        problemField: null,
        figures: null,
        rate: null,
      };
    }

    const age = describeRateAge(state.snapshot, now);
    const ageText = age.stale ? `${age.label}, past due` : age.label;
    const updatedAtText = formatMoment(state.snapshot.updatedAt);
    const rate: RateLine = {
      source: state.snapshot.source,
      ageText,
      ageSpoken: `${ageText}, published ${updatedAtText}`,
      stale: age.stale,
      updatedAt: state.snapshot.updatedAt.toISOString(),
      updatedAtText,
    };

    const value = this.form.getRawValue();
    const pair = this.pairFor(String(value.pair));
    if (!pair) {
      return {
        status: 'invalid',
        message: PROBLEMS.rate,
        problemField: PROBLEM_FIELDS.rate,
        figures: null,
        rate,
      };
    }

    const result = sizePosition(
      {
        base: pair.base,
        quote: pair.quote,
        account: String(value.accountCurrency),
        balance: Number(value.balance),
        riskAmount: Number(value.riskMoney),
        entry: Number(value.entry),
        stop: Number(value.stop),
        take: isPrice(value.take) ? Number(value.take) : null,
        leverage: Number(value.leverage),
      },
      market.rates
    );

    if (!result.ok) {
      const message =
        result.reason === 'below-minimum'
          ? tooSmall(result.minimumRisk ?? 0, String(value.accountCurrency))
          : refusal(result.reason, value);
      return {
        status: 'invalid',
        message,
        problemField: PROBLEM_FIELDS[result.reason],
        figures: null,
        rate,
      };
    }

    if (result.entryFarFromRate) {
      return {
        status: 'invalid',
        message: farFromReference(Number(value.entry), usdCross(market.rates, pair), pair),
        problemField: PROBLEM_FIELDS.entry,
        figures: null,
        rate,
      };
    }

    const account = String(value.accountCurrency);
    const stopSide = result.direction === 'long' ? 'below' : 'above';
    const takeSide = result.direction === 'long' ? 'above' : 'below';
    const way = result.direction === 'long' ? 'Long' : 'Short';
    const takeLeg =
      result.takePips === null
        ? ''
        : `, take ${formatPips(result.takePips)} ${takeSide}`;

    return {
      status: 'ready',
      message: '',
      problemField: null,
      rate,
      figures: {
        account,
        pairLabel: pair.label,
        base: pair.base,
        sizeText: formatLots(result.lots),
        directionText: `${way}, stop ${formatPips(result.stopPips)} pips ${stopSide} the entry${takeLeg}`,
        atRiskText: formatAmount(result.moneyAtRisk),
        riskAskedText: formatAmount(result.riskRequested),
        rewardText: result.reward === null ? null : formatAmount(result.reward),
        rewardPipsText: result.takePips === null ? null : `${formatPips(result.takePips)} pips`,
        rMultipleText: result.rMultiple === null ? null : formatMultiple(result.rMultiple),
      rMultipleGlossText:
        result.takePips === null
          ? null
          : `${formatPips(result.takePips)} for ${formatPips(result.stopPips)} pips`,
        marginText: formatAmount(result.requiredMargin),
        leverageText: `1:${value.leverage}`,
        marginOverBalanceText: result.marginExceedsBalance
          ? `More than the ${formatAmount(Number(value.balance))} ${account} balance, so the broker would refuse the order.`
          : null,
        pipValueText: formatAmount(result.pipValue),
      pipSizeText: formatPipSize(result.pipSize, pair.quote),
        positionValueText: formatAmount(result.positionValue),
        unitsText: `${formatUnits(result.units)} ${pair.base}`,
        priceText: formatPrice(usdCross(market.rates, pair), pair.quote),
      },
    };
  }
}

/**
 * A moment written the way a trader reads a clock, in their own time zone,
 * because the figure it dates is being compared against a live quote.
 *
 * The month is spelt rather than numbered: 04.09.2026 is the fourth of
 * September on one side of the Atlantic and the ninth of April on the other,
 * and a rate whose date can be read two ways is worse than no date at all.
 */
function formatMoment(moment: Date): string {
  const day = moment.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const clock = moment.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${clock}`;
}

/** The cross rate of a pair's two legs against the dollar. */
function usdCross(rates: Record<string, number>, pair: CurrencyPair): number {
  return rates[pair.base] / rates[pair.quote];
}

/** Whether a form value is a number a price or a distance can be read from. */
function isPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function round(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

/**
 * The wording for a refusal, which is not always the wording for its reason.
 *
 * A missing price, a price at or below zero and a price on top of the entry all
 * come back from the arithmetic as one reason, because to the arithmetic they
 * are the same absence of a usable number. To the trader they are three
 * different mistakes with three different corrections, and the field itself is
 * the only place that can tell them apart.
 */
function refusal(reason: Exclude<SizingReason, 'below-minimum'>, value: Record<string, unknown>): string {
  if (reason === 'entry' && atOrBelowZero(value['entry'])) {
    return 'An entry at or below zero is not a price. Enter the price you expect to be filled at.';
  }
  if (reason === 'stop') {
    if (!isPrice(value['stop'])) {
      return 'Enter the price your stop sits at, so there is a distance to size against.';
    }
    if (atOrBelowZero(value['stop'])) {
      return 'A stop at or below zero is not a price. Enter the price your stop sits at.';
    }
  }
  if (reason === 'take' && atOrBelowZero(value['take'])) {
    return 'A take at or below zero is not a price. Enter the price you close in profit at.';
  }
  return PROBLEMS[reason];
}

/** Whether a field holds a number that no price could be. */
function atOrBelowZero(value: unknown): boolean {
  return isPrice(value) && value <= 0;
}

/**
 * The refusal for an entry that cannot be a price of this pair at all.
 *
 * Both numbers are named, in the same convention, because the whole failure is
 * that only one of them is wrong and every other figure on the ticket looks
 * right: the margin, the notional and the money at risk all come out plausible
 * while the size alone is out by the factor the decimal point moved.
 */
function farFromReference(entry: number, reference: number, pair: CurrencyPair): string {
  return `${formatPrice(entry, pair.quote)} is far from ${formatPrice(
    reference,
    pair.quote
  )}, the reference price for ${pair.label}. Check the decimal point: an entry this far out leaves the margin and the money at risk looking right while the size is wrong by the same factor.`;
}

function tooSmall(minimumRisk: number, account: string): string {
  return `That risk is smaller than the ${formatLots(
    LOT_STEP
  )} lot minimum allows on this stop, which would put ${formatAmount(
    minimumRisk
  )} ${account} at risk. Widen the risk or tighten the stop.`;
}
