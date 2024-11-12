import {
  AfterViewChecked,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  QueryList,
  ViewChild,
  ViewChildren,
  forwardRef,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { SelectOption, filterOptions, optionMatches, typeaheadIndex } from './option-filter';

type OptionValue = string | number | null;

/**
 * A dropdown drawn as a line of the ticket rather than as a browser control.
 *
 * It is a combobox in the full sense the pattern requires: the control carries
 * the expanded state and points at the active row, the popup is a listbox of
 * options, and every move the keyboard can make on a native select works here,
 * including first letter typeahead. Set `searchable` and the control becomes a
 * field the trader types into, filtering the list as they go, which is the only
 * way a list of sixty odd symbols is quicker than a scroll.
 */
@Component({
  selector: 'app-ticket-select',
  templateUrl: './ticket-select.component.html',
  styleUrls: ['./ticket-select.component.css'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TicketSelectComponent),
      multi: true,
    },
  ],
})
export class TicketSelectComponent implements ControlValueAccessor, OnChanges, AfterViewChecked {
  /** Identifies the control, the listbox and every option in it. */
  @Input() controlId = 'select';

  /** The line's label, which also names the control to a screen reader. */
  @Input() label = '';

  @Input() options: readonly SelectOption[] = [];

  /** Whether the control is a field the query is typed into. */
  @Input() searchable = false;

  /** Whether the ticket has refused the value this control holds. */
  @Input() invalid = false;

  /** The message that says why the value was refused, where there is one. */
  @Input() describedBy: string | null = null;

  /**
   * The most rows the list will ever draw.
   *
   * The pair catalogue is every combination the feed can price, thousands of
   * them, and a listbox that long costs more to build than a trader will ever
   * read. The catalogue is ordered by how much of the market a pair carries,
   * so the rows kept are the ones worth keeping.
   */
  @Input() maxRows = 50;

  @ViewChild('control') private controlRef?: ElementRef<HTMLInputElement>;
  @ViewChildren('optionRow') private optionRows?: QueryList<ElementRef<HTMLElement>>;

  isOpen = false;
  hasMore = false;
  activeIndex = -1;
  query = '';
  disabled = false;
  visibleOptions: readonly SelectOption[] = [];

  private value: OptionValue = null;
  private scrolledIndex = -1;
  private onChange: (value: OptionValue) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  ngOnChanges(): void {
    this.applyFilter(this.isOpen && this.searchable ? this.query : '');
  }

  ngAfterViewChecked(): void {
    if (!this.isOpen || this.activeIndex < 0) {
      this.scrolledIndex = -1;
      return;
    }
    if (this.activeIndex === this.scrolledIndex) {
      return;
    }
    const row = this.optionRows?.toArray()[this.activeIndex];
    if (row) {
      row.nativeElement.scrollIntoView({ block: 'nearest' });
      this.scrolledIndex = this.activeIndex;
    }
  }

  get labelId(): string {
    return `${this.controlId}-label`;
  }

  get listboxId(): string {
    return `${this.controlId}-listbox`;
  }

  get noMatchId(): string {
    return `${this.controlId}-no-match`;
  }

  get moreId(): string {
    return `${this.controlId}-more`;
  }

  optionId(index: number): string {
    return `${this.controlId}-option-${index}`;
  }

  /** The option the keyboard is on, named for aria-activedescendant. */
  get activeId(): string | null {
    return this.isOpen && this.activeIndex >= 0 ? this.optionId(this.activeIndex) : null;
  }

  /**
   * The label of the option currently held by the form.
   *
   * A value the catalogue does not carry still shows as itself rather than as
   * an empty control, because the pair list arrives with the rates and the
   * ticket holds a symbol before then.
   */
  get selectedLabel(): string {
    const chosen = this.options.find((option) => option.value === this.value);
    return chosen?.label ?? (this.value === null ? '' : String(this.value));
  }

  /** The query while the field is open for typing, the chosen symbol otherwise. */
  get displayText(): string {
    return this.isOpen && this.searchable ? this.query : this.selectedLabel;
  }

  /** While a query is being typed the chosen symbol stays readable behind it. */
  get placeholder(): string | null {
    return this.isOpen && this.searchable ? this.selectedLabel : null;
  }

