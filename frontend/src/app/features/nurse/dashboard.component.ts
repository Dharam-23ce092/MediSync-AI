import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseCard } from '../../shared/components/base-card/base-card.component';
import { BaseTable, TableColumn } from '../../shared/components/base-table/base-table.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { BaseModal } from '../../shared/components/base-modal/base-modal.component';
import { FormsModule } from '@angular/forms';
import { VitalsService, PatientVital } from '../../core/services/vitals.service';
import { DashboardService } from '../../core/services/dashboard.service';

interface NurseTask {
  id: string;
  bed: string;
  patient: string;
  task: string;
  time: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
}

@Component({
  selector: 'app-nurse-dashboard',
  standalone: true,
  imports: [CommonModule, BaseCard, BaseTable, TooltipDirective, BaseModal, FormsModule],
  template: `
    <div class="nurse-dashboard-container animate-fade">
      <!-- Title Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Nurse Duty Command Center</h1>
          <p class="page-sub">Monitoring inpatient vitals, medication schedules, and care tasks.</p>
        </div>
      </div>

      <div class="vital-status-banner loading" *ngIf="vitalsService.loading()">
        Loading live vitals from server...
      </div>
      <div class="vital-status-banner error" *ngIf="vitalsError()">
        {{ vitalsError() }}
      </div>
      <div class="vital-status-banner error" *ngIf="vitalsService.error() && !vitalsService.loading()">
        {{ vitalsService.error() }}
      </div>
      <div class="vital-status-banner success" *ngIf="vitalsSuccess()">
        {{ vitalsSuccess() }}
      </div>

      <!-- Live Vitals Monitoring Panel -->
      <div class="vital-stats-dashboard">
        <app-base-card [border]="true" elevation="sm">
          <h3 class="section-title" card-header>
            Telemetry Vital Feed
            <span class="subtitle">Real-time physiological streams from connected bedside monitors</span>
          </h3>
          <div card-body class="p-0">
            <app-base-table
              [columns]="telemetryColumns"
              [data]="vitalsService.vitals()"
              [totalItems]="vitalsService.vitals().length"
              [pageSize]="10"
              [currentPage]="1"
              [showSearch]="true"
              [showPagination]="false"
              [loading]="vitalsService.loading()"
              searchPlaceholder="Search by patient name or bed..."
              (actionClick)="onTelemetryAction($event)"
            ></app-base-table>
          </div>
        </app-base-card>
      </div>

      <!-- Shift Checklist & Warnings -->
      <div class="nurse-split-grid">
        <!-- Duties Checklists -->
        <div class="checklist-column">
          <app-base-card [border]="true" elevation="sm">
            <h3 class="section-title" card-header>
              Medication & Shift Duties
              <span class="subtitle">Nursing tasks assigned for this shift</span>
            </h3>
            <div card-body class="task-list-wrapper">
              <div *ngIf="tasks().length === 0" class="empty-state-text">
                No pending nursing tasks. Tasks will appear when assigned by the clinical team.
              </div>
              <div *ngFor="let task of tasks()" class="task-row-item" [class.completed]="task.completed">
                <div class="task-check-wrapper">
                  <input
                    type="checkbox"
                    [checked]="task.completed"
                    (change)="toggleTask(task.id)"
                    class="task-check-input"
                    appTooltip="Mark task complete"
                  />
                  <div class="task-description-box">
                    <span class="task-bed-badge">{{ task.bed }}</span>
                    <span class="task-patient-name">{{ task.patient }}</span>
                    <p class="task-text-body">{{ task.task }}</p>
                  </div>
                </div>
                <div class="task-meta-info">
                  <span class="task-time"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; margin-right: 2px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>{{ task.time }}</span>
                  <span class="priority-pill" [ngClass]="'priority-' + task.priority">{{ task.priority | uppercase }}</span>
                </div>
              </div>
            </div>
          </app-base-card>
        </div>

        <!-- Right Side Alerts Panel -->
        <div class="alerts-column">
          <app-base-card [border]="true" elevation="sm" statusBorder="critical">
            <h3 class="section-title critical-header" card-header>
              <span style="display: inline-flex; align-items: center; gap: 6px;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> Critical Vitals Alerts</span>
            </h3>
            <div card-body class="alerts-list">
              <div *ngFor="let v of criticalVitalsList()" class="telemetry-alert-card" [class.critical]="v.status === 'critical'" [class.warning]="v.status === 'warning'" appTooltip="Click to view patient details" (click)="focusBed(v.bed)">
                <div class="alert-header-row">
                  <span class="alert-source">{{ v.bed }} ({{ v.name }})</span>
                  <span class="alert-time">Now</span>
                </div>
                <p class="alert-desc">HR: {{ v.hr }} bpm | BP: {{ v.bp }} | SpO2: {{ v.spo2 }}% | Temp: {{ v.temp }}°F</p>
              </div>
              <div *ngIf="criticalVitalsList().length === 0" class="empty-state-text">
                No critical vitals alerts at this time.
              </div>
            </div>
          </app-base-card>

          <!-- Quick Actions Panel -->
          <app-base-card [border]="true" elevation="sm" class="margin-top-md">
            <h3 class="section-title" card-header>
              Quick Service Logging
            </h3>
            <div card-body class="quick-log-form">
              <div class="log-grid">
                <select [(ngModel)]="logBed" class="log-select">
                  <option value="">Select Bed...</option>
                  <option *ngFor="let p of patientsData()" [value]="p.bed">{{ p.bed }} - {{ p.name }}</option>
                </select>
                <input type="text" [(ngModel)]="logVitalsText" placeholder="Log vitals check note..." class="log-input" />
                <button class="log-btn" (click)="submitQuickLog()" [disabled]="!logBed || !logVitalsText">Log Note</button>
              </div>
            </div>
          </app-base-card>
        </div>
      </div>

      <!-- Action Dialog for Vitals Entry -->
      <app-base-modal
        [isOpen]="isModalOpen()"
        [title]="selectedPatient() ? 'Record Clinical Vitals — ' + selectedPatient()?.name : 'Record Vitals'"
        size="md"
        (close)="closeModal()"
      >
        <div modal-body class="modal-vitals-form" *ngIf="selectedPatient() as p">
          <div class="patient-card-min">
            <span><strong>Patient:</strong> {{ p.name }} ({{ p.uhid }})</span>
            <span><strong>Bed Location:</strong> {{ p.bed }}</span>
          </div>

          <div class="form-grid">
            <div class="form-field">
              <label>Heart Rate (bpm)</label>
              <input type="number" [(ngModel)]="formHr" class="vitals-input" />
            </div>
            <div class="form-field">
              <label>Blood Pressure (mmHg)</label>
              <input type="text" [(ngModel)]="formBp" placeholder="120/80" class="vitals-input" />
            </div>
            <div class="form-field">
              <label>Temperature (°F)</label>
              <input type="number" step="0.1" [(ngModel)]="formTemp" class="vitals-input" />
            </div>
            <div class="form-field">
              <label>Oxygen SpO2 (%)</label>
              <input type="number" [(ngModel)]="formSpo2" class="vitals-input" />
            </div>
          </div>
        </div>

        <div modal-footer>
          <button class="btn-cancel" (click)="closeModal()">Cancel</button>
          <button class="btn-save" (click)="saveVitals()">Save Vital Log</button>
        </div>
      </app-base-modal>
    </div>
  `,
  styles: `
    .nurse-dashboard-container {
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
    .shift-leader-badge {
      background: rgba(56, 189, 248, 0.08);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.25);
      padding: 6px 14px;
      border-radius: var(--border-radius-full);
      font-weight: 500;
      font-size: 0.875rem;
    }

    .nurse-split-grid {
      display: grid;
      grid-template-columns: 7fr 5fr;
      gap: var(--spacing-lg);
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
    .critical-header { color: var(--color-critical); }

    /* Task list duties styling */
    .task-list-wrapper {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }
    .task-row-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--spacing-sm) var(--spacing-md);
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-sm);
      background-color: var(--color-bg-base);
      transition: var(--transition-fast);
    }
    .task-row-item.completed {
      opacity: 0.6;
      background-color: var(--color-bg-surface-hover);
    }
    .task-row-item.completed .task-text-body {
      text-decoration: line-through;
    }
    .task-check-wrapper {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
    }
    .task-check-input {
      width: 16px;
      height: 16px;
      accent-color: var(--color-primary);
      cursor: pointer;
    }
    .task-description-box {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .task-bed-badge {
      font-size: 9px;
      font-weight: 700;
      background-color: rgba(56, 189, 248, 0.15);
      color: var(--color-accent);
      border: 1px solid rgba(56, 189, 248, 0.3);
      padding: 1px 6px;
      border-radius: var(--border-radius-sm);
      width: fit-content;
    }
    .task-patient-name {
      font-weight: 600;
      font-size: 12.5px;
      color: var(--color-text-primary);
    }
    .task-text-body {
      font-size: 12px;
      color: var(--color-text-secondary);
    }
    .task-meta-info {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
    }
    .task-time {
      font-size: 11px;
      color: var(--color-text-muted);
      font-weight: 500;
    }
    .priority-pill {
      font-size: 9px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: var(--border-radius-full);
    }
    .priority-high { background-color: var(--color-critical-light); color: var(--color-critical); border: 1px solid var(--color-critical-border); }
    .priority-medium { background-color: var(--color-urgent-light); color: var(--color-urgent); border: 1px solid var(--color-urgent-border); }
    .priority-low { background-color: var(--color-info-light); color: var(--color-info); border: 1px solid var(--color-info-border); }

    /* Alert cards list */
    .alerts-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }
    .telemetry-alert-card {
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--border-radius-md);
      border: 1px solid var(--color-border);
      background-color: var(--color-bg-base);
      display: flex;
      flex-direction: column;
      gap: 4px;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .telemetry-alert-card:hover {
      transform: translateX(3px);
      border-color: var(--color-border-hover);
    }
    .telemetry-alert-card.critical {
      background-color: var(--color-bg-base);
      border: 1px solid var(--color-border);
    }
    .telemetry-alert-card.warning {
      background-color: var(--color-bg-base);
      border: 1px solid var(--color-border);
    }
    .alert-header-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 700;
    }
    .telemetry-alert-card.critical .alert-source { color: var(--color-critical); }
    .telemetry-alert-card.warning .alert-source { color: var(--color-urgent); }
    .alert-time { color: var(--color-text-muted); }
    .alert-desc {
      font-size: 12px;
      color: var(--color-text-secondary);
    }

    /* Quick service logger */
    .quick-log-form {
      padding: 2px;
    }
    .log-grid {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }
    .log-select, .log-input {
      padding: 8px 12px;
      border-radius: var(--border-radius-sm);
      border: 1px solid var(--color-border);
      background-color: var(--color-bg-base);
      font-size: 12.5px;
    }
    .log-select:focus, .log-input:focus {
      background-color: var(--color-bg-surface);
      border-color: var(--color-primary);
    }
    .log-btn {
      background-color: var(--color-primary);
      color: #ffffff;
      border: none;
      padding: 10px;
      border-radius: var(--border-radius-sm);
      font-weight: 600;
      cursor: pointer;
      font-size: 12.5px;
      transition: var(--transition-fast);
    }
    .log-btn:hover:not([disabled]) {
      background-color: var(--color-primary-hover);
    }
    .log-btn[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Modal Form vitals */
    .modal-vitals-form {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }
    .patient-card-min {
      display: flex;
      justify-content: space-between;
      background-color: var(--color-bg-base);
      padding: var(--spacing-md);
      border-radius: var(--border-radius-md);
      font-size: 13px;
      border: 1px solid var(--color-border);
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--spacing-md);
    }
    .form-field {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }
    .form-field label {
      font-size: 12px;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .vitals-input {
      padding: 10px 14px;
      border-radius: var(--border-radius-sm);
      border: 1px solid var(--color-border);
      background-color: var(--color-bg-base);
      outline: none;
    }
    .vitals-input:focus {
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
    .btn-save {
      background-color: var(--color-primary);
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      border-radius: var(--border-radius-sm);
      cursor: pointer;
      font-weight: 600;
    }
    .margin-top-md { margin-top: var(--spacing-md); }

    .vital-status-banner {
      padding: 10px 14px;
      border-radius: var(--border-radius-md);
      font-size: 13px;
      font-weight: 500;
    }
    .vital-status-banner.loading {
      background-color: var(--color-info-light);
      border: 1px solid var(--color-info-border);
      color: var(--color-info);
    }
    .vital-status-banner.error {
      background-color: var(--color-critical-light);
      border: 1px solid var(--color-critical-border);
      color: var(--color-critical);
    }
    .vital-status-banner.success {
      background-color: var(--color-normal-light);
      border: 1px solid var(--color-normal-border);
      color: var(--color-normal);
    }
  `
})
export class NurseDashboard implements OnInit {
  telemetryColumns: TableColumn[] = [
    { header: 'Bed', key: 'bed', width: '90px', align: 'center' },
    { header: 'Inpatient Name', key: 'name', type: 'avatar', width: '220px' },
    { header: 'Heart Rate', key: 'hr', width: '110px', align: 'center' },
    { header: 'BP (mmHg)', key: 'bp', width: '120px', align: 'center' },
    { header: 'Temp (°F)', key: 'temp', width: '100px', align: 'center' },
    { header: 'Oxygen SpO2', key: 'spo2', width: '120px', align: 'center' },
    {
      header: 'Vitals Status',
      key: 'status',
      type: 'badge',
      width: '130px',
      badgeMap: {
        'normal': { label: 'Stable', class: 'pill-normal' },
        'warning': { label: 'Warning', class: 'pill-urgent' },
        'critical': { label: 'Critical', class: 'pill-critical' }
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
          label: 'Log Vitals',
          action: 'log',
          class: 'btn-primary',
          tooltip: 'Manually record hourly vitals checklist',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>'
        }
      ]
    }
  ];

  patientsData = computed(() => this.vitalsService.vitals());
  tasks = signal<NurseTask[]>([]);

  selectedPatient = signal<PatientVital | null>(null);
  isModalOpen = signal<boolean>(false);
  formHr = 72;
  formBp = '120/80';
  formTemp = 98.6;
  formSpo2 = 98;
  logBed = '';
  logVitalsText = '';
  vitalsSuccess = signal<string | null>(null);
  vitalsError = signal<string | null>(null);

  protected vitalsService = inject(VitalsService);
  protected dashboardService = inject(DashboardService);

  ngOnInit() {
    void this.vitalsService.loadVitals();
    void this.dashboardService.loadForRole('nurse');
  }

  toggleTask(taskId: string) {
    this.tasks.update(list =>
      list.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t)
    );
  }

  criticalVitalsList = computed(() => {
    return this.vitalsService.vitals().filter(v => v.status === 'critical' || v.status === 'warning');
  });

  onTelemetryAction(event: { action: string, row: PatientVital }) {
    if (event.action === 'log') {
      this.selectedPatient.set(event.row);
      this.formHr = event.row.hr;
      this.formBp = event.row.bp;
      this.formTemp = event.row.temp;
      this.formSpo2 = event.row.spo2;
      this.isModalOpen.set(true);
    }
  }

  closeModal() {
    this.isModalOpen.set(false);
    this.selectedPatient.set(null);
  }

  async saveVitals() {
    const p = this.selectedPatient();
    if (!p) return;

    let stat: PatientVital['status'] = 'normal';
    if (this.formSpo2 < 90 || this.formHr > 110) {
      stat = 'critical';
    } else if (this.formSpo2 < 95 || this.formHr > 95 || this.formTemp > 100.5) {
      stat = 'warning';
    }

    try {
      await this.vitalsService.logVitals({
        bed: p.bed,
        name: p.name,
        uhid: p.uhid,
        hr: this.formHr,
        bp: this.formBp,
        temp: this.formTemp,
        spo2: this.formSpo2,
        notes: `Updated by nurse via vitals entry form`
      });

      this.vitalsSuccess.set(`Vitals logged for ${p.name}. Status: ${stat.toUpperCase()}`);
      this.closeModal();
      setTimeout(() => this.vitalsSuccess.set(null), 4000);
    } catch {
      this.vitalsError.set(this.vitalsService.error() || 'Failed to save vitals.');
    }
  }

  focusBed(bedId: string) {
    console.log(`Navigating to detail logs for ${bedId}. Patient monitor selected.`);
  }

  submitQuickLog() {
    const targetPat = this.vitalsService.vitals().find(p => p.bed === this.logBed);
    if (!targetPat) return;

    console.log(`Service note logged for ${targetPat.name} (Bed ${this.logBed}): "${this.logVitalsText}"`);
    this.logBed = '';
    this.logVitalsText = '';
  }
}
