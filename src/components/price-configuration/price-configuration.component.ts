import { Component, ChangeDetectionStrategy, ChangeDetectorRef, ElementRef, computed, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PaginationComponent } from '../shared/pagination.component';
import { PriceConfigurationService } from '../../services/price-configuration.service';
import { PriceConfigurationExportService } from '../../services/price-configuration-export.service';
import { PriceLabelPrintService } from '../../services/price-label-print.service';
import {
  ItemMasterItem,
  ItemMasterMeta,
  ItemMasterPage,
  PriceConfigItem,
  PriceConfigPreview,
  PriceConfigRecord,
  PriceConfigRecordSummary,
} from '../../price-configuration.models';

const EMPTY_MASTER_META: ItemMasterMeta = {
  hasData: false,
  totalItems: 0,
  lastUploadFileName: null,
  lastUploadedAt: null,
};

@Component({
  selector: 'app-price-configuration',
  templateUrl: './price-configuration.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, PaginationComponent],
})
export class PriceConfigurationComponent {
  readonly records = this.service.records;
  readonly recordsLoading = this.service.loading;

  readonly toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  readonly preview = signal<PriceConfigPreview | null>(null);
  readonly activeRecordId = signal<number | null>(null);
  readonly activeConfigurationNo = signal<string | null>(null);
  readonly selectedSerialNo = signal<number | null>(null);
  readonly showUnmatchedOnly = signal(false);

  readonly itemMasterMeta = signal<ItemMasterMeta>(EMPTY_MASTER_META);
  readonly itemMasterRows = signal<ItemMasterItem[]>([]);
  readonly itemMasterTotal = signal(0);
  readonly itemMasterPage = signal(1);
  readonly itemMasterLimit = 12;
  readonly itemMasterSearch = signal('');
  readonly itemMasterLoading = signal(false);
  readonly itemMasterUploading = signal(false);
  readonly savingMasterIds = signal<Set<number>>(new Set());

  readonly generating = signal(false);
  readonly saving = signal(false);
  readonly printing = signal(false);

  readonly itemMasterFile = signal<File | null>(null);
  readonly pickListFile = signal<File | null>(null);

  readonly visibleItems = computed(() => {
    const preview = this.preview();
    if (!preview) return [];
    return this.showUnmatchedOnly()
      ? preview.items.filter((item) => item.matchStatus === 'Unmatched')
      : preview.items;
  });

  readonly selectedItem = computed(() => {
    const items = this.visibleItems();
    if (!items.length) return null;
    const serialNo = this.selectedSerialNo();
    return items.find((item) => item.serialNo === serialNo) || items[0];
  });

  readonly totalValue = computed(() =>
    this.preview()?.items.reduce((sum, item) => sum + item.totalPrice, 0) ?? 0
  );

  readonly labelCommandPreview = computed(() => {
    const item = this.selectedItem();
    const preview = this.preview();
    if (!item || !preview) return '';
    return this.buildLabelCommand(item, preview);
  });

  readonly masterPages = computed(() =>
    Math.max(1, Math.ceil(this.itemMasterTotal() / this.itemMasterLimit))
  );

  constructor(
    private service: PriceConfigurationService,
    private exportService: PriceConfigurationExportService,
    private labelPrintService: PriceLabelPrintService,
    private cdr: ChangeDetectorRef,
    private el: ElementRef,
  ) {
    this.service.getAll();
    this.loadItemMaster();

    effect(() => {
      const items = this.visibleItems();
      const selectedSerialNo = this.selectedSerialNo();
      if (!items.length) {
        this.selectedSerialNo.set(null);
        return;
      }
      if (selectedSerialNo == null || !items.some((item) => item.serialNo === selectedSerialNo)) {
        this.selectedSerialNo.set(items[0].serialNo);
      }
    }, { allowSignalWrites: true });
  }

