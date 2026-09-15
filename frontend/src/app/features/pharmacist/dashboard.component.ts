import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseCard } from '../../shared/components/base-card/base-card.component';
import { BaseTable, TableColumn } from '../../shared/components/base-table/base-table.component';
import { BaseModal } from '../../shared/components/base-modal/base-modal.component';
import { FormsModule } from '@angular/forms';
import { PrescriptionService } from '../../core/services/prescription.service';
import { DashboardService } from '../../core/services/dashboard.service';
import { InventoryService, InventoryItem } from '../../core/services/inventory.service';

interface InventoryDrug {
  id: string;
  name: string;
  batch: string;
  qty: number;
  expiry: string;
  status: 'In Stock' | 'Low Stock' | 'Out of Stock';
}

@Component({
  selector: 'app-pharmacist-dashboard',
  standalone: true,
  imports: [CommonModule, BaseCard, BaseTable, BaseModal, FormsModule],
  template: `
    <div class="pharmacist-dashboard-container animate-fade">
      <!-- Title Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Pharmacy Dispensation & Inventory Control</h1>
          <p class="page-sub">Verify physician prescriptions, inspect safety parameters, and manage batch stock reserves.</p>
        </div>
        <div class="header-actions">
          <span class="active-store-tag">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
            Main OPD Pharmacy Branch
          </span>
        </div>
      </div>

      <div class="pharmacy-status-banner loading" *ngIf="dashboardService.loading()">
        Loading pharmacy metrics...
      </div>
      <div class="pharmacy-status-banner error" *ngIf="dashboardService.error() && !dashboardService.loading()">
        {{ dashboardService.error() }}
      </div>

      <!-- Quick Metrics Grid -->
      <div class="metrics-grid">
        <app-base-card [border]="true" elevation="sm">
          <div class="metric-card-content" card-body>
            <div class="metric-label">Pending Dispensation</div>
            <h3 class="metric-value text-orange">{{ dashboardService.pharmacistMetricsData()?.pendingDispensations ?? pendingCount() }}</h3>
            <span class="metric-trend negative">Urgent priority</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-card-content" card-body>
            <div class="metric-label">Dispensed Today</div>
            <h3 class="metric-value text-green">{{ dashboardService.pharmacistMetricsData()?.dispensedToday ?? 0 }}</h3>
            <span class="metric-trend positive">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; margin-right: 2px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Clean throughput
            </span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm" statusBorder="semi-urgent">
          <div class="metric-card-content" card-body>
            <div class="metric-label">Low Stock Alarms</div>
            <h3 class="metric-value text-orange">{{ dashboardService.pharmacistMetricsData()?.lowStockAlarms ?? 0 }}</h3>
            <span class="metric-trend negative">Reorder alerts</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-card-content" card-body>
            <div class="metric-label">Expiring Batches (30d)</div>
            <h3 class="metric-value">{{ dashboardService.pharmacistMetricsData()?.expiringBatches ?? 0 }}</h3>
            <span class="metric-trend neutral">Monitored</span>
          </div>
        </app-base-card>
      </div>

      <!-- Two Column Layout Grid -->
      <div class="pharmacy-grid">
        <!-- Inbound Prescriptions Queue -->
        <div class="queue-column">
          <app-base-card [border]="true" elevation="sm">
            <h3 class="section-title" card-header>
              Digital Prescription Dispensary Queue
              <span class="subtitle">Real-time prescription orders submitted by medical consultants</span>
            </h3>
            <div card-body class="p-0">
              <app-base-table
                [columns]="queueColumns"
                [data]="ordersData()"
                [totalItems]="ordersData().length"
                [pageSize]="10"
                [currentPage]="1"
                [showSearch]="false"
                [showPagination]="false"
                (actionClick)="onQueueAction($event)"
              ></app-base-table>
            </div>
          </app-base-card>
        </div>

        <!-- Drug Inventory Level Matrix -->
        <div class="inventory-column">
          <app-base-card [border]="true" elevation="sm">
            <h3 class="section-title" card-header>
              Essential Pharmacy Stock Matrix
              <span class="subtitle">Physical items count in inventory bin allocation</span>
            </h3>
            <div card-body class="p-0">
              <app-base-table
                [columns]="inventoryColumns"
                [data]="inventoryData()"
                [totalItems]="inventoryData().length"
                [pageSize]="10"
                [currentPage]="1"
                [showSearch]="true"
                [showPagination]="true"
                (actionClick)="onInventoryAction($event)"
              ></app-base-table>
            </div>
          </app-base-card>
        </div>
      </div>

      <!-- Prescription Dispense & Safety Check Modal -->
      <app-base-modal
        [isOpen]="isModalOpen()"
        [title]="selectedOrder() ? 'Dispense Verification — ' + selectedOrder()?.name : 'Dispense Verification'"
        size="md"
        (close)="closeModal()"
      >
        <div modal-body class="dispense-modal-content" *ngIf="selectedOrder() as ord">
          <div class="pharmacy-banner success" *ngIf="dispenseSuccess()">{{ dispenseSuccess() }}</div>
          <div class="pharmacy-banner error" *ngIf="dispenseError()">{{ dispenseError() }}</div>
          <div class="details-split">
            <div class="detail-row">
              <span class="lbl">Patient Name:</span>
              <strong class="val">{{ ord.name }}</strong>
            </div>
            <div class="detail-row">
              <span class="lbl">Consulting Clinician:</span>
              <span class="val">{{ ord.doctor }}</span>
            </div>
          </div>

          <!-- PHI allergy alert check -->
          <div class="drug-allergy-alert-banner" *ngIf="ord.name.includes('Rahul')">
            <span class="icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            </span>
            <div class="text">
              <strong>CRITICAL PHI ALLERGY ALERT:</strong> Patient is documented with a severe allergy to
              <strong>Penicillin</strong>. Verify drug ingredients before checking out.
            </div>
          </div>

          <!-- Prescribed items checklist -->
          <div class="prescribed-drugs-box">
            <h4 class="sub-title">Prescribed Items:</h4>
            <div class="drug-item-verify-row">
              <div class="cb-wrap">
                <input type="checkbox" [(ngModel)]="safetyChecked" class="verify-cb" />
                <div class="meta">
                  <span class="drug-name font-semibold">{{ ord.drugDetails }}</span>
                  <span class="spec-text text-muted">Directions: Once Daily (Morning) | Quantity: 30 Tabs</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div modal-footer>
          <button class="btn-close" (click)="closeModal()">Cancel</button>
          <button
            class="btn-dispense"
            [disabled]="!safetyChecked"
            (click)="confirmDispense()"
          >
            Confirm & Dispense Drugs
          </button>
        </div>
      </app-base-modal>
    </div>
  `,
  styles: `
    .pharmacist-dashboard-container {
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
      margin-top: 1px;
    }
    .active-store-tag {
      background: var(--color-bg-surface-hover);
      color: var(--color-accent);
      border: 1px solid var(--color-border);
      padding: 6px 14px;
      border-radius: var(--border-radius-full);
      font-weight: 500;
      font-size: 0.875rem;
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
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 2px 0;
      line-height: 1;
    }
    .text-orange { color: var(--color-urgent); }
    .text-green { color: var(--color-normal); }
    .metric-trend {
      font-size: 11px;
    }
    .metric-trend.positive { color: var(--color-normal); }
    .metric-trend.neutral { color: var(--color-text-muted); }
    .metric-trend.negative { color: var(--color-critical); }

    .pharmacy-grid {
      display: grid;
      grid-template-columns: 6.5fr 5.5fr;
      gap: var(--spacing-lg);
    }

    .section-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--color-text-primary);
      display: flex;
      flex-direction: column;
    }
    .section-title .subtitle {
      font-size: 11px;
      color: var(--color-text-secondary);
      font-weight: 400;
      margin-top: 2px;
    }

    /* Dispensation modal elements */
    .dispense-modal-content {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }
    .details-split {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      background-color: var(--color-bg-base);
      padding: var(--spacing-md);
      border-radius: var(--border-radius-md);
      border: 1px solid var(--color-border);
    }
    .detail-row {
      display: flex;
      flex-direction: column;
    }
    .detail-row .lbl {
      font-size: 11px;
      color: var(--color-text-secondary);
    }
    .detail-row .val {
      font-size: 13px;
      color: var(--color-text-primary);
    }

    .drug-allergy-alert-banner {
      display: flex;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) var(--spacing-md);
      background-color: var(--color-critical-light);
      border: 1px solid var(--color-critical-border);
      color: var(--color-critical);
      border-radius: var(--border-radius-md);
    }
    .drug-allergy-alert-banner .icon { font-size: 18px; line-height: 1; color: var(--color-critical); }
    .drug-allergy-alert-banner .text { font-size: 11.5px; line-height: 1.4; color: var(--color-text-body); }

    .prescribed-drugs-box {
      border: 1px solid var(--color-border);
      background-color: var(--color-bg-surface);
      border-radius: var(--border-radius-md);
      padding: var(--spacing-md);
    }
    .prescribed-drugs-box .sub-title {
      font-size: 12.5px;
      font-weight: 600;
      margin-bottom: var(--spacing-sm);
    }
    .drug-item-verify-row {
      background-color: var(--color-bg-base);
      padding: var(--spacing-sm) var(--spacing-md);
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-sm);
    }
    .cb-wrap {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
    }
    .verify-cb {
      width: 16px;
      height: 16px;
      accent-color: var(--color-primary);
      cursor: pointer;
    }
    .cb-wrap .meta {
      display: flex;
      flex-direction: column;
    }
    .cb-wrap .drug-name {
      font-size: 13px;
      color: var(--color-text-primary);
    }
    .cb-wrap .spec-text {
      font-size: 11px;
    }

    .btn-close {
      background: transparent;
      border: 1px solid var(--color-border);
      color: var(--color-text-primary);
      padding: 8px 16px;
      border-radius: var(--border-radius-sm);
      cursor: pointer;
      font-weight: 500;
    }
    .btn-dispense {
      background-color: var(--color-primary);
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      border-radius: var(--border-radius-sm);
      cursor: pointer;
      font-weight: 600;
    }
    .btn-dispense[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .pharmacy-banner {
      padding: 10px 14px;
      border-radius: var(--border-radius-md);
      font-size: 13px;
      font-weight: 500;
      margin-bottom: var(--spacing-md);
    }
    .pharmacy-banner.success {
      background-color: var(--color-normal-light);
      border: 1px solid var(--color-normal-border);
      color: var(--color-normal);
    }
    .pharmacy-banner.error {
      background-color: var(--color-critical-light);
      border: 1px solid var(--color-critical-border);
      color: var(--color-critical);
    }
  `
})
export class PharmacistDashboard implements OnInit {
  queueColumns: TableColumn[] = [
    { header: 'Patient Name', key: 'name', type: 'avatar', width: '180px' },
    { header: 'Physician', key: 'doctor', width: '140px' },
    { header: 'Medication Items', key: 'drugDetails', width: '220px' },
    {
      header: 'Order Status',
      key: 'status',
      type: 'badge',
      width: '120px',
      badgeMap: {
        'Pending': { label: 'Pending Rx', class: 'pill-urgent' },
        'Verifying': { label: 'In Check', class: 'pill-info' },
        'Dispensed': { label: 'Completed', class: 'pill-secondary' }
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
          label: 'Dispense',
          action: 'dispense',
          class: 'btn-primary',
          tooltip: 'Verify clinical safety checks and dispense',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
        }
      ]
    }
  ];

  inventoryColumns: TableColumn[] = [
    { header: 'Medicine Name', key: 'name', width: '180px', align: 'left' },
    { header: 'Batch No.', key: 'batch', width: '100px', align: 'center' },
    { header: 'Stock Qty', key: 'qty', width: '90px', align: 'center' },
    { header: 'Expiry Date', key: 'expiry', width: '110px' },
    {
      header: 'Alert Level',
      key: 'status',
      type: 'badge',
      width: '120px',
      badgeMap: {
        'In Stock': { label: 'In Stock', class: 'pill-normal' },
        'Low Stock': { label: 'Low Stock', class: 'pill-urgent' },
        'Out of Stock': { label: 'Critical Out', class: 'pill-critical' }
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
          label: 'Reorder',
          action: 'reorder',
          class: 'btn-secondary',
          tooltip: 'Request batch stock reorder',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>'
        }
      ]
    }
  ];
  protected prescriptionService = inject(PrescriptionService);
  protected dashboardService = inject(DashboardService);
  protected inventoryService = inject(InventoryService);

  ordersData = computed(() => this.prescriptionService.prescriptions() as any[]);
  inventoryData = computed(() => this.inventoryService.items());

  // Modal Verification states
  selectedOrder = signal<any | null>(null);
  isModalOpen = signal<boolean>(false);
  safetyChecked = false;
  dispenseSuccess = signal<string | null>(null);
  dispenseError = signal<string | null>(null);

  readonly pendingCount = computed(() => {
    return this.prescriptionService.pendingForPharmacist().length;
  });

  ngOnInit() {
    void this.prescriptionService.loadPrescriptions();
    void this.inventoryService.loadInventory();
    void this.dashboardService.loadForRole('pharmacist');
  }

  onQueueAction(event: { action: string, row: any }) {
    if (event.action === 'dispense') {
      this.selectedOrder.set(event.row);
      this.safetyChecked = false;
      this.isModalOpen.set(true);
    }
  }

  async onInventoryAction(event: { action: string, row: any }) {
    if (event.action === 'reorder') {
      try {
        const msg = await this.inventoryService.requestReorder(event.row.id);
        this.dispenseSuccess.set(msg);
        setTimeout(() => this.dispenseSuccess.set(null), 4000);
      } catch {
        this.dispenseError.set('Failed to submit reorder request.');
        setTimeout(() => this.dispenseError.set(null), 4000);
      }
    }
  }

  closeModal() {
    this.isModalOpen.set(false);
    this.selectedOrder.set(null);
  }

  async confirmDispense() {
    const ord = this.selectedOrder();
    if (!ord) return;

    this.dispenseError.set(null);
    try {
      await this.prescriptionService.dispensePrescription(ord.id);
      this.dispenseSuccess.set(`Successfully dispensed prescription #${ord.id} for ${ord.name}.`);
      this.closeModal();
      setTimeout(() => this.dispenseSuccess.set(null), 5000);
    } catch {
      this.dispenseError.set(this.prescriptionService.error() || 'Failed to dispense prescription.');
    }
  }
}
