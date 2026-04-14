// src/components/customer-entry-list/customer-entry-list.component.ts  (UPDATED — pagination)
import { Component, ChangeDetectionStrategy, signal, computed, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CustomerEntryService } from '../../services/customer-entry.service';
import { AuthService } from '../../services/auth.service';
import { CustomerEntry } from '../../customer-entry.models';
import { FormsModule } from '@angular/forms';
import { PaginationComponent } from '../shared/pagination.component';

@Component({
  selector: 'app-customer-entry-list',
  templateUrl: './customer-entry-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, PaginationComponent],
})
export class CustomerEntryListComponent implements OnInit {
  loading    = this.svc.loading;
  searchTerm = signal('');
  filterDate = signal('');
  deleteId   = signal<number | null>(null);
  expanded   = signal<number | null>(null);
  toast      = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  // ── Pagination ──────────────────────────────────────────────────────────────
  currentPage = signal(1);
  readonly pageSize = 15;

  // Admins and Managers see everyone's entries; all others see only their own
  canViewAll = computed(() => this.auth.isAdmin() || this.auth.isManager());

  filtered = computed(() => {
    const currentUserId = this.auth.currentUser()?.id;
    const viewAll       = this.canViewAll();

    let list = this.svc.records();

    if (!viewAll && currentUserId) {
      list = list.filter(r => r.createdByUserId === currentUserId);
    }

    const q = this.searchTerm().toLowerCase();
    if (q) {
      list = list.filter(r =>
        r.employeeName.toLowerCase().includes(q) ||
        r.employeeId.toLowerCase().includes(q)
      );
    }

    const d = this.filterDate();
    if (d) list = list.filter(r => r.entryDate?.startsWith(d));

    return list;
  });

  // ── Paginated slice ─────────────────────────────────────────────────────────
  pagedEntries = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filtered().slice(start, start + this.pageSize);
  });

  // Reset to page 1 whenever filters change
  private resetEffect = effect(() => {
    this.searchTerm(); this.filterDate();
    this.currentPage.set(1);
  }, { allowSignalWrites: true });

  constructor(
    private svc:    CustomerEntryService,
    private auth:   AuthService,
    private router: Router,
  ) {}

  ngOnInit() { this.svc.getAll(); }

  openEntry(id?: number) {
    this.router.navigate(['/customer-entry', id ?? 'new']);
  }

  toggleExpand(id: number) {
    this.expanded.update(v => v === id ? null : id);
  }

  requestDelete(id: number) { this.deleteId.set(id); }
  cancelDelete()            { this.deleteId.set(null); }

  async confirmDelete() {
    const id = this.deleteId();
    if (!id) return;
    try {
      await this.svc.remove(id);
      this.flash('success', 'Entry deleted.');
    } catch {
      this.flash('error', 'Failed to delete entry.');
    } finally {
      this.deleteId.set(null);
    }
  }

  totalQty(r: CustomerEntry): number {
    return (r.avcQty ?? 0) + (r.pvcQty ?? 0) + (r.emailWhatsappQty ?? 0)
         + (r.exchangePickupQty ?? 0) + (r.exchangeCallQty ?? 0) + (r.exchangeOrderReplacementQty ?? 0)
         + (r.poQty ?? 0) + (r.offlineOrderQty ?? 0) + (r.manualOrderQty ?? 0);
  }

  /** Sum of all Amount fields */
  totalAmount(r: CustomerEntry): number {
    return (r.refundPrepaidAmount ?? 0) + (r.refundCodAmount ?? 0)
         + (r.paymentLinkAmount ?? 0)
         + (r.offlineOrderAmount ?? 0) + (r.manualOrderAmount ?? 0);
  }

  formatDate(d?: string): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  fmt(n?: number): string {
    return (n ?? 0).toLocaleString('en-IN');
  }

  private flash(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 3000);
  }
}