  async loadItemMaster(page = this.itemMasterPage(), keepPage = false) {
    this.itemMasterLoading.set(true);
    try {
      const result = await this.service.getItemMaster(
        this.itemMasterSearch(),
        page,
        this.itemMasterLimit,
      );
      this.applyItemMasterPage(result, keepPage ? this.itemMasterPage() : page);
    } catch (err: any) {
      this.flash('error', err?.error?.message || err?.message || 'Failed to load item master data.');
    } finally {
      this.itemMasterLoading.set(false);
    }
  }

  onItemMasterSearch(value: string) {
    this.itemMasterSearch.set(value);
    this.itemMasterPage.set(1);
    this.loadItemMaster(1);
  }

  onItemMasterPageChange(page: number) {
    this.itemMasterPage.set(page);
    this.loadItemMaster(page);
  }

  setItemMasterFile(event: Event) {
    this.itemMasterFile.set((event.target as HTMLInputElement)?.files?.[0] ?? null);
  }

  setPickListFile(event: Event) {
    this.pickListFile.set((event.target as HTMLInputElement)?.files?.[0] ?? null);
  }

  async importItemMaster() {
    const file = this.itemMasterFile();
    if (!file) {
      this.flash('error', 'Choose the item master Excel file before importing.');
      return;
    }

    this.itemMasterUploading.set(true);
    try {
      const result = await this.service.importItemMaster(file);
      this.itemMasterFile.set(null);
      this.applyItemMasterPage(result, 1);
      this.flash('success', `Imported ${result.meta.totalItems} item master rows successfully.`);
    } catch (err: any) {
      this.flash('error', err?.error?.message || err?.message || 'Failed to import item master.');
    } finally {
      this.itemMasterUploading.set(false);
    }
  }

  updateMasterField(id: number, field: keyof ItemMasterItem, value: string | number) {
    this.itemMasterRows.update((rows) =>
      rows.map((row) => row.id === id
        ? {
            ...row,
            [field]: field === 'mrp' || field === 'costPrice'
              ? this.toNumber(value)
              : String(value ?? ''),
          }
        : row)
    );
  }

  async saveMasterRow(row: ItemMasterItem) {
    this.markMasterSaving(row.id, true);
    try {
      const updated = await this.service.updateItemMasterItem(row);
      this.itemMasterRows.update((rows) => rows.map((item) => item.id === row.id ? updated : item));
      this.flash('success', `Updated item master row for ${updated.skuCode}.`);
    } catch (err: any) {
      this.flash('error', err?.error?.message || err?.message || 'Failed to update item master row.');
    } finally {
      this.markMasterSaving(row.id, false);
    }
  }

  isMasterSaving(id: number): boolean {
    return this.savingMasterIds().has(id);
  }

  async generatePreview() {
    if (!this.itemMasterMeta().hasData) {
      this.flash('error', 'Upload the item master first. After that you only need to re-upload when master data changes.');
      return;
    }
    const pickListFile = this.pickListFile();
    if (!pickListFile) {
      this.flash('error', 'Choose the pick list PDF or Excel file first.');
      return;
    }

    this.generating.set(true);
    try {
      const preview = await this.service.generatePreview(pickListFile);
      this.preview.set(preview);
      this.activeRecordId.set(null);
      this.activeConfigurationNo.set(null);
      this.selectedSerialNo.set(preview.items[0]?.serialNo ?? null);
      this.cdr.markForCheck();
      this.flash('success', `Loaded ${preview.totalLines} pick list rows for price review.`);
      this.scrollToPreview();
    } catch (err: any) {
      this.flash('error', err?.error?.message || err?.message || 'Failed to generate the pick list preview.', 7000);
    } finally {
      this.generating.set(false);
    }
  }

  async openRecord(record: PriceConfigRecordSummary) {
    this.generating.set(true);
    try {
      const loaded = await this.service.getById(record.id);
      this.applyLoadedRecord(loaded);
      this.cdr.markForCheck();
      this.flash('success', `Loaded configuration ${loaded.configurationNo}.`);
      this.scrollToPreview();
    } catch (err: any) {
      this.flash('error', err?.error?.message || err?.message || 'Failed to load the saved configuration.', 7000);
    } finally {
      this.generating.set(false);
    }
  }

