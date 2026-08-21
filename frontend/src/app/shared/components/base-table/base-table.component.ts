import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TooltipDirective } from '../../directives/tooltip.directive';

export interface TableAction {
  label: string;
  icon?: string;
  action: string;
  class?: string;
  tooltip?: string;
}

export interface TableColumn {
  header: string;
  key: string;
  type?: 'text' | 'date' | 'currency' | 'badge' | 'avatar' | 'actions';
  align?: 'left' | 'center' | 'right';
  badgeMap?: Record<string, { label: string; class: string }>; // For badge styling mapping
  actions?: TableAction[]; // For action column type
  width?: string;
}

@Component({
  selector: 'app-base-table',
  standalone: true,
  imports: [CommonModule, FormsModule, TooltipDirective],
  templateUrl: './base-table.component.html',
  styleUrl: './base-table.component.css'
})
export class BaseTable {
  @Input() columns: TableColumn[] = [];
  @Input() data: any[] = [];
  @Input() totalItems: number = 0;
  @Input() pageSize: number = 10;
  @Input() currentPage: number = 1;
  @Input() loading: boolean = false;
  @Input() showSearch: boolean = true;
  @Input() showPagination: boolean = true;
  @Input() searchPlaceholder: string = 'Search records...';
  @Input() emptyMessage: string = 'No records found.';

  @Output() pageChange = new EventEmitter<number>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() rowClick = new EventEmitter<any>();
  @Output() actionClick = new EventEmitter<{ action: string, row: any }>();

  searchTerm: string = '';
  protected readonly Math = Math;

  get totalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize) || 1;
  }

  get pages(): number[] {
    const pagesArray: number[] = [];
    for (let i = 1; i <= this.totalPages; i++) {
      pagesArray.push(i);
    }
    return pagesArray;
  }

  onSearch() {
    this.searchChange.emit(this.searchTerm);
  }

  onPageChange(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.pageChange.emit(page);
    }
  }

  onRowClick(row: any) {
    this.rowClick.emit(row);
  }

  onAction(action: string, row: any, event: Event) {
    event.stopPropagation(); // Avoid triggering rowClick
    this.actionClick.emit({ action, row });
  }

  getInitials(name: string): string {
    if (!name) return 'U';
    return name
      .split(' ')
      .map(part => part.charAt(0))
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }
}
