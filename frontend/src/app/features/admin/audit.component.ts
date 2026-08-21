import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseCard } from '../../shared/components/base-card/base-card.component';
import { BaseTable, TableColumn } from '../../shared/components/base-table/base-table.component';
import { BaseFilter, FilterControlConfig } from '../../shared/components/base-filter/base-filter.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { FormsModule } from '@angular/forms';
import { AuditService, AuditLog } from '../../core/services/audit.service';

@Component({
  selector: 'app-admin-audit',
  standalone: true,
  imports: [CommonModule, BaseCard, BaseTable, BaseFilter, TooltipDirective, FormsModule],
  template: `
    <div class="admin-audit-container animate-fade">
      <!-- Welcome Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">HIPAA Audit & Access Security Logs</h1>
          <p class="page-sub">Trace system-wide user actions, clinical record disclosures, and transaction logs in real time.</p>
        </div>
        <div class="header-actions">
          <button class="export-btn" (click)="exportLogs()" disabled appTooltip="Export feature not yet implemented" tooltipPosition="bottom">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-icon"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Export Signed Ledger
          </button>
        </div>
      </div>

      <!-- Quick Summary Stats -->
      <div class="stats-grid">
        <app-base-card [border]="true" elevation="sm">
          <div class="stat-content" card-body>
            <div class="stat-title">Total Logs (24h)</div>
            <div class="stat-value">{{ auditService.totalLogs() }}</div>
            <div class="stat-desc" [class.text-green]="auditService.totalLogs() > 0" [class.text-muted]="auditService.totalLogs() === 0">
              {{ auditService.totalLogs() > 0 ? '✓ Operations verified' : 'No records' }}
            </div>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="stat-content" card-body>
            <div class="stat-title">PHI Record Disclosures</div>
            <div class="stat-value">{{ auditService.phiDisclosures() }}</div>
            <div class="stat-desc text-muted">EHR view/edit trails</div>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm" statusBorder="semi-urgent">
          <div class="stat-content" card-body>
            <div class="stat-title">Security Warnings</div>
            <div class="stat-value" [class.text-orange]="auditService.securityWarnings() > 0">{{ auditService.securityWarnings() }}</div>
            <div class="stat-desc" [class.text-orange]="auditService.securityWarnings() > 0" [class.text-muted]="auditService.securityWarnings() === 0">
              {{ auditService.securityWarnings() > 0 ? 'Requires review' : 'No warnings' }}
            </div>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm" statusBorder="critical">
          <div class="stat-content" card-body>
            <div class="stat-title">Access Violations</div>
            <div class="stat-value" [class.text-red]="auditService.accessViolations() > 0">{{ auditService.accessViolations() }}</div>
            <div class="stat-desc" [class.text-green]="auditService.accessViolations() === 0" [class.text-muted]="auditService.accessViolations() > 0">
              {{ auditService.accessViolations() === 0 ? '✓ No unauthorized blockades' : 'Requires immediate action' }}
            </div>
          </div>
        </app-base-card>
      </div>

      <!-- Filters & Ledger Grid -->
      <div class="ledger-wrapper">
        <app-base-card [border]="true" elevation="sm">
          <h3 class="section-title" card-header>
            System Activity Log Directory
            <span class="subtitle">Search, filter and verify cryptographic logging tracks</span>
          </h3>
          <div card-body class="p-0">
            <!-- Filter Component -->
            <div class="filter-wrapper-padding">
              <app-base-filter
                [config]="filterConfig"
                (filterChange)="onFilterChange($event)"
              ></app-base-filter>
            </div>

            <!-- Table Component -->
            <app-base-table
              [columns]="auditColumns"
              [data]="filteredLogs()"
              [totalItems]="filteredLogs().length"
              [pageSize]="10"
              [currentPage]="1"
              [showSearch]="true"
              [showPagination]="true"
              (actionClick)="onLogAction($event)"
            ></app-base-table>
          </div>
        </app-base-card>
      </div>
    </div>
  `,
  styles: `
    .admin-audit-container {
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
    .export-btn {
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
    .export-btn:hover:not([disabled]) {
      background-color: var(--color-primary-glow);
    }
    .export-btn[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--spacing-md);
    }
    .stat-content {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }
    .stat-title {
      font-size: 12px;
      color: var(--color-text-secondary);
      font-weight: 500;
    }
    .stat-value {
      font-size: 24px;
      font-weight: 700;
      line-height: 1;
      color: var(--color-text-primary);
    }
    .stat-desc {
      font-size: 11px;
    }
    .text-green { color: var(--color-normal); }
    .text-orange { color: var(--color-urgent); }
    .text-red { color: var(--color-critical); }
    .text-muted { color: var(--color-text-muted); }

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

    .ledger-wrapper {
      display: flex;
      flex-direction: column;
    }
    .filter-wrapper-padding {
      padding: var(--spacing-md);
      background-color: var(--color-bg-base);
      border-bottom: 1px solid var(--color-border);
    }
  `
})
export class AdminAudit implements OnInit {
  auditColumns: TableColumn[] = [
    { header: 'Timestamp', key: 'timestamp', width: '160px' },
    { header: 'System User', key: 'user', type: 'avatar', width: '220px' },
    { header: 'Portal Role', key: 'role', width: '120px' },
    { header: 'Logged Event Description', key: 'event', width: '320px' },
    { header: 'Target Module', key: 'module', width: '130px' },
    { header: 'IP Address', key: 'ipAddress', width: '130px' },
    {
      header: 'Severity',
      key: 'severity',
      type: 'badge',
      width: '120px',
      badgeMap: {
        'info': { label: 'Info', class: 'pill-secondary' },
        'warning': { label: 'Warning', class: 'pill-urgent' },
        'critical': { label: 'Critical', class: 'pill-critical' }
      }
    },
    {
      header: 'Audit Action',
      key: 'actions',
      type: 'actions',
      width: '120px',
      align: 'center',
      actions: [
        {
          label: 'View',
          action: 'inspect',
          class: 'btn-secondary',
          tooltip: 'View log details',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
        }
      ]
    }
  ];

