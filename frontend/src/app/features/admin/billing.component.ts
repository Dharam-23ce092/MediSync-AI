import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { getApiBaseUrl } from '../../core/config/api.config';
import { AuthService } from '../../core/services/auth.service';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';

export interface InvoiceItem {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface PaymentRecord {
  id?: string;
  amount: number;
  paymentMethod: string;
  transactionReference: string;
  date: string;
}

export interface Invoice {
  id: string;
  name: string;
  uhid: string;
  invoiceNumber: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
  status: 'PAID' | 'PENDING' | 'PARTIAL' | 'OVERDUE';
  date: string;
  items?: InvoiceItem[];
  payments?: PaymentRecord[];
}

@Component({
  selector: 'app-admin-billing',
  standalone: true,
  imports: [CommonModule, FormsModule, TooltipDirective],
  template: `
    <div class="billing-container animate-fade">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Hospital Billing & Accounts</h1>
          <p class="page-sub">Comprehensive revenue cycles, patient accounts, collections, and financial invoices.</p>
        </div>
        <div class="header-actions">
          <button class="btn-primary-action" (click)="openCreateInvoiceModal()">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Generate Invoice
          </button>
        </div>
      </div>

      <!-- Alerts -->
      <div class="alert-banner alert-success" *ngIf="successMessage()">
        <span>✓ {{ successMessage() }}</span>
        <button class="alert-close" (click)="successMessage.set(null)">×</button>
      </div>
      <div class="alert-banner alert-error" *ngIf="errorMessage()">
        <span>⚠ {{ errorMessage() }}</span>
        <button class="alert-close" (click)="errorMessage.set(null)">×</button>
      </div>

      <!-- Financial KPI Cards -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-icon-wrap bg-teal">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Total Invoiced</span>
            <h2 class="kpi-val">₹{{ totalInvoiced().toLocaleString('en-IN') }}</h2>
            <span class="kpi-hint">{{ invoices().length }} total bills generated</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-wrap bg-emerald">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Total Collected</span>
            <h2 class="kpi-val">₹{{ totalCollected().toLocaleString('en-IN') }}</h2>
            <span class="kpi-hint">{{ collectionRate() }}% collection rate</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-wrap bg-rose">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Outstanding Receivables</span>
            <h2 class="kpi-val">₹{{ totalOutstanding().toLocaleString('en-IN') }}</h2>
            <span class="kpi-hint">{{ pendingInvoicesCount() }} pending invoices</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-wrap bg-blue">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Settled Invoices</span>
            <h2 class="kpi-val">{{ paidInvoicesCount() }}</h2>
            <span class="kpi-hint">of {{ invoices().length }} accounts closed</span>
          </div>
        </div>
      </div>

      <!-- Filter and Search Row -->
      <div class="controls-row">
        <div class="search-input-wrapper">
          <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input 
            type="text" 
            placeholder="Search by Patient Name, UHID, or Invoice #..." 
            [(ngModel)]="searchQuery" 
            class="search-input"
          />
        </div>

        <div class="status-filters">
          <button 
            class="filter-pill" 
            [class.active]="selectedStatus === 'ALL'" 
            (click)="selectedStatus = 'ALL'"
          >
            All ({{ invoices().length }})
          </button>
          <button 
            class="filter-pill pill-paid" 
            [class.active]="selectedStatus === 'PAID'" 
            (click)="selectedStatus = 'PAID'"
          >
            Paid ({{ paidInvoicesCount() }})
          </button>
          <button 
            class="filter-pill pill-pending" 
            [class.active]="selectedStatus === 'PENDING'" 
            (click)="selectedStatus = 'PENDING'"
          >
            Pending ({{ pendingInvoicesCount() }})
          </button>
          <button 
            class="filter-pill pill-partial" 
            [class.active]="selectedStatus === 'PARTIAL'" 
            (click)="selectedStatus = 'PARTIAL'"
          >
            Partial ({{ partialInvoicesCount() }})
          </button>
        </div>
      </div>

      <!-- Invoices Table -->
      <div class="table-card">
        <div class="loading-state" *ngIf="isLoading()">
          <div class="spinner"></div>
          <p>Loading invoice records...</p>
        </div>

        <div class="table-responsive" *ngIf="!isLoading()">
          <table class="data-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Patient Details</th>
                <th>Date</th>
                <th>Total Bill</th>
                <th>Amount Paid</th>
                <th>Balance Due</th>
                <th>Status</th>
                <th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let inv of filteredInvoices()">
                <td>
                  <span class="invoice-badge">{{ inv.invoiceNumber }}</span>
                </td>
                <td>
                  <div class="patient-cell">
                    <span class="patient-name">{{ inv.name }}</span>
                    <span class="patient-uhid">{{ inv.uhid }}</span>
                  </div>
                </td>
                <td class="date-cell">{{ inv.date }}</td>
                <td class="font-bold">₹{{ Number(inv.total).toLocaleString('en-IN') }}</td>
                <td class="text-success font-medium">₹{{ Number(inv.paid).toLocaleString('en-IN') }}</td>
                <td class="font-bold" [class.text-danger]="Number(inv.balance) > 0">₹{{ Number(inv.balance).toLocaleString('en-IN') }}</td>
                <td>
                  <span class="status-badge status-{{ inv.status.toLowerCase() }}">{{ inv.status }}</span>
                </td>
                <td class="text-right">
                  <div class="actions-wrapper">
                    <button class="btn-view-invoice" (click)="viewInvoiceDetails(inv)" appTooltip="View Itemized Breakdown" tooltipPosition="top">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                      View
                    </button>
                    <button *ngIf="Number(inv.balance) > 0" class="btn-record-pay" (click)="openPaymentModal(inv)" appTooltip="Record Cash/Online Payment" tooltipPosition="top">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
                      Collect
                    </button>
                  </div>
                </td>
              </tr>

              <tr *ngIf="filteredInvoices().length === 0">
                <td colspan="8" class="text-center empty-cell">
                  <div class="empty-icon-svg text-muted">
                    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                  </div>
                  <p>No billing records found matching your filters.</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Itemized Invoice Details Modal -->
      <div class="modal-backdrop" *ngIf="selectedInvoice()">
        <div class="modal-card invoice-modal animate-scale">
          <div class="modal-header">
            <div>
              <span class="modal-tag">Patient Invoice Details</span>
              <h2 class="modal-title">{{ selectedInvoice()?.invoiceNumber }}</h2>
            </div>
            <button class="modal-close-btn" (click)="selectedInvoice.set(null)">×</button>
          </div>

          <div class="modal-body modal-scrollable">
            <!-- Patient summary ribbon -->
            <div class="invoice-summary-bar">
              <div>
                <span class="summary-lbl">Patient Name:</span>
                <strong class="summary-val">{{ selectedInvoice()?.name }}</strong>
              </div>
              <div>
                <span class="summary-lbl">UHID:</span>
                <strong class="summary-val">{{ selectedInvoice()?.uhid }}</strong>
              </div>
              <div>
                <span class="summary-lbl">Date:</span>
                <strong class="summary-val">{{ selectedInvoice()?.date }}</strong>
              </div>
              <div>
                <span class="summary-lbl">Account Status:</span>
                <span class="status-badge status-{{ selectedInvoice()?.status?.toLowerCase() }}">{{ selectedInvoice()?.status }}</span>
              </div>
            </div>

            <!-- Itemized list -->
            <h4 class="section-subhead">Itemized Medical Charges & Tariffs</h4>
            <table class="itemized-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th class="text-center">Qty</th>
                  <th class="text-right">Unit Rate</th>
                  <th class="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let item of invoiceItems()">
                  <td>{{ item.description }}</td>
                  <td class="text-center">{{ item.quantity }}</td>
                  <td class="text-right">₹{{ item.unitPrice }}</td>
                  <td class="text-right font-medium">₹{{ item.totalPrice }}</td>
                </tr>
                <tr *ngIf="invoiceItems().length === 0">
                  <td colspan="4" class="text-center text-muted">Standard Clinical Consultation & Diagnostics package</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="3" class="text-right font-semibold">Subtotal:</td>
                  <td class="text-right font-semibold">₹{{ selectedInvoice()?.subtotal || selectedInvoice()?.total }}</td>
                </tr>
                <tr *ngIf="Number(selectedInvoice()?.discount) > 0">
                  <td colspan="3" class="text-right text-muted">Discount Applied:</td>
                  <td class="text-right text-success">-₹{{ selectedInvoice()?.discount }}</td>
                </tr>
                <tr *ngIf="Number(selectedInvoice()?.tax) > 0">
                  <td colspan="3" class="text-right text-muted">GST / Tax:</td>
                  <td class="text-right">+₹{{ selectedInvoice()?.tax }}</td>
                </tr>
                <tr class="total-row">
                  <td colspan="3" class="text-right font-bold">Grand Total:</td>
                  <td class="text-right font-bold text-teal">₹{{ selectedInvoice()?.total }}</td>
                </tr>
                <tr>
                  <td colspan="3" class="text-right text-success font-medium">Total Paid:</td>
                  <td class="text-right text-success font-medium">₹{{ selectedInvoice()?.paid }}</td>
                </tr>
                <tr class="balance-row">
                  <td colspan="3" class="text-right font-bold text-danger">Balance Due:</td>
                  <td class="text-right font-bold text-danger">₹{{ selectedInvoice()?.balance }}</td>
                </tr>
              </tfoot>
            </table>

            <!-- Payment Transactions -->
            <div class="payments-section" *ngIf="invoicePayments().length > 0">
              <h4 class="section-subhead">Recorded Payment Transactions</h4>
              <div class="payment-pills-list">
                <div class="payment-record-card" *ngFor="let p of invoicePayments()">
                  <div class="p-left">
                    <span class="p-method">{{ p.paymentMethod }}</span>
                    <span class="p-ref">Ref: {{ p.transactionReference || 'CASH-REC' }}</span>
                  </div>
                  <div class="p-right">
                    <span class="p-amount">₹{{ p.amount }}</span>
                    <span class="p-date">{{ p.date }}</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div class="modal-footer">
            <button class="btn-cancel" (click)="selectedInvoice.set(null)">Close</button>
            <button *ngIf="Number(selectedInvoice()?.balance) > 0" class="btn-submit" (click)="openPaymentModal(selectedInvoice()!)">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
              Collect Payment
            </button>
          </div>
        </div>
      </div>

      <!-- Record Payment Modal -->
      <div class="modal-backdrop" *ngIf="paymentTarget()">
        <div class="modal-card animate-scale">
          <div class="modal-header">
            <div>
              <span class="modal-tag">Process Payment</span>
              <h2 class="modal-title">Record Patient Payment</h2>
            </div>
            <button class="modal-close-btn" (click)="paymentTarget.set(null)">×</button>
          </div>

          <form (ngSubmit)="submitPayment()" class="modal-body">
            <div class="payment-summary-box">
              <span>Patient: <strong>{{ paymentTarget()?.name }}</strong> ({{ paymentTarget()?.uhid }})</span>
              <span>Invoice: <strong>{{ paymentTarget()?.invoiceNumber }}</strong></span>
              <span class="text-danger font-bold">Outstanding Due: ₹{{ paymentTarget()?.balance }}</span>
            </div>

            <div class="form-group">
              <label class="form-label">Payment Amount (₹) <span class="required">*</span></label>
              <input 
                type="number" 
                [(ngModel)]="paymentForm.amount" 
                name="amount" 
                required 
                min="1" 
                [max]="Number(paymentTarget()?.balance || 0)" 
                class="form-input font-bold"
              />
            </div>

            <div class="form-group">
              <label class="form-label">Payment Method <span class="required">*</span></label>
              <select [(ngModel)]="paymentForm.paymentMethod" name="paymentMethod" class="form-input">
                <option value="CASH">Cash Counter</option>
                <option value="UPI">UPI / QR Code</option>
                <option value="CARD">Credit / Debit Card</option>
                <option value="NETBANKING">Net Banking</option>
                <option value="INSURANCE">Insurance TPA Settlement</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Transaction Reference #</label>
              <input 
                type="text" 
                [(ngModel)]="paymentForm.transactionReference" 
                name="transactionReference" 
                placeholder="e.g. UPI-9283749823 / POS-REC-104" 
                class="form-input"
              />
            </div>

            <div class="modal-footer">
              <button type="button" class="btn-cancel" (click)="paymentTarget.set(null)">Cancel</button>
              <button type="submit" class="btn-submit" [disabled]="isSubmitting() || !paymentForm.amount || paymentForm.amount <= 0">
                {{ isSubmitting() ? 'Processing...' : 'Confirm Payment' }}
              </button>
            </div>
          </form>
        </div>
      </div>

    </div>
  `,
  styles: `
    .billing-container {
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
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
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
    .bg-emerald { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .bg-rose { background: rgba(244, 63, 94, 0.15); color: #fb7185; }
    .bg-blue { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }

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

    /* Controls */
    .controls-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .search-input-wrapper {
      position: relative;
      flex: 1;
      min-width: 280px;
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
      box-sizing: border-box;
      transition: all 0.2s ease;
    }

    .search-input:focus {
      border-color: #0EA5E9;
      box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.3);
    }

    .status-filters {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .filter-pill {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      color: var(--color-text-secondary);
      padding: 0.55rem 1rem;
      border-radius: 9999px;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .filter-pill:hover {
      border-color: #0EA5E9;
      color: var(--color-text-primary);
    }

    .filter-pill.active {
      background: #0EA5E9;
      color: #ffffff;
      border-color: #0EA5E9;
    }

    /* Table */
    .table-card {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: 14px;
      overflow: hidden;
      box-shadow: var(--color-card-shadow);
    }

    .table-responsive {
      overflow-x: auto;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.88rem;
    }

    .data-table th {
      background: var(--color-bg-surface-hover);
      padding: 0.9rem 1.25rem;
      font-weight: 700;
      color: var(--color-text-muted);
      text-transform: uppercase;
      font-size: 0.75rem;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--color-border);
    }

    .data-table td {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--color-border);
      color: var(--color-text-primary);
    }

    .data-table tr:last-child td {
      border-bottom: none;
    }

    .invoice-badge {
      font-family: monospace;
      font-weight: 700;
      color: #38bdf8;
      background: rgba(14, 165, 233, 0.1);
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
      border: 1px solid rgba(56, 189, 248, 0.2);
    }

    .patient-cell {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .patient-name {
      font-weight: 700;
      color: var(--color-text-primary);
    }

    .patient-uhid {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    .status-badge {
      padding: 0.3rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.4px;
      display: inline-block;
    }

    .status-paid { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .status-pending { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .status-partial { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
    .status-overdue { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }

    .actions-wrapper {
      display: inline-flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.5rem;
    }

    .btn-view-invoice, .btn-record-pay {
      padding: 0.4rem 0.8rem;
      border-radius: 8px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid var(--color-border);
      transition: all 0.2s ease;
    }

    .btn-view-invoice {
      background: var(--color-bg-surface-hover);
      color: var(--color-text-primary);
    }

    .btn-view-invoice:hover {
      border-color: #0EA5E9;
      color: #38bdf8;
    }

    .btn-record-pay {
      background: linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%);
      color: #ffffff;
      border: none;
    }

    .btn-record-pay:hover {
      background: linear-gradient(135deg, #38BDF8 0%, #0EA5E9 100%);
    }

    /* Modal */
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
      max-width: 650px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      overflow: hidden;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
    }

    .modal-header {
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid var(--color-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-tag {
      font-size: 0.75rem;
      font-weight: 700;
      color: #38bdf8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .modal-title {
      font-size: 1.3rem;
      font-weight: 800;
      color: var(--color-text-primary);
      margin: 0.1rem 0 0;
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

    .modal-scrollable {
      overflow-y: auto;
    }

    .invoice-summary-bar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 0.75rem;
      padding: 1rem;
      background: var(--color-bg-surface-hover);
      border: 1px solid var(--color-border);
      border-radius: 10px;
    }

    .summary-lbl {
      font-size: 0.72rem;
      color: var(--color-text-muted);
      display: block;
    }

    .summary-val {
      font-size: 0.9rem;
      color: var(--color-text-primary);
    }

    .section-subhead {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0.5rem 0 0;
    }

    .itemized-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }

    .itemized-table th {
      padding: 0.6rem 0.8rem;
      border-bottom: 1px solid var(--color-border);
      color: var(--color-text-muted);
      font-size: 0.75rem;
      text-transform: uppercase;
    }

    .itemized-table td {
      padding: 0.75rem 0.8rem;
      border-bottom: 1px solid var(--color-border);
      color: var(--color-text-primary);
    }

    .total-row td {
      font-size: 1rem;
      border-top: 2px solid var(--color-border);
    }

    .text-teal { color: #38bdf8; }
    .text-success { color: #34d399; }
    .text-danger { color: #f87171; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-bold { font-weight: 700; }
    .font-medium { font-weight: 500; }

    .payment-summary-box {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      padding: 1rem;
      background: rgba(14, 165, 233, 0.08);
      border: 1px solid rgba(56, 189, 248, 0.2);
      border-radius: 10px;
      font-size: 0.9rem;
    }

    .payment-record-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: var(--color-bg-surface-hover);
      border: 1px solid var(--color-border);
      border-radius: 10px;
      margin-top: 0.5rem;
    }

    .p-left { display: flex; flex-direction: column; gap: 0.2rem; }
    .p-method { font-weight: 700; font-size: 0.85rem; color: var(--color-text-primary); }
    .p-ref { font-size: 0.75rem; color: var(--color-text-muted); }
    .p-right { display: flex; flex-direction: column; align-items: flex-end; gap: 0.2rem; }
    .p-amount { font-weight: 700; color: #34d399; }
    .p-date { font-size: 0.72rem; color: var(--color-text-muted); }

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

    .required { color: #f87171; }

    .form-input {
      padding: 0.8rem 1rem;
      background: var(--color-bg-surface-hover);
      border: 1px solid var(--color-border);
      border-radius: 10px;
      color: var(--color-text-primary);
      font-size: 0.9rem;
      outline: none;
    }

    .form-input:focus {
      border-color: #0EA5E9;
      box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.3);
    }

    .modal-footer {
      padding: 1.25rem 1.5rem;
      border-top: 1px solid var(--color-border);
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
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

    .btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }

    .empty-cell { padding: 3rem !important; }
    .empty-icon { font-size: 2.5rem; display: block; margin-bottom: 0.5rem; }

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

    @keyframes spin { to { transform: rotate(360deg); } }
  `
})
export class AdminBilling implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  readonly invoices = signal<Invoice[]>([]);
  readonly isLoading = signal(true);
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  searchQuery = '';
  selectedStatus: 'ALL' | 'PAID' | 'PENDING' | 'PARTIAL' = 'ALL';

