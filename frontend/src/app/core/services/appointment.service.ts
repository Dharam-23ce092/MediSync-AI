import { Injectable, signal, computed, inject, effect, untracked } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { getApiBaseUrl } from '../config/api.config';
import { AuthService } from './auth.service';

export interface Appointment {
  appointmentId: string;
  caseId?: string;
  caseNumber?: string;
  appointmentTime: string;
  doctorId: string;
  id: string;
  token: string;
  name: string;
  name_subtitle: string;
  uhid: string;
  time: string;
  type: 'New' | 'Follow-up' | 'Emergency';
  waitTime: string;
  status: 'Requested' | 'Confirmed' | 'Rejected' | 'Cancelled' | 'Waiting' | 'In Consultation' | 'Checked-in' | 'Completed';
  doctorName: string;
}

export type BookAppointmentInput = Pick<
  Appointment,
  'id' | 'name' | 'uhid' | 'time' | 'type' | 'doctorName' | 'doctorId' | 'appointmentTime'
> & { chiefComplaint?: string };

interface BackendAppointment {
  appointment_db_id: string;
  caseId?: string;
  caseNumber?: string;
  appointmentTime: string;
  doctorId: string;
  id: string;
  token: string;
  name: string;
  name_subtitle: string;
  uhid: string;
  time: string;
  type: Appointment['type'];
  waitTime: string;
  status: Appointment['status'];
  doctorName: string;
}

interface AppointmentsListResponse {
  success: boolean;
  message?: string;
  data: BackendAppointment[];
}

interface AppointmentCreateResponse {
  success: boolean;
  message?: string;
  data: BackendAppointment;
}

interface AppointmentStatusResponse {
  success: boolean;
  message?: string;
}

function mapAppointment(raw: BackendAppointment): Appointment {
  return {
    id: raw.id,
    appointmentId: raw.appointment_db_id,
    caseId: raw.caseId,
    caseNumber: raw.caseNumber,
    appointmentTime: raw.appointmentTime,
    doctorId: raw.doctorId,
    token: raw.token,
    name: raw.name,
    name_subtitle: raw.name_subtitle,
    uhid: raw.uhid,
    time: raw.time,
    type: raw.type,
    waitTime: raw.waitTime,
    status: raw.status,
    doctorName: raw.doctorName
  };
}

@Injectable({
  providedIn: 'root'
})
export class AppointmentService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly appointmentsSignal = signal<Appointment[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  readonly appointments = computed(() => this.appointmentsSignal());
  readonly loading = computed(() => this.loadingSignal());
  readonly error = computed(() => this.errorSignal());

  constructor() {
    effect(() => {
      if (this.authService.isAuthenticated()) {
        const role = this.authService.currentRole();
        const user = this.authService.currentUser();
        if (role === 'doctor' && user?.name) {
          untracked(() => { void this.loadAppointments({ doctorName: user.name }); });
        } else {
          untracked(() => { void this.loadAppointments(); });
        }
      } else {
        this.appointmentsSignal.set([]);
        this.errorSignal.set(null);
        this.loadingSignal.set(false);
      }
    });
  }

  async loadAppointments(
    options?: { doctorName?: string; uhid?: string },
    force = false
  ): Promise<void> {
    if (!force && this.loadingSignal()) {
      return;
    }

    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const params = new URLSearchParams();
      if (options?.doctorName) {
        params.set('doctorName', options.doctorName);
      }
      if (options?.uhid && this.authService.currentRole() !== 'patient') {
        params.set('uhid', options.uhid);
      }

      const query = params.toString();
      const url = `${getApiBaseUrl()}/appointments${query ? `?${query}` : ''}`;
      const response = await firstValueFrom(this.http.get<AppointmentsListResponse>(url));

      if (!response.success) {
        throw new Error(response.message || 'Failed to load appointments');
      }

      this.appointmentsSignal.set(response.data.map(mapAppointment));
    } catch (error) {
      this.handleError(error);
      this.appointmentsSignal.set([]);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  todaysQueue(doctorName?: string): Appointment[] {
    const list = this.appointmentsSignal().filter(a => new Date(a.appointmentTime).toDateString() === new Date().toDateString() && ['Waiting','Checked-in','In Consultation'].includes(a.status));
    if (doctorName) {
      return list.filter(appt => appt.doctorName === doctorName);
    }
    return list;
  }

  forPatient(uhid: string): Appointment[] {
    return this.appointmentsSignal().filter(appt => appt.uhid === uhid);
  }

  async bookAppointment(appt: BookAppointmentInput): Promise<Appointment> {
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(
        this.http.post<AppointmentCreateResponse>(`${getApiBaseUrl()}/appointments`, {
          id: appt.id,
          name: appt.name,
          uhid: appt.uhid,
          time: appt.time,
          type: appt.type,
          doctorName: appt.doctorName,
          doctorId: appt.doctorId,
          appointmentTime: appt.appointmentTime,
          chiefComplaint: appt.chiefComplaint
        })
      );

      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to book appointment');
      }

      const created = mapAppointment(response.data);
      this.upsertAppointment(created);
      await this.reloadAfterMutation();
      return created;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async startConsultation(patientId: string): Promise<void> {
    await this.updateStatus(this.resolveActiveAppointment(patientId), 'In Consultation');
  }

  async completeConsultation(patientId: string): Promise<void> {
    await this.updateStatus(this.resolveActiveAppointment(patientId), 'Completed');
  }

  private resolveActiveAppointment(id: string): string {
    const exact = this.appointmentsSignal().find(a => a.appointmentId === id);
    if (exact) return exact.appointmentId;
    const matches = this.todaysQueue().filter(a => a.id === id);
    if (matches.length !== 1) throw new Error('Select a specific appointment from the queue.');
    return matches[0].appointmentId;
  }

  async updateStatus(appointmentId: string, status: Appointment['status']): Promise<void> {
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(
        this.http.patch<AppointmentStatusResponse>(`${getApiBaseUrl()}/appointments/status`, {
          appointmentId,
          status
        })
      );

      if (!response.success) {
        throw new Error(response.message || 'Failed to update appointment status');
      }

      this.appointmentsSignal.update(list =>
        list.map(appt =>
          appt.appointmentId === appointmentId
            ? {
                ...appt,
                status,
                waitTime:
                  status === 'In Consultation'
                    ? '0 min (Consulting)'
                    : status === 'Completed'
                      ? 'Completed'
                      : appt.waitTime
              }
            : appt
        )
      );

      await this.reloadAfterMutation();
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  private async reloadAfterMutation(): Promise<void> {
    const role = this.authService.currentRole();
    const user = this.authService.currentUser();
    if (role === 'doctor' && user?.name) {
      await this.loadAppointments({ doctorName: user.name }, true);
    } else {
      await this.loadAppointments(undefined, true);
    }
  }

  private upsertAppointment(appointment: Appointment): void {
    this.appointmentsSignal.update(list => {
      const index = list.findIndex(
        appt => appt.id === appointment.id && appt.token === appointment.token
      );
      if (index === -1) {
        return [...list, appointment];
      }
      const updated = [...list];
      updated[index] = appointment;
      return updated;
    });
  }

  private handleError(error: unknown): void {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        this.errorSignal.set('Unable to reach the server. Ensure the backend is running on port 3000.');
        return;
      }
      const body = error.error as { message?: string } | null;
      this.errorSignal.set(body?.message ?? `Request failed (${error.status})`);
      return;
    }

    if (error instanceof Error) {
      this.errorSignal.set(error.message);
      return;
    }

    this.errorSignal.set('An unexpected error occurred');
  }
}
