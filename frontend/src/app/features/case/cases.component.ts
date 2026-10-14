import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { getApiBaseUrl } from '../../core/config/api.config';
@Component({
  selector: 'app-cases',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: ` <section>
    <h1>Case directory</h1>
    <p>Every visit and admission has its own case, linked to a patient UHID.</p>
    <label
      >Search cases<input [(ngModel)]="search" placeholder="Patient, UHID, provider or case number"
    /></label>
    <p *ngIf="loading()">Loading cases…</p>
    <p *ngIf="error()" role="alert">{{ error() }}</p>
    <div class="case-list">
      <a *ngFor="let c of filtered()" [routerLink]="['/cases', c.id]"
        ><strong>{{ c.patientName }}</strong
        ><span>{{ c.patientUhid }} · {{ c.caseNumber }}</span
        ><span>{{ c.type }} · {{ c.status }} · {{ c.doctorName || 'Unassigned' }}</span
        ><small>{{ c.chiefComplaint || 'No complaint recorded' }}</small></a
      >
    </div>
    <p *ngIf="!loading() && !filtered().length">No cases match this search.</p>
  </section>`,
  styles: `
    section {
      display: grid;
      gap: 20px;
    }
    label {
      display: grid;
      gap: 8px;
    }
    input {
      padding: 12px;
      border: 1px solid var(--color-border);
      border-radius: 8px;
      background: var(--color-bg-surface);
      color: var(--color-text-primary);
    }
    .case-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
    }
    .case-list a {
      display: grid;
      gap: 8px;
      padding: 20px;
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: 14px;
      color: var(--color-text-primary);
    }
    span,
    small {
      color: var(--color-text-secondary);
    }
  `,
})
export class CasesComponent {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  search = signal('');
  cases = signal<any[]>([]);
  loading = signal(true);
  error = signal('');
  filtered = computed(() =>
    this.cases().filter((c) =>
      `${c.patientName} ${c.patientUhid} ${c.caseNumber} ${c.doctorName}`
        .toLowerCase()
        .includes(this.search().toLowerCase()),
    ),
  );
  constructor() {
    this.route.queryParamMap.subscribe((p) => this.search.set(p.get('q') || ''));
    void this.load();
  }
  async load() {
    try {
      const r = await firstValueFrom(this.http.get<{ data: any[] }>(`${getApiBaseUrl()}/cases`));
      this.cases.set(r.data);
    } catch {
      this.error.set('Unable to load cases. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }
}
