import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseCard } from '../../shared/components/base-card/base-card.component';
import { BaseTable, TableColumn } from '../../shared/components/base-table/base-table.component';
import { LabOrderService, LabOrder } from '../../core/services/lab-order.service';

@Component({
  selector: 'app-lab-samples',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseCard, BaseTable],
  template: `
    <div class="samples-container animate-fade">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Diagnostic Specimen Collection & Barcode Tracking</h1>
          <p class="page-sub">Central laboratory pre-analytical tracking — log phlebotomy collections, scan specimen barcodes, and advance testing runs.</p>
        </div>
        <div class="header-status">
          <span class="lis-tag">
            <span class="live-dot"></span> LIS Barcode Scanner Online
          </span>
        </div>
      </div>

      <!-- Quick Metrics -->
      <div class="metrics-grid">
        <app-base-card [border]="true" elevation="sm" statusBorder="semi-urgent">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Awaiting Collection</span>
            <h3 class="metric-val text-orange">{{ awaitingCount() }}</h3>
            <span class="metric-sub text-orange">Phlebotomy pending</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Collected & Accessioned</span>
            <h3 class="metric-val text-blue">{{ collectedCount() }}</h3>
            <span class="metric-sub text-muted">Ready for benchwork</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Under Automated Analysis</span>
            <h3 class="metric-val text-purple">{{ analysisCount() }}</h3>
            <span class="metric-sub text-muted">In analyzer run</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Completed Runs</span>
            <h3 class="metric-val text-green">{{ completedCount() }}</h3>
            <span class="metric-sub text-green">Results dispatched</span>
          </div>
        </app-base-card>
      </div>

      <!-- Filter Tabs -->
      <div class="filters-row">
        <div class="filter-tabs">
          <button class="tab-btn" [class.active]="filter() === 'all'" (click)="filter.set('all')">
            All Specimens ({{ totalCount() }})
          </button>
          <button class="tab-btn" [class.active]="filter() === 'awaiting'" (click)="filter.set('awaiting')">
            Awaiting Phlebotomy ({{ awaitingCount() }})
          </button>
          <button class="tab-btn" [class.active]="filter() === 'collected'" (click)="filter.set('collected')">
            In Laboratory ({{ collectedCount() }})
          </button>
          <button class="tab-btn" [class.active]="filter() === 'completed'" (click)="filter.set('completed')">
            Completed ({{ completedCount() }})
          </button>
        </div>
      </div>

      <div class="status-banner success" *ngIf="successMessage()">{{ successMessage() }}</div>
      <div class="status-banner error" *ngIf="errorMessage()">{{ errorMessage() }}</div>

      <!-- Table View -->
      <app-base-card [border]="true" elevation="sm">
        <div card-body class="p-0">
          <app-base-table
            [columns]="columns"
            [data]="filteredData()"
            [totalItems]="filteredData().length"
            [pageSize]="10"
            [currentPage]="1"
            [showSearch]="true"
            searchPlaceholder="Search by barcode, patient name, UHID, or test..."
            (actionClick)="onAction($event)"
          ></app-base-table>
        </div>
      </app-base-card>
    </div>
  `,
  styles: `
    .samples-container {
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
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .page-sub {
      font-size: 13px;
      color: var(--color-text-secondary);
      margin-top: 2px;
    }
    .lis-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-full);
      font-size: 12px;
      color: var(--color-text-secondary);
    }
    .live-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
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
    }
    .metric-val {
      font-size: 24px;
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 2px 0;
    }
    .metric-sub {
      font-size: 11px;
    }
    .text-orange { color: #f59e0b; }
    .text-blue { color: #3b82f6; }
    .text-purple { color: #8b5cf6; }
    .text-green { color: #10b981; }

    .filters-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .filter-tabs {
      display: flex;
      gap: 8px;
    }
    .tab-btn {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      padding: 6px 14px;
      border-radius: var(--border-radius-full);
      font-size: 12px;
      color: var(--color-text-secondary);
      cursor: pointer;
      font-weight: 500;
    }
    .tab-btn.active {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: #ffffff;
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
    .status-banner.error {
      background: var(--color-critical-light);
      border: 1px solid var(--color-critical-border);
      color: var(--color-critical);
    }
  `
})
export class LabSamples implements OnInit {
  protected labService = inject(LabOrderService);

  filter = signal<'all' | 'awaiting' | 'collected' | 'completed'>('awaiting');
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  columns: TableColumn[] = [
    { header: 'Order ID / Barcode', key: 'id', width: '130px', align: 'center' },
    { header: 'Patient Name', key: 'name', type: 'avatar', width: '180px' },
    { header: 'UHID / Room', key: 'name_subtitle', width: '150px' },
    { header: 'Diagnostic Test', key: 'testName', width: '220px' },
    { header: 'Specimen Type', key: 'specimen', width: '130px' },
    { header: 'Requesting Physician', key: 'doctor', width: '160px' },
    {
      header: 'Sample Status',
      key: 'status',
      type: 'badge',
      width: '130px',
      badgeMap: {
        'Received': { label: 'Awaiting Intake', class: 'pill-urgent' },
        'Collected': { label: 'Sample Accessioned', class: 'pill-info' },
        'Analysis': { label: 'In Analyzer', class: 'pill-secondary' },
        'Completed': { label: 'Report Ready', class: 'pill-normal' }
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
          label: 'Collect',
          action: 'collect',
          class: 'btn-primary',
          tooltip: 'Confirm sample phlebotomy and scan barcode',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>'
        }
      ]
    }
  ];

  totalCount = computed(() => this.labService.labOrders().length);
  awaitingCount = computed(() => this.labService.labOrders().filter(o => o.status === 'Received').length);
  collectedCount = computed(() => this.labService.labOrders().filter(o => o.status === 'Collected').length);
  analysisCount = computed(() => this.labService.labOrders().filter(o => o.status === 'Analysis').length);
  completedCount = computed(() => this.labService.labOrders().filter(o => o.status === 'Completed').length);

  filteredData = computed(() => {
    const f = this.filter();
    const orders = this.labService.labOrders();
    if (f === 'awaiting') return orders.filter(o => o.status === 'Received');
    if (f === 'collected') return orders.filter(o => o.status === 'Collected' || o.status === 'Analysis');
    if (f === 'completed') return orders.filter(o => o.status === 'Completed');
    return orders;
  });

  ngOnInit() {
    void this.labService.loadOrders();
  }

  async onAction(event: { action: string, row: LabOrder }) {
    if (event.action === 'collect') {
      try {
        await this.labService.collectSample(event.row.id);
        this.successMessage.set(`Sample for ${event.row.name} marked as collected and accessioned.`);
        setTimeout(() => this.successMessage.set(null), 4000);
      } catch {
        this.errorMessage.set('Failed to update sample collection.');
        setTimeout(() => this.errorMessage.set(null), 4000);
      }
    }
  }
}
