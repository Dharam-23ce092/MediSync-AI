import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { BaseCard } from '../../shared/components/base-card/base-card.component';
import { BaseTable, TableColumn } from '../../shared/components/base-table/base-table.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { BillingService } from '../../core/services/billing.service';
import { DashboardService, AdminDashboardMetrics } from '../../core/services/dashboard.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, BaseCard, BaseTable, TooltipDirective],
  template: `
    <div class="admin-dashboard-container animate-fade">
      <!-- Title Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Hospital Command Center</h1>
          <p class="page-sub">Real-time clinical, operational and financial dashboard indicators.</p>
        </div>
        <div class="header-actions">
          <button class="outline-action-btn" (click)="goToBeds()" appTooltip="Open Bed Allocation Matrix" tooltipPosition="bottom">
            🛏️ View Live Bed Map
          </button>
        </div>
      </div>

      <!-- Status banners -->
      <div class="admin-banner loading" *ngIf="dashboardService.loading()">
        Loading dashboard metrics...
      </div>
      <div class="admin-banner error" *ngIf="dashboardService.error() && !dashboardService.loading()">
        {{ dashboardService.error() }}
      </div>

      <!-- Command Center KPI Grid -->
      <div class="kpi-grid">
        <app-base-card [border]="true" elevation="sm">
          <div class="kpi-content" card-body appTooltip="Total patients registered today" tooltipPosition="top">
            <span class="kpi-icon">👥</span>
            <div class="kpi-info">
              <span class="kpi-label">Patients Today</span>
              <h2 class="kpi-value">{{ adminMetrics()?.patientsToday ?? 0 }}</h2>
              <span class="kpi-subtext">OPD + IPD + ER</span>
            </div>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="kpi-content" card-body appTooltip="ICU active bed occupancy" tooltipPosition="top">
            <span class="kpi-icon">🏥</span>
            <div class="kpi-info">
              <span class="kpi-label">ICU Occupancy</span>
              <h2 class="kpi-value" [class.warning-color]="adminMetrics() && adminMetrics()!.icuOccupancyPercent >= 80">{{ adminMetrics()?.icuOccupancyPercent ?? 0 }}%</h2>
              <span class="kpi-subtext">{{ adminMetrics()?.occupiedBeds ?? 0 }} / {{ adminMetrics()?.totalBeds ?? 0 }} Beds Occupied</span>
            </div>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="kpi-content" card-body appTooltip="Available general & private ward beds" tooltipPosition="top">
            <span class="kpi-icon">🛏️</span>
            <div class="kpi-info">
              <span class="kpi-label">Beds Available</span>
              <h2 class="kpi-value">{{ adminMetrics()?.availableBeds ?? 0 }}</h2>
              <span class="kpi-subtext">of {{ adminMetrics()?.totalBeds ?? 0 }} total</span>
            </div>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="kpi-content" card-body appTooltip="Total outstanding receivables" tooltipPosition="top">
            <span class="kpi-icon">💰</span>
            <div class="kpi-info">
              <span class="kpi-label">Pending Billing</span>
              <h2 class="kpi-value">₹{{ billingOutstanding() }}</h2>
              <span class="kpi-subtext">{{ billingService.pendingCount() }} pending invoices</span>
            </div>
          </div>
        </app-base-card>
      </div>

      <!-- Live Columns Layout -->
      <div class="dashboard-columns-grid">
        <!-- Main: Billing Queue -->
        <div class="main-column">
          <app-base-card [border]="true" elevation="sm">
            <h3 class="section-title" card-header>
              Billing & Invoices
              <span class="subtitle">All patient invoices — paid, pending and partial</span>
            </h3>
            <div card-body class="p-0">
              <app-base-table
                [columns]="billingColumns"
                [data]="billingService.invoices()"
                [totalItems]="billingService.invoices().length"
                [pageSize]="10"
                [currentPage]="1"
                [showSearch]="false"
                [showPagination]="false"
                (actionClick)="onBillingAction($event)"
              ></app-base-table>
            </div>
          </app-base-card>
        </div>

        <!-- Sidebar: Alerts Center & Analytics -->
        <div class="sidebar-column flex flex-col gap-md">
          <app-base-card [border]="true" elevation="sm" statusBorder="critical">
            <h3 class="section-title critical-header" card-header>
              🔴 Operational Warnings
            </h3>
            <div card-body class="warnings-list">
              <div class="warning-alert-box" appTooltip="Bed shortage warning" tooltipPosition="left">
                <div class="warning-title">NICU Bed Shortage</div>
                <div class="warning-text">NICU occupancy reaches 100%. Contact referral branches.</div>
              </div>

              <div class="warning-alert-box" appTooltip="Low stock alert" tooltipPosition="left">
                <div class="warning-title">Pharmacy Stock Low</div>
                <div class="warning-text">Amlodipine 5mg stock levels below threshold (5 days remaining).</div>
              </div>
            </div>
          </app-base-card>

          <!-- AI forecasting block -->
          <app-base-card [border]="true" elevation="sm">
            <h3 class="section-title ai-forecast-header" card-header>
              ⭐ AI Operational Forecasts
            </h3>
            <div card-body class="forecast-content">
              <div class="forecast-item">
                <span class="forecast-lbl">Expected Admissions Tomorrow:</span>
                <span class="forecast-val font-semibold">18 - 24 patients</span>
              </div>
              <div class="forecast-item border-top">
                <span class="forecast-lbl">Expected Bed Discharges:</span>
                <span class="forecast-val font-semibold">14 patients</span>
              </div>
            </div>
          </app-base-card>
        </div>
      </div>

    </div>
  `,
  styles: `
    .admin-dashboard-container {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-lg);
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
    .outline-action-btn {
      background-color: transparent;
      border: 1px solid var(--color-primary);
      color: var(--color-primary);
      padding: 10px 18px;
      border-radius: var(--border-radius-md);
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .outline-action-btn:hover {
      background-color: var(--color-primary-glow);
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--spacing-md);
    }
    .kpi-content {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
    }
    .kpi-icon {
      font-size: 28px;
      width: 48px;
      height: 48px;
      border-radius: var(--border-radius-md);
      background-color: var(--color-bg-base);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .kpi-info {
      display: flex;
      flex-direction: column;
    }
    .kpi-label {
      font-size: 12px;
      color: var(--color-text-secondary);
      font-weight: 500;
    }
    .kpi-value {
      font-size: 22px;
      font-weight: 700;
      color: var(--color-text-primary);
      line-height: 1.1;
      margin: 2px 0;
    }
    .warning-color { color: var(--color-urgent); }
    .success-color { color: var(--color-normal); }
    .kpi-subtext {
      font-size: 11px;
      color: var(--color-text-muted);
    }

    .dashboard-columns-grid {
      display: grid;
      grid-template-columns: 8.5fr 3.5fr;
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
    .ai-forecast-header { color: var(--color-accent); }

    .warnings-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }
    .warning-alert-box {
      padding: var(--spacing-sm) var(--spacing-md);
      background-color: var(--color-critical-light);
      border: 1px solid var(--color-critical-border);
      border-radius: var(--border-radius-sm);
      cursor: help;
    }
    .warning-title {
      font-weight: 600;
      font-size: 12px;
      color: var(--color-critical);
    }
    .warning-text {
      font-size: 11px;
      color: var(--color-text-secondary);
      line-height: 1.4;
      margin-top: 1px;
    }

    .forecast-content {
      background-color: var(--color-accent-lightest);
      border: 1.5px dashed var(--color-accent);
      border-radius: var(--border-radius-md);
      padding: var(--spacing-md);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }
    .forecast-item {
      display: flex;
      justify-content: space-between;
      font-size: 12.5px;
      color: var(--color-text-secondary);
    }
    .forecast-item.border-top {
      border-top: 1px solid var(--color-border);
      padding-top: var(--spacing-sm);
    }

    .admin-banner {
      padding: 10px 14px;
      border-radius: var(--border-radius-md);
      font-size: 13px;
      font-weight: 500;
    }
    .admin-banner.loading {
      background-color: var(--color-info-light);
      border: 1px solid var(--color-info-border);
      color: var(--color-info);
    }
    .admin-banner.error {
      background-color: var(--color-critical-light);
      border: 1px solid var(--color-critical-border);
      color: var(--color-critical);
    }
  `
})
export class AdminDashboard implements OnInit {
  billingColumns: TableColumn[] = [
    { header: 'Invoice #', key: 'invoiceNumber', width: '140px' },
    { header: 'Patient', key: 'name', type: 'avatar', width: '180px' },
    { header: 'UHID', key: 'uhid', width: '130px' },
    { header: 'Date', key: 'date', width: '110px' },
    { header: 'Total', key: 'total', type: 'currency', width: '100px' },
    { header: 'Paid', key: 'paid', type: 'currency', width: '100px' },
    { header: 'Balance', key: 'balance', type: 'currency', width: '100px' },
    {
      header: 'Status',
      key: 'status',
      type: 'badge',
      width: '110px',
      badgeMap: {
        'PENDING': { label: 'Pending', class: 'pill-urgent' },
        'PAID': { label: 'Paid', class: 'pill-normal' },
        'PARTIAL': { label: 'Partial', class: 'pill-info' }
      }
    }
  ];

  protected billingService = inject(BillingService);
  protected dashboardService = inject(DashboardService);

  billingOutstanding = computed(() => this.billingService.totalOutstanding());
  adminMetrics = computed(() => this.dashboardService.adminMetricsData());

  constructor(private router: Router) {}

  ngOnInit() {
    void this.dashboardService.loadForRole('admin');
    void this.billingService.loadInvoices();
  }

  onBillingAction(event: { action: string, row: any }) {
    if (event.action === 'view') {
      console.log('Invoice detail view:', event.row);
    }
  }

  goToBeds() {
    this.router.navigate(['/admin/beds.component']);
  }
}
