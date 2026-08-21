import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { BaseCard } from '../../shared/components/base-card/base-card.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { FormsModule } from '@angular/forms';
import { AppointmentService } from '../../core/services/appointment.service';
import { AuthService } from '../../core/services/auth.service';
import { DoctorService, Doctor } from '../../core/services/doctor.service';

interface DoctorItem {
  id: string;
  name: string;
  specialty: string;
  rating: string;
  availability: string;
  slots: string[];
}

@Component({
  selector: 'app-patient-book',
  standalone: true,
  imports: [CommonModule, BaseCard, TooltipDirective, FormsModule],
  template: `
    <div class="patient-book-container animate-fade">
      <!-- Title Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Book a Consultation Appointment</h1>
          <p class="page-sub">Select symptoms or choose your medical specialist to view slot availability.</p>
        </div>
        <div class="header-actions">
          <button class="back-btn" (click)="goBack()">
            ← Back to Portal
          </button>
        </div>
      </div>

      <!-- Status banners -->
      <div class="booking-banner success" *ngIf="bookingSuccess()">
        {{ bookingSuccess() }}
      </div>
      <div class="booking-banner error" *ngIf="bookingError()">
        {{ bookingError() }}
      </div>
      <div class="booking-banner loading" *ngIf="doctorService.loading()">
        Loading available doctors...
      </div>

      <!-- Booking Steps Layout -->
      <div class="booking-layout-grid">
        <!-- Step Form Wizard -->
        <div class="form-column">
          <app-base-card [border]="true" elevation="sm">
            <h3 class="step-title" card-header>
              1. Tell Us Your Concerns or Choose Specialty
            </h3>
            <div card-body class="step-body-content">
              <!-- Symptom Quick Toggles -->
              <div class="form-field">
                <label class="form-lbl">What symptoms are you experiencing?</label>
                <div class="symptom-toggles">
                  <button
                    *ngFor="let s of symptomsList"
                    class="symptom-tag-btn"
                    [class.active]="selectedSymptom() === s.value"
                    (click)="selectSymptom(s.value)"
                  >
                    {{ s.label }}
                  </button>
                </div>
              </div>

              <!-- Specialty Select Dropdown -->
              <div class="form-field margin-top-md">
                <label class="form-lbl">Or select Medical Department directly:</label>
                <select [(ngModel)]="selectedSpecialty" (change)="onSpecialtyChange()" class="booking-select">
                  <option value="">Select specialty...</option>
                  <option *ngFor="let spec of specialties" [value]="spec">{{ spec }}</option>
                </select>
              </div>
            </div>
          </app-base-card>

          <!-- Doctor Slots Selection -->
          <app-base-card [border]="true" elevation="sm" class="margin-top-lg" *ngIf="doctorService.filteredBySpecialty().length > 0">
            <h3 class="step-title" card-header>
              2. Select Consulting Doctor & Time Slot
            </h3>
            <div card-body class="step-body-content">
              <div class="doctors-cards-list">
                <div
                  *ngFor="let doc of doctorService.filteredBySpecialty()"
                  class="doctor-selection-row"
                  [class.active]="selectedDoctorId() === doc.id"
                  (click)="selectedDoctorId.set(doc.id)"
                >
                  <div class="doc-summary-col">
                    <span class="doc-icon">
                      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    </span>
                    <div class="doc-meta-info">
                      <span class="doc-name font-semibold">{{ doc.name }}</span>
                      <span class="doc-spec">{{ doc.specialty }} • {{ doc.department_name || 'General' }}</span>
                      <span class="doc-avail" [class.text-green]="doc.availability_status === 'Available'" [class.text-orange]="doc.availability_status !== 'Available'">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; margin-right: 2px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                        {{ doc.availability_status || 'Available' }}
                      </span>
                    </div>
                  </div>

                  <!-- Slot Grid for Active Doc -->
                  <div class="slots-container-wrapper" *ngIf="selectedDoctorId() === doc.id">
                    <span class="slots-lbl">Available Consultation Slots:</span>
                    <div class="slots-grid">
                      <button
                        *ngFor="let slot of generateTimeSlots()"
                        class="time-slot-btn"
                        [class.active]="selectedSlot() === slot"
                        (click)="selectedSlot.set(slot); $event.stopPropagation();"
                      >
                        {{ slot }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </app-base-card>

          <app-base-card [border]="true" elevation="sm" class="margin-top-lg" *ngIf="!doctorService.loading() && doctorService.filteredBySpecialty().length === 0 && selectedSpecialty()">
            <div card-body class="step-body-content">
              <p class="text-muted">No doctors available for the selected specialty. Please try another department.</p>
            </div>
          </app-base-card>
        </div>

        <!-- Booking Receipt / Sidebar Confirmation -->
        <div class="sidebar-column">
          <app-base-card [border]="true" elevation="sm" statusBorder="info">
            <h3 class="section-title text-blue" card-header>
              Appointment Details Summary
            </h3>
            <div card-body class="summary-box-content">
              <div class="detail-line">
                <span class="label">Consultation Patient:</span>
                <span class="val font-semibold">Rahul Kumar Patel</span>
              </div>
              <div class="detail-line border-top">
                <span class="label">Target Department:</span>
                <span class="val">{{ selectedSpecialty() || 'Not selected' }}</span>
              </div>
              <div class="detail-line border-top" *ngIf="activeDoctor()">
                <span class="label">Consulting Doctor:</span>
                <span class="val font-semibold">{{ activeDoctor()?.name }}</span>
              </div>
              <div class="detail-line border-top" *ngIf="selectedSlot()">
                <span class="label">Consultation Time:</span>
                <span class="val text-blue font-semibold">Today at {{ selectedSlot() }}</span>
              </div>

              <!-- Estimated Wait Badge -->
              <div class="wait-alert-box" *ngIf="selectedSlot()">
                <span class="alert-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                </span>
                <p class="alert-text">
                  Estimated walk-in wait time at OPD desk will be approx. <strong>10 mins</strong> with this scheduled slot.
                </p>
              </div>

              <button
                class="confirm-booking-btn"
                [disabled]="!selectedSpecialty() || !selectedDoctorId() || !selectedSlot()"
                (click)="confirmBooking()"
                appTooltip="Submit appointment booking"
                tooltipPosition="left"
              >
                Confirm Appointment Slot
              </button>
            </div>
          </app-base-card>
        </div>
      </div>
    </div>
  `,
  styles: `
    .patient-book-container {
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
    .back-btn {
      background-color: transparent;
      border: 1px solid var(--color-border);
      color: var(--color-text-primary);
      padding: 10px 18px;
      border-radius: var(--border-radius-md);
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .back-btn:hover {
      background-color: var(--color-bg-surface-hover);
    }

    .booking-layout-grid {
      display: grid;
      grid-template-columns: 7.5fr 4.5fr;
      gap: var(--spacing-lg);
    }

    .step-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .step-body-content {
      display: flex;
      flex-direction: column;
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }
    .form-lbl {
      font-size: 12px;
      font-weight: 600;
      color: var(--color-text-secondary);
    }

    .symptom-toggles {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
    }
    .symptom-tag-btn {
      background-color: var(--color-bg-base);
      border: 1px solid var(--color-border);
      padding: 8px 16px;
      border-radius: var(--border-radius-full);
      font-size: 12px;
      color: var(--color-text-primary);
      cursor: pointer;
      font-weight: 500;
      transition: var(--transition-fast);
    }
    .symptom-tag-btn:hover {
      border-color: var(--color-primary-hover);
      background-color: var(--color-primary-glow);
    }
    .symptom-tag-btn.active {
      background-color: var(--color-primary);
      color: #ffffff;
      border-color: var(--color-primary);
    }

    .booking-select {
      padding: 10px 14px;
      border-radius: var(--border-radius-sm);
      border: 1px solid var(--color-border);
      background-color: var(--color-bg-base);
      font-size: 13px;
      outline: none;
    }
    .booking-select:focus {
      border-color: var(--color-primary);
      background-color: #ffffff;
    }

    /* Doctor cards selection list */
    .doctors-cards-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }
    .doctor-selection-row {
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-md);
      padding: var(--spacing-md);
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      background-color: var(--color-bg-base);
      transition: var(--transition-fast);
    }
    .doctor-selection-row:hover {
      border-color: var(--color-border-hover);
      background-color: var(--color-bg-surface-hover);
    }
    .doctor-selection-row.active {
      border-color: var(--color-primary);
      background-color: #ffffff;
      box-shadow: var(--color-card-shadow);
    }
    .doc-summary-col {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
    }
    .doc-icon {
      font-size: 32px;
    }
    .doc-meta-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .doc-name {
      font-size: 13.5px;
      color: var(--color-text-primary);
    }
    .doc-spec {
      font-size: 11.5px;
      color: var(--color-text-secondary);
    }
    .doc-avail {
      font-size: 11px;
      font-weight: 500;
    }

    .slots-container-wrapper {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
      border-top: 1px dashed var(--color-border);
      padding-top: var(--spacing-sm);
    }
    .slots-lbl {
      font-size: 11px;
      color: var(--color-text-secondary);
      font-weight: 600;
    }
    .slots-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--spacing-sm);
    }
    .time-slot-btn {
      background-color: var(--color-bg-base);
      border: 1px solid var(--color-border);
      padding: 6px 12px;
      border-radius: var(--border-radius-sm);
      font-size: 11.5px;
      cursor: pointer;
      text-align: center;
      font-weight: 600;
      color: var(--color-text-primary);
      transition: var(--transition-fast);
    }
    .time-slot-btn:hover {
      background-color: var(--color-accent-lightest);
      border-color: var(--color-accent);
    }
    .time-slot-btn.active {
      background-color: var(--color-accent);
      color: #ffffff;
      border-color: var(--color-accent);
    }

    /* Summary confirmation card */
    .summary-box-content {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }
    .detail-line {
      display: flex;
      justify-content: space-between;
      font-size: 12.5px;
    }
    .detail-line.border-top {
      border-top: 1px solid var(--color-border);
      padding-top: var(--spacing-sm);
    }
    .detail-line .label {
      color: var(--color-text-secondary);
    }
    .detail-line .val {
      color: var(--color-text-primary);
      text-align: right;
    }
    .text-blue { color: var(--color-primary); }

    .wait-alert-box {
      display: flex;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) var(--spacing-md);
      background-color: var(--color-info-light);
      border: 1px solid var(--color-info-border);
      color: var(--color-info);
      border-radius: var(--border-radius-md);
    }
    .alert-icon { font-size: 18px; line-height: 1; }
    .alert-text { font-size: 11px; line-height: 1.4; }

    .confirm-booking-btn {
      background-color: var(--color-primary);
      color: #ffffff;
      border: none;
      padding: 12px;
      border-radius: var(--border-radius-sm);
      font-weight: 700;
      cursor: pointer;
      font-size: 13.5px;
      transition: var(--transition-fast);
    }
    .confirm-booking-btn:hover:not([disabled]) {
      background-color: var(--color-primary-hover);
    }
    .confirm-booking-btn[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .margin-top-md { margin-top: var(--spacing-md); }
    .margin-top-lg { margin-top: var(--spacing-lg); }
    .booking-banner {
      padding: 10px 14px;
      border-radius: var(--border-radius-md);
      font-size: 13px;
      font-weight: 500;
      margin-bottom: var(--spacing-md);
    }
    .booking-banner.success {
      background-color: var(--color-normal-light);
      border: 1px solid var(--color-normal-border);
      color: var(--color-normal);
    }
    .booking-banner.error {
      background-color: var(--color-critical-light);
      border: 1px solid var(--color-critical-border);
      color: var(--color-critical);
    }
  `
})
export class PatientBook {
  selectedSymptom = signal<string>('');
  selectedSpecialty = signal<string>('');
  selectedDoctorId = signal<string>('');
  selectedSlot = signal<string>('');

