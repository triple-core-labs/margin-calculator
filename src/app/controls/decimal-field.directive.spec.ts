import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { DecimalFieldDirective } from './decimal-field.directive';

@Component({
  template: `
    <input
      id="price"
      type="text"
      appDecimalField
      [step]="step"
      [formControl]="control" />
  `,
})
class HostComponent {
  @ViewChild(DecimalFieldDirective) field!: DecimalFieldDirective;
  step = 0.00001;
  control = new FormControl(1.08);
}

describe('DecimalFieldDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  function input(): HTMLInputElement {
    return fixture.nativeElement.querySelector('#price');
  }

  function type(text: string): void {
    input().value = text;
    input().dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function press(key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    input().dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HostComponent, DecimalFieldDirective],
      imports: [ReactiveFormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('writes the value with a point, whatever the browser locale would have shown', () => {
    expect(input().value).toBe('1.08');

    host.control.setValue(210.885);
    fixture.detectChanges();
    expect(input().value).toBe('210.885');
  });

  it('reads a number out of the field however the trader punctuates it', () => {
    type('1,0925');
    expect(host.control.value).toBe(1.0925);

    type('58,097.04');
    expect(host.control.value).toBe(58097.04);
  });

  it('empties the control when the field is emptied', () => {
    type('');
    expect(host.control.value).toBeNull();
  });

  it('leaves a field alone while it is still being typed into', () => {
    type('1.');
    expect(host.control.value).toBe(1);
    expect(input().value).toBe('1.');
  });

  it('steps the value with the arrow keys, in the step it was given', () => {
    press('ArrowUp');
    expect(host.control.value).toBe(1.08001);
    expect(input().value).toBe('1.08001');

    press('ArrowDown');
    press('ArrowDown');
    expect(host.control.value).toBe(1.07999);
  });

  it('claims the arrow keys so the page does not scroll under them', () => {
    expect(press('ArrowUp').defaultPrevented).toBeTrue();
    expect(press('Home').defaultPrevented).toBeFalse();
  });

  it('refuses to step a disabled field', () => {
    host.control.disable();
    fixture.detectChanges();

    press('ArrowUp');
    expect(host.control.value).toBe(1.08);
    expect(input().disabled).toBeTrue();
  });

  it('reports the field touched once it is left', () => {
    expect(host.control.touched).toBeFalse();
    input().dispatchEvent(new Event('blur'));
    expect(host.control.touched).toBeTrue();
  });
});
