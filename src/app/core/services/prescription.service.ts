import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { getApiBaseUrl } from '../config/api.config';
import { AuthService } from './auth.service';

export interface Prescription {
  id: string;
  patientId: string;
  name: string;
  name_subtitle: string;
  doctor: string;
  drugDetails: string;
  status: 'Pending' | 'Verifying' | 'Dispensed';
  date: string;
}

export type CreatePrescriptionInput = Omit<Prescription, 'id' | 'status' | 'date'>;

interface BackendPrescription {
  id: string;
  patientId: string;
  name: string;
  patient_uhid?: string;
  name_subtitle?: string;
  doctor: string;
  drugDetails: string;
  status: Prescription['status'];
  date: string;
}

interface PrescriptionsListResponse {
  success: boolean;
  message?: string;
  data: BackendPrescription[];
}

interface PrescriptionCreateResponse {
  success: boolean;
  message?: string;
  data: BackendPrescription;
}

interface PrescriptionDispenseResponse {
  success: boolean;
  message?: string;
}

function mapPrescription(raw: BackendPrescription): Prescription {
  return {
    id: raw.id,
    patientId: raw.patientId,
    name: raw.name,
    name_subtitle: raw.name_subtitle ?? raw.patient_uhid ?? '',
    doctor: raw.doctor,
    drugDetails: raw.drugDetails,
    status: raw.status,
    date: raw.date
  };
}

@Injectable({
  providedIn: 'root'
})
export class PrescriptionService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly prescriptionsSignal = signal<Prescription[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  readonly prescriptions = computed(() => this.prescriptionsSignal());
  readonly pendingForPharmacist = computed(() =>
    this.prescriptionsSignal().filter(p => p.status !== 'Dispensed')
  );
  readonly loading = computed(() => this.loadingSignal());
  readonly error = computed(() => this.errorSignal());

  constructor() {
    effect(() => {
      if (this.authService.isAuthenticated()) {
        void this.loadPrescriptions();
      } else {
        this.prescriptionsSignal.set([]);
        this.errorSignal.set(null);
        this.loadingSignal.set(false);
      }
    });
  }

  async loadPrescriptions(uhid?: string, force = false): Promise<void> {
    if (!force && this.loadingSignal()) {
      return;
    }

    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const params = new URLSearchParams();
      if (uhid && this.authService.currentRole() !== 'patient') {
        params.set('uhid', uhid);
      }

      const query = params.toString();
      const url = `${getApiBaseUrl()}/prescriptions${query ? `?${query}` : ''}`;
      const response = await firstValueFrom(this.http.get<PrescriptionsListResponse>(url));

      if (!response.success) {
        throw new Error(response.message || 'Failed to load prescriptions');
      }

      this.prescriptionsSignal.set(response.data.map(mapPrescription));
    } catch (error) {
      this.handleError(error);
      this.prescriptionsSignal.set([]);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  forPatient(uhid: string): Prescription[] {
    return this.prescriptionsSignal().filter(
      p => p.name_subtitle === uhid || p.name_subtitle.includes(uhid)
    );
  }

  async createPrescription(prescription: CreatePrescriptionInput): Promise<Prescription> {
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(
        this.http.post<PrescriptionCreateResponse>(`${getApiBaseUrl()}/prescriptions`, {
          patientId: prescription.patientId,
          name_subtitle: prescription.name_subtitle,
          doctor: prescription.doctor,
          drugDetails: prescription.drugDetails
        })
      );

      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to create prescription');
      }

      const created = mapPrescription(response.data);
      this.upsertPrescription(created);
      await this.loadPrescriptions(undefined, true);
      return created;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async dispensePrescription(id: string): Promise<void> {
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(
        this.http.patch<PrescriptionDispenseResponse>(
          `${getApiBaseUrl()}/prescriptions/${encodeURIComponent(id)}/dispense`,
          {}
        )
      );

      if (!response.success) {
        throw new Error(response.message || 'Failed to dispense prescription');
      }

      this.prescriptionsSignal.update(list =>
        list.map(p => (p.id === id ? { ...p, status: 'Dispensed' as const } : p))
      );
      await this.loadPrescriptions(undefined, true);
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  private upsertPrescription(prescription: Prescription): void {
    this.prescriptionsSignal.update(list => {
      const index = list.findIndex(p => p.id === prescription.id);
      if (index === -1) {
        return [...list, prescription];
      }
      const updated = [...list];
      updated[index] = prescription;
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
