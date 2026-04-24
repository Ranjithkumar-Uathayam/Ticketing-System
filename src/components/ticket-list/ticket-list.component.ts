// src/components/ticket-list/ticket-list.component.ts
import {
  Component, ChangeDetectionStrategy, OnInit,
  ChangeDetectorRef, computed, signal, effect,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { TicketCategory, TicketPriority, TicketStatus, TICKET_CATEGORIES, User } from '../../models';
import { PaginationComponent } from '../shared/pagination.component';

@Component({
  selector: 'app-ticket-list',
  templateUrl: './ticket-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, DatePipe, PaginationComponent],
  providers: [DatePipe],
})
export class TicketListComponent implements OnInit {
  users;
  loading;

  // ── Filter signals ──────────────────────────────────────────────────────────
  private _now = new Date();
  filterMonth  = signal<string>(
    `${this._now.getFullYear()}-${String(this._now.getMonth() + 1).padStart(2, '0')}`
  );
  filterStatus   = signal<TicketStatus | ''>('');
  filterCategory = signal<TicketCategory | null>(null);

  statuses:   TicketStatus[]   = ['New', 'Open', 'In Progress', 'Resolved', 'Closed', 'Reopened'];
  categories: TicketCategory[] = TICKET_CATEGORIES;

  // ── Pagination ──────────────────────────────────────────────────────────────
  currentPage = signal(1);
  readonly pageSize = 15;

  // ── Category lock helpers ───────────────────────────────────────────────────
  readonly isCategoryLocked  = computed(() => !!this.auth.lockedCategory());
  readonly canFilterCategory = computed(() => !this.isCategoryLocked());
  readonly activeCategory    = computed<TicketCategory | null>(() =>
    this.auth.lockedCategory() ?? this.filterCategory()
  );

  // ── Base scoped tickets (role + category lock) ──────────────────────────────
  private readonly scopedTickets = computed(() => {
    const all         = this.apiService.tickets();
    const locked      = this.auth.lockedCategory();
    const currentUser = this.auth.currentUser();
    const isEmployee  = this.auth.isEmployee();

    let list = locked ? all.filter(t => t.category === locked) : all;

    if (isEmployee && currentUser) {
      list = list.filter(t =>
        t.reporterId === currentUser.id || t.assigneeId === currentUser.id
      );
    }
    return list;
  });

  // ── UI-filtered tickets — uses proper Date-based month window ───────────────
  filteredTickets = computed(() => {
    const all      = this.scopedTickets();
    const monthStr = this.filterMonth();
    const status   = this.filterStatus();
    const cat      = this.activeCategory();

    const [yr, mo]   = monthStr.split('-').map(Number);
    const monthStart = new Date(yr, mo - 1, 1);
    const monthEnd   = new Date(yr, mo, 1);
    const prevStart  = new Date(yr, mo - 2, 1);
    const now        = new Date();
    const isCurrentMonth =
      yr === now.getFullYear() && mo === now.getMonth() + 1;

    return all.filter(ticket => {
      const created = this.parseTicketDate(ticket.createdAt);
      if (!created) return false;

      const inMonth   = created >= monthStart && created < monthEnd;
      const carryOver = isCurrentMonth &&
        created >= prevStart &&
        created < monthStart &&
        ticket.status !== 'Closed';

      if (!inMonth && !carryOver) return false;
      if (status && ticket.status   !== status) return false;
      if (cat    && ticket.category !== cat)     return false;

      return true;
    });
  });

  // ── Paginated slice ─────────────────────────────────────────────────────────
  pagedTickets = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredTickets().slice(start, start + this.pageSize);
  });

  // ── Reset to page 1 whenever any filter changes ─────────────────────────────
  private resetPage = effect(() => {
    this.filterMonth();
    this.filterStatus();
    this.filterCategory();
    this.currentPage.set(1);
  }, { allowSignalWrites: true });

  // ── Badge colour maps ───────────────────────────────────────────────────────
  priorityColors: Record<TicketPriority, string> = {
    Low:    'bg-emerald-100 text-emerald-700',
    Medium: 'bg-amber-100 text-amber-700',
    High:   'bg-orange-100 text-orange-700',
    Urgent: 'bg-red-100 text-red-700',
  };

  statusColors: Record<TicketStatus, string> = {
    New:           'bg-slate-100 text-slate-600',
    Open:          'bg-blue-100 text-blue-700',
    'In Progress': 'bg-violet-100 text-violet-700',
    Resolved:      'bg-green-100 text-green-700',
    Closed:        'bg-gray-100 text-gray-600',
    Reopened:      'bg-cyan-100 text-cyan-700',
  };

  get hasActiveFilters(): boolean {
    const now = new Date();
    const defaultMonth =
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return (
      this.filterStatus()   !== ''   ||
      this.filterCategory() !== null ||
      this.filterMonth()    !== defaultMonth
    );
  }

  constructor(
    private apiService: ApiService,
    public  auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {
    this.users   = this.apiService.users;
    this.loading = this.apiService.loading;
  }

  ngOnInit() {
    this.apiService.getUsers();
    this.loadMonthTickets(this.filterMonth());
  }

  // ── Month change: update signal + re-fetch from API ─────────────────────────
  onMonthChange(value: string): void {
    this.filterMonth.set(value);
    this.loadMonthTickets(value);
  }

  // ── Fetch tickets for a month window from the API ───────────────────────────
  private loadMonthTickets(monthStr: string): void {
    const [yr, mo] = monthStr.split('-').map(Number);
    // Include previous month so carryover (unclosed prev-month tickets) works
    const fromDate = new Date(yr, mo - 2, 1); // 1st of previous month
    const toDate   = new Date(yr, mo, 1);     // 1st of month AFTER selected (exclusive)
    this.apiService.getTickets({
      createdFrom: this.toLocalDateStr(fromDate),
      createdTo:   this.toLocalDateStr(toDate),
      limit: 1000,
    });
  }

  private toLocalDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // ── Navigation ──────────────────────────────────────────────────────────────
  createNewTicket() {
    this.router.navigate(['/tickets', 'new']);
  }

  // ── Category filter toggle ──────────────────────────────────────────────────
  setCategory(cat: TicketCategory | null) {
    if (this.isCategoryLocked()) return;
    this.filterCategory.set(cat);
  }

  // ── Reset all filters ───────────────────────────────────────────────────────
  clearFilters() {
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    this.filterMonth.set(monthStr);
    this.filterStatus.set('');
    this.filterCategory.set(null);
    this.currentPage.set(1);
    this.loadMonthTickets(monthStr);
  }

  // ── User lookup helpers ─────────────────────────────────────────────────────
  getAssignee(id: number | undefined): User | undefined {
    if (!id) return undefined;
    return this.users().find(u => u.id === id);
  }

  getReporter(id: number | undefined): User | undefined {
    if (!id) return undefined;
    return this.users().find(u => u.id === id);
  }

  // ── Badge class helpers ─────────────────────────────────────────────────────
  getStatusClass(status: TicketStatus): string {
    return this.statusColors[status] ?? 'bg-gray-100 text-gray-600';
  }

  getPriorityClass(priority: TicketPriority): string {
    return this.priorityColors[priority] ?? 'bg-gray-100 text-gray-600';
  }

  // ── Safe date parser — handles ISO strings & MSSQL datetime2 ───────────────
  parseTicketDate(raw: string | undefined | null): Date | null {
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
}