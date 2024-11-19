import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { ReactiveFormsModule } from '@angular/forms';

import { AppComponent } from './app.component';
import { DecimalFieldDirective } from './controls/decimal-field.directive';
import { TicketSelectComponent } from './controls/ticket-select.component';

@NgModule({
  declarations: [AppComponent, DecimalFieldDirective, TicketSelectComponent],
  imports: [BrowserModule, HttpClientModule, ReactiveFormsModule],
  bootstrap: [AppComponent],
})
export class AppModule {}
