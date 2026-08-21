import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BaseCard } from '../../shared/components/base-card/base-card.component';
import { BaseDetail, DetailItem } from '../../shared/components/base-detail/base-detail.component';
import { BaseTable, TableColumn } from '../../shared/components/base-table/base-table.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { PatientStore } from '../../core/stores/patient.store';
import { PrescriptionService } from '../../core/services/prescription.service';
import { VitalsService } from '../../core/services/vitals.service';
import { LabOrderService } from '../../core/services/lab-order.service';
import { AppointmentService } from '../../core/services/appointment.service';
import { AuthService } from '../../core/services/auth.service';
import { ConsultationService } from '../../core/services/consultation.service';

interface PatientRecord {
  id: string;
  name: string;
  uhid: string;
  age: number;
  gender: string;
  bloodGroup: string;
  allergies: string[];
  history: string[];
  vitals: {
    bp: string;
    pulse: string;
    temp: string;
    spo2: string;
  };
  diagnoses: string[];
  medications: string[];
}

@Component({
  selector: 'app-doctor-consultation',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseCard, BaseDetail, BaseTable, TooltipDirective],
  template: `
    <div class="consultation-wrapper animate-fade" *ngIf="patient()">
      <!-- Consultation Top Banner -->
      <div class="consultation-header">
        <div class="header-left">
          <button class="back-btn" (click)="goBack()" appTooltip="Back to queue" tooltipPosition="right">
            ←
          </button>
          <div class="patient-title-block">
            <span class="token-badge">Token {{ activeToken() }}</span>
            <h1 class="patient-name-title">{{ patient()?.name }}</h1>
            <span class="uhid-text">{{ patient()?.uhid }}</span>
          </div>
        </div>
        <div class="header-right">
          <button class="action-outline-btn" (click)="showPrescriptionHistory()" appTooltip="View past prescriptions" tooltipPosition="bottom">
            Prescription History
          </button>
          <button class="action-outline-btn" (click)="orderLabTest()" appTooltip="Order lab diagnostic test" tooltipPosition="bottom">
            Order Lab Test
          </button>
          <button class="save-btn" (click)="saveConsultation()" [disabled]="savingConsultation()" appTooltip="Save records and complete session" tooltipPosition="left">
            {{ savingConsultation() ? 'Saving...' : 'Complete Consultation' }}
          </button>
        </div>
      </div>

      <!-- Status banners -->
      <div class="consultation-banner success" *ngIf="consultationSuccess()">
        {{ consultationSuccess() }}
      </div>
      <div class="consultation-banner error" *ngIf="consultationError()">
        {{ consultationError() }}
      </div>
      <div class="consultation-banner error" *ngIf="labOrderError()">
        {{ labOrderError() }}
      </div>
      <div class="consultation-banner error" *ngIf="consultationService.error() && !consultationService.loading()">
        {{ consultationService.error() }}
      </div>

      <!-- Main Columns Grid -->
      <div class="consultation-grid">

        <!-- Left Side: Patient 360° EMR Overview -->
        <div class="left-panel flex flex-col gap-md">
          <app-base-card [border]="true" elevation="sm">
            <h3 class="panel-section-title" card-header>Patient 360° Profile</h3>
            <div card-body class="flex flex-col gap-md">
              <!-- Detail Grid -->
              <app-base-detail [items]="patientDetails()" [columns]="2"></app-base-detail>

              <!-- Medical History List -->
              <div class="history-list-section">
                <span class="section-sub-label">Chronic Conditions & History:</span>
                <ul class="detail-history-bullet">
                  <li *ngFor="let hist of patient()?.history" class="history-item-bullet">{{ hist }}</li>
                </ul>
              </div>

              <!-- Vitals section -->
              <div class="vitals-section">
                <span class="section-sub-label">Recorded Vitals (Vitals Sign):</span>
                <div class="vitals-matrix">
                  <div class="vital-box" appTooltip="Blood Pressure" tooltipPosition="top">
                    <span class="vital-icon">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                    </span>
                    <span class="vital-val" [class.text-danger]="isBpAlert()">{{ patient()?.vitals?.bp }}</span>
                    <span class="vital-unit">mmHg</span>
                  </div>
                  <div class="vital-box" appTooltip="Heart Rate / Pulse" tooltipPosition="top">
                    <span class="vital-icon">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                    </span>
                    <span class="vital-val" [class.text-danger]="isPulseAlert()">{{ patient()?.vitals?.pulse }}</span>
                    <span class="vital-unit">bpm</span>
                  </div>
                  <div class="vital-box" appTooltip="Oxygen Saturation" tooltipPosition="top">
                    <span class="vital-icon">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"></path></svg>
                    </span>
                    <span class="vital-val">{{ patient()?.vitals?.spo2 }}</span>
                    <span class="vital-unit">% SpO2</span>
                  </div>
                  <div class="vital-box" appTooltip="Body Temperature" tooltipPosition="top">
                    <span class="vital-icon">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"></path></svg>
                    </span>
                    <span class="vital-val">{{ patient()?.vitals?.temp }}</span>
                    <span class="vital-unit">°F</span>
                  </div>
                </div>
              </div>
            </div>
          </app-base-card>
        </div>

        <!-- Center: SOAP Consultation Document Workspace -->
        <div class="center-panel">
          <app-base-card [border]="true" elevation="sm">
            <h3 class="panel-section-title" card-header>Clinical Documentation (SOAP Note)</h3>
            <div card-body class="soap-form-wrapper">
              <!-- Chief Complaints -->
              <div class="form-control-block">
                <label class="form-label" appTooltip="Reason for visit and main symptoms" tooltipPosition="top">
                  Chief Complaints & Symptoms
                </label>
                <textarea
                  [(ngModel)]="chiefComplaints"
                  placeholder="Patient reports chest tightness, fatigue and shortness of breath..."
                  class="soap-textarea"
                ></textarea>
              </div>

              <!-- Physical Examination -->
              <div class="form-control-block">
                <label class="form-label" appTooltip="Physical findings during examination" tooltipPosition="top">
                  Clinical Examination & Findings
                </label>
                <textarea
                  [(ngModel)]="examinationNotes"
                  placeholder="Lungs clear, cardiovascular system S1 S2 heard normal. Trace pedal edema present..."
                  class="soap-textarea"
                ></textarea>
              </div>

              <!-- Active Diagnosis -->
              <div class="form-control-block">
                <label class="form-label" appTooltip="ICD-10 or clinical diagnoses" tooltipPosition="top">
                  Diagnosis / Assessment
                </label>
                <input
                  type="text"
                  [(ngModel)]="diagnosisInput"
                  placeholder="Hypertensive Heart Disease (I11.9) • Diabetes Mellitus Type II"
                  class="soap-input"
                />
              </div>

              <!-- History of Present Illness -->
              <div class="form-control-block">
                <label class="form-label" appTooltip="History of present illness" tooltipPosition="top">
                  History of Present Illness
                </label>
                <textarea
                  [(ngModel)]="historyInput"
                  placeholder="Onset, duration, severity, aggravating/relieving factors..."
                  class="soap-textarea"
                ></textarea>
              </div>

              <!-- Treatment Plan -->
              <div class="form-control-block">
                <label class="form-label" appTooltip="Treatment plan and follow-up" tooltipPosition="top">
                  Treatment Plan & Follow-up
                </label>
                <textarea
                  [(ngModel)]="planInput"
                  placeholder="Investigations, therapy plan, follow-up timeline..."
                  class="soap-textarea"
                ></textarea>
              </div>

              <!-- Clinical Notes -->
              <div class="form-control-block">
                <label class="form-label" appTooltip="Additional clinical notes" tooltipPosition="top">
                  Additional Clinical Notes
                </label>
                <textarea
                  [(ngModel)]="clinicalNotes"
                  placeholder="Any additional observations or instructions..."
                  class="soap-textarea"
                ></textarea>
              </div>

              <!-- Prescription Builder -->
              <div class="prescription-section">
                <div class="presc-header">
                  <label class="form-label" appTooltip="Medicines to dispense" tooltipPosition="top">Medication & Dosage</label>
                  <button class="add-btn" (click)="addMedication()" appTooltip="Add prescription row" tooltipPosition="left">+ Add Drug</button>
                </div>

                <div class="med-list">
                  <div *ngFor="let med of prescribedMeds(); let idx = index" class="med-row">
                    <input
                      type="text"
                      [(ngModel)]="med.name"
                      placeholder="Medicine name (e.g. Amlodipine 5mg)"
                      class="med-input"
                      (change)="checkDrugInteraction(med.name, idx)"
                    />
                    <input
                      type="text"
                      [(ngModel)]="med.dosage"
                      placeholder="Frequency (e.g. 1-0-1)"
                      class="med-dosage"
                    />
                    <input
                      type="text"
                      [(ngModel)]="med.duration"
                      placeholder="Days"
                      class="med-duration"
                    />
                    <button class="remove-row-btn" (click)="removeMedication(idx)" appTooltip="Delete item" tooltipPosition="left">×</button>
                  </div>
                </div>
              </div>
            </div>
          </app-base-card>
        </div>

        <!-- Consultation History -->
        <app-base-card [border]="true" elevation="sm" *ngIf="consultationHistory().length > 0">
          <h3 class="panel-section-title" card-header>
            Previous Consultation History
            <span class="subtitle">{{ consultationHistory().length }} record(s) on file</span>
          </h3>
          <div card-body class="p-0">
            <app-base-table
              [columns]="historyColumns"
              [data]="consultationHistory()"
              [totalItems]="consultationHistory().length"
              [pageSize]="10"
              [currentPage]="1"
              [showSearch]="false"
              [showPagination]="false"
            ></app-base-table>
          </div>
        </app-base-card>

        <!-- Right Side: AI Assistant & Real-time Risk Alerts -->
        <div class="right-panel flex flex-col gap-md">
          <app-base-card [border]="true" elevation="sm" statusBorder="info">
            <h3 class="panel-section-title ai-title-header" card-header>
              ⭐ MediSync AI Clinical Assistant
            </h3>
            <div card-body class="ai-body-wrapper">
              <!-- AI Diagnostic Summary -->
              <div class="ai-insight-block flex flex-col gap-sm">
                <span class="insight-label">Patient History Summary (RAG):</span>
                <p class="insight-summary-text">
                  Patient is a 45-year old male with <strong>chronic hypertension</strong> and <strong>high cholesterol</strong> since 2024.
                  Last ECG (July 2026) showed sinus tachycardia. Admitted in June 2026 for chest pain evaluation, discharged with no infarction detected.
                </p>
                <div class="source-bubble" appTooltip="Data sources used to generate this summary" tooltipPosition="left">
                  Source: 3 clinical documents, 1 admission history
                </div>
              </div>

              <!-- Real-time Alerts Panel -->
              <div class="ai-insight-block flex flex-col gap-sm">
                <span class="insight-label">Safety & Risk Analysis:</span>

                <!-- Drug interaction conflicts -->
                <div class="safety-alert danger" *ngIf="showDrugAlert()">
                  <div class="alert-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                  </div>
                  <div class="alert-content-block">
                    <span class="alert-tag font-semibold">Medication Allergy Conflict</span>
                    <span class="alert-desc">Amlodipine has documented contraindications for patients with recorded allergies to Penicillin carriers.</span>
                  </div>
                </div>

                <!-- High BP Alarm -->
                <div class="safety-alert warning" *ngIf="isBpAlert()">
                  <div class="alert-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
                  </div>
                  <div class="alert-content-block">
                    <span class="alert-tag font-semibold">Elevated Vitals Warning</span>
                    <span class="alert-desc">Recorded Systolic BP of 174 mmHg is in Hypertension Stage 2. Consider adjusting dosage.</span>
                  </div>
                </div>

                <div class="safety-alert normal" *ngIf="!showDrugAlert() && !isBpAlert()">
                  <div class="alert-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg>
                  </div>
                  <div class="alert-content-block">
                    <span class="alert-tag font-semibold">All Clear</span>
                    <span class="alert-desc">No drug-drug or drug-allergy interactions detected in current prescription draft.</span>
                  </div>
                </div>
              </div>

              <!-- OCR Summarizer widget -->
              <div class="ocr-widget">
                <span class="insight-label">OCR Document Processor:</span>
                <div class="ocr-box" (click)="simulateOcrUpload()" appTooltip="Upload external medical records to parse via OCR" tooltipPosition="left">
                  <span class="ocr-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                  </span>
                  <span class="ocr-title">Analyze External PDF/Report</span>
                  <span class="ocr-desc">AI will extract and index data into EHR</span>
                </div>
              </div>
            </div>
          </app-base-card>
        </div>

      </div>
    </div>
  `,
  styles: `
    .consultation-wrapper {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      height: 100%;
    }
    .consultation-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background-color: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-md);
      padding: var(--spacing-sm) var(--spacing-md);
      box-shadow: var(--color-card-shadow);
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
    }
    .back-btn {
      background: transparent;
      border: 1px solid var(--color-border);
      color: var(--color-text-secondary);
      font-size: 16px;
      font-weight: 700;
      width: 32px;
      height: 32px;
      border-radius: var(--border-radius-full);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: var(--transition-fast);
    }
    .back-btn:hover {
      background-color: var(--color-bg-surface-hover);
      color: var(--color-text-primary);
    }
    .patient-title-block {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
    }
    .token-badge {
      background-color: var(--color-critical-light);
      color: var(--color-critical);
      border: 1px solid var(--color-critical-border);
      padding: 2px 10px;
      border-radius: var(--border-radius-full);
      font-size: 11px;
      font-weight: 700;
    }
    .patient-name-title {
      font-size: 18px;
      font-weight: 700;
    }
    .uhid-text {
      font-size: 12px;
      color: var(--color-text-secondary);
      background-color: var(--color-bg-base);
      padding: 2px 8px;
      border-radius: var(--border-radius-sm);
      border: 1px solid var(--color-border);
    }
    .header-right {
      display: flex;
      gap: var(--spacing-sm);
    }
    .action-outline-btn {
      background: transparent;
      border: 1px solid var(--color-border);
      color: var(--color-text-primary);
      padding: 8px 16px;
      border-radius: var(--border-radius-sm);
      font-weight: 600;
      font-size: 12.5px;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .action-outline-btn:hover {
      background-color: var(--color-bg-surface-hover);
    }
    .save-btn {
      background-color: var(--color-normal);
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      border-radius: var(--border-radius-sm);
      font-weight: 600;
      font-size: 12.5px;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .save-btn:hover {
      background-color: hsl(162, 84%, 35%);
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
    }

    .consultation-grid {
      display: grid;
      grid-template-columns: 3.5fr 5fr 3.5fr;
      gap: var(--spacing-md);
      align-items: start;
    }
    .panel-section-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .section-sub-label {
      font-family: var(--font-display);
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--color-text-secondary);
      letter-spacing: 0.05em;
      margin-bottom: var(--spacing-xs);
      display: block;
    }
    .detail-history-bullet {
      padding-left: var(--spacing-md);
      margin-top: 4px;
    }
    .history-item-bullet {
      font-size: 12.5px;
      color: var(--color-text-secondary);
      margin-bottom: 2px;
    }

    .vitals-section {
      margin-top: var(--spacing-sm);
    }
    .vitals-matrix {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--spacing-sm);
    }
    .vital-box {
      background-color: var(--color-bg-base);
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-md);
      padding: var(--spacing-sm);
      display: flex;
      flex-direction: column;
      align-items: center;
      transition: var(--transition-fast);
      cursor: help;
    }
    .vital-box:hover {
      border-color: var(--color-border-hover);
      background-color: var(--color-bg-surface-hover);
    }
    .vital-icon {
      font-size: 16px;
      margin-bottom: 2px;
    }
    .vital-val {
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 14px;
      color: #F8FAFC;
    }
    .vital-val.text-danger {
      color: #F87171 !important;
    }
    .vital-unit {
      font-size: 10px;
      color: #94A3B8;
    }

    /* SOAP documentation workspace */
    .soap-form-wrapper {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }
    .form-control-block {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }
    .form-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .soap-textarea {
      width: 100%;
      height: 90px;
      padding: var(--spacing-sm) var(--spacing-md);
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-sm);
      background-color: var(--color-bg-base);
      color: var(--color-text-primary);
      font-size: 13px;
      resize: none;
      transition: var(--transition-fast);
    }
    .soap-textarea:focus {
      border-color: var(--color-primary);
      background-color: var(--color-bg-surface);
      box-shadow: var(--color-primary-glow);
    }
    .soap-input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-sm);
      background-color: var(--color-bg-base);
      color: var(--color-text-primary);
      font-size: 13px;
      transition: var(--transition-fast);
    }
    .soap-input:focus {
      border-color: var(--color-primary);
      background-color: var(--color-bg-surface);
    }

    /* Prescription builder */
    .prescription-section {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
      border-top: 1px dashed var(--color-border);
      padding-top: var(--spacing-md);
    }
    .presc-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .add-btn {
      background-color: transparent;
      border: 1.5px dashed var(--color-primary);
      color: var(--color-primary);
      padding: 4px 10px;
      border-radius: var(--border-radius-sm);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .add-btn:hover {
      background-color: var(--color-primary-glow);
    }
    .med-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }
    .med-row {
      display: flex;
      gap: var(--spacing-xs);
      align-items: center;
    }
    .med-input {
      flex: 3;
      padding: 6px 10px;
      border-radius: var(--border-radius-sm);
      border: 1px solid var(--color-border);
      font-size: 12.5px;
      background-color: var(--color-bg-base);
    }
    .med-dosage {
      flex: 1.2;
      padding: 6px 10px;
      border-radius: var(--border-radius-sm);
      border: 1px solid var(--color-border);
      font-size: 12.5px;
      text-align: center;
      background-color: var(--color-bg-base);
    }
    .med-duration {
      flex: 1;
      padding: 6px 10px;
      border-radius: var(--border-radius-sm);
      border: 1px solid var(--color-border);
      font-size: 12.5px;
      text-align: center;
      background-color: var(--color-bg-base);
    }
    .remove-row-btn {
      background: transparent;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      font-size: 18px;
      font-weight: 700;
      padding: var(--spacing-xs);
      line-height: 1;
    }
    .remove-row-btn:hover {
      color: var(--color-critical);
    }

    /* AI assistant panel */
    .ai-title-header {
      color: var(--color-accent);
    }
    .ai-body-wrapper {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }
    .ai-insight-block {
      background-color: var(--color-accent-lightest);
      border-radius: var(--border-radius-md);
      border: 1px solid var(--color-accent-hover);
      padding: var(--spacing-md);
    }
    .insight-label {
      font-family: var(--font-display);
      font-size: 10px;
      font-weight: 700;
      color: var(--color-accent);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .insight-summary-text {
      font-size: 12px;
      color: var(--color-text-secondary);
      line-height: 1.5;
    }
    .source-bubble {
      font-size: 10px;
      color: var(--color-text-muted);
      background-color: #ffffff;
      border: 1px dashed var(--color-border);
      padding: 2px 8px;
      border-radius: var(--border-radius-sm);
      width: fit-content;
      margin-top: 4px;
      cursor: help;
    }

    /* Safety alerts */
    .safety-alert {
      display: flex;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--border-radius-sm);
      border: 1px solid #2E2E33;
      background-color: #202024;
      margin-top: var(--spacing-xs);
    }
    .safety-alert.danger {
      background-color: #202024;
      border: 1px solid #2E2E33;
      color: #F87171;
    }
    .safety-alert.danger .alert-icon {
      color: #EF4444;
    }
    .safety-alert.danger .alert-tag {
      color: #EF4444;
    }
    .safety-alert.warning {
      background-color: #202024;
      border: 1px solid #2E2E33;
      color: #FB923C;
    }
    .safety-alert.normal {
      background-color: #202024;
      border: 1px solid #2E2E33;
      color: #34D399;
    }
    .alert-icon {
      font-size: 18px;
      flex-shrink: 0;
    }
    .alert-content-block {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .alert-desc {
      font-size: 12px;
      color: #A1A1AA;
    }
    .alert-tag {
      font-size: 11px;
    }
    .alert-desc {
      font-size: 10.5px;
      color: var(--color-text-secondary);
      line-height: 1.3;
    }

    /* OCR Widget */
    .ocr-widget {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }
    .ocr-box {
      border: 1.5px dashed var(--color-border);
      border-radius: var(--border-radius-md);
      padding: var(--spacing-md);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .ocr-box:hover {
      border-color: var(--color-primary);
      background-color: var(--color-primary-glow);
    }
    .ocr-icon {
      font-size: 24px;
      margin-bottom: 2px;
    }
    .ocr-title {
      font-weight: 600;
      font-size: 12px;
      color: var(--color-text-primary);
    }
    .ocr-desc {
      font-size: 10px;
      color: var(--color-text-muted);
    }

    .consultation-banner {
      padding: 10px 14px;
      border-radius: var(--border-radius-md);
      font-size: 13px;
      font-weight: 500;
    }
    .consultation-banner.success {
      background-color: var(--color-normal-light);
      border: 1px solid var(--color-normal-border);
      color: var(--color-normal);
    }
    .consultation-banner.error {
      background-color: var(--color-critical-light);
      border: 1px solid var(--color-critical-border);
      color: var(--color-critical);
    }
  `
})
export class DoctorConsultation implements OnInit {
  private patientStore = inject(PatientStore);
  private prescriptionService = inject(PrescriptionService);
  private authService = inject(AuthService);
  private vitalsService = inject(VitalsService);
  private labOrderService = inject(LabOrderService);
  private appointmentService = inject(AppointmentService);

