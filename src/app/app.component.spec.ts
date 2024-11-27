import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { first } from 'rxjs/operators';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { AppComponent } from './app.component';
import { DecimalFieldDirective } from './controls/decimal-field.directive';
import { TicketSelectComponent } from './controls/ticket-select.component';
import { QUOTE_ORDER } from './margin/pairs';
import { CURRENCY_NAMES_URL, ER_API_URL, FRANKFURTER_URL } from './rates/rates.service';

/** Rates chosen so the default ticket reproduces the hand worked example. */
const USD_PER_UNIT: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  JPY: 0.0067,
  CHF: 1.12,
  AUD: 0.66,
  CAD: 0.74,
  NZD: 0.61,
};

/** A feed of the breadth the primary endpoint actually returns. */
const WIDE_FEED: Record<string, number> = {
  ...USD_PER_UNIT,
  SEK: 0.09,
  TRY: 0.024,
  ZAR: 0.055,
  THB: 0.028,
};

function erApiPayload(
  publishedAt: number,
  nextUpdateAt: number,
  usdPerUnit: Record<string, number> = USD_PER_UNIT
): Record<string, unknown> {
  const rates: Record<string, number> = {};
  for (const [code, usd] of Object.entries(usdPerUnit)) {
    rates[code] = 1 / usd;
  }
  return {
    result: 'success',
    time_last_update_unix: Math.floor(publishedAt / 1000),
    time_next_update_unix: Math.floor(nextUpdateAt / 1000),
    base_code: 'USD',
    rates,
  };
}

