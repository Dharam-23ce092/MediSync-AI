import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { BaseCard } from '../../shared/components/base-card/base-card.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { AppointmentService } from '../../core/services/appointment.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-patient-queue',
  standalone: true,
  imports: [CommonModule, BaseCard, TooltipDirective],
  template: `
    <div class="patient-queue-container animate-fade">
      <!-- Title Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Live Consultations Queue Tracker</h1>
          <p class="page-sub">Monitor your appointment queue status in real time.</p>
        </div>
        <div class="header-actions">
          <button class="back-btn" (click)="goBack()">
            ← Back to Portal
          </button>
        </div>
      </div>

      <div class="queue-status-banner loading" *ngIf="appointmentService.loading()">
        Loading queue data...
      </div>
      <div class="queue-status-banner error" *ngIf="appointmentService.error() && !appointmentService.loading()">
        {{ appointmentService.error() }}
      </div>

      <!-- Empty State -->
      <div class="queue-empty-state" *ngIf="!appointmentService.loading() && appointmentService.appointments().length === 0">
        <div class="empty-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
        </div>
        <h3 class="empty-title">No Active Queue</h3>
        <p class="empty-text">You have no appointments in the queue today. Book an appointment to see your queue position.</p>
      </div>

      <!-- Main Queue Columns Grid -->
      <div class="queue-layout-grid" *ngIf="appointmentService.appointments().length > 0">
        <!-- Live Token Position Board -->
        <div class="main-column">
          <app-base-card [border]="true" elevation="sm" statusBorder="info">
            <h3 class="section-title text-blue" card-header>
              Live Wait Queue Token Board
              <span class="subtitle">Real-time appointment queue status</span>
            </h3>
            <div card-body class="token-board-content">
              <!-- Token numbers grid -->
              <div class="token-status-cards" *ngIf="nowConsulting() || myAppointment()">
                <div class="token-card-box current-consulting" appTooltip="Currently consulting inside" tooltipPosition="top" *ngIf="nowConsulting()">
                  <span class="status-lbl">NOW CONSULTING</span>
                  <h2 class="token-val">Token {{ nowConsulting()?.token }}</h2>
                  <span class="sub-val">{{ nowConsulting()?.name }}</span>
                </div>

                <div class="token-card-box user-token" appTooltip="Your scheduled token ticket" tooltipPosition="top" *ngIf="myAppointment()">
                  <span class="status-lbl">YOUR TICKET</span>
                  <h2 class="token-val text-blue">Token {{ myAppointment()?.token }}</h2>
                  <span class="sub-val">{{ myAppointment()?.name }}</span>
                </div>
              </div>

              <!-- Queue progress representation line -->
              <div class="queue-timeline-wrapper" *ngIf="queueTimeline().length > 0">
                <span class="progress-title font-semibold">Queue Progress Timeline:</span>
                <div class="timeline-visual">
                  <div *ngFor="let t of queueTimeline()" class="timeline-point" [class.completed]="t.status === 'Completed'" [class.active]="t.status === 'In Consultation'" [class.waiting]="t.status === 'Waiting'" [class.user]="t.isUser" [appTooltip]="t.tooltip" tooltipPosition="bottom">
                    {{ t.token }}
                  </div>
                </div>
              </div>
            </div>
          </app-base-card>
        </div>

        <!-- Waiting Metrics & Warnings -->
        <div class="sidebar-column">
          <app-base-card [border]="true" elevation="sm">
            <h3 class="section-title" card-header>
              Estimated Wait Details
            </h3>
            <div card-body class="wait-details-content">
              <div class="details-matrix">
                <div class="detail-cell">
                  <span class="lbl">Patients Ahead</span>
                  <span class="val font-semibold">{{ patientsAhead() }} Patients</span>
                </div>
                <div class="detail-cell">
                  <span class="lbl">Estimated Wait</span>
                  <span class="val text-orange font-semibold">{{ estimatedWait() }} Mins</span>
                </div>
              </div>

              <div class="doctor-badge-min">
                <span class="badge-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                </span>
                <div class="badge-meta">
                  <span class="lbl">Consulting Clinician</span>
                  <span class="doc font-semibold">Dr. Devam Patel</span>
                  <span class="spec">Cardiology Unit (OPD 2)</span>
                </div>
              </div>

              <div class="live-status-alert">
                <span class="alert-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                </span>
                <p class="alert-desc">
                  <strong>Status Update:</strong> Token 22 is completed. Doctor is consulting Token 23.
                  Please report to OPD Desk 2 when your estimated wait drops below 5 mins.
                </p>
              </div>

              <button class="alert-check-in-btn" (click)="deskCheckIn()" appTooltip="Alert Desk Coordinator of your arrival">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><polyline points="16 11 18 13 22 9"></polyline></svg>
                Report Arrival to Desk
              </button>
            </div>
          </app-base-card>
        </div>
      </div>
    </div>
  `,
  styles: `
    .patient-queue-container {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-lg);
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .page-title {
      font-size: 22px;
      font-weight: 700;
    }
    .page-sub {
      font-size: 13px;
      color: var(--color-text-secondary);
      margin-top: 1px;
    }
    .back-btn {
      background-color: transparent;
      border: 1px solid var(--color-border);
      color: var(--color-text-primary);
      padding: 10px 18px;
      border-radius: var(--border-radius-md);
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .back-btn:hover {
      background-color: var(--color-bg-surface-hover);
    }

    .queue-layout-grid {
      display: grid;
      grid-template-columns: 7.5fr 4.5fr;
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
    .text-blue { color: var(--color-primary); }

    .token-board-content {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-lg);
    }
    .token-status-cards {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--spacing-md);
    }
    .token-card-box {
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-md);
      padding: var(--spacing-md) var(--spacing-lg);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }
    .token-card-box.current-consulting {
      background-color: var(--color-normal-light);
      border-color: var(--color-normal-border);
    }
    .token-card-box.current-consulting .token-val {
      color: var(--color-normal);
    }
    .token-card-box.user-token {
      background-color: var(--color-primary-glow);
      border-color: var(--color-primary);
    }
    .status-lbl {
      font-size: 10px;
      font-weight: 700;
      color: var(--color-text-secondary);
      letter-spacing: 0.05em;
    }
    .token-val {
      font-size: 32px;
      font-weight: 800;
      line-height: 1;
    }
    .sub-val {
      font-size: 12.5px;
      font-weight: 600;
      color: var(--color-text-secondary);
    }

    /* Queue timeline graphical visualizer */
    .queue-timeline-wrapper {
      border-top: 1px solid var(--color-border);
      padding-top: var(--spacing-md);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }
    .progress-title {
      font-size: 12px;
      color: var(--color-text-secondary);
    }
    .timeline-visual {
      display: flex;
      align-items: center;
      padding: var(--spacing-sm) var(--spacing-lg);
    }
    .timeline-point {
      width: 32px;
      height: 32px;
      border-radius: var(--border-radius-full);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 11px;
      background-color: var(--color-bg-base);
      border: 2px solid var(--color-border);
      color: var(--color-text-secondary);
      position: relative;
    }
    .timeline-point.completed {
      background-color: var(--color-normal-light);
      border-color: var(--color-normal);
      color: var(--color-normal);
    }
    .timeline-point.active {
      background-color: var(--color-normal);
      border-color: var(--color-normal);
      color: #ffffff;
      box-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
    }
    .timeline-point.user {
      background-color: var(--color-primary);
      border-color: var(--color-primary);
      color: #ffffff;
      box-shadow: 0 0 10px rgba(16, 98, 254, 0.4);
    }
    .timeline-point.waiting {
      background-color: var(--color-bg-surface);
      border-color: var(--color-border-hover);
    }
    .timeline-connector {
      flex: 1;
      height: 4px;
      background-color: var(--color-border);
    }
    .timeline-connector.completed {
      background-color: var(--color-normal-border);
    }
    .timeline-connector.active {
      background-color: var(--color-normal);
      background-image: linear-gradient(90deg, var(--color-normal) 50%, var(--color-border) 50%);
    }

    /* Wait metrics details */
    .wait-details-content {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }
    .details-matrix {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--spacing-sm);
      border-bottom: 1px solid var(--color-border);
      padding-bottom: var(--spacing-md);
    }
    .detail-cell {
      display: flex;
      flex-direction: column;
      background-color: var(--color-bg-base);
      padding: var(--spacing-md);
      border-radius: var(--border-radius-md);
      text-align: center;
      border: 1px solid var(--color-border);
    }
    .detail-cell .lbl {
      font-size: 11px;
      color: var(--color-text-secondary);
      font-weight: 500;
    }
    .detail-cell .val {
      font-size: 16px;
      margin-top: 2px;
    }
    .text-orange { color: var(--color-urgent); }

    .doctor-badge-min {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-sm);
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-md);
    }
    .badge-icon { font-size: 28px; }
    .badge-meta { display: flex; flex-direction: column; }
    .badge-meta .lbl { font-size: 9px; color: var(--color-text-secondary); }
    .badge-meta .doc { font-size: 13px; color: var(--color-text-primary); }
    .badge-meta .spec { font-size: 11px; color: var(--color-text-secondary); }

    .live-status-alert {
      display: flex;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) var(--spacing-md);
      background-color: var(--color-info-light);
      border: 1px solid var(--color-info-border);
      color: var(--color-info);
      border-radius: var(--border-radius-md);
    }
    .live-status-alert .alert-icon { font-size: 18px; line-height: 1; }
    .live-status-alert .alert-desc { font-size: 11px; line-height: 1.4; }

    .alert-check-in-btn {
      background-color: transparent;
      border: 1px solid var(--color-primary);
      color: var(--color-primary);
      padding: 10px;
      border-radius: var(--border-radius-sm);
      font-weight: 600;
      cursor: pointer;
      font-size: 12.5px;
      transition: var(--transition-fast);
    }
    .alert-check-in-btn:hover {
      background-color: var(--color-primary-glow);
    }
    .queue-status-banner {
      padding: 10px 14px;
      border-radius: var(--border-radius-md);
      font-size: 13px;
      font-weight: 500;
    }
    .queue-status-banner.error {
      background-color: var(--color-critical-light);
      border: 1px solid var(--color-critical-border);
      color: var(--color-critical);
    }
  `
})
export class PatientQueue implements OnInit {
  protected appointmentService = inject(AppointmentService);
  private authService = inject(AuthService);

