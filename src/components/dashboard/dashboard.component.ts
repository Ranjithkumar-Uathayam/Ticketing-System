import { Component, ChangeDetectionStrategy, computed, signal, ElementRef, ViewChild, OnDestroy, effect, inject, Injector } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { RouterLink } from '@angular/router';
import { Ticket, TicketPriority, TicketStatus, User } from '../../models';
import { AuthService } from '../../services/auth.service';

declare var Chart: any; // Using Chart.js from CDN

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
      open: tickets.filter(t => t.status === 'Open' || t.status === 'Reopened').length,
      inProgress: tickets.filter(t => t.status === 'In Progress').length,
      resolved: tickets.filter(t => t.status === 'Resolved').length,
      urgent: tickets.filter(t => t.priority === 'Urgent').length,
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
    'Low': 'bg-green-100 text-green-800',
    'Medium': 'bg-yellow-100 text-yellow-800',
    'High': 'bg-orange-100 text-orange-800',
    'Urgent': 'bg-red-100 text-red-800',
  };

  statusColors: Record<TicketStatus, string> = {
    'Open': 'bg-blue-100 text-blue-800',
    'Reopened': 'bg-cyan-100 text-cyan-800',
    'In Progress': 'bg-purple-100 text-purple-800',
    'Resolved': 'bg-gray-100 text-gray-800',
    'Closed': 'bg-gray-100 text-gray-800',
  };
  
  statusChartColors: Record<TicketStatus, string> = {
    'Open': '#3b82f6', // blue-500
    'Reopened': '#06b6d4', // cyan-500
    'In Progress': '#8b5cf6', // violet-500
    'Resolved': '#6b7280', // gray-500
    'Closed': '#1f2937', // gray-800
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
        if (this.statusChart) {
            const chartData = this.statusChartData();
            this.statusChart.data.labels = chartData.labels;
            this.statusChart.data.datasets[0].data = chartData.data;
            this.statusChart.data.datasets[0].backgroundColor = chartData.colors;
            this.statusChart.update();
        }
        if (this.weeklyChart) {
            const chartData = this.weeklyChartData();
            this.weeklyChart.data.labels = chartData.labels;
            this.weeklyChart.data.datasets[0].data = chartData.data;
            this.weeklyChart.update();
        }
    }, { injector: this.injector });
  }

  ngOnDestroy() {
    this.statusChart?.destroy();
    this.weeklyChart?.destroy();
  }

  createStatusChart(canvas: ElementRef<HTMLCanvasElement>) {
    if (canvas) {
      const chartData = this.statusChartData();
      this.statusChart = new Chart(canvas.nativeElement, {
        type: 'doughnut',
        data: {
          labels: chartData.labels,
          datasets: [{
            label: 'Tickets by Status',
            data: chartData.data,
            backgroundColor: chartData.colors,
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
                position: 'bottom',
            }
          }
        }
      });
    }
  }

  createWeeklyChart(canvas: ElementRef<HTMLCanvasElement>) {
    if (canvas) {
        const chartData = this.weeklyChartData();
        this.weeklyChart = new Chart(canvas.nativeElement, {
            type: 'bar',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: 'Tickets Created',
                    data: chartData.data,
                    backgroundColor: '#3b82f6',
                    borderColor: '#1e40af',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }
  }
  
  getAssignee(assigneeId?: number): User | undefined {
    return this.users().find(u => u.id === assigneeId);
  }
}