const HOUR = 60 * 60 * 1000;

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let http: HttpTestingController;

  function el(testId: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  }

  function text(testId: string): string {
    const found = el(testId);
    return found ? (found.textContent ?? '').replace(/\s+/g, ' ').trim() : '';
  }

  function has(testId: string): boolean {
    return el(testId) !== null;
  }

  function field(testId: string): HTMLInputElement {
    return el(testId) as HTMLInputElement;
  }

  function enter(testId: string, value: string): void {
    const input = field(testId);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function click(testId: string): void {
    (el(testId) as HTMLElement).click();
    fixture.detectChanges();
  }

  function press(controlId: string, key: string): void {
    fixture.nativeElement
      .querySelector(`#${controlId}`)
      .dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }

  function value(control: string): unknown {
    return fixture.componentInstance.form.getRawValue()[control];
  }

  function arrive(usdPerUnit: Record<string, number> = USD_PER_UNIT): void {
    http.expectOne(ER_API_URL).flush(erApiPayload(Date.now(), Date.now() + HOUR, usdPerUnit));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AppComponent, DecimalFieldDirective, TicketSelectComponent],
      imports: [ReactiveFormsModule, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    for (const request of http.match(CURRENCY_NAMES_URL)) {
      request.flush({ THB: 'Thai Baht' });
    }
    http.verify();
  });

  describe('before the rates arrive', () => {
    it('waits rather than offering a size', () => {
      expect(has('loading')).toBeTrue();
      expect(has('size')).toBeFalse();

      http.expectOne(ER_API_URL).flush(erApiPayload(Date.now(), Date.now() + HOUR));
    });
  });

  describe('the sized ticket', () => {
    beforeEach(() => arrive());

    it('prefills the entry from the fetched rate', () => {
      expect(value('entry')).toBeCloseTo(1.08, 8);
      expect(field('entry').value).toBe('1.08');
    });

    it('answers the hand worked example with the size and everything that follows', () => {
      expect(text('size')).toContain('0.50');
      expect(text('at-risk')).toContain('100.00');
      expect(text('reward')).toContain('200.00');
      expect(text('r-multiple')).toContain('2.00R');
      expect(text('margin')).toContain('1,800.00');
      expect(text('pip-value')).toContain('5.00');
      expect(text('position-value')).toContain('54,000.00');
      expect(text('price')).toContain('1.08000');
    });

    it('says which way the trade is read', () => {
      expect(text('direction').toLowerCase()).toContain('long');

      fixture.componentInstance.form.patchValue({ stop: 1.082, take: 1.074 });
      fixture.detectChanges();

      expect(text('direction').toLowerCase()).toContain('short');
    });

    it('lets the trader overwrite the entry the feed prefilled', () => {
      enter('entry', '1.0790');

      expect(value('stop')).toBeCloseTo(1.078, 8);
      expect(value('stopPips')).toBeCloseTo(10, 6);
      expect(text('size')).toContain('1.00');
    });

    it('locks the margin against the entry the trader typed, not the rate the feed sent', () => {
      enter('entry', '1.08');
      enter('stop', '1.0785');
      enter('take', '1.086');
      const near = { size: text('size'), margin: text('margin'), pip: text('pip-value') };

      enter('entry', '2');
      enter('stop', '1.9985');
      enter('take', '2.006');
      const far = { size: text('size'), margin: text('margin'), pip: text('pip-value') };

      expect(near.size).toContain('0.66');
      expect(far.size).toBe(near.size);
      expect(near.margin).toContain('2,376.00');
      expect(far.margin).toContain('4,400.00');
      expect(far.margin).not.toBe(near.margin);
      expect(far.pip).toBe(near.pip);
    });

    it('rounds the size down to the broker step rather than up', () => {
      fixture.componentInstance.form.patchValue({ stop: 1.0785 });
      fixture.detectChanges();

      expect(value('stopPips')).toBeCloseTo(15, 6);
      expect(text('size')).toContain('0.66');
      expect(text('at-risk')).toContain('99.00');
    });
  });

  describe('the risk', () => {
    beforeEach(() => arrive());

    it('turns a share of the balance into money as it is typed', () => {
      enter('risk-percent', '2');

      expect(value('riskMoney')).toBeCloseTo(200, 6);
      expect(text('size')).toContain('1.00');
    });

    it('turns money back into a share of the balance', () => {
      click('risk-mode-money');
      enter('risk-money', '250');

      expect(value('riskPercent')).toBeCloseTo(2.5, 8);
      expect(text('size')).toContain('1.25');
    });

    it('keeps the share and moves the money when the balance changes', () => {
      enter('balance', '20000');

      expect(value('riskPercent')).toBeCloseTo(1, 8);
      expect(value('riskMoney')).toBeCloseTo(200, 6);
    });

    it('refuses a risk too small to reach the smallest size a broker takes', () => {
      fixture.componentInstance.form.patchValue({ balance: 100, riskPercent: 0.5 });
      fixture.detectChanges();

      expect(has('size')).toBeFalse();
      expect(text('input-error')).toContain('0.01');
    });
  });

  describe('the levels', () => {
    beforeEach(() => arrive());

    it('places the stop and the take from a distance in pips', () => {
      click('level-mode-pips');
      enter('stop-pips', '25');
      enter('take-pips', '75');

      expect(value('stop')).toBeCloseTo(1.0775, 8);
      expect(value('take')).toBeCloseTo(1.0875, 8);
      expect(text('r-multiple')).toContain('3.00R');
    });

    it('turns the trade around when the direction is flipped in pips', () => {
      click('level-mode-pips');
      click('direction-short');

      expect(value('stop')).toBeCloseTo(1.082, 8);
      expect(value('take')).toBeCloseTo(1.076, 8);
      expect(text('direction').toLowerCase()).toContain('short');
    });

    it('reads the distances back out of prices the trader types', () => {
      enter('stop', '1.0770');

      expect(value('stopPips')).toBeCloseTo(30, 6);
      expect(text('size')).toContain('0.33');
    });

    it('refuses a stop sitting on the entry and says why', () => {
      enter('stop', '1.08');

      expect(has('size')).toBeFalse();
      expect(text('input-error').toLowerCase()).toContain('stop');
    });

    it('refuses a take on the same side of the entry as the stop', () => {
      enter('take', '1.0700');

      expect(has('size')).toBeFalse();
      expect(text('input-error').toLowerCase()).toContain('take');
    });
  });

  describe('the pairs the feed can price', () => {
    it('builds every pair out of the currencies the feed carries', (done) => {
      arrive(WIDE_FEED);

      fixture.componentInstance.pairRows$.pipe(first()).subscribe((offered) => {
        const codes = Object.keys(WIDE_FEED).length;
        const labels = offered.map((o) => o.label);
        expect(offered.length).toBe((codes * (codes - 1)) / 2);
        expect(labels.slice(0, 4)).toEqual(['EUR/USD', 'GBP/USD', 'AUD/USD', 'NZD/USD']);
        expect(labels).toContain('USD/TRY');
        expect(labels).toContain('THB/ZAR');
        done();
      });
    });

    it('withdraws every pair the fallback feed cannot price', (done) => {
      http.expectOne(ER_API_URL).error(new ProgressEvent('offline'));
      http.expectOne(FRANKFURTER_URL).flush({
        amount: 1,
        base: 'EUR',
        date: '2026-09-03',
        rates: { USD: 1.16, GBP: 0.86, JPY: 181.2, CHF: 0.94, AUD: 1.61, CAD: 1.6, NZD: 1.97 },
      });
      fixture.detectChanges();

      fixture.componentInstance.pairRows$.pipe(first()).subscribe((offered) => {
        const labels = offered.map((o) => o.label);
        expect(labels).toContain('EUR/USD');
        expect(labels.some((label) => label.includes('TRY'))).toBeFalse();
        done();
      });
    });

    it('names both legs of a pair so a search can reach it by name', (done) => {
      arrive(WIDE_FEED);

      fixture.componentInstance.pairRows$.pipe(first()).subscribe((offered) => {
        const eurusd = offered.find((o) => o.label === 'EUR/USD');
        expect(eurusd!.detail).toBe('Euro / US Dollar');
        done();
      });
    });

    it('prices a pair chosen with the keyboard alone and prefills its entry', () => {
      arrive();

      const pair = fixture.nativeElement.querySelector('#pair') as HTMLInputElement;
      press('pair', 'ArrowDown');
      pair.value = 'yen';
      pair.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      press('pair', 'Enter');
      fixture.detectChanges();

      expect(value('pair')).toBe('USD/JPY');
      expect(value('entry')).toBeCloseTo(149.254, 3);
      expect(value('stopPips')).toBeCloseTo(20, 6);
      expect(value('stop')).toBeCloseTo(149.054, 3);
      expect(text('size')).toContain('0.74');
    });
  });

  describe('the rates behind the figures', () => {
    it('says the rates could not be fetched and offers a retry rather than a figure', () => {
      http.expectOne(ER_API_URL).error(new ProgressEvent('offline'));
      http.expectOne(FRANKFURTER_URL).error(new ProgressEvent('offline'));
      fixture.detectChanges();

      expect(text('error')).toContain('retry');
      expect(has('size')).toBeFalse();
      expect(has('retry')).toBeTrue();
    });

    it('fetches again when the retry is pressed', () => {
      http.expectOne(ER_API_URL).error(new ProgressEvent('offline'));
      http.expectOne(FRANKFURTER_URL).error(new ProgressEvent('offline'));
      fixture.detectChanges();

      click('retry');
      arrive();

      expect(text('size')).toContain('0.50');
    });

    it('shows a fresh rate age without the stale warning', () => {
      http
        .expectOne(ER_API_URL)
        .flush(erApiPayload(Date.now() - HOUR, Date.now() + HOUR));
      fixture.detectChanges();

      expect(el('rate-age')!.classList).not.toContain('is-stale');
      expect(text('rate-age')).toContain('1 h ago');
    });

    it('warns when the provider is past the update it promised', () => {
      http
        .expectOne(ER_API_URL)
        .flush(erApiPayload(Date.now() - 30 * HOUR, Date.now() - 6 * HOUR));
      fixture.detectChanges();

      expect(el('rate-age')!.classList).toContain('is-stale');
      expect(text('rate-age')).toContain('1 d ago');
    });
  });

  describe('the ticket around the size', () => {
    beforeEach(() => arrive());

    it('offers every currency of the convention as an account currency', () => {
      for (const code of QUOTE_ORDER) {
        expect(fixture.componentInstance.accountCurrencies).toContain(code);
      }
    });

    it('offers exactly the four leverage ratios a retail broker sets', () => {
      expect(fixture.componentInstance.leverageOptions).toEqual([30, 50, 100, 500]);
      expect(fixture.componentInstance.leverageOptions).toContain(value('leverage') as number);
    });

    it('locks less margin as the leverage rises', () => {
      fixture.componentInstance.form.patchValue({ leverage: 100 });
      fixture.detectChanges();

      expect(text('margin')).toContain('540.00');
      expect(text('size')).toContain('0.50');
    });
  });
});

