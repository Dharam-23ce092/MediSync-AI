import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { getApiBaseUrl } from '../../core/config/api.config';
import { AuthService } from '../../core/services/auth.service';

interface TimelineEvent {
  id: string;
  eventType: string;
  actorRole: string;
  actorName?: string;
  summary: string;
  date: string;
}

interface CaseDetails {
  id: string;
  caseNumber: string;
  type: string;
  status: string;
  chiefComplaint: string;
  diagnosis?: string;
  admissionDate?: string;
  dischargeDate?: string;
  patientId: string;
  patientName: string;
  patientUhid: string;
  gender: string;
  age: number;
  bloodGroup: string;
  doctorName?: string;
  timeline: TimelineEvent[];
  appointments: any[];
  prescriptions: any[];
  labs: any[];
  invoices: any[];
  beds: any[];
  notes: any[];
}

@Component({
  selector: 'app-case-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './case-detail.component.html',
  styleUrl: './case-detail.component.css'
})
export class CaseDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly caseData = signal<CaseDetails | null>(null);
  readonly isLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    const caseId = this.route.snapshot.paramMap.get('id');
    if (caseId) {
      this.fetchCaseDetails(caseId);
    } else {
      this.errorMessage.set('Case ID not found in route context');
      this.isLoading.set(false);
    }
  }

  get token(): string | null {
    return this.authService.getToken();
  }

  async fetchCaseDetails(caseId: string): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.token}`
    });

    try {
      const url = `${getApiBaseUrl()}/cases/${caseId}`;
      const response = await this.http.get<{ success: boolean, data: CaseDetails }>(url, { headers }).toPromise();
      if (response && response.success) {
        this.caseData.set(response.data);
      } else {
        this.errorMessage.set('Failed to retrieve case details');
      }
    } catch (err: any) {
      console.error(err);
      this.errorMessage.set(err.error?.message || 'Access denied or system error fetching case details.');
    } finally {
      this.isLoading.set(false);
    }
  }

  // Get milestone SVG icons
  getEventIcon(type: string): SafeHtml {
    let svg = '';
    switch (type) {
      case 'appointment_booked':
        svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>';
        break;
      case 'patient_checked_in':
        svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
        break;
      case 'consultation_started':
        svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"></path><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"></path><circle cx="20" cy="10" r="2"></circle></svg>';
        break;
      case 'consultation_completed':
        svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>';
        break;
      case 'prescription_created':
        svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 20.5L3.5 13.5A5 5 0 0 1 10.5 6.5L17.5 13.5A5 5 0 0 1 10.5 20.5Z"></path><line x1="8.5" y1="8.5" x2="15.5" y2="15.5"></line></svg>';
        break;
      case 'drug_dispensed':
        svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>';
        break;
      case 'lab_ordered':
      case 'lab_completed':
        svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.31L4.62 19A2 2 0 0 0 6.38 22h11.24a2 2 0 0 0 1.76-3L14 9.31V2"></path><line x1="8.5" y1="2" x2="15.5" y2="2"></line><line x1="14" y1="9.31" x2="10" y2="9.31"></line></svg>';
        break;
      case 'payment_received':
        svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>';
        break;
      default:
        svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="2"></circle></svg>';
    }
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  // Clean status labels
  getStatusClass(status: string): string {
    switch (status.toLowerCase()) {
      case 'closed': return 'status-closed';
      case 'registered': return 'status-registered';
      case 'waiting': return 'status-waiting';
      case 'in_consultation': return 'status-consulting';
      case 'prescription_issued':
      case 'prescription_pending': return 'status-prescription';
      case 'lab_pending': return 'status-lab-pending';
      case 'lab_complete': return 'status-lab-complete';
      case 'pharmacy_dispensed': return 'status-pharmacy';
      default: return 'status-default';
    }
  }

  getStatusLabel(status: string): string {
    return status.replace(/_/g, ' ').toUpperCase();
  }

  // Back redirect based on role
  goBack(): void {
    const role = this.authService.currentRole();
    if (role === 'doctor') {
      this.router.navigate(['/doctor/dashboard.component']);
    } else if (role === 'patient') {
      this.router.navigate(['/patient/dashboard.component']);
    } else if (role === 'admin' || role === 'super_admin') {
      this.router.navigate(['/admin/dashboard.component']);
    } else {
      this.router.navigate(['/']);
    }
  }
}
