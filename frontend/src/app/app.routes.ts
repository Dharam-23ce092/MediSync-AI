import { Routes } from '@angular/router';
import { DashboardShell } from './shared/components/layout/dashboard-shell/dashboard-shell.component';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/public/landing.component').then(m => m.LandingComponent)
  },
  {
    path: 'register-hospital',
    loadComponent: () => import('./features/public/register-hospital.component').then(m => m.RegisterHospitalComponent)
  },
  {
    path: 'register-patient',
    loadComponent: () => import('./features/public/register-patient.component').then(m => m.RegisterPatientComponent)
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent)
  },
  {
    path: '',
    component: DashboardShell,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./core/components/portal-home.component').then(m => m.PortalHome)
      },

      // Doctor Portal
      {
        path: 'doctor/dashboard.component',
        loadComponent: () => import('./features/doctor/dashboard.component').then(m => m.DoctorDashboard)
      },
      {
        path: 'doctor/patients.component',
        loadComponent: () => import('./features/doctor/patients.component').then(m => m.DoctorPatients)
      },
      {
        path: 'doctor/appointments',
        loadComponent: () => import('./features/doctor/dashboard.component').then(m => m.DoctorDashboard)
      },
      {
        path: 'doctor/opd.component',
        loadComponent: () => import('./features/doctor/opd.component').then(m => m.DoctorOpd)
      },
      {
        path: 'doctor/consultation/:id',
        loadComponent: () => import('./features/doctor/consultation.component').then(m => m.DoctorConsultation)
      },
      {
        path: 'doctor/ai-assistant.component',
        loadComponent: () => import('./features/doctor/ai-assistant.component').then(m => m.DoctorAiAssistant)
      },

      // Nurse Portal
      {
        path: 'nurse/dashboard.component',
        loadComponent: () => import('./features/nurse/dashboard.component').then(m => m.NurseDashboard)
      },
      {
        path: 'nurse/patients.component',
        loadComponent: () => import('./features/nurse/dashboard.component').then(m => m.NurseDashboard)
      },
      {
        path: 'nurse/rounds',
        loadComponent: () => import('./features/nurse/dashboard.component').then(m => m.NurseDashboard)
      },
      {
        path: 'nurse/alerts',
        loadComponent: () => import('./features/nurse/dashboard.component').then(m => m.NurseDashboard)
      },

      // Admin Portal
      {
        path: 'admin/dashboard.component',
        loadComponent: () => import('./features/admin/dashboard.component').then(m => m.AdminDashboard)
      },
      {
        path: 'admin/beds.component',
        loadComponent: () => import('./features/admin/beds.component').then(m => m.AdminBeds)
      },
      {
        path: 'admin/staff.component',
        loadComponent: () => import('./features/admin/staff.component').then(m => m.AdminStaff)
      },
      {
        path: 'admin/departments',
        loadComponent: () => import('./features/admin/departments.component').then(m => m.AdminDepartments)
      },
      {
        path: 'admin/billing',
        loadComponent: () => import('./features/admin/billing.component').then(m => m.AdminBilling)
      },
      {
        path: 'admin/audit.component',
        loadComponent: () => import('./features/admin/audit.component').then(m => m.AdminAudit)
      },

      // Patient Portal
      {
        path: 'patient/dashboard.component',
        loadComponent: () => import('./features/patient/dashboard.component').then(m => m.PatientDashboard)
      },
      {
        path: 'patient/book.component',
        loadComponent: () => import('./features/patient/book.component').then(m => m.PatientBook)
      },
      {
        path: 'patient/queue.component',
        loadComponent: () => import('./features/patient/queue.component').then(m => m.PatientQueue)
      },
      {
        path: 'patient/records',
        loadComponent: () => import('./features/patient/dashboard.component').then(m => m.PatientDashboard)
      },
      {
        path: 'patient/billing',
        loadComponent: () => import('./features/patient/dashboard.component').then(m => m.PatientDashboard)
      },

      // Shared Cases Lifecycle detail route
      {
        path: 'cases/:id',
        loadComponent: () => import('./features/case/case-detail.component').then(m => m.CaseDetailComponent)
      },

      // Pharmacist Portal
      {
        path: 'pharmacist/dashboard.component',
        loadComponent: () => import('./features/pharmacist/dashboard.component').then(m => m.PharmacistDashboard)
      },
      {
        path: 'pharmacist/dispensing',
        loadComponent: () => import('./features/pharmacist/dashboard.component').then(m => m.PharmacistDashboard)
      },
      {
        path: 'pharmacist/inventory',
        loadComponent: () => import('./features/pharmacist/dashboard.component').then(m => m.PharmacistDashboard)
      },

      // Lab Portal
      {
        path: 'lab/dashboard.component',
        loadComponent: () => import('./features/lab/dashboard.component').then(m => m.LabDashboard)
      },
      {
        path: 'lab/samples',
        loadComponent: () => import('./features/lab/dashboard.component').then(m => m.LabDashboard)
      },
      {
        path: 'lab/results',
        loadComponent: () => import('./features/lab/dashboard.component').then(m => m.LabDashboard)
      }
    ]
  },
  { path: '**', redirectTo: 'login' }
];