/** The ground every figure on the ticket is read against. */
const CHASSIS_950 = '#0d0f0e';

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(color: string): number {
  const parts = color.match(/\d+(\.\d+)?/g);
  if (parts === null) {
    throw new Error(`cannot read a colour out of ${color}`);
  }
  const [r, g, b] = parts.slice(0, 3).map((part) => channel(Number(part)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return luminance(`rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`);
}

/** The WCAG contrast ratio of a rendered colour against a known ground. */
function contrast(color: string, ground: string): number {
  const a = luminance(color);
  const b = hexLuminance(ground);
  const [high, low] = a > b ? [a, b] : [b, a];
  return (high + 0.05) / (low + 0.05);
}

describe('what the built stylesheet actually renders', () => {
  let fixture: ComponentFixture<AppComponent>;
  let http: HttpTestingController;

  function el(testId: string): HTMLElement {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) as HTMLElement;
  }

  function enter(testId: string, value: string): void {
    const input = el(testId) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AppComponent, DecimalFieldDirective, TicketSelectComponent],
      imports: [ReactiveFormsModule, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    http = TestBed.inject(HttpTestingController);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    http.expectOne(ER_API_URL).flush(erApiPayload(Date.now(), Date.now() + HOUR));
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
    for (const request of http.match(CURRENCY_NAMES_URL)) {
      request.flush({ THB: 'Thai Baht' });
    }
    http.verify();
  });

  it('keeps the marker standing in for an absent figure readable', () => {
    enter('take', '');
    const absent = Array.from(
      fixture.nativeElement.querySelectorAll('.ticket-result')
    ).find((node) => (node as HTMLElement).textContent!.trim() === 'no take') as HTMLElement;

    expect(absent).withContext('the no take marker is on screen').toBeTruthy();
    expect(contrast(getComputedStyle(absent).color, CHASSIS_950)).toBeGreaterThanOrEqual(4.5);
  });

  it('draws an edge on the toggle that is not chosen', () => {
    const resting = el('risk-mode-money');

    expect(resting.classList).not.toContain('is-on');
    expect(contrast(getComputedStyle(resting).borderTopColor, CHASSIS_950)).toBeGreaterThanOrEqual(3);
  });

  it('gives the refresh control a target a thumb can find', () => {
    const refresh = el('refresh');

    expect(refresh.offsetHeight).toBeGreaterThanOrEqual(24);
    expect(refresh.offsetWidth).toBeGreaterThanOrEqual(24);
  });

  it('keeps the gloss on the row the keyboard is holding readable', () => {
    const pair = fixture.nativeElement.querySelector('#pair') as HTMLInputElement;
    pair.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();

    const activeId = pair.getAttribute('aria-activedescendant')!;
    const row = fixture.nativeElement.querySelector(`#${activeId}`) as HTMLElement;
    const gloss = row.querySelector('.ticket-gloss') as HTMLElement;
    const behind = getComputedStyle(row).backgroundColor;

    expect(gloss).withContext('the active row carries a gloss').toBeTruthy();
    const ratio =
      (Math.max(luminance(getComputedStyle(gloss).color), luminance(behind)) + 0.05) /
      (Math.min(luminance(getComputedStyle(gloss).color), luminance(behind)) + 0.05);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

describe('what a screen reader is told when a field is refused', () => {
  let fixture: ComponentFixture<AppComponent>;
  let http: HttpTestingController;

  function el(testId: string): HTMLElement {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) as HTMLElement;
  }

  function enter(testId: string, value: string): void {
    const input = el(testId) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function flagged(): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('[aria-invalid="true"]')
    ).map((node) => (node as HTMLElement).getAttribute('data-testid') ?? (node as HTMLElement).id);
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AppComponent, DecimalFieldDirective, TicketSelectComponent],
      imports: [ReactiveFormsModule, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(ER_API_URL).flush(erApiPayload(Date.now(), Date.now() + HOUR));
    fixture.detectChanges();
  });

  afterEach(() => {
    for (const request of http.match(CURRENCY_NAMES_URL)) {
      request.flush({ THB: 'Thai Baht' });
    }
    http.verify();
  });

  it('marks no field while the ticket sizes', () => {
    expect(flagged()).toEqual([]);
  });

  it('marks the stop and points it at the reason', () => {
    enter('stop', '1.08');

    expect(flagged()).toEqual(['stop']);
    const described = el('stop').getAttribute('aria-describedby');
    expect(described).toBeTruthy();
    expect(fixture.nativeElement.querySelector(`#${described}`)).toBe(el('input-error'));
  });

  it('marks the take when the take is the problem', () => {
    enter('take', '1.07');

    expect(flagged()).toEqual(['take']);
  });

  it('marks the balance when the balance is the problem', () => {
    enter('balance', '');

    expect(flagged()).toEqual(['balance']);
  });

  it('marks the risk the size cannot be reached from', () => {
    enter('balance', '1000');
    enter('risk-percent', '0.01');

    expect(el('input-error').textContent).toContain('0.01');
    expect(flagged()).toEqual(['risk-percent']);
  });

  it('clears the mark once the ticket sizes again', () => {
    enter('stop', '1.08');
    enter('stop', '1.078');

    expect(flagged()).toEqual([]);
  });
});

describe('the publication time behind the figures', () => {
  let fixture: ComponentFixture<AppComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AppComponent, DecimalFieldDirective, TicketSelectComponent],
      imports: [ReactiveFormsModule, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(ER_API_URL).flush(erApiPayload(Date.now() - HOUR, Date.now() + HOUR));
    fixture.detectChanges();
  });

  afterEach(() => {
    for (const request of http.match(CURRENCY_NAMES_URL)) {
      request.flush({ THB: 'Thai Baht' });
    }
    http.verify();
  });

  it('reaches the exact time without a pointer, and never as a machine timestamp', () => {
    const age = fixture.nativeElement.querySelector('[data-testid="rate-age"]') as HTMLElement;
    const spoken = `${age.textContent} ${age.getAttribute('aria-label') ?? ''}`;

    expect(spoken).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(spoken).toMatch(/\d{1,2}:\d{2}/);
    expect(spoken)
      .withContext('an all numeric date reads differently on either side of the Atlantic')
      .toMatch(/\d{1,2} [A-Z][a-z]{2,8} \d{4}/);
  });

  it('carries a machine readable publication time for anything that parses one', () => {
    const time = fixture.nativeElement.querySelector('time[datetime]') as HTMLElement;

    expect(time).withContext('the rate line dates itself').toBeTruthy();
    expect(Number.isNaN(Date.parse(time.getAttribute('datetime')!))).toBeFalse();
  });
});

