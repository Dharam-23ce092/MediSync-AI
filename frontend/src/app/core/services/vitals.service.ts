import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { getApiBaseUrl } from '../config/api.config';
import { AuthService } from './auth.service';

export interface PatientVital {
  bed: string;
  name: string;
  uhid: string;
  hr: number;
  bp: string;
  temp: number;
  spo2: number;
  status: 'normal' | 'warning' | 'critical';
  notes?: string;
}

interface BackendVital {
  bed: string;
  name: string;
  uhid: string;
  hr: number;
  bp: string;
  temp: number;
  spo2: number;
  status: 'normal' | 'warning' | 'critical';
  notes?: string;
}

interface VitalsListResponse {
  success: boolean;
  message?: string;
  data: BackendVital[];
}

interface VitalCreateResponse {
  success: boolean;
  message?: string;
  data: BackendVital;
}

interface SingleVitalResponse {
  success: boolean;
  message?: string;
  data: BackendVital;
}

function mapVital(raw: BackendVital): PatientVital {
  return {
    bed: raw.bed,
    name: raw.name,
    uhid: raw.uhid,
    hr: raw.hr,
    bp: raw.bp,
    temp: raw.temp,
    spo2: raw.spo2,
    status: raw.status,
    notes: raw.notes
  };
}

@Injectable({
  providedIn: 'root'
})
export class VitalsService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly vitalsSignal = signal<PatientVital[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  readonly vitals = computed(() => this.vitalsSignal());
  readonly loading = computed(() => this.loadingSignal());
  readonly error = computed(() => this.errorSignal());

  readonly criticalAlerts = computed(() => {
    return this.vitalsSignal().filter(v => v.status === 'critical' || v.status === 'warning');
  });

  constructor() {}

  async loadVitals(force = false): Promise<void> {
    if (!force && this.loadingSignal()) {
      return;
    }

    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(this.http.get<VitalsListResponse>(`${getApiBaseUrl()}/vitals`));

      if (!response.success) {
        throw new Error(response.message || 'Failed to load vitals');
      }

      this.vitalsSignal.set(response.data.map(mapVital));
    } catch (error) {
      this.handleError(error);
      this.vitalsSignal.set([]);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async loadLatestForPatient(uhid: string): Promise<PatientVital | null> {
    try {
      const response = await firstValueFrom(
        this.http.get<SingleVitalResponse>(`${getApiBaseUrl()}/vitals/latest/${encodeURIComponent(uhid)}`)
      );

      if (!response.success) {
        return null;
      }

      return mapVital(response.data);
    } catch {
      return null;
    }
  }

  async logVitals(vital: Omit<PatientVital, 'status' | 'notes'> & { notes?: string }): Promise<PatientVital> {
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(
        this.http.post<VitalCreateResponse>(`${getApiBaseUrl()}/vitals`, {
          bed: vital.bed,
          name: vital.name,
          uhid: vital.uhid,
          hr: vital.hr,
          bp: vital.bp,
          temp: vital.temp,
          spo2: vital.spo2,
          notes: vital.notes || ''
        })
      );

      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to log vitals');
      }

      const created = mapVital(response.data);
      this.upsertVital(created);
      await this.loadVitals(true);
      return created;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  forPatient(uhid: string): PatientVital | undefined {
    return this.vitalsSignal().find(v => v.uhid === uhid);
  }

  private upsertVital(vital: PatientVital): void {
    this.vitalsSignal.update(list => {
      const index = list.findIndex(v => v.uhid === vital.uhid);
      if (index === -1) {
        return [...list, vital];
      }
      const updated = [...list];
      updated[index] = vital;
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