  readonly currentUhid = computed(() => this.authService.currentUser()?.uhid ?? '');

  myAppointment = computed(() => {
    const uhid = this.currentUhid();
    if (!uhid) return null;
    const list = this.appointmentService.forPatient(uhid);
    return list.length > 0 ? list[0] : null;
  });

  nowConsulting = computed(() => {
    return this.appointmentService.appointments().find(a => a.status === 'In Consultation') || null;
  });

  patientsAhead = computed(() => {
    const myAppt = this.myAppointment();
    if (!myAppt) return 0;
    const myTokenNum = parseInt(myAppt.token, 10);
    const activeAppts = this.appointmentService
      .appointments()
      .filter(a => a.status === 'Waiting' || a.status === 'Checked-in');
    return activeAppts.filter(a => parseInt(a.token, 10) < myTokenNum).length;
  });

  estimatedWait = computed(() => {
    return this.patientsAhead() * 10;
  });

  queueTimeline = computed(() => {
    const appts = this.appointmentService.appointments();
    const myAppt = this.myAppointment();
    const myToken = myAppt ? parseInt(myAppt.token, 10) : null;

    return appts
      .filter(a => a.status === 'Waiting' || a.status === 'Checked-in' || a.status === 'In Consultation' || a.status === 'Completed')
      .sort((a, b) => parseInt(a.token, 10) - parseInt(b.token, 10))
      .map(a => {
        const tokenNum = parseInt(a.token, 10);
        return {
          token: a.token,
          status: a.status,
          isUser: myToken === tokenNum,
          tooltip: `Token ${a.token} (${a.name}) — ${a.status}`
        };
      });
  });

  constructor(private router: Router) {}

  ngOnInit() {
    void this.appointmentService.loadAppointments();
  }

  goBack() {
    this.router.navigate(['/patient/dashboard.component']);
  }

  deskCheckIn() {
    console.log('Queue check-in feature pending implementation');
  }
}
