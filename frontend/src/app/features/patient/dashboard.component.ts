import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { BaseCard } from '../../shared/components/base-card/base-card.component';
import { BaseTable, TableColumn } from '../../shared/components/base-table/base-table.component';
import { BaseModal } from '../../shared/components/base-modal/base-modal.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { getApiBaseUrl } from '../../core/config/api.config';
import { PrescriptionService } from '../../core/services/prescription.service';
import { AuthService } from '../../core/services/auth.service';
import { LabOrderService } from '../../core/services/lab-order.service';
import { BillingService, Invoice } from '../../core/services/billing.service';
import { PatientStore } from '../../core/stores/patient.store';

@Component({
  selector: 'app-patient-dashboard',
  standalone: true,
  imports: [CommonModule, BaseCard, BaseTable, BaseModal, TooltipDirective, FormsModule],
  template: `
    <div class="patient-dashboard-container animate-fade">
      <div *ngIf="patientStore.patients().length > 0">
      <!-- Patient Profile Summary Banner -->
      <div class="patient-profile-banner">
        <div class="avatar-col">
          <div class="profile-avatar-circle">{{ currentPatient()?.name?.charAt(0) || 'P' }}</div>
        </div>
        <div class="profile-details-col">
          <h1 class="patient-name">{{ currentPatient()?.name || 'Patient' }}</h1>
          <div class="patient-meta-grid">
            <div class="meta-item">
              <span class="meta-lbl">UHID:</span>
              <span class="meta-val font-semibold">{{ currentPatient()?.uhid || '—' }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-lbl">Demographics:</span>
              <span class="meta-val">{{ currentPatient()?.gender || '—' }}, {{ currentPatient()?.age || '—' }} yrs</span>
            </div>
            <div class="meta-item">
              <span class="meta-lbl">Blood Group:</span>
              <span class="meta-val font-semibold">{{ currentPatient()?.bloodGroup || '—' }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-lbl">Critical Allergies:</span>
              <span class="meta-val" [class.alert-allergy-pill]="hasAllergies()">{{ allergyDisplay() }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Status banners -->
      <div class="patient-banner loading" *ngIf="billingService.loading()">
        Loading billing records...
      </div>
      <div class="patient-banner error" *ngIf="billingService.error() && !billingService.loading()">
        {{ billingService.error() }}
      </div>
      <div class="patient-banner success" *ngIf="billingSuccess()">
        {{ billingSuccess() }}
      </div>

      <!-- Main Portal Action Shortcuts -->
      <div class="shortcuts-grid">
        <button class="shortcut-action-card primary" (click)="goToBook()" appTooltip="Book a consultation slots" tooltipPosition="bottom">
          <span class="sc-icon">📅</span>
          <div class="sc-info">
            <span class="sc-title">Book Appointment</span>
            <span class="sc-desc">Schedule slot with a clinician</span>
          </div>
        </button>

        <button class="shortcut-action-card accent" (click)="goToQueue()" appTooltip="Track active appointment queue token" tooltipPosition="bottom">
          <span class="sc-icon">⏱️</span>
          <div class="sc-info">
            <span class="sc-title">Live Wait Queue</span>
            <span class="sc-desc">Verify your token queue position</span>
          </div>
        </button>
      </div>

      <!-- Dashboard Columns Grid -->
      <div class="dashboard-cols-grid">
        <!-- Left: Prescriptions & Reports -->
        <div class="main-column flex flex-col gap-lg">
          <!-- Active Prescriptions -->
          <app-base-card [border]="true" elevation="sm">
            <h3 class="section-title" card-header>
              My Active Prescriptions & Medications
              <span class="subtitle">E-prescriptions issued by consulting physicians</span>
            </h3>
            <div card-body class="p-0">
              <app-base-table
                [columns]="prescriptionColumns"
                [data]="prescriptions()"
                [totalItems]="prescriptions().length"
                [pageSize]="10"
                [currentPage]="1"
                [showSearch]="false"
                [showPagination]="false"
                (actionClick)="onPrescriptionAction($event)"
              ></app-base-table>
            </div>
          </app-base-card>

          <!-- Recent Medical Records -->
          <app-base-card [border]="true" elevation="sm">
            <h3 class="section-title" card-header>
              Recent Laboratory & Diagnostic Reports
              <span class="subtitle">Download validated lab test reports</span>
            </h3>
            <div card-body class="p-0">
              <app-base-table
                [columns]="reportColumns"
                [data]="reports()"
                [totalItems]="reports().length"
                [pageSize]="10"
                [currentPage]="1"
                [showSearch]="false"
                [showPagination]="false"
                (actionClick)="onReportAction($event)"
              ></app-base-table>
            </div>
          </app-base-card>

          <!-- Billing History -->
          <app-base-card [border]="true" elevation="sm">
            <h3 class="section-title" card-header>
              My Invoices
              <span class="subtitle">Outstanding balance: ₹{{ billingOutstanding() }}</span>
            </h3>
            <div card-body class="p-0">
              <app-base-table
                [columns]="invoiceColumns"
                [data]="invoices()"
                [totalItems]="invoices().length"
                [pageSize]="10"
                [currentPage]="1"
                [showSearch]="false"
                [showPagination]="false"
                (actionClick)="onInvoiceAction($event)"
              ></app-base-table>
            </div>
          </app-base-card>
        </div>

        <!-- Right: Outstanding Bills & Appointments -->
        <div class="sidebar-column flex flex-col gap-lg">
          <!-- Live visit active case card -->
          <app-base-card [border]="true" elevation="sm" *ngIf="activeCase() as c">
            <h3 class="section-title text-primary" card-header>
              🩺 Live Case File Tracker
              <span class="subtitle">Real-time status of your hospital stay/visit</span>
            </h3>
            <div card-body class="active-case-box">
              <div class="case-header-row">
                <span class="case-num font-semibold">{{ c.caseNumber }}</span>
                <span class="case-badge" [class]="'badge-' + c.status">{{ getStatusLabel(c.status) }}</span>
              </div>
              <p class="case-complaint">Complaint: {{ c.chiefComplaint }}</p>
              <button class="btn-view-timeline" (click)="viewCase(c.id)">Track Event Timeline ➔</button>
            </div>
          </app-base-card>

          <!-- Outstanding Invoices Summary -->
          <app-base-card [border]="true" elevation="sm" statusBorder="urgent">
            <h3 class="section-title urgent-header" card-header>
              Outstanding Invoices
            </h3>
            <div card-body class="billing-status-box">
              <div class="amount-due-row">
                <span class="lbl">Pending Amount Due</span>
                <span class="val font-semibold">₹{{ billingOutstanding() }}</span>
              </div>
              <p class="invoice-details text-muted">{{ invoices().length }} invoice(s) on file</p>
            </div>
          </app-base-card>

          <!-- Upcoming Appointments -->
          <app-base-card [border]="true" elevation="sm">
            <h3 class="section-title" card-header>
              Upcoming Appointments
            </h3>
            <div card-body class="appointments-list">
              <div class="appt-card-item">
                <div class="time-block">
                  <span class="date-lbl">Aug 16</span>
                  <span class="time-lbl">10:30 AM</span>
                </div>
                <div class="doc-block">
                  <span class="doc-name font-semibold">Dr. Devam Patel</span>
                  <span class="doc-dept">Cardiology Unit (OPD 2)</span>
                  <span class="appt-status-tag pending">Scheduled</span>
                </div>
              </div>
            </div>
          </app-base-card>
        </div>
      </div>

      <!-- Payment Modal -->
      <app-base-modal
        [isOpen]="isPayModalOpen()"
        [title]="selectedInvoice() ? 'Pay Invoice — ' + selectedInvoice()?.invoiceNumber : 'Pay Invoice'"
        size="md"
        (close)="closePayModal()"
      >
        <div modal-body class="pay-modal-body" *ngIf="selectedInvoice() as inv">
          <div class="pay-error-banner" *ngIf="billingError()">
            {{ billingError() }}
          </div>
          <div class="pay-summary-box">
            <div class="pay-row">
              <span class="pay-lbl">Invoice:</span>
              <span class="pay-val">{{ inv.invoiceNumber }}</span>
            </div>
            <div class="pay-row">
              <span class="pay-lbl">Total Amount:</span>
              <span class="pay-val font-semibold">₹{{ inv.total }}</span>
            </div>
            <div class="pay-row">
              <span class="pay-lbl">Already Paid:</span>
              <span class="pay-val text-green">₹{{ inv.paid }}</span>
            </div>
            <div class="pay-row border-top">
              <span class="pay-lbl">Balance Due:</span>
              <span class="pay-val text-urgent font-semibold">₹{{ inv.balance }}</span>
            </div>
          </div>

          <div class="pay-form-grid">
            <div class="pay-form-field">
              <label class="pay-label">Payment Amount (₹)</label>
              <input type="number" [(ngModel)]="payAmount" class="pay-input" [max]="inv.balance" [disabled]="paySaving()" />
            </div>
            <div class="pay-form-field">
              <label class="pay-label">Payment Method</label>
              <select [(ngModel)]="payMethod" class="pay-input" [disabled]="paySaving()">
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Card">Credit / Debit Card</option>
                <option value="Insurance">Insurance / TPA</option>
                <option value="Online">Online Banking</option>
              </select>
            </div>
          </div>
        </div>

        <div modal-footer>
          <button class="btn-cancel" (click)="closePayModal()" [disabled]="paySaving()">Cancel</button>
          <button class="btn-pay" (click)="confirmPay()" [disabled]="paySaving() || !canPay()">
            {{ paySaving() ? 'Processing...' : 'Confirm Payment' }}
          </button>
        </div>
      </app-base-modal>
      </div>
      <div class="empty-state-card" *ngIf="patientStore.patients().length === 0">
        <div class="empty-icon">👤</div>
        <h2 class="empty-title">No Patient Record Found</h2>
        <p class="empty-text">Your patient profile has not been linked to this account yet. Please contact the hospital administration.</p>
      </div>
    </div>
  `,
  styles: `
    .patient-dashboard-container {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-lg);
    }
    .patient-profile-banner {
      display: flex;
      gap: var(--spacing-md);
      background-color: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-lg);
      padding: var(--spacing-lg);
      box-shadow: var(--color-card-shadow);
    }
    .profile-avatar-circle {
      width: 64px;
      height: 64px;
      border-radius: var(--border-radius-full);
      background-color: var(--color-primary-glow);
      color: var(--color-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      font-weight: 700;
    }
    .profile-details-col {
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex: 1;
    }
    .patient-name {
      font-size: 20px;
      font-weight: 700;
    }
    .patient-meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--spacing-md);
    }
    .meta-item {
      display: flex;
      flex-direction: column;
    }
    .meta-lbl {
      font-size: 11px;
      color: var(--color-text-secondary);
    }
    .meta-val {
      font-size: 13px;
      color: var(--color-text-primary);
    }
    .alert-allergy-pill {
      color: var(--color-critical);
      font-weight: 600;
      cursor: help;
    }

    .shortcuts-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--spacing-md);
    }
    .shortcut-action-card {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-md) var(--spacing-lg);
      border-radius: var(--border-radius-md);
      border: none;
      cursor: pointer;
      text-align: left;
      transition: var(--transition-fast);
    }
    .shortcut-action-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--color-card-shadow);
    }
    .shortcut-action-card.primary {
      background-color: var(--color-primary-glow);
      color: var(--color-primary);
    }
    .shortcut-action-card.accent {
      background-color: var(--color-accent-lightest);
      color: var(--color-accent);
    }
    .sc-icon {
      font-size: 28px;
    }
    .sc-info {
      display: flex;
      flex-direction: column;
    }
    .sc-title {
      font-weight: 700;
      font-size: 14px;
    }
    .sc-desc {
      font-size: 11.5px;
      opacity: 0.8;
    }

    .sidebar-column {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-lg);
    }
    .active-case-box {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .case-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .case-num {
      font-size: 13.5px;
      color: var(--color-primary);
    }
    .case-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 9999px;
      text-transform: uppercase;
    }
    .case-badge.badge-registered { background-color: #eff6ff; color: #1e40af; }
    .case-badge.badge-waiting { background-color: #fffbeb; color: #92400e; }
    .case-badge.badge-in_consultation { background-color: #f5f3ff; color: #5b21b6; }
    .case-badge.badge-prescription_issued { background-color: #ecfdf5; color: #065f46; }
    .case-badge.badge-lab_pending { background-color: #fff1f2; color: #9f1239; }
    .case-badge.badge-lab_complete { background-color: #fdf2f8; color: #9d174d; }
    .case-badge.badge-pharmacy_dispensed { background-color: #f0fdf4; color: #15803d; }
    .case-complaint {
      font-size: 12.5px;
      color: var(--color-text-secondary);
      margin: 0;
    }
    .btn-view-timeline {
      background-color: var(--color-primary);
      color: #ffffff;
      border: none;
      padding: 8px 12px;
      border-radius: var(--border-radius-sm);
      font-weight: 600;
      cursor: pointer;
      font-size: 12px;
      text-align: center;
      transition: var(--transition-fast);
    }
    .btn-view-timeline:hover {
      background-color: #153c60;
    }

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
    .urgent-header { color: var(--color-urgent); }

    .billing-status-box {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }
    .amount-due-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13.5px;
    }
    .amount-due-row .val {
      font-size: 18px;
      color: var(--color-urgent);
    }
    .invoice-details {
      font-size: 11.5px;
    }
    .pay-now-btn {
      background-color: var(--color-urgent);
      color: #ffffff;
      border: none;
      padding: 10px;
      border-radius: var(--border-radius-sm);
      font-weight: 600;
      cursor: pointer;
      font-size: 13px;
      transition: var(--transition-fast);
    }
    .pay-now-btn:hover {
      background-color: hsl(20, 84%, 48%);
    }

    .appointments-list {
      display: flex;
      flex-direction: column;
    }
    .appt-card-item {
      display: flex;
      gap: var(--spacing-md);
      padding: var(--spacing-sm) var(--spacing-md);
      border: 1px solid var(--color-border);
      background-color: var(--color-bg-base);
      border-radius: var(--border-radius-sm);
    }
    .time-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-right: 1px solid var(--color-border);
      padding-right: var(--spacing-sm);
      text-align: center;
    }
    .date-lbl {
      font-size: 11px;
      font-weight: 700;
      color: var(--color-primary);
    }
    .time-lbl {
      font-size: 10px;
      color: var(--color-text-secondary);
    }
    .doc-block {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .doc-name {
      font-size: 13px;
      color: var(--color-text-primary);
    }
    .doc-dept {
      font-size: 11px;
      color: var(--color-text-secondary);
    }
    .appt-status-tag {
      font-size: 9px;
      font-weight: 700;
      width: fit-content;
      padding: 1px 6px;
      border-radius: var(--border-radius-full);
      margin-top: 2px;
    }
    .appt-status-tag.pending {
      background-color: var(--color-info-light);
      color: var(--color-info);
    }

    .patient-banner {
      padding: 10px 14px;
      border-radius: var(--border-radius-md);
      font-size: 13px;
      font-weight: 500;
    }
    .patient-banner.loading {
      background-color: var(--color-info-light);
      border: 1px solid var(--color-info-border);
      color: var(--color-info);
    }
    .patient-banner.error {
      background-color: var(--color-critical-light);
      border: 1px solid var(--color-critical-border);
      color: var(--color-critical);
    }
    .patient-banner.success {
      background-color: var(--color-normal-light);
      border: 1px solid var(--color-normal-border);
      color: var(--color-normal);
    }

    .pay-modal-body {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }
    .pay-summary-box {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
      background-color: var(--color-bg-base);
      padding: var(--spacing-md);
      border-radius: var(--border-radius-md);
      border: 1px solid var(--color-border);
    }
    .pay-row {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
    }
    .pay-row.border-top {
      border-top: 1px solid var(--color-border);
      padding-top: var(--spacing-sm);
      margin-top: var(--spacing-xs);
    }
    .pay-lbl {
      color: var(--color-text-secondary);
    }
    .pay-val {
      color: var(--color-text-primary);
      font-weight: 600;
    }
    .text-green { color: var(--color-normal); }
    .text-urgent { color: var(--color-urgent); }

    .pay-form-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--spacing-md);
    }
    .pay-form-field {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }
    .pay-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .pay-input {
      padding: 8px 12px;
      border-radius: var(--border-radius-sm);
      border: 1px solid var(--color-border);
      background-color: var(--color-bg-base);
      font-size: 13px;
      color: var(--color-text-primary);
    }
    .pay-input:focus {
      border-color: var(--color-primary);
      background-color: #ffffff;
    }
    .pay-input:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .btn-cancel {
      background: transparent;
      border: 1px solid var(--color-border);
      color: var(--color-text-primary);
      padding: 8px 16px;
      border-radius: var(--border-radius-sm);
      cursor: pointer;
      font-weight: 500;
      font-size: 12.5px;
    }
    .btn-cancel:hover:not([disabled]) {
      background-color: var(--color-bg-surface-hover);
    }
    .btn-cancel[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-pay {
      background-color: var(--color-normal);
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      border-radius: var(--border-radius-sm);
      cursor: pointer;
      font-weight: 600;
      font-size: 12.5px;
    }
    .btn-pay:hover:not([disabled]) {
      background-color: hsl(162, 84%, 35%);
    }
    .btn-pay[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .empty-state-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--spacing-xl);
      text-align: center;
      gap: var(--spacing-md);
    }
    .empty-icon {
      font-size: 48px;
      opacity: 0.5;
    }
    .empty-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .empty-text {
      font-size: 13px;
      color: var(--color-text-secondary);
      max-width: 400px;
    }
    .pay-error-banner {
      padding: 10px 14px;
      border-radius: var(--border-radius-md);
      font-size: 13px;
      font-weight: 500;
      margin-bottom: var(--spacing-md);
      background-color: var(--color-critical-light);
      border: 1px solid var(--color-critical-border);
      color: var(--color-critical);
    }
  `
})
export class PatientDashboard implements OnInit {
  prescriptionColumns: TableColumn[] = [
    { header: 'Date Prescribed', key: 'date', width: '130px' },
    { header: 'Prescribing Consultant', key: 'doctor', width: '180px' },
    { header: 'Prescription Item Details', key: 'drugName', width: '280px' },
    { header: 'Dosage / Directions', key: 'dosage', width: '160px' },
    {
      header: 'Actions',
      key: 'actions',
      type: 'actions',
      width: '120px',
      align: 'center',
      actions: [
        {
          label: 'Download Rx',
          action: 'download',
          class: 'btn-secondary',
          tooltip: 'Download PDF prescription receipt',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>'
        }
      ]
    }
  ];

