import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { getApiBaseUrl } from '../config/api.config';
import { AuthService } from './auth.service';

export interface LabOrder {
  id: string;
  name: string;
  name_subtitle: string;
  testName: string;
  doctor: string;
  specimen: string;
  status: 'Received' | 'Collected' | 'Analysis' | 'Completed';
  date: string;
  results?: {
    hb?: number;
    wbc?: number;
    chol?: number;
    trig?: number;
  };
}

interface BackendLabOrder {
  id: string;
  name: string;
  name_subtitle: string;
  testName: string;
  doctor: string;
  specimen: string;
  status: 'Received' | 'Collected' | 'Analysis' | 'Completed';
  date: string;
  results?: {
    hb?: number;
    wbc?: number;
    chol?: number;
    trig?: number;
  };
}

interface LabOrdersListResponse {
  success: boolean;
  message?: string;
  data: BackendLabOrder[];
}

interface LabOrderCreateResponse {
  success: boolean;
  message?: string;
  data: BackendLabOrder;
}

interface LabOrderActionResponse {
  success: boolean;
  message?: string;
}

function mapLabOrder(raw: BackendLabOrder): LabOrder {
  return {
    id: raw.id,
    name: raw.name,
    name_subtitle: raw.name_subtitle,
    testName: raw.testName,
    doctor: raw.doctor,
    specimen: raw.specimen,
    status: raw.status,
    date: raw.date,
    results: raw.results
  };
}

@Injectable({
  providedIn: 'root'
})
export class LabOrderService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly ordersSignal = signal<LabOrder[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  readonly labOrders = computed(() => this.ordersSignal());
  readonly loading = computed(() => this.loadingSignal());
  readonly error = computed(() => this.errorSignal());

  readonly pendingCount = computed(() => {
    return this.ordersSignal().filter(o => o.status !== 'Completed').length;
  });

  constructor() {
    // Don't auto-load — components will call loadOrders() explicitly
  }

  async loadOrders(uhid?: string, force = false): Promise<void> {
    if (!force && this.loadingSignal()) {
      return;
    }

    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const url = new URL(`${getApiBaseUrl()}/lab-orders`);
      if (uhid && this.authService.currentRole() !== 'patient') {
        url.searchParams.set('uhid', uhid);
      }

      const response = await firstValueFrom(this.http.get<LabOrdersListResponse>(url.toString()));

      if (!response.success) {
        throw new Error(response.message || 'Failed to load lab orders');
      }

      this.ordersSignal.set(response.data.map(mapLabOrder));
    } catch (error) {
      this.handleError(error);
      this.ordersSignal.set([]);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async createOrder(order: Omit<LabOrder, 'id' | 'status' | 'date'>): Promise<LabOrder> {
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(
        this.http.post<LabOrderCreateResponse>(`${getApiBaseUrl()}/lab-orders`, {
          name_subtitle: order.name_subtitle,
          testName: order.testName,
          doctor: order.doctor,
          specimen: order.specimen
        })
      );

      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to create lab order');
      }

      const created = mapLabOrder(response.data);
      this.upsertOrder(created);
      return created;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async collectSample(id: string): Promise<void> {
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(
        this.http.post<LabOrderActionResponse>(`${getApiBaseUrl()}/lab-orders/${encodeURIComponent(id)}/collect`, {})
      );

      if (!response.success) {
        throw new Error(response.message || 'Failed to collect sample');
      }

      this.ordersSignal.update(list =>
        list.map(o => o.id === id ? { ...o, status: 'Collected' as const } : o)
      );
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async enterResults(id: string, results: LabOrder['results']): Promise<void> {
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(
        this.http.post<LabOrderActionResponse>(
          `${getApiBaseUrl()}/lab-orders/${encodeURIComponent(id)}/results`,
          { results }
        )
      );

      if (!response.success) {
        throw new Error(response.message || 'Failed to submit results');
      }

      this.ordersSignal.update(list =>
        list.map(o => o.id === id ? { ...o, status: 'Completed' as const, results } : o)
      );
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  completedForPatient(uhid: string): LabOrder[] {
    return this.ordersSignal().filter(o => o.name_subtitle.includes(uhid) && o.status === 'Completed');
  }

  forPatient(uhid: string): LabOrder[] {
    return this.ordersSignal().filter(o => o.name_subtitle.includes(uhid));
  }

  private upsertOrder(order: LabOrder): void {
    this.ordersSignal.update(list => {
      const index = list.findIndex(o => o.id === order.id);
      if (index === -1) {
        return [...list, order];
      }
      const updated = [...list];
      updated[index] = order;
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
