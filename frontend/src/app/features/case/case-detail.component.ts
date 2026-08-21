import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
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

  // Get milestone emoji icons
  getEventIcon(type: string): string {
    switch (type) {
      case 'appointment_booked': return '📅';
      case 'patient_checked_in': return '✅';
      case 'consultation_started': return '🩺';
      case 'consultation_completed': return '📝';
      case 'prescription_created': return '💊';
      case 'drug_dispensed': return '📦';
      case 'lab_ordered': return '🧪';
      case 'lab_completed': return '🔬';
      case 'payment_received': return '💰';
      default: return '📍';
    }
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
