import { Component, ChangeDetectionStrategy, computed, ViewChild, ElementRef, OnDestroy, effect, inject, Injector } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Ticket, TicketStatus, TicketPriority, User } from '../../models';

declare var Chart: any;

@Component({
  selector: 'app-reports',
  templateUrl: './reports.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class ReportsComponent implements OnDestroy {
  tickets;
  users;
  loading;

  @ViewChild('categoryChart') set categoryChartCanvas(el: ElementRef<HTMLCanvasElement>) {
    if (el && !this.categoryChart) {
      this.createChart(el);
    }
  }
  private categoryChart: any;

  statuses: TicketStatus[] = ['Open', 'In Progress', 'Resolved', 'Closed', 'Reopened'];
  priorities: TicketPriority[] = ['Low', 'Medium', 'High', 'Urgent'];

  filterForm = new FormGroup({
    startDate: new FormControl(''),
    endDate: new FormControl(''),
    status: new FormControl<TicketStatus | ''>(''),
    priority: new FormControl<TicketPriority | ''>(''),
    assigneeId: new FormControl<number | ''>(''),
  });

  filteredTickets = computed(() => {
    const allTickets = this.tickets();
    const filters = this.filterForm.value;

    return allTickets.filter(ticket => {
      const createdAt = new Date(ticket.createdAt);
      if (filters.startDate && createdAt < new Date(filters.startDate)) {
        return false;
      }
      if (filters.endDate) {
        // Add 1 day to the end date to include the entire day
        const endDate = new Date(filters.endDate);
        endDate.setDate(endDate.getDate() + 1);
        if (createdAt > endDate) {
          return false;
        }
      }
      if (filters.status && ticket.status !== filters.status) {
        return false;
      }
      if (filters.priority && ticket.priority !== filters.priority) {
        return false;
      }
      if (filters.assigneeId && ticket.assigneeId !== Number(filters.assigneeId)) {
        return false;
      }
      return true;
    });
  });

  reportChartData = computed(() => {
    const tickets = this.filteredTickets();
    const categoryCounts = tickets.reduce((acc, ticket) => {
        const category = ticket.category || 'Uncategorized';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return {
        labels: Object.keys(categoryCounts),
        data: Object.values(categoryCounts),
    };
  });
  
  private injector = inject(Injector);

  constructor(private apiService: ApiService) {
    this.tickets = this.apiService.tickets;
    this.users = this.apiService.users;
    this.loading = this.apiService.loading;

    effect(() => {
      if(this.categoryChart) {
        this.updateChart();
      }
    }, { injector: this.injector });
  }

  ngOnDestroy() {
    this.categoryChart?.destroy();
  }

  createChart(canvas: ElementRef<HTMLCanvasElement>) {
    if (canvas) {
        const chartData = this.reportChartData();
        this.categoryChart = new Chart(canvas.nativeElement, {
            type: 'bar',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: 'Tickets by Category',
                    data: chartData.data,
                    backgroundColor: 'rgba(59, 130, 246, 0.5)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }
  }

  updateChart() {
    const chartData = this.reportChartData();
    this.categoryChart.data.labels = chartData.labels;
    this.categoryChart.data.datasets[0].data = chartData.data;
    this.categoryChart.update();
  }
  
  getAssignee(assigneeId?: number): User | undefined {
    return this.users().find(u => u.id === assigneeId);
  }

  exportToCsv() {
    // This is a placeholder for the CSV export functionality.
    // In a real implementation, you would generate a CSV string from `this.filteredTickets()`
    // and trigger a file download.
    alert('Export to CSV functionality coming soon!');
  }
}
