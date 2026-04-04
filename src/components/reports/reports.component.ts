// src/components/reports/reports.component.ts  (UPDATED — category filter)
import {
  Component, ChangeDetectionStrategy, computed, signal,
  ViewChild, ElementRef, OnDestroy, effect, inject, Injector
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Ticket, TicketStatus, TicketPriority, TicketCategory, TICKET_CATEGORIES, User } from '../../models';
import { AuthService } from '../../services/auth.service';

declare var Chart: any;

@Component({
  selector: 'app-reports',
  templateUrl: './reports.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class ReportsComponent implements OnDestroy {
  users;
  loading;

  @ViewChild('categoryChart') set categoryChartCanvas(el: ElementRef<HTMLCanvasElement>) {
    if (el && !this.categoryChart) this.createChart(el);
  }
  private categoryChart: any;

  statuses:   TicketStatus[]   = ['Open', 'In Progress', 'Resolved', 'Closed', 'Reopened'];
  priorities: TicketPriority[] = ['Low', 'Medium', 'High', 'Urgent'];
  categories: TicketCategory[] = TICKET_CATEGORIES;

  // ── Category lock helpers ───────────────────────────────────────────────────
  readonly isCategoryLocked  = computed(() => !!this.auth.lockedCategory());
  readonly canFilterCategory = computed(() => !this.isCategoryLocked());
  readonly activeCategory    = computed<TicketCategory | null>(() =>
    this.auth.lockedCategory() ?? (this.filterForm.value.category as TicketCategory | null)
  );

  filterForm = new FormGroup({
    startDate:  new FormControl(''),
    endDate:    new FormControl(''),
    status:     new FormControl<TicketStatus | ''>(''),
    priority:   new FormControl<TicketPriority | ''>(''),
    assigneeId: new FormControl<number | ''>(''),
    category:   new FormControl<TicketCategory | ''>(''),  // ← NEW
  });

  // ── Base scoped tickets (role/category lock applied first) ─────────────────
  private readonly scopedTickets = computed(() => {
    const all        = this.apiService.tickets();
    const locked     = this.auth.lockedCategory();
    const currentUser = this.auth.currentUser();
    const isEmployee  = this.auth.isEmployee();

    let list = locked ? all.filter(t => t.category === locked) : all;
    if (isEmployee && currentUser) {
      list = list.filter(t => t.assigneeId === currentUser.id);
    }
    return list;
  });

  filteredTickets = computed(() => {
    const all     = this.scopedTickets();
    const filters = this.filterForm.value;
    const locked  = this.auth.lockedCategory();

    return all.filter(ticket => {
      const createdAt = new Date(ticket.createdAt);

      if (filters.startDate && createdAt < new Date(filters.startDate)) return false;

      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setDate(end.getDate() + 1);
        if (createdAt > end) return false;
      }

      if (filters.status   && ticket.status   !== filters.status)   return false;
      if (filters.priority && ticket.priority !== filters.priority) return false;
      if (filters.assigneeId && ticket.assigneeId !== Number(filters.assigneeId)) return false;

      // Category filter: locked category takes precedence, else use form value
      const catFilter = locked || filters.category;
      if (catFilter && ticket.category !== catFilter) return false;

      return true;
    });
  });

  reportChartData = computed(() => {
    const counts = this.filteredTickets().reduce((acc, t) => {
      const cat = t.category || 'Uncategorized';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return { labels: Object.keys(counts), data: Object.values(counts) };
  });

  private injector = inject(Injector);

  constructor(private apiService: ApiService, public auth: AuthService) {
    this.users   = this.apiService.users;
    this.loading = this.apiService.loading;

    effect(() => {
      if (this.categoryChart) this.updateChart();
    }, { injector: this.injector });
  }

  ngOnDestroy() { this.categoryChart?.destroy(); }

  setCategory(cat: TicketCategory | '') {
    if (!this.isCategoryLocked()) this.filterForm.patchValue({ category: cat });
  }

  createChart(canvas: ElementRef<HTMLCanvasElement>) {
    const d = this.reportChartData();
    this.categoryChart = new Chart(canvas.nativeElement, {
      type: 'bar',
      data: {
        labels: d.labels,
        datasets: [{ label: 'Tickets by Category', data: d.data,
          backgroundColor: 'rgba(27,47,110,0.18)', borderColor: '#1B2F6E', borderWidth: 1 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
        plugins: { legend: { display: false } },
      },
    });
  }

  updateChart() {
    const d = this.reportChartData();
    this.categoryChart.data.labels          = d.labels;
    this.categoryChart.data.datasets[0].data = d.data;
    this.categoryChart.update();
  }

  getAssignee(id?: number): User | undefined { return this.users().find(u => u.id === id); }

  exportToCsv() { alert('Export to CSV functionality coming soon!'); }
}