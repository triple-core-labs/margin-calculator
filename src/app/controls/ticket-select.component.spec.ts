import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { SelectOption } from './option-filter';
import { TicketSelectComponent } from './ticket-select.component';

const PAIRS: SelectOption[] = [
  { value: 'EUR/USD', label: 'EUR/USD', detail: 'Euro / US Dollar', terms: ['EUR', 'USD', 'Euro', 'US Dollar'] },
  { value: 'USD/JPY', label: 'USD/JPY', detail: 'US Dollar / Japanese Yen', terms: ['USD', 'JPY', 'US Dollar', 'Japanese Yen'] },
  { value: 'GBP/CHF', label: 'GBP/CHF', detail: 'British Pound / Swiss Franc', terms: ['GBP', 'CHF', 'British Pound', 'Swiss Franc'] },
];

const CODES: SelectOption[] = [
  { value: 'USD', label: 'USD', detail: 'US Dollar' },
  { value: 'EUR', label: 'EUR', detail: 'Euro' },
  { value: 'GBP', label: 'GBP', detail: 'British Pound' },
];

@Component({
  template: `
    <app-ticket-select
      controlId="pair"
      label="Pair"
      [options]="options"
      [searchable]="searchable"
      [formControl]="control"></app-ticket-select>
    <button type="button" id="outside">outside</button>
  `,
})
class HostComponent {
  @ViewChild(TicketSelectComponent) select!: TicketSelectComponent;
  options: SelectOption[] = PAIRS;
  searchable = true;
  control = new FormControl('EUR/USD');
}

