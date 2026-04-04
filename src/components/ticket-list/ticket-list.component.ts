// src/components/ticket-list/ticket-list.component.ts  (UPDATED — category filter)
import {
  Component, ChangeDetectionStrategy, OnInit,
  ChangeDetectorRef, computed, signal
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { TicketCategory, TicketPriority, TicketStatus, TICKET_CATEGORIES, User } from '../../models';

@Component({
  selector: 'app-ticket-list',
  templateUrl: './ticket-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, DatePipe],
  providers: [DatePipe],
})
export class TicketListComponent implements OnInit {
  users;
  loading;

  // ── Filter signals ──────────────────────────────────────────────────────────
  private _now = new Date();
  filterMonth    = signal<string>(
    `${this._now.getFullYear()}-${String(this._now.getMonth() + 1).padStart(2, '0')}`
  );
  filterStatus   = signal<TicketStatus | ''>('');
  filterCategory = signal<TicketCategory | null>(null);   // ← NEW

  statuses:   TicketStatus[]   = ['New', 'Open', 'In Progress', 'Resolved', 'Closed', 'Reopened'];
  categories: TicketCategory[] = TICKET_CATEGORIES;

  // ── Category lock helpers ───────────────────────────────────────────────────
  readonly isCategoryLocked  = computed(() => !!this.auth.lockedCategory());
  readonly canFilterCategory = computed(() => !this.isCategoryLocked());
  readonly activeCategory    = computed<TicketCategory | null>(() =>
    this.auth.lockedCategory() ?? this.filterCategory()
  );

  // ── Base scoped tickets (role + category lock) ──────────────────────────────
  private readonly scopedTickets = computed(() => {
    const all        = this.apiService.tickets();
    const locked     = this.auth.lockedCategory();
    const currentUser = this.auth.currentUser();
    const isAdmin    = this.auth.isAdmin();
    const isManager  = this.auth.isManager();
    const isEmployee = this.auth.isEmployee();

    let list = locked ? all.filter(t => t.category === locked) : all;

    if (isEmployee && currentUser) {
      list = list.filter(t => t.assigneeId === currentUser.id);
    }

    return list;
  });

  // ── UI-filtered tickets (month + status + optional category) ───────────────
  readonly tickets = this.scopedTickets; // alias used in template

  filteredTickets = computed(() => {
    const all      = this.scopedTickets();
    const monthStr = this.filterMonth();
    const status   = this.filterStatus();
    const cat      = this.activeCategory();

    const [yr, mo]     = monthStr.split('-').map(Number);
    const monthStart   = new Date(yr, mo - 1, 1);
    const monthEnd     = new Date(yr, mo, 1);
    const prevStart    = new Date(yr, mo - 2, 1);

    return all.filter(ticket => {
      const created = ticket.createdAt ? new Date(ticket.createdAt) : null;
      if (!created) return false;

      const inMonth    = created >= monthStart && created < monthEnd;
      const carryOver  = created >= prevStart && created < monthStart && ticket.status !== 'Closed';
      if (!inMonth && !carryOver) return false;

      if (status && ticket.status !== status) return false;
      if (cat    && ticket.category !== cat)   return false;

      return true;
    });
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
    'In Progress': 'bg-violet-100 text-violet-700',
    'Resolved': 'bg-green-100 text-green-700',
    'Closed': 'bg-gray-100 text-gray-600',
    'Reopened': 'bg-cyan-100 text-cyan-700',
  };

  constructor(
    private apiService: ApiService,
    public auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {
    this.users   = this.apiService.users;
    this.loading = this.apiService.loading;
  }

  async ngOnInit() {
    try {
      await this.apiService.getTickets();
      this.cdr.markForCheck();
    } catch (e) {
      console.log('Failed to refresh tickets', e);
    }
  }

  setMonth(value: string)        { this.filterMonth.set(value); }
  setStatus(value: string)       { this.filterStatus.set(value as TicketStatus | ''); }
  setCategory(cat: TicketCategory | null) {
    if (!this.isCategoryLocked()) this.filterCategory.set(cat);
  }

  clearFilters() {
    const now = new Date();
    this.filterMonth.set(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    this.filterStatus.set('');
    this.filterCategory.set(null);
  }

  get hasActiveFilters(): boolean {
    const now = new Date();
    const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return this.filterStatus() !== '' || this.filterMonth() !== cur || this.filterCategory() !== null;
  }

  getAssignee(id?: number): User | undefined  { return this.users().find(u => u.id === id); }
  getReporter(id?: number): User | undefined  { return this.users().find(u => u.id === id); }

  getPriorityClass(p?: TicketPriority | null) { return p ? this.priorityColors[p] : 'bg-gray-100 text-gray-600'; }
  getStatusClass(s?: TicketStatus | null)     { return s ? this.statusColors[s]   : 'bg-gray-100 text-gray-600'; }

  createNewTicket() { this.router.navigate(['/tickets/new']); }
}