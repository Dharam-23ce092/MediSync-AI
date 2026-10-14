import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseCard } from '../../shared/components/base-card/base-card.component';
import { BaseModal } from '../../shared/components/base-modal/base-modal.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { BedService, Bed } from '../../core/services/bed.service';
import { DoctorService } from '../../core/services/doctor.service';
import { AuthService } from '../../core/services/auth.service';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-admin-beds',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseCard, BaseModal, TooltipDirective, RouterModule],
  template: `
    <div class="admin-beds-container animate-fade">
      <!-- Title Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Smart Bed & Room Allocation</h1>
          <p class="page-sub">Monitor ward occupancy, schedule cleanings, and allocate beds in real time.</p>
        </div>

        <!-- Filter Options -->
        <div class="filter-options">
          <button
            *ngFor="let filter of typeFilters"
            class="filter-tab-btn"
            [class.active]="selectedType() === filter.value"
            (click)="selectedType.set(filter.value)"
            appTooltip="Filter layout by unit type"
            tooltipPosition="bottom"
          >
            {{ filter.label }}
          </button>
        </div>
      </div>

      <details class="detail-sub-box"><summary>Add a bed to this hospital</summary><div class="alloc-form" style="display:flex;gap:12px;flex-wrap:wrap;padding-top:16px"><label>Bed name<input class="alloc-input" [(ngModel)]="newBedName" placeholder="e.g. Ward A / Bed 04" /></label><label>Ward category<select class="alloc-input" [(ngModel)]="newBedType"><option>General Ward</option><option>ICU</option><option>Private Room</option></select></label><button class="filter-tab-btn" [disabled]="actionSaving() || !newBedName.trim()" (click)="createBed()">Add bed</button></div></details>
      <!-- Status banners -->
      <div class="bed-status-banner loading" *ngIf="bedService.loading()">
        Loading bed map from server...
      </div>
      <div class="bed-status-banner error" *ngIf="bedError()">
        {{ bedError() }}
      </div>
      <div class="bed-status-banner error" *ngIf="bedService.error() && !bedService.loading()">
        {{ bedService.error() }}
      </div>
      <div class="bed-status-banner success" *ngIf="bedSuccess()">
        {{ bedSuccess() }}
      </div>

      <!-- Occupancy Stats Row -->
      <div class="occupancy-stats-row">
        <div class="stat-chip available">
          <span class="stat-num">{{ bedService.occupancyStats().available }}</span>
          <span class="stat-lbl">Available</span>
        </div>
        <div class="stat-chip occupied">
          <span class="stat-num">{{ bedService.occupancyStats().occupied }}</span>
          <span class="stat-lbl">Occupied</span>
        </div>
        <div class="stat-chip cleaning">
          <span class="stat-num">{{ bedService.occupancyStats().cleaning }}</span>
          <span class="stat-lbl">Cleaning</span>
        </div>
        <div class="stat-chip reserved">
          <span class="stat-num">{{ bedService.occupancyStats().reserved }}</span>
          <span class="stat-lbl">Reserved</span>
        </div>
        <div class="stat-chip total">
          <span class="stat-num">{{ bedService.occupancyStats().total }}</span>
          <span class="stat-lbl">Total</span>
        </div>
      </div>

      <!-- Color Legend Indicator -->
      <div class="legend-container">
        <div class="legend-item" appTooltip="Beds vacant and ready for admissions" tooltipPosition="top">
          <span class="legend-color available"></span> <span>Available</span>
        </div>
        <div class="legend-item" appTooltip="Beds currently occupied by patients" tooltipPosition="top">
          <span class="legend-color occupied"></span> <span>Occupied</span>
        </div>
        <div class="legend-item" appTooltip="Beds undergoing sanitization post-discharge" tooltipPosition="top">
          <span class="legend-color cleaning"></span> <span>Cleaning</span>
        </div>
        <div class="legend-item" appTooltip="Beds reserved for scheduled admissions" tooltipPosition="top">
          <span class="legend-color reserved"></span> <span>Reserved</span>
        </div>
      </div>

      <!-- Visual Beds Map Grid -->
      <div class="beds-matrix-grid">
        <div *ngFor="let bed of filteredBeds()" class="bed-item-wrapper" role="button" tabindex="0" [attr.aria-label]="bed.name + ' — ' + bed.status" (keydown.enter)="onBedClick(bed)" (keydown.space)="$event.preventDefault(); onBedClick(bed)" (click)="onBedClick(bed)">
          <app-base-card
            [interactive]="true"
            [border]="true"
            elevation="sm"
            [statusBorder]="getBedStatusBorder(bed.status)"
          >
            <div card-body class="bed-card-body">
              <div class="bed-meta">
                <span class="bed-name">{{ bed.name }}</span>
                <span class="bed-type-badge">{{ bed.type }}</span>
              </div>
              <div class="bed-status-status">
                <span class="status-indicator-dot" [ngClass]="bed.status"></span>
                <span class="status-lbl">{{ bed.status | uppercase }}</span>
              </div>
              <div class="bed-patient-info" *ngIf="bed.status === 'occupied'">
                <span class="patient-lbl">Patient:</span>
                <span class="patient-val">{{ bed.patientName }}</span>
              </div>
              <div class="bed-patient-info" *ngIf="bed.status === 'cleaning'">
                <span class="patient-lbl text-orange">Sanitization pending</span>
              </div>
              <div class="bed-patient-info" *ngIf="bed.status === 'available'">
                <span class="patient-lbl text-green">Ready for intake</span>
              </div>
              <div class="bed-patient-info" *ngIf="bed.status === 'reserved'">
                <span class="patient-lbl text-blue">Reserved: {{ bed.patientName }}</span>
              </div>
            </div>
          </app-base-card>
        </div>
      </div>

      <!-- Bed Details Action Modal -->
      <app-base-modal
        [isOpen]="isModalOpen()"
        [title]="selectedBed() ? 'Bed Allocation Manager — ' + selectedBed()?.name : 'Bed Manager'"
        size="md"
        (close)="closeModal()"
      >
        <div modal-body class="modal-body-content" *ngIf="selectedBed() as bed">
          <!-- Row Detail display -->
          <div class="modal-details-grid">
            <div class="modal-detail-row">
              <span class="detail-lbl">Bed Location:</span>
              <strong class="detail-val">{{ bed.name }}</strong>
            </div>
            <div class="modal-detail-row">
              <span class="detail-lbl">Ward Category:</span>
              <strong class="detail-val">{{ bed.type }}</strong>
            </div>
            <div class="modal-detail-row">
              <span class="detail-lbl">Current Status:</span>
              <span class="status-pill-badge" [ngClass]="bed.status">{{ bed.status | uppercase }}</span>
            </div>
          </div>

          <!-- Occupied Detail Box -->
          <div class="detail-sub-box" *ngIf="bed.status === 'occupied'">
            <h4 class="sub-box-title">Admitted Patient Clinical Profile</h4>
            <div class="sub-details-grid">
              <div class="sub-detail-item">
                <span class="sub-lbl">Patient Name:</span>
                <span class="sub-val font-semibold">{{ bed.patientName }}</span>
              </div>
              <div class="sub-detail-item">
                <span class="sub-lbl">UHID:</span>
                <span class="sub-val">{{ bed.uhid }}</span>
              </div>
              <div class="sub-detail-item" *ngIf="bed.age || bed.gender">
                <span class="sub-lbl">Demographics:</span>
                <span class="sub-val">{{ bed.age }} yrs / {{ bed.gender }}</span>
              </div>
              <div class="sub-detail-item" *ngIf="bed.bloodGroup">
                <span class="sub-lbl">Blood Group:</span>
                <span class="sub-val font-semibold text-rose">{{ bed.bloodGroup }}</span>
              </div>
              <div class="sub-detail-item">
                <span class="sub-lbl">Attending Physician:</span>
                <span class="sub-val">{{ bed.assignedDoctor || 'Assigned Duty Doctor' }}</span>
              </div>
              <div class="sub-detail-item" *ngIf="bed.allergies && bed.allergies.length">
                <span class="sub-lbl">Documented Allergies:</span>
                <span class="sub-val text-urgent font-medium">{{ bed.allergies.join(', ') }}</span>
              </div>
            </div>

            <!-- Active Case Card -->
            <div class="bed-case-banner" *ngIf="bed.diagnosis || bed.caseNumber">
              <div class="case-header-line">
                <span class="case-badge">Case #{{ bed.caseNumber || 'Active' }}</span>
                <a *ngIf="bed.caseId" [routerLink]="['/cases', bed.caseId]" (click)="closeModal()" class="view-case-link">
                  Open Case File →
                </a>
              </div>
              <div class="case-diag-line" *ngIf="bed.diagnosis">
                <strong>Diagnosis:</strong> {{ bed.diagnosis }}
              </div>
              <div class="case-complaint-line" *ngIf="bed.chiefComplaint">
                <span class="text-muted">Chief Complaint:</span> {{ bed.chiefComplaint }}
              </div>
            </div>
          </div>

          <!-- Reserved Detail Box -->
          <div class="detail-sub-box" *ngIf="bed.status === 'reserved'">
            <h4 class="sub-box-title">Reservation Details</h4>
            <div class="sub-details-grid">
              <div class="sub-detail-item">
                <span class="sub-lbl">Reserved For:</span>
                <span class="sub-val font-semibold">{{ bed.patientName }}</span>
              </div>
              <div class="sub-detail-item">
                <span class="sub-lbl">UHID:</span>
                <span class="sub-val">{{ bed.uhid }}</span>
              </div>
            </div>
          </div>

          <!-- Available Allocation Box Form -->
          <div class="detail-sub-box" *ngIf="bed.status === 'available'">
            <h4 class="sub-box-title">Allocate Bed for Admission</h4>
            <div class="alloc-form">
              <div class="form-block">
                <label class="form-label">Patient UHID:</label>
                <input type="text" [(ngModel)]="allocationUhid" class="alloc-input" placeholder="Enter patient UHID (e.g. UHID-2026-981240)" [disabled]="actionSaving()" />
              </div>
              <div class="form-block margin-top-sm">
                <label class="form-label">Assign Primary Consultant:</label>
                <select [(ngModel)]="allocationDoctor" class="alloc-input" [disabled]="actionSaving()"><option value="">Select consultant</option><option *ngFor="let doctor of doctorService.doctors()" [value]="doctor.id">{{ doctor.name }} · {{ doctor.specialty }}</option></select>
              </div>
            </div>
          </div>

          <!-- Cleaning Box -->
          <div class="cleaning-note" *ngIf="bed.status === 'cleaning'">
            <span class="cleaning-icon">🧹</span>
            <p class="cleaning-text">
              This bed is awaiting sanitization.
              Do not assign any patient until sanitation and safety check are complete.
            </p>
          </div>
        </div>

        <div modal-footer>
          <button class="modal-close-btn" (click)="closeModal()" [disabled]="actionSaving()">Cancel</button>

          <!-- Conditionally render Action Buttons -->
          <button *ngIf="selectedBed()?.status === 'reserved'" class="mark-ready-btn" [disabled]="actionSaving()" (click)="releaseReservation()">Release reservation for allocation</button>
          <button
            *ngIf="selectedBed()?.status === 'occupied'"
            class="discharge-action-btn"
            (click)="dischargePatient()"
            [disabled]="actionSaving()"
          >
            {{ actionSaving() ? 'Processing...' : 'Initiate Discharge (Mark Cleaning)' }}
          </button>
          <button
            *ngIf="selectedBed()?.status === 'cleaning'"
            class="mark-ready-btn"
            (click)="markBedReady()"
            [disabled]="actionSaving()"
          >
            {{ actionSaving() ? 'Processing...' : 'Mark Sanitation Completed' }}
          </button>
          <button
            *ngIf="selectedBed()?.status === 'available'"
            class="allocate-action-btn"
            [disabled]="!allocationUhid || actionSaving()"
            (click)="allocateBed()"
          >
            {{ actionSaving() ? 'Processing...' : 'Confirm Bed Allocation' }}
          </button>
        </div>
      </app-base-modal>
    </div>
  `,
  styles: `
    .admin-beds-container {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--spacing-xs);
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

    .filter-options {
      display: flex;
      background-color: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-md);
      padding: 4px;
    }
    .filter-tab-btn {
      background: transparent;
      border: none;
      color: var(--color-text-secondary);
      font-weight: 600;
      font-size: 12px;
      padding: 8px 16px;
      border-radius: var(--border-radius-sm);
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .filter-tab-btn.active {
      background-color: var(--color-primary);
      color: #ffffff;
    }

    .bed-status-banner {
      padding: 10px 14px;
      border-radius: var(--border-radius-md);
      font-size: 13px;
      font-weight: 500;
    }
    .bed-status-banner.loading {
      background-color: var(--color-info-light);
      border: 1px solid var(--color-info-border);
      color: var(--color-info);
    }
    .bed-status-banner.error {
      background-color: var(--color-critical-light);
      border: 1px solid var(--color-critical-border);
      color: var(--color-critical);
    }
    .bed-status-banner.success {
      background-color: var(--color-normal-light);
      border: 1px solid var(--color-normal-border);
      color: var(--color-normal);
    }

    .occupancy-stats-row {
      display: flex;
      gap: var(--spacing-sm);
    }
    .stat-chip {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--border-radius-md);
      border: 1px solid var(--color-border);
      background-color: var(--color-bg-base);
      min-width: 100px;
    }
    .stat-chip .stat-num {
      font-size: 20px;
      font-weight: 700;
    }
    .stat-chip .stat-lbl {
      font-size: 11px;
      color: var(--color-text-secondary);
      font-weight: 500;
    }
    .stat-chip.available .stat-num { color: var(--color-normal); }
    .stat-chip.occupied .stat-num { color: var(--color-critical); }
    .stat-chip.cleaning .stat-num { color: var(--color-semi-urgent); }
    .stat-chip.reserved .stat-num { color: var(--color-info); }
    .stat-chip.total .stat-num { color: var(--color-text-primary); }

    /* Legend */
    .legend-container {
      display: flex;
      gap: var(--spacing-lg);
      background-color: var(--color-bg-surface);
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--border-radius-sm);
      border: 1px solid var(--color-border);
      width: fit-content;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
      font-size: 12px;
      color: var(--color-text-secondary);
      font-weight: 500;
      cursor: help;
    }
    .legend-color {
      width: 12px;
      height: 12px;
      border-radius: 4px;
    }
    .legend-color.available { background-color: var(--color-normal); }
    .legend-color.occupied { background-color: var(--color-critical); }
    .legend-color.cleaning { background-color: var(--color-semi-urgent); }
    .legend-color.reserved { background-color: var(--color-info); }

    /* Visual Grid */
    .beds-matrix-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--spacing-md);
    }
    .bed-item-wrapper {
      height: 100%;
    }
    .bed-card-body {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }
    .bed-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .bed-name {
      font-weight: 700;
      font-size: 15px;
      color: var(--color-text-primary);
    }
    .bed-type-badge {
      font-size: 10px;
      font-weight: 600;
      color: var(--color-text-secondary);
      background-color: var(--color-bg-base);
      border: 1px solid var(--color-border);
      padding: 2px 6px;
      border-radius: var(--border-radius-sm);
    }
    .bed-status-status {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .status-indicator-dot {
      width: 6px;
      height: 6px;
      border-radius: var(--border-radius-full);
    }
    .status-indicator-dot.available { background-color: var(--color-normal); }
    .status-indicator-dot.occupied { background-color: var(--color-critical); }
    .status-indicator-dot.cleaning { background-color: var(--color-semi-urgent); }
    .status-indicator-dot.reserved { background-color: var(--color-info); }
    .status-lbl {
      font-size: 10px;
      font-weight: 700;
      color: var(--color-text-secondary);
    }
    .bed-patient-info {
      display: flex;
      gap: 4px;
      font-size: 12px;
      border-top: 1px dashed var(--color-border);
      padding-top: var(--spacing-xs);
    }
    .patient-lbl {
      color: var(--color-text-secondary);
    }
    .patient-val {
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .text-orange { color: var(--color-urgent); }
    .text-green { color: var(--color-normal); }
    .text-blue { color: var(--color-info); }

    /* Modal Styling */
    .modal-body-content {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }
    .modal-details-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--spacing-sm);
      background-color: var(--color-bg-base);
      padding: var(--spacing-md);
      border-radius: var(--border-radius-md);
      border: 1px solid var(--color-border);
    }
    .modal-detail-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .detail-lbl {
      font-size: 11px;
      color: var(--color-text-secondary);
    }
    .detail-val {
      font-size: 13px;
      color: var(--color-text-primary);
    }
    .status-pill-badge {
      display: inline-block;
      width: fit-content;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: var(--border-radius-full);
    }
    .status-pill-badge.available { background-color: var(--color-normal-light); color: var(--color-normal); }
    .status-pill-badge.occupied { background-color: var(--color-critical-light); color: var(--color-critical); }
    .status-pill-badge.cleaning { background-color: var(--color-semi-urgent-light); color: var(--color-semi-urgent); }
    .status-pill-badge.reserved { background-color: var(--color-info-light); color: var(--color-info); }

    .detail-sub-box {
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-md);
      padding: var(--spacing-md);
    }
    .sub-box-title {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: var(--spacing-sm);
      border-bottom: 1px dashed var(--color-border);
      padding-bottom: 4px;
    }
    .sub-details-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--spacing-sm);
    }
    .sub-detail-item {
      display: flex;
      flex-direction: column;
    }
    .sub-lbl {
      font-size: 11px;
      color: var(--color-text-secondary);
    }
    .sub-val {
      font-size: 12.5px;
      color: var(--color-text-primary);
    }
    .text-rose { color: #f43f5e; }
    .text-urgent { color: #f59e0b; }

    .bed-case-banner {
      margin-top: var(--spacing-sm);
      padding: 8px 12px;
      border-radius: var(--border-radius-sm);
      background-color: var(--color-bg-base);
      border: 1px solid var(--color-border);
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
    }
    .case-header-line {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2px;
    }
    .case-badge {
      background: var(--color-primary-glow);
      color: var(--color-primary);
      font-weight: 600;
      padding: 1px 6px;
      border-radius: var(--border-radius-full);
      font-size: 11px;
    }
    .view-case-link {
      color: var(--color-primary);
      text-decoration: none;
      font-weight: 500;
      cursor: pointer;
    }
    .view-case-link:hover {
      text-decoration: underline;
    }
    .case-diag-line {
      color: var(--color-text-primary);
    }
    .case-complaint-line {
      color: var(--color-text-secondary);
      font-size: 11px;
    }

    /* Form inside modal */
    .alloc-form {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }
    .form-block {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }
    .form-label {
      font-size: 11.5px;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .alloc-select, .alloc-input {
      padding: 8px 12px;
      border-radius: var(--border-radius-sm);
      border: 1px solid var(--color-border);
      background-color: var(--color-bg-base);
      font-size: 12.5px;
      outline: none;
    }
    .alloc-select:focus, .alloc-input:focus {
      border-color: var(--color-primary);
      background-color: var(--color-bg-surface);
    }
    .alloc-input:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .margin-top-sm { margin-top: var(--spacing-sm); }

    .cleaning-note {
      display: flex;
      gap: var(--spacing-md);
      padding: var(--spacing-md);
      background-color: var(--color-semi-urgent-light);
      border: 1px solid var(--color-semi-urgent-border);
      color: var(--color-cleaning);
      border-radius: var(--border-radius-md);
    }
    .cleaning-icon {
      font-size: 24px;
      line-height: 1;
    }
    .cleaning-text {
      font-size: 12px;
      line-height: 1.4;
    }

    /* Modal footer actions buttons */
    .modal-close-btn {
      background: transparent;
      border: 1px solid var(--color-border);
      color: var(--color-text-primary);
      padding: 8px 16px;
      border-radius: var(--border-radius-sm);
      cursor: pointer;
      font-weight: 500;
      font-size: 12.5px;
      transition: var(--transition-fast);
    }
    .modal-close-btn:hover:not([disabled]) { background-color: var(--color-bg-surface-hover); }
    .modal-close-btn[disabled] { opacity: 0.5; cursor: not-allowed; }

    .discharge-action-btn {
      background-color: var(--color-critical);
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      border-radius: var(--border-radius-sm);
      cursor: pointer;
      font-weight: 600;
      font-size: 12.5px;
      transition: var(--transition-fast);
    }
    .discharge-action-btn:hover:not([disabled]) { background-color: hsl(0, 84%, 40%); }
    .discharge-action-btn[disabled] { opacity: 0.5; cursor: not-allowed; }

    .mark-ready-btn {
      background-color: var(--color-normal);
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      border-radius: var(--border-radius-sm);
      cursor: pointer;
      font-weight: 600;
      font-size: 12.5px;
      transition: var(--transition-fast);
    }
    .mark-ready-btn:hover:not([disabled]) { background-color: hsl(162, 84%, 35%); }
    .mark-ready-btn[disabled] { opacity: 0.5; cursor: not-allowed; }

    .allocate-action-btn {
      background-color: var(--color-primary);
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      border-radius: var(--border-radius-sm);
      cursor: pointer;
      font-weight: 600;
      font-size: 12.5px;
      transition: var(--transition-fast);
    }
    .allocate-action-btn:hover:not([disabled]) { background-color: var(--color-primary-hover); }
    .allocate-action-btn[disabled] { opacity: 0.5; cursor: not-allowed; }
  `
})
export class AdminBeds {
  protected bedService = inject(BedService);
  protected doctorService = inject(DoctorService);
  private authService = inject(AuthService);