describe('an entry that cannot be a price of this pair', () => {
  let fixture: ComponentFixture<AppComponent>;
  let http: HttpTestingController;

  function el(testId: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  }

  function text(testId: string): string {
    const found = el(testId);
    return found ? (found.textContent ?? '').replace(/\s+/g, ' ').trim() : '';
  }

  function flagged(): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('[aria-invalid="true"]')
    ).map((node) => (node as HTMLElement).getAttribute('data-testid') ?? '');
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AppComponent, DecimalFieldDirective, TicketSelectComponent],
      imports: [ReactiveFormsModule, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(ER_API_URL).flush(erApiPayload(Date.now(), Date.now() + HOUR));
    fixture.detectChanges();
  });

  afterEach(() => {
    for (const request of http.match(CURRENCY_NAMES_URL)) {
      request.flush({ THB: 'Thai Baht' });
    }
    http.verify();
  });

  it('refuses the size rather than answering one out by the same factor', () => {
    fixture.componentInstance.form.patchValue({ entry: 1080, stop: 1079.95, take: null });
    fixture.detectChanges();

    expect(has('size')).toBeFalse();
    expect(flagged()).toEqual(['entry']);
  });

  it('names the entry and the reference side by side so the misread one shows', () => {
    fixture.componentInstance.form.patchValue({ entry: 1080, stop: 1079.95, take: null });
    fixture.detectChanges();

    const message = text('input-error');
    expect(message).toContain('1,080.00000');
    expect(message).toContain('1.08000');
  });

  it('refuses an entry a thousandth of the reference just as readily', () => {
    fixture.componentInstance.form.patchValue({ entry: 0.00108, stop: 0.001079, take: null });
    fixture.detectChanges();

    expect(has('size')).toBeFalse();
    expect(text('input-error').toLowerCase()).toContain('reference');
  });

  it('leaves an entry the trader moved towards a live quote alone', () => {
    fixture.componentInstance.form.patchValue({ entry: 1.0925, stop: 1.0905, take: 1.0985 });
    fixture.detectChanges();

    expect(has('size')).toBeTrue();
    expect(flagged()).toEqual([]);
  });

  function has(testId: string): boolean {
    return el(testId) !== null;
  }
});

