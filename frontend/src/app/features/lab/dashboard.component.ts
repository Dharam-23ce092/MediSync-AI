import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseCard } from '../../shared/components/base-card/base-card.component';
import { BaseTable, TableColumn } from '../../shared/components/base-table/base-table.component';
import { BaseModal } from '../../shared/components/base-modal/base-modal.component';
import { FormsModule } from '@angular/forms';
import { LabOrderService, LabOrder } from '../../core/services/lab-order.service';
import { DashboardService } from '../../core/services/dashboard.service';

@Component({
  selector: 'app-lab-dashboard',
  standalone: true,
  imports: [CommonModule, BaseCard, BaseTable, BaseModal, FormsModule],
  template: `
    <div class="lab-dashboard-container animate-fade">
      <!-- Title Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Laboratory Information System (LIS) Workspace</h1>
          <p class="page-sub">Access incoming clinical order tickets, check specimen collections, and validate diagnostic parameters.</p>
        </div>
        <div class="header-actions">
          <span class="active-lab-tag">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M10 2v7.31L4.62 19A2 2 0 0 0 6.38 22h11.24a2 2 0 0 0 1.76-3L14 9.31V2"></path><line x1="8.5" y1="2" x2="15.5" y2="2"></line><line x1="14" y1="9.31" x2="10" y2="9.31"></line></svg>
            Central Pathology Lab
          </span>
        </div>
      </div>

      <div class="lab-status-banner loading" *ngIf="labOrderService.loading()">
        Loading lab worklist from server...
      </div>
      <div class="lab-status-banner error" *ngIf="labError()">
        {{ labError() }}
      </div>
      <div class="lab-status-banner error" *ngIf="labOrderService.error() && !labOrderService.loading()">
        {{ labOrderService.error() }}
      </div>
      <div class="lab-status-banner success" *ngIf="labSuccess()">
        {{ labSuccess() }}
      </div>

      <!-- Quick Metrics Grid -->
      <div class="metrics-grid">
        <app-base-card [border]="true" elevation="sm">
          <div class="metric-card-content" card-body>
            <div class="metric-label">Pending Diagnostic Orders</div>
            <h3 class="metric-value text-orange">{{ pendingCount() }}</h3>
            <span class="metric-trend negative">Worklist backlog</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-card-content" card-body>
            <div class="metric-label">Specimens Collected</div>
            <h3 class="metric-value text-blue">{{ dashboardService.labMetricsData()?.samplesCollected ?? 0 }}</h3>
            <span class="metric-trend positive">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; margin-right: 2px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Barcodes scanned
            </span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-card-content" card-body>
            <div class="metric-label">Results Approved (Today)</div>
            <h3 class="metric-value text-green">{{ dashboardService.labMetricsData()?.completedOrders ?? 0 }}</h3>
            <span class="metric-trend positive">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; margin-right: 2px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Verified releases
            </span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm" statusBorder="critical">
          <div class="metric-card-content" card-body>
            <div class="metric-label">Critical Out-of-Range Alerts</div>
            <h3 class="metric-value text-red">{{ dashboardService.labMetricsData()?.criticalResults ?? 0 }}</h3>
            <span class="metric-trend negative" *ngIf="dashboardService.labMetricsData() && dashboardService.labMetricsData()!.criticalResults > 0">Requires urgent alert</span>
          </div>
        </app-base-card>
      </div>

      <!-- Lab Queue Table Section -->
      <div class="lab-queue-section">
        <app-base-card [border]="true" elevation="sm">
          <h3 class="section-title" card-header>
            Active Laboratory Diagnostic Worklist
            <span class="subtitle">Diagnostic requests waiting for specimen validation or parameters input</span>
          </h3>
          <div card-body class="p-0">
            <app-base-table
              [columns]="labColumns"
              [data]="ordersData()"
              [totalItems]="ordersData().length"
              [pageSize]="10"
              [currentPage]="1"
              [showSearch]="true"
              [showPagination]="true"
              (actionClick)="onLabAction($event)"
            ></app-base-table>
          </div>
        </app-base-card>
      </div>

      <!-- Result Entry Form Dialog -->
      <app-base-modal
        [isOpen]="isModalOpen()"
        [title]="selectedOrder() ? 'Enter Diagnostic Findings — ' + selectedOrder()?.testName : 'Lab Result Input'"
        size="md"
        (close)="closeModal()"
      >
        <div modal-body class="lab-modal-content" *ngIf="selectedOrder() as ord">
          <div class="patient-summary">
            <span><strong>Patient:</strong> {{ ord.name }} ({{ ord.name_subtitle }})</span>
            <span><strong>Ordering Clinician:</strong> {{ ord.doctor }}</span>
            <span><strong>Specimen Vial:</strong> {{ ord.specimen }}</span>
          </div>

          <!-- Parameter Input Form -->
          <div class="parameter-entry-box">
            <h4 class="sub-title">Enter Clinical Values:</h4>

            <div class="parameters-form-fields" *ngIf="ord.testName.includes('Complete Blood Count')">
              <div class="form-field">
                <label>Hemoglobin (g/dL) - [Normal Range: 13.5 - 17.5]</label>
                <input type="number" step="0.1" [(ngModel)]="paramHb" class="lab-input" />
              </div>
              <div class="form-field margin-top-sm">
                <label>White Blood Cells (cells/mcL) - [Normal Range: 4,000 - 11,000]</label>
                <input type="number" [(ngModel)]="paramWbc" class="lab-input" />
              </div>
            </div>

            <div class="parameters-form-fields" *ngIf="ord.testName.includes('Lipid')">
              <div class="form-field">
                <label>Total Cholesterol (mg/dL) - [Normal Range: < 200]</label>
                <input type="number" [(ngModel)]="paramChol" class="lab-input" />
              </div>
              <div class="form-field margin-top-sm">
                <label>Triglycerides (mg/dL) - [Normal Range: < 150]</label>
                <input type="number" [(ngModel)]="paramTrig" class="lab-input" />
              </div>
            </div>
          </div>
        </div>

        <div modal-footer>
          <button class="btn-cancel" (click)="closeModal()">Cancel</button>
          <button class="btn-verify" (click)="verifyAndSave()">Validate & Authorize Results</button>
        </div>
      </app-base-modal>
    </div>
  `,
  styles: `
    .lab-dashboard-container {
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
      font-weight: 700;
    }
    .page-sub {
      font-size: 13px;
      color: var(--color-text-secondary);
      margin-top: 1px;
    }
    .active-lab-tag {
      background-color: var(--color-primary-glow);
      color: var(--color-primary);
      border: 1px solid var(--color-primary);
      padding: 8px 14px;
      border-radius: var(--border-radius-md);
      font-weight: 600;
      font-size: 12.5px;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--spacing-md);
    }
    .metric-card-content {
      display: flex;
      flex-direction: column;
    }
    .metric-label {
      font-size: 12px;
      color: var(--color-text-secondary);
      font-weight: 500;
    }
    .metric-value {
      font-size: 24px;
      font-weight: 700;
      margin: 2px 0;
      line-height: 1;
    }
    .text-orange { color: var(--color-urgent); }
    .text-blue { color: var(--color-info); }
    .text-green { color: var(--color-normal); }
    .text-red { color: var(--color-critical); }
    .metric-trend {
      font-size: 11px;
    }
    .metric-trend.positive { color: var(--color-normal); }
    .metric-trend.negative { color: var(--color-critical); }

    .section-title {
      font-size: 15px;
      font-weight: 600;
      display: flex;
      flex-direction: column;
    }
    .section-title .subtitle {
      font-size: 11px;
      color: var(--color-text-muted);
      font-weight: 400;
      margin-top: 2px;
    }

    .lab-queue-section {
      display: flex;
      flex-direction: column;
    }

    /* Modal Styling */
    .lab-modal-content {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }
    .patient-summary {
      display: flex;
      flex-direction: column;
      gap: 4px;
      background-color: var(--color-bg-base);
      padding: var(--spacing-md);
      border-radius: var(--border-radius-md);
      border: 1px solid var(--color-border);
      font-size: 12.5px;
    }
    .parameter-entry-box {
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-md);
      padding: var(--spacing-md);
    }
    .parameter-entry-box .sub-title {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: var(--spacing-sm);
    }
    .form-field {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }
    .form-field label {
      font-size: 11.5px;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .lab-input {
      padding: 8px 12px;
      border-radius: var(--border-radius-sm);
      border: 1px solid var(--color-border);
      background-color: var(--color-bg-base);
      color: var(--color-text-primary);
      outline: none;
    }
    .lab-input:focus {
      border-color: var(--color-primary);
      background-color: var(--color-bg-surface);
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
    .btn-verify {
      background-color: var(--color-primary);
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      border-radius: var(--border-radius-sm);
      cursor: pointer;
      font-weight: 600;
    }
    .margin-top-sm { margin-top: var(--spacing-sm); }

    .lab-status-banner {
      padding: 10px 14px;
      border-radius: var(--border-radius-md);
      font-size: 13px;
      font-weight: 500;
    }
    .lab-status-banner.loading {
      background-color: var(--color-info-light);
      border: 1px solid var(--color-info-border);
      color: var(--color-info);
    }
    .lab-status-banner.error {
      background-color: var(--color-critical-light);
      border: 1px solid var(--color-critical-border);
      color: var(--color-critical);
    }
    .lab-status-banner.success {
      background-color: var(--color-normal-light);
      border: 1px solid var(--color-normal-border);
      color: var(--color-normal);
    }
  `
})
export class LabDashboard implements OnInit {
  labColumns: TableColumn[] = [
    { header: 'Order Date', key: 'date', width: '120px' },
    { header: 'Patient Profile', key: 'name', type: 'avatar', width: '200px' },
    { header: 'Laboratory Test Type', key: 'testName', width: '240px' },
    { header: 'Ordering Clinician', key: 'doctor', width: '160px' },
    { header: 'Specimen Type', key: 'specimen', width: '130px', align: 'center' },
    {
      header: 'Order Status',
      key: 'status',
      type: 'badge',
      width: '130px',
      badgeMap: {
        'Received': { label: 'Order Received', class: 'pill-urgent' },
        'Collected': { label: 'Sample Ready', class: 'pill-info' },
        'Analysis': { label: 'In Analysis', class: 'pill-urgent' },
        'Completed': { label: 'Validated', class: 'pill-normal' }
      }
    },
    {
      header: 'Actions',
      key: 'actions',
      type: 'actions',
      width: '130px',
      align: 'center',
      actions: [
        {
          label: 'Enter Results',
          action: 'enter',
          class: 'btn-primary',
          tooltip: 'Key in laboratory findings values',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>'
        }
      ]
    }
  ];

