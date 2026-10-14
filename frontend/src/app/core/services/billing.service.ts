import { Injectable, signal, computed, inject, effect, untracked } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { getApiBaseUrl } from '../config/api.config';
import { AuthService } from './auth.service';

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface PaymentRecord {
  id: string;
  amount: number;
  paymentMethod: string;
  transactionReference: string;
  date: string;
}

export interface Invoice {
  id: string;
  patientId?: string;
  name: string;
  uhid: string;
  invoiceNumber: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
  status: 'PENDING' | 'PAID' | 'PARTIAL';
  date: string;
  items?: InvoiceItem[];
  payments?: PaymentRecord[];
}

interface BackendInvoice {
  id: string;
  name: string;
  uhid: string;
  invoiceNumber: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
  status: string;
  date: string;
}

interface InvoicesListResponse {
  success: boolean;
  message?: string;
  data: BackendInvoice[];
}

interface InvoiceDetailResponse {
  success: boolean;
  message?: string;
  data: BackendInvoice & {
    items: InvoiceItem[];
    payments: PaymentRecord[];
  };
}

interface PaymentResponse {
  success: boolean;
  message?: string;
  data: {
    paymentId: string;
    newPaid: number;
    newBalance: number;
    newStatus: string;
  };
}

function mapInvoice(raw: BackendInvoice): Invoice {
  return {
    id: raw.id,
    name: raw.name,
    uhid: raw.uhid,
    invoiceNumber: raw.invoiceNumber,
    subtotal: Number(raw.subtotal),
    discount: Number(raw.discount),
    tax: Number(raw.tax),
    total: Number(raw.total),
    paid: Number(raw.paid),
    balance: Number(raw.balance),
    status: raw.status as Invoice['status'],
    date: raw.date
  };
}

@Injectable({
  providedIn: 'root'
})
export class BillingService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly invoicesSignal = signal<Invoice[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  readonly invoices = computed(() => this.invoicesSignal());
  readonly loading = computed(() => this.loadingSignal());
  readonly error = computed(() => this.errorSignal());

  readonly totalOutstanding = computed(() => {
    return this.invoicesSignal().reduce((sum, inv) => sum + inv.balance, 0);
  });

  readonly totalPaid = computed(() => {
    return this.invoicesSignal().reduce((sum, inv) => sum + inv.paid, 0);
  });

  readonly pendingCount = computed(() => {
    return this.invoicesSignal().filter(inv => inv.status === 'PENDING').length;
  });

  constructor() {
    effect(() => {
      if (this.authService.isAuthenticated()) {
        const role = this.authService.currentRole();
        if (role === 'admin' || role === 'patient') {
          untracked(() => { void this.loadInvoices(); });
        }
      } else {
        this.invoicesSignal.set([]);
        this.errorSignal.set(null);
        this.loadingSignal.set(false);
      }
    });
  }

  async loadInvoices(force = false): Promise<void> {
    if (!force && this.loadingSignal()) {
      return;
    }

    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(this.http.get<InvoicesListResponse>(`${getApiBaseUrl()}/billing`));

      if (!response.success) {
        throw new Error(response.message || 'Failed to load invoices');
      }

      this.invoicesSignal.set(response.data.map(mapInvoice));
    } catch (error) {
      this.handleError(error);
      this.invoicesSignal.set([]);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async loadInvoiceDetail(id: string): Promise<Invoice | null> {
    try {
      const response = await firstValueFrom(
        this.http.get<InvoiceDetailResponse>(`${getApiBaseUrl()}/billing/${encodeURIComponent(id)}`)
      );

      if (!response.success) {
        return null;
      }

      return {
        ...mapInvoice(response.data),
        items: response.data.items,
        payments: response.data.payments
      };
    } catch {
      return null;
    }
  }

  async payInvoice(id: string, amount: number, paymentMethod: string, transactionReference?: string): Promise<{ newPaid: number; newBalance: number; newStatus: string }> {
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(
        this.http.post<PaymentResponse>(`${getApiBaseUrl()}/billing/${encodeURIComponent(id)}/pay`, {
          amount,
          paymentMethod,
          transactionReference: transactionReference || `TXN-${Date.now()}`
        })
      );

      if (!response.success) {
        throw new Error(response.message || 'Payment failed');
      }

      await this.loadInvoices(true);
      return response.data;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  getById(id: string): Invoice | undefined {
    return this.invoicesSignal().find(inv => inv.id === id);
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
