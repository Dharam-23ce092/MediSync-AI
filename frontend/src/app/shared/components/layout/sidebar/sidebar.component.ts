import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { ROLE_NAVIGATION, NavigationItem } from '../../../../core/config/navigation.config';
import { TooltipDirective } from '../../../directives/tooltip.directive';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, TooltipDirective],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css'
})
export class Sidebar {
  isCollapsed = signal<boolean>(false);

  // Computes active navigation items based on current role in AuthService
  readonly navItems = computed<NavigationItem[]>(() => {
    const role = this.authService.currentRole();
    return role ? ROLE_NAVIGATION[role] || [] : [];
  });

  // Displays clean text representation of current role
  readonly roleLabel = computed<string>(() => {
    const role = this.authService.currentRole();
    if (!role) return '';
    return role.toUpperCase();
  });

  constructor(protected authService: AuthService) {}

  toggleCollapse() {
    this.isCollapsed.update(val => !val);
  }
}
