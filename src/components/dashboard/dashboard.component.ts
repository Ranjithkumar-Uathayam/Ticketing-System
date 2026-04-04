// src/components/dashboard/dashboard.component.ts  (UPDATED — category filter)
import {
  Component, ChangeDetectionStrategy, computed, signal,
  ElementRef, ViewChild, OnDestroy, effect, inject, Injector
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { RouterLink } from '@angular/router';
import { Ticket, TicketPriority, TicketStatus, TicketCategory, TICKET_CATEGORIES, User } from '../../models';
import { AuthService } from '../../services/auth.service';

declare var Chart: any;

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
})
export class DashboardComponent implements OnDestroy {
  users;
  loading;

  @ViewChild('statusChart') set statusChartCanvas(el: ElementRef<HTMLCanvasElement>) {
    if (el && !this.statusChart) this.createStatusChart(el);
  }
  @ViewChild('weeklyChart') set weeklyChartCanvas(el: ElementRef<HTMLCanvasElement>) {
    if (el && !this.weeklyChart) this.createWeeklyChart(el);
  }

  private statusChart: any;
  private weeklyChart: any;

  // ── Category filter ─────────────────────────────────────────────────────────
  readonly categories: TicketCategory[]      = TICKET_CATEGORIES;
  /** null = "All categories" (only shown for Admin/Manager) */
  filterCategory = signal<TicketCategory | null>(null);

  /** true = this user is locked to one category and cannot change it */
  readonly isCategoryLocked = computed(() => !!this.auth.lockedCategory());
  readonly canFilterCategory = computed(() => !this.isCategoryLocked());

  // ── Scoped + filtered tickets ───────────────────────────────────────────────
  readonly tickets = computed(() => {
    const all          = this.apiService.tickets();
    const locked       = this.auth.lockedCategory();    // null = no lock
    const selected     = this.filterCategory();         // null = All (when no lock)
    const currentUser  = this.auth.currentUser();
    const isManager    = this.auth.isManager();
    const isAdmin      = this.auth.isAdmin();
    const isSupport    = this.auth.isSupport();
    const isEmployee   = this.auth.isEmployee();

    // 1. Determine the effective category scope
    const effectiveCat = locked ?? selected; // locked wins over manual filter

    // 2. Scope to category if applicable
    let scoped = effectiveCat
      ? all.filter(t => t.category === effectiveCat)
      : all;

    // 3. Scope to assignee for employees / support without category
    if (isEmployee && currentUser) {
      scoped = scoped.filter(t => t.assigneeId === currentUser.id);
    }

    return scoped;
  });

  stats = computed(() => {
    const t = this.tickets();
    return {
      newTickets: t.filter(x => x.status === 'New').length,
      open:       t.filter(x => x.status === 'Open' || x.status === 'Reopened').length,
      inProgress: t.filter(x => x.status === 'In Progress').length,
      resolved:   t.filter(x => x.status === 'Resolved').length,
      urgent:     t.filter(x => x.priority === 'Urgent').length,
      total:      t.length,
    };
  });

  recentTickets = computed(() =>
    this.tickets()
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5)
  );

  statusChartData = computed(() => {
    const counts = this.tickets().reduce((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {} as Record<TicketStatus, number>);
    return {
      labels: Object.keys(counts),
      data:   Object.values(counts),
      colors: Object.keys(counts).map(s => this.statusChartColors[s as TicketStatus]),
    };
  });

  weeklyChartData = computed(() => {
    const labels: string[] = [];
    const data: number[]   = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      labels.push(date.toLocaleDateString(undefined, { weekday: 'short' }));
      data.push(this.tickets().filter(t => {
        const d = new Date(t.createdAt);
        return d.getFullYear() === date.getFullYear()
            && d.getMonth()    === date.getMonth()
            && d.getDate()     === date.getDate();
      }).length);
    }
    return { labels, data };
  });

  priorityColors: Record<TicketPriority, string> = {
    'Low': 'bg-emerald-100 text-emerald-700',
    'Medium': 'bg-amber-100 text-amber-700',
    'High': 'bg-orange-100 text-orange-700',
    'Urgent': 'bg-red-100 text-red-700',
  };

  statusColors: Record<TicketStatus, string> = {
    'New': 'bg-slate-100 text-slate-600',
    'Open': 'bg-blue-100 text-blue-700',
    'Reopened': 'bg-cyan-100 text-cyan-700',
    'In Progress': 'bg-violet-100 text-violet-700',
    'Resolved': 'bg-green-100 text-green-700',
    'Closed': 'bg-gray-100 text-gray-600',
  };

  statusChartColors: Record<TicketStatus, string> = {
    'New': '#94a3b8', 'Open': '#3b82f6', 'Reopened': '#06b6d4',
    'In Progress': '#8b5cf6', 'Resolved': '#22c55e', 'Closed': '#1f2937',
  };

  private injector = inject(Injector);

  constructor(private apiService: ApiService, public auth: AuthService) {
    this.users   = this.apiService.users;
    this.loading = this.apiService.loading;

    effect(() => {
      const d = this.statusChartData();
      if (this.statusChart) {
        this.statusChart.data.labels                           = d.labels;
        this.statusChart.data.datasets[0].data                = d.data;
        this.statusChart.data.datasets[0].backgroundColor     = d.colors;
        this.statusChart.update();
      }
    }, { injector: this.injector });

    effect(() => {
      const d = this.weeklyChartData();
      if (this.weeklyChart) {
        this.weeklyChart.data.labels          = d.labels;
        this.weeklyChart.data.datasets[0].data = d.data;
        this.weeklyChart.update();
      }
    }, { injector: this.injector });
  }

  setCategory(cat: TicketCategory | null) {
    if (!this.isCategoryLocked()) this.filterCategory.set(cat);
  }

  activeCategory = computed<TicketCategory | null>(() =>
    this.auth.lockedCategory() ?? this.filterCategory()
  );

  getAssignee(assigneeId?: number): User | undefined {
    return this.users().find(u => u.id === assigneeId);
  }

  ngOnDestroy() {
    this.statusChart?.destroy();
    this.weeklyChart?.destroy();
  }

  private createStatusChart(canvas: ElementRef<HTMLCanvasElement>) {
    const d = this.statusChartData();
    this.statusChart = new Chart(canvas.nativeElement, {
      type: 'doughnut',
      data: { labels: d.labels, datasets: [{ data: d.data, backgroundColor: d.colors, borderWidth: 2, borderColor: '#fff' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12, font: { size: 11 } } } } },
    });
  }

  private createWeeklyChart(canvas: ElementRef<HTMLCanvasElement>) {
    const d = this.weeklyChartData();
    this.weeklyChart = new Chart(canvas.nativeElement, {
      type: 'bar',
      data: { labels: d.labels, datasets: [{ label: 'Tickets', data: d.data, backgroundColor: 'rgba(27,47,110,0.15)', borderColor: '#1B2F6E', borderWidth: 2, borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } },
    });
  }
}