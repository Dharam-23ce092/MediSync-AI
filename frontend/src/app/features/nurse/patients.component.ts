import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { BaseCard } from '../../shared/components/base-card/base-card.component';
import { BaseTable, TableColumn } from '../../shared/components/base-table/base-table.component';
import { BaseModal } from '../../shared/components/base-modal/base-modal.component';
import { BedService, Bed } from '../../core/services/bed.service';
import { VitalsService, PatientVital } from '../../core/services/vitals.service';

@Component({
  selector: 'app-nurse-patients',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, BaseCard, BaseTable, BaseModal],
  template: `
    <div class="nurse-patients-container animate-fade">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">My Inpatient Admissions Roster</h1>
          <p class="page-sub">Ward and ICU admitted patients under active nursing care — monitor bed locations, clinical acuity, attending doctors, and vital summaries.</p>
        </div>
        <div class="header-stat">
          <span class="status-pill">
            <span class="live-dot"></span> Inpatient Roster Live
          </span>
        </div>
      </div>

      <!-- Quick Metrics -->
      <div class="metrics-grid">
        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Assigned Inpatients</span>
            <h3 class="metric-val">{{ occupiedBeds().length }}</h3>
            <span class="metric-sub text-muted">Currently in beds</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-lbl">ICU Critical Patients</span>
            <h3 class="metric-val text-red">{{ icuPatients().length }}</h3>
            <span class="metric-sub text-red">High acuity monitoring</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-lbl">General Ward Admissions</span>
            <h3 class="metric-val text-blue">{{ wardPatients().length }}</h3>
            <span class="metric-sub text-muted">Routine nursing checks</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Critical Vitals Flags</span>
            <h3 class="metric-val text-orange">{{ criticalVitalsCount() }}</h3>
            <span class="metric-sub text-orange">Require immediate attention</span>
          </div>
        </app-base-card>
      </div>

      <!-- Ward Type Filter Chips -->
      <div class="filter-row">
        <div class="chips-group">
          <button class="chip" [class.active]="selectedType() === 'all'" (click)="selectedType.set('all')">
            All Admitted Patients ({{ occupiedBeds().length }})
          </button>
          <button class="chip" [class.active]="selectedType() === 'ICU'" (click)="selectedType.set('ICU')">
            ICU Patients ({{ icuPatients().length }})
          </button>
          <button class="chip" [class.active]="selectedType() === 'General Ward'" (click)="selectedType.set('General Ward')">
            General Ward ({{ wardPatients().length }})
          </button>
          <button class="chip" [class.active]="selectedType() === 'Private Room'" (click)="selectedType.set('Private Room')">
            Private Rooms ({{ privatePatients().length }})
          </button>
        </div>
      </div>

      <div class="status-banner success" *ngIf="successMessage()">{{ successMessage() }}</div>
      <div class="status-banner error" *ngIf="errorMessage()">{{ errorMessage() }}</div>

      <!-- Patients Table -->
      <app-base-card [border]="true" elevation="sm">
        <div card-body class="p-0">
          <app-base-table
            [columns]="columns"
            [data]="tableData()"
            [totalItems]="tableData().length"
            [pageSize]="10"
            [currentPage]="1"
            [showSearch]="true"
            searchPlaceholder="Search by patient name, UHID, or bed..."
            (actionClick)="onAction($event)"
          ></app-base-table>
        </div>
      </app-base-card>

      <!-- Patient Vitals Entry Modal -->
      <app-base-modal
        [isOpen]="isModalOpen()"
        [title]="selectedBed() ? 'Bedside Vitals Checklist — ' + selectedBed()?.patientName : 'Vitals Checklist'"
        size="md"
        (close)="closeModal()"
      >
        <div modal-body class="modal-body-wrap" *ngIf="selectedBed() as b">
          <div class="info-card">
            <div class="info-item">
              <span class="lbl">Bed / Unit:</span>
              <strong class="val">{{ b.name }} ({{ b.type }})</strong>
            </div>
            <div class="info-item">
              <span class="lbl">Patient UHID:</span>
              <span class="val">{{ b.uhid }}</span>
            </div>
            <div class="info-item" *ngIf="b.diagnosis">
              <span class="lbl">Admitting Diagnosis:</span>
              <span class="val">{{ b.diagnosis }}</span>
            </div>
            <div class="info-item" *ngIf="b.caseNumber">
              <span class="lbl">Case Link:</span>
              <a [routerLink]="['/cases', b.caseNumber]" (click)="closeModal()" class="case-link">Case #{{ b.caseNumber }}</a>
            </div>
          </div>

          <div class="vitals-inputs-grid">
            <div class="v-input-block">
              <label>Heart Rate (bpm):</label>
              <input type="number" [(ngModel)]="formHr" min="30" max="220" class="input-field" />
            </div>
            <div class="v-input-block">
              <label>Blood Pressure (mmHg):</label>
              <input type="text" [(ngModel)]="formBp" placeholder="120/80" class="input-field" />
            </div>
            <div class="v-input-block">
              <label>Temperature (°F):</label>
              <input type="number" step="0.1" [(ngModel)]="formTemp" min="90" max="110" class="input-field" />
            </div>
            <div class="v-input-block">
              <label>SpO2 (%):</label>
              <input type="number" [(ngModel)]="formSpo2" min="50" max="100" class="input-field" />
            </div>
          </div>

          <div class="notes-block">
            <label>Nursing Care Observations:</label>
            <textarea [(ngModel)]="formNotes" placeholder="Enter patient assessment, IV drip status, or changes in comfort..." rows="2" class="textarea-field"></textarea>
          </div>
        </div>

        <div modal-footer>
          <button class="btn-cancel" (click)="closeModal()">Cancel</button>
          <button class="btn-save" [disabled]="savingVitals()" (click)="saveVitals()">
            {{ savingVitals() ? 'Recording...' : 'Save & Publish Vitals' }}
          </button>
        </div>
      </app-base-modal>
    </div>
  `,
  styles: `
    .nurse-patients-container {
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
    .status-pill {
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
    .text-red { color: #ef4444; }
    .text-blue { color: #3b82f6; }
    .text-orange { color: #f59e0b; }

    .filter-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .chips-group {
      display: flex;
      gap: 8px;
    }
    .chip {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      padding: 6px 14px;
      border-radius: var(--border-radius-full);
      font-size: 12px;
      color: var(--color-text-secondary);
      cursor: pointer;
      font-weight: 500;
    }
    .chip.active {
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

    .modal-body-wrap {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }
    .info-card {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--spacing-sm);
      padding: var(--spacing-md);
      background: var(--color-bg-base);
      border-radius: var(--border-radius-sm);
      border: 1px solid var(--color-border);
    }
    .info-item {
      display: flex;
      flex-direction: column;
    }
    .info-item .lbl {
      font-size: 11px;
      color: var(--color-text-secondary);
    }
    .info-item .val {
      font-size: 13px;
      color: var(--color-text-primary);
    }
    .case-link {
      color: var(--color-primary);
      text-decoration: underline;
      font-size: 12px;
      cursor: pointer;
    }

    .vitals-inputs-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--spacing-md);
    }
    .v-input-block, .notes-block {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .v-input-block label, .notes-block label {
      font-size: 12px;
      color: var(--color-text-secondary);
      font-weight: 500;
    }
    .input-field, .textarea-field {
      padding: 8px 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-sm);
      background: var(--color-bg-surface);
      color: var(--color-text-primary);
      font-size: 13px;
    }
    .textarea-field {
      resize: vertical;
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
    .btn-save {
      background: var(--color-primary);
      color: #ffffff;
      border: none;
      padding: 8px 18px;
      border-radius: var(--border-radius-sm);
      cursor: pointer;
      font-weight: 600;
    }
    .btn-save[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `
})
export class NursePatients implements OnInit {
  protected bedService = inject(BedService);
  protected vitalsService = inject(VitalsService);

