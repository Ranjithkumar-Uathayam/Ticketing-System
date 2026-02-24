// src/components/dispatch/dispatch-list/dispatch-list.component.ts
import { Component, ChangeDetectionStrategy, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { DispatchService } from '../../services/dispatch.service';
import { DispatchRecord } from '../../dispatch.models';

@Component({
  selector: 'app-dispatch-list',
  templateUrl: './dispatch-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class DispatchListComponent implements OnInit {
  loading  = this.svc.loading;
  records  = this.svc.records;
  selected = signal<DispatchRecord | null>(null);
  confirmDelete = signal<number | null>(null);
  toast    = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Search / filter
  searchDate = signal('');

  filtered = computed(() => {
    const q = this.searchDate().trim();
    if (!q) return this.records();
    return this.records().filter(r => r.dispatchDate?.includes(q));
  });

  constructor(private svc: DispatchService, private router: Router) {}

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

  totalDispatched(rec: DispatchRecord) {
    return rec.dispatchItems?.reduce((s, r) => s + (r.quantity || 0), 0) ?? 0;
  }
  totalRTO(rec: DispatchRecord)     { return rec.returnItems?.reduce((s, r) => s + (r.rto || 0), 0) ?? 0; }
  totalCUS(rec: DispatchRecord)     { return rec.returnItems?.reduce((s, r) => s + (r.cus || 0), 0) ?? 0; }
  totalReturns(rec: DispatchRecord) { return this.totalRTO(rec) + this.totalCUS(rec); }

  formatDate(d: string) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  isGroupStart(rows: any[], i: number): boolean {
    return i === 0 || rows[i].channel !== rows[i - 1].channel;
  }

  private flash(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 3000);
  }
}