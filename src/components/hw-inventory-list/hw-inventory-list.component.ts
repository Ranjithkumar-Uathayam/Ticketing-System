// src/components/hw-inventory-list/hw-inventory-list.component.ts  (UPDATED — pagination)
import { Component, ChangeDetectionStrategy, computed, signal, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { Router }       from '@angular/router';
import { HwInventoryService } from '../../services/hw-inventory.service';
import { HwLabelPrintService } from '../../services/hw-label-print.service';
import {
  HWAsset, HWCategory, HWStatus, HWLocation, WarrantyStatus,
  HW_CATEGORIES, HW_STATUSES, HW_LOCATIONS, WARRANTY_STATUSES,
} from '../../hw-inventory.models';
import { PaginationComponent } from '../shared/pagination.component';

@Component({
  selector: 'app-hw-inventory-list',
  templateUrl: './hw-inventory-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, PaginationComponent],
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

  // ── Pagination ──────────────────────────────────────────────────────────────
  currentPage = signal(1);
  readonly pageSize = 20;

  // ── Summary stats ──────────────────────────────────────────────────────────
  summary = computed(() => {
    const all   = this.svc.assets();
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

  // ── Paginated slice ─────────────────────────────────────────────────────────
  pagedAssets = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filtered().slice(start, start + this.pageSize);
  });

  get hasFilters(): boolean {
    return this.searchTerm() !== '' ||
      this.filterCategory() !== '' ||
      this.filterStatus()   !== '' ||
      this.filterLocation() !== '' ||
      this.filterWarranty() !== '' ||
      this.showOnlyExpiring();
  }

  // Reset to page 1 whenever filters change
  private resetEffect = effect(() => {
    this.searchTerm(); this.filterCategory(); this.filterStatus();
    this.filterLocation(); this.filterWarranty(); this.showOnlyExpiring();
    this.currentPage.set(1);
  }, { allowSignalWrites: true });

  constructor(
    private svc: HwInventoryService,
    private router: Router,
    private labelPrinter: HwLabelPrintService,
  ) {}

  ngOnInit() { this.svc.getAll(); }

  openAdd()             { this.router.navigate(['/hw-inventory/new']); }
  openEdit(id?: number) { this.router.navigate(['/hw-inventory', id ?? 'new']); }

  async printLabel(asset: HWAsset) {
    if (!asset.id) { this.flash('error', 'Unable to print label for this asset.'); return; }
    try {
      await this.labelPrinter.printLabel(asset.id);
      this.flash('success', 'Label sent to printer.');
    } catch (err: any) {
      this.flash('error', err?.error?.message || 'Failed to print label.');
    }
  }

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
    this.currentPage.set(1);
  }

  private flash(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 3000);
  }
}