import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AppointmentService, Appointment } from '../../core/services/appointment.service';
import { AuthService } from '../../core/services/auth.service';
import { DoctorService, Doctor } from '../../core/services/doctor.service';
import { getApiBaseUrl } from '../../core/config/api.config';
@Component({
  selector: 'app-patient-book',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './book.component.html',
  styleUrl: './book.component.css',
})
export class PatientBook {
  readonly doctors = inject(DoctorService);
  readonly auth = inject(AuthService);
  private appointments = inject(AppointmentService);
  private http = inject(HttpClient);
  specialty = signal('');
  doctor = signal<Doctor | null>(null);
  date = signal(this.localDate());
  slot = signal('');
  slots = signal<{ time: string; available: boolean }[]>([]);
  loadingSlots = signal(false);
  saving = signal(false);
  error = signal('');
  created = signal<Appointment | null>(null);
  complaint = '';
  visitType: 'New' | 'Follow-up' = 'New';
  readonly minimumDate = this.localDate();
  private requestVersion = 0;
  filtered = computed(() =>
    this.doctors.doctors().filter((d) => !this.specialty() || d.specialty === this.specialty()),
  );
  availableCount = computed(() => this.slots().filter((s) => s.available).length);
  constructor() {
    void this.doctors.loadDoctors();
  }
  private localDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  changeSpecialty() {
    this.doctor.set(null);
    this.slot.set('');
    this.slots.set([]);
    this.requestVersion++;
    this.loadingSlots.set(false);
  }
  selectDoctor(d: Doctor) {
    this.doctor.set(d);
    void this.loadSlots();
  }
  async loadSlots() {
    this.slot.set('');
    this.slots.set([]);
    this.error.set('');
    const doc = this.doctor();
    if (!doc) return;
    const version = ++this.requestVersion;
    this.loadingSlots.set(true);
    try {
      const r = await firstValueFrom(
        this.http.get<{ data: { time: string; available: boolean }[] }>(
          `${getApiBaseUrl()}/appointments/slots`,
          { params: { doctorId: doc.id, date: this.date() } },
        ),
      );
      if (version === this.requestVersion) this.slots.set(r.data);
    } catch {
      if (version === this.requestVersion)
        this.error.set('Unable to load available times. Please retry.');
    } finally {
      if (version === this.requestVersion) this.loadingSlots.set(false);
    }
  }
  async submit() {
    const doc = this.doctor(),
      user = this.auth.currentUser();
    if (!doc || !user || !this.slot() || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      this.created.set(
        await this.appointments.bookAppointment({
          id: user.userId || '',
          name: user.name,
          uhid: user.uhid || '',
          time: this.slot(),
          appointmentTime: this.slot(),
          doctorId: doc.id,
          doctorName: doc.name,
          type: this.visitType,
          chiefComplaint: this.complaint.trim(),
        }),
      );
    } catch {
      this.error.set(this.appointments.error() || 'Unable to submit your request.');
    } finally {
      this.saving.set(false);
    }
  }
}
