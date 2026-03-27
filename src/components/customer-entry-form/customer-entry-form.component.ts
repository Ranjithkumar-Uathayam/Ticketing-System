// src/components/customer-entry-form/customer-entry-form.component.ts
import { Component, ChangeDetectionStrategy, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { CustomerEntryService } from '../../services/customer-entry.service';
import { CustomerEntry, emptyCustomerEntry } from '../../customer-entry.models';

@Component({
  selector: 'app-customer-entry-form',
  templateUrl: './customer-entry-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
})
export class CustomerEntryFormComponent implements OnInit {
  loading = signal(false);
  saving  = signal(false);
  isEdit  = signal(false);
  editId  = signal<number | null>(null);
  toast   = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Form data as a single mutable signal object
  entry = signal<Omit<CustomerEntry, 'id' | 'createdAt' | 'updatedAt'>>(emptyCustomerEntry());

  constructor(
    private svc:    CustomerEntryService,
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
        const { id: _id, createdAt: _c, updatedAt: _u, ...data } = rec;
        this.entry.set({ ...data, entryDate: data.entryDate?.split('T')[0] ?? data.entryDate });
      }
    } finally {
      this.loading.set(false);
    }
  }

  // Generic patch — for text fields and checkboxes
  patch(field: keyof Omit<CustomerEntry, 'id' | 'createdAt' | 'updatedAt'>, value: any) {
    this.entry.update(e => ({ ...e, [field]: value }));
  }

  // Safe numeric patch — parses the raw input string and clamps to ≥ 0
  // Called from templates instead of Math.max (Math is not available in Angular templates)
  patchNum(field: keyof Omit<CustomerEntry, 'id' | 'createdAt' | 'updatedAt'>, raw: string) {
    const parsed = parseFloat(raw);
    const value  = isNaN(parsed) ? 0 : Math.max(0, parsed);
    this.entry.update(e => ({ ...e, [field]: value }));
  }

  // Safe integer patch — for QTY fields
  patchInt(field: keyof Omit<CustomerEntry, 'id' | 'createdAt' | 'updatedAt'>, raw: string) {
    const parsed = parseInt(raw, 10);
    const value  = isNaN(parsed) ? 0 : Math.max(0, parsed);
    this.entry.update(e => ({ ...e, [field]: value }));
  }

  async save() {
    const e = this.entry();
    if (!e.entryDate)    { this.flash('error', 'Please select an entry date.');    return; }
    if (!e.employeeName) { this.flash('error', 'Employee name is required.');      return; }
    if (!e.employeeId)   { this.flash('error', 'Employee ID is required.');        return; }

    this.saving.set(true);
    try {
      if (this.isEdit() && this.editId()) {
        await this.svc.update(this.editId()!, { ...e, id: this.editId()! });
        this.flash('success', 'Record updated successfully!');
      } else {
        await this.svc.create(e);
        this.flash('success', 'Entry saved successfully!');
      }
      setTimeout(() => this.router.navigate(['/customer-entry']), 1400);
    } catch (err: any) {
      this.flash('error', err?.error?.message || 'Failed to save. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }

  reset() {
    this.entry.set(emptyCustomerEntry());
  }

  cancel() {
    this.router.navigate(['/customer-entry']);
  }

  private flash(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 3500);
  }
}