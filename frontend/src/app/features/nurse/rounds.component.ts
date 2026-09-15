import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseCard } from '../../shared/components/base-card/base-card.component';
import { NurseTaskService, NurseTask } from '../../core/services/nurse-task.service';

@Component({
  selector: 'app-nurse-rounds',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseCard],
  template: `
    <div class="rounds-container animate-fade">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Nursing Rounds & Shift Duty Tracker</h1>
          <p class="page-sub">Manage scheduled inpatient care duties, hourly rounds, medication administrations, and STAT physician orders.</p>
        </div>
        <div class="header-clock">
          <span class="shift-badge">Current Shift: Morning Duty (08:00 - 16:00)</span>
        </div>
      </div>

      <!-- Quick Metrics -->
      <div class="metrics-grid">
        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Total Shift Tasks</span>
            <h3 class="metric-val">{{ totalCount() }}</h3>
            <span class="metric-sub text-muted">Assigned duties</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm" statusBorder="semi-urgent">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Pending Actions</span>
            <h3 class="metric-val text-orange">{{ pendingCount() }}</h3>
            <span class="metric-sub text-orange">Require completion</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm">
          <div class="metric-body" card-body>
            <span class="metric-lbl">Completed Duties</span>
            <h3 class="metric-val text-green">{{ completedCount() }}</h3>
            <span class="metric-sub text-green">{{ completionPercent() }}% shift completion</span>
          </div>
        </app-base-card>

        <app-base-card [border]="true" elevation="sm" statusBorder="critical">
          <div class="metric-body" card-body>
            <span class="metric-lbl">High Priority / STAT</span>
            <h3 class="metric-val text-red">{{ highPriorityPendingCount() }}</h3>
            <span class="metric-sub text-red">Immediate execution</span>
          </div>
        </app-base-card>
      </div>

      <!-- Filter Controls -->
      <div class="filters-bar">
        <div class="filter-tabs">
          <button class="filter-btn" [class.active]="activeTab() === 'all'" (click)="activeTab.set('all')">
            All Shift Tasks ({{ totalCount() }})
          </button>
          <button class="filter-btn" [class.active]="activeTab() === 'pending'" (click)="activeTab.set('pending')">
            Pending Tasks ({{ pendingCount() }})
          </button>
          <button class="filter-btn" [class.active]="activeTab() === 'high'" (click)="activeTab.set('high')">
            High Priority ({{ highPriorityCount() }})
          </button>
          <button class="filter-btn" [class.active]="activeTab() === 'completed'" (click)="activeTab.set('completed')">
            Completed ({{ completedCount() }})
          </button>
        </div>
      </div>

      <div class="status-banner success" *ngIf="successMsg()">{{ successMsg() }}</div>

      <!-- Tasks List View -->
      <app-base-card [border]="true" elevation="sm">
        <div card-header class="card-header-bar">
          <span class="card-title">Assigned Clinical Rounds & Procedures</span>
          <span class="card-sub">Click checkbox to record completed action</span>
        </div>
        <div card-body class="tasks-body">
          <div *ngIf="filteredTasks().length === 0" class="empty-state">
            No duties found matching the selected filter.
          </div>

          <div *ngFor="let task of filteredTasks()" class="task-item" [class.completed]="task.completed">
            <div class="task-checkbox-wrap">
              <input
                type="checkbox"
                [checked]="task.completed"
                (change)="toggle(task.id)"
                class="task-check"
              />
              <div class="task-main-info">
                <div class="task-header-line">
                  <span class="bed-pill">{{ task.bed }}</span>
                  <strong class="pat-name">{{ task.patientName || task.patient }}</strong>
                  <span class="time-tag">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    {{ task.scheduledTime || task.time }}
                  </span>
                </div>
                <p class="task-desc">{{ task.task }}</p>
              </div>
            </div>

            <div class="task-actions-wrap">
              <span class="prio-tag" [ngClass]="'prio-' + task.priority">
                {{ task.priority | uppercase }}
              </span>
              <span class="status-check-lbl" *ngIf="task.completed">
                ✓ Done
              </span>
            </div>
          </div>
        </div>
      </app-base-card>
    </div>
  `,
  styles: `
    .rounds-container {
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
    .shift-badge {
      padding: 6px 14px;
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-full);
      font-size: 12px;
      color: var(--color-text-secondary);
      font-weight: 500;
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
    .text-green { color: #10b981; }
    .text-red { color: #ef4444; }

    .filters-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .filter-tabs {
      display: flex;
      gap: 8px;
    }
    .filter-btn {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      padding: 6px 14px;
      border-radius: var(--border-radius-full);
      font-size: 12px;
      color: var(--color-text-secondary);
      cursor: pointer;
      font-weight: 500;
    }
    .filter-btn.active {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: #ffffff;
    }

    .card-header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--spacing-md);
      border-bottom: 1px solid var(--color-border);
    }
    .card-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .card-sub {
      font-size: 12px;
      color: var(--color-text-muted);
    }

    .tasks-body {
      padding: 0;
    }
    .empty-state {
      padding: 30px;
      text-align: center;
      color: var(--color-text-muted);
      font-size: 13px;
    }
    .task-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 18px;
      border-bottom: 1px solid var(--color-border);
      transition: background 0.15s ease;
    }
    .task-item:hover {
      background: var(--color-bg-surface-hover);
    }
    .task-item.completed {
      opacity: 0.6;
      background: var(--color-bg-base);
    }
    .task-item.completed .task-desc {
      text-decoration: line-through;
    }

    .task-checkbox-wrap {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      flex: 1;
    }
    .task-check {
      width: 18px;
      height: 18px;
      cursor: pointer;
      margin-top: 3px;
    }
    .task-main-info {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .task-header-line {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .bed-pill {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      padding: 2px 8px;
      border-radius: var(--border-radius-sm);
      font-size: 11px;
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .pat-name {
      font-size: 13.5px;
      color: var(--color-text-primary);
    }
    .time-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11.5px;
      color: var(--color-text-secondary);
    }
    .task-desc {
      font-size: 13px;
      color: var(--color-text-secondary);
      margin: 0;
    }

    .task-actions-wrap {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .prio-tag {
      padding: 3px 8px;
      border-radius: var(--border-radius-full);
      font-size: 11px;
      font-weight: 700;
    }
    .prio-high {
      background: #fef2f2;
      color: #dc2626;
      border: 1px solid #fecaca;
    }
    .prio-medium {
      background: #fffbeb;
      color: #d97706;
      border: 1px solid #fde68a;
    }
    .prio-low {
      background: #f0fdf4;
      color: #16a34a;
      border: 1px solid #bbf7d0;
    }
    .status-check-lbl {
      font-size: 12px;
      font-weight: 600;
      color: #10b981;
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
export class NurseRounds implements OnInit {
  protected nurseTaskService = inject(NurseTaskService);

  activeTab = signal<'all' | 'pending' | 'high' | 'completed'>('pending');
  successMsg = signal<string | null>(null);

  totalCount = computed(() => this.nurseTaskService.tasks().length);
  pendingCount = computed(() => this.nurseTaskService.pendingCount());
  completedCount = computed(() => this.nurseTaskService.tasks().filter(t => t.completed).length);
  highPriorityCount = computed(() => this.nurseTaskService.tasks().filter(t => t.priority === 'high').length);
  highPriorityPendingCount = computed(() =>
    this.nurseTaskService.tasks().filter(t => t.priority === 'high' && !t.completed).length
  );

  completionPercent = computed(() => {
    const tot = this.totalCount();
    if (!tot) return 100;
    return Math.round((this.completedCount() / tot) * 100);
  });

  filteredTasks = computed(() => {
    const tab = this.activeTab();
    const tasks = this.nurseTaskService.tasks();
    if (tab === 'pending') return tasks.filter(t => !t.completed);
    if (tab === 'completed') return tasks.filter(t => t.completed);
    if (tab === 'high') return tasks.filter(t => t.priority === 'high');
    return tasks;
  });

  ngOnInit() {
    void this.nurseTaskService.loadTasks();
  }

  async toggle(taskId: string) {
    try {
      await this.nurseTaskService.toggleTask(taskId);
      const task = this.nurseTaskService.tasks().find(t => t.id === taskId);
      if (task?.completed) {
        this.successMsg.set(`Task "${task.task}" marked as completed.`);
        setTimeout(() => this.successMsg.set(null), 3000);
      }
    } catch {
      // Error handled by service
    }
  }
}