  reportColumns: TableColumn[] = [
    { header: 'Test Date', key: 'date', width: '130px' },
    { header: 'Lab Test Category', key: 'testName', width: '240px' },
    { header: 'Ordering Consultant', key: 'doctor', width: '180px' },
    {
      header: 'Vital Status',
      key: 'status',
      type: 'badge',
      width: '130px',
      badgeMap: {
        'Normal': { label: 'Normal', class: 'pill-normal' },
        'Out of Range': { label: 'Out of Range', class: 'pill-urgent' }
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
          label: 'View Lab Result',
          action: 'download',
          class: 'btn-secondary',
          tooltip: 'Download signed diagnostic report PDF',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>'
        }
      ]
    }
  ];

  invoiceColumns: TableColumn[] = [
    { header: 'Invoice #', key: 'invoiceNumber', width: '140px' },
    { header: 'Date', key: 'date', width: '110px' },
    { header: 'Total', key: 'total', type: 'currency', width: '100px' },
    { header: 'Paid', key: 'paid', type: 'currency', width: '100px' },
    { header: 'Balance', key: 'balance', type: 'currency', width: '100px' },
    {
      header: 'Status',
      key: 'status',
      type: 'badge',
      width: '110px',
      badgeMap: {
        'PENDING': { label: 'Pending', class: 'pill-urgent' },
        'PAID': { label: 'Paid', class: 'pill-normal' },
        'PARTIAL': { label: 'Partial', class: 'pill-info' }
      }
    },
    {
      header: 'Actions',
      key: 'actions',
      type: 'actions',
      width: '100px',
      align: 'center',
      actions: [
        {
          label: 'Pay',
          action: 'pay',
          class: 'btn-primary',
          tooltip: 'Make payment against this invoice',
          icon: ''
        }
      ]
    }
  ];

  private http = inject(HttpClient);
  private prescriptionService = inject(PrescriptionService);
  private authService = inject(AuthService);
  private labOrderService = inject(LabOrderService);
  protected billingService = inject(BillingService);
  protected patientStore = inject(PatientStore);

  readonly cases = signal<any[]>([]);
  readonly currentUhid = computed(() => this.authService.currentUser()?.uhid ?? '');

  activeCase = computed(() => {
    return this.cases().find(c => c.status !== 'closed') ?? null;
  });

  getStatusLabel(status: string): string {
    return status.replace(/_/g, ' ');
  }

  viewCase(caseId: string) {
    this.router.navigate(['/cases', caseId]);
  }

  currentPatient = computed(() => {
    const uhid = this.currentUhid();
    if (!uhid) return null;
    return this.patientStore.patients().find(p => p.uhid === uhid) ?? null;
  });

  hasAllergies = computed(() => {
    const p = this.currentPatient();
    return !!(p && p.name_subtitle && p.name_subtitle.includes('Allergies:') && !p.name_subtitle.includes('None documented'));
  });

  allergyDisplay = computed(() => {
    const p = this.currentPatient();
    if (!p || !p.name_subtitle) return 'None documented';
    if (p.name_subtitle.includes('Allergies:')) {
      return p.name_subtitle.replace('Allergies: ', '');
    }
    return 'None documented';
  });

  prescriptions = computed(() => {
    const uhid = this.currentUhid();
    if (!uhid) return [];
    return this.prescriptionService.prescriptions()
      .filter(p => p.name_subtitle === uhid || p.name_subtitle.includes(uhid))
      .map(p => ({
        date: p.date,
        doctor: p.doctor,
        drugName: p.drugDetails,
        dosage: p.status === 'Dispensed' ? 'Dispensed & Ready' : 'Pending Pharmacy Dispensation'
      }));
  });

  reports = computed(() => {
    const uhid = this.currentUhid();
    if (!uhid) return [];
    return this.labOrderService.labOrders()
      .filter(o => o.name_subtitle.includes(uhid) && o.status === 'Completed')
      .map(o => ({
        date: o.date,
        testName: o.testName,
        doctor: o.doctor,
        status: o.results ? 'Normal' : 'Normal'
      }));
  });

  invoices = computed(() => this.billingService.invoices());
  billingOutstanding = computed(() => this.billingService.totalOutstanding());

  isPayModalOpen = signal(false);
  selectedInvoice = signal<Invoice | null>(null);
  payAmount = 0;
  payMethod = 'Cash';
  paySaving = signal(false);
  billingSuccess = signal<string | null>(null);
  billingError = signal<string | null>(null);

  constructor(private router: Router) {}

  ngOnInit() {
    void this.patientStore.loadPatients();
    void this.prescriptionService.loadPrescriptions();
    const uhid = this.authService.currentUser()?.uhid;
    if (uhid) {
      void this.labOrderService.loadOrders(uhid);
    }
    void this.billingService.loadInvoices();
    void this.loadCases();
  }

  async loadCases(): Promise<void> {
    try {
      const headers = new HttpHeaders({
        'Authorization': `Bearer ${this.authService.getToken()}`
      });
      const response = await this.http.get<{ success: boolean, data: any[] }>(`${getApiBaseUrl()}/cases`, { headers }).toPromise();
      if (response && response.success) {
        this.cases.set(response.data);
      }
    } catch (err) {
      console.error('Error loading patient cases:', err);
    }
  }

  onPrescriptionAction(event: { action: string, row: any }) {
    if (event.action === 'download') {
      console.log('Prescription download feature pending implementation');
    }
  }

  onReportAction(event: { action: string, row: any }) {
    if (event.action === 'download') {
      console.log('Lab report download feature pending implementation');
    }
  }

  onInvoiceAction(event: { action: string, row: Invoice }) {
    if (event.action === 'pay') {
      this.openPayModal(event.row);
    }
  }

  openPayModal(invoice: Invoice) {
    if (invoice.status === 'PAID') {
      return;
    }
    this.selectedInvoice.set(invoice);
    this.payAmount = invoice.balance;
    this.payMethod = 'Cash';
    this.isPayModalOpen.set(true);
  }

  closePayModal() {
    this.isPayModalOpen.set(false);
    this.selectedInvoice.set(null);
    this.paySaving.set(false);
  }

  canPay(): boolean {
    const inv = this.selectedInvoice();
    if (!inv) return false;
    return this.payAmount > 0 && this.payAmount <= inv.balance;
  }

  async confirmPay() {
    const inv = this.selectedInvoice();
    if (!inv || !this.canPay()) return;

    this.paySaving.set(true);
    this.billingError.set(null);
    try {
      const result = await this.billingService.payInvoice(inv.id, this.payAmount, this.payMethod);
      const newStatus = result.newStatus === 'PAID' ? 'Fully paid' : 'Partially paid';
      this.billingSuccess.set(`Payment of ₹${this.payAmount} recorded for ${inv.invoiceNumber}. ${newStatus}. Remaining balance: ₹${result.newBalance}`);
      this.closePayModal();
      setTimeout(() => this.billingSuccess.set(null), 5000);
    } catch {
      this.billingError.set(this.billingService.error() || 'Payment failed. Please try again.');
    } finally {
      this.paySaving.set(false);
    }
  }

  goToBook() {
    this.router.navigate(['/patient/book.component']);
  }

  goToQueue() {
    this.router.navigate(['/patient/queue.component']);
  }
}
