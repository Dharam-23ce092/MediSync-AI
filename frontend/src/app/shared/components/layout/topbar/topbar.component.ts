import { Component, computed, signal, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AppointmentService } from '../../../../core/services/appointment.service';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../../core/services/auth.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { TooltipDirective } from '../../../directives/tooltip.directive';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [RouterLink, CommonModule, TooltipDirective],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.css'
})
export class Topbar {
  public themeService = inject(ThemeService);
  protected authService = inject(AuthService);

  private router = inject(Router);
  protected appointments = inject(AppointmentService);
  notificationCount = computed(() => this.notifications().length);
  notifications = computed(() => this.appointments.appointments().filter(a => ['Requested','Confirmed','Checked-in'].includes(a.status)).slice(0,5));
  search(value: string) { if (value.trim()) this.router.navigate(['/cases'], { queryParams: { q: value.trim() } }); }
  showNotifications = signal<boolean>(false);

  readonly portalName = computed(() => {
    const role = this.authService.currentRole();
    if (!role) return '';
    return role.charAt(0).toUpperCase() + role.slice(1) + ' Workspace';
  });

  toggleNotifications() {
    this.showNotifications.update(val => !val);
    if (this.showNotifications()) {
      void this.appointments.loadAppointments();
    }
  }

  logout() {
    this.authService.logout();
  }
}
