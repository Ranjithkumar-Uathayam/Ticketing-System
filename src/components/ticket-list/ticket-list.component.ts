// src/components/ticket-list/ticket-list.component.ts  (UPDATED — pagination)
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
  filterMonth    = signal<string>(
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

    let list = locked
      ? all.filter(t => t.category === locked)
      : all;

    if (isEmployee && currentUser) {
      list = list.filter(t => t.reporterId === currentUser.id);
    }
    return list;
  });

  // ── Filtered tickets (month + status + category) ────────────────────────────
  readonly filteredTickets = computed(() => {
    const month    = this.filterMonth();
    const status   = this.filterStatus();
    const category = this.activeCategory();

    return this.scopedTickets().filter(t => {
      // Month filter: include current-month + any prior-month that isn't resolved/closed
      const ticketMonth = t.createdAt?.substring(0, 7) ?? '';
      const isCurrentMonth = ticketMonth === month;
      const isPrevUnclosed = ticketMonth < month &&
        t.status !== 'Resolved' && t.status !== 'Closed';
      if (!isCurrentMonth && !isPrevUnclosed) return false;

      if (status   && t.status   !== status)   return false;
      if (category && t.category !== category) return false;
      return true;
    });
  });

  // ── Paginated slice ─────────────────────────────────────────────────────────
  readonly pagedTickets = computed(() => {
    const page = this.currentPage();
    const start = (page - 1) * this.pageSize;
    return this.filteredTickets().slice(start, start + this.pageSize);
  });

  // Reset to page 1 whenever filters change
  private resetEffect = effect(() => {
    // Access filter signals to register dependency
    this.filterMonth();
    this.filterStatus();
    this.filterCategory();
    this.currentPage.set(1);
  }, { allowSignalWrites: true });

  get hasActiveFilters() {
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return this.filterStatus() !== '' ||
      this.filterCategory() !== null ||
      this.filterMonth() !== defaultMonth;
  }

  constructor(
    private apiService: ApiService,
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {
    this.users   = this.apiService.users;
    this.loading = this.apiService.loading;
  }

  ngOnInit() {
    this.apiService.getTickets();
    this.apiService.getUsers();
  }

  setCategory(cat: TicketCategory | null) {
    if (this.isCategoryLocked()) return;
    this.filterCategory.set(cat);
  }

  clearFilters() {
    const now = new Date();
    this.filterMonth.set(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    this.filterStatus.set('');
    this.filterCategory.set(null);
    this.currentPage.set(1);
  }

  getUserName(id: number | undefined): string {
    if (!id) return 'Unassigned';
    return this.users().find(u => u.id === id)?.name ?? 'Unassigned';
  }
}