  bookingSuccess = signal<string | null>(null);
  bookingError = signal<string | null>(null);

  specialties = ['Cardiology', 'General Medicine', 'Paediatrics', 'Dermatology'];

  symptomsList = [
    { label: 'Chest Pain / Palpitations', value: 'chest-pain', specialty: 'Cardiology' },
    { label: 'High Fever / Flu Symptoms', value: 'fever', specialty: 'General Medicine' },
    { label: 'Pediatric Clinical Consultation', value: 'paediatrics', specialty: 'Paediatrics' },
    { label: 'Dermatological Rash / Allergy', value: 'skin', specialty: 'Dermatology' }
  ];

  protected doctorService = inject(DoctorService);
  private appointmentService = inject(AppointmentService);
  private authService = inject(AuthService);

  // Filters computed doctors based on selected specialty
  readonly filteredDoctors = computed<Doctor[]>(() => {
    return this.doctorService.filteredBySpecialty();
  });

  // Current active doctor object
  readonly activeDoctor = computed<Doctor | null>(() => {
    const id = this.selectedDoctorId();
    if (!id) return null;
    return this.doctorService.getById(id) ?? null;
  });

  constructor(private router: Router) {
    void this.doctorService.loadDoctors();
  }

  ngOnInit() {}

  selectSymptom(symValue: string) {
    this.selectedSymptom.set(symValue);

    const item = this.symptomsList.find(s => s.value === symValue);
    if (item) {
      this.selectedSpecialty.set(item.specialty);
      this.doctorService.setSpecialty(item.specialty);
      this.selectedDoctorId.set('');
      this.selectedSlot.set('');
    }
  }

