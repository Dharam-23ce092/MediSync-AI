import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { getApiBaseUrl } from '../config/api.config';

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  user_subtitle: string;
  role: string;
  event: string;
  module: string;
  ipAddress: string;
  severity: 'info' | 'warning' | 'critical';
}

interface AuditLogsResponse {
  success: boolean;
  data: AuditLog[];
}

@Injectable({
  providedIn: 'root'
})
export class AuditService {
  private readonly http = inject(HttpClient);

  private readonly logsSignal = signal<AuditLog[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  readonly logs = computed(() => this.logsSignal());
  readonly loading = computed(() => this.loadingSignal());
  readonly error = computed(() => this.errorSignal());

  readonly totalLogs = computed(() => this.logsSignal().length);
  readonly phiDisclosures = computed(() => this.logsSignal().filter(l => l.module === 'EHR').length);
  readonly securityWarnings = computed(() => this.logsSignal().filter(l => l.severity === 'warning' || l.severity === 'critical').length);
  readonly accessViolations = computed(() => this.logsSignal().filter(l => l.severity === 'critical').length);

  async loadAuditLogs(): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(this.http.get<AuditLogsResponse>(`${getApiBaseUrl()}/audit-logs`));
      if (response.success && Array.isArray(response.data)) {
        this.logsSignal.set(response.data);
      } else {
        this.logsSignal.set([]);
      }
    } catch (error) {
      this.handleError(error);
    } finally {
      this.loadingSignal.set(false);
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