describe('a size the broker could not lock the margin for', () => {
  let fixture: ComponentFixture<AppComponent>;
  let http: HttpTestingController;

  function el(testId: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  }

  function text(testId: string): string {
    const found = el(testId);
    return found ? (found.textContent ?? '').replace(/\s+/g, ' ').trim() : '';
  }

  function enter(testId: string, value: string): void {
    const input = el(testId) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AppComponent, DecimalFieldDirective, TicketSelectComponent],
      imports: [ReactiveFormsModule, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    http = TestBed.inject(HttpTestingController);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    http.expectOne(ER_API_URL).flush(erApiPayload(Date.now(), Date.now() + HOUR));
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
    for (const request of http.match(CURRENCY_NAMES_URL)) {
      request.flush({ THB: 'Thai Baht' });
    }
    http.verify();
  });

  it('still answers with the size, because the arithmetic is right', () => {
    enter('stop', '1.0798');

    expect(text('size')).toContain('5.00');
    expect(text('margin')).toContain('18,000.00');
  });

  it('says beside the margin that the balance would not cover it', () => {
    enter('stop', '1.0798');

    const warning = text('margin-over-balance');
    expect(warning).toContain('10,000.00');
    expect(warning.toLowerCase()).toContain('balance');
  });

  it('draws the warning in the colour reserved for what cannot go through', () => {
    enter('stop', '1.0798');

    const colour = getComputedStyle(el('margin-over-balance') as HTMLElement).color;
    expect(colour).toBe('rgb(239, 122, 104)');
    expect(contrast(colour, CHASSIS_950)).toBeGreaterThanOrEqual(4.5);
  });

  it('stays quiet, and keeps the ordinary gloss, when the balance covers it', () => {
    expect(el('margin-over-balance')).toBeNull();
    expect(text('margin')).toContain('1,800.00');
  });
});

