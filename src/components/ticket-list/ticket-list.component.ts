import { Component, ChangeDetectionStrategy } from '@angular/core';
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
export class TicketListComponent {
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

  constructor(private apiService: ApiService, private router: Router) {
    this.tickets = this.apiService.tickets;
    this.users = this.apiService.users;
    this.loading = this.apiService.loading;
  }

  getAssignee(assigneeId?: number): User | undefined {
    return this.users().find(u => u.id === assigneeId);
  }

  getPriorityClass(priority: TicketPriority): string {
    return this.priorityColors[priority] || '';
  }

  getStatusClass(status: TicketStatus): string {
    return this.statusColors[status] || '';
  }

  createNewTicket() {
    this.router.navigate(['/tickets/new']);
  }
}