  onSpecialtyChange() {
    this.doctorService.setSpecialty(this.selectedSpecialty() || null);
    this.selectedDoctorId.set('');
    this.selectedSlot.set('');
  }

  generateTimeSlots(): string[] {
    const slots: string[] = [];
    const now = new Date();
    const startHour = 9;
    const endHour = 17;
    const interval = 30;

    for (let hour = startHour; hour < endHour; hour++) {
      for (let min = 0; min < 60; min += interval) {
        const slotTime = new Date(now);
        slotTime.setHours(hour, min, 0, 0);
        if (slotTime > now) {
          const display = slotTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
          slots.push(display);
        }
      }
    }
    return slots;
  }

  async confirmBooking() {
    const doc = this.activeDoctor();
    const user = this.authService.currentUser();
    if (!doc || !this.selectedSlot() || !user) return;

    this.bookingError.set(null);
    try {
      const appt = await this.appointmentService.bookAppointment({
        id: user.uhid ?? user.email,
        name: user.name,
        uhid: user.uhid ?? '',
        time: this.selectedSlot(),
        type: 'New',
        doctorName: doc.name
      });

      this.bookingSuccess.set(`Consultation booking confirmed with ${doc.name} at ${this.selectedSlot()}. Your queue token number is: Token #${appt.token}.`);
      setTimeout(() => {
        this.router.navigate(['/patient/dashboard.component']);
      }, 2000);
    } catch {
      this.bookingError.set(this.appointmentService.error() || 'Failed to book appointment.');
    }
  }

  goBack() {
    this.router.navigate(['/patient/dashboard.component']);
  }
}
