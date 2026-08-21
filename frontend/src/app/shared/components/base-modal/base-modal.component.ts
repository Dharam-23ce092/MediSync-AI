import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TooltipDirective } from '../../directives/tooltip.directive';

@Component({
  selector: 'app-base-modal',
  standalone: true,
  imports: [CommonModule, TooltipDirective],
  templateUrl: './base-modal.component.html',
  styleUrl: './base-modal.component.css'
})
export class BaseModal {
  @Input() isOpen: boolean = false;
  @Input() title: string = '';
  @Input() size: 'sm' | 'md' | 'lg' | 'xl' | 'full' = 'md';
  @Input() closeOnBackdrop: boolean = true;

  @Output() close = new EventEmitter<void>();

  onClose() {
    this.close.emit();
  }

  onBackdropClick(event: MouseEvent) {
    if (this.closeOnBackdrop && (event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.onClose();
    }
  }
}
