import { Component, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { getApiBaseUrl } from '../../core/config/api.config';
import { AuthService } from '../../core/services/auth.service';
interface Overview {
  title: string;
  subtitle: string;
  cards: {
    label: string;
    value: string | number;
    hint: string;
    link: string;
    tone: string;
    format?: string;
  }[];
  work: any[];
  activity: any[];
  workLink: string;
  updatedAt: string;
}
@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './workspace.component.html',
  styleUrl: './workspace.component.css',
})
export class WorkspaceComponent implements OnDestroy {
  private http = inject(HttpClient);
  readonly auth = inject(AuthService);
  data = signal<Overview | null>(null);
  loading = signal(false);
  error = signal('');
  readonly today = new Date();
  readonly role = this.auth.currentRole() || 'patient';
  readonly actions: Record<
    string,
    { title: string; description: string; link: string; icon: string }[]
  > = {
    admin: [
      {
        title: 'Review appointments',
        description: 'Accept requests and check patients in',
        link: '/admin/appointments',
        icon: '↗',
      },
      {
        title: 'Manage beds',
        description: 'Admit, discharge and prepare beds',
        link: '/admin/beds.component',
        icon: '▦',
      },
      {
        title: 'Patient cases',
        description: 'Trace a visit from start to finish',
        link: '/cases',
        icon: '⌕',
      },
      {
        title: 'Billing desk',
        description: 'Review invoices and record receipts',
        link: '/admin/billing',
        icon: '₹',
      },
    ],
    doctor: [
      {
        title: 'Appointment requests',
        description: 'Review and confirm patient visits',
        link: '/doctor/appointments',
        icon: '↗',
      },
      {
        title: 'Consultation queue',
        description: 'Start or resume today’s care',
        link: '/doctor/opd.component',
        icon: '→',
      },
      {
        title: 'Patient registry',
        description: 'Patient profiles and clinical history',
        link: '/doctor/patients.component',
        icon: '⌕',
      },
    ],
    patient: [
      {
        title: 'Book an appointment',
        description: 'Choose a provider, date and time',
        link: '/patient/book.component',
        icon: '+',
      },
      {
        title: 'My appointments',
        description: 'Track approval and visit status',
        link: '/patient/appointments',
        icon: '↗',
      },
      {
        title: 'My health records',
        description: 'View prescriptions and lab results',
        link: '/patient/records',
        icon: '▤',
      },
      {
        title: 'Bills & receipts',
        description: 'Understand your recorded charges',
        link: '/patient/billing',
        icon: '₹',
      },
    ],
    nurse: [
      {
        title: 'Ward patients',
        description: 'View beds and record patient vitals',
        link: '/nurse/patients.component',
        icon: '▦',
      },
      {
        title: 'Care tasks',
        description: 'Complete the nursing checklist',
        link: '/nurse/rounds',
        icon: '✓',
      },
      {
        title: 'Vitals alerts',
        description: 'Review recorded observations',
        link: '/nurse/alerts',
        icon: '!',
      },
    ],
    pharmacist: [
      {
        title: 'Dispense prescriptions',
        description: 'Review the pending prescription queue',
        link: '/pharmacist/dispensing',
        icon: '→',
      },
      {
        title: 'Inventory',
        description: 'Review stock, batches and expiry',
        link: '/pharmacist/inventory',
        icon: '▦',
      },
    ],
    lab: [
      {
        title: 'Sample collection',
        description: 'Track incoming diagnostic orders',
        link: '/lab/samples',
        icon: '→',
      },
      {
        title: 'Enter results',
        description: 'Publish results for collected samples',
        link: '/lab/results',
        icon: '▤',
      },
    ],
  };
  private timer = window.setInterval(() => void this.refresh(), 60000);
  constructor() {
    void this.refresh();
  }
  ngOnDestroy() {
    window.clearInterval(this.timer);
  }
  async refresh() {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const r = await firstValueFrom(
        this.http.get<{ data: Overview }>(`${getApiBaseUrl()}/overview`),
      );
      this.data.set(r.data);
    } catch {
      this.error.set('The latest data could not be loaded. Check the connection and try again.');
    } finally {
      this.loading.set(false);
    }
  }
}
