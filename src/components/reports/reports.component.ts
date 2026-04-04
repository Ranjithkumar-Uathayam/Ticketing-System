// src/components/reports/reports.component.ts  (FIXED — category + all filters now reactive)
import {
  Component, ChangeDetectionStrategy, computed,
  ViewChild, ElementRef, OnDestroy, effect, inject, Injector
} from '@angular/core';
import { toSignal }           from '@angular/core/rxjs-interop';
import { CommonModule }        from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { ApiService }          from '../../services/api.service';
import { TicketStatus, TicketPriority, TicketCategory, TICKET_CATEGORIES, User } from '../../models';
import { AuthService }         from '../../services/auth.service';

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

  /**
   * KEY FIX: Convert filterForm.valueChanges (RxJS observable) to a signal.
   * This makes filteredTickets() — a computed() — re-run automatically on
   * every form change, including the category dropdown.
   *
   * Without this, computed() reads filterForm.value as a plain object snapshot
   * and never knows when it changes.
   */
  readonly filterValues = toSignal(this.filterForm.valueChanges, {
    initialValue: this.filterForm.value,
  });

  // ── Base scoped tickets (role/category lock applied first) ─────────────────
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

  // ── UI-filtered tickets — now fully reactive via filterValues signal ────────
  filteredTickets = computed(() => {
    const all     = this.scopedTickets();
    const filters = this.filterValues();          // ← signal — tracked by computed()
    const locked  = this.auth.lockedCategory();

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

      // Category: locked category takes precedence over the form dropdown
      const catFilter = locked || filters.category || '';
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
        datasets: [{
          label: 'Tickets by Category',
          data: d.data,
          backgroundColor: 'rgba(27,47,110,0.18)',
          borderColor: '#1B2F6E',
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
        plugins: { legend: { display: false } },
      },
    });
  }

  updateChart() {
    const d = this.reportChartData();
    this.categoryChart.data.labels           = d.labels;
    this.categoryChart.data.datasets[0].data = d.data;
    this.categoryChart.update();
  }

  getAssignee(id?: number): User | undefined {
    return this.users().find(u => u.id === id);
  }

  exportToCsv() {
    alert('Export to CSV functionality coming soon!');
  }
}