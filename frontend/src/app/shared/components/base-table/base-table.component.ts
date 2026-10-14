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
  visible?: (row: any) => boolean;
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

  get filteredRows(): any[] {
    const term=this.searchTerm.trim().toLowerCase();
    if (!term || this.searchChange.observed) return this.data;
    return this.data.filter(row=>this.columns.some(col=>String(row[col.key] ?? '').toLowerCase().includes(term)));
  }
  get effectiveTotal(): number { return this.pageChange.observed ? this.totalItems : this.filteredRows.length; }
  get visibleRows(): any[] {
    if (!this.showPagination || this.pageChange.observed) return this.filteredRows;
    const page=Math.min(this.currentPage,this.totalPages);
    return this.filteredRows.slice((page-1)*this.pageSize,page*this.pageSize);
  }
  get totalPages(): number {
    return Math.ceil(this.effectiveTotal / this.pageSize) || 1;
  }

  get pages(): number[] {
    const pagesArray: number[] = [];
    for (let i = 1; i <= this.totalPages; i++) {
      pagesArray.push(i);
    }
    return pagesArray;
  }

  onSearch() {
    this.currentPage=1;
    this.searchChange.emit(this.searchTerm);
  }

  onPageChange(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage=page;
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
