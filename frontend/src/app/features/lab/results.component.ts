import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseCard } from '../../shared/components/base-card/base-card.component';
import { BaseTable, TableColumn } from '../../shared/components/base-table/base-table.component';
import { BaseModal } from '../../shared/components/base-modal/base-modal.component';
import { LabOrderService, LabOrder } from '../../core/services/lab-order.service';

@Component({
  selector: 'app-lab-results',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseCard, BaseTable, BaseModal],
  template: `
    <div class="results-container animate-fade">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Pathology Results Entry & Clinical Validation</h1>
          <p class="page-sub">Transcribe analyzer findings, review reference range flags, detect critical lab alerts, and publish verified electronic reports.</p>
        </div>
        <div class="header-status">
          <span class="lis-tag">
            <span class="live-dot"></span> Analytical Benchmark Verification
          </span>
        </div>
      </div>

      <!-- Quick Metrics -->
      <div class="metrics-grid">
        <app-base-card [border]="true" elevation="sm" statusBorder="semi-urgent">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Pending Result Entry</span>
            <h3 class="metric-val text-orange">{{ pendingResultsCount() }}</h3>
            <span class="metric-sub text-orange">Awaiting technician input</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Verified Today</span>
            <h3 class="metric-val text-green">{{ verifiedTodayCount() }}</h3>
            <span class="metric-sub text-green">Dispatched to EMR</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Total Lab Workload</span>
            <h3 class="metric-val text-blue">{{ totalCount() }}</h3>
            <span class="metric-sub text-muted">All active orders</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Standard Turnaround</span>
            <h3 class="metric-val text-purple">45 min</h3>
            <span class="metric-sub text-muted">Intake to report</span>
          </div>
        </app-base-card>
      </div>

      <!-- Filter Tabs -->
      <div class="filters-row">
        <div class="filter-tabs">
          <button class="tab-btn" [class.active]="filter() === 'pending'" (click)="filter.set('pending')">
            Pending Results ({{ pendingResultsCount() }})
          </button>
          <button class="tab-btn" [class.active]="filter() === 'completed'" (click)="filter.set('completed')">
            Completed Reports ({{ verifiedTodayCount() }})
          </button>
          <button class="tab-btn" [class.active]="filter() === 'all'" (click)="filter.set('all')">
            All Orders ({{ totalCount() }})
          </button>
        </div>
      </div>

      <div class="status-banner success" *ngIf="successMessage()">{{ successMessage() }}</div>
      <div class="status-banner error" *ngIf="errorMessage()">{{ errorMessage() }}</div>

      <!-- Table of Orders -->
      <app-base-card [border]="true" elevation="sm">
        <div card-body class="p-0">
          <app-base-table
            [columns]="columns"
            [data]="filteredData()"
            [totalItems]="filteredData().length"
            [pageSize]="10"
            [currentPage]="1"
            [showSearch]="true"
            searchPlaceholder="Search by patient name, UHID, or test..."
            (actionClick)="onAction($event)"
          ></app-base-table>
        </div>
      </app-base-card>

      <!-- Results Input / View Modal -->
      <app-base-modal
        [isOpen]="isModalOpen()"
        [title]="selectedOrder() ? 'Diagnostic Results Entry — ' + selectedOrder()?.testName : 'Results Entry'"
        size="md"
        (close)="closeModal()"
      >
        <div modal-body class="modal-content-wrap" *ngIf="selectedOrder() as ord">
          <div class="order-summary-box">
            <div class="summary-item">
              <span class="lbl">Patient:</span>
              <strong class="val">{{ ord.name }}</strong>
            </div>
            <div class="summary-item">
              <span class="lbl">UHID:</span>
              <span class="val">{{ ord.name_subtitle }}</span>
            </div>
            <div class="summary-item">
              <span class="lbl">Test:</span>
              <span class="val font-semibold">{{ ord.testName }}</span>
            </div>
            <div class="summary-item">
              <span class="lbl">Ordering Doctor:</span>
              <span class="val">{{ ord.doctor }}</span>
            </div>
          </div>

          <!-- Parameter Entry Fields -->
          <div class="params-entry-form">
            <h4 class="form-section-title">Quantitative Diagnostic Parameters</h4>

            <div class="param-input-row">
              <div class="param-meta">
                <span class="param-name">Hemoglobin (Hb)</span>
                <span class="param-range text-muted">Normal Range: 13.0 - 17.5 g/dL</span>
              </div>
              <div class="param-field-wrap">
                <input type="number" step="0.1" [(ngModel)]="formHb" class="num-input" placeholder="e.g. 14.2" />
                <span class="unit-tag">g/dL</span>
                <span class="range-badge" [class.alert]="formHb && (formHb < 12 || formHb > 18)">
                  {{ formHb ? (formHb < 12 ? 'LOW' : formHb > 18 ? 'HIGH' : 'NORMAL') : '—' }}
                </span>
              </div>
            </div>

            <div class="param-input-row">
              <div class="param-meta">
                <span class="param-name">White Blood Cells (WBC)</span>
                <span class="param-range text-muted">Normal Range: 4,000 - 11,000 /mcL</span>
              </div>
              <div class="param-field-wrap">
                <input type="number" [(ngModel)]="formWbc" class="num-input" placeholder="e.g. 6800" />
                <span class="unit-tag">/mcL</span>
                <span class="range-badge" [class.alert]="formWbc && (formWbc < 4000 || formWbc > 12000)">
                  {{ formWbc ? (formWbc < 4000 ? 'LOW' : formWbc > 12000 ? 'HIGH' : 'NORMAL') : '—' }}
                </span>
              </div>
            </div>

            <div class="param-input-row">
              <div class="param-meta">
                <span class="param-name">Total Serum Cholesterol</span>
                <span class="param-range text-muted">Normal Range: &lt; 200 mg/dL</span>
              </div>
              <div class="param-field-wrap">
                <input type="number" [(ngModel)]="formChol" class="num-input" placeholder="e.g. 185" />
                <span class="unit-tag">mg/dL</span>
                <span class="range-badge" [class.alert]="formChol && formChol >= 200">
                  {{ formChol ? (formChol >= 200 ? 'ELEVATED' : 'NORMAL') : '—' }}
                </span>
              </div>
            </div>

            <div class="param-input-row">
              <div class="param-meta">
                <span class="param-name">Triglycerides</span>
                <span class="param-range text-muted">Normal Range: &lt; 150 mg/dL</span>
              </div>
              <div class="param-field-wrap">
                <input type="number" [(ngModel)]="formTrig" class="num-input" placeholder="e.g. 130" />
                <span class="unit-tag">mg/dL</span>
                <span class="range-badge" [class.alert]="formTrig && formTrig >= 150">
                  {{ formTrig ? (formTrig >= 150 ? 'BORDERLINE' : 'NORMAL') : '—' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div modal-footer>
          <button class="btn-cancel" (click)="closeModal()">Cancel</button>
          <button
            class="btn-submit"
            [disabled]="!hasAtLeastOneValue() || isSubmitting()"
            (click)="submitResults()"
          >
            {{ isSubmitting() ? 'Publishing...' : 'Verify & Publish Report' }}
          </button>
        </div>
      </app-base-modal>
    </div>
  `,
  styles: `
    .results-container {
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
    .lis-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-full);
      font-size: 12px;
      color: var(--color-text-secondary);
    }
    .live-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
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
    .text-orange { color: #f59e0b; }
    .text-green { color: #10b981; }
    .text-blue { color: #3b82f6; }
    .text-purple { color: #8b5cf6; }

    .filters-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .filter-tabs {
      display: flex;
      gap: 8px;
    }
    .tab-btn {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      padding: 6px 14px;
      border-radius: var(--border-radius-full);
      font-size: 12px;
      color: var(--color-text-secondary);
      cursor: pointer;
      font-weight: 500;
    }
    .tab-btn.active {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: #ffffff;
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

    .modal-content-wrap {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }
    .order-summary-box {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--spacing-sm);
      padding: var(--spacing-md);
      background: var(--color-bg-base);
      border-radius: var(--border-radius-sm);
      border: 1px solid var(--color-border);
    }
    .summary-item {
      display: flex;
      flex-direction: column;
    }
    .summary-item .lbl {
      font-size: 11px;
      color: var(--color-text-secondary);
    }
    .summary-item .val {
      font-size: 13px;
      color: var(--color-text-primary);
    }

    .params-entry-form {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }
    .form-section-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--color-text-primary);
      margin-bottom: 2px;
    }
    .param-input-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-sm);
    }
    .param-meta {
      display: flex;
      flex-direction: column;
    }
    .param-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .param-range {
      font-size: 11px;
    }
    .param-field-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .num-input {
      width: 90px;
      padding: 6px 8px;
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-sm);
      background: var(--color-bg-base);
      color: var(--color-text-primary);
      font-size: 13px;
      text-align: right;
    }
    .unit-tag {
      font-size: 11px;
      color: var(--color-text-muted);
      width: 35px;
    }
    .range-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: var(--border-radius-full);
      background: var(--color-bg-surface-hover);
      color: var(--color-text-secondary);
      min-width: 55px;
      text-align: center;
    }
    .range-badge.alert {
      background: #fef2f2;
      color: #dc2626;
      border: 1px solid #fecaca;
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
    .btn-submit {
      background: var(--color-primary);
      color: #ffffff;
      border: none;
      padding: 8px 18px;
      border-radius: var(--border-radius-sm);
      cursor: pointer;
      font-weight: 600;
    }
    .btn-submit[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `
})
export class LabResults implements OnInit {
  protected labService = inject(LabOrderService);

