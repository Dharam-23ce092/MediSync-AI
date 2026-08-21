import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { getApiBaseUrl } from '../../core/config/api.config';
import { AuthService } from '../../core/services/auth.service';

export interface StaffMember {
  id: string;
  email: string;
  name: string;
  role: string;
  specialty?: string;
  employee_id?: string;
  is_active: boolean;
  created_at: string;
  department_id?: string;
  department_name?: string;
  department_code?: string;
}

export interface DepartmentOption {
  id: string;
  name: string;
  code: string;
}

@Component({
  selector: 'app-admin-staff',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './staff.component.html',
  styleUrl: './staff.component.css'
})
export class AdminStaff implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  readonly staffList = signal<StaffMember[]>([]);
  readonly departments = signal<DepartmentOption[]>([]);
  readonly isLoading = signal(true);
  readonly isUploading = signal(false);
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Search & Filters
  searchQuery = '';
  selectedRole = 'ALL';

  // File upload fields
  selectedFile: File | null = null;
  readonly dragOver = signal(false);

  // Add / Edit Modal
  readonly showModal = signal(false);
  readonly isEditMode = signal(false);
  selectedStaffId: string | null = null;
  staffForm = {
    name: '',
    email: '',
    password: '',
    role: 'doctor',
    department_id: '',
    specialty: '',
    employee_id: ''
  };

  // Delete Modal
  readonly staffToDelete = signal<StaffMember | null>(null);

  readonly filteredStaff = computed(() => {
    let list = this.staffList();
    if (this.selectedRole !== 'ALL') {
      list = list.filter(s => s.role.toLowerCase() === this.selectedRole.toLowerCase());
    }
    const q = this.searchQuery.toLowerCase().trim();
    if (!q) return list;
    return list.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      (s.employee_id && s.employee_id.toLowerCase().includes(q)) ||
      (s.specialty && s.specialty.toLowerCase().includes(q)) ||
      (s.department_name && s.department_name.toLowerCase().includes(q))
    );
  });

  ngOnInit(): void {
    this.fetchStaff();
    this.fetchDepartments();
  }

  get token(): string | null {
    return this.authService.getToken();
  }

  get headers(): HttpHeaders {
    return new HttpHeaders({
      'Authorization': `Bearer ${this.token}`
    });
  }

  async fetchStaff(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const url = `${getApiBaseUrl()}/staff`;
      const response = await this.http.get<{ success: boolean, data: StaffMember[] }>(url, { headers: this.headers }).toPromise();
      if (response && response.success) {
        this.staffList.set(response.data);
      }
    } catch (err: any) {
      console.error('Error fetching staff list:', err);
      this.errorMessage.set('Failed to load staff list. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async fetchDepartments(): Promise<void> {
    try {
      const url = `${getApiBaseUrl()}/departments`;
      const response = await this.http.get<{ success: boolean, data: DepartmentOption[] }>(url, { headers: this.headers }).toPromise();
      if (response && response.success) {
        this.departments.set(response.data);
      }
    } catch (err: any) {
      console.error('Error fetching departments:', err);
    }
  }

  openAddModal(): void {
    this.isEditMode.set(false);
    this.selectedStaffId = null;
    this.staffForm = {
      name: '',
      email: '',
      password: '',
      role: 'doctor',
      department_id: this.departments().length > 0 ? this.departments()[0].id : '',
      specialty: '',
      employee_id: `EMP-${Math.floor(100 + Math.random() * 900)}`
    };
    this.showModal.set(true);
  }

  openEditModal(member: StaffMember): void {
    this.isEditMode.set(true);
    this.selectedStaffId = member.id;
    this.staffForm = {
      name: member.name,
      email: member.email,
      password: '',
      role: member.role,
      department_id: member.department_id || '',
      specialty: member.specialty || '',
      employee_id: member.employee_id || ''
    };
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
  }

  async saveStaff(): Promise<void> {
    if (!this.staffForm.name || !this.staffForm.email || !this.staffForm.role) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    try {
      if (this.isEditMode() && this.selectedStaffId) {
        const url = `${getApiBaseUrl()}/staff/${this.selectedStaffId}`;
        const response = await this.http.put<{ success: boolean, message: string, data: StaffMember }>(url, this.staffForm, { headers: this.headers }).toPromise();
        if (response && response.success) {
          this.successMessage.set('Staff member updated successfully.');
          this.closeModal();
          this.fetchStaff();
        }
      } else {
        const url = `${getApiBaseUrl()}/staff`;
        const response = await this.http.post<{ success: boolean, message: string, data: StaffMember }>(url, this.staffForm, { headers: this.headers }).toPromise();
        if (response && response.success) {
          this.successMessage.set('Staff member added successfully.');
          this.closeModal();
          this.fetchStaff();
        }
      }
    } catch (err: any) {
      console.error('Error saving staff member:', err);
      this.errorMessage.set(err.error?.message || 'Failed to save staff member.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  confirmDelete(member: StaffMember): void {
    this.staffToDelete.set(member);
  }

  async deleteStaff(): Promise<void> {
    const member = this.staffToDelete();
    if (!member) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    try {
      const url = `${getApiBaseUrl()}/staff/${member.id}`;
      const response = await this.http.delete<{ success: boolean, message: string }>(url, { headers: this.headers }).toPromise();
      if (response && response.success) {
        this.successMessage.set(`Staff member ${member.name} removed from hospital roster.`);
        this.staffToDelete.set(null);
        this.fetchStaff();
      }
    } catch (err: any) {
      console.error('Error deleting staff member:', err);
      this.errorMessage.set(err.error?.message || 'Failed to delete staff member.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  // File Selection
  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      this.errorMessage.set(null);
      this.successMessage.set(null);
    }
  }

  // Drag and Drop handlers
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.selectedFile = files[0];
      this.errorMessage.set(null);
      this.successMessage.set(null);
    }
  }

  // Upload CSV
  async uploadCSV(): Promise<void> {
    if (!this.selectedFile) {
      this.errorMessage.set('Please select a staff CSV file first');
      return;
    }

    this.isUploading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const formData = new FormData();
    formData.append('file', this.selectedFile);

    try {
      const url = `${getApiBaseUrl()}/staff/import`;
      const response = await this.http.post<any>(url, formData, { headers: this.headers }).toPromise();

      if (response && response.success) {
        this.successMessage.set(response.message || 'Staff bulk imported successfully.');
        this.selectedFile = null;
        this.fetchStaff();
      } else {
        this.errorMessage.set(response?.message || 'Import failed.');
      }
    } catch (err: any) {
      console.error('Error uploading CSV:', err);
      if (err instanceof HttpErrorResponse) {
        this.errorMessage.set(err.error?.message || 'Failed to upload CSV file.');
      } else {
        this.errorMessage.set('An unexpected error occurred.');
      }
    } finally {
      this.isUploading.set(false);
    }
  }

  // Toggle active/inactive state
  async toggleStaffStatus(member: StaffMember): Promise<void> {
    if (member.id === this.authService.currentUser()?.userId) {
      this.errorMessage.set('You cannot deactivate your own account.');
      return;
    }

    this.errorMessage.set(null);
    this.successMessage.set(null);

    try {
      const url = `${getApiBaseUrl()}/staff/${member.id}/toggle`;
      const response = await this.http.patch<{ success: boolean, message: string }>(url, {}, { headers: this.headers }).toPromise();
      if (response && response.success) {
        this.staffList.update(list =>
          list.map(s => s.id === member.id ? { ...s, is_active: !s.is_active } : s)
        );
        this.successMessage.set(response.message);
      }
    } catch (err: any) {
      console.error('Error toggling staff status:', err);
      this.errorMessage.set(err.error?.message || 'Failed to update status.');
    }
  }

  downloadSampleCSV(): void {
    const csvContent = 'name,email,role,department,specialty,employee_id\n' +
      'Dr. Sameer Joshi,sameer.joshi@hospital.org,doctor,Cardiology,Interventional Cardiology,EMP-201\n' +
      'Nurse Priya Nair,priya.nair@hospital.org,nurse,Nursing & Wards,ICU Specialist,EMP-202\n' +
      'Vikram Shah,vikram.shah@hospital.org,pharmacist,Pharmacy,Clinical Dispensing,EMP-203\n' +
      'Dr. Ritu Sen,ritu.sen@hospital.org,lab,Laboratory Services,Microbiology,EMP-204\n' +
      'Neha Kapoor,neha.kapoor@hospital.org,receptionist,General Medicine,Patient Admissions,EMP-205';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'medisync_staff_sample.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
