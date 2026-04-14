// src/components/dispatch-list/dispatch-list.component.ts  (UPDATED — pagination)
import { Component, ChangeDetectionStrategy, signal, computed, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { DispatchService } from '../../services/dispatch.service';
import { DispatchPdfService } from '../../services/dispatch-pdf.service';
import { DispatchRecord } from '../../dispatch.models';
import { PaginationComponent } from '../shared/pagination.component';

@Component({
  selector: 'app-dispatch-list',
  templateUrl: './dispatch-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, PaginationComponent],
})
export class DispatchListComponent implements OnInit {
  loading  = this.svc.loading;
  records  = this.svc.records;
  selected = signal<DispatchRecord | null>(null);
  confirmDelete = signal<number | null>(null);
  toast    = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  // ── Search / filter ─────────────────────────────────────────────────────────
  searchDate = signal('');

  filtered = computed(() => {
    const q = this.searchDate().trim();
    if (!q) return this.records();
    return this.records().filter(r => r.dispatchDate?.includes(q));
  });

  // ── Pagination ──────────────────────────────────────────────────────────────
  currentPage = signal(1);
  readonly pageSize = 20;

  pagedRecords = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filtered().slice(start, start + this.pageSize);
  });

  // Reset to page 1 when filter changes
  private resetEffect = effect(() => {
    this.searchDate();
    this.currentPage.set(1);
  }, { allowSignalWrites: true });

  constructor(
    private svc: DispatchService,
    private pdf: DispatchPdfService,
    private router: Router,
  ) {}

  ngOnInit() { this.svc.getAll(); }

  openEntry(id?: number) {
    this.router.navigate(['/dispatch', id ?? 'new']);
  }

  selectRecord(rec: DispatchRecord) {
    this.selected.set(this.selected()?.id === rec.id ? null : rec);
  }

  closeDetail() { this.selected.set(null); }

  requestDelete(id: number) { this.confirmDelete.set(id); }
  cancelDelete()            { this.confirmDelete.set(null); }

  async doDelete(id: number) {
    this.confirmDelete.set(null);
    try {
      await this.svc.remove(id);
      if (this.selected()?.id === id) this.selected.set(null);
      this.flash('success', 'Record deleted.');
    } catch {
      this.flash('error', 'Failed to delete record.');
    }
  }

  downloadEntry(rec: DispatchRecord, event: Event) {
    event.stopPropagation();
    this.pdf.printEntry(rec);
  }

  downloadReport() {
    const recs = this.filtered();
    if (!recs.length) { this.flash('error', 'No records to export.'); return; }
    const label = this.searchDate()
      ? `Date filter: ${this.searchDate()}`
      : `All Records (${recs.length})`;
    this.pdf.printReport(recs, label);
  }

  totalDispatched(rec: DispatchRecord) {
    return rec.dispatchItems?.reduce((s, r) => s + (r.quantity || 0), 0) ?? 0;
  }
  totalRTO(rec: DispatchRecord)     { return rec.returnItems?.reduce((s, r) => s + (r.rto || 0), 0) ?? 0; }
  totalCUS(rec: DispatchRecord)     { return rec.returnItems?.reduce((s, r) => s + (r.cus || 0), 0) ?? 0; }
  totalReturns(rec: DispatchRecord) { return this.totalRTO(rec) + this.totalCUS(rec); }

  isGroupStart(items: any[], i: number): boolean {
    return i === 0 || items[i].channel !== items[i - 1].channel;
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private flash(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 3000);
  }
}