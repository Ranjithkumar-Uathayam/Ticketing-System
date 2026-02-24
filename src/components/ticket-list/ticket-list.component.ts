import { Component, ChangeDetectionStrategy, OnInit, ChangeDetectorRef, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
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
    'Low': 'bg-emerald-100 text-emerald-700',
    'Medium': 'bg-amber-100 text-amber-700',
    'High': 'bg-orange-100 text-orange-700',
    'Urgent': 'bg-red-100 text-red-700',
  };

  statusColors: Record<TicketStatus, string> = {
    'New': 'bg-slate-100 text-slate-600',
    'Open': 'bg-blue-100 text-blue-700',
    'In Progress': 'bg-violet-100 text-violet-700',
    'Resolved': 'bg-green-100 text-green-700',
    'Closed': 'bg-gray-100 text-gray-600',
    'Reopened': 'bg-cyan-100 text-cyan-700',
  };

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    this.users = this.apiService.users;
    this.loading = this.apiService.loading;
    this.tickets = computed(() => {
      const currentUser = this.authService.currentUser();
      const isAdmin = this.authService.isAdmin();
      const isManager = this.authService.isManager();
      const adminCategory = this.authService.adminCategory();
      const allTickets = this.apiService.tickets();

      if (isAdmin) {
        return adminCategory
          ? allTickets.filter(t => t.category === adminCategory)
          : allTickets;
      }

      if (isManager) {
        return allTickets;
      }

      if (!currentUser) return [];
      return allTickets.filter(t => t.assigneeId === currentUser.id);
    });
  }

  async ngOnInit() {
    try {
      await this.apiService.getTickets();
      this.cdr.markForCheck();
    } catch (e) {
      console.log('Failed to refresh tickets', e);
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