  selectedType = signal<'all' | 'ICU' | 'General Ward' | 'Private Room'>('all');
  isModalOpen = signal(false);
  selectedBed = signal<Bed | null>(null);

  formHr = 75;
  formBp = '120/80';
  formTemp = 98.6;
  formSpo2 = 98;
  formNotes = '';
  savingVitals = signal(false);
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  columns: TableColumn[] = [
    { header: 'Bed Location', key: 'name', width: '110px', align: 'center' },
    { header: 'Patient Name', key: 'patientName', type: 'avatar', width: '180px' },
    { header: 'UHID', key: 'uhid', width: '140px' },
    { header: 'Ward Category', key: 'type', width: '130px' },
    { header: 'Attending Physician', key: 'assignedDoctor', width: '160px' },
    { header: 'Active Diagnosis', key: 'diagnosis', width: '180px' },
    {
      header: 'Actions',
      key: 'actions',
      type: 'actions',
      width: '130px',
      align: 'center',
      actions: [
        {
          label: 'Log Vitals',
          action: 'logVitals',
          class: 'btn-primary',
          tooltip: 'Record bedside observation',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>'
        }
      ]
    }
  ];

  occupiedBeds = computed(() => this.bedService.beds().filter(b => b.status === 'occupied'));
  icuPatients = computed(() => this.occupiedBeds().filter(b => b.type === 'ICU'));
  wardPatients = computed(() => this.occupiedBeds().filter(b => b.type === 'General Ward'));
  privatePatients = computed(() => this.occupiedBeds().filter(b => b.type === 'Private Room'));

