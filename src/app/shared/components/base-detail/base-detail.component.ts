import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TooltipDirective } from '../../directives/tooltip.directive';

export interface DetailItem {
  label: string;
  value: any;
  class?: string;
  tooltip?: string;
  type?: 'text' | 'badge' | 'vitals' | 'list';
  badgeClass?: string; // For badge types
}

@Component({
  selector: 'app-base-detail',
  standalone: true,
  imports: [CommonModule, TooltipDirective],
  templateUrl: './base-detail.component.html',
  styleUrl: './base-detail.component.css'
})
export class BaseDetail {
  @Input() items: DetailItem[] = [];
  @Input() columns: number = 2; // Supports 1, 2, 3, 4 columns

  get gridClass(): string {
    switch (this.columns) {
      case 1: return 'cols-1';
      case 3: return 'cols-3';
      case 4: return 'cols-4';
      case 2:
      default:
        return 'cols-2';
    }
  }

  isArray(val: any): boolean {
    return Array.isArray(val);
  }
}