  selectItem(item: PriceConfigItem) {
    this.selectedSerialNo.set(item.serialNo);
  }

  updateItem(serialNo: number, field: keyof PriceConfigItem, rawValue: string | number) {
    this.preview.update((preview) => {
      if (!preview) return preview;

      const items = preview.items.map((item) => {
        if (item.serialNo !== serialNo) return item;

        const next = { ...item } as PriceConfigItem;
        if (field === 'qty' || field === 'labelQty' || field === 'currentPrice' || field === 'costPrice') {
          (next as any)[field] = this.toNumber(rawValue);
        } else {
          (next as any)[field] = String(rawValue ?? '');
        }

        next.totalPrice = Number((this.toNumber(next.qty) * this.toNumber(next.currentPrice)).toFixed(2));
        return next;
      });

      return {
        ...preview,
        items,
        totalLines: items.length,
        totalQuantity: items.reduce((sum, item) => sum + item.qty, 0),
        matchedCount: items.filter((item) => item.matchStatus === 'Matched').length,
        unmatchedCount: items.filter((item) => item.matchStatus === 'Unmatched').length,
      };
    });
  }

  async saveConfiguration(printAfterSave = false) {
    const preview = this.preview();
    if (!preview) {
      this.flash('error', 'Generate or load a pick list preview before saving.');
      return;
    }

    this.saving.set(true);
    try {
      const saved = await this.service.save({
        id: this.activeRecordId() ?? undefined,
        pickListNo: preview.pickListNo,
        pickListCreatedAt: preview.pickListCreatedAt,
        itemMasterFileName: preview.itemMasterFileName,
        itemMasterUploadedAt: preview.itemMasterUploadedAt,
        pickListFileName: preview.pickListFileName,
        labelTemplate: preview.labelTemplate,
        items: preview.items,
      });

      this.applyLoadedRecord(saved);
      await this.service.getAll();
      this.flash('success', `Configuration ${saved.configurationNo} saved successfully.`);

      if (printAfterSave) {
        this.printLabels();
      }
    } catch (err: any) {
      this.flash('error', err?.error?.message || err?.message || 'Failed to save the price configuration.');
    } finally {
      this.saving.set(false);
    }
  }

  downloadPickList() {
    const preview = this.preview();
    if (!preview) {
      this.flash('error', 'Nothing is available to export yet.');
      return;
    }
    this.exportService.download(preview, this.activeConfigurationNo());
  }

  printLabels() {
    const preview = this.preview();
    if (!preview) {
      this.flash('error', 'Save the pick list before printing labels.');
      return;
    }

    this.printing.set(true);
    try {
      this.labelPrintService.print(preview, this.activeConfigurationNo());
    } finally {
      setTimeout(() => this.printing.set(false), 500);
    }
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(this.toNumber(value));
  }

  formatDate(value?: string | null): string {
    if (!value) return '-';
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return value;
  }

  statusStyle(status: string): string {
    return status === 'Matched'
      ? 'background:#DCFCE7; color:#166534;'
      : 'background:#FEE2E2; color:#991B1B;';
  }

  private applyItemMasterPage(result: ItemMasterPage, page: number) {
    this.itemMasterMeta.set(result.meta);
    this.itemMasterRows.set(result.data);
    this.itemMasterTotal.set(result.total);
    this.itemMasterPage.set(page);
  }

