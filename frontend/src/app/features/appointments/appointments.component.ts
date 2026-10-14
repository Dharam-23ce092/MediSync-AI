import { Component, inject, signal, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AppointmentService, Appointment } from '../../core/services/appointment.service';
import { AuthService } from '../../core/services/auth.service';
@Component({
  selector: 'app-appointments',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: ` <section class="workflow-page">
    <header>
      <div>
        <p class="eyebrow">PATIENT ACCESS</p>
        <h1>{{ patient() ? 'My appointments' : 'Appointment management' }}</h1>
        <p>Request → Approval → Check-in → Consultation → Completed</p>
      </div>
      <button (click)="refresh()" [disabled]="service.loading()">Refresh</button>
    </header>
    <div class="workflow-stats">
      <article>
        <strong>{{ count('Requested') }}</strong
        >Awaiting approval
      </article>
      <article>
        <strong>{{ count('Confirmed') }}</strong
        >Confirmed
      </article>
      <article>
        <strong>{{ count('Checked-in') }}</strong
        >Checked in
      </article>
      <article>
        <strong>{{ count('Completed') }}</strong
        >Completed
      </article>
    </div>
    <div class="workflow-toolbar">
      <label>Search<input [(ngModel)]="search" placeholder="Patient, UHID or case number" /></label
      ><label
        >Status<select [(ngModel)]="status">
          <option value="">All statuses</option>
          <option *ngFor="let s of statuses">{{ s }}</option>
        </select></label
      ><a *ngIf="patient()" routerLink="/patient/book.component">Request appointment →</a>
    </div>
    <p *ngIf="service.error()" role="alert" class="error">{{ service.error() }}</p>
    <p *ngIf="message()" role="status">{{ message() }}</p>
    <p *ngIf="service.loading()">Loading appointments…</p>
    <div class="workflow-table record-scroll" role="region" aria-label="Appointments" tabindex="0">
      <table>
        <thead>
          <tr>
            <th>Patient / UHID</th>
            <th>Appointment / Case</th>
            <th>Provider</th>
            <th>Scheduled time</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let a of filtered()">
            <td>
              <strong>{{ a.name }}</strong
              ><small>{{ a.uhid }}</small>
            </td>
            <td>
              <span>Token {{ a.token }}</span
              ><a *ngIf="a.caseId" [routerLink]="['/cases', a.caseId]">{{ a.caseNumber }}</a
              ><small>{{ a.appointmentId }}</small>
            </td>
            <td>{{ a.doctorName }}</td>
            <td>{{ a.appointmentTime | date: 'medium' }}</td>
            <td>
              <span class="workflow-status">{{ a.status }}</span>
            </td>
            <td class="actions">
              <ng-container *ngIf="!patient()"
                ><button
                  *ngIf="a.status === 'Requested'"
                  [disabled]="busy()"
                  (click)="change(a, 'Confirmed')"
                >
                  Accept</button
                ><button
                  *ngIf="a.status === 'Requested'"
                  [disabled]="busy()"
                  (click)="change(a, 'Rejected')"
                >
                  Decline</button
                ><button
                  *ngIf="a.status === 'Confirmed' && today(a)"
                  [disabled]="busy()"
                  (click)="change(a, 'Checked-in')"
                >
                  Check in</button
                ><button
                  *ngIf="
                    provider() &&
                    today(a) &&
                    ['Waiting', 'Checked-in', 'In Consultation'].includes(a.status)
                  "
                  [disabled]="busy()"
                  (click)="consult(a)"
                >
                  Consult
                </button></ng-container
              >
              <button
                *ngIf="['Requested', 'Confirmed', 'Waiting', 'Checked-in'].includes(a.status)"
                [disabled]="busy()"
                (click)="change(a, 'Cancelled')"
              >
                Cancel
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p *ngIf="!service.loading() && !filtered().length">No appointments match this view.</p>
  </section>`,
  styles: `
    :host {
      display: block;
    }
    .workflow-page {
      display: grid;
      gap: 24px;
    }
    header,
    .workflow-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    header p {
      color: var(--color-text-secondary);
    }
    .eyebrow {
      font-size: 11px;
      letter-spacing: 0.12em;
    }
    .workflow-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
    }
    article {
      padding: 20px;
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: 16px;
    }
    article strong {
      display: block;
      font-size: 28px;
    }
    label {
      display: grid;
      gap: 6px;
    }
    input,
    select,
    button {
      padding: 10px 14px;
      border: 1px solid var(--color-border);
      border-radius: 8px;
      background: var(--color-bg-surface);
      color: var(--color-text-primary);
    }
    button {
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.5;
    }
    .workflow-table {
      height: var(--record-viewport-height);
      min-height: 0;
      overflow: auto;
      border: 1px solid var(--color-border);
      border-radius: 12px;
    }
    table {
      min-width: 760px;
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      background: var(--color-bg-surface);
    }
    th,
    td {
      text-align: left;
      padding: 16px;
      border-bottom: 1px solid var(--color-border);
    }
    th {
      position: sticky;
      top: 0;
      z-index: 2;
      background: var(--color-bg-surface);
      font-size: 12px;
      color: var(--color-text-secondary);
    }
    td a,
    small {
      display: block;
    }
    small {
      font-size: 11px;
      color: var(--color-text-secondary);
      max-width: 180px;
      overflow-wrap: anywhere;
    }
    .actions button {
      margin: 3px;
    }
    .workflow-status {
      white-space: nowrap;
      color: var(--color-info);
    }
    .error {
      color: var(--color-critical);
    }
    @media (max-width: 700px) {
      .workflow-stats {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `,
})
export class AppointmentsComponent implements OnDestroy {
  readonly service = inject(AppointmentService);
  readonly auth = inject(AuthService);
  private router = inject(Router);
  readonly patient = computed(() => this.auth.currentRole() === 'patient');
  readonly provider = computed(() => ['doctor', 'admin'].includes(this.auth.currentRole() || ''));
  search = signal('');
  status = signal('');
  busy = signal(false);
  message = signal('');
  statuses = [
    'Requested',
    'Confirmed',
    'Checked-in',
    'Waiting',
    'In Consultation',
    'Completed',
    'Rejected',
    'Cancelled',
  ];
  filtered = computed(() =>
    this.service
      .appointments()
      .filter(
        (a) =>
          (!this.status() || a.status === this.status()) &&
          `${a.name} ${a.uhid} ${a.caseNumber} ${a.doctorName}`
            .toLowerCase()
            .includes(this.search().toLowerCase()),
      ),
  );
  private timer = window.setInterval(() => this.refresh(), 30000);
  constructor() {
    this.refresh();
  }
  ngOnDestroy() {
    window.clearInterval(this.timer);
  }
  refresh() {
    void this.service.loadAppointments();
  }
  count(status: string) {
    return this.service.appointments().filter((a) => a.status === status).length;
  }
  today(a: Appointment) {
    return new Date(a.appointmentTime).toDateString() === new Date().toDateString();
  }
  async change(a: Appointment, status: Appointment['status']) {
    this.busy.set(true);
    this.message.set('');
    try {
      await this.service.updateStatus(a.appointmentId, status);
      this.message.set(`Appointment ${status.toLowerCase()}.`);
    } catch {
    } finally {
      this.busy.set(false);
    }
  }
  async consult(a: Appointment) {
    this.busy.set(true);
    try {
      if (a.status !== 'In Consultation') await this.service.startConsultation(a.appointmentId);
      await this.router.navigate(['/doctor/consultation', a.id], {
        queryParams: { appointmentId: a.appointmentId },
      });
    } catch {
    } finally {
      this.busy.set(false);
    }
  }
}
