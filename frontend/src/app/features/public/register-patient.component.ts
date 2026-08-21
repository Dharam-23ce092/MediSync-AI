import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { getApiBaseUrl } from '../../core/config/api.config';

interface HospitalOption {
  id: string;
  name: string;
  slug: string;
}

import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-register-patient',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './register-patient.component.html',
  styleUrl: './register-patient.component.css'
})
export class RegisterPatientComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  readonly themeService = inject(ThemeService);

  readonly hospitals = signal<HospitalOption[]>([]);
  readonly isLoadingHospitals = signal(true);
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly submitted = signal(false);

  // Form Group
  readonly registerForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    age: [null as number | null, [Validators.required, Validators.min(0), Validators.max(120)]],
    gender: ['', [Validators.required]],
    bloodGroup: ['', [Validators.required]],
    emergencyContact: ['', [Validators.required, Validators.minLength(10)]],
    allergies: [''],
    hospitalId: ['', [Validators.required]]
  });

  ngOnInit(): void {
    this.fetchHospitals();
  }

  get f() { return this.registerForm.controls; }

  isFieldInvalid(fieldName: string): boolean {
    const control = this.registerForm.get(fieldName);
    return !!control && (this.submitted() || control.touched) && control.invalid;
  }

  async fetchHospitals(): Promise<void> {
    try {
      const url = `${getApiBaseUrl()}/hospitals`;
      const response = await this.http.get<{ success: boolean, data: HospitalOption[] }>(url).toPromise();
      if (response && response.success) {
        this.hospitals.set(response.data);
      }
    } catch (err) {
      console.error('Error fetching hospitals:', err);
    } finally {
      this.isLoadingHospitals.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    this.submitted.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    const payload = this.registerForm.value;

    try {
      const url = `${getApiBaseUrl()}/auth/register-patient`;
      const response = await this.http.post<any>(url, payload).toPromise();

      if (response && response.success) {
        this.successMessage.set('Account created successfully! You can now log in to access the patient portal.');
        this.registerForm.reset();
        this.submitted.set(false);
      } else {
        this.errorMessage.set(response?.message || 'Patient registration failed');
      }
    } catch (err: any) {
      console.error(err);
      if (err instanceof HttpErrorResponse) {
        this.errorMessage.set(err.error?.message || 'Failed to register. Please check your data and try again.');
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