  private applyLoadedRecord(record: PriceConfigRecord) {
    this.preview.set({
      pickListNo: record.pickListNo,
      pickListCreatedAt: record.pickListCreatedAt,
      totalLines: record.totalLines,
      totalQuantity: record.totalQuantity,
      matchedCount: record.matchedCount,
      unmatchedCount: record.unmatchedCount,
      itemMasterFileName: record.itemMasterFileName,
      itemMasterUploadedAt: record.itemMasterUploadedAt,
      pickListFileName: record.pickListFileName,
      labelTemplate: record.labelTemplate,
      items: record.items,
    });
    this.activeRecordId.set(record.id);
    this.activeConfigurationNo.set(record.configurationNo);
    this.selectedSerialNo.set(record.items[0]?.serialNo ?? null);
  }

  private markMasterSaving(id: number, saving: boolean) {
    this.savingMasterIds.update((ids) => {
      const next = new Set(ids);
      if (saving) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  private buildLabelCommand(item: PriceConfigItem, preview: PriceConfigPreview): string {
    const brand = this.escapeForZpl(item.brand || 'UATHAYAM');
    const labelName = this.escapeForZpl(item.itemName || item.pickListName || item.skuCode);
    const barcode = this.escapeForZpl(item.ean || item.skuCode);
    const color = this.escapeForZpl(item.color || '-');
    const size = this.escapeForZpl(item.size || '-');
    const mrp = this.escapeForZpl(item.currentPrice.toFixed(2));
    const quantity = this.escapeForZpl(String(item.labelQty || item.qty || 1));

    return [
      '^XA',
      '^PRC',
      '^LH0,0^FS',
      '^LL384',
      '^MD25',
      '^MNY',
      '^FO135,182^A0N,18,21^CI13^FR^FDBrand : ^FS',
      `^FO225,200^A0N,18,25^CI13^FR^FD${labelName}^FS`,
      '^FO420,122^A0N,18,23^CI13^FR^FDSIZE : ^FS',
      `^FO480,122^A0N,22,28^CI13^FR^FD${size}^FS`,
      '^FO420,142^A0N,18,23^CI13^FR^FDColor : ^FS',
      `^FO490,142^A0N,18,23^CI13^FR^FD${color}^FS`,
      '^FO135,162^A0N,18,21^CI13^FR^FDCategory :^FS',
      `^FO225,162^A0N,18,21^CI13^FR^FD${brand}^FS`,
      '^FO135,133^A0N,30,18^CI13^FR^FDMRP^FS',
      `^FO185,133^A0N,30,15^CI13^FR^FDRs.${mrp}^FS`,
      '^FO245,133^A0N,23,18^CI13^FR^FD(Incl.of all Taxes)^FS',
      '^FO420,180^A0N,18,22^CI13^FR^FDCountry Of Origin : India^FS',
      `^FO135,220^A0N,20,25^CI13^FR^FDMfg & Mktd by : ${this.escapeForZpl(preview.labelTemplate.companyName)}^FS`,
      `^FO135,240^A0N,20,18^CI13^FR^FD${this.escapeForZpl(preview.labelTemplate.unitLine)}^FS`,
      `^FO360,240^A0N,20,18^CI13^FR^FD${this.escapeForZpl(preview.labelTemplate.website)}^FS`,
      `^FO420,260^A0N,20,18^CI13^FR^FD${this.escapeForZpl(preview.labelTemplate.email)}^FS`,
      '^BY1.5,10^FO135,12^BCN,90,N,Y,N^FR',
      `^FD${barcode}^FS`,
      '^FO135,112^A0N,17,25^CI13^FR',
      `^FD${barcode}^FS`,
      `^FO490,162^A0N,20,18^CI13^FR^FD${quantity}N^FS`,
      `^PQ${quantity},0,0,N`,
      '^XZ',
    ].join('\n');
  }

  private escapeForZpl(value: string): string {
    return String(value || '').replace(/\^/g, '').replace(/~/g, '').replace(/"/g, '');
  }

  private toNumber(value: string | number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private scrollToPreview() {
    setTimeout(() => {
      const el = this.el.nativeElement.querySelector('#price-config-preview');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  private flash(type: 'success' | 'error', msg: string, durationMs = 3200) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), durationMs);
  }
}
