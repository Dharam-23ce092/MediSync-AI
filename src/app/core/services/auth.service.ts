import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { getApiBaseUrl } from '../config/api.config';

export type UserRole = 'doctor' | 'nurse' | 'admin' | 'patient' | 'pharmacist' | 'lab';

export interface UserSession {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  uhid?: string;
  specialty?: string;
}

interface LoginResponse {
  success: boolean;
  message: string;
  data?: {
    token: string;
    user: UserSession;
  };
  errorCode?: string;
}

const TOKEN_KEY = 'medisync_token';
const USER_KEY = 'medisync_user';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly currentUserSignal = signal<UserSession | null>(null);
  private readonly tokenSignal = signal<string | null>(null);

  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => {
    const user = this.currentUserSignal();
    const token = this.tokenSignal();
    return user !== null && token !== null && this.isTokenValid(token);
  });
  readonly currentRole = computed(() => this.currentUserSignal()?.role ?? null);

  constructor() {
    this.restoreSession();
  }

  getToken(): string | null {
    return this.tokenSignal();
  }

  getPortalRouteForRole(role: UserRole): string {
    const routes: Record<UserRole, string> = {
      doctor: '/doctor/dashboard.component',
      nurse: '/nurse/dashboard.component',
      admin: '/admin/dashboard.component',
      patient: '/patient/dashboard.component',
      pharmacist: '/pharmacist/dashboard.component',
      lab: '/lab/dashboard.component'
    };
    return routes[role];
  }

  async login(email: string, password: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<LoginResponse>(`${getApiBaseUrl()}/auth/login`, { email, password })
    );

    if (!response.success || !response.data) {
      throw new Error(response.message || 'Login failed');
    }

    this.persistSession(response.data.token, response.data.user);
  }

  async logout(): Promise<void> {
    const token = this.tokenSignal();
    if (token) {
      try {
        await firstValueFrom(this.http.post(`${getApiBaseUrl()}/auth/logout`, {}));
      } catch {
        // Clear local session even if the backend logout call fails.
      }
    }

    this.clearSession();
    await this.router.navigate(['/login']);
  }

  clearSession(): void {
    this.currentUserSignal.set(null);
    this.tokenSignal.set(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  private persistSession(token: string, user: UserSession): void {
    this.tokenSignal.set(token);
    this.currentUserSignal.set({ ...user });
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  private restoreSession(): void {
    const token = localStorage.getItem(TOKEN_KEY);
    const userRaw = localStorage.getItem(USER_KEY);

    if (!token || !userRaw) {
      return;
    }

    if (!this.isTokenValid(token)) {
      this.clearSession();
      return;
    }

    try {
      const user = JSON.parse(userRaw) as UserSession;
      this.tokenSignal.set(token);
      this.currentUserSignal.set(user);
    } catch {
      this.clearSession();
    }
  }

  private isTokenValid(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1])) as { exp?: number };
      if (!payload.exp) {
        return false;
      }
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }
}
