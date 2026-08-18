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
            <div class="metric-icon opd-blue">📋</div>
            <div class="metric-info">
              <span class="metric-label">Today's Appointments</span>
              <h3 class="metric-value">{{ metrics()?.appointmentsToday ?? 0 }}</h3>
              <span class="metric-trend neutral">{{ metrics()?.waitingPatients ?? 0 }} waiting</span>
            </div>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-card-content" card-body appTooltip="Consultations in progress" tooltipPosition="top">
            <div class="metric-icon complete-green">🩺</div>
            <div class="metric-info">
              <span class="metric-label">In Consultation</span>
              <h3 class="metric-value">{{ metrics()?.inConsultation ?? 0 }}</h3>
            </div>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm" statusBorder="critical">
          <div class="metric-card-content" card-body appTooltip="Critical vital logs needing review" tooltipPosition="top">
            <div class="metric-icon alert-red">⚠️</div>
            <div class="metric-info">
              <span class="metric-label">Critical Vitals Alerts</span>
              <h3 class="metric-value red-text">{{ metrics()?.criticalVitals ?? 0 }}</h3>
              <span class="metric-trend negative" *ngIf="metrics() && metrics()!.criticalVitals > 0">Requires attention</span>
            </div>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-card-content" card-body appTooltip="Average waiting time across OPD" tooltipPosition="top">
            <div class="metric-icon time-orange">⏱️</div>
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
              🚨 Active Vitals Alerts
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
              ⭐ AI Operational Insight
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
      font-size: 11px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: var(--border-radius-full);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--color-border);
      background-color: var(--color-bg-surface);
      color: var(--color-text-secondary);
    }
    .status-indicator-pill.normal {
      color: var(--color-normal);
      border-color: var(--color-normal-border);
      background-color: var(--color-normal-light);
    }
    .status-indicator-pill.info {
      color: var(--color-info);
      border-color: var(--color-info-border);
      background-color: var(--color-info-light);
    }
    .indicator-dot {
      width: 6px;
      height: 6px;
      border-radius: var(--border-radius-full);
      background-color: var(--color-normal);
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
    .opd-blue { background-color: var(--color-primary-glow); }
    .complete-green { background-color: var(--color-normal-light); }
    .alert-red { background-color: var(--color-critical-light); }
    .time-orange { background-color: var(--color-urgent-light); }

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
      display: flex;
      flex-direction: column;
    }
    .section-title .subtitle {
      font-size: 11px;
      color: var(--color-text-muted);
      font-weight: 400;
      margin-top: 2px;
    }
    .critical-header { color: var(--color-critical); }
    .ai-spark-header { color: var(--color-accent); }

    .alerts-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }
    .alert-item {
      padding: var(--spacing-sm) var(--spacing-md);
      background-color: var(--color-critical-light);
      border: 1px solid var(--color-critical-border);
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
      background-color: var(--color-accent-lightest);
      border: 1.5px dashed var(--color-accent);
      border-radius: var(--border-radius-md);
      padding: var(--spacing-md);
    }
    .ai-text {
      font-size: 12.5px;
      color: var(--color-text-secondary);
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
