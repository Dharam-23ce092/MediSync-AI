import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { getApiBaseUrl } from '../../core/config/api.config';
@Component({
  selector: 'app-create-invoice',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: ` <div class="invoice-page">
    <a routerLink="/admin/billing">← Billing desk</a>
    <header>
      <h1>Create an invoice</h1>
      <p>Record explicit charges against a patient’s visit or admission.</p>
    </header>
    <section class="panel">
      <label
        >Patient case<select [(ngModel)]="caseId">
          <option value="">Select patient and case</option>
          <option *ngFor="let c of cases()" [value]="c.id">
            {{ c.patientName }} · {{ c.patientUhid }} · {{ c.caseNumber }}
          </option>
        </select></label
      >
      <div class="line" *ngFor="let item of items; let i = index">
        <label
          >Description<input
            [(ngModel)]="item.description"
            placeholder="e.g. Consultation fee" /></label
        ><label>Quantity<input type="number" min="1" step="1" [(ngModel)]="item.quantity" /></label
        ><label
          >Unit price (₹)<input
            type="number"
            min="0"
            step="0.01"
            [(ngModel)]="item.unitPrice" /></label
        ><button (click)="items.splice(i, 1)" aria-label="Remove charge">×</button>
      </div>
      <button (click)="items.push({ description: '', quantity: 1, unitPrice: 0 })">
        + Add charge
      </button>
      <div class="total">
        <span>Invoice total</span><strong>{{ total() | currency: 'INR' }}</strong>
      </div>
      <p>
        Only the listed charges will be recorded. Add any applicable tax as an explicit line item.
      </p>
      <p class="error" *ngIf="error()" role="alert">{{ error() }}</p>
      <p *ngIf="success()" role="status">
        {{ success() }} <a routerLink="/admin/billing">View invoices →</a>
      </p>
      <button class="primary" [disabled]="saving() || !caseId || !items.length" (click)="save()">
        {{ saving() ? 'Saving…' : 'Create invoice' }}
      </button>
    </section>
  </div>`,
  styles: `
    .invoice-page {
      max-width: 900px;
      margin: auto;
      display: grid;
      gap: 24px;
    }
    header h1 {
      font-size: 28px;
    }
    p {
      color: var(--color-text-secondary);
      font-size: 12px;
      margin: 8px 0;
    }
    .panel {
      padding: 28px;
      border: 1px solid var(--color-border);
      border-radius: 14px;
      background: var(--color-bg-surface);
    }
    label {
      display: grid;
      gap: 8px;
      font-size: 12px;
    }
    input,
    select,
    button {
      padding: 11px 13px;
      border: 1px solid var(--color-border);
      border-radius: 8px;
      background: var(--color-bg-surface);
      color: var(--color-text-primary);
      width: 100%;
    }
    button {
      cursor: pointer;
      width: auto;
    }
    .line {
      display: grid;
      grid-template-columns: 2fr 90px 130px 40px;
      gap: 12px;
      align-items: end;
      margin: 24px 0;
    }
    .total {
      padding: 20px 0;
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid var(--color-border);
      margin: 18px 0;
    }
    .primary {
      background: var(--color-primary);
      color: white;
      margin-top: 15px;
    }
    .error {
      color: var(--color-critical);
    }
    @media (max-width: 650px) {
      .line {
        grid-template-columns: 1fr 1fr;
      }
      .line label:first-child {
        grid-column: 1/-1;
      }
    }
  `,
})
export class CreateInvoiceComponent {
  private http = inject(HttpClient);
  cases = signal<any[]>([]);
  caseId = '';
  items = [{ description: '', quantity: 1, unitPrice: 0 }];
  saving = signal(false);
  error = signal('');
  success = signal('');
  constructor() {
    void this.load();
  }
  async load() {
    try {
      this.cases.set(
        (await firstValueFrom(this.http.get<{ data: any[] }>(`${getApiBaseUrl()}/cases`))).data,
      );
    } catch {
      this.error.set('Unable to load cases.');
    }
  }
  total() {
    return (
      this.items.reduce(
        (sum, i) => sum + Math.round(Number(i.quantity || 0) * Number(i.unitPrice || 0) * 100),
        0,
      ) / 100
    );
  }
  async save() {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const r = await firstValueFrom(
        this.http.post<{ data: { invoiceNumber: string } }>(`${getApiBaseUrl()}/billing`, {
          caseId: this.caseId,
          items: this.items,
        }),
      );
      this.success.set(`Invoice ${r.data.invoiceNumber} created.`);
      this.items = [{ description: '', quantity: 1, unitPrice: 0 }];
      this.caseId = '';
    } catch (e: any) {
      this.error.set(e.error?.message || 'Unable to create invoice.');
    } finally {
      this.saving.set(false);
    }
  }
}
