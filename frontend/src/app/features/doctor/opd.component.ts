import { Component, OnInit, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { BaseCard } from '../../shared/components/base-card/base-card.component';
import { BaseTable, TableColumn } from '../../shared/components/base-table/base-table.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { AppointmentService } from '../../core/services/appointment.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-doctor-opd',
  standalone: true,
  imports: [CommonModule, BaseCard, BaseTable, TooltipDirective],
  template: `
    <div class="doctor-opd-container animate-fade">
      <!-- Title Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">OPD Consultation Queue</h1>
          <p class="page-sub">Today's active waiting queue. Select a patient to begin consulting.</p>
        </div>
        <div class="queue-stats">
          <div class="stat-pill accent" appTooltip="Next token to be called" tooltipPosition="bottom">
            <span>Next Token:</span> <strong>{{ opdQueue()[0]?.token || '—' }}</strong>
          </div>
          <div class="stat-pill critical" appTooltip="Patients currently waiting in line" tooltipPosition="bottom">
            <span>Total Waiting:</span> <strong>{{ opdQueue().length }}</strong>
          </div>
        </div>
      </div>

      <p role="alert" *ngIf="appointmentService.error()">{{ appointmentService.error() }}</p>
      <!-- Main Queue Table -->
      <app-base-card [border]="true" elevation="sm">
        <h3 class="card-title-header" card-header>
          Active Consultations Queue
          <span class="room-indicator" appTooltip="Your assigned consulting room" tooltipPosition="left">Today’s checked-in appointments</span>
        </h3>
        <div card-body class="p-0">
          <app-base-table
            [columns]="tableColumns"
            [data]="opdQueue()"
            [totalItems]="opdQueue().length"
            [pageSize]="10"
            [currentPage]="1"
            [showSearch]="true"
            searchPlaceholder="Search queue..."
            (rowClick)="onRowClick($event)"
            (actionClick)="onActionClick($event)"
          ></app-base-table>
        </div>
      </app-base-card>
    </div>
  `,
  styles: `
    .doctor-opd-container {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--spacing-xs);
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
    .queue-stats {
      display: flex;
      gap: var(--spacing-sm);
    }
    .stat-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: var(--border-radius-md);
      font-size: 12px;
      border: 1px solid var(--color-border);
    }
    .stat-pill.accent {
      background-color: var(--color-accent-lightest);
      color: var(--color-accent);
      border-color: var(--color-accent);
    }
    .stat-pill.critical {
      background-color: var(--color-critical-light);
      color: var(--color-critical);
      border-color: var(--color-critical-border);
    }
    .card-title-header {
      font-size: 15px;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .room-indicator {
      font-size: 11px;
      font-weight: 600;
      color: var(--color-text-secondary);
      background-color: var(--color-bg-base);
      border: 1px solid var(--color-border);
      padding: 4px 10px;
      border-radius: var(--border-radius-sm);
    }
  `
})
export class DoctorOpd implements OnInit {
  tableColumns: TableColumn[] = [
    { header: 'Token', key: 'token', align: 'center', width: '80px' },
    { header: 'Patient Name', key: 'name', type: 'avatar', width: '220px' },
    { header: 'UHID', key: 'uhid', width: '120px' },
    { header: 'Appt Time', key: 'time', align: 'center', width: '100px' },
    {
      header: 'Consultation Type',
      key: 'type',
      type: 'badge',
      width: '130px',
      badgeMap: {
        'New': { label: 'New Consultation', class: 'pill-info' },
        'Follow-up': { label: 'Follow-up', class: 'pill-secondary' },
        'Emergency': { label: 'Emergency', class: 'pill-critical' }
      }
    },
    {
      header: 'Est. Wait Time',
      key: 'waitTime',
      align: 'center',
      width: '120px'
    },
    {
      header: 'Queue Status',
      key: 'status',
      type: 'badge',
      width: '140px',
      badgeMap: {
        'Waiting': { label: 'Waiting in Lobby', class: 'pill-urgent' },
        'In Consultation': { label: 'In Consultation', class: 'pill-normal' },
        'Checked-in': { label: 'Checked In (Vitals Logged)', class: 'pill-info' },
        'Completed': { label: 'Completed', class: 'pill-secondary' }
      }
    },
    {
      header: 'Actions',
      key: 'actions',
      type: 'actions',
      width: '120px',
      align: 'center',
      actions: [
        {
          label: 'Call Patient',
          action: 'call',
          class: 'btn-primary',
          tooltip: 'Open SOAP note and start consulting',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>'
        }
      ]
    }
  ];

  opdQueue = signal<any[]>([]);

  protected appointmentService = inject(AppointmentService);
  private authService = inject(AuthService);

  constructor(private router: Router) {
    effect(() => {
      const user = this.authService.currentUser();
      const queue = this.appointmentService.todaysQueue(
        user?.role === 'doctor' ? user.name : undefined
      );
      this.opdQueue.set(queue);
    });
  }

  ngOnInit() {
    const user = this.authService.currentUser();
    void this.appointmentService.loadAppointments(
      user?.role === 'doctor' ? { doctorName: user.name } : undefined
    );
  }

  onRowClick(row: any) {
    void this.startConsultation(row);
  }

  onActionClick(event: { action: string, row: any }) {
    if (event.action === 'call') {
      void this.startConsultation(event.row);
    }
  }

  async startConsultation(row: any) {
    try {
      if (row.status !== 'In Consultation') await this.appointmentService.startConsultation(row.appointmentId);
    } catch {
      return;
    }
    this.router.navigate(['/doctor/consultation', row.id], { queryParams: { appointmentId: row.appointmentId } });
  }
}
