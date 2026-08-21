import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { getApiBaseUrl } from '../../core/config/api.config';
import { AuthService } from '../../core/services/auth.service';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';

export interface Department {
  id: string;
  hospital_id?: string;
  name: string;
  code: string;
  description?: string;
  staff_count?: string | number;
  doctors_count?: string | number;
  beds_count?: string | number;
  occupied_beds_count?: string | number;
}

@Component({
  selector: 'app-admin-departments',
  standalone: true,
  imports: [CommonModule, FormsModule, TooltipDirective],
  template: `
    <div class="departments-container animate-fade">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Departments & Clinical Units</h1>
          <p class="page-sub">Manage specialized hospital wings, clinical wards, and operational capacities.</p>
        </div>
        <button class="btn-primary-action" (click)="openAddModal()">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Add Department
        </button>
      </div>

      <!-- Notification Alerts -->
      <div class="alert-banner alert-success" *ngIf="successMessage()">
        <span>✓ {{ successMessage() }}</span>
        <button class="alert-close" (click)="successMessage.set(null)">×</button>
      </div>
      <div class="alert-banner alert-error" *ngIf="errorMessage()">
        <span>⚠ {{ errorMessage() }}</span>
        <button class="alert-close" (click)="errorMessage.set(null)">×</button>
      </div>

      <!-- KPI Metric Cards -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-icon-wrap bg-teal">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Total Departments</span>
            <h2 class="kpi-val">{{ departments().length }}</h2>
            <span class="kpi-hint">Clinical & Diagnostic Units</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-wrap bg-blue">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Active Doctors</span>
            <h2 class="kpi-val">{{ totalDoctors() }}</h2>
            <span class="kpi-hint">Assigned across wings</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-wrap bg-purple">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"></path><path d="M2 8h18a2 2 0 0 1 2 2v10"></path><path d="M2 17h20"></path><path d="M6 8v9"></path></svg>
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Total Inpatient Beds</span>
            <h2 class="kpi-val">{{ totalBeds() }}</h2>
            <span class="kpi-hint">{{ occupiedBeds() }} occupied</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-wrap bg-emerald">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Clinical Staff</span>
            <h2 class="kpi-val">{{ totalStaff() }}</h2>
            <span class="kpi-hint">Nurses & Technicians</span>
          </div>
        </div>
      </div>

      <!-- Search & Filters -->
      <div class="search-bar-row">
        <div class="search-input-wrapper">
          <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input 
            type="text" 
            placeholder="Search by department name, code, or description..." 
            [(ngModel)]="searchQuery" 
            class="search-input"
          />
        </div>
      </div>

      <!-- Loading State -->
      <div class="loading-state" *ngIf="isLoading()">
        <div class="spinner"></div>
        <p>Loading departments...</p>
      </div>

      <!-- Departments Grid -->
      <div class="dept-grid" *ngIf="!isLoading()">
        <div class="dept-card" *ngFor="let dept of filteredDepartments()">
          <div class="dept-card-header">
            <div class="dept-title-group">
              <span class="dept-code-badge">{{ dept.code }}</span>
              <h3 class="dept-name">{{ dept.name }}</h3>
            </div>
            <div class="dept-card-actions">
              <button class="action-icon-btn edit-btn" (click)="openEditModal(dept)" appTooltip="Edit Department" tooltipPosition="top">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <button class="action-icon-btn delete-btn" (click)="confirmDelete(dept)" appTooltip="Delete Department" tooltipPosition="top">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>

          <p class="dept-desc">{{ dept.description || 'Clinical specialty and patient care wing.' }}</p>

          <div class="dept-stats-row">
            <div class="dept-stat-item">
              <span class="stat-icon-svg text-blue">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </span>
              <div>
                <span class="stat-val">{{ dept.doctors_count || 0 }}</span>
                <span class="stat-lbl">Doctors</span>
              </div>
            </div>

            <div class="dept-stat-item">
              <span class="stat-icon-svg text-emerald">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
              </span>
              <div>
                <span class="stat-val">{{ dept.staff_count || 0 }}</span>
                <span class="stat-lbl">Staff</span>
              </div>
            </div>

            <div class="dept-stat-item">
              <span class="stat-icon-svg text-purple">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"></path><path d="M2 8h18a2 2 0 0 1 2 2v10"></path><path d="M2 17h20"></path><path d="M6 8v9"></path></svg>
              </span>
              <div>
                <span class="stat-val">{{ dept.beds_count || 0 }}</span>
                <span class="stat-lbl">Total Beds</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div class="empty-state" *ngIf="filteredDepartments().length === 0">
          <div class="empty-icon-svg text-muted">
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
          </div>
          <h3>No Departments Found</h3>
          <p>No departments match your current filter query.</p>
        </div>
      </div>

      <!-- Add/Edit Department Modal -->
      <div class="modal-backdrop" *ngIf="showModal()">
        <div class="modal-card animate-scale">
          <div class="modal-header">
            <h2 class="modal-title">{{ isEditMode() ? 'Edit Department' : 'Add New Department' }}</h2>
            <button class="modal-close-btn" (click)="closeModal()">×</button>
          </div>

          <form (ngSubmit)="saveDepartment()" class="modal-body">
            <div class="form-group">
              <label class="form-label">Department Name <span class="required">*</span></label>
              <input 
                type="text" 
                [(ngModel)]="formData.name" 
                name="name" 
                required 
                placeholder="e.g. Cardiology & Vascular Sciences" 
                class="form-input"
              />
            </div>

            <div class="form-group">
              <label class="form-label">Department Code (Uppercase) <span class="required">*</span></label>
              <input 
                type="text" 
                [(ngModel)]="formData.code" 
                name="code" 
                required 
                maxlength="10" 
                placeholder="e.g. CARD" 
                class="form-input text-uppercase"
              />
            </div>

            <div class="form-group">
              <label class="form-label">Description</label>
              <textarea 
                [(ngModel)]="formData.description" 
                name="description" 
                rows="3" 
                placeholder="Enter description of clinical services provided..." 
                class="form-input form-textarea"
              ></textarea>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn-cancel" (click)="closeModal()">Cancel</button>
              <button type="submit" class="btn-submit" [disabled]="isSubmitting() || !formData.name || !formData.code">
                {{ isSubmitting() ? 'Saving...' : (isEditMode() ? 'Update Department' : 'Create Department') }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Delete Confirmation Modal -->
      <div class="modal-backdrop" *ngIf="deptToDelete()">
        <div class="modal-card modal-delete animate-scale">
          <div class="modal-header">
            <h2 class="modal-title text-danger">Delete Department</h2>
            <button class="modal-close-btn" (click)="deptToDelete.set(null)">×</button>
          </div>
          <div class="modal-body">
            <p>Are you sure you want to delete department <strong>{{ deptToDelete()?.name }}</strong> ({{ deptToDelete()?.code }})?</p>
            <p class="modal-warning-subtext">This action cannot be undone. Make sure no staff or active beds are allocated to this unit.</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-cancel" (click)="deptToDelete.set(null)">Cancel</button>
            <button type="button" class="btn-delete" [disabled]="isSubmitting()" (click)="deleteDepartment()">
              {{ isSubmitting() ? 'Deleting...' : 'Delete Department' }}
            </button>
          </div>
        </div>
      </div>

    </div>
  `,
  styles: `
    .departments-container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      padding: 0.5rem 0;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .page-title {
      font-size: 1.6rem;
      font-weight: 800;
      color: var(--color-text-primary);
      margin: 0 0 0.25rem;
      letter-spacing: -0.5px;
    }

    .page-sub {
      color: var(--color-text-secondary);
      font-size: 0.9rem;
      margin: 0;
    }

    .btn-primary-action {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%);
      color: #ffffff;
      border: none;
      padding: 0.75rem 1.25rem;
      border-radius: 10px;
      font-weight: 600;
      font-size: 0.9rem;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(14, 165, 233, 0.3);
      transition: all 0.2s ease;
    }

    .btn-primary-action:hover {
      background: linear-gradient(135deg, #38BDF8 0%, #0EA5E9 100%);
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(14, 165, 233, 0.4);
    }

    /* Alerts */
    .alert-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.85rem 1.25rem;
      border-radius: 10px;
      font-size: 0.9rem;
      font-weight: 500;
    }

    .alert-success {
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.25);
      color: #34d399;
    }

    .alert-error {
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.25);
      color: #f87171;
    }

    .alert-close {
      background: none;
      border: none;
      color: inherit;
      font-size: 1.25rem;
      cursor: pointer;
    }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
    }

    .kpi-card {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: 14px;
      padding: 1.25rem;
      display: flex;
      align-items: center;
      gap: 1rem;
      box-shadow: var(--color-card-shadow);
      transition: all 0.2s ease;
    }

    .kpi-card:hover {
      border-color: rgba(14, 165, 233, 0.4);
      transform: translateY(-2px);
    }

    .kpi-icon-wrap {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.4rem;
    }

    .bg-teal { background: rgba(14, 165, 233, 0.15); color: #38bdf8; }
    .bg-blue { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .bg-purple { background: rgba(168, 85, 247, 0.15); color: #c084fc; }
    .bg-emerald { background: rgba(16, 185, 129, 0.15); color: #34d399; }

    .kpi-info {
      display: flex;
      flex-direction: column;
    }

    .kpi-label {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .kpi-val {
      font-size: 1.6rem;
      font-weight: 800;
      color: var(--color-text-primary);
      margin: 0.1rem 0;
      line-height: 1.1;
    }

    .kpi-hint {
      font-size: 0.75rem;
      color: var(--color-text-secondary);
    }

    /* Search row */
    .search-bar-row {
      display: flex;
      gap: 1rem;
      align-items: center;
    }

    .search-input-wrapper {
      position: relative;
      flex: 1;
    }

    .search-icon {
      position: absolute;
      left: 1rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--color-text-muted);
      pointer-events: none;
    }

    .search-input {
      width: 100%;
      padding: 0.8rem 1rem 0.8rem 2.8rem;
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: 12px;
      color: var(--color-text-primary);
      font-size: 0.9rem;
      outline: none;
      transition: all 0.2s ease;
      box-sizing: border-box;
    }

    .search-input:focus {
      border-color: #0EA5E9;
      box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.3);
    }

    /* Departments Grid */
    .dept-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1.25rem;
    }

    .dept-card {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: 14px;
      padding: 1.5rem;
      box-shadow: var(--color-card-shadow);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: all 0.25s ease;
      position: relative;
      overflow: hidden;
    }

    .dept-card:hover {
      border-color: rgba(14, 165, 233, 0.4);
      transform: translateY(-3px);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    }

    .dept-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.75rem;
    }

    .dept-title-group {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .dept-code-badge {
      display: inline-block;
      width: fit-content;
      padding: 0.2rem 0.6rem;
      background: rgba(14, 165, 233, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.25);
      color: #38bdf8;
      border-radius: 6px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.5px;
    }

    .dept-name {
      font-size: 1.15rem;
      font-weight: 750;
      color: var(--color-text-primary);
      margin: 0;
      line-height: 1.3;
    }

    .dept-card-actions {
      display: flex;
      gap: 0.4rem;
    }

    .action-icon-btn {
      background: var(--color-bg-surface-hover);
      border: 1px solid var(--color-border);
      color: var(--color-text-secondary);
      border-radius: 8px;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .edit-btn:hover {
      color: #38bdf8;
      border-color: #38bdf8;
      background: rgba(14, 165, 233, 0.1);
    }

    .delete-btn {
      background: rgba(239, 68, 68, 0.12);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.28);
    }

    .delete-btn:hover {
      background: rgba(239, 68, 68, 0.25);
      border-color: rgba(239, 68, 68, 0.5);
      color: #fca5a5;
    }

    .dept-desc {
      font-size: 0.85rem;
      color: var(--color-text-secondary);
      line-height: 1.5;
      margin: 0 0 1.25rem;
      flex-grow: 1;
    }

    .dept-stats-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.5rem;
      padding-top: 1rem;
      border-top: 1px solid var(--color-border);
    }

    .dept-stat-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .stat-icon {
      font-size: 1.1rem;
    }

    .stat-val {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--color-text-primary);
      display: block;
      line-height: 1;
    }

    .stat-lbl {
      font-size: 0.7rem;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    /* Modals */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(4px);
      z-index: 999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }

    .modal-card {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: 16px;
      width: 100%;
      max-width: 500px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      overflow: hidden;
    }

    .modal-header {
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid var(--color-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-title {
      font-size: 1.25rem;
      font-weight: 750;
      color: var(--color-text-primary);
      margin: 0;
    }

    .modal-close-btn {
      background: none;
      border: none;
      font-size: 1.5rem;
      color: var(--color-text-muted);
      cursor: pointer;
    }

    .modal-body {
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .form-label {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--color-text-secondary);
    }

    .required {
      color: #f87171;
    }

    .form-input {
      padding: 0.8rem 1rem;
      background: var(--color-bg-surface-hover);
      border: 1px solid var(--color-border);
      border-radius: 10px;
      color: var(--color-text-primary);
      font-size: 0.9rem;
      outline: none;
      transition: all 0.2s ease;
    }

    .form-input:focus {
      border-color: #0EA5E9;
      box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.3);
    }

    .text-uppercase {
      text-transform: uppercase;
    }

    .form-textarea {
      resize: vertical;
      min-height: 80px;
      font-family: inherit;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      margin-top: 0.5rem;
    }

    .btn-cancel {
      padding: 0.75rem 1.25rem;
      background: var(--color-bg-surface-hover);
      border: 1px solid var(--color-border);
      color: var(--color-text-primary);
      border-radius: 10px;
      font-weight: 600;
      cursor: pointer;
    }

    .btn-submit {
      padding: 0.75rem 1.25rem;
      background: linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%);
      color: #ffffff;
      border: none;
      border-radius: 10px;
      font-weight: 600;
      cursor: pointer;
    }

    .btn-submit:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-delete {
      padding: 0.75rem 1.25rem;
      background: rgba(239, 68, 68, 0.18);
      color: #fca5a5;
      border: 1px solid rgba(239, 68, 68, 0.38);
      border-radius: 10px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-delete:hover {
      background: rgba(239, 68, 68, 0.32);
      border-color: #f87171;
      color: #ffffff;
    }

    .text-danger { color: #f87171; }
    .modal-warning-subtext {
      font-size: 0.82rem;
      color: var(--color-text-muted);
      margin-top: 0.5rem;
    }

    .empty-state {
      grid-column: 1 / -1;
      padding: 3rem;
      text-align: center;
      background: var(--color-bg-surface);
      border: 1px dashed var(--color-border);
      border-radius: 14px;
    }

    .empty-icon { font-size: 2.5rem; }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem;
      gap: 1rem;
      color: var(--color-text-secondary);
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid rgba(14, 165, 233, 0.2);
      border-top-color: #0EA5E9;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `
})
export class AdminDepartments implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  readonly departments = signal<Department[]>([]);
  readonly isLoading = signal(true);
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  searchQuery = '';

  // Modal State
  readonly showModal = signal(false);
  readonly isEditMode = signal(false);
  selectedDeptId: string | null = null;
  formData = {
    name: '',
    code: '',
    description: ''
  };

  // Delete State
  readonly deptToDelete = signal<Department | null>(null);

  // Computed metrics
  readonly totalDoctors = computed(() => {
    return this.departments().reduce((sum, d) => sum + Number(d.doctors_count || 0), 0);
  });

  readonly totalStaff = computed(() => {
    return this.departments().reduce((sum, d) => sum + Number(d.staff_count || 0), 0);
  });

  readonly totalBeds = computed(() => {
    return this.departments().reduce((sum, d) => sum + Number(d.beds_count || 0), 0);
  });

  readonly occupiedBeds = computed(() => {
    return this.departments().reduce((sum, d) => sum + Number(d.occupied_beds_count || 0), 0);
  });

  readonly filteredDepartments = computed(() => {
    const query = this.searchQuery.toLowerCase().trim();
    if (!query) return this.departments();
    return this.departments().filter(d =>
      d.name.toLowerCase().includes(query) ||
      d.code.toLowerCase().includes(query) ||
      (d.description && d.description.toLowerCase().includes(query))
    );
  });

  ngOnInit(): void {
    this.fetchDepartments();
  }

  get headers(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
  }

  async fetchDepartments(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const url = `${getApiBaseUrl()}/departments`;
      const response = await this.http.get<{ success: boolean, data: Department[] }>(url, { headers: this.headers }).toPromise();
      if (response && response.success) {
        this.departments.set(response.data);
      }
    } catch (err: any) {
      console.error('Error fetching departments:', err);
      this.errorMessage.set('Failed to load departments.');
    } finally {
      this.isLoading.set(false);
    }
  }

  openAddModal(): void {
    this.isEditMode.set(false);
    this.selectedDeptId = null;
    this.formData = { name: '', code: '', description: '' };
    this.showModal.set(true);
  }

  openEditModal(dept: Department): void {
    this.isEditMode.set(true);
    this.selectedDeptId = dept.id;
    this.formData = {
      name: dept.name,
      code: dept.code,
      description: dept.description || ''
    };
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
  }

  async saveDepartment(): Promise<void> {
    if (!this.formData.name || !this.formData.code) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    try {
      if (this.isEditMode() && this.selectedDeptId) {
        const url = `${getApiBaseUrl()}/departments/${this.selectedDeptId}`;
        const response = await this.http.put<{ success: boolean, message: string, data: Department }>(url, this.formData, { headers: this.headers }).toPromise();
        if (response && response.success) {
          this.successMessage.set('Department updated successfully.');
          this.closeModal();
          this.fetchDepartments();
        }
      } else {
        const url = `${getApiBaseUrl()}/departments`;
        const response = await this.http.post<{ success: boolean, message: string, data: Department }>(url, this.formData, { headers: this.headers }).toPromise();
        if (response && response.success) {
          this.successMessage.set('Department created successfully.');
          this.closeModal();
          this.fetchDepartments();
        }
      }
    } catch (err: any) {
      console.error('Error saving department:', err);
      this.errorMessage.set(err.error?.message || 'Failed to save department.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  confirmDelete(dept: Department): void {
    this.deptToDelete.set(dept);
  }

  async deleteDepartment(): Promise<void> {
    const dept = this.deptToDelete();
    if (!dept) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    try {
      const url = `${getApiBaseUrl()}/departments/${dept.id}`;
      const response = await this.http.delete<{ success: boolean, message: string }>(url, { headers: this.headers }).toPromise();
      if (response && response.success) {
        this.successMessage.set('Department deleted successfully.');
        this.deptToDelete.set(null);
        this.fetchDepartments();
      }
    } catch (err: any) {
      console.error('Error deleting department:', err);
      this.errorMessage.set(err.error?.message || 'Failed to delete department.');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
