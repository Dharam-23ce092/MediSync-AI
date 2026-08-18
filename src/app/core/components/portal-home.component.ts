import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-portal-home',
  standalone: true,
  template: ''
})
export class PortalHome implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    const role = this.authService.currentRole();
    if (role) {
      this.router.navigateByUrl(this.authService.getPortalRouteForRole(role), { replaceUrl: true });
      return;
    }
    this.router.navigate(['/login'], { replaceUrl: true });
  }
}
