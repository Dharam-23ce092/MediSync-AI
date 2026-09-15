import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseCard } from '../../shared/components/base-card/base-card.component';
import { VitalsService, PatientVital } from '../../core/services/vitals.service';

@Component({
  selector: 'app-nurse-alerts',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseCard],
  template: `
    <div class="alerts-page-container animate-fade">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Physiological Telemetry & Critical Vital Alarms</h1>
          <p class="page-sub">Real-time surveillance of bedside hemodynamic monitors — SpO2 hypoxemia, cardiac tachy/bradycardia, and septic temperature thresholds.</p>
        </div>
        <div class="header-status">
          <span class="alarm-status-badge" [class.alerting]="criticalCount() > 0">
            <span class="pulse-dot"></span>
            {{ criticalCount() > 0 ? criticalCount() + ' Active Critical Alarms' : 'All Bedside Monitors Stable' }}
          </span>
        </div>
      </div>

      <!-- Quick Metrics -->
      <div class="metrics-grid">
        <app-base-card [border]="true" elevation="sm" statusBorder="critical">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Critical Telemetry Alarms</span>
            <h3 class="metric-val text-red">{{ criticalCount() }}</h3>
            <span class="metric-sub text-red">Require bedside triage</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm" statusBorder="semi-urgent">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Warning / Trending Alerts</span>
            <h3 class="metric-val text-orange">{{ warningCount() }}</h3>
            <span class="metric-sub text-orange">Approaching critical range</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Active Bedside Streams</span>
            <h3 class="metric-val text-blue">{{ totalMonitored() }}</h3>
            <span class="metric-sub text-muted">Telemetry units connected</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Stable Patients</span>
            <h3 class="metric-val text-green">{{ stableCount() }}</h3>
            <span class="metric-sub text-green">Vitals within safe margins</span>
          </div>
        </app-base-card>
      </div>

      <!-- Filter Controls -->
      <div class="filters-row">
        <div class="filter-tabs">
          <button class="filter-btn" [class.active]="filter() === 'all'" (click)="filter.set('all')">
            All Alerts ({{ alertList().length }})
          </button>
          <button class="filter-btn" [class.active]="filter() === 'critical'" (click)="filter.set('critical')">
            Critical Alarms ({{ criticalCount() }})
          </button>
          <button class="filter-btn" [class.active]="filter() === 'warning'" (click)="filter.set('warning')">
            Warnings ({{ warningCount() }})
          </button>
          <button class="filter-btn" [class.active]="filter() === 'allPatients'" (click)="filter.set('allPatients')">
            All Monitored Beds ({{ totalMonitored() }})
          </button>
        </div>
      </div>

      <div class="status-banner success" *ngIf="ackMessage()">{{ ackMessage() }}</div>

      <!-- Alarms List Grid -->
      <div class="alerts-grid">
        <div *ngIf="displayList().length === 0" class="no-alerts-card">
          <div class="no-alerts-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          </div>
          <h3>All Monitored Beds Stable</h3>
          <p>No active critical threshold excursions detected on telemetry streams.</p>
        </div>

        <div *ngFor="let item of displayList()" class="alarm-card" [ngClass]="item.status">
          <div class="card-top">
            <div class="bed-info">
              <span class="bed-tag">{{ item.bed }}</span>
              <span class="pat-name">{{ item.name }}</span>
              <span class="uhid-badge">{{ item.uhid }}</span>
            </div>
            <div class="status-indicator-group">
              <span class="status-pill" [ngClass]="item.status">
                <span class="status-dot"></span>
                {{ item.status | uppercase }}
              </span>
            </div>
          </div>

          <!-- Parameter Readouts -->
          <div class="vitals-readout-grid">
            <div class="param-box" [class.alarm]="item.hr > 110 || item.hr < 50">
              <span class="param-lbl">Heart Rate</span>
              <span class="param-val">{{ item.hr }} <small>bpm</small></span>
              <span class="param-thresh">Norm: 60-100</span>
            </div>
            <div class="param-box" [class.alarm]="item.spo2 < 92">
              <span class="param-lbl">SpO2 (Oxygen)</span>
              <span class="param-val">{{ item.spo2 }}<small>%</small></span>
              <span class="param-thresh">Norm: ≥95%</span>
            </div>
            <div class="param-box" [class.alarm]="item.bp && (item.bp.startsWith('14') || item.bp.startsWith('15') || item.bp.startsWith('16'))">
              <span class="param-lbl">Blood Pressure</span>
              <span class="param-val">{{ item.bp }} <small>mmHg</small></span>
              <span class="param-thresh">Norm: 120/80</span>
            </div>
            <div class="param-box" [class.alarm]="item.temp > 101">
              <span class="param-lbl">Temperature</span>
              <span class="param-val">{{ item.temp }}<small>°F</small></span>
              <span class="param-thresh">Norm: 98.6°F</span>
            </div>
          </div>

          <!-- Diagnostic notes & action -->
          <div class="card-footer">
            <div class="notes-text" *ngIf="item.notes">
              <span class="note-icon">📋</span>
              <span><strong>Clinical Care Observation:</strong> {{ item.notes }}</span>
            </div>
            <div class="actions-line">
              <button class="ack-btn" (click)="acknowledge(item)">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Acknowledge Alert
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: `
    .alerts-page-container {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-lg);
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
    }
    .page-title {
      font-size: 22px;
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0;
    }
    .page-sub {
      font-size: 13px;
      color: var(--color-text-secondary);
      margin-top: 3px;
      max-width: 750px;
    }
    .alarm-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px;
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-full);
      font-size: 12px;
      color: var(--color-text-secondary);
      font-weight: 600;
      box-shadow: var(--shadow-sm);
    }
    .alarm-status-badge.alerting {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.45);
      color: #f87171;
      font-weight: 700;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
    }
    .alarm-status-badge.alerting .pulse-dot {
      background: #ef4444;
      box-shadow: 0 0 10px #ef4444;
      animation: pulse 1s infinite alternate;
    }
    @keyframes pulse {
      from { opacity: 0.4; transform: scale(0.9); }
      to { opacity: 1; transform: scale(1.15); }
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--spacing-md);
    }
    .metric-body {
      display: flex;
      flex-direction: column;
    }
    .metric-lbl {
      font-size: 12px;
      color: var(--color-text-secondary);
      font-weight: 500;
    }
    .metric-val {
      font-size: 26px;
      font-weight: 800;
      color: var(--color-text-primary);
      margin: 2px 0;
      line-height: 1.1;
    }
    .metric-sub {
      font-size: 11px;
      font-weight: 500;
    }
    .text-red { color: #f87171 !important; }
    .text-orange { color: #fbbf24 !important; }
    .text-blue { color: #60a5fa !important; }
    .text-green { color: #34d399 !important; }

    .filters-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .filter-tabs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .filter-btn {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      padding: 6px 16px;
      border-radius: var(--border-radius-full);
      font-size: 12.5px;
      color: var(--color-text-secondary);
      cursor: pointer;
      font-weight: 500;
      transition: all 0.15s ease;
    }
    .filter-btn:hover {
      background: var(--color-bg-surface-hover);
      color: var(--color-text-primary);
    }
    .filter-btn.active {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: #ffffff;
      font-weight: 600;
    }

    .alerts-grid {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }
    .no-alerts-card {
      padding: 50px 20px;
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-md);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .no-alerts-icon {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: rgba(16, 185, 129, 0.12);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 6px;
    }
    .no-alerts-card h3 {
      font-size: 16px;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0;
    }
    .no-alerts-card p {
      font-size: 13px;
      color: var(--color-text-secondary);
      margin: 0;
    }

    /* Alarm Cards — Theme Consistent Glassmorphism */
    .alarm-card {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-md);
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      transition: all 0.2s ease;
    }
    .alarm-card:hover {
      box-shadow: var(--shadow-md);
    }
    .alarm-card.critical {
      border: 1px solid rgba(239, 68, 68, 0.4);
      border-left: 5px solid #ef4444;
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, var(--color-bg-surface) 65%);
      box-shadow: 0 4px 20px -2px rgba(239, 68, 68, 0.15);
    }
    .alarm-card.warning {
      border: 1px solid rgba(245, 158, 11, 0.4);
      border-left: 5px solid #f59e0b;
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, var(--color-bg-surface) 65%);
      box-shadow: 0 4px 20px -2px rgba(245, 158, 11, 0.15);
    }

    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .bed-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .bed-tag {
      background: var(--color-bg-base);
      border: 1px solid var(--color-border);
      padding: 3px 10px;
      border-radius: var(--border-radius-sm);
      font-size: 12px;
      font-weight: 700;
      color: var(--color-text-primary);
      letter-spacing: 0.02em;
    }
    .pat-name {
      font-size: 15px;
      font-weight: 700;
      color: var(--color-text-primary);
    }
    .uhid-badge {
      font-size: 12px;
      color: var(--color-text-secondary);
      background: var(--color-bg-base);
      border: 1px solid var(--color-border);
      padding: 2px 8px;
      border-radius: var(--border-radius-sm);
    }

    .status-indicator-group {
      display: flex;
      align-items: center;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: var(--border-radius-full);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
    }
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }
    .status-pill.critical {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.45);
    }
    .status-pill.warning {
      background: rgba(245, 158, 11, 0.2);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.45);
    }
    .status-pill.normal {
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.45);
    }

    /* Vitals Readout Grid */
    .vitals-readout-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--spacing-sm);
    }
    .param-box {
      background: var(--color-bg-base);
      border: 1px solid var(--color-border);
      padding: 10px 14px;
      border-radius: var(--border-radius-sm);
      display: flex;
      flex-direction: column;
      transition: all 0.2s ease;
    }
    .param-box.alarm {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.45);
    }
    .param-box.alarm .param-val {
      color: #f87171;
    }
    .param-box.alarm .param-thresh {
      color: #fca5a5;
    }
    .param-lbl {
      font-size: 11px;
      color: var(--color-text-secondary);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .param-val {
      font-size: 20px;
      font-weight: 800;
      color: var(--color-text-primary);
      margin: 2px 0;
      line-height: 1.2;
    }
    .param-val small {
      font-size: 11px;
      font-weight: 500;
      color: var(--color-text-muted);
    }
    .param-thresh {
      font-size: 10.5px;
      color: var(--color-text-muted);
    }

    /* Card Footer */
    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid var(--color-border);
      padding-top: 10px;
      gap: var(--spacing-md);
    }
    .notes-text {
      font-size: 12.5px;
      color: var(--color-text-secondary);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .note-icon {
      font-size: 13px;
    }
    .ack-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--color-bg-base);
      border: 1px solid var(--color-border);
      padding: 6px 16px;
      border-radius: var(--border-radius-sm);
      font-size: 12.5px;
      font-weight: 600;
      color: var(--color-text-primary);
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
    }
    .ack-btn:hover {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: #ffffff;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(14, 165, 233, 0.35);
    }

    .status-banner {
      padding: 10px 14px;
      border-radius: var(--border-radius-md);
      font-size: 13px;
      font-weight: 500;
    }
    .status-banner.success {
      background: var(--color-normal-light);
      border: 1px solid var(--color-normal-border);
      color: var(--color-normal);
    }
  `
})
export class NurseAlerts implements OnInit {
  protected vitalsService = inject(VitalsService);

  filter = signal<'all' | 'critical' | 'warning' | 'allPatients'>('all');
  ackMessage = signal<string | null>(null);

  totalMonitored = computed(() => this.vitalsService.vitals().length);
  criticalCount = computed(() => this.vitalsService.vitals().filter(v => v.status === 'critical').length);
  warningCount = computed(() => this.vitalsService.vitals().filter(v => v.status === 'warning').length);
  stableCount = computed(() => this.vitalsService.vitals().filter(v => v.status === 'normal').length);

  alertList = computed(() =>
    this.vitalsService.vitals().filter(v => v.status === 'critical' || v.status === 'warning')
  );

  displayList = computed(() => {
    const f = this.filter();
    const vitals = this.vitalsService.vitals();
    if (f === 'critical') return vitals.filter(v => v.status === 'critical');
    if (f === 'warning') return vitals.filter(v => v.status === 'warning');
    if (f === 'allPatients') return vitals;
    return this.alertList();
  });

  ngOnInit() {
    void this.vitalsService.loadVitals(true);
  }

  acknowledge(vital: PatientVital) {
    this.ackMessage.set(`Alert acknowledged for ${vital.name} (${vital.bed}). Attending notification logged.`);
    setTimeout(() => this.ackMessage.set(null), 4000);
  }
}