  filterConfig: FilterControlConfig[] = [
    {
      key: 'severity',
      label: 'Severity Level',
      type: 'select',
      options: [
        { label: 'All Levels', value: '' },
        { label: 'Info Only', value: 'info' },
        { label: 'Warning Only', value: 'warning' },
        { label: 'Critical Alerts', value: 'critical' }
      ],
      width: '180px'
    },
    {
      key: 'module',
      label: 'System Module',
      type: 'select',
      options: [
        { label: 'All Modules', value: '' },
        { label: 'EHR Records', value: 'EHR' },
        { label: 'Auth Access', value: 'Authentication' },
        { label: 'Billing Ledger', value: 'Billing' },
        { label: 'Bed Allocation', value: 'Beds' }
      ],
      width: '180px'
    }
  ];

  rawLogs = computed(() => this.auditService.logs());
  activeFilters = signal<Record<string, string>>({});

  // Computed filtered logs listing
  readonly filteredLogs = computed<AuditLog[]>(() => {
    const logs = this.rawLogs();
    const filters = this.activeFilters();

    return logs.filter(log => {
      if (filters['severity'] && log.severity !== filters['severity']) return false;
      if (filters['module'] && log.module !== filters['module']) return false;
      return true;
    });
  });

  protected auditService = inject(AuditService);

  ngOnInit() {
    void this.auditService.loadAuditLogs();
  }

  onFilterChange(filters: Record<string, string>) {
    this.activeFilters.set(filters);
  }

  onLogAction(event: { action: string, row: AuditLog }) {
    if (event.action === 'inspect') {
      console.log('Inspect log:', event.row);
    }
  }

  exportLogs() {
    console.log('Export audit logs - feature pending implementation');
  }
}
