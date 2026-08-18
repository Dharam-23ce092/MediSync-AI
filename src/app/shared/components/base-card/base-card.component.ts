import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-base-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './base-card.component.html',
  styleUrl: './base-card.component.css'
})
export class BaseCard {
  @Input() interactive: boolean = false;
  @Input() border: boolean = true;
  @Input() elevation: 'none' | 'sm' | 'md' | 'lg' = 'sm';
  @Input() statusBorder: 'none' | 'critical' | 'urgent' | 'semi-urgent' | 'normal' | 'info' = 'none';

  get cardClasses() {
    return {
      'card-interactive': this.interactive,
      'card-no-border': !this.border,
      [`elevation-${this.elevation}`]: true,
      [`status-border-${this.statusBorder}`]: this.statusBorder !== 'none'
    };
  }
}