  filter = signal<'pending' | 'completed' | 'all'>('pending');
  isModalOpen = signal(false);
  selectedOrder = signal<LabOrder | null>(null);

  formHb: number | null = null;
  formWbc: number | null = null;
  formChol: number | null = null;
  formTrig: number | null = null;

  isSubmitting = signal(false);
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  columns: TableColumn[] = [
    { header: 'Order ID', key: 'id', width: '110px', align: 'center' },
    { header: 'Patient Name', key: 'name', type: 'avatar', width: '180px' },
    { header: 'UHID', key: 'name_subtitle', width: '140px' },
    { header: 'Test Name', key: 'testName', width: '220px' },
    { header: 'Ordering Clinician', key: 'doctor', width: '150px' },
    {
      header: 'Status',
      key: 'status',
      type: 'badge',
      width: '130px',
      badgeMap: {
        'Received': { label: 'Awaiting Phlebotomy', class: 'pill-urgent' },
        'Collected': { label: 'Ready for Entry', class: 'pill-info' },
        'Analysis': { label: 'In Analyzer', class: 'pill-secondary' },
        'Completed': { label: 'Published & Verified', class: 'pill-normal' }
      }
    },
    {
      header: 'Actions',
      key: 'actions',
      type: 'actions',
      width: '120px',
      align: 'center',
      actions: [
        {
          label: 'Enter Results',
          action: 'enterResults',
          class: 'btn-primary',
          tooltip: 'Enter clinical pathology values',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>'
        }
      ]
    }
  ];