  // Modals State
  readonly selectedInvoice = signal<Invoice | null>(null);
  readonly invoiceItems = signal<InvoiceItem[]>([]);
  readonly invoicePayments = signal<PaymentRecord[]>([]);

  readonly paymentTarget = signal<Invoice | null>(null);
  paymentForm = {
    amount: 0,
    paymentMethod: 'CASH',
    transactionReference: ''
  };

  Number = Number;

  // Computed Financial Aggregates
  readonly totalInvoiced = computed(() => {
    return this.invoices().reduce((sum, inv) => sum + Number(inv.total || 0), 0);
  });

  readonly totalCollected = computed(() => {
    return this.invoices().reduce((sum, inv) => sum + Number(inv.paid || 0), 0);
  });

  readonly totalOutstanding = computed(() => {
    return this.invoices().reduce((sum, inv) => sum + Number(inv.balance || 0), 0);
  });

  readonly collectionRate = computed(() => {
    const total = this.totalInvoiced();
    if (total === 0) return 100;
    return Math.round((this.totalCollected() / total) * 100);
  });

  readonly paidInvoicesCount = computed(() => {
    return this.invoices().filter(inv => inv.status === 'PAID').length;
  });

  readonly pendingInvoicesCount = computed(() => {
    return this.invoices().filter(inv => inv.status === 'PENDING').length;
  });

