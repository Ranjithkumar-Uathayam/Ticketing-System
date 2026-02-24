import { Component, ChangeDetectionStrategy, computed, signal, ElementRef, ViewChild, OnDestroy, effect, inject, Injector } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { RouterLink } from '@angular/router';
import { Ticket, TicketPriority, TicketStatus, User } from '../../models';
import { AuthService } from '../../services/auth.service';

declare var Chart: any;

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
})
export class DashboardComponent implements OnDestroy {
  tickets;
  users;
  loading;

  @ViewChild('statusChart') set statusChartCanvas(el: ElementRef<HTMLCanvasElement>) {
    if (el && !this.statusChart) {
      this.createStatusChart(el);
    }
  }
  @ViewChild('weeklyChart') set weeklyChartCanvas(el: ElementRef<HTMLCanvasElement>) {
    if (el && !this.weeklyChart) {
      this.createWeeklyChart(el);
    }
  }

  private statusChart: any;
  private weeklyChart: any;

  stats = computed(() => {
    const tickets = this.tickets();
    return {
      newTickets: tickets.filter(t => t.status === 'New').length,
      open: tickets.filter(t => t.status === 'Open' || t.status === 'Reopened').length,
      inProgress: tickets.filter(t => t.status === 'In Progress').length,
      resolved: tickets.filter(t => t.status === 'Resolved').length,
      urgent: tickets.filter(t => t.priority === 'Urgent').length,
      total: tickets.length,
    };
  });

  recentTickets = computed(() => {
    return this.tickets()
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);
  });

  statusChartData = computed(() => {
    const tickets = this.tickets();
    const statusCounts = tickets.reduce((acc, ticket) => {
      acc[ticket.status] = (acc[ticket.status] || 0) + 1;
      return acc;
    }, {} as Record<TicketStatus, number>);

    return {
      labels: Object.keys(statusCounts),
      data: Object.values(statusCounts),
      colors: Object.keys(statusCounts).map(status => this.statusChartColors[status as TicketStatus])
    };
  });

  weeklyChartData = computed(() => {
    const tickets = this.tickets();
    const labels = [];
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      labels.push(date.toLocaleDateString(undefined, { weekday: 'short' }));
      const count = tickets.filter(ticket => {
        const ticketDate = new Date(ticket.createdAt);
        return ticketDate.getFullYear() === date.getFullYear() &&
          ticketDate.getMonth() === date.getMonth() &&
          ticketDate.getDate() === date.getDate();
      }).length;
      data.push(count);
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
    'New': '#94a3b8',
    'Open': '#3b82f6',
    'Reopened': '#06b6d4',
    'In Progress': '#8b5cf6',
    'Resolved': '#22c55e',
    'Closed': '#1f2937',
  };

  private injector = inject(Injector);

  constructor(private apiService: ApiService, private authService: AuthService) {
    const adminCategory = this.authService.adminCategory;

    this.tickets = computed(() => {
      const cat = adminCategory();
      const all = this.apiService.tickets();
      return cat ? all.filter(t => t.category === cat) : all;
    });

    this.users = this.apiService.users;
    this.loading = this.apiService.loading;

    effect(() => {
      const chartData = this.statusChartData();
      if (this.statusChart) {
        this.statusChart.data.labels = chartData.labels;
        this.statusChart.data.datasets[0].data = chartData.data;
        this.statusChart.data.datasets[0].backgroundColor = chartData.colors;
        this.statusChart.update();
      }
    }, { injector: this.injector });

    effect(() => {
      const chartData = this.weeklyChartData();
      if (this.weeklyChart) {
        this.weeklyChart.data.labels = chartData.labels;
        this.weeklyChart.data.datasets[0].data = chartData.data;
        this.weeklyChart.update();
      }
    }, { injector: this.injector });
  }

  getAssignee(assigneeId?: number | null): User | undefined {
    if (!assigneeId) return undefined;
    return this.users().find(u => u.id === assigneeId);
  }

  createStatusChart(el: ElementRef<HTMLCanvasElement>) {
    const chartData = this.statusChartData();
    this.statusChart = new Chart(el.nativeElement, {
      type: 'doughnut',
      data: {
        labels: chartData.labels,
        datasets: [{
          data: chartData.data,
          backgroundColor: chartData.colors,
          borderWidth: 2,
          borderColor: '#fff',
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { padding: 16, font: { size: 12 } } }
        },
        cutout: '65%'
      }
    });
  }

  createWeeklyChart(el: ElementRef<HTMLCanvasElement>) {
    const chartData = this.weeklyChartData();
    this.weeklyChart = new Chart(el.nativeElement, {
      type: 'bar',
      data: {
        labels: chartData.labels,
        datasets: [{
          label: 'Tickets Created',
          data: chartData.data,
          backgroundColor: 'rgba(99, 102, 241, 0.15)',
          borderColor: '#6366f1',
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#f1f5f9' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  ngOnDestroy() {
    this.statusChart?.destroy();
    this.weeklyChart?.destroy();
  }
}