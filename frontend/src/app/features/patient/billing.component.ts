import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseCard } from '../../shared/components/base-card/base-card.component';
import { BaseTable, TableColumn } from '../../shared/components/base-table/base-table.component';
import { BaseModal } from '../../shared/components/base-modal/base-modal.component';
import { BillingService, Invoice } from '../../core/services/billing.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-patient-billing',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseCard, BaseTable, BaseModal],
  template: `
    <div class="billing-page-container animate-fade">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Hospital Billing & Invoices</h1>
          <p class="page-sub">View itemized consultation fees, diagnostics, pharmacy medication charges, and settle balances online securely.</p>
        </div>
        <div class="user-info-chip">
          <span class="user-chip">
            UHID: {{ currentUhid() }} | {{ authService.currentUser()?.name }}
          </span>
        </div>
      </div>

      <!-- Financial Metrics -->
      <div class="metrics-grid">
        <app-base-card [border]="true" elevation="sm" statusBorder="critical">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Total Outstanding Due</span>
            <h3 class="metric-val text-red">₹{{ totalDue().toLocaleString('en-IN') }}</h3>
            <span class="metric-sub text-red">Pending payment settlement</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Total Paid to Date</span>
            <h3 class="metric-val text-green">₹{{ totalPaid().toLocaleString('en-IN') }}</h3>
            <span class="metric-sub text-green">Settled transactions</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Total Invoiced Volume</span>
            <h3 class="metric-val text-blue">₹{{ totalBilled().toLocaleString('en-IN') }}</h3>
            <span class="metric-sub text-muted">{{ myInvoices().length }} invoices generated</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Payment Status</span>
            <h3 class="metric-val" [class.text-green]="totalDue() === 0" [class.text-orange]="totalDue() > 0">
              {{ totalDue() === 0 ? 'Clear' : 'Pending' }}
            </h3>
            <span class="metric-sub text-muted">UPI, Cards, NetBanking</span>
          </div>
        </app-base-card>
      </div>

      <div class="status-banner success" *ngIf="successMessage()">{{ successMessage() }}</div>
      <div class="status-banner error" *ngIf="errorMessage()">{{ errorMessage() }}</div>

      <!-- Invoices Table -->
      <app-base-card [border]="true" elevation="sm">
        <div card-header class="card-head-bar">
          <span class="card-title">Patient Billing Invoices</span>
          <span class="card-sub">Itemized breakdown of clinical and hospital admissions</span>
        </div>
        <div card-body class="p-0">
          <app-base-table
            [columns]="columns"
            [data]="myInvoices()"
            [totalItems]="myInvoices().length"
            [pageSize]="10"
            [currentPage]="1"
            [showSearch]="false"
            (actionClick)="onAction($event)"
          ></app-base-table>
        </div>
      </app-base-card>

      <!-- Pay Invoice Modal -->
      <app-base-modal
        [isOpen]="isModalOpen()"
        [title]="selectedInvoice() ? 'Settle Payment — ' + selectedInvoice()?.invoiceNumber : 'Pay Invoice'"
        size="md"
        (close)="closeModal()"
      >
        <div modal-body class="pay-modal-wrap" *ngIf="selectedInvoice() as inv">
          <div class="inv-summary">
            <div class="sum-row">
              <span class="lbl">Invoice Number:</span>
              <strong class="val">{{ inv.invoiceNumber }}</strong>
            </div>
            <div class="sum-row">
              <span class="lbl">Total Charges:</span>
              <span class="val">₹{{ inv.total.toLocaleString('en-IN') }}</span>
            </div>
            <div class="sum-row">
              <span class="lbl">Previously Settled:</span>
              <span class="val text-green">₹{{ inv.paid.toLocaleString('en-IN') }}</span>
            </div>
            <div class="sum-row highlight">
              <span class="lbl">Balance Payable:</span>
              <strong class="val text-red">₹{{ inv.balance.toLocaleString('en-IN') }}</strong>
            </div>
          </div>

          <div class="payment-method-box">
            <label class="form-lbl">Select Payment Mode:</label>
            <div class="method-options">
              <label class="radio-label">
                <input type="radio" [(ngModel)]="payMethod" value="UPI / QR Code" />
                <span>UPI / QR Scan (Google Pay, PhonePe, Paytm)</span>
              </label>
              <label class="radio-label">
                <input type="radio" [(ngModel)]="payMethod" value="Credit/Debit Card" />
                <span>Credit / Debit Card (Visa, MasterCard, RuPay)</span>
              </label>
              <label class="radio-label">
                <input type="radio" [(ngModel)]="payMethod" value="Net Banking" />
                <span>Net Banking / RTGS</span>
              </label>
            </div>
          </div>
        </div>

        <div modal-footer>
          <button class="btn-cancel" (click)="closeModal()">Cancel</button>
          <button
            class="btn-pay"
            [disabled]="paying() || !selectedInvoice() || selectedInvoice()!.balance <= 0"
            (click)="submitPayment()"
          >
            {{ paying() ? 'Processing Payment...' : 'Pay ₹' + (selectedInvoice()?.balance || 0).toLocaleString('en-IN') }}
          </button>
        </div>
      </app-base-modal>
    </div>
  `,
  styles: `
    .billing-page-container {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-lg);
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .page-title {
      font-size: 22px;
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .page-sub {
      font-size: 13px;
      color: var(--color-text-secondary);
      margin-top: 2px;
    }
    .user-chip {
      padding: 6px 14px;
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-full);
      font-size: 12px;
      font-weight: 600;
      color: var(--color-text-primary);
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--spacing-md);
    }
    .metric-body {
      display: flex;
      flex-direction: column;
    }
    .metric-lbl {
      font-size: 12px;
      color: var(--color-text-secondary);
    }
    .metric-val {
      font-size: 24px;
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 2px 0;
    }
    .metric-sub {
      font-size: 11px;
    }
    .text-red { color: #ef4444; }
    .text-green { color: #10b981; }
    .text-blue { color: #3b82f6; }
    .text-orange { color: #f59e0b; }

    .card-head-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--spacing-md);
      border-bottom: 1px solid var(--color-border);
    }
    .card-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .card-sub {
      font-size: 12px;
      color: var(--color-text-muted);
    }

    .status-banner {
      padding: 10px 14px;
      border-radius: var(--border-radius-md);
      font-size: 13px;
      font-weight: 500;
    }
    .status-banner.success {
      background: var(--color-normal-light);
      border: 1px solid var(--color-normal-border);
      color: var(--color-normal);
    }
    .status-banner.error {
      background: var(--color-critical-light);
      border: 1px solid var(--color-critical-border);
      color: var(--color-critical);
    }

    .pay-modal-wrap {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }
    .inv-summary {
      background: var(--color-bg-base);
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-sm);
      padding: var(--spacing-md);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .sum-row {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
    }
    .sum-row.highlight {
      border-top: 1px dashed var(--color-border);
      padding-top: 6px;
      margin-top: 2px;
      font-size: 14px;
    }
    .sum-row .lbl {
      color: var(--color-text-secondary);
    }
    .sum-row .val {
      color: var(--color-text-primary);
    }

    .payment-method-box {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .form-lbl {
      font-size: 12.5px;
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .method-options {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .radio-label {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-sm);
      cursor: pointer;
      font-size: 13px;
    }

    .btn-cancel {
      background: transparent;
      border: 1px solid var(--color-border);
      color: var(--color-text-primary);
      padding: 8px 16px;
      border-radius: var(--border-radius-sm);
      cursor: pointer;
      font-weight: 500;
    }
    .btn-pay {
      background: #10b981;
      color: #ffffff;
      border: none;
      padding: 8px 20px;
      border-radius: var(--border-radius-sm);
      cursor: pointer;
      font-weight: 600;
    }
    .btn-pay[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `
})
export class PatientBilling implements OnInit {
  protected billingService = inject(BillingService);
  protected authService = inject(AuthService);

