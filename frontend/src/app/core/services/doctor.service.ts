import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { getApiBaseUrl } from '../../core/config/api.config';

export interface Doctor {
  id: string;
  name: string;
  email: string;
  specialty: string;
  department_name: string;
  availability_status: string;
}

interface DoctorsResponse {
  success: boolean;
  data: Doctor[];
}

@Injectable({
  providedIn: 'root'
})
export class DoctorService {
  private readonly http = inject(HttpClient);

  private readonly doctorsSignal = signal<Doctor[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  readonly doctors = computed(() => this.doctorsSignal());
  readonly loading = computed(() => this.loadingSignal());
  readonly error = computed(() => this.errorSignal());

  readonly specialties = computed(() => {
    const specs = new Set(this.doctorsSignal().map(d => d.specialty).filter(Boolean));
    return Array.from(specs).sort();
  });

  readonly filteredBySpecialty = computed(() => {
    const spec = this.currentSpecialty();
    if (!spec) return this.doctorsSignal();
    return this.doctorsSignal().filter(d => d.specialty === spec);
  });

  private currentSpecialty = signal<string | null>(null);

  setSpecialty(spec: string | null) {
    this.currentSpecialty.set(spec);
  }

  async loadDoctors(): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(this.http.get<DoctorsResponse>(`${getApiBaseUrl()}/doctors`));
      if (response.success && Array.isArray(response.data)) {
        this.doctorsSignal.set(response.data);
      } else {
        this.doctorsSignal.set([]);
      }
    } catch (error) {
      this.handleError(error);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  getById(id: string): Doctor | undefined {
    return this.doctorsSignal().find(d => d.id === id);
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