describe('the wording of a refused price field', () => {
  let fixture: ComponentFixture<AppComponent>;
  let http: HttpTestingController;

  function el(testId: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  }

  function text(testId: string): string {
    const found = el(testId);
    return found ? (found.textContent ?? '').replace(/\s+/g, ' ').trim() : '';
  }

  function enter(testId: string, value: string): void {
    const input = el(testId) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AppComponent, DecimalFieldDirective, TicketSelectComponent],
      imports: [ReactiveFormsModule, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(ER_API_URL).flush(erApiPayload(Date.now(), Date.now() + HOUR));
    fixture.detectChanges();
  });

  afterEach(() => {
    for (const request of http.match(CURRENCY_NAMES_URL)) {
      request.flush({ THB: 'Thai Baht' });
    }
    http.verify();
  });

  it('asks for an entry that is missing and objects to one that is negative', () => {
    enter('entry', '');
    const missing = text('input-error');

    enter('entry', '-1.08');
    const negative = text('input-error');

    expect(missing).not.toBe(negative);
    expect(negative.toLowerCase()).toContain('below zero');
  });

  it('asks for a stop that is missing rather than telling it to move off the entry', () => {
    enter('stop', '');
    const missing = text('input-error');

    enter('stop', '1.08');
    const onEntry = text('input-error');

    expect(missing).not.toBe(onEntry);
    expect(onEntry.toLowerCase()).toContain('entry');
    expect(missing.toLowerCase()).not.toContain('leaves no distance');
  });

  it('objects to a take below zero rather than blaming the side it sits on', () => {
    enter('take', '-1.09');

    expect(text('input-error').toLowerCase()).toContain('below zero');
  });
});
