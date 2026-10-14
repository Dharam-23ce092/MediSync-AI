import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { getApiBaseUrl } from '../config/api.config';
import { AuthService } from './auth.service';

export interface ConsultationNote {
  id: string;
  appointmentId: string;
  patientUhid: string;
  doctorId: string;
  chiefComplaint: string;
  diagnosis: string;
  clinicalNotes: string;
  createdAt: string;
}

interface BackendConsultationNote {
  id: string;
  appointmentId: string;
  patientUhid: string;
  doctorId: string;
  chiefComplaint: string;
  diagnosis: string;
  clinicalNotes: string;
  createdAt: string;
}

interface ConsultationCreateResponse {
  success: boolean;
  message?: string;
  data: BackendConsultationNote;
}

interface ConsultationHistoryResponse {
  success: boolean;
  message?: string;
  data: BackendConsultationNote[];
}

function mapConsultationNote(raw: BackendConsultationNote): ConsultationNote {
  return {
    id: raw.id,
    appointmentId: raw.appointmentId,
    patientUhid: raw.patientUhid,
    doctorId: raw.doctorId,
    chiefComplaint: raw.chiefComplaint,
    diagnosis: raw.diagnosis,
    clinicalNotes: raw.clinicalNotes,
    createdAt: raw.createdAt
  };
}

@Injectable({
  providedIn: 'root'
})
export class ConsultationService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly notesSignal = signal<ConsultationNote[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  readonly notes = computed(() => this.notesSignal());
  readonly loading = computed(() => this.loadingSignal());
  readonly error = computed(() => this.errorSignal());

  async saveConsultation(note: {
    appointmentId: string;
    patientUhid: string;
    doctorId: string;
    chiefComplaint: string;
    diagnosis: string;
    clinicalNotes: string;
    medications?: { name: string; dosage: string; duration: string }[];
  }): Promise<ConsultationNote> {
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(
        this.http.post<ConsultationCreateResponse>(`${getApiBaseUrl()}/consultations`, {
          appointmentId: note.appointmentId,
          patientUhid: note.patientUhid,
          doctorId: note.doctorId,
          chiefComplaint: note.chiefComplaint,
          diagnosis: note.diagnosis,
          clinicalNotes: note.clinicalNotes,
          medications: note.medications
        })
      );

      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to save consultation');
      }

      const saved = mapConsultationNote(response.data);
      this.notesSignal.update(list => [saved, ...list]);
      return saved;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async loadPatientHistory(uhid: string): Promise<ConsultationNote[]> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(
        this.http.get<ConsultationHistoryResponse>(`${getApiBaseUrl()}/consultations/patient/${encodeURIComponent(uhid)}`)
      );

      if (!response.success) {
        throw new Error(response.message || 'Failed to load consultation history');
      }

      this.notesSignal.set(response.data.map(mapConsultationNote));
      return response.data.map(mapConsultationNote);
    } catch (error) {
      this.handleError(error);
      return [];
    } finally {
      this.loadingSignal.set(false);
    }
  }

  forPatient(uhid: string): ConsultationNote[] {
    return this.notesSignal().filter(n => n.patientUhid === uhid);
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