describe('TicketSelectComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  function control(): HTMLInputElement {
    return fixture.nativeElement.querySelector('#pair');
  }

  function listbox(): HTMLElement | null {
    return fixture.nativeElement.querySelector('[role="listbox"]');
  }

  function options(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('[role="option"]'));
  }

  function active(): HTMLElement | null {
    const id = control().getAttribute('aria-activedescendant');
    return id ? fixture.nativeElement.querySelector(`#${id}`) : null;
  }

  function press(key: string): void {
    control().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }

  function type(text: string): void {
    const el = control();
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HostComponent, TicketSelectComponent],
      imports: [ReactiveFormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('the closed control', () => {
    it('shows the selected label and announces itself as a combobox', () => {
      expect(control().value).toBe('EUR/USD');
      expect(control().getAttribute('role')).toBe('combobox');
      expect(control().getAttribute('aria-expanded')).toBe('false');
      expect(control().getAttribute('aria-haspopup')).toBe('listbox');
      expect(control().getAttribute('aria-controls')).toBe('pair-listbox');
      expect(control().hasAttribute('aria-activedescendant')).toBeFalse();
      expect(listbox()).toBeNull();
    });

    it('is labelled by the field label', () => {
      const labelId = control().getAttribute('aria-labelledby');
      expect(labelId).toBeTruthy();
      expect(fixture.nativeElement.querySelector(`#${labelId}`).textContent.trim()).toBe('Pair');
    });
  });

  describe('the open listbox', () => {
    beforeEach(() => press('ArrowDown'));

    it('marks itself expanded and exposes the listbox it controls', () => {
      expect(control().getAttribute('aria-expanded')).toBe('true');
      const list = listbox();
      expect(list).not.toBeNull();
      expect(list!.id).toBe('pair-listbox');
    });

    it('gives every row the option role and marks only the selected one', () => {
      const rows = options();
      expect(rows.length).toBe(PAIRS.length);
      expect(rows.map((r) => r.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    });

    it('points aria-activedescendant at a real option in the listbox', () => {
      const id = control().getAttribute('aria-activedescendant');
      expect(id).toBeTruthy();
      expect(active()).toBe(options()[0]);
      expect(listbox()!.contains(active()!)).toBeTrue();
    });

    it('opens on the selected option rather than the top of the list', () => {
      press('Escape');
      host.control.setValue('GBP/CHF');
      fixture.detectChanges();
      press('ArrowDown');

      expect(active()).toBe(options()[2]);
    });
  });

  describe('keyboard navigation', () => {
    it('opens on ArrowDown, ArrowUp, Enter and Space when closed', () => {
      for (const key of ['ArrowDown', 'ArrowUp', 'Enter', ' ']) {
        press(key);
        expect(control().getAttribute('aria-expanded')).withContext(key).toBe('true');
        press('Escape');
      }
    });

    it('moves the active option down and up', () => {
      press('ArrowDown');
      press('ArrowDown');
      expect(active()).toBe(options()[1]);
      press('ArrowDown');
      expect(active()).toBe(options()[2]);
      press('ArrowUp');
      expect(active()).toBe(options()[1]);
    });

    it('stops at the ends rather than wrapping', () => {
      press('ArrowDown');
      press('ArrowUp');
      expect(active()).toBe(options()[0]);
      press('End');
      press('ArrowDown');
      expect(active()).toBe(options()[2]);
    });

    it('jumps to the first and last option with Home and End', () => {
      press('ArrowDown');
      press('End');
      expect(active()).toBe(options()[2]);
      press('Home');
      expect(active()).toBe(options()[0]);
    });

    it('selects the active option with Enter, closes, and returns focus', () => {
      press('ArrowDown');
      press('ArrowDown');
      press('Enter');

      expect(host.control.value).toBe('USD/JPY');
      expect(control().value).toBe('USD/JPY');
      expect(control().getAttribute('aria-expanded')).toBe('false');
      expect(listbox()).toBeNull();
      expect(document.activeElement).toBe(control());
    });

    it('selects the active option with Space', () => {
      press('ArrowDown');
      press('End');
      press(' ');

      expect(host.control.value).toBe('GBP/CHF');
      expect(control().getAttribute('aria-expanded')).toBe('false');
    });

    it('closes on Escape without changing the value and returns focus', () => {
      press('ArrowDown');
      press('ArrowDown');
      press('Escape');

      expect(host.control.value).toBe('EUR/USD');
      expect(control().value).toBe('EUR/USD');
      expect(control().getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(control());
    });

    it('closes on Tab and lets the focus move on', () => {
      press('ArrowDown');
      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      control().dispatchEvent(event);
      fixture.detectChanges();

      expect(control().getAttribute('aria-expanded')).toBe('false');
      expect(event.defaultPrevented).toBeFalse();
    });

    it('scrolls the active option into view', () => {
      press('ArrowDown');
      const spy = spyOn(options()[1], 'scrollIntoView');
      press('ArrowDown');

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('searching in the field', () => {
    it('filters the list by the full symbol, either leg, and a spoken name', () => {
      press('ArrowDown');

      type('usd/jpy');
      expect(options().map((o) => o.textContent!.trim().split(/\s+/)[0])).toEqual(['USD/JPY']);

      type('JPY');
      expect(options().length).toBe(1);

      type('yen');
      expect(options().length).toBe(1);

      type('USDJPY');
      expect(options().length).toBe(1);
    });

    it('holds the query while open and the chosen symbol once closed', () => {
      press('ArrowDown');
      type('yen');
      expect(control().value).toBe('yen');

      press('Enter');
      expect(control().value).toBe('USD/JPY');
      expect(host.control.value).toBe('USD/JPY');
    });

    it('restores the selected symbol when the search is abandoned', () => {
      press('ArrowDown');
      type('yen');
      press('Escape');

      expect(control().value).toBe('EUR/USD');
      expect(host.control.value).toBe('EUR/USD');
    });

    it('shows a no match row rather than an empty popup', () => {
      press('ArrowDown');
      type('zzz');

      expect(options().length).toBe(0);
      expect(listbox()).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="pair-no-match"]').textContent.trim())
        .toBe('No match');
      expect(control().hasAttribute('aria-activedescendant')).toBeFalse();
    });

    it('selects nothing when Enter is pressed with no match', () => {
      press('ArrowDown');
      type('zzz');
      press('Enter');

      expect(host.control.value).toBe('EUR/USD');
    });

    it('opens the list as soon as the field is typed into', () => {
      type('gbp');

      expect(control().getAttribute('aria-expanded')).toBe('true');
      expect(options().length).toBe(1);
    });

    it('announces that it completes from a list', () => {
      expect(control().getAttribute('aria-autocomplete')).toBe('list');
      expect(control().readOnly).toBeFalse();
    });
  });

  describe('a dropdown that is not searchable', () => {
    beforeEach(() => {
      host.searchable = false;
      host.options = CODES;
      host.control.setValue('USD');
      fixture.detectChanges();
    });

    it('refuses typing into the field itself', () => {
      expect(control().readOnly).toBeTrue();
      expect(control().hasAttribute('aria-autocomplete')).toBeFalse();
    });

    it('jumps to the next option starting with the letter typed', () => {
      press('ArrowDown');
      press('g');

      expect(active()).toBe(options()[2]);
      expect(options().length).toBe(CODES.length);
    });

    it('opens and jumps when a letter is typed while closed', () => {
      press('e');

      expect(control().getAttribute('aria-expanded')).toBe('true');
      expect(active()).toBe(options()[1]);
    });
  });

  describe('the pointer', () => {
    it('opens and closes on the control', () => {
      control().click();
      fixture.detectChanges();
      expect(control().getAttribute('aria-expanded')).toBe('true');

      control().click();
      fixture.detectChanges();
      expect(control().getAttribute('aria-expanded')).toBe('false');
    });

    it('selects the option clicked', () => {
      press('ArrowDown');
      options()[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      options()[1].click();
      fixture.detectChanges();

      expect(host.control.value).toBe('USD/JPY');
      expect(control().getAttribute('aria-expanded')).toBe('false');
    });

    it('closes when the click lands outside and leaves the value alone', () => {
      press('ArrowDown');
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      fixture.detectChanges();

      expect(control().getAttribute('aria-expanded')).toBe('false');
      expect(host.control.value).toBe('EUR/USD');
    });
  });

  describe('a disabled control', () => {
    it('refuses to open', () => {
      host.control.disable();
      fixture.detectChanges();

      press('ArrowDown');
      expect(control().disabled).toBeTrue();
      expect(control().getAttribute('aria-expanded')).toBe('false');
    });
  });
});

describe('TicketSelectComponent with a catalogue larger than the list', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  const MANY: SelectOption[] = Array.from({ length: 400 }, (_, i) => ({
    value: `P${i}/USD`,
    label: `P${i}/USD`,
    terms: ['USD'],
  }));

  function control(): HTMLInputElement {
    return fixture.nativeElement.querySelector('#pair');
  }

  function options(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('[role="option"]'));
  }

  function labels(): string[] {
    return options().map((o) => o.textContent!.trim().split(/\s+/)[0]);
  }

  function press(key: string): void {
    control().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }

  function type(text: string): void {
    const el = control();
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HostComponent, TicketSelectComponent],
      imports: [ReactiveFormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    host.options = MANY;
    host.control.setValue('P0/USD');
    fixture.detectChanges();
  });

  it('draws only the rows a trader will read rather than the whole catalogue', () => {
    press('ArrowDown');

    expect(MANY.length).toBeGreaterThan(fixture.componentInstance.select.maxRows);
    expect(options().length).toBe(fixture.componentInstance.select.maxRows);
    expect(labels()[0]).toBe('P0/USD');
  });

  it('says there are more matches than it is showing', () => {
    press('ArrowDown');

    expect(fixture.nativeElement.querySelector('[data-testid="pair-more"]')).not.toBeNull();
  });

  it('drops the notice once the query narrows the list inside the limit', () => {
    press('ArrowDown');
    type('P399');

    expect(labels()).toEqual(['P399/USD']);
    expect(fixture.nativeElement.querySelector('[data-testid="pair-more"]')).toBeNull();
  });

  it('keeps the chosen symbol in the list even when it falls past the limit', () => {
    host.control.setValue('P350/USD');
    fixture.detectChanges();
    press('ArrowDown');

    expect(labels()).toContain('P350/USD');
    expect(options().length).toBe(fixture.componentInstance.select.maxRows);
    expect(control().getAttribute('aria-activedescendant')).toBe(
      options()[labels().indexOf('P350/USD')].id
    );
  });
});

describe('TicketSelectComponent and the accessibility tree', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  const MANY: SelectOption[] = Array.from({ length: 400 }, (_, i) => ({
    value: `P${i}/USD`,
    label: `P${i}/USD`,
    terms: ['USD'],
  }));

  function control(): HTMLInputElement {
    return fixture.nativeElement.querySelector('#pair');
  }

  function listbox(): HTMLElement | null {
    return fixture.nativeElement.querySelector('[role="listbox"]');
  }

  function press(key: string): void {
    control().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }

  function type(text: string): void {
    const el = control();
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HostComponent, TicketSelectComponent],
      imports: [ReactiveFormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('puts nothing but options inside the listbox', () => {
    press('ArrowDown');
    type('zzz');

    const strays = Array.from(listbox()!.children).filter(
      (child) => child.getAttribute('role') !== 'option'
    );
    expect(strays).toEqual([]);
  });

  it('announces the empty result rather than hiding it behind a presentation role', () => {
    press('ArrowDown');
    type('zzz');

    const notice = fixture.nativeElement.querySelector('[data-testid="pair-no-match"]');
    expect(notice.textContent.trim()).toBe('No match');
    expect(notice.getAttribute('role')).toBe('status');
    expect(listbox()!.contains(notice)).withContext('outside the listbox').toBeFalse();
  });

  it('leaves the scrolling to the listbox, which the keyboard can already drive', () => {
    press('ArrowDown');

    const scrollers = Array.from(
      fixture.nativeElement.querySelectorAll('.ticket-popup, .ticket-popup *')
    ).filter((node) => {
      const overflow = getComputedStyle(node as HTMLElement).overflowY;
      return overflow === 'auto' || overflow === 'scroll';
    });

    expect(scrollers.length).toBe(1);
    expect((scrollers[0] as HTMLElement).getAttribute('role')).toBe('listbox');
  });

  it('announces that the list is longer than the rows it drew', () => {
    host.options = MANY;
    host.control.setValue('P0/USD');
    fixture.detectChanges();
    press('ArrowDown');

    const notice = fixture.nativeElement.querySelector('[data-testid="pair-more"]');
    expect(notice.getAttribute('role')).toBe('status');
    expect(listbox()!.contains(notice)).withContext('outside the listbox').toBeFalse();
    expect(
      Array.from(listbox()!.children).filter((c) => c.getAttribute('role') !== 'option')
    ).toEqual([]);
  });

  it('carries the invalid state the ticket hands it', () => {
    expect(control().hasAttribute('aria-invalid')).toBeFalse();

    fixture.componentInstance.select.invalid = true;
    fixture.detectChanges();

    expect(control().getAttribute('aria-invalid')).toBe('true');
  });
});

describe('TicketSelectComponent and the reason a value was refused', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HostComponent, TicketSelectComponent],
      imports: [ReactiveFormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('points at the message the ticket handed it', () => {
    const control = (): HTMLInputElement => fixture.nativeElement.querySelector('#pair');
    expect(control().hasAttribute('aria-describedby')).toBeFalse();

    fixture.componentInstance.select.describedBy = 'ticket-problem';
    fixture.detectChanges();

    expect(control().getAttribute('aria-describedby')).toBe('ticket-problem');
  });
});