  totalCount = computed(() => this.labService.labOrders().length);
  pendingResultsCount = computed(() =>
    this.labService.labOrders().filter(o => o.status === 'Collected' || o.status === 'Analysis' || o.status === 'Received').length
  );
  verifiedTodayCount = computed(() =>
    this.labService.labOrders().filter(o => o.status === 'Completed').length
  );

  filteredData = computed(() => {
    const f = this.filter();
    const orders = this.labService.labOrders();
    if (f === 'pending') return orders.filter(o => o.status !== 'Completed');
    if (f === 'completed') return orders.filter(o => o.status === 'Completed');
    return orders;
  });

  ngOnInit() {
    void this.labService.loadOrders();
  }

  onAction(event: { action: string, row: LabOrder }) {
    if (event.action === 'enterResults') {
      this.selectedOrder.set(event.row);
      this.formHb = event.row.results?.hb ?? null;
      this.formWbc = event.row.results?.wbc ?? null;
      this.formChol = event.row.results?.chol ?? null;
      this.formTrig = event.row.results?.trig ?? null;
      this.isModalOpen.set(true);
    }
  }

  hasAtLeastOneValue(): boolean {
    return this.formHb !== null || this.formWbc !== null || this.formChol !== null || this.formTrig !== null;
  }

  closeModal() {
    this.isModalOpen.set(false);
    this.selectedOrder.set(null);
  }

  async submitResults() {
    const ord = this.selectedOrder();
    if (!ord) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const results: any = {};
    if (this.formHb !== null) results.hb = Number(this.formHb);
    if (this.formWbc !== null) results.wbc = Number(this.formWbc);
    if (this.formChol !== null) results.chol = Number(this.formChol);
    if (this.formTrig !== null) results.trig = Number(this.formTrig);

    try {
      await this.labService.enterResults(ord.id, results);
      this.successMessage.set(`Diagnostic results published for ${ord.name} (${ord.testName}).`);
      this.closeModal();
      setTimeout(() => this.successMessage.set(null), 4000);
    } catch {
      this.errorMessage.set('Failed to publish lab results. Please try again.');
      setTimeout(() => this.errorMessage.set(null), 4000);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