  selectedType = signal<string>('ALL');

  typeFilters = [
    { label: 'All Beds', value: 'ALL' },
    { label: 'ICU Unit', value: 'ICU' },
    { label: 'General Ward', value: 'General Ward' },
    { label: 'Private Wards', value: 'Private Room' }
  ];

  filteredBeds = computed(() => {
    const filter = this.selectedType();
    const data = this.bedService.beds();
    if (filter === 'ALL') return data;
    return data.filter(bed => bed.type === filter);
  });

  getBedStatusBorder(status: Bed['status']): any {
    switch (status) {
      case 'occupied': return 'critical';
      case 'cleaning': return 'semi-urgent';
      case 'reserved': return 'info';
      case 'available':
      default:
        return 'normal';
    }
  }

  selectedBed = signal<Bed | null>(null);
  isModalOpen = signal<boolean>(false);
  actionSaving = signal(false);
  bedSuccess = signal<string | null>(null);
  bedError = signal<string | null>(null);

  newBedName = '';
  newBedType = 'General Ward';
  async createBed() { if(this.actionSaving())return;this.actionSaving.set(true);this.bedError.set(null);try{await this.bedService.createBed(this.newBedName,this.newBedType);this.newBedName='';this.bedSuccess.set('Bed added and ready for allocation.');}catch{this.bedError.set(this.bedService.error());}finally{this.actionSaving.set(false);}}
  allocationUhid = '';
  allocationDoctor = '';

