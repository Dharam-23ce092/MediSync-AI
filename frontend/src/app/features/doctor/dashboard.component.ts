import { Component, OnInit, signal, computed, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { BaseCard } from '../../shared/components/base-card/base-card.component';
import { BaseTable, TableColumn } from '../../shared/components/base-table/base-table.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { AppointmentService } from '../../core/services/appointment.service';
import { AuthService } from '../../core/services/auth.service';
import { DashboardService } from '../../core/services/dashboard.service';

@Component({
  selector: 'app-doctor-dashboard',
  standalone: true,
  imports: [CommonModule, BaseCard, BaseTable, TooltipDirective],
  template: `
    <div class="doctor-dashboard-container animate-fade">
      <!-- Welcome Header -->
      <div class="dashboard-welcome">
        <div>
          <h1 class="welcome-heading">Welcome Back, {{ doctorName() }}</h1>
          <p class="welcome-sub" *ngIf="metrics() as m">
            You have {{ m.appointmentsToday }} appointments scheduled for today.
          </p>
        </div>
        <div class="quick-status-pills">
          <span class="status-indicator-pill normal" appTooltip="All systems running smoothly" tooltipPosition="bottom">
            <span class="indicator-dot"></span> System Live
          </span>
          <span class="status-indicator-pill info" appTooltip="Current active cardiology shift" tooltipPosition="bottom">
            Cardiology Shift A
          </span>
        </div>
      </div>

      <!-- Quick Metrics Grid -->
      <div class="metrics-grid">
        <app-base-card [border]="true" elevation="sm">
          <div class="metric-card-content" card-body appTooltip="Today's appointments" tooltipPosition="top">
            <div class="metric-icon opd-blue"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg></div>
            <div class="metric-info">
              <span class="metric-label">Today's Appointments</span>
              <h3 class="metric-value">{{ metrics()?.appointmentsToday ?? 0 }}</h3>
              <span class="metric-trend neutral">{{ metrics()?.waitingPatients ?? 0 }} waiting</span>
            </div>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-card-content" card-body appTooltip="Consultations in progress" tooltipPosition="top">
            <div class="metric-icon complete-green"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"></path><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"></path><circle cx="20" cy="10" r="2"></circle></svg></div>
            <div class="metric-info">
              <span class="metric-label">In Consultation</span>
              <h3 class="metric-value">{{ metrics()?.inConsultation ?? 0 }}</h3>
            </div>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm" statusBorder="critical">
          <div class="metric-card-content" card-body appTooltip="Critical vital logs needing review" tooltipPosition="top">
            <div class="metric-icon alert-red"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div>
            <div class="metric-info">
              <span class="metric-label">Critical Vitals Alerts</span>
              <h3 class="metric-value red-text">{{ metrics()?.criticalVitals ?? 0 }}</h3>
              <span class="metric-trend negative" *ngIf="metrics() && metrics()!.criticalVitals > 0">Requires attention</span>
            </div>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-card-content" card-body appTooltip="Average waiting time across OPD" tooltipPosition="top">
            <div class="metric-icon time-orange"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></div>
            <div class="metric-info">
              <span class="metric-label">Avg. Wait Time</span>
              <h3 class="metric-value">—</h3>
              <span class="metric-trend neutral">Calculating</span>
            </div>
          </div>
        </app-base-card>
      </div>

      <!-- Primary Layout Grid -->
      <div class="dashboard-layout-grid">
        <!-- Main: Today's Appointments -->
        <div class="main-column">
          <app-base-card [border]="true" elevation="sm">
            <h3 class="section-title" card-header>
              Today's Appointment Schedule
              <span class="subtitle">Next patients in your consulting queue</span>
            </h3>
            <div card-body class="p-0">
              <app-base-table
                [columns]="tableColumns"
                [data]="appointments()"
                [totalItems]="12"
                [pageSize]="5"
                [currentPage]="1"
                [showSearch]="false"
                [showPagination]="false"
                (rowClick)="onPatientSelect($event)"
                (actionClick)="onTableAction($event)"
              ></app-base-table>
            </div>
            <div card-footer class="text-right">
              <button class="footer-action-btn" (click)="goToOpdQueue()" appTooltip="Open full OPD consultation screen" tooltipPosition="left">
                Go to Active Consultation Queue →
              </button>
            </div>
          </app-base-card>
        </div>

        <!-- Sidebar: Critical Alerts -->
        <div class="sidebar-column">
          <app-base-card [border]="true" elevation="sm" statusBorder="critical">
            <h3 class="section-title critical-header" card-header>
              <span class="section-title-row"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-icon text-danger"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Active Vitals Alerts</span>
            </h3>
            <div card-body class="alerts-list">
              <div class="alert-item" appTooltip="Blood Pressure alert - Click to view EHR" tooltipPosition="left" (click)="goToConsultation('P1002')">
                <div class="alert-meta">
                  <span class="patient-name">Aarav Mehta</span>
                  <span class="patient-id">UHID-2026-102</span>
                </div>
                <div class="alert-details">
                  <span class="alert-label">Systolic BP</span>
                  <span class="alert-value text-danger">174/98 mmHg</span>
                </div>
              </div>

              <div class="alert-item" appTooltip="Heart Rate alert - Click to view EHR" tooltipPosition="left" (click)="goToConsultation('P1004')">
                <div class="alert-meta">
                  <span class="patient-name">Meera Sen</span>
                  <span class="patient-id">UHID-2026-104</span>
                </div>
                <div class="alert-details">
                  <span class="alert-label">Pulse (Heart Rate)</span>
                  <span class="alert-value text-danger">112 bpm</span>
                </div>
              </div>
            </div>
          </app-base-card>

          <!-- AI decision support tip of the day -->
          <app-base-card [border]="true" elevation="sm" class="margin-top-md">
            <h3 class="section-title ai-spark-header" card-header>
              <span class="section-title-row"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-icon text-teal"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> AI Operational Insight</span>
            </h3>
            <div card-body class="ai-spark-content">
              <p class="ai-text">
                OPD queue congestion is projected to peak in 45 minutes due to 3 scheduled procedures in adjacent rooms.
                <strong>Recommendation:</strong> Complete consultations for <em>Token 21 & 22</em> ahead of time to minimize estimated waits.
              </p>
            </div>
          </app-base-card>
        </div>
      </div>
    </div>
  `,
  styles: `
    .doctor-dashboard-container {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-lg);
    }
    .dashboard-welcome {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .welcome-heading {
      font-size: 24px;
      font-weight: 700;
      color: var(--color-text-primary);
    }
    .welcome-sub {
      font-size: 13px;
      color: var(--color-text-secondary);
      margin-top: 2px;
    }
    .quick-status-pills {
      display: flex;
      gap: var(--spacing-sm);
    }
    .status-indicator-pill {
      font-size: 0.875rem;
      font-weight: 500;
      padding: 6px 14px;
      border-radius: var(--border-radius-full);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--color-border);
      background: rgba(255, 255, 255, 0.04);
      color: var(--color-text-secondary);
    }
    .status-indicator-pill.normal {
      color: #34D399;
      border: 1px solid rgba(16, 185, 129, 0.2);
      background-color: rgba(16, 185, 129, 0.1);
    }
    .status-indicator-pill.info {
      color: #38BDF8;
      border: 1px solid rgba(56, 189, 248, 0.2);
      background-color: rgba(56, 189, 248, 0.1);
    }
    .indicator-dot {
      width: 7px;
      height: 7px;
      border-radius: var(--border-radius-full);
      background-color: #34D399;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--spacing-md);
    }
    .metric-card-content {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
    }
    .metric-icon {
      font-size: 28px;
      width: 48px;
      height: 48px;
      border-radius: var(--border-radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .opd-blue { background-color: rgba(56, 189, 248, 0.12); color: #38BDF8; }
    .complete-green { background-color: rgba(16, 185, 129, 0.1); color: #34D399; }
    .alert-red { background-color: rgba(239, 68, 68, 0.1); color: #EF4444; }
    .time-orange { background-color: rgba(249, 115, 22, 0.12); color: #f97316; }

    .section-title-row {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .inline-icon { flex-shrink: 0; }
    .text-teal { color: var(--color-accent); }

    .metric-info {
      display: flex;
      flex-direction: column;
    }
    .metric-label {
      font-size: 12px;
      color: var(--color-text-secondary);
      font-weight: 500;
    }
    .metric-value {
      font-size: 22px;
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 2px 0;
      line-height: 1.1;
    }
    .red-text { color: var(--color-critical) !important; }
    .metric-trend {
      font-size: 11px;
      font-weight: 500;
    }
    .metric-trend.positive { color: var(--color-normal); }
    .metric-trend.neutral { color: var(--color-text-secondary); }
    .metric-trend.negative { color: var(--color-critical); }

    .dashboard-layout-grid {
      display: grid;
      grid-template-columns: 8fr 4fr;
      gap: var(--spacing-lg);
    }
    .section-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--color-text-primary);
      display: flex;
      flex-direction: column;
    }
    .section-title .subtitle {
      font-size: 11px;
      color: var(--color-text-secondary);
      font-weight: 400;
      margin-top: 2px;
    }
    .critical-header { color: var(--color-critical); }
    .critical-header .text-danger { color: var(--color-critical); }
    .ai-spark-header { color: var(--color-accent); }

    .alerts-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }
    .alert-item {
      padding: var(--spacing-sm) var(--spacing-md);
      background-color: var(--color-bg-base);
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-sm);
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .alert-item:hover {
      transform: translateX(2px);
      box-shadow: var(--color-card-shadow);
      border-color: var(--color-border-hover);
    }
    .alert-meta {
      display: flex;
      flex-direction: column;
    }
    .patient-name {
      font-weight: 600;
      font-size: 12px;
      color: var(--color-text-primary);
    }
    .patient-id {
      font-size: 10px;
      color: var(--color-text-secondary);
    }
    .alert-details {
      display: flex;
      flex-direction: column;
      text-align: right;
    }
    .alert-label {
      font-size: 10px;
      color: var(--color-text-secondary);
    }
    .alert-value {
      font-weight: 700;
      font-size: 12px;
    }
    .text-danger { color: var(--color-critical); }

    .ai-spark-content {
      background-color: var(--color-bg-base);
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-md);
      padding: var(--spacing-md);
    }
    .ai-text {
      font-size: 12.5px;
      color: var(--color-text-body);
      line-height: 1.5;
    }

    .footer-action-btn {
      background: transparent;
      border: none;
      color: var(--color-primary);
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
      padding: var(--spacing-xs) var(--spacing-sm);
      border-radius: var(--border-radius-sm);
      transition: var(--transition-fast);
    }
    .footer-action-btn:hover {
      background-color: var(--color-primary-glow);
    }
    .margin-top-md {
      margin-top: var(--spacing-md);
    }
  `
})
export class DoctorDashboard implements OnInit {
  tableColumns: TableColumn[] = [
    { header: 'Token', key: 'token', align: 'center', width: '80px' },
    { header: 'Patient Name', key: 'name', type: 'avatar', width: '220px' },
    { header: 'UHID', key: 'uhid', width: '120px' },
    { header: 'Appt Time', key: 'time', align: 'center', width: '100px' },
    {
      header: 'Type',
      key: 'type',
      type: 'badge',
      width: '100px',
      badgeMap: {
        'New': { label: 'New', class: 'pill-info' },
        'Follow-up': { label: 'Follow-up', class: 'pill-secondary' },
        'Emergency': { label: 'Emergency', class: 'pill-critical' }
      }
    },
    {
      header: 'Status',
      key: 'status',
      type: 'badge',
      width: '120px',
      badgeMap: {
        'Waiting': { label: 'Waiting', class: 'pill-urgent' },
        'In Consultation': { label: 'In Consultation', class: 'pill-normal' },
        'Completed': { label: 'Completed', class: 'pill-secondary' }
      }
    },
    {
      header: 'Actions',
      key: 'actions',
      type: 'actions',
      width: '100px',
      align: 'center',
      actions: [
        {
          label: 'Consult',
          action: 'consult',
          class: 'btn-primary',
          tooltip: 'Open consultation soap writer workspace',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>'
        }
      ]
    }
  ];

  appointments = signal<any[]>([]);

  protected dashboardService = inject(DashboardService);
  private appointmentService = inject(AppointmentService);
  private authService = inject(AuthService);

  doctorName = computed(() => this.authService.currentUser()?.name ?? 'Doctor');
  metrics = computed(() => this.dashboardService.doctorMetricsData());

  constructor(private router: Router) {
    effect(() => {
      const user = this.authService.currentUser();
      const queue = this.appointmentService.todaysQueue(
        user?.role === 'doctor' ? user.name : undefined
      );
      this.appointments.set(queue);
    });
  }

  ngOnInit() {
    const user = this.authService.currentUser();
    void this.dashboardService.loadForRole(user?.role ?? 'doctor');
    void this.appointmentService.loadAppointments(
      user?.role === 'doctor' ? { doctorName: user.name } : undefined
    );
  }

  onPatientSelect(patient: any) {
    this.goToConsultation(patient.id);
  }

  onTableAction(event: { action: string, row: any }) {
    if (event.action === 'consult') {
      this.goToConsultation(event.row.id);
    }
  }

  goToConsultation(patientId: string) {
    this.router.navigate(['/doctor/consultation.component', patientId]);
  }

  goToOpdQueue() {
    this.router.navigate(['/doctor/opd.component']);
  }
}
