import { Component, OnInit, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { BaseCard } from '../../shared/components/base-card/base-card.component';
import { BaseTable, TableColumn } from '../../shared/components/base-table/base-table.component';
import { BaseFilter, FilterControlConfig } from '../../shared/components/base-filter/base-filter.component';
import { BaseModal } from '../../shared/components/base-modal/base-modal.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { FormsModule } from '@angular/forms';
import { PatientStore, Patient } from '../../core/stores/patient.store';

@Component({
  selector: 'app-doctor-patients',
  standalone: true,
  imports: [CommonModule, BaseCard, BaseTable, BaseFilter, BaseModal, TooltipDirective, FormsModule],
  template: `
    <div class="doctor-patients-container animate-fade">
      <!-- Title Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Patient Master Registry</h1>
          <p class="page-sub">Access clinical profiles, history and past diagnostics for all registered patients.</p>
        </div>
        <button class="add-patient-btn" appTooltip="Register a new patient record" tooltipPosition="left" (click)="onAddPatient()">
          + Register Patient
        </button>
      </div>

      <!-- Status banners -->
      <div class="patient-status-banner loading" *ngIf="patientStore.loading() && !editSaving()">
        Loading patient records from server...
      </div>
      <div class="patient-status-banner error" *ngIf="patientStore.error() && !patientStore.loading()">
        {{ patientStore.error() }}
      </div>
      <div class="patient-status-banner success" *ngIf="editSuccess()">
        {{ editSuccess() }}
      </div>
      <div class="patient-status-banner error" *ngIf="editError()">
        {{ editError() }}
      </div>

      <!-- Modular Filters Panel -->
      <div class="filter-row">
        <app-base-filter
          [config]="filterConfig"
          (filterChange)="onFilterChange($event)"
        ></app-base-filter>
        <button class="reset-filters-btn" (click)="onResetFilters()" appTooltip="Reset all filters and search" tooltipPosition="top">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="reset-icon">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
          </svg>
          Reset
        </button>
      </div>

      <!-- Main Patients Table Card -->
      <app-base-card [border]="true" elevation="sm">
        <h3 class="card-title-header" card-header>
          Active Patient List
          <span class="count-indicator">Showing {{ filteredPatients().length }} patients</span>
        </h3>
        <div card-body class="p-0">
          <app-base-table
            [columns]="tableColumns"
            [data]="filteredPatients()"
            [totalItems]="filteredPatients().length"
            [pageSize]="10"
            [currentPage]="1"
            [showSearch]="true"
            searchPlaceholder="Filter patients by name or UHID..."
            (searchChange)="onSearchChange($event)"
            (rowClick)="onRowClick($event)"
            (actionClick)="onActionClick($event)"
          ></app-base-table>
        </div>
      </app-base-card>

      <!-- Edit Patient Modal -->
      <app-base-modal
        [isOpen]="isEditModalOpen()"
        [title]="editingPatient() ? 'Edit Patient — ' + editingPatient()?.name : 'Edit Patient'"
        size="md"
        (close)="closeEditModal()"
      >
        <div modal-body class="edit-modal-body" *ngIf="editingPatient() as p">
          <div class="edit-form-grid">
            <div class="edit-form-field">
              <label class="edit-label">Full Name</label>
              <input type="text" [(ngModel)]="editForm.name" class="edit-input" [disabled]="editSaving()" />
            </div>
            <div class="edit-form-field">
              <label class="edit-label">Age</label>
              <input type="number" [(ngModel)]="editForm.age" class="edit-input" [disabled]="editSaving()" />
            </div>
            <div class="edit-form-field">
              <label class="edit-label">Gender</label>
              <select [(ngModel)]="editForm.gender" class="edit-input" [disabled]="editSaving()">
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div class="edit-form-field">
              <label class="edit-label">Blood Group</label>
              <select [(ngModel)]="editForm.bloodGroup" class="edit-input" [disabled]="editSaving()">
                <option value="A+ve">A+ve</option>
                <option value="A-ve">A-ve</option>
                <option value="B+ve">B+ve</option>
                <option value="B-ve">B-ve</option>
                <option value="O+ve">O+ve</option>
                <option value="O-ve">O-ve</option>
                <option value="AB+ve">AB+ve</option>
                <option value="AB-ve">AB-ve</option>
              </select>
            </div>
            <div class="edit-form-field full-width">
              <label class="edit-label">Emergency Contact</label>
              <input type="text" [(ngModel)]="editForm.emergencyContact" class="edit-input" [disabled]="editSaving()" />
            </div>
            <div class="edit-form-field">
              <label class="edit-label">Status</label>
              <select [(ngModel)]="editForm.status" class="edit-input" [disabled]="editSaving()">
                <option value="OPD">Outpatient (OPD)</option>
                <option value="IPD">Admitted (IPD)</option>
                <option value="Discharged">Discharged</option>
              </select>
            </div>
            <div class="edit-form-field full-width">
              <label class="edit-label">Allergies</label>
              <input type="text" [(ngModel)]="editForm.allergies" class="edit-input" placeholder="e.g. Penicillin, Dust" [disabled]="editSaving()" />
            </div>
          </div>
        </div>

        <div modal-footer>
          <button class="btn-cancel" (click)="closeEditModal()" [disabled]="editSaving()">Cancel</button>
          <button class="btn-save" (click)="saveEdit()" [disabled]="editSaving()">
            {{ editSaving() ? 'Saving...' : 'Save Changes' }}
          </button>
        </div>
      </app-base-modal>
    </div>
  `,
  styles: `
    .doctor-patients-container {
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
    .add-patient-btn {
      background-color: var(--color-primary);
      color: #ffffff;
      border: none;
      padding: 10px 18px;
      border-radius: var(--border-radius-md);
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .add-patient-btn:hover {
      background-color: var(--color-primary-hover);
      box-shadow: var(--color-primary-glow);
    }
    .card-title-header {
      font-size: 15px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .count-indicator {
      font-size: 11px;
      font-weight: 500;
      color: var(--color-text-muted);
      background-color: var(--color-bg-base);
      padding: 2px 8px;
      border-radius: var(--border-radius-full);
      border: 1px solid var(--color-border);
    }
    .patient-status-banner {
      padding: 10px 14px;
      border-radius: var(--border-radius-md);
      font-size: 13px;
      font-weight: 500;
    }
    .patient-status-banner.loading {
      background-color: var(--color-info-light);
      border: 1px solid var(--color-info-border);
      color: var(--color-info);
    }
    .patient-status-banner.error {
      background-color: var(--color-critical-light);
      border: 1px solid var(--color-critical-border);
      color: var(--color-critical);
    }
    .patient-status-banner.success {
      background-color: var(--color-normal-light);
      border: 1px solid var(--color-normal-border);
      color: var(--color-normal);
    }

    .filter-row {
      display: flex;
      align-items: flex-end;
      gap: var(--spacing-sm);
    }
    .reset-filters-btn {
      background: transparent;
      border: 1px solid var(--color-border);
      color: var(--color-text-secondary);
      padding: 8px 14px;
      border-radius: var(--border-radius-sm);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: var(--transition-fast);
      white-space: nowrap;
      height: fit-content;
    }
    .reset-filters-btn:hover {
      background-color: var(--color-bg-surface-hover);
      border-color: var(--color-border-hover);
      color: var(--color-text-primary);
    }
    .reset-filters-btn .reset-icon {
      flex-shrink: 0;
    }

    .edit-modal-body {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }
    .edit-form-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--spacing-md);
    }
    .edit-form-field {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }
    .edit-form-field.full-width {
      grid-column: 1 / -1;
    }
    .edit-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .edit-input {
      padding: 8px 12px;
      border-radius: var(--border-radius-sm);
      border: 1px solid var(--color-border);
      background-color: var(--color-bg-base);
      font-size: 13px;
      color: var(--color-text-primary);
      transition: var(--transition-fast);
    }
    .edit-input:focus {
      border-color: var(--color-primary);
      background-color: #ffffff;
      box-shadow: var(--color-primary-glow);
    }
    .edit-input:disabled {
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
    .btn-save {
      background-color: var(--color-primary);
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      border-radius: var(--border-radius-sm);
      cursor: pointer;
      font-weight: 600;
      font-size: 12.5px;
    }
    .btn-save:hover:not([disabled]) {
      background-color: var(--color-primary-hover);
    }
    .btn-save[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `
})
export class DoctorPatients implements OnInit {
  // Config definitions for our filter controls
  filterConfig: FilterControlConfig[] = [
    {
      key: 'bloodGroup',
      type: 'select',
      label: 'Blood Group',
      placeholder: 'All Blood Groups',
      options: [
        { label: 'A+ve', value: 'A+ve' },
        { label: 'A-ve', value: 'A-ve' },
        { label: 'B+ve', value: 'B+ve' },
        { label: 'B-ve', value: 'B-ve' },
        { label: 'O+ve', value: 'O+ve' },
        { label: 'O-ve', value: 'O-ve' },
        { label: 'AB+ve', value: 'AB+ve' },
        { label: 'AB-ve', value: 'AB-ve' }
      ],
      width: '180px',
      tooltip: 'Filter patient list by physiological blood type'
    },
    {
      key: 'gender',
      type: 'select',
      label: 'Gender',
      placeholder: 'All Genders',
      options: [
        { label: 'Male', value: 'Male' },
        { label: 'Female', value: 'Female' },
        { label: 'Other', value: 'Other' }
      ],
      width: '150px',
      tooltip: 'Filter patient list by legal gender identity'
    },
    {
      key: 'status',
      type: 'select',
      label: 'Admission Status',
      placeholder: 'All Statuses',
      options: [
        { label: 'Admitted (IPD)', value: 'IPD' },
        { label: 'Outpatient (OPD)', value: 'OPD' },
        { label: 'Discharged', value: 'Discharged' }
      ],
      width: '180px',
      tooltip: 'Filter patients by clinical care track status'
    }
  ];

  // Table column configuration
  tableColumns: TableColumn[] = [
    { header: 'Patient Name', key: 'name', type: 'avatar', width: '220px' },
    { header: 'UHID / ID', key: 'uhid', width: '130px' },
    { header: 'Age', key: 'age', align: 'center', width: '80px' },
    { header: 'Gender', key: 'gender', align: 'center', width: '100px' },
    { header: 'Blood Group', key: 'bloodGroup', align: 'center', width: '110px' },
    { header: 'Emergency Contact', key: 'emergencyContact', width: '150px' },
    {
      header: 'Care Track',
      key: 'status',
      type: 'badge',
      width: '120px',
      badgeMap: {
        'OPD': { label: 'Outpatient (OPD)', class: 'pill-info' },
        'IPD': { label: 'Admitted (IPD)', class: 'pill-critical' },
        'Discharged': { label: 'Discharged', class: 'pill-secondary' }
      }
    },
    {
      header: 'Actions',
      key: 'actions',
      type: 'actions',
      width: '180px',
      align: 'center',
      actions: [
        {
          label: 'Edit',
          action: 'edit',
          class: 'btn-secondary',
          tooltip: 'Edit patient record',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>'
        },
        {
          label: 'View EMR',
          action: 'view-emr',
          class: 'btn-primary',
          tooltip: 'Open full patient clinical timeline',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
        },
        {
          label: 'Book Appt',
          action: 'book',
          class: 'btn-primary',
          tooltip: 'Schedule consultation for patient',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>'
        }
      ]
    }
  ];

  protected patientStore = inject(PatientStore);

  filteredPatients = signal<any[]>([]);
  searchText = '';
  activeFilters: Record<string, any> = {};

  isEditModalOpen = signal(false);
  editingPatient = signal<Patient | null>(null);
  editSaving = signal(false);
  editError = signal<string | null>(null);
  editSuccess = signal<string | null>(null);
  editForm: Partial<Patient> & { allergies?: string } = {};

  constructor(private router: Router) {
    effect(() => {
      this.applyFilters();
    }, { allowSignalWrites: true });
  }

  ngOnInit() {
    void this.patientStore.loadPatients();
    this.applyFilters();
  }

  onFilterChange(filters: Record<string, any>) {
    this.activeFilters = { ...filters };
    this.applyFilters();
  }

  onResetFilters() {
    this.activeFilters = {};
    this.searchText = '';
    this.applyFilters();
  }

  onSearchChange(searchText: string) {
    this.searchText = searchText.trim().toLowerCase();
    this.applyFilters();
  }

  applyFilters() {
    let result = [...this.patientStore.patients()];

    if (this.searchText) {
      result = result.filter(patient =>
        patient.name.toLowerCase().includes(this.searchText) ||
        patient.uhid.toLowerCase().includes(this.searchText)
      );
    }

    Object.keys(this.activeFilters).forEach(key => {
      const val = this.activeFilters[key];
      if (val !== '' && val !== null) {
        result = result.filter(patient => (patient as any)[key] === val);
      }
    });

    this.filteredPatients.set(result);
  }

  onRowClick(row: any) {
    this.router.navigate(['/doctor/consultation.component', row.id]);
  }

  onActionClick(event: { action: string, row: any }) {
    if (event.action === 'edit') {
      this.openEditModal(event.row);
    } else if (event.action === 'view-emr') {
      this.router.navigate(['/doctor/consultation.component', event.row.id]);
    } else if (event.action === 'book') {
      this.router.navigate(['/patient/book.component']);
    }
  }

  openEditModal(row: any) {
    const patient = this.patientStore.getById(row.id);
    if (!patient) return;
    this.editingPatient.set(patient);
    this.editForm = {
      id: patient.id,
      name: patient.name,
      age: patient.age,
      gender: patient.gender,
      bloodGroup: patient.bloodGroup,
      emergencyContact: patient.emergencyContact,
      status: patient.status,
      name_subtitle: patient.name_subtitle
    };
    this.editError.set(null);
    this.editSuccess.set(null);
    this.isEditModalOpen.set(true);
  }

  closeEditModal() {
    if (this.editSaving()) return;
    this.isEditModalOpen.set(false);
    this.editingPatient.set(null);
    this.editForm = {};
    this.editError.set(null);
    this.editSuccess.set(null);
  }

  async saveEdit() {
    const patient = this.editingPatient();
    if (!patient || !this.editForm.name) return;

    this.editSaving.set(true);
    this.editError.set(null);
    this.editSuccess.set(null);

    try {
      const updated = await this.patientStore.updatePatient(patient.id, {
        name: this.editForm.name,
        age: this.editForm.age,
        gender: this.editForm.gender,
        bloodGroup: this.editForm.bloodGroup,
        emergencyContact: this.editForm.emergencyContact,
        status: this.editForm.status,
        allergies: this.editForm.allergies || ''
      });

      this.editSuccess.set(`Patient ${updated.name} updated successfully.`);
      this.isEditModalOpen.set(false);
      this.editingPatient.set(null);
      this.editForm = {};
    } catch {
      this.editError.set(this.patientStore.error() || 'Failed to update patient.');
    } finally {
      this.editSaving.set(false);
    }
  }

  async onAddPatient() {
    const names = ['Rita Sen', 'Dev Kumar', 'Mohit Sharma', 'Anjali Gupta'];
    const randomName = names[Math.floor(Math.random() * names.length)];

    try {
      const patient = await this.patientStore.addPatient({
        name: randomName,
        age: Math.floor(20 + Math.random() * 60),
        gender: Math.random() > 0.5 ? 'Male' : 'Female',
        bloodGroup: 'B+ve',
        emergencyContact: '+91 98765 99999',
        status: 'OPD'
      });
      this.editSuccess.set(`Registered new patient ${patient.name} (${patient.uhid}).`);
      setTimeout(() => this.editSuccess.set(null), 4000);
    } catch {
      this.editError.set(this.patientStore.error() || 'Failed to register patient.');
      setTimeout(() => this.editError.set(null), 4000);
    }
  }
}