  ngOnInit() {
    const currentUser = this.authService.currentUser();
    this.allocationDoctor = currentUser?.role === 'doctor' ? currentUser.userId || '' : '';
    void this.doctorService.loadDoctors();
    void this.bedService.loadBeds();
  }

  onBedClick(bed: Bed) {
    this.selectedBed.set(bed);
    this.allocationUhid = '';
    this.isModalOpen.set(true);
  }

  closeModal() {
    if (this.actionSaving()) return;
    this.isModalOpen.set(false);
    this.selectedBed.set(null);
    this.bedSuccess.set(null);
  }

  async releaseReservation() {
    const bed = this.selectedBed();
    if (!bed) return;
    this.actionSaving.set(true);
    try {
      await this.bedService.releaseReservation(bed.id);
      this.isModalOpen.set(false);
      this.selectedBed.set(null);
      this.bedSuccess.set('Reservation released. Select the available bed to complete an admission.');
    } catch { this.bedError.set(this.bedService.error()); }
    finally { this.actionSaving.set(false); }
  }

  async dischargePatient() {
    const bed = this.selectedBed();
    if (!bed) return;

    this.actionSaving.set(true);
    try {
      await this.bedService.dischargeBed(bed.id);
      this.bedSuccess.set(`Bed ${bed.name} discharged and sent for cleaning.`);
      this.isModalOpen.set(false);
      this.selectedBed.set(null);
      setTimeout(() => this.bedSuccess.set(null), 4000);
    } catch {
      this.bedError.set(this.bedService.error() || 'Failed to discharge bed.');
    } finally {
      this.actionSaving.set(false);
    }
  }

