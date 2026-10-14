import { Routes } from '@angular/router';
import { DashboardShell } from './shared/components/layout/dashboard-shell/dashboard-shell.component';
import { authGuard, guestGuard, portalGuard } from './core/guards/auth.guard';

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
    canActivateChild: [portalGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./core/components/portal-home.component').then(m => m.PortalHome)
      },

      // Doctor Portal
      {
        path: 'doctor/dashboard.component',
        loadComponent: () => import('./features/workspace/workspace.component').then(m => m.WorkspaceComponent)
      },
      {
        path: 'doctor/patients.component',
        loadComponent: () => import('./features/doctor/patients.component').then(m => m.DoctorPatients)
      },
      {
        path: 'doctor/appointments',
        loadComponent: () => import('./features/appointments/appointments.component').then(m => m.AppointmentsComponent)
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
        loadComponent: () => import('./features/workspace/workspace.component').then(m => m.WorkspaceComponent)
      },
      {
        path: 'nurse/patients.component',
        loadComponent: () => import('./features/nurse/patients.component').then(m => m.NursePatients)
      },
      {
        path: 'nurse/rounds',
        loadComponent: () => import('./features/nurse/rounds.component').then(m => m.NurseRounds)
      },
      {
        path: 'nurse/alerts',
        loadComponent: () => import('./features/nurse/alerts.component').then(m => m.NurseAlerts)
      },

      { path: 'admin/appointments', loadComponent: () => import('./features/appointments/appointments.component').then(m => m.AppointmentsComponent) },
      { path: 'patient/appointments', loadComponent: () => import('./features/appointments/appointments.component').then(m => m.AppointmentsComponent) },
      { path: 'admin/billing/new', loadComponent: () => import('./features/admin/create-invoice.component').then(m => m.CreateInvoiceComponent) },
      // Admin Portal
      {
        path: 'admin/dashboard.component',
        loadComponent: () => import('./features/workspace/workspace.component').then(m => m.WorkspaceComponent)
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
        loadComponent: () => import('./features/workspace/workspace.component').then(m => m.WorkspaceComponent)
      },
      {
        path: 'patient/book.component',
        loadComponent: () => import('./features/patient/book.component').then(m => m.PatientBook)
      },
      {
        path: 'patient/queue.component',
        loadComponent: () => import('./features/appointments/appointments.component').then(m => m.AppointmentsComponent)
      },
      {
        path: 'patient/records',
        loadComponent: () => import('./features/patient/records.component').then(m => m.PatientRecords)
      },
      {
        path: 'patient/billing',
        loadComponent: () => import('./features/patient/billing.component').then(m => m.PatientBilling)
      },

      { path: 'cases', loadComponent: () => import('./features/case/cases.component').then(m => m.CasesComponent) },
      // Shared Cases Lifecycle detail route
      {
        path: 'cases/:id',
        loadComponent: () => import('./features/case/case-detail.component').then(m => m.CaseDetailComponent)
      },

      // Pharmacist Portal
      {
        path: 'pharmacist/dashboard.component',
        loadComponent: () => import('./features/workspace/workspace.component').then(m => m.WorkspaceComponent)
      },
      {
        path: 'pharmacist/dispensing',
        loadComponent: () => import('./features/pharmacist/dispensing.component').then(m => m.PharmacistDispensing)
      },
      {
        path: 'pharmacist/inventory',
        loadComponent: () => import('./features/pharmacist/inventory.component').then(m => m.PharmacistInventory)
      },

      // Lab Portal
      {
        path: 'lab/dashboard.component',
        loadComponent: () => import('./features/workspace/workspace.component').then(m => m.WorkspaceComponent)
      },
      {
        path: 'lab/samples',
        loadComponent: () => import('./features/lab/samples.component').then(m => m.LabSamples)
      },
      {
        path: 'lab/results',
        loadComponent: () => import('./features/lab/results.component').then(m => m.LabResults)
      }
    ]
  },
  { path: '**', redirectTo: 'login' }
];