  isSelected(option: SelectOption): boolean {
    return option.value === this.value;
  }

  writeValue(value: OptionValue): void {
    this.value = value;
  }

  registerOnChange(fn: (value: OptionValue) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
    if (disabled) {
      this.close();
    }
  }

  onControlClick(): void {
    if (this.disabled) {
      return;
    }
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  onInput(text: string): void {
    if (this.disabled || !this.searchable) {
      return;
    }
    this.query = text;
    this.isOpen = true;
    this.applyFilter(this.query);
    this.activeIndex = this.visibleOptions.length > 0 ? 0 : -1;
  }

  choose(index: number): void {
    const option = this.visibleOptions[index];
    if (!option) {
      return;
    }
    this.value = option.value;
    this.onChange(option.value);
    this.onTouched();
    this.close();
    this.focusControl();
  }

  onKeydown(event: KeyboardEvent): void {
    if (this.disabled) {
      return;
    }

    switch (event.key) {
      case 'Tab':
        this.close();
        return;
      case 'Escape':
        if (this.isOpen) {
          event.preventDefault();
          this.close();
          this.focusControl();
        }
        return;
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        if (!this.isOpen) {
          this.open();
          return;
        }
        this.setActive(this.activeIndex + (event.key === 'ArrowDown' ? 1 : -1));
        return;
      case 'Home':
      case 'End':
        event.preventDefault();
        if (!this.isOpen) {
          this.open();
        }
        this.setActive(event.key === 'Home' ? 0 : this.visibleOptions.length - 1);
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!this.isOpen) {
          this.open();
          return;
        }
        this.choose(this.activeIndex);
        return;
      default:
        this.typeahead(event);
    }
  }

  /** A click anywhere else is a decision to leave the list as it was. */
  @HostListener('document:mousedown', ['$event'])
  onDocumentMousedown(event: Event): void {
    const target = event.target;
    if (this.isOpen && (!(target instanceof Node) || !this.host.nativeElement.contains(target))) {
      this.close();
    }
  }

  private typeahead(event: KeyboardEvent): void {
    if (this.searchable || event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const from = this.activeIndex >= 0 ? this.activeIndex : this.indexOfSelected();
    const found = typeaheadIndex(this.visibleOptions, event.key, from);
    if (found < 0) {
      return;
    }
    event.preventDefault();
    if (!this.isOpen) {
      this.open();
    }
    this.setActive(found);
  }

  private open(): void {
    if (this.disabled) {
      return;
    }
    this.isOpen = true;
    this.query = '';
    this.applyFilter('');
    this.activeIndex = this.indexOfSelected();
    if (this.searchable) {
      this.focusControl();
    }
  }

  private close(): void {
    this.isOpen = false;
    this.query = '';
    this.activeIndex = -1;
    this.scrolledIndex = -1;
    this.applyFilter('');
  }

  /**
   * Cut the catalogue down to the rows the list will draw.
   *
   * The chosen symbol is kept whatever the limit says, because a listbox that
   * cannot show what is currently selected is lying about the state of the
   * control.
   */
  private applyFilter(query: string): void {
    const found = filterOptions(this.options, query, this.maxRows + 1);
    this.hasMore = found.length > this.maxRows;

    let rows = found.slice(0, this.maxRows);
    const selected = this.options.find((option) => option.value === this.value);
    if (selected && !rows.includes(selected) && optionMatches(selected, query)) {
      rows = [selected, ...rows].slice(0, this.maxRows);
    }
    this.visibleOptions = rows;
  }

  private setActive(index: number): void {
    if (this.visibleOptions.length === 0) {
      this.activeIndex = -1;
      return;
    }
    this.activeIndex = Math.min(Math.max(index, 0), this.visibleOptions.length - 1);
  }

  private indexOfSelected(): number {
    if (this.visibleOptions.length === 0) {
      return -1;
    }
    const index = this.visibleOptions.findIndex((option) => option.value === this.value);
    return index >= 0 ? index : 0;
  }

  private focusControl(): void {
    this.controlRef?.nativeElement.focus();
  }
}
