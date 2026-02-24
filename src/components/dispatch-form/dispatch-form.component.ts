// src/components/dispatch/dispatch-form/dispatch-form.component.ts
import { Component, ChangeDetectionStrategy, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { DispatchService } from '../../services/dispatch.service';

import {
  DispatchRecord, DispatchItem, ReturnItem,
  DEFAULT_DISPATCH_ROWS, DEFAULT_RETURN_ROWS,
} from '../../dispatch.models';

@Component({
  selector: 'app-dispatch-form',
  templateUrl: './dispatch-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
})
export class DispatchFormComponent implements OnInit {
  loading  = signal(false);
  saving   = signal(false);
  isEdit   = signal(false);
  editId   = signal<number | null>(null);
  toast    = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Header fields
  dispatchDate  = signal(this.todayStr());
  totalPersons  = signal<number>(0);
  pendingOrders = signal<number>(0);
  onlyInvoiced  = signal<string>('NIL');

  // Row data (mutable copies)
  dispatchRows = signal<DispatchItem[]>(this.clone(DEFAULT_DISPATCH_ROWS));
  returnRows   = signal<ReturnItem[]>(this.clone(DEFAULT_RETURN_ROWS));

  // Live totals
  totalDispatched = computed(() => this.dispatchRows().reduce((s, r) => s + (r.quantity || 0), 0));
  totalRTO        = computed(() => this.returnRows().reduce((s, r) => s + (r.rto || 0), 0));
  totalCUS        = computed(() => this.returnRows().reduce((s, r) => s + (r.cus || 0), 0));
  totalReturns    = computed(() => this.totalRTO() + this.totalCUS());

  constructor(
    private svc:    DispatchService,
    private router: Router,
    private route:  ActivatedRoute,
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.isEdit.set(true);
      this.editId.set(+id);
      this.loadForEdit(+id);
    }
  }

  private async loadForEdit(id: number) {
    this.loading.set(true);
    try {
      let rec = this.svc.records().find(r => r.id === id);
      if (!rec) {
        await this.svc.getAll();
        rec = this.svc.records().find(r => r.id === id);
      }
      if (!rec) rec = await this.svc.getById(id);
      if (rec) {
        this.dispatchDate.set(rec.dispatchDate?.split('T')[0] ?? this.todayStr());
        this.totalPersons.set(rec.totalPersons ?? 0);
        this.pendingOrders.set(rec.pendingOrders ?? 0);
        this.onlyInvoiced.set(rec.onlyInvoiced ?? 'NIL');
        this.dispatchRows.set(rec.dispatchItems?.length ? rec.dispatchItems : this.clone(DEFAULT_DISPATCH_ROWS));
        this.returnRows.set(rec.returnItems?.length   ? rec.returnItems   : this.clone(DEFAULT_RETURN_ROWS));
      }
    } finally {
      this.loading.set(false);
    }
  }

  // ── Cell update helpers ───────────────────────────────────────────────────

  setDispatchQty(i: number, val: string) {
    this.dispatchRows.update(rows => {
      const copy = [...rows];
      copy[i] = { ...copy[i], quantity: Math.max(0, parseInt(val) || 0) };
      return copy;
    });
  }

  setReturnRTO(i: number, val: string) {
    this.returnRows.update(rows => {
      const copy = [...rows];
      copy[i] = { ...copy[i], rto: Math.max(0, parseInt(val) || 0) };
      return copy;
    });
  }

  setReturnCUS(i: number, val: string) {
    this.returnRows.update(rows => {
      const copy = [...rows];
      copy[i] = { ...copy[i], cus: Math.max(0, parseInt(val) || 0) };
      return copy;
    });
  }

  // ── Save / Reset / Cancel ─────────────────────────────────────────────────

  async save() {
    if (!this.dispatchDate()) {
      this.flash('error', 'Please select a dispatch date.');
      return;
    }
    this.saving.set(true);
    try {
      const body: DispatchRecord = {
        dispatchDate:  this.dispatchDate(),
        totalPersons:  this.totalPersons(),
        pendingOrders: this.pendingOrders(),
        onlyInvoiced:  this.onlyInvoiced(),
        dispatchItems: this.dispatchRows(),
        returnItems:   this.returnRows(),
      };

      if (this.isEdit() && this.editId()) {
        await this.svc.update(this.editId()!, body);
        this.flash('success', 'Record updated successfully!');
      } else {
        await this.svc.create(body);
        this.flash('success', 'Entry saved successfully!');
      }
      setTimeout(() => this.router.navigate(['/dispatch']), 1400);
    } catch (err: any) {
      this.flash('error', err?.error?.message || 'Failed to save. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }

  reset() {
    this.dispatchDate.set(this.todayStr());
    this.totalPersons.set(0);
    this.pendingOrders.set(0);
    this.onlyInvoiced.set('NIL');
    this.dispatchRows.set(this.clone(DEFAULT_DISPATCH_ROWS));
    this.returnRows.set(this.clone(DEFAULT_RETURN_ROWS));
  }

  cancel() { this.router.navigate(['/dispatch']); }

  // ── Helpers ───────────────────────────────────────────────────────────────

  isGroupStart(rows: any[], i: number): boolean {
    return i === 0 || rows[i].channel !== rows[i - 1].channel;
  }

  private flash(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 3500);
  }

  private todayStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  private clone<T>(arr: T[]): T[] {
    return JSON.parse(JSON.stringify(arr));
  }
}