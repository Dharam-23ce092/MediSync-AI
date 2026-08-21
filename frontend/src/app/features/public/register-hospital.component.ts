import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { getApiBaseUrl } from '../../core/config/api.config';

import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-register-hospital',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './register-hospital.component.html',
  styleUrl: './register-hospital.component.css'
})
export class RegisterHospitalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  readonly themeService = inject(ThemeService);

  readonly currentStep = signal(1); // Step 1: Hospital Details, Step 2: Admin Account, Step 3: Success
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly submittedStep1 = signal(false);
  readonly submittedStep2 = signal(false);

  // Form Group
  readonly registerForm = this.fb.group({
    // Hospital Info
    name: ['', [Validators.required, Validators.minLength(3)]],
    slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)]],
    domain: ['', [Validators.pattern(/^@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)]],
    phone: ['', [Validators.required, Validators.minLength(10)]],
    address: ['', [Validators.required]],
    city: ['', [Validators.required]],
    state: ['', [Validators.required]],
    licenseNo: ['', [Validators.required]],

    // Admin Info
    adminName: ['', [Validators.required, Validators.minLength(3)]],
    adminEmail: ['', [Validators.required, Validators.email]],
    adminPassword: ['', [Validators.required, Validators.minLength(6)]]
  });

  constructor() {
    // Auto-generate slug from hospital name
    this.registerForm.get('name')?.valueChanges.subscribe(name => {
      if (name && this.currentStep() === 1) {
        const slug = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)+/g, '');
        this.registerForm.patchValue({ slug }, { emitEvent: false });
      }
    });
  }

  // Field Getters for validation
  get f() { return this.registerForm.controls; }

  isFieldInvalid(fieldName: string, stepNum: number): boolean {
    const control = this.registerForm.get(fieldName);
    const stepSubmitted = stepNum === 1 ? this.submittedStep1() : this.submittedStep2();
    return !!control && (stepSubmitted || control.touched) && control.invalid;
  }

  nextStep(): void {
    this.submittedStep1.set(true);
    this.errorMessage.set(null);

    // Validate only Step 1 fields
    const step1Fields = ['name', 'slug', 'domain', 'phone', 'address', 'city', 'state', 'licenseNo'];
    let step1Valid = true;
    for (const field of step1Fields) {
      const control = this.registerForm.get(field);
      if (control?.invalid) {
        control.markAsTouched();
        step1Valid = false;
      }
    }

    if (step1Valid) {
      this.currentStep.set(2);
    }
  }

  prevStep(): void {
    this.errorMessage.set(null);
    this.currentStep.set(1);
  }

  async onSubmit(): Promise<void> {
    this.submittedStep2.set(true);
    this.errorMessage.set(null);

    // Validate all fields
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    const payload = this.registerForm.value;

    try {
      const url = `${getApiBaseUrl()}/hospitals/register`;
      const response = await this.http.post<any>(url, payload).toPromise();

      if (response && response.success) {
        this.currentStep.set(3);
      } else {
        this.errorMessage.set(response?.message || 'Registration failed');
      }
    } catch (err: any) {
      console.error(err);
      if (err instanceof HttpErrorResponse) {
        this.errorMessage.set(err.error?.message || 'An error occurred during registration. Please check your details and try again.');
      } else {
        this.errorMessage.set('System error. Please try again later.');
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  navigateToLogin(): void {
    this.router.navigate(['/login']);
  }
}
