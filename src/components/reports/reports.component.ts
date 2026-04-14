// src/components/reports/reports.component.ts  (UPDATED — pagination)
import {
  Component, ChangeDetectionStrategy, computed, signal,
  ViewChild, ElementRef, OnDestroy, effect, inject, Injector,
} from '@angular/core';
import { toSignal }           from '@angular/core/rxjs-interop';
import { CommonModule }        from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { ApiService }          from '../../services/api.service';
import { TicketStatus, TicketPriority, TicketCategory, TICKET_CATEGORIES, User } from '../../models';
import { AuthService }         from '../../services/auth.service';
import { PaginationComponent } from '../shared/pagination.component';

declare var Chart: any;

@Component({
  selector: 'app-reports',
  templateUrl: './reports.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, PaginationComponent],
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

  // ── Pagination ──────────────────────────────────────────────────────────────
  currentPage = signal(1);
  readonly pageSize = 20;

  // ── Category lock helpers ──────────────────────────────────────────────────
  readonly isCategoryLocked  = computed(() => !!this.auth.lockedCategory());
  readonly canFilterCategory = computed(() => !this.isCategoryLocked());
  readonly activeCategory    = computed<TicketCategory | null>(() => {
    const locked = this.auth.lockedCategory();
    if (locked) return locked;
    const cat = this.filterValues()?.category;
    return (cat as TicketCategory) || null;
  });

  filterForm = new FormGroup({
    startDate:  new FormControl(''),
    endDate:    new FormControl(''),
    status:     new FormControl<TicketStatus | ''>(''),
    priority:   new FormControl<TicketPriority | ''>(''),
    assigneeId: new FormControl<number | ''>(''),
    category:   new FormControl<TicketCategory | ''>(''),
  });

  readonly filterValues = toSignal(this.filterForm.valueChanges, {
    initialValue: this.filterForm.value,
  });

  // ── Base scoped tickets ────────────────────────────────────────────────────
  private readonly scopedTickets = computed(() => {
    const all         = this.apiService.tickets();
    const locked      = this.auth.lockedCategory();
    const currentUser = this.auth.currentUser();
    const isEmployee  = this.auth.isEmployee();

    let list = locked ? all.filter(t => t.category === locked) : all;
    if (isEmployee && currentUser) {
      list = list.filter(t => t.assigneeId === currentUser.id);
    }
    return list;
  });

  // ── UI-filtered tickets ────────────────────────────────────────────────────
  filteredTickets = computed(() => {
    const all     = this.scopedTickets();
    const filters = this.filterValues();
    const locked  = this.auth.lockedCategory();

    // Reset page when filters change
    this.currentPage.set(1);

    return all.filter(ticket => {
      const createdAt = new Date(ticket.createdAt);
      if (filters.startDate && createdAt < new Date(filters.startDate)) return false;
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setDate(end.getDate() + 1);
        if (createdAt > end) return false;
      }
      if (filters.status     && ticket.status     !== filters.status)             return false;
      if (filters.priority   && ticket.priority   !== filters.priority)           return false;
      if (filters.assigneeId && ticket.assigneeId !== Number(filters.assigneeId)) return false;
      const catFilter = locked || filters.category || '';
      if (catFilter && ticket.category !== catFilter) return false;
      return true;
    });
  });

  // ── Paginated slice ────────────────────────────────────────────────────────
  pagedTickets = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredTickets().slice(start, start + this.pageSize);
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

  getAssignee(id: number | undefined): User | undefined {
    return this.users().find(u => u.id === id);
  }

  exportToCsv() {
    const tickets = this.filteredTickets();
    const header  = ['ID', 'Title', 'Category', 'Status', 'Priority', 'Assignee', 'Created At'];
    const rows = tickets.map(t => [
      t.id,
      `"${t.title}"`,
      t.category ?? '',
      t.status,
      t.priority,
      this.getAssignee(t.assigneeId)?.name ?? 'Unassigned',
      new Date(t.createdAt).toLocaleDateString(),
    ]);
    const csv  = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'report.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  private createChart(el: ElementRef<HTMLCanvasElement>) {
    const data = this.reportChartData();
    this.categoryChart = new Chart(el.nativeElement, {
      type: 'doughnut',
      data: {
        labels:   data.labels,
        datasets: [{ data: data.data, backgroundColor: ['#1B2F6E', '#FDB515', '#22c55e', '#ef4444', '#8b5cf6'] }],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  }

  private updateChart() {
    if (!this.categoryChart) return;
    const data = this.reportChartData();
    this.categoryChart.data.labels   = data.labels;
    this.categoryChart.data.datasets[0].data = data.data;
    this.categoryChart.update();
  }
}