import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.css'
})
export class LandingComponent {
  private readonly router = inject(Router);
  readonly themeService = inject(ThemeService);

  navigateToRegisterHospital(): void {
    this.router.navigate(['/register-hospital']);
  }

  navigateToRegisterPatient(): void {
    this.router.navigate(['/register-patient']);
  }

  navigateToLogin(): void {
    this.router.navigate(['/login']);
  }
}