  patient = signal<PatientRecord | null>(null);
  activeToken = signal<string>('21');

  // Input states
  chiefComplaints = '';
  historyInput = '';
  examinationNotes = '';
  diagnosisInput = '';
  planInput = '';
  clinicalNotes = '';

  // Prescription builder state
  prescribedMeds = signal<any[]>([]);
  // AI conflict overlays
  showDrugAlert = signal<boolean>(false);

  // Consultation persistence
  protected consultationService = inject(ConsultationService);
  savingConsultation = signal(false);
  consultationSuccess = signal<string | null>(null);
  consultationError = signal<string | null>(null);
  labOrderError = signal<string | null>(null);

  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    this.route.params.subscribe(params => {
      const id = params['id'] || 'P1001';
      void this.loadPatient(id);
    });
  }

  // Consultation history state
  historyColumns: TableColumn[] = [
    { header: 'Date', key: 'createdAt', type: 'date', width: '120px' },
    { header: 'Doctor ID', key: 'doctorId', width: '140px' },
    { header: 'Chief Complaint', key: 'chiefComplaint', width: '200px' },
    { header: 'Diagnosis', key: 'diagnosis', width: '200px' },
    { header: 'Notes', key: 'clinicalNotes', width: '240px' }
  ];

  consultationHistory = computed(() => {
    const p = this.patient();
    if (!p) return [];
    const notes = this.consultationService.notes().filter(n => n.patientUhid === p.uhid);
    return notes.map(n => ({
      ...n,
      createdAt: new Date(n.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    }));
  });

  // Prepares the base-detail data items list from active patient data
  readonly patientDetails = computed<DetailItem[]>(() => {
    const p = this.patient();
    if (!p) return [];
    return [
      { label: 'Patient Name', value: p.name, type: 'text' },
      { label: 'Gender / Age', value: `${p.gender} / ${p.age} yrs`, type: 'text' },
      { label: 'Blood Group', value: p.bloodGroup, type: 'badge', badgeClass: 'badge-primary' },
      {
        label: 'Known Allergies',
        value: p.allergies.join(', ') || 'None documented',
        type: 'badge',
        badgeClass: p.allergies.length > 0 ? 'badge-danger' : 'badge-success',
        tooltip: 'Known physiological allergy conflicts'
      }
    ];
  });

  async loadPatient(id: string) {
    const p =
      (await this.patientStore.fetchById(id)) ??
      this.patientStore.getById(id);
    if (!p) return;

    const v = await this.vitalsService.loadLatestForPatient(p.uhid);

    // Fallback allergies based on name_subtitle or default
    const allergies = p.name_subtitle.includes('Allergies: ')
      ? p.name_subtitle.replace('Allergies: ', '').split(', ')
      : [];

    const record: PatientRecord = {
      id: p.id,
      name: p.name,
      uhid: p.uhid,
      age: p.age,
      gender: p.gender,
      bloodGroup: p.bloodGroup,
      allergies: allergies.filter(a => a && a !== 'None documented'),
      history: [],
      vitals: {
        bp: v ? v.bp : '',
        pulse: v ? String(v.hr) : '',
        temp: v ? String(v.temp) : '',
        spo2: v ? String(v.spo2) : ''
      },
      diagnoses: [],
      medications: []
    };

    this.patient.set(record);

    const appts = this.appointmentService.forPatient(p.uhid);
    const token = appts.length > 0 ? appts[0].token : '';
    this.activeToken.set(token);

    this.prescribedMeds.set([]);
    this.chiefComplaints = '';
    this.examinationNotes = '';
    this.diagnosisInput = '';
    this.showDrugAlert.set(false);

    void this.consultationService.loadPatientHistory(p.uhid);
  }

  isBpAlert(): boolean {
    const bp = this.patient()?.vitals?.bp || '';
    if (!bp) return false;
    const sys = parseInt(bp.split('/')[0], 10);
    return sys >= 140; // flag if hypertensive stage 2
  }

  isPulseAlert(): boolean {
    const pulse = this.patient()?.vitals?.pulse || '';
    if (!pulse) return false;
    const rate = parseInt(pulse, 10);
    return rate >= 100; // flag if tachycardia
  }

  addMedication() {
    this.prescribedMeds.update(list => [
      ...list,
      { name: '', dosage: '1-0-1', duration: '10' }
    ]);
  }

  removeMedication(index: number) {
    this.prescribedMeds.update(list => list.filter((_, i) => i !== index));
    this.showDrugAlert.set(false);
  }

  checkDrugInteraction(medName: string, index: number) {
    if (!medName) return;

    // Simulate drug allergy check (Amlodipine vs Penicillin group overlap warning)
    const nameLower = medName.toLowerCase();
    if (nameLower.includes('amlo') || nameLower.includes('penicillin')) {
      const patientAllergies = this.patient()?.allergies || [];
      if (patientAllergies.includes('Penicillin')) {
        this.showDrugAlert.set(true);
      }
    }
  }
  simulateOcrUpload() {
    console.log('OCR upload feature pending implementation');
  }

  showPrescriptionHistory() {
    console.log('Prescription history feature pending implementation');
  }

  async orderLabTest() {
    const pat = this.patient();
    if (!pat) return;

    const doctorName = this.authService.currentUser()?.name ?? 'Dr. Devam Patel';

    this.labOrderError.set(null);
    try {
      await this.labOrderService.createOrder({
        name: pat.name,
        name_subtitle: pat.uhid,
        testName: 'Complete Blood Count (CBC Panel)',
        doctor: doctorName,
        specimen: 'Blood (EDTA Purple Vial)'
      });
      this.consultationSuccess.set(`Lab order created for ${pat.name}. Sample collection queued at Central Pathology Lab.`);
    } catch {
      this.labOrderError.set(this.labOrderService.error() || 'Failed to create lab order.');
    }
  }

  saveConsultation() {
    void this.saveConsultationAsync();
  }

  private async saveConsultationAsync() {
    const pat = this.patient();
    if (!pat) return;

    const medDetails = this.prescribedMeds().map(m => `${m.name} (${m.dosage})`).join(' + ');
    const doctorName = this.authService.currentUser()?.name ?? 'Dr. Devam Patel';
    const doctorId = this.authService.currentUser()?.userId || 'U1002';

    this.savingConsultation.set(true);
    this.consultationSuccess.set(null);
    this.consultationError.set(null);

    try {
      const [prescriptionResult] = await Promise.all([
        this.prescriptionService.createPrescription({
          patientId: pat.id,
          name: pat.name,
          name_subtitle: pat.uhid,
          doctor: doctorName,
          drugDetails: medDetails || 'No medications prescribed'
        }),
        this.consultationService.saveConsultation({
          appointmentId: this.activeToken() || `APPT-${Date.now()}`,
          patientUhid: pat.uhid,
          doctorId: doctorId,
          chiefComplaint: this.chiefComplaints,
          diagnosis: this.diagnosisInput || this.examinationNotes,
          clinicalNotes: [
            this.historyInput,
            this.examinationNotes,
            this.planInput
          ].filter(Boolean).join('\n\n') || 'No additional clinical notes'
        })
      ]);

      this.consultationSuccess.set('Consultation note saved to EHR successfully.');
      await this.completeConsultation(pat.id, pat.name);
    } catch {
      this.consultationError.set(this.prescriptionService.error() || this.consultationService.error() || 'Failed to save consultation.');
    } finally {
      this.savingConsultation.set(false);
    }
  }

  private async completeConsultation(patientId: string, patientName: string) {
    try {
      await this.appointmentService.completeConsultation(patientId);
      this.consultationSuccess.set(`Consultation saved successfully for patient ${patientName}. OPD queue updated & Prescription sent to Pharmacy.`);
      this.router.navigate(['/doctor/opd.component']);
    } catch {
      this.consultationError.set(this.appointmentService.error() || 'Failed to update appointment status.');
    }
  }

  goBack() {
    this.router.navigate(['/doctor/opd.component']);
  }
}
