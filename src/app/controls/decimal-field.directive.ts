import { Directive, ElementRef, HostListener, Input, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { formatDecimal, parseDecimal, stepValue } from './decimal';

/**
 * A field that holds a number and reads it the same way the ticket prints it.
 *
 * A native number field renders its value in the browser's own locale, so the
 * same price appears as 1,16194 in the field and 1.16194 in the line below it,
 * which is two conventions on one screen and a genuine misreading risk on a
 * field where a trader types a price. This field writes with a point always,
 * and accepts either separator on the way in, so a comma keyboard costs nothing.
 * The arrow keys still step the value, which is the one thing a native number
 * field would otherwise have given.
 */
@Directive({
  selector: 'input[appDecimalField]',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DecimalFieldDirective),
      multi: true,
    },
  ],
})
export class DecimalFieldDirective implements ControlValueAccessor {
  /** How far one press of an arrow key moves the value. */
  @Input() step = 1;

  private value: number | null = null;
  private onChange: (value: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor(private readonly host: ElementRef<HTMLInputElement>) {}

  writeValue(value: number | null): void {
    this.value = value ?? null;
    const shown = parseDecimal(this.host.nativeElement.value);
    if (shown !== this.value) {
      this.host.nativeElement.value = formatDecimal(this.value);
    }
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.host.nativeElement.disabled = disabled;
  }

  @HostListener('input', ['$event.target.value'])
  onInput(text: string): void {
    this.value = parseDecimal(text);
    this.onChange(this.value);
  }

  @HostListener('blur')
  onBlur(): void {
    this.onTouched();
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (this.host.nativeElement.disabled) {
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }
    event.preventDefault();
    this.value = stepValue(this.value, this.step, event.key === 'ArrowUp' ? 1 : -1);
    this.host.nativeElement.value = formatDecimal(this.value);
    this.onChange(this.value);
  }
}