  isModalOpen = signal(false);
  selectedInvoice = signal<Invoice | null>(null);
  payMethod = 'UPI / QR Code';
  paying = signal(false);
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  columns: TableColumn[] = [
    { header: 'Invoice #', key: 'invoiceNumber', width: '150px' },
    { header: 'Date', key: 'date', width: '120px' },
    { header: 'Subtotal (₹)', key: 'subtotal', width: '110px', align: 'right' },
    { header: 'Tax (₹)', key: 'tax', width: '90px', align: 'right' },
    { header: 'Total Bill (₹)', key: 'total', width: '120px', align: 'right' },
    { header: 'Paid (₹)', key: 'paid', width: '110px', align: 'right' },
    { header: 'Balance Due (₹)', key: 'balance', width: '120px', align: 'right' },
    {
      header: 'Status',
      key: 'status',
      type: 'badge',
      width: '110px',
      badgeMap: {
        'PAID': { label: 'Settled', class: 'pill-normal' },
        'PENDING': { label: 'Due', class: 'pill-critical' },
        'PARTIAL': { label: 'Partial', class: 'pill-urgent' }
      }
    },
    {
      header: 'Actions',
      key: 'actions',
      type: 'actions',
      width: '110px',
      align: 'center',
      actions: [
        {
          label: 'Pay Now',
          action: 'pay',
          class: 'btn-primary',
          tooltip: 'Settle outstanding balance online',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>'
        }
      ]
    }
  ];

  currentUhid = computed(() => {
    const user = this.authService.currentUser();
    return user?.uhid || 'UHID-2026-981240';
  });

  myInvoices = computed(() => {
    const uhid = this.currentUhid();
    const all = this.billingService.invoices();
    const filtered = all.filter(inv => inv.uhid === uhid || inv.name === this.authService.currentUser()?.name);
    return filtered.length > 0 ? filtered : all;
  });

  totalDue = computed(() =>
    this.myInvoices().reduce((sum, inv) => sum + (inv.balance || 0), 0)
  );

  totalPaid = computed(() =>
    this.myInvoices().reduce((sum, inv) => sum + (inv.paid || 0), 0)
  );

  totalBilled = computed(() =>
    this.myInvoices().reduce((sum, inv) => sum + (inv.total || 0), 0)
  );

  ngOnInit() {
    void this.billingService.loadInvoices();
  }

  onAction(event: { action: string, row: Invoice }) {
    if (event.action === 'pay') {
      this.selectedInvoice.set(event.row);
      this.isModalOpen.set(true);
    }
  }

  closeModal() {
    this.isModalOpen.set(false);
    this.selectedInvoice.set(null);
  }

  async submitPayment() {
    const inv = this.selectedInvoice();
    if (!inv) return;

    this.paying.set(true);
    this.errorMessage.set(null);

    try {
      await this.billingService.payInvoice(inv.id, inv.balance, this.payMethod);
      this.successMessage.set(`Payment of ₹${inv.balance.toLocaleString('en-IN')} received for Invoice ${inv.invoiceNumber}. Receipt generated.`);
      this.closeModal();
      setTimeout(() => this.successMessage.set(null), 5000);
    } catch {
      this.errorMessage.set('Payment processing encountered an error.');
      setTimeout(() => this.errorMessage.set(null), 4000);
    } finally {
      this.paying.set(false);
    }
  }
}