  protected labOrderService = inject(LabOrderService);
  protected dashboardService = inject(DashboardService);

  ordersData = computed(() => this.labOrderService.labOrders() as LabOrder[]);
  pendingCount = computed(() => this.labOrderService.pendingCount());

  selectedOrder = signal<LabOrder | null>(null);
  isModalOpen = signal<boolean>(false);
  paramHb = 14.5;
  paramWbc = 7200;
  paramChol = 185;
  paramTrig = 135;
  labSuccess = signal<string | null>(null);
  labError = signal<string | null>(null);

  ngOnInit() {
    void this.labOrderService.loadOrders();
    void this.dashboardService.loadForRole('lab');
  }

  onLabAction(event: { action: string, row: LabOrder }) {
    if (event.action === 'enter') {
      this.selectedOrder.set(event.row);
      this.isModalOpen.set(true);
    }
  }

  closeModal() {
    this.isModalOpen.set(false);
    this.selectedOrder.set(null);
  }

  async verifyAndSave() {
    const ord = this.selectedOrder();
    if (!ord) return;

    const results: LabOrder['results'] = {};
    if (ord.testName.includes('Complete Blood Count')) {
      results.hb = this.paramHb;
      results.wbc = this.paramWbc;
    } else {
      results.chol = this.paramChol;
      results.trig = this.paramTrig;
    }

    try {
      await this.labOrderService.enterResults(ord.id, results);

      let detailsStr = '';
      if (ord.testName.includes('Complete Blood Count')) {
        detailsStr = `Hemoglobin: ${this.paramHb} g/dL, WBC: ${this.paramWbc} cells/mcL`;
      } else {
        detailsStr = `Cholesterol: ${this.paramChol} mg/dL, Triglycerides: ${this.paramTrig} mg/dL`;
      }

      this.labSuccess.set(`Results validated for ${ord.name}. ${detailsStr}`);
      this.closeModal();
      setTimeout(() => this.labSuccess.set(null), 5000);
    } catch {
      this.labError.set(this.labOrderService.error() || 'Failed to save lab results.');
    }
  }
}
