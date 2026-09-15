import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { getApiBaseUrl } from '../config/api.config';

export interface NurseTask {
  id: string;
  bed: string;
  patientName: string;
  patient?: string;
  task: string;
  scheduledTime: string;
  time?: string;
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
}

interface NurseTasksListResponse {
  success: boolean;
  message?: string;
  data: any[];
}

interface NurseTaskToggleResponse {
  success: boolean;
  data?: { id: string; completed: boolean };
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class NurseTaskService {
  private readonly http = inject(HttpClient);

  private readonly tasksSignal = signal<NurseTask[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  readonly tasks = computed(() => this.tasksSignal());
  readonly loading = computed(() => this.loadingSignal());
  readonly error = computed(() => this.errorSignal());

  readonly pendingCount = computed(() =>
    this.tasksSignal().filter(t => !t.completed).length
  );

  async loadTasks(force = false): Promise<void> {
    if (!force && this.loadingSignal()) {
      return;
    }

    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(this.http.get<NurseTasksListResponse>(`${getApiBaseUrl()}/nurse-tasks`));

      if (!response.success) {
        throw new Error(response.message || 'Failed to load nurse tasks');
      }

      this.tasksSignal.set(response.data.map(item => ({
        ...item,
        patient: item.patientName,
        time: item.scheduledTime
      })));
    } catch (error) {
      this.handleError(error);
      this.tasksSignal.set([]);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async toggleTask(id: string): Promise<void> {
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(
        this.http.patch<NurseTaskToggleResponse>(`${getApiBaseUrl()}/nurse-tasks/${encodeURIComponent(id)}/toggle`, {})
      );

      if (!response.success) {
        throw new Error(response.message || 'Failed to toggle task');
      }

      // Update local state
      this.tasksSignal.update(list =>
        list.map(t => t.id === id ? { ...t, completed: !t.completed } : t)
      );
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
