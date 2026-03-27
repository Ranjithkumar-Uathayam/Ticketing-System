// src/components/customer-entry-list/customer-entry-list.component.ts
import { Component, ChangeDetectionStrategy, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CustomerEntryService } from '../../services/customer-entry.service';
import { CustomerEntry } from '../../customer-entry.models';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-customer-entry-list',
  templateUrl: './customer-entry-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
})
export class CustomerEntryListComponent implements OnInit {
  loading       = this.svc.loading;
  searchTerm    = signal('');
  filterDate    = signal('');
  deleteId      = signal<number | null>(null);
  expanded      = signal<number | null>(null);
  toast         = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  filtered = computed(() => {
    let list = this.svc.records();
    const q  = this.searchTerm().toLowerCase();
    const d  = this.filterDate();
    if (q) list = list.filter(r =>
      r.employeeName.toLowerCase().includes(q) ||
      r.employeeId.toLowerCase().includes(q)
    );
    if (d) list = list.filter(r => r.entryDate?.startsWith(d));
    return list;
  });

  constructor(private svc: CustomerEntryService, private router: Router) {}

  ngOnInit() {
    this.svc.getAll();
  }

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

  /** Sum of all Qty fields for a quick overview badge */
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
    const dt = new Date(d);
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  fmt(n?: number): string {
    return (n ?? 0).toLocaleString('en-IN');
  }

  private flash(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 3000);
  }
}