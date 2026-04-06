// src/components/hw-inventory/hw-inventory-form.component.ts
import { Component, ChangeDetectionStrategy, signal, OnInit } from '@angular/core';
import { CommonModule }    from '@angular/common';
import { FormsModule }     from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { HwInventoryService } from '../../services/hw-inventory.service';
import {
  HWAsset, HWCategory, HWStatus, HWLocation, HWFloor, OSVersion, WarrantyStatus,
  HW_CATEGORIES, HW_STATUSES, HW_LOCATIONS, HW_FLOORS, OS_VERSIONS,
  WARRANTY_STATUSES, HW_DEPARTMENTS,
} from '../../hw-inventory.models';

function empty(): Omit<HWAsset,'id'|'createdAt'|'updatedAt'> {
  return {
    assetId:'', category:'Desktop', manufacturer:'', model:'', serialNumber:'',
    location:'BandB', floor:null, department:null, assignedTo:null, place:null,
    processor:null, ramGb:null, hddGbTb:null, ssdGbTb:null, os:'Windows 11', ipAddress:null,
    status:'Active', warrantyStatus:'Unknown', warrantyExpiry:null,
    antivirusActive:null, remarks:null,
  };
}

@Component({
  selector: 'app-hw-inventory-form',
  templateUrl: './inventory-form.component.html',  // ← matches your filename
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
})
export class HwInventoryFormComponent implements OnInit {
  loading = signal(false);
  saving  = signal(false);
  isEdit  = signal(false);
  editId  = signal<number | null>(null);
  toast   = signal<{ type: 'success'|'error'; msg: string } | null>(null);

  asset = signal<Omit<HWAsset,'id'|'createdAt'|'updatedAt'>>(empty());

  readonly categories     = HW_CATEGORIES;
  readonly statuses       = HW_STATUSES;
  readonly locations      = HW_LOCATIONS;
  readonly floors         = HW_FLOORS;
  readonly osVersions     = OS_VERSIONS;
  readonly warrantyStates = WARRANTY_STATUSES;
  readonly departments    = HW_DEPARTMENTS;

  /** Show compute fields only for Desktop & Laptop */
  showComputeFields = signal(true);

  constructor(
    private svc:    HwInventoryService,
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
      let rec = this.svc.assets().find(a => a.id === id);
      if (!rec) { await this.svc.getAll(); rec = this.svc.assets().find(a => a.id === id); }
      if (rec) {
        const { id: _id, createdAt: _c, updatedAt: _u, ...data } = rec;
        this.asset.set({ ...data, warrantyExpiry: data.warrantyExpiry?.split('T')[0] ?? data.warrantyExpiry });
        this.showComputeFields.set(['Desktop','Laptop'].includes(data.category));
      }
    } finally { this.loading.set(false); }
  }

  patch(field: keyof Omit<HWAsset,'id'|'createdAt'|'updatedAt'>, value: any) {
    this.asset.update(a => {
      const updated = { ...a, [field]: value };
      if (field === 'category') {
        this.showComputeFields.set(['Desktop','Laptop'].includes(value));
      }
      return updated;
    });
  }

  async save() {
    const a = this.asset();
    if (!a.assetId.trim())    { this.flash('error','Asset ID is required.');    return; }
    if (!a.manufacturer.trim()){ this.flash('error','Manufacturer is required.'); return; }
    if (!a.model.trim())      { this.flash('error','Model is required.');        return; }

    // Serial number uniqueness check (skip when editing same record)
    if (a.serialNumber.trim()) {
      const dup = this.svc.assets().find(x =>
        x.serialNumber === a.serialNumber.trim() && x.id !== this.editId()
      );
      if (dup) { this.flash('error', `Serial number already exists on asset ${dup.assetId}.`); return; }
    }

    // Asset ID uniqueness
    const dupId = this.svc.assets().find(x =>
      x.assetId === a.assetId.trim() && x.id !== this.editId()
    );
    if (dupId) { this.flash('error', `Asset ID "${a.assetId}" is already in use.`); return; }

    this.saving.set(true);
    try {
      if (this.isEdit() && this.editId()) {
        await this.svc.update(this.editId()!, { ...a, id: this.editId()! } as HWAsset);
        this.flash('success', 'Asset updated successfully!');
      } else {
        await this.svc.create(a);
        this.flash('success', 'Asset added successfully!');
      }
      setTimeout(() => this.router.navigate(['/hw-inventory']), 1400);
    } catch (err: any) {
      this.flash('error', err?.error?.message || 'Failed to save. Please try again.');
    } finally { this.saving.set(false); }
  }

  reset()  { this.asset.set(empty()); this.showComputeFields.set(true); }
  cancel() { this.router.navigate(['/hw-inventory']); }

  private flash(type: 'success'|'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}