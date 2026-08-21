import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { getApiBaseUrl } from '../config/api.config';
import { AuthService } from './auth.service';

export interface Bed {
  id: string;
  name: string;
  type: 'ICU' | 'General Ward' | 'Private Room';
  status: 'available' | 'occupied' | 'cleaning' | 'reserved';
  patientName?: string;
  uhid?: string;
  assignedDoctor?: string;
}

interface BackendBed {
  id: string;
  name: string;
  type: 'ICU' | 'General Ward' | 'Private Room';
  status: 'available' | 'occupied' | 'cleaning' | 'reserved';
  patientName?: string;
  uhid?: string;
  assignedDoctor?: string;
}

interface BedsListResponse {
  success: boolean;
  message?: string;
  data: BackendBed[];
}

interface BedActionResponse {
  success: boolean;
  message?: string;
}

function mapBed(raw: BackendBed): Bed {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    status: raw.status,
    patientName: raw.patientName,
    uhid: raw.uhid,
    assignedDoctor: raw.assignedDoctor
  };
}

@Injectable({
  providedIn: 'root'
})
export class BedService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly bedsSignal = signal<Bed[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  readonly beds = computed(() => this.bedsSignal());
  readonly loading = computed(() => this.loadingSignal());
  readonly error = computed(() => this.errorSignal());

  readonly occupancyStats = computed(() => {
    const data = this.bedsSignal();
    const total = data.length;
    const occupied = data.filter(b => b.status === 'occupied').length;
    const available = data.filter(b => b.status === 'available').length;
    const cleaning = data.filter(b => b.status === 'cleaning').length;
    const reserved = data.filter(b => b.status === 'reserved').length;
    return { total, occupied, available, cleaning, reserved };
  });

  constructor() {
    effect(() => {
      if (this.authService.isAuthenticated()) {
        const role = this.authService.currentRole();
        if (role === 'admin' || role === 'doctor' || role === 'nurse') {
          void this.loadBeds();
        }
      } else {
        this.bedsSignal.set([]);
        this.errorSignal.set(null);
        this.loadingSignal.set(false);
      }
    });
  }

  async loadBeds(force = false): Promise<void> {
    if (!force && this.loadingSignal()) {
      return;
    }

    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(this.http.get<BedsListResponse>(`${getApiBaseUrl()}/beds`));

      if (!response.success) {
        throw new Error(response.message || 'Failed to load beds');
      }

      this.bedsSignal.set(response.data.map(mapBed));
    } catch (error) {
      this.handleError(error);
      this.bedsSignal.set([]);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async allocateBed(id: string, uhid: string, patientName: string, doctorName: string): Promise<void> {
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(
        this.http.patch<BedActionResponse>(`${getApiBaseUrl()}/beds/${encodeURIComponent(id)}`, {
          action: 'allocate',
          uhid,
          doctorName
        })
      );

      if (!response.success) {
        throw new Error(response.message || 'Failed to allocate bed');
      }

      await this.loadBeds(true);
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async dischargeBed(id: string): Promise<void> {
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(
        this.http.patch<BedActionResponse>(`${getApiBaseUrl()}/beds/${encodeURIComponent(id)}`, {
          action: 'discharge'
        })
      );

      if (!response.success) {
        throw new Error(response.message || 'Failed to discharge bed');
      }

      await this.loadBeds(true);
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async markReady(id: string): Promise<void> {
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(
        this.http.patch<BedActionResponse>(`${getApiBaseUrl()}/beds/${encodeURIComponent(id)}`, {
          action: 'ready'
        })
      );

      if (!response.success) {
        throw new Error(response.message || 'Failed to mark bed ready');
      }

      await this.loadBeds(true);
    } catch (error) {
      this.handleError(error);
      throw error;
    }
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
