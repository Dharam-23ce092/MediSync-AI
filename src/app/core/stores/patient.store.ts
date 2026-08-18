import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { getApiBaseUrl } from '../config/api.config';
import { AuthService } from '../services/auth.service';

export interface Patient {
  id: string;
  name: string;
  name_subtitle: string;
  uhid: string;
  age: number;
  gender: string;
  bloodGroup: string;
  emergencyContact: string;
  status: 'OPD' | 'IPD' | 'Discharged';
}

export interface CreatePatientInput {
  name: string;
  age: number;
  gender: string;
  bloodGroup: string;
  emergencyContact: string;
  allergies?: string;
  status?: Patient['status'];
}

interface BackendPatient {
  id: string;
  uhid: string;
  name: string;
  age: number;
  gender: string;
  blood_group?: string;
  bloodGroup?: string;
  emergency_contact?: string;
  emergencyContact?: string;
  allergies?: string | null;
  name_subtitle?: string;
  status: Patient['status'];
  created_at?: string;
}

interface PatientsListResponse {
  success: boolean;
  message?: string;
  data: BackendPatient[];
}

interface PatientResponse {
  success: boolean;
  message?: string;
  data: BackendPatient;
}

interface PatientCreateResponse {
  success: boolean;
  message?: string;
  data: BackendPatient;
}

function mapPatient(raw: BackendPatient): Patient {
  return {
    id: raw.id,
    name: raw.name,
    uhid: raw.uhid,
    age: raw.age,
    gender: raw.gender,
    bloodGroup: raw.bloodGroup ?? raw.blood_group ?? '',
    emergencyContact: raw.emergencyContact ?? raw.emergency_contact ?? '',
    name_subtitle:
      raw.name_subtitle ??
      (raw.allergies ? `Allergies: ${raw.allergies}` : 'Allergies: None documented'),
    status: raw.status
  };
}

@Injectable({
  providedIn: 'root'
})
export class PatientStore {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly patientsSignal = signal<Patient[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly detailLoadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  readonly patients = computed(() => this.patientsSignal());
  readonly loading = computed(() => this.loadingSignal());
  readonly detailLoading = computed(() => this.detailLoadingSignal());
  readonly error = computed(() => this.errorSignal());

  constructor() {
    effect(() => {
      if (this.authService.isAuthenticated()) {
        void this.loadPatients();
      } else {
        this.patientsSignal.set([]);
        this.errorSignal.set(null);
        this.loadingSignal.set(false);
        this.detailLoadingSignal.set(false);
      }
    });
  }

  async loadPatients(search?: string): Promise<void> {
    if (this.loadingSignal()) {
      return;
    }

    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const role = this.authService.currentRole();

      if (role === 'patient') {
        const uhid = this.authService.currentUser()?.uhid;
        if (!uhid) {
          this.patientsSignal.set([]);
          return;
        }
        const patient = await this.fetchByIdInternal(uhid);
        this.patientsSignal.set(patient ? [patient] : []);
        return;
      }

      let url = `${getApiBaseUrl()}/patients`;
      if (search) {
        url += `?search=${encodeURIComponent(search)}`;
      }

      const response = await firstValueFrom(this.http.get<PatientsListResponse>(url));
      if (!response.success) {
        throw new Error(response.message || 'Failed to load patients');
      }

      this.patientsSignal.set(response.data.map(mapPatient));
    } catch (error) {
      this.handleError(error);
      this.patientsSignal.set([]);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  getById(id: string): Patient | undefined {
    return this.patientsSignal().find(p => p.id === id);
  }

  getByUhid(uhid: string): Patient | undefined {
    return this.patientsSignal().find(p => p.uhid === uhid);
  }

  async fetchById(id: string): Promise<Patient | null> {
    this.detailLoadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const patient = await this.fetchByIdInternal(id);
      if (patient) {
        this.upsertPatient(patient);
      }
      return patient;
    } catch (error) {
      this.handleError(error);
      return null;
    } finally {
      this.detailLoadingSignal.set(false);
    }
  }

  async addPatient(input: CreatePatientInput): Promise<Patient> {
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(
        this.http.post<PatientCreateResponse>(`${getApiBaseUrl()}/patients`, {
          name: input.name,
          age: input.age,
          gender: input.gender,
          bloodGroup: input.bloodGroup,
          emergencyContact: input.emergencyContact,
          allergies: input.allergies ?? null,
          status: input.status ?? 'OPD'
        })
      );

      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to create patient');
      }

      const patient = mapPatient(response.data);
      this.upsertPatient(patient);
      return patient;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async updatePatient(id: string, updates: Record<string, any>): Promise<Patient> {
    this.errorSignal.set(null);

    try {
      const body: any = {};
      const fields: (keyof Patient)[] = ['name', 'age', 'gender', 'bloodGroup', 'emergencyContact', 'status'];
      for (const field of fields) {
        if (updates[field] !== undefined) {
          body[field] = updates[field];
        }
      }
      if (updates['allergies'] !== undefined) {
        body.allergies = updates['allergies'] || null;
      }

      const response = await firstValueFrom(
        this.http.patch<PatientResponse>(`${getApiBaseUrl()}/patients/${encodeURIComponent(id)}`, body)
      );

      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to update patient');
      }

      const patient = mapPatient(response.data);
      this.upsertPatient(patient);
      return patient;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  updateVitals(uhid: string, status: 'OPD' | 'IPD' | 'Discharged'): void {
    this.patientsSignal.update(list =>
      list.map(p => (p.uhid === uhid ? { ...p, status } : p))
    );
  }

  private async fetchByIdInternal(id: string): Promise<Patient | null> {
    const response = await firstValueFrom(
      this.http.get<PatientResponse>(`${getApiBaseUrl()}/patients/${encodeURIComponent(id)}`)
    );

    if (!response.success || !response.data) {
      return null;
    }

    return mapPatient(response.data);
  }

  private upsertPatient(patient: Patient): void {
    this.patientsSignal.update(list => {
      const index = list.findIndex(p => p.id === patient.id);
      if (index === -1) {
        return [...list, patient];
      }
      const updated = [...list];
      updated[index] = patient;
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
