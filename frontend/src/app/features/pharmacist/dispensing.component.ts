import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseCard } from '../../shared/components/base-card/base-card.component';
import { BaseTable, TableColumn } from '../../shared/components/base-table/base-table.component';
import { BaseModal } from '../../shared/components/base-modal/base-modal.component';
import { PrescriptionService, Prescription } from '../../core/services/prescription.service';

@Component({
  selector: 'app-pharmacist-dispensing',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseCard, BaseTable, BaseModal],
  template: `
    <div class="dispensing-container animate-fade">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Digital Prescription Dispensing Queue</h1>
          <p class="page-sub">Review outpatient and inpatient doctor prescriptions, perform clinical safety checks, and authorize drug releases.</p>
        </div>
        <div class="header-badge">
          <span class="active-badge">
            <span class="live-dot"></span> Active Dispensary Terminal
          </span>
        </div>
      </div>

      <!-- Quick Metrics -->
      <div class="metrics-grid">
        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-label">Pending Dispensation</span>
            <h3 class="metric-value text-orange">{{ pendingCount() }}</h3>
            <span class="metric-sub">Awaiting verification</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-label">Dispensed Today</span>
            <h3 class="metric-value text-green">{{ dispensedCount() }}</h3>
            <span class="metric-sub">Processed orders</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-label">Total Prescriptions</span>
            <h3 class="metric-value">{{ totalOrders() }}</h3>
            <span class="metric-sub">All logged Rx</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-label">Average Check Time</span>
            <h3 class="metric-value text-blue">2.4 min</h3>
            <span class="metric-sub">Pharmacist throughput</span>
          </div>
        </app-base-card>
      </div>

      <!-- Filter Tabs & Status Banners -->
      <div class="filter-row">
        <div class="tab-group">
          <button class="tab-btn" [class.active]="filterTab() === 'all'" (click)="filterTab.set('all')">
            All Orders ({{ totalOrders() }})
          </button>
          <button class="tab-btn" [class.active]="filterTab() === 'pending'" (click)="filterTab.set('pending')">
            Pending Dispensation ({{ pendingCount() }})
          </button>
          <button class="tab-btn" [class.active]="filterTab() === 'dispensed'" (click)="filterTab.set('dispensed')">
            Dispensed ({{ dispensedCount() }})
          </button>
        </div>
      </div>

      <div class="status-banner success" *ngIf="successMessage()">{{ successMessage() }}</div>
      <div class="status-banner error" *ngIf="errorMessage()">{{ errorMessage() }}</div>

      <!-- Prescriptions Table -->
      <app-base-card [border]="true" elevation="sm">
        <div card-body class="p-0">
          <app-base-table
            [columns]="columns"
            [data]="filteredOrders()"
            [totalItems]="filteredOrders().length"
            [pageSize]="10"
            [currentPage]="1"
            [showSearch]="true"
            searchPlaceholder="Search by patient name, UHID, or medicine..."
            (actionClick)="onAction($event)"
          ></app-base-table>
        </div>
      </app-base-card>

      <!-- Safety Verification & Dispense Modal -->
      <app-base-modal
        [isOpen]="isModalOpen()"
        [title]="selectedOrder() ? 'Clinical Safety Check & Dispense — ' + selectedOrder()?.name : 'Safety Check'"
        size="md"
        (close)="closeModal()"
      >
        <div modal-body class="modal-content-wrap" *ngIf="selectedOrder() as ord">
          <div class="patient-summary-box">
            <div class="summary-field">
              <span class="field-lbl">Patient Name:</span>
              <strong class="field-val">{{ ord.name }}</strong>
            </div>
            <div class="summary-field">
              <span class="field-lbl">Identifier / UHID:</span>
              <span class="field-val">{{ ord.name_subtitle }}</span>
            </div>
            <div class="summary-field">
              <span class="field-lbl">Prescribing Physician:</span>
              <span class="field-val">{{ ord.doctor }}</span>
            </div>
            <div class="summary-field">
              <span class="field-lbl">Date Prescribed:</span>
              <span class="field-val">{{ ord.date }}</span>
            </div>
          </div>

          <!-- Allergy alert -->
          <div class="allergy-warning" *ngIf="hasAllergyRisk(ord)">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            <div>
              <strong>ALLERGY SAFETY PROTOCOL:</strong> Cross-check patient chart for documented Beta-lactam / Penicillin adverse reactions before dispensing.
            </div>
          </div>

          <div class="meds-checklist">
            <h4 class="box-title">Prescribed Medication Verification</h4>
            <div class="check-item">
              <input type="checkbox" [(ngModel)]="safetyStep1" id="step1" />
              <label for="step1">
                <strong>{{ ord.drugDetails }}</strong>
                <span class="sub-text">Correct dosage, formulation & route verified against electronic chart</span>
              </label>
            </div>
            <div class="check-item">
              <input type="checkbox" [(ngModel)]="safetyStep2" id="step2" />
              <label for="step2">
                Drug-drug interaction check completed. No critical contraindications.
              </label>
            </div>
            <div class="check-item">
              <input type="checkbox" [(ngModel)]="safetyStep3" id="step3" />
              <label for="step3">
                Patient counseling label & expiry date verified on medicine blister/bottle.
              </label>
            </div>
          </div>
        </div>

        <div modal-footer>
          <button class="btn-cancel" (click)="closeModal()">Cancel</button>
          <button
            class="btn-confirm"
            [disabled]="!canConfirm() || isSubmitting()"
            (click)="confirmDispense()"
          >
            {{ isSubmitting() ? 'Dispensing...' : 'Authorize & Dispense' }}
          </button>
        </div>
      </app-base-modal>
    </div>
  `,
  styles: `
    .dispensing-container {
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
    .active-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      background: var(--color-bg-surface-hover);
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
    .metric-label {
      font-size: 12px;
      color: var(--color-text-secondary);
    }
    .metric-value {
      font-size: 24px;
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 2px 0;
    }
    .metric-sub {
      font-size: 11px;
      color: var(--color-text-muted);
    }
    .text-orange { color: #f59e0b; }
    .text-green { color: #10b981; }
    .text-blue { color: #3b82f6; }

    .filter-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .tab-group {
      display: flex;
      gap: var(--spacing-xs);
      background: var(--color-bg-surface);
      padding: 3px;
      border-radius: var(--border-radius-sm);
      border: 1px solid var(--color-border);
    }
    .tab-btn {
      background: transparent;
      border: none;
      padding: 6px 14px;
      font-size: 13px;
      color: var(--color-text-secondary);
      border-radius: var(--border-radius-sm);
      cursor: pointer;
      font-weight: 500;
    }
    .tab-btn.active {
      background: var(--color-primary);
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
    .patient-summary-box {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--spacing-sm);
      padding: var(--spacing-md);
      background: var(--color-bg-base);
      border-radius: var(--border-radius-sm);
      border: 1px solid var(--color-border);
    }
    .summary-field {
      display: flex;
      flex-direction: column;
    }
    .field-lbl {
      font-size: 11px;
      color: var(--color-text-secondary);
    }
    .field-val {
      font-size: 13px;
      color: var(--color-text-primary);
    }
    .allergy-warning {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: var(--border-radius-sm);
      color: #dc2626;
      font-size: 12px;
    }
    .meds-checklist {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }
    .box-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--color-text-primary);
      margin-bottom: 2px;
    }
    .check-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 8px;
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-sm);
    }
    .check-item input {
      margin-top: 3px;
    }
    .check-item label {
      font-size: 12.5px;
      color: var(--color-text-primary);
      cursor: pointer;
      display: flex;
      flex-direction: column;
    }
    .check-item .sub-text {
      font-size: 11px;
      color: var(--color-text-secondary);
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
    .btn-confirm {
      background: var(--color-primary);
      color: #ffffff;
      border: none;
      padding: 8px 18px;
      border-radius: var(--border-radius-sm);
      cursor: pointer;
      font-weight: 600;
    }
    .btn-confirm[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `
})
export class PharmacistDispensing implements OnInit {
  protected prescriptionService = inject(PrescriptionService);

