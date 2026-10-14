import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { PrescriptionService, Prescription } from '../../core/services/prescription.service';
import { InventoryService } from '../../core/services/inventory.service';
import { getApiBaseUrl } from '../../core/config/api.config';
@Component({
  selector: 'app-pharmacist-dispensing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: ` <div class="work-page">
    <header>
      <div>
        <p class="eyebrow">PHARMACY</p>
        <h1>Prescription dispensing</h1>
        <p>Review the prescription, select the stock issued, and confirm the patient handoff.</p>
      </div>
      <button (click)="refresh()">Refresh</button>
    </header>
    <p role="alert" class="error" *ngIf="error()">{{ error() }}</p>
    <p role="status" *ngIf="success()">{{ success() }}</p>
    <div class="dispense-grid">
      <section class="panel">
        <h2>
          Pending prescriptions <span>{{ pending().length }}</span>
        </h2>
        <button
          class="rx-card"
          *ngFor="let rx of pending()"
          (click)="select(rx)"
          [class.selected]="selected()?.id === rx.id"
        >
          <strong>{{ rx.name }}</strong
          ><small>{{ rx.name_subtitle }} · {{ rx.date }}</small>
          <p>{{ rx.drugDetails }}</p>
          <small>Prescribed by {{ rx.doctor }}</small>
        </button>
        <p class="empty" *ngIf="!pending().length">No prescriptions awaiting dispensing.</p>
      </section>
      <section class="panel detail">
        <ng-container *ngIf="selected() as rx; else choose"
          ><h2>Review & dispense</h2>
          <p>
            <strong>{{ rx.name }}</strong> · {{ rx.name_subtitle }}
          </p>
          <div class="prescription">{{ rx.drugDetails }}</div>
          <p class="muted">
            Match the prescribed medication to the correct inventory batch. Quantities are the units
            physically issued.
          </p>
          <div class="stock-line" *ngFor="let line of lines; let i = index">
            <label
              >Inventory batch<select [(ngModel)]="line.inventoryId">
                <option value="">Select batch</option>
                <option *ngFor="let item of usableStock()" [value]="item.id">
                  {{ item.name }} · {{ item.batch }} · {{ item.qty }} {{ item.unit }} left ·
                  {{ item.unit_price | currency: 'INR' }}
                </option>
              </select></label
            ><label
              >Quantity<input type="number" min="1" step="1" [(ngModel)]="line.quantity" /></label
            ><button aria-label="Remove item" (click)="lines.splice(i, 1)">×</button>
          </div>
          <button (click)="lines.push({ inventoryId: '', quantity: 1 })">+ Add item</button>
          <div class="total">
            <span>Itemized charge</span><strong>{{ total() | currency: 'INR' }}</strong>
          </div>
          <label class="check"
            ><input type="checkbox" [(ngModel)]="verified" /> I have verified the patient,
            prescription and selected batches.</label
          ><button
            class="primary"
            [disabled]="saving() || !verified || !valid()"
            (click)="dispense()"
          >
            {{ saving() ? 'Saving…' : 'Confirm dispensing & create invoice' }}
          </button>
          <p class="muted">
            Stock and the patient’s invoice update together. Payment is collected separately by the
            billing desk.
          </p></ng-container
        ><ng-template #choose
          ><div class="empty">
            <h2>Select a prescription</h2>
            <p>Choose a pending request to review and dispense.</p>
          </div></ng-template
        >
      </section>
    </div>
  </div>`,
  styles: `
    .work-page {
      max-width: 1300px;
      margin: auto;
      display: grid;
      gap: 24px;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    h1 {
      font-size: 28px;
    }
    header p,
    .muted {
      font-size: 12px;
      color: var(--color-text-secondary);
      margin-top: 8px;
    }
    .eyebrow {
      letter-spacing: 0.12em;
      color: var(--color-primary) !important;
      font-size: 10px !important;
    }
    .dispense-grid {
      display: grid;
      grid-template-columns: 1fr 1.5fr;
      gap: 24px;
    }
    .panel {
      border: 1px solid var(--color-border);
      border-radius: 14px;
      background: var(--color-bg-surface);
      overflow: hidden;
    }
    .panel h2 {
      font-size: 16px;
      padding: 22px;
      border-bottom: 1px solid var(--color-border);
    }
    h2 span {
      float: right;
      color: var(--color-primary);
    }
    button,
    input,
    select {
      padding: 10px 12px;
      border: 1px solid var(--color-border);
      border-radius: 8px;
      background: var(--color-bg-surface);
      color: var(--color-text-primary);
    }
    button {
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .rx-card {
      display: block;
      width: 100%;
      text-align: left;
      border: 0;
      border-radius: 0;
      border-bottom: 1px solid var(--color-border);
      padding: 20px;
    }
    .rx-card.selected {
      background: var(--color-primary-lightest);
      box-shadow: inset 3px 0 var(--color-primary);
    }
    .rx-card strong,
    .rx-card small {
      display: block;
    }
    .rx-card small {
      font-size: 11px;
      color: var(--color-text-secondary);
      margin: 6px 0;
    }
    .rx-card p {
      font-size: 12px;
      line-height: 1.6;
    }
    .detail {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 18px;
      align-self: start;
    }
    .detail h2 {
      padding: 0 0 18px;
    }
    .prescription {
      padding: 16px;
      background: var(--color-bg-base);
      border-radius: 8px;
      line-height: 1.6;
    }
    .stock-line {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 80px 36px;
      gap: 8px;
      align-items: end;
    }
    label {
      display: grid;
      gap: 7px;
      font-size: 11px;
    }
    input,
    select {
      width: 100%;
    }
    .check {
      display: flex;
      align-items: center;
      font-size: 12px;
      line-height: 1.6;
    }
    .check input {
      width: auto;
    }
    .primary {
      background: var(--color-primary);
      color: white;
      padding: 13px;
    }
    .total {
      display: flex;
      justify-content: space-between;
      padding: 15px 0;
      border-block: 1px solid var(--color-border);
    }
    .empty {
      padding: 40px;
      color: var(--color-text-secondary);
      text-align: center;
    }
    .error {
      color: var(--color-critical);
    }
    @media (max-width: 900px) {
      .dispense-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PharmacistDispensing {
  readonly rx = inject(PrescriptionService);
  readonly inventory = inject(InventoryService);
  private http = inject(HttpClient);
  pending = computed(() => this.rx.prescriptions().filter((r) => r.status === 'Pending'));
  selected = signal<Prescription | null>(null);
  saving = signal(false);
  error = signal('');
  success = signal('');
  verified = false;
  lines: { inventoryId: string; quantity: number }[] = [];
  usableStock = computed(() =>
    this.inventory
      .items()
      .filter(
        (i) =>
          i.qty > 0 &&
          new Date(i.expiry).getTime() >= new Date(new Date().toDateString()).getTime(),
      ),
  );
  constructor() {
    this.refresh();
  }
  refresh() {
    void this.rx.loadPrescriptions(undefined, true);
    void this.inventory.loadInventory(true);
  }
  select(rx: Prescription) {
    this.selected.set(rx);
    this.lines = [{ inventoryId: '', quantity: 1 }];
    this.verified = false;
    this.error.set('');
  }
  total() {
    return this.lines.reduce(
      (sum, line) =>
        sum +
        Number(this.inventory.items().find((i) => i.id === line.inventoryId)?.unit_price || 0) *
          Number(line.quantity || 0),
      0,
    );
  }
  valid() {
    return (
      this.lines.length > 0 &&
      this.lines.every((l) => l.inventoryId && Number.isInteger(l.quantity) && l.quantity > 0) &&
      new Set(this.lines.map((l) => l.inventoryId)).size === this.lines.length
    );
  }
  async dispense() {
    const rx = this.selected();
    if (!rx || !this.valid() || !this.verified || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const r = await firstValueFrom(
        this.http.patch<{ data: { invoiceNumber: string } }>(
          `${getApiBaseUrl()}/prescriptions/${rx.id}/dispense`,
          { items: this.lines },
        ),
      );
      this.success.set(
        `Dispensed for ${rx.name}. Invoice ${r.data.invoiceNumber} is available at the billing desk and in the patient portal.`,
      );
      this.selected.set(null);
      this.refresh();
    } catch (e: any) {
      this.error.set(e.error?.message || 'Unable to dispense prescription.');
    } finally {
      this.saving.set(false);
    }
  }
}
