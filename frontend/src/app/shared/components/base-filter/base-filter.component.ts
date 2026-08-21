import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TooltipDirective } from '../../directives/tooltip.directive';

export interface FilterOption {
  label: string;
  value: any;
}

export interface FilterControlConfig {
  key: string;
  type: 'text' | 'select' | 'date';
  label: string;
  placeholder?: string;
  options?: FilterOption[];
  defaultValue?: any;
  width?: string;
  tooltip?: string;
}

@Component({
  selector: 'app-base-filter',
  standalone: true,
  imports: [CommonModule, FormsModule, TooltipDirective],
  templateUrl: './base-filter.component.html',
  styleUrl: './base-filter.component.css'
})
export class BaseFilter implements OnInit {
  @Input() config: FilterControlConfig[] = [];
  @Output() filterChange = new EventEmitter<Record<string, any>>();

  filterValues: Record<string, any> = {};

  ngOnInit() {
    this.resetFilters(false); // Initialize default values without emitting first
  }

  onValueChange() {
    this.filterChange.emit(this.filterValues);
  }

  resetFilters(emit = true) {
    this.config.forEach(ctrl => {
      this.filterValues[ctrl.key] = ctrl.defaultValue !== undefined ? ctrl.defaultValue : '';
    });
    if (emit) {
      this.filterChange.emit(this.filterValues);
    }
  }

  hasActiveFilters(): boolean {
    return Object.keys(this.filterValues).some(key => {
      const configItem = this.config.find(c => c.key === key);
      const defaultVal = configItem?.defaultValue !== undefined ? configItem.defaultValue : '';
      return this.filterValues[key] !== defaultVal && this.filterValues[key] !== '';
    });
  }
}
