import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  readonly themeService = inject(ThemeService);

  readonly showPassword = signal(false);
  readonly isSubmitting = signal(false);
  readonly authError = signal<string | null>(null);
  readonly submitted = signal(false);

  readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(1)]]
  });

  get emailInvalid(): boolean {
    const control = this.loginForm.controls.email;
    return (this.submitted() || control.touched) && control.invalid;
  }

  get passwordInvalid(): boolean {
    const control = this.loginForm.controls.password;
    return (this.submitted() || control.touched) && control.invalid;
  }

  togglePasswordVisibility(): void {
    this.showPassword.update(v => !v);
  }

  async onSubmit(): Promise<void> {
    this.submitted.set(true);
    this.authError.set(null);

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const { email, password } = this.loginForm.getRawValue();
    this.isSubmitting.set(true);

    try {
      await this.authService.login(email.trim(), password);
      const role = this.authService.currentRole();
      if (role) {
        await this.router.navigateByUrl(this.authService.getPortalRouteForRole(role));
      }
    } catch (error) {
      this.authError.set(this.resolveErrorMessage(error));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private resolveErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return 'Unable to reach the authentication server. Ensure the backend is running on port 3000.';
      }
      const body = error.error as { message?: string } | null;
      if (body?.message) {
        return body.message;
      }
      if (error.status === 401) {
        return 'Invalid email or password. Please try again.';
      }
      if (error.status >= 500) {
        return 'Authentication service is temporarily unavailable. Please try again later.';
      }
    }

    if (error instanceof Error && error.message) {
      return error.message;
    }

    return 'Login failed. Please check your credentials and try again.';
  }
}
