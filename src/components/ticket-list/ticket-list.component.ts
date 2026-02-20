import { Component, ChangeDetectionStrategy, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { TicketPriority, TicketStatus, User } from '../../models';

@Component({
  selector: 'app-ticket-list',
  templateUrl: './ticket-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, DatePipe],
  providers: [DatePipe]
})
export class TicketListComponent implements OnInit {
  tickets;
  users;
  loading;

  priorityColors: Record<TicketPriority, string> = {
    'Low': 'bg-green-100 text-green-800',
    'Medium': 'bg-yellow-100 text-yellow-800',
    'High': 'bg-orange-100 text-orange-800',
    'Urgent': 'bg-red-100 text-red-800',
  };

  statusColors: Record<TicketStatus, string> = {
    'Open': 'bg-blue-100 text-blue-800',
    'In Progress': 'bg-purple-100 text-purple-800',
    'Resolved': 'bg-gray-100 text-gray-800',
    'Closed': 'bg-gray-100 text-gray-800',
    'Reopened': 'bg-cyan-100 text-cyan-800',
  };

  constructor(
    private apiService: ApiService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    this.tickets = this.apiService.tickets;
    this.users = this.apiService.users;
    this.loading = this.apiService.loading;
  }

  async ngOnInit() {
    try {
      await this.apiService.getTickets();
      this.cdr.markForCheck();
    } catch (e) {
      console.error('Failed to refresh tickets', e);
    }
  }

  getAssignee(assigneeId?: number | null): User | undefined {
    if (!assigneeId) return undefined;
    return this.users().find(u => u.id === assigneeId);
  }

  getReporter(reporterId?: number | null): User | undefined {
    if (!reporterId) return undefined;
    return this.users().find(u => u.id === reporterId);
  }

  getPriorityClass(priority?: TicketPriority | null): string {
    if (!priority) return 'bg-gray-100 text-gray-600';
    return this.priorityColors[priority] || 'bg-gray-100 text-gray-600';
  }

  getStatusClass(status?: TicketStatus | null): string {
    if (!status) return 'bg-gray-100 text-gray-600';
    return this.statusColors[status] || 'bg-gray-100 text-gray-600';
  }

  createNewTicket() {
    this.router.navigate(['/tickets/new']);
  }
}