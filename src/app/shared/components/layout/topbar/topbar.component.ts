import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../../core/services/auth.service';
import { TooltipDirective } from '../../../directives/tooltip.directive';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, TooltipDirective],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.css'
})
export class Topbar {
  notificationCount = signal<number>(0);
  showNotifications = signal<boolean>(false);

  readonly portalName = computed(() => {
    const role = this.authService.currentRole();
    if (!role) return '';
    return role.charAt(0).toUpperCase() + role.slice(1) + ' Workspace';
  });

  constructor(protected authService: AuthService) {}

  toggleNotifications() {
    this.showNotifications.update(val => !val);
    if (this.showNotifications()) {
      this.notificationCount.set(0);
    }
  }

  logout() {
    this.authService.logout();
  }
}
