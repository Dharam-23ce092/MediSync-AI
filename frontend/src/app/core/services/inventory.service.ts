import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { getApiBaseUrl } from '../config/api.config';

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  batch: string;
  qty: number;
  unit: string;
  reorder_level: number;
  unit_price: number;
  expiry: string;
  manufacturer: string;
  status: 'In Stock' | 'Low Stock' | 'Out of Stock';
}

interface InventoryListResponse {
  success: boolean;
  message?: string;
  data: InventoryItem[];
}

interface InventoryActionResponse {
  success: boolean;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class InventoryService {
  private readonly http = inject(HttpClient);

  private readonly itemsSignal = signal<InventoryItem[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  readonly items = computed(() => this.itemsSignal());
  readonly loading = computed(() => this.loadingSignal());
  readonly error = computed(() => this.errorSignal());

  readonly lowStockCount = computed(() =>
    this.itemsSignal().filter(i => i.status === 'Low Stock' || i.status === 'Out of Stock').length
  );

  async loadInventory(force = false): Promise<void> {
    if (!force && this.loadingSignal()) {
      return;
    }

    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(this.http.get<InventoryListResponse>(`${getApiBaseUrl()}/inventory`));

      if (!response.success) {
        throw new Error(response.message || 'Failed to load inventory');
      }

      this.itemsSignal.set(response.data);
    } catch (error) {
      this.handleError(error);
      this.itemsSignal.set([]);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async requestReorder(id: string): Promise<string> {
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(
        this.http.patch<InventoryActionResponse>(`${getApiBaseUrl()}/inventory/${encodeURIComponent(id)}/reorder`, {})
      );

      if (!response.success) {
        throw new Error(response.message || 'Failed to submit reorder');
      }

      return response.message || 'Reorder request submitted';
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

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