  filterTab = signal<'all' | 'pending' | 'dispensed'>('pending');
  isModalOpen = signal(false);
  selectedOrder = signal<Prescription | null>(null);

  safetyStep1 = false;
  safetyStep2 = false;
  safetyStep3 = false;
  isSubmitting = signal(false);
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  columns: TableColumn[] = [
    { header: 'Patient Name', key: 'name', type: 'avatar', width: '200px' },
    { header: 'UHID / Details', key: 'name_subtitle', width: '150px' },
    { header: 'Prescribed Drugs', key: 'drugDetails', width: '250px' },
    { header: 'Doctor', key: 'doctor', width: '160px' },
    {
      header: 'Status',
      key: 'status',
      type: 'badge',
      width: '120px',
      badgeMap: {
        'Pending': { label: 'Pending Rx', class: 'pill-urgent' },
        'Verifying': { label: 'In Review', class: 'pill-info' },
        'Dispensed': { label: 'Dispensed', class: 'pill-normal' }
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
          label: 'Dispense',
          action: 'dispense',
          class: 'btn-primary',
          tooltip: 'Verify clinical safety and dispense',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
        }
      ]
    }
  ];

  totalOrders = computed(() => this.prescriptionService.prescriptions().length);
  pendingCount = computed(() => this.prescriptionService.pendingForPharmacist().length);
  dispensedCount = computed(() =>
    this.prescriptionService.prescriptions().filter(p => p.status === 'Dispensed').length
  );

  filteredOrders = computed(() => {
    const tab = this.filterTab();
    const all = this.prescriptionService.prescriptions();
    if (tab === 'pending') {
      return all.filter(p => p.status !== 'Dispensed');
    }
    if (tab === 'dispensed') {
      return all.filter(p => p.status === 'Dispensed');
    }
    return all;
  });

  ngOnInit() {
    void this.prescriptionService.loadPrescriptions();
  }

  onAction(event: { action: string, row: any }) {
    if (event.action === 'dispense') {
      this.selectedOrder.set(event.row);
      this.safetyStep1 = false;
      this.safetyStep2 = false;
      this.safetyStep3 = false;
      this.isModalOpen.set(true);
    }
  }

  hasAllergyRisk(ord: Prescription): boolean {
    return ord.name?.toLowerCase().includes('rahul') ||
           ord.drugDetails?.toLowerCase().includes('amoxicillin') ||
           ord.drugDetails?.toLowerCase().includes('penicillin');
  }

  canConfirm(): boolean {
    return this.safetyStep1 && this.safetyStep2 && this.safetyStep3;
  }

  closeModal() {
    this.isModalOpen.set(false);
    this.selectedOrder.set(null);
  }

  async confirmDispense() {
    const ord = this.selectedOrder();
    if (!ord) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    try {
      await this.prescriptionService.dispensePrescription(ord.id);
      this.successMessage.set(`Dispensed prescription for ${ord.name} successfully.`);
      this.closeModal();
      setTimeout(() => this.successMessage.set(null), 4000);
    } catch {
      this.errorMessage.set('Failed to dispense prescription. Please try again.');
      setTimeout(() => this.errorMessage.set(null), 4000);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
