import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { getApiBaseUrl } from '../config/api.config';
import { AuthService } from './auth.service';

export interface AdminDashboardMetrics {
  patientsToday: number;
  appointmentsToday: number;
  occupiedBeds: number;
  availableBeds: number;
  totalBeds: number;
  icuOccupancyPercent: number;
  outstandingBilling: number;
  prescriptionsToday: number;
}

export interface DoctorDashboardMetrics {
  appointmentsToday: number;
  waitingPatients: number;
  inConsultation: number;
  criticalVitals: number;
}

export interface NurseDashboardMetrics {
  criticalVitals: number;
  warningVitals: number;
  totalVitals: number;
}

export interface PharmacistDashboardMetrics {
  pendingDispensations: number;
  dispensedToday: number;
  lowStockAlarms: number;
  expiringBatches?: number;
}

export interface LabDashboardMetrics {
  pendingOrders: number;
  samplesCollected: number;
  completedOrders: number;
  criticalResults: number;
}

interface DashboardResponse {
  success: boolean;
  data: any;
}

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly adminMetrics = signal<AdminDashboardMetrics | null>(null);
  private readonly doctorMetrics = signal<DoctorDashboardMetrics | null>(null);
  private readonly nurseMetrics = signal<NurseDashboardMetrics | null>(null);
  private readonly pharmacistMetrics = signal<PharmacistDashboardMetrics | null>(null);
  private readonly labMetrics = signal<LabDashboardMetrics | null>(null);

  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  readonly loading = computed(() => this.loadingSignal());
  readonly error = computed(() => this.errorSignal());

  constructor() {
    const role = this.authService.currentRole();
    if (role) {
      void this.loadForRole(role);
    }
  }

  async loadForRole(role: string): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      switch (role) {
        case 'admin':
          await this.loadAdminMetrics();
          break;
        case 'doctor':
          await this.loadDoctorMetrics();
          break;
        case 'nurse':
          await this.loadNurseMetrics();
          break;
        case 'pharmacist':
          await this.loadPharmacistMetrics();
          break;
        case 'lab':
          await this.loadLabMetrics();
          break;
      }
    } catch {
      // handled in individual methods
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async loadAdminMetrics(): Promise<void> {
    try {
      const response = await firstValueFrom(this.http.get<DashboardResponse>(`${getApiBaseUrl()}/dashboard/admin`));
      if (response.success && response.data) {
        this.adminMetrics.set(response.data);
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  async loadDoctorMetrics(): Promise<void> {
    try {
      const response = await firstValueFrom(this.http.get<DashboardResponse>(`${getApiBaseUrl()}/dashboard/doctor`));
      if (response.success && response.data) {
        this.doctorMetrics.set(response.data);
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  async loadNurseMetrics(): Promise<void> {
    try {
      const response = await firstValueFrom(this.http.get<DashboardResponse>(`${getApiBaseUrl()}/dashboard/nurse`));
      if (response.success && response.data) {
        this.nurseMetrics.set(response.data);
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  async loadPharmacistMetrics(): Promise<void> {
    try {
      const response = await firstValueFrom(this.http.get<DashboardResponse>(`${getApiBaseUrl()}/dashboard/pharmacist`));
      if (response.success && response.data) {
        this.pharmacistMetrics.set(response.data);
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  async loadLabMetrics(): Promise<void> {
    try {
      const response = await firstValueFrom(this.http.get<DashboardResponse>(`${getApiBaseUrl()}/dashboard/lab`));
      if (response.success && response.data) {
        this.labMetrics.set(response.data);
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  adminMetricsData = computed(() => this.adminMetrics());
  doctorMetricsData = computed(() => this.doctorMetrics());
  nurseMetricsData = computed(() => this.nurseMetrics());
  pharmacistMetricsData = computed(() => this.pharmacistMetrics());
  labMetricsData = computed(() => this.labMetrics());

  private handleError(error: unknown): void {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        this.errorSignal.set('Unable to reach the server.');
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
