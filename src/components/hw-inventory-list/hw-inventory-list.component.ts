// src/components/hw-inventory-list/hw-inventory-list.component.ts
import { Component, ChangeDetectionStrategy, computed, signal, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { Router }       from '@angular/router';
import { HwInventoryService }  from '../../services/hw-inventory.service';
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
  loading  = this.svc.loading;
  deleteId = signal<number | null>(null);
  toast    = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  printingBulk = signal(false);
  selectedAssetIds = signal<Set<number>>(new Set());

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
  readonly selectedCount = computed(() => this.selectedAssetIds().size);

  readonly allPagedSelected = computed(() => {
    const paged = this.pagedAssets().filter(asset => !!asset.id);
    return paged.length > 0 && paged.every(asset => this.selectedAssetIds().has(asset.id!));
  });

  readonly allFilteredSelected = computed(() => {
    const filtered = this.filtered().filter(asset => !!asset.id);
    return filtered.length > 0 && filtered.every(asset => this.selectedAssetIds().has(asset.id!));
  });

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
      if (q && ![a.assetId, a.manufacturer, a.model, a.serialNumber,
                 a.assignedTo ?? '', a.department ?? '', a.ipAddress ?? '']
                .some(v => v.toLowerCase().includes(q))) return false;
      if (cat  && a.category       !== cat)  return false;
      if (stat && a.status         !== stat)  return false;
      if (loc  && a.location       !== loc)   return false;
      if (war  && a.warrantyStatus !== war)   return false;
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
    return this.searchTerm()       !== '' ||
           this.filterCategory()   !== '' ||
           this.filterStatus()     !== '' ||
           this.filterLocation()   !== '' ||
           this.filterWarranty()   !== '' ||
           this.showOnlyExpiring();
  }

  // Reset page when filters change (effect, not inside computed)
  private resetPage = effect(() => {
    this.searchTerm(); this.filterCategory(); this.filterStatus();
    this.filterLocation(); this.filterWarranty(); this.showOnlyExpiring();
    this.currentPage.set(1);
  }, { allowSignalWrites: true });

  private pruneSelection = effect(() => {
    const validIds = new Set(this.svc.assets().map(asset => asset.id).filter((id): id is number => !!id));
    const next = new Set(Array.from(this.selectedAssetIds()).filter(id => validIds.has(id)));

    if (next.size !== this.selectedAssetIds().size) {
      this.selectedAssetIds.set(next);
    }
  }, { allowSignalWrites: true });

  constructor(
    private svc: HwInventoryService,
    private router: Router,
    private labelPrinter: HwLabelPrintService,
  ) {}

  ngOnInit() { this.svc.getAll(); }

  // ── Navigation ──────────────────────────────────────────────────────────────
  openAdd()             { this.router.navigate(['/hw-inventory/new']); }
  openEdit(id?: number) { this.router.navigate(['/hw-inventory', id ?? 'new']); }

  // ── Print label ─────────────────────────────────────────────────────────────
  async printLabel(asset: HWAsset) {
    if (!asset.id) { this.flash('error', 'Unable to print label for this asset.'); return; }
    try {
      await this.labelPrinter.printLabel(asset.id);
      this.flash('success', 'Label sent to printer.');
    } catch (err: any) {
      this.flash('error', err?.message || err?.error?.message || 'Failed to print label.');
    }
  }

  isSelected(assetId?: number | null): boolean {
    return !!assetId && this.selectedAssetIds().has(assetId);
  }

  toggleAssetSelection(assetId: number, checked: boolean) {
    const next = new Set(this.selectedAssetIds());
    if (checked) {
      next.add(assetId);
    } else {
      next.delete(assetId);
    }
    this.selectedAssetIds.set(next);
  }

  toggleSelectAllOnPage(checked: boolean) {
    const next = new Set(this.selectedAssetIds());
    for (const asset of this.pagedAssets()) {
      if (!asset.id) continue;
      if (checked) {
        next.add(asset.id);
      } else {
        next.delete(asset.id);
      }
    }
    this.selectedAssetIds.set(next);
  }

  toggleSelectAllFiltered(checked: boolean) {
    const next = new Set(this.selectedAssetIds());
    for (const asset of this.filtered()) {
      if (!asset.id) continue;
      if (checked) {
        next.add(asset.id);
      } else {
        next.delete(asset.id);
      }
    }
    this.selectedAssetIds.set(next);
  }

  clearSelection() {
    this.selectedAssetIds.set(new Set());
  }

  async bulkPrintSelected() {
    const assetIds = Array.from(this.selectedAssetIds());
    if (assetIds.length === 0) {
      this.flash('error', 'Select at least one asset to print labels.');
      return;
    }

    this.printingBulk.set(true);
    try {
      const result = await this.labelPrinter.printLabels(assetIds);

      if (result.failedIds.length === 0) {
        this.flash('success', `${result.successCount} label${result.successCount !== 1 ? 's' : ''} sent to printer.`);
        this.clearSelection();
        return;
      }

      const successPart = result.successCount > 0
        ? `${result.successCount} label${result.successCount !== 1 ? 's' : ''} printed, `
        : '';
      this.flash('error', `${successPart}${result.failedIds.length} failed. Please check the local print agent and printer.`);
    } finally {
      this.printingBulk.set(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
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

  // ── Filter reset ────────────────────────────────────────────────────────────
  clearFilters() {
    this.searchTerm.set('');
    this.filterCategory.set('');
    this.filterStatus.set('');
    this.filterLocation.set('');
    this.filterWarranty.set('');
    this.showOnlyExpiring.set(false);
    this.currentPage.set(1);
  }

  // ── Template helper methods (used in HTML) ──────────────────────────────────

  isExpiringSoon(asset: HWAsset): boolean {
    if (!asset.warrantyExpiry || asset.warrantyStatus !== 'In Warranty') return false;
    const today = new Date();
    const in90  = new Date(today.getTime() + 90 * 86400_000);
    const exp   = new Date(asset.warrantyExpiry);
    return exp >= today && exp <= in90;
  }

  formatDate(dateStr?: string | null): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  statusStyle(status: HWStatus): string {
    const map: Record<string, string> = {
      'Active':    'background:#D1FAE5; color:#065F46;',
      'Spare':     'background:#DBEAFE; color:#1e40af;',
      'Faulty':    'background:#FEE2E2; color:#991B1B;',
      'In Repair': 'background:#FEF3C7; color:#92400E;',
      'Retired':   'background:#F3F4F6; color:#374151;',
    };
    return map[status] ?? 'background:#F3F4F6; color:#374151;';
  }

  warrantyStyle(status: WarrantyStatus): string {
    const map: Record<string, string> = {
      'In Warranty':  'background:#D1FAE5; color:#065F46;',
      'Out of Warranty': 'background:#FEE2E2; color:#991B1B;',
      'Unknown':      'background:#F3F4F6; color:#374151;',
    };
    return map[status] ?? 'background:#F3F4F6; color:#374151;';
  }

  categoryIcon(cat: HWCategory): string {
    const icons: Record<string, string> = {
      Desktop: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
      Laptop:  'M3 7h18M3 7a2 2 0 00-2 2v6a2 2 0 002 2h18a2 2 0 002-2V9a2 2 0 00-2-2M3 7V5a2 2 0 012-2h14a2 2 0 012 2v2M1 17h22',
      Printer: 'M6 9V4h12v5M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v6H6v-6z',
      Scanner: 'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18',
    };
    return icons[cat] ?? icons['Desktop'];
  }

  private flash(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 3000);
  }
}