  criticalVitalsCount = computed(() =>
    this.vitalsService.vitals().filter(v => v.status === 'critical').length
  );

  tableData = computed(() => {
    const t = this.selectedType();
    if (t === 'all') return this.occupiedBeds();
    return this.occupiedBeds().filter(b => b.type === t);
  });

  ngOnInit() {
    void this.bedService.loadBeds();
    void this.vitalsService.loadVitals();
  }

  onAction(event: { action: string, row: any }) {
    if (event.action === 'logVitals') {
      this.selectedBed.set(event.row);
      // Try to find current vitals for this bed
      const cur = this.vitalsService.vitals().find(v => v.bed === event.row.name);
      if (cur) {
        this.formHr = cur.hr;
        this.formBp = cur.bp;
        this.formTemp = cur.temp;
        this.formSpo2 = cur.spo2;
      } else {
        this.formHr = 75;
        this.formBp = '120/80';
        this.formTemp = 98.6;
        this.formSpo2 = 98;
      }
      this.formNotes = '';
      this.isModalOpen.set(true);
    }
  }

  closeModal() {
    this.isModalOpen.set(false);
    this.selectedBed.set(null);
  }

  async saveVitals() {
    const b = this.selectedBed();
    if (!b) return;

    this.savingVitals.set(true);
    this.errorMessage.set(null);

    try {
      await this.vitalsService.logVitals({
        bed: b.name,
        name: b.patientName || 'Inpatient',
        uhid: b.uhid || '',
        hr: this.formHr,
        bp: this.formBp,
        temp: this.formTemp,
        spo2: this.formSpo2,
        notes: this.formNotes || `Recorded by nurse for ${b.name}`
      });

      this.successMessage.set(`Vitals recorded successfully for ${b.patientName} (${b.name}).`);
      this.closeModal();
      setTimeout(() => this.successMessage.set(null), 4000);
    } catch {
      this.errorMessage.set('Failed to save vitals checklist.');
      setTimeout(() => this.errorMessage.set(null), 4000);
    } finally {
      this.savingVitals.set(false);
    }
  }
}
