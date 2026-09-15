import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { BaseCard } from '../../shared/components/base-card/base-card.component';
import { AuthService } from '../../core/services/auth.service';
import { LabOrderService } from '../../core/services/lab-order.service';
import { PrescriptionService } from '../../core/services/prescription.service';

@Component({
  selector: 'app-patient-records',
  standalone: true,
  imports: [CommonModule, RouterModule, BaseCard],
  template: `
    <div class="records-page-container animate-fade">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">My Electronic Health Records (EHR)</h1>
          <p class="page-sub">Centralized repository of your verified diagnostic laboratory results, active physician prescriptions, and clinical visit history.</p>
        </div>
        <div class="patient-card-chip">
          <span class="user-chip">
            UHID: {{ currentUhid() }} | {{ authService.currentUser()?.name }}
          </span>
        </div>
      </div>

      <!-- Quick Category Select -->
      <div class="record-tabs">
        <button class="rec-tab" [class.active]="activeTab() === 'all'" (click)="activeTab.set('all')">
          All Records Overview
        </button>
        <button class="rec-tab" [class.active]="activeTab() === 'labs'" (click)="activeTab.set('labs')">
          Lab & Diagnostic Reports ({{ myLabReports().length }})
        </button>
        <button class="rec-tab" [class.active]="activeTab() === 'rx'" (click)="activeTab.set('rx')">
          Active Prescriptions ({{ myPrescriptions().length }})
        </button>
      </div>

      <!-- Section: Lab Reports -->
      <div class="section-block" *ngIf="activeTab() === 'all' || activeTab() === 'labs'">
        <app-base-card [border]="true" elevation="sm">
          <div card-header class="card-head-row">
            <div>
              <h3 class="sec-title">Laboratory Diagnostic Reports</h3>
              <p class="sec-sub">Blood chemistry, hematology, and clinical pathology tests performed at Zydus Hospital</p>
            </div>
            <span class="count-pill">{{ myLabReports().length }} Reports</span>
          </div>

          <div card-body class="p-0">
            <div *ngIf="myLabReports().length === 0" class="empty-state">
              No laboratory reports found for your profile.
            </div>

            <div *ngFor="let rep of myLabReports()" class="lab-report-card">
              <div class="rep-header">
                <div>
                  <h4 class="test-name">{{ rep.testName }}</h4>
                  <span class="test-sub">Specimen: {{ rep.specimen }} | Ordered by: {{ rep.doctor }} | Date: {{ rep.date }}</span>
                </div>
                <span class="rep-status" [ngClass]="rep.status">{{ rep.status }}</span>
              </div>

              <!-- Findings Box -->
              <div class="findings-box" *ngIf="rep.results">
                <div class="finding-pill" *ngIf="rep.results.hb !== undefined">
                  <span class="f-lbl">Hemoglobin (Hb):</span>
                  <strong class="f-val">{{ rep.results.hb }} g/dL</strong>
                </div>
                <div class="finding-pill" *ngIf="rep.results.wbc !== undefined">
                  <span class="f-lbl">WBC Count:</span>
                  <strong class="f-val">{{ rep.results.wbc }} /mcL</strong>
                </div>
                <div class="finding-pill" *ngIf="rep.results.chol !== undefined">
                  <span class="f-lbl">Cholesterol:</span>
                  <strong class="f-val">{{ rep.results.chol }} mg/dL</strong>
                </div>
                <div class="finding-pill" *ngIf="rep.results.trig !== undefined">
                  <span class="f-lbl">Triglycerides:</span>
                  <strong class="f-val">{{ rep.results.trig }} mg/dL</strong>
                </div>
              </div>
            </div>
          </div>
        </app-base-card>
      </div>

      <!-- Section: Prescriptions -->
      <div class="section-block" *ngIf="activeTab() === 'all' || activeTab() === 'rx'">
        <app-base-card [border]="true" elevation="sm">
          <div card-header class="card-head-row">
            <div>
              <h3 class="sec-title">Physician Prescriptions & Drug Schedules</h3>
              <p class="sec-sub">Doctor authorized outpatient and discharge medications</p>
            </div>
            <span class="count-pill">{{ myPrescriptions().length }} Prescriptions</span>
          </div>

          <div card-body class="p-0">
            <div *ngIf="myPrescriptions().length === 0" class="empty-state">
              No prescriptions found for your profile.
            </div>

            <div *ngFor="let rx of myPrescriptions()" class="rx-report-card">
              <div class="rx-header">
                <div>
                  <h4 class="rx-drugs">{{ rx.drugDetails }}</h4>
                  <span class="rx-sub">Prescribing Consultant: {{ rx.doctor }} | Issued: {{ rx.date }}</span>
                </div>
                <span class="rx-status-tag" [ngClass]="rx.status">{{ rx.status }}</span>
              </div>
            </div>
          </div>
        </app-base-card>
      </div>
    </div>
  `,
  styles: `
    .records-page-container {
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

    .record-tabs {
      display: flex;
      gap: 8px;
    }
    .rec-tab {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      padding: 7px 16px;
      border-radius: var(--border-radius-full);
      font-size: 12.5px;
      color: var(--color-text-secondary);
      cursor: pointer;
      font-weight: 500;
    }
    .rec-tab.active {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: #ffffff;
    }

    .section-block {
      display: flex;
      flex-direction: column;
    }
    .card-head-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--spacing-md);
      border-bottom: 1px solid var(--color-border);
    }
    .sec-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0;
    }
    .sec-sub {
      font-size: 12px;
      color: var(--color-text-secondary);
      margin: 2px 0 0 0;
    }
    .count-pill {
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: var(--border-radius-full);
      background: var(--color-bg-surface-hover);
      color: var(--color-text-primary);
    }

    .empty-state {
      padding: 30px;
      text-align: center;
      color: var(--color-text-muted);
      font-size: 13px;
    }

    .lab-report-card, .rx-report-card {
      padding: 14px 18px;
      border-bottom: 1px solid var(--color-border);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .rep-header, .rx-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .test-name, .rx-drugs {
      font-size: 14px;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0;
    }
    .test-sub, .rx-sub {
      font-size: 12px;
      color: var(--color-text-secondary);
    }

    .rep-status, .rx-status-tag {
      padding: 2px 8px;
      border-radius: var(--border-radius-full);
      font-size: 11px;
      font-weight: 600;
    }
    .rep-status.Completed, .rx-status-tag.Dispensed {
      background: #f0fdf4;
      color: #16a34a;
      border: 1px solid #bbf7d0;
    }
    .rep-status.Received, .rx-status-tag.Pending {
      background: #fffbeb;
      color: #d97706;
      border: 1px solid #fde68a;
    }

    .findings-box {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 8px 12px;
      background: var(--color-bg-base);
      border-radius: var(--border-radius-sm);
      border: 1px solid var(--color-border);
    }
    .finding-pill {
      font-size: 12px;
      display: flex;
      gap: 4px;
    }
    .f-lbl {
      color: var(--color-text-secondary);
    }
    .f-val {
      color: var(--color-text-primary);
    }
  `
})
export class PatientRecords implements OnInit {
  protected authService = inject(AuthService);
  protected labService = inject(LabOrderService);
  protected prescriptionService = inject(PrescriptionService);

  activeTab = signal<'all' | 'labs' | 'rx'>('all');

  currentUhid = computed(() => {
    const user = this.authService.currentUser();
    return user?.uhid || 'UHID-2026-981240';
  });

  myLabReports = computed(() => {
    const uhid = this.currentUhid();
    const all = this.labService.labOrders();
    const filtered = all.filter(o => o.name_subtitle.includes(uhid) || o.name.includes(this.authService.currentUser()?.name || ''));
    return filtered.length > 0 ? filtered : all;
  });

  myPrescriptions = computed(() => {
    const uhid = this.currentUhid();
    const all = this.prescriptionService.prescriptions();
    const filtered = all.filter(p => p.name_subtitle.includes(uhid) || p.name.includes(this.authService.currentUser()?.name || ''));
    return filtered.length > 0 ? filtered : all;
  });

  ngOnInit() {
    void this.labService.loadOrders();
    void this.prescriptionService.loadPrescriptions();
  }
}
