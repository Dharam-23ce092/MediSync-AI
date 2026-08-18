export interface NavigationItem {
  label: string;
  link: string;
  icon: string; // SVG icon shape or identifier
  tooltip: string;
}

export const ROLE_NAVIGATION: Record<string, NavigationItem[]> = {
  doctor: [
    {
      label: 'Doctor Dashboard',
      link: '/doctor/dashboard.component',
      icon: 'dashboard',
      tooltip: 'View today\'s vitals summary, follow-up checklist, and pending tasks'
    },
    {
      label: 'Patient Registry',
      link: '/doctor/patients.component',
      icon: 'patients',
      tooltip: 'Browse clinical histories, EHR profiles, and past medical records'
    },
    {
      label: 'Appointments',
      link: '/doctor/appointments',
      icon: 'appointments',
      tooltip: 'View your calendar, patient schedules, and time blocks'
    },
    {
      label: 'OPD Consultations',
      link: '/doctor/opd.component',
      icon: 'opd',
      tooltip: 'Access the outpatient consulting screen and patient queue'
    },
    {
      label: 'AI Workspace',
      link: '/doctor/ai-assistant.component',
      icon: 'ai',
      tooltip: 'Query clinical guidelines, search records, or generate SOAP summaries'
    }
  ],
  nurse: [
    {
      label: 'Nurse Dashboard',
      link: '/nurse/dashboard.component',
      icon: 'dashboard',
      tooltip: 'Monitor assigned ward beds, incoming vital logs, and pending tasks'
    },
    {
      label: 'My Patients',
      link: '/nurse/patients.component',
      icon: 'patients',
      tooltip: 'Manage assigned inpatient admission charts and details'
    },
    {
      label: 'Rounds Tracker',
      link: '/nurse/rounds',
      icon: 'rounds',
      tooltip: 'Log routine nursing checklists, fall risks, and medication schedules'
    },
    {
      label: 'Critical Alerts',
      link: '/nurse/alerts',
      icon: 'alerts',
      tooltip: 'View immediate telemetry notifications and physiological alerts'
    }
  ],
  admin: [
    {
      label: 'Command Center',
      link: '/admin/dashboard.component',
      icon: 'dashboard',
      tooltip: 'View live hospital metrics: occupancy, bed status, billing and OT'
    },
    {
      label: 'Bed Matrix Map',
      link: '/admin/beds.component',
      icon: 'beds',
      tooltip: 'Interactive room and bed allocation map (ICU, Wards, Private)'
    },
    {
      label: 'Departments',
      link: '/admin/departments',
      icon: 'departments',
      tooltip: 'Manage clinical units, doctor shifts, and operational rooms'
    },
    {
      label: 'Billing Cycle',
      link: '/admin/billing',
      icon: 'billing',
      tooltip: 'Manage itemized patient accounts, cash collections, and insurance claims'
    },
    {
      label: 'Audit Security Log',
      link: '/admin/audit.component',
      icon: 'audit',
      tooltip: 'HIPAA-compliant system access lists and activity logs'
    }
  ],
  patient: [
    {
      label: 'Patient Portal',
      link: '/patient/dashboard.component',
      icon: 'dashboard',
      tooltip: 'Overview of your health profile, prescriptions, and bills'
    },
    {
      label: 'Book Appointment',
      link: '/patient/book.component',
      icon: 'book',
      tooltip: 'Intelligently allocate a specialist based on symptoms and availability'
    },
    {
      label: 'Live Wait Queue',
      link: '/patient/queue.component',
      icon: 'queue',
      tooltip: 'Monitor token positions and live estimated consulting times'
    },
    {
      label: 'My Records',
      link: '/patient/records',
      icon: 'records',
      tooltip: 'Download lab reports, clinical notes, and active prescriptions'
    },
    {
      label: 'Bills & Receipts',
      link: '/patient/billing',
      icon: 'billing',
      tooltip: 'Verify itemized charges and pay outstanding balances online'
    }
  ],
  pharmacist: [
    {
      label: 'Pharmacy Console',
      link: '/pharmacist/dashboard.component',
      icon: 'dashboard',
      tooltip: 'Verify pending drug orders and check batch expirations'
    },
    {
      label: 'Prescription Queue',
      link: '/pharmacist/dispensing',
      icon: 'dispense',
      tooltip: 'Process and dispense doctor e-prescriptions with safety filters'
    },
    {
      label: 'Drug Inventory',
      link: '/pharmacist/inventory',
      icon: 'inventory',
      tooltip: 'Monitor stock levels, batch numbers, and supplier requests'
    }
  ],
  lab: [
    {
      label: 'LIS Console',
      link: '/lab/dashboard.component',
      icon: 'dashboard',
      tooltip: 'View incoming diagnostic orders, pending approvals, and sample runs'
    },
    {
      label: 'Sample Tracking',
      link: '/lab/samples',
      icon: 'samples',
      tooltip: 'Manage barcodes, collections, and status phases'
    },
    {
      label: 'Results Entry',
      link: '/lab/results',
      icon: 'results',
      tooltip: 'Input measurements and validate critical values'
    }
  ]
};
