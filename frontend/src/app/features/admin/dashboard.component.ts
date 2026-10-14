import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { BaseCard } from '../../shared/components/base-card/base-card.component';
import { BaseTable, TableColumn } from '../../shared/components/base-table/base-table.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { BillingService } from '../../core/services/billing.service';
import { DashboardService, AdminDashboardMetrics } from '../../core/services/dashboard.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink, CommonModule, BaseCard, BaseTable, TooltipDirective],
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
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"></path><path d="M2 8h18a2 2 0 0 1 2 2v10"></path><path d="M2 17h20"></path><path d="M6 8v9"></path></svg>
            View Live Bed Map
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
            <div class="kpi-icon-wrap text-teal">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            </div>
            <div class="kpi-info">
              <span class="kpi-label">Patients Today</span>
              <h2 class="kpi-value">{{ adminMetrics()?.patientsToday ?? 0 }}</h2>
              <span class="kpi-subtext">New patient registrations</span>
            </div>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="kpi-content" card-body appTooltip="ICU active bed occupancy" tooltipPosition="top">
            <div class="kpi-icon-wrap text-rose">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
            </div>
            <div class="kpi-info">
              <span class="kpi-label">ICU Occupancy</span>
              <h2 class="kpi-value" [class.warning-color]="adminMetrics() && adminMetrics()!.icuOccupancyPercent >= 80">{{ adminMetrics()?.icuOccupancyPercent ?? 0 }}%</h2>
              <span class="kpi-subtext">{{ adminMetrics()?.occupiedBeds ?? 0 }} / {{ adminMetrics()?.totalBeds ?? 0 }} Beds Occupied across all wards</span>
            </div>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="kpi-content" card-body appTooltip="Available general & private ward beds" tooltipPosition="top">
            <div class="kpi-icon-wrap text-blue">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"></path><path d="M2 8h18a2 2 0 0 1 2 2v10"></path><path d="M2 17h20"></path><path d="M6 8v9"></path></svg>
            </div>
            <div class="kpi-info">
              <span class="kpi-label">Beds Available</span>
              <h2 class="kpi-value">{{ adminMetrics()?.availableBeds ?? 0 }}</h2>
              <span class="kpi-subtext">of {{ adminMetrics()?.totalBeds ?? 0 }} total</span>
            </div>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="kpi-content" card-body appTooltip="Total outstanding receivables" tooltipPosition="top">
            <div class="kpi-icon-wrap text-emerald">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
            </div>
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

        <div class="sidebar-column flex flex-col gap-md">
          <app-base-card [border]="true" elevation="sm">
            <h3 card-header>Hospital operations</h3>
            <div card-body class="forecast-content">
              <a routerLink="/admin/appointments">Review appointment requests →</a>
              <a routerLink="/admin/beds.component">{{ adminMetrics()?.occupiedBeds ?? 0 }} occupied / {{ adminMetrics()?.totalBeds ?? 0 }} beds →</a>
              <a routerLink="/admin/billing">Review outstanding invoices →</a>
              <p *ngIf="adminMetrics()?.availableBeds === 0">No beds currently available. Review cleaning and discharge status.</p>
              <p>Occupancy comes from current bed assignments. Select a bed to open its patient and admission case.</p>
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
    .ai-forecast-header { color: var(--color-accent); }

    .warnings-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }
    .warning-alert-box {
      padding: var(--spacing-sm) var(--spacing-md);
      background-color: var(--color-bg-base);
      border: 1px solid var(--color-border);
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
      background-color: var(--color-bg-base);
      border: 1px solid var(--color-border);
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
      this.router.navigate(['/admin/billing']);
    }
  }

  goToBeds() {
    this.router.navigate(['/admin/beds.component']);
  }
}
