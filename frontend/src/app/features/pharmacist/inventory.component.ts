import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { getApiBaseUrl } from '../../core/config/api.config';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseCard } from '../../shared/components/base-card/base-card.component';
import { BaseTable, TableColumn } from '../../shared/components/base-table/base-table.component';
import { InventoryService, InventoryItem } from '../../core/services/inventory.service';

@Component({
  selector: 'app-pharmacist-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseCard, BaseTable],
  template: `
    <div class="inventory-page-container animate-fade">
      <details style="padding:20px;border:1px solid var(--color-border);border-radius:12px;background:var(--color-bg-surface)"><summary>Add a received inventory batch</summary><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-top:18px">
        <label>Medicine name<input [(ngModel)]="newStock.name" /></label><label>Batch number<input [(ngModel)]="newStock.batch" /></label><label>Quantity<input type="number" min="1" [(ngModel)]="newStock.qty" /></label><label>Unit<input [(ngModel)]="newStock.unit" /></label><label>Price per unit (₹)<input type="number" min="0" step="0.01" [(ngModel)]="newStock.unit_price" /></label><label>Reorder level<input type="number" min="0" [(ngModel)]="newStock.reorder_level" /></label><label>Expiry<input type="date" [(ngModel)]="newStock.expiry" /></label><button [disabled]="stockSaving()" (click)="addStock()">Save batch</button></div></details>
      <div *ngIf="receivingId" style="padding:20px;border:1px solid var(--color-border);border-radius:12px"><label>Quantity received for selected batch<input type="number" min="1" [(ngModel)]="receiveQuantity" /></label><button [disabled]="stockSaving()" (click)="receiveStock()">Record received stock</button><button (click)="receivingId=''">Cancel</button></div>
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Pharmacy Formulary & Batch Inventory</h1>
          <p class="page-sub">Central hospital drug repository — manage real-time bin quantities, batch numbers, expiry dates, and emergency reorders.</p>
        </div>
        <div class="header-actions">
          <button class="refresh-btn" (click)="refreshInventory()">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>
            Refresh Stock
          </button>
        </div>
      </div>

      <!-- Quick Inventory KPIs -->
      <div class="metrics-grid">
        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Total Catalogued SKUs</span>
            <h3 class="metric-val">{{ totalItems() }}</h3>
            <span class="metric-sub text-muted">Active drug batches</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm" statusBorder="critical">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Low / Out of Stock Alarms</span>
            <h3 class="metric-val text-red">{{ lowStockCount() }}</h3>
            <span class="metric-sub text-red">Below reorder threshold</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Stock Reserve Health</span>
            <h3 class="metric-val text-green">{{ healthyStockPercent() }}%</h3>
            <span class="metric-sub text-green">Optimal inventory levels</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Estimated Formulary Value</span>
            <h3 class="metric-val text-blue">₹{{ totalInventoryValue().toLocaleString('en-IN') }}</h3>
            <span class="metric-sub text-muted">Calculated batch worth</span>
          </div>
        </app-base-card>
      </div>

      <!-- Category Filter Pills & Search -->
      <div class="controls-row">
        <div class="category-chips">
          <button
            class="chip-btn"
            [class.active]="selectedCategory() === 'All'"
            (click)="selectedCategory.set('All')"
          >
            All Categories
          </button>
          <button
            *ngFor="let cat of categories()"
            class="chip-btn"
            [class.active]="selectedCategory() === cat"
            (click)="selectedCategory.set(cat)"
          >
            {{ cat }}
          </button>
        </div>

        <div class="status-chips">
          <button
            class="chip-btn"
            [class.active]="filterStatus() === 'all'"
            (click)="filterStatus.set('all')"
          >
            All Levels
          </button>
          <button
            class="chip-btn alert-chip"
            [class.active]="filterStatus() === 'alerts'"
            (click)="filterStatus.set('alerts')"
          >
            ⚠ Needs Reorder ({{ lowStockCount() }})
          </button>
        </div>
      </div>

      <div class="status-banner success" *ngIf="notification()">{{ notification() }}</div>
      <div class="status-banner error" *ngIf="inventoryService.error()">{{ inventoryService.error() }}</div>

      <!-- Inventory Table -->
      <app-base-card [border]="true" elevation="sm">
        <div card-body class="p-0">
          <app-base-table
            [columns]="columns"
            [data]="filteredData()"
            [totalItems]="filteredData().length"
            [pageSize]="12"
            [currentPage]="1"
            [showSearch]="true"
            searchPlaceholder="Search formulation, manufacturer, or batch..."
            (actionClick)="onAction($event)"
          ></app-base-table>
        </div>
      </app-base-card>
    </div>
  `,
  styles: `
    label{display:grid;gap:7px;font-size:12px}input{padding:10px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-bg-surface);color:var(--color-text-primary)}
    .inventory-page-container {
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
    .refresh-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-sm);
      color: var(--color-text-primary);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
    }
    .refresh-btn:hover {
      background: var(--color-bg-surface-hover);
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
    .text-red { color: #ef4444; }
    .text-green { color: #10b981; }
    .text-blue { color: #3b82f6; }

    .controls-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
    }
    .category-chips, .status-chips {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .chip-btn {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      padding: 5px 12px;
      border-radius: var(--border-radius-full);
      font-size: 12px;
      color: var(--color-text-secondary);
      cursor: pointer;
      font-weight: 500;
      transition: all 0.15s ease;
    }
    .chip-btn:hover {
      background: var(--color-bg-surface-hover);
      color: var(--color-text-primary);
    }
    .chip-btn.active {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: #ffffff;
    }
    .alert-chip.active {
      background: #ef4444;
      border-color: #ef4444;
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
export class PharmacistInventory implements OnInit {
  protected inventoryService = inject(InventoryService);

  selectedCategory = signal<string>('All');
  filterStatus = signal<'all' | 'alerts'>('all');
  private http=inject(HttpClient);
  stockSaving=signal(false); receivingId=''; receiveQuantity=1;
  newStock={name:'',batch:'',qty:1,unit:'Tabs',unit_price:0,reorder_level:10,expiry:''};
  async addStock(){this.stockSaving.set(true);try{await firstValueFrom(this.http.post(`${getApiBaseUrl()}/inventory`,this.newStock));this.notification.set('Inventory batch added.');this.newStock={name:'',batch:'',qty:1,unit:'Tabs',unit_price:0,reorder_level:10,expiry:''};this.refreshInventory();}catch(e:any){this.notification.set(e.error?.message||'Unable to add stock.');}finally{this.stockSaving.set(false);}}
  async receiveStock(){this.stockSaving.set(true);try{await firstValueFrom(this.http.patch(`${getApiBaseUrl()}/inventory/${this.receivingId}/receive`,{quantity:this.receiveQuantity}));this.receivingId='';this.notification.set('Received stock recorded.');this.refreshInventory();}catch(e:any){this.notification.set(e.error?.message||'Unable to record stock.');}finally{this.stockSaving.set(false);}}
  notification = signal<string | null>(null);

  columns: TableColumn[] = [
    { header: 'Formulation Name', key: 'name', width: '220px', align: 'left' },
    { header: 'Category', key: 'category', width: '130px' },
    { header: 'Batch #', key: 'batch', width: '110px', align: 'center' },
    { header: 'Stock Qty', key: 'qty', width: '90px', align: 'center' },
    { header: 'Unit', key: 'unit', width: '90px', align: 'center' },
    { header: 'Reorder Level', key: 'reorder_level', width: '110px', align: 'center' },
    { header: 'Unit Price', key: 'unit_price', width: '100px', align: 'right' },
    { header: 'Expiry Date', key: 'expiry', width: '110px' },
    { header: 'Manufacturer', key: 'manufacturer', width: '140px' },
    {
      header: 'Stock Status',
      key: 'status',
      type: 'badge',
      width: '120px',
      badgeMap: {
        'In Stock': { label: 'In Stock', class: 'pill-normal' },
        'Low Stock': { label: 'Low Stock', class: 'pill-urgent' },
        'Out of Stock': { label: 'Depleted', class: 'pill-critical' }
      }
    },
    {
      header: 'Action',
      key: 'actions',
      type: 'actions',
      width: '110px',
      align: 'center',
      actions: [
        { label:'Receive stock',action:'receive',class:'btn-primary' },
        {
          label: 'Request stock',
          action: 'reorder',
          class: 'btn-secondary',
          tooltip: 'Record an internal replenishment request',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>'
        }
      ]
    }
  ];

  totalItems = computed(() => this.inventoryService.items().length);
  lowStockCount = computed(() => this.inventoryService.lowStockCount());

  categories = computed(() => {
    const cats = new Set<string>();
    this.inventoryService.items().forEach(i => {
      if (i.category) cats.add(i.category);
    });
    return Array.from(cats).sort();
  });

  healthyStockPercent = computed(() => {
    const total = this.totalItems();
    if (!total) return 100;
    const healthy = total - this.lowStockCount();
    return Math.round((healthy / total) * 100);
  });

  totalInventoryValue = computed(() => {
    return this.inventoryService.items().reduce((acc, item) => {
      return acc + (Number(item.qty) * Number(item.unit_price || 0));
    }, 0);
  });

  filteredData = computed(() => {
    let items = this.inventoryService.items();
    const cat = this.selectedCategory();
    const st = this.filterStatus();

    if (cat !== 'All') {
      items = items.filter(i => i.category === cat);
    }
    if (st === 'alerts') {
      items = items.filter(i => i.status === 'Low Stock' || i.status === 'Out of Stock');
    }
    return items;
  });

  ngOnInit() {
    void this.inventoryService.loadInventory();
  }

  refreshInventory() {
    void this.inventoryService.loadInventory(true);
  }

  async onAction(event: { action: string, row: any }) {
    if (event.action === 'receive') { this.receivingId=event.row.id;this.receiveQuantity=1;return; }
    if (event.action === 'reorder') {
      try {
        const msg = await this.inventoryService.requestReorder(event.row.id);
        this.notification.set(msg);
        setTimeout(() => this.notification.set(null), 4000);
      } catch {
        this.notification.set('Unable to record replenishment request.');
        setTimeout(() => this.notification.set(null), 4000);
      }
    }
  }
}