  async markBedReady() {
    const bed = this.selectedBed();
    if (!bed) return;

    this.actionSaving.set(true);
    this.bedError.set(null);
    try {
      await this.bedService.markReady(bed.id);
      this.bedSuccess.set(`Bed ${bed.name} is now clean and AVAILABLE for admissions.`);
      this.isModalOpen.set(false);
      this.selectedBed.set(null);
      setTimeout(() => this.bedSuccess.set(null), 4000);
    } catch {
      this.bedError.set(this.bedService.error() || 'Failed to mark bed ready.');
    } finally {
      this.actionSaving.set(false);
    }
  }

  async allocateBed() {
    const bed = this.selectedBed();
    if (!bed || !this.allocationUhid.trim() || !this.allocationDoctor || this.actionSaving()) return;

    this.actionSaving.set(true);
    this.bedError.set(null);
    try {
      await this.bedService.allocateBed(
        bed.id,
        this.allocationUhid.trim(),
        'Patient',
        this.allocationDoctor
      );
      this.bedSuccess.set(`Bed ${bed.name} allocated to UHID ${this.allocationUhid}.`);
      this.isModalOpen.set(false);
      this.selectedBed.set(null);
      setTimeout(() => this.bedSuccess.set(null), 4000);
    } catch {
      this.bedError.set(this.bedService.error() || 'Failed to allocate bed.');
    } finally {
      this.actionSaving.set(false);
    }
  }
}