  readonly partialInvoicesCount = computed(() => {
    return this.invoices().filter(inv => inv.status === 'PARTIAL').length;
  });

  readonly filteredInvoices = computed(() => {
    let list = this.invoices();
    if (this.selectedStatus !== 'ALL') {
      list = list.filter(inv => inv.status === this.selectedStatus);
    }
    const query = this.searchQuery.toLowerCase().trim();
    if (!query) return list;
    return list.filter(inv =>
      inv.name.toLowerCase().includes(query) ||
      inv.uhid.toLowerCase().includes(query) ||
      inv.invoiceNumber.toLowerCase().includes(query)
    );
  });

  ngOnInit(): void {
    this.fetchInvoices();
  }

  get headers(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
  }

  async fetchInvoices(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const url = `${getApiBaseUrl()}/billing`;
      const response = await this.http.get<{ success: boolean, data: Invoice[] }>(url, { headers: this.headers }).toPromise();
      if (response && response.success) {
        this.invoices.set(response.data);
      }
    } catch (err: any) {
      console.error('Error fetching billing invoices:', err);
      this.errorMessage.set('Failed to load invoice records.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async viewInvoiceDetails(inv: Invoice): Promise<void> {
    this.selectedInvoice.set(inv);
    this.invoiceItems.set([]);
    this.invoicePayments.set([]);

    try {
      const url = `${getApiBaseUrl()}/billing/${inv.id}`;
      const response = await this.http.get<{ success: boolean, data: any }>(url, { headers: this.headers }).toPromise();
      if (response && response.success && response.data) {
        this.invoiceItems.set(response.data.items || []);
        this.invoicePayments.set(response.data.payments || []);
      }
    } catch (err: any) {
      console.error('Error loading detailed invoice:', err);
    }
  }

  openPaymentModal(inv: Invoice): void {
    this.paymentTarget.set(inv);
    this.paymentForm = {
      amount: Number(inv.balance || 0),
      paymentMethod: 'CASH',
      transactionReference: `PAY-${Date.now().toString().slice(-6)}`
    };
  }

  async submitPayment(): Promise<void> {
    const target = this.paymentTarget();
    if (!target || !this.paymentForm.amount || this.paymentForm.amount <= 0) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    try {
      const url = `${getApiBaseUrl()}/billing/${target.id}/pay`;
      const response = await this.http.post<{ success: boolean, message: string, data: any }>(url, this.paymentForm, { headers: this.headers }).toPromise();
      if (response && response.success) {
        this.successMessage.set('Payment successfully recorded into patient ledger.');
        this.paymentTarget.set(null);
        if (this.selectedInvoice()?.id === target.id) {
          this.selectedInvoice.set(null);
        }
        this.fetchInvoices();
      }
    } catch (err: any) {
      console.error('Error processing payment:', err);
      this.errorMessage.set(err.error?.message || 'Failed to process payment.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  openCreateInvoiceModal(): void {
    this.successMessage.set('Direct invoice generation ready. Invoices auto-generate upon discharge, lab orders, and pharmacy dispensations.');
  }
}
