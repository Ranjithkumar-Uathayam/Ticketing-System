// src/components/hw-inventory/hw-inventory-list.component.ts
import { Component, ChangeDetectionStrategy, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { Router }       from '@angular/router';
import { HwInventoryService } from '../../services/hw-inventory.service';
import {
  HWAsset, HWCategory, HWStatus, HWLocation, WarrantyStatus,
  HW_CATEGORIES, HW_STATUSES, HW_LOCATIONS, WARRANTY_STATUSES,
} from '../../hw-inventory.models';

@Component({
  selector: 'app-hw-inventory-list',
  templateUrl: './hw-inventory-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
})
export class HwInventoryListComponent implements OnInit {
  loading     = this.svc.loading;
  deleteId    = signal<number | null>(null);
  toast       = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  // ── Filters ────────────────────────────────────────────────────────────────
  searchTerm       = signal('');
  filterCategory   = signal<HWCategory | ''>('');
  filterStatus     = signal<HWStatus | ''>('');
  filterLocation   = signal<HWLocation | ''>('');
  filterWarranty   = signal<WarrantyStatus | ''>('');
  showOnlyExpiring = signal(false);

  readonly categories     = HW_CATEGORIES;
  readonly statuses       = HW_STATUSES;
  readonly locations      = HW_LOCATIONS;
  readonly warrantyStates = WARRANTY_STATUSES;

  // ── Summary stats ──────────────────────────────────────────────────────────
  summary = computed(() => {
    const all = this.svc.assets();
    const today = new Date();
    const in90  = new Date(today.getTime() + 90 * 86400_000);
    return {
      total:        all.length,
      active:       all.filter(a => a.status === 'Active').length,
      spare:        all.filter(a => a.status === 'Spare').length,
      faulty:       all.filter(a => a.status === 'Faulty' || a.status === 'In Repair').length,
      inWarranty:   all.filter(a => a.warrantyStatus === 'In Warranty').length,
      expiringSoon: all.filter(a => {
        if (!a.warrantyExpiry || a.warrantyStatus !== 'In Warranty') return false;
        const exp = new Date(a.warrantyExpiry);
        return exp >= today && exp <= in90;
      }).length,
      desktop: all.filter(a => a.category === 'Desktop').length,
      laptop:  all.filter(a => a.category === 'Laptop').length,
      printer: all.filter(a => a.category === 'Printer').length,
      scanner: all.filter(a => a.category === 'Scanner').length,
    };
  });

  // ── Filtered list ──────────────────────────────────────────────────────────
  filtered = computed(() => {
    const q    = this.searchTerm().toLowerCase();
    const cat  = this.filterCategory();
    const stat = this.filterStatus();
    const loc  = this.filterLocation();
    const war  = this.filterWarranty();
    const exp  = this.showOnlyExpiring();

    const today = new Date();
    const in90  = new Date(today.getTime() + 90 * 86400_000);

    return this.svc.assets().filter(a => {
      if (q && ![a.assetId, a.manufacturer, a.model, a.serialNumber, a.assignedTo ?? '',
                 a.department ?? '', a.ipAddress ?? ''].some(v => v.toLowerCase().includes(q))) return false;
      if (cat  && a.category        !== cat)  return false;
      if (stat && a.status          !== stat)  return false;
      if (loc  && a.location        !== loc)   return false;
      if (war  && a.warrantyStatus  !== war)   return false;
      if (exp  && a.warrantyExpiry) {
        const d = new Date(a.warrantyExpiry);
        if (!(d >= today && d <= in90)) return false;
      }
      return true;
    });
  });

  constructor(private svc: HwInventoryService, private router: Router) {}

  ngOnInit() { this.svc.getAll(); }

  openAdd()         { this.router.navigate(['/hw-inventory/new']); }
  openEdit(id?: number) { this.router.navigate(['/hw-inventory', id ?? 'new']); }

  requestDelete(id: number) { this.deleteId.set(id); }
  cancelDelete()            { this.deleteId.set(null); }

  async confirmDelete() {
    const id = this.deleteId();
    if (!id) return;
    try {
      await this.svc.remove(id);
      this.flash('success', 'Asset deleted.');
    } catch {
      this.flash('error', 'Failed to delete asset.');
    } finally {
      this.deleteId.set(null);
    }
  }

  clearFilters() {
    this.searchTerm.set('');
    this.filterCategory.set('');
    this.filterStatus.set('');
    this.filterLocation.set('');
    this.filterWarranty.set('');
    this.showOnlyExpiring.set(false);
  }

  get hasFilters(): boolean {
    return !!(this.searchTerm() || this.filterCategory() || this.filterStatus() ||
              this.filterLocation() || this.filterWarranty() || this.showOnlyExpiring());
  }

  statusStyle(s: HWStatus): string {
    const m: Record<HWStatus, string> = {
      'Active':    'background:#F0FDF4; color:#15803d;',
      'Spare':     'background:#EFF6FF; color:#1d4ed8;',
      'Faulty':    'background:#FEF2F2; color:#DC2626;',
      'In Repair': 'background:#FFF7ED; color:#c2410c;',
      'Disposed':  'background:#F1F5F9; color:#64748b;',
      'New':       'background:#F0F9FF; color:#0284c7;',
    };
    return m[s] ?? '';
  }

  warrantyStyle(w: WarrantyStatus): string {
    const m: Record<WarrantyStatus, string> = {
      'In Warranty':     'background:#ECFDF5; color:#059669;',
      'Out of Warranty': 'background:#FFF7ED; color:#c2410c;',
      'Expired':         'background:#FEF2F2; color:#DC2626;',
      'Unknown':         'background:#F1F5F9; color:#64748b;',
    };
    return m[w] ?? '';
  }

  categoryIcon(c: HWCategory): string {
    const m: Record<HWCategory, string> = {
      Desktop: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
      Laptop:  'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
      Printer: 'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z',
      Scanner: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z',
      Other:   'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18',
    };
    return m[c];
  }

  formatDate(d?: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
  }

  isExpiringSoon(a: HWAsset): boolean {
    if (!a.warrantyExpiry || a.warrantyStatus !== 'In Warranty') return false;
    const exp  = new Date(a.warrantyExpiry);
    const in90 = new Date(Date.now() + 90 * 86400_000);
    return exp >= new Date() && exp <= in90;
  }

  private flash(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 3000);
  }
}