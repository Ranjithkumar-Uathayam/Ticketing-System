import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PriceConfigurationService } from '../../services/price-configuration.service';
import {
  PriceLabelTsplPrintService,
  PriceLabelPrintSettings,
  DEFAULT_PRICE_LABEL_SETTINGS,
} from '../../services/price-label-tspl-print.service';
import {
  PriceConfigItem,
  PriceConfigPreview,
} from '../../price-configuration.models';
import { environment } from '../../environments/environment';

const SETTINGS_STORAGE_KEY = 'price_label_print_settings';

@Component({
  selector: 'app-label-print-config',
  templateUrl: './label-print-config.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
})
export class LabelPrintConfigComponent {
  readonly records        = this.configService.records;
  readonly recordsLoading = this.configService.loading;

  readonly toast            = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  readonly preview          = signal<PriceConfigPreview | null>(null);
  readonly selectedConfigId = signal<number | null>(null);
  readonly loadingConfig    = signal(false);
  readonly printing         = signal(false);
  readonly settingsOpen     = signal(true);

  readonly availablePrinters  = signal<string[]>([]);
  readonly detectingPrinters  = signal(false);
  readonly printerDetectError = signal<string | null>(null);

  /** Serial numbers of checked items */
  readonly selectedSerialNos = signal<Set<number>>(new Set());
  /** Serial number of the item currently shown in the label preview */
  readonly previewSerialNo   = signal<number | null>(null);

  readonly printSettings = signal<PriceLabelPrintSettings>(this.loadSavedSettings());

  // ── Computed ────────────────────────────────────────────────────────────────

  readonly items = computed(() => this.preview()?.items ?? []);

  readonly previewItem = computed(() => {
    const items = this.items();
    if (!items.length) return null;
    const sn = this.previewSerialNo();
    return items.find(i => i.serialNo === sn) ?? items[0];
  });

  readonly selectedItems = computed(() => {
    const sns = this.selectedSerialNos();
    return this.items().filter(i => sns.has(i.serialNo));
  });

  readonly allSelected = computed(() => {
    const items = this.items();
    if (!items.length) return false;
    return items.every(i => this.selectedSerialNos().has(i.serialNo));
  });

  readonly someSelected = computed(() => {
    const items = this.items();
    if (!items.length) return false;
    const sns = this.selectedSerialNos();
    return items.some(i => sns.has(i.serialNo)) && !this.allSelected();
  });

  readonly totalLabelCount = computed(() =>
    this.selectedItems().reduce((s, i) => s + Math.max(1, i.labelQty || i.qty || 1), 0)
  );

  readonly allLabelCount = computed(() =>
    this.items().reduce((s, i) => s + Math.max(1, i.labelQty || i.qty || 1), 0)
  );

  // Preview dimensions: inner at 3.78 px/mm, outer = inner × 1.8 scale
  readonly previewInnerWidthPx  = computed(() => Math.round(this.printSettings().labelWidthMm  * 3.78));
  readonly previewInnerHeightPx = computed(() => Math.round(this.printSettings().labelHeightMm * 3.78));
  readonly previewOuterWidthPx  = computed(() => Math.round(this.previewInnerWidthPx()  * 1.8));
  readonly previewOuterHeightPx = computed(() => Math.round(this.previewInnerHeightPx() * 1.8));

  readonly isNonStandardSize = computed(() =>
    this.printSettings().labelWidthMm !== 90 || this.printSettings().labelHeightMm !== 44
  );

  constructor(
    private configService: PriceConfigurationService,
    private printService:  PriceLabelTsplPrintService,
    private cdr: ChangeDetectorRef,
  ) {
    this.configService.getAll();
  }

  // ── Settings persistence ─────────────────────────────────────────────────────

  private loadSavedSettings(): PriceLabelPrintSettings {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<PriceLabelPrintSettings>;
        return {
          ...DEFAULT_PRICE_LABEL_SETTINGS,
          printerName: (environment as any).hwLabelPrinterName || 'TSC TTP-244 Pro',
          ...parsed,
        };
      }
    } catch { /* ignore parse errors */ }
    return {
      ...DEFAULT_PRICE_LABEL_SETTINGS,
      printerName: (environment as any).hwLabelPrinterName || 'TSC TTP-244 Pro',
    };
  }

  private persistSettings(): void {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.printSettings()));
    } catch { /* ignore storage errors */ }
  }

  // ── Config loading ───────────────────────────────────────────────────────────

  onConfigSelect(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value);
    this.selectedConfigId.set(isNaN(id) ? null : id);
  }

  async loadConfig(): Promise<void> {
    const id = this.selectedConfigId();
    if (!id) { this.flash('error', 'Select a configuration first.'); return; }

    this.loadingConfig.set(true);
    this.preview.set(null);
    this.selectedSerialNos.set(new Set());
    this.previewSerialNo.set(null);

    try {
      const record = await this.configService.getById(id);
      this.preview.set({
        pickListNo:            record.pickListNo,
        pickListCreatedAt:     record.pickListCreatedAt,
        totalLines:            record.totalLines,
        totalQuantity:         record.totalQuantity,
        matchedCount:          record.matchedCount,
        unmatchedCount:        record.unmatchedCount,
        itemMasterFileName:    record.itemMasterFileName,
        itemMasterUploadedAt:  record.itemMasterUploadedAt,
        pickListFileName:      record.pickListFileName,
        labelTemplate:         record.labelTemplate,
        items:                 record.items,
      });
      this.selectedSerialNos.set(new Set(record.items.map(i => i.serialNo)));
      if (record.items.length) {
        this.previewSerialNo.set(record.items[0].serialNo);
      }
      this.cdr.markForCheck();
      this.flash('success', `Loaded "${record.configurationNo}" — ${record.totalLines} items.`);
    } catch (err: any) {
      this.flash('error', err?.error?.message || err?.message || 'Failed to load configuration.');
    } finally {
      this.loadingConfig.set(false);
    }
  }

  // ── Item selection ───────────────────────────────────────────────────────────

  toggleItem(serialNo: number): void {
    this.selectedSerialNos.update(sns => {
      const next = new Set(sns);
      if (next.has(serialNo)) next.delete(serialNo); else next.add(serialNo);
      return next;
    });
  }

  toggleAll(): void {
    if (this.allSelected()) {
      this.selectedSerialNos.set(new Set());
    } else {
      this.selectedSerialNos.set(new Set(this.items().map(i => i.serialNo)));
    }
  }

  setPreviewItem(serialNo: number): void {
    this.previewSerialNo.set(serialNo);
  }

  // ── Settings ─────────────────────────────────────────────────────────────────

  updateSetting<K extends keyof PriceLabelPrintSettings>(
    key: K,
    value: PriceLabelPrintSettings[K],
  ): void {
    this.printSettings.update(s => ({ ...s, [key]: value }));
    this.persistSettings();
  }

  // ── Printer detection ─────────────────────────────────────────────────────────

  async detectPrinters(): Promise<void> {
    this.detectingPrinters.set(true);
    this.printerDetectError.set(null);
    try {
      const printers = await this.printService.detectPrinters();
      this.availablePrinters.set(printers);
      if (!printers.length) {
        this.printerDetectError.set('No printers detected on this PC.');
      } else if (!this.printSettings().printerName && printers.length === 1) {
        // Auto-select when exactly one printer is found
        this.updateSetting('printerName', printers[0]);
      }
      this.cdr.markForCheck();
    } catch (err: any) {
      this.printerDetectError.set(err?.message || 'Failed to detect printers.');
      this.availablePrinters.set([]);
    } finally {
      this.detectingPrinters.set(false);
    }
  }

  // ── Printing ─────────────────────────────────────────────────────────────────

  async printSelected(): Promise<void> {
    await this.doPrint(this.selectedItems(), 'Selected');
  }

  async printAll(): Promise<void> {
    await this.doPrint(this.items(), 'All');
  }

  private async doPrint(items: PriceConfigItem[], label: string): Promise<void> {
    const preview = this.preview();
    if (!preview) { this.flash('error', 'Load a configuration first.'); return; }
    if (!items.length) { this.flash('error', 'No items to print.'); return; }

    const missingBarcode = items.filter(i => !i.ean && !i.skuCode);
    if (missingBarcode.length) {
      this.flash(
        'error',
        `${missingBarcode.length} item(s) have no EAN or SKU — barcode cannot be generated.`,
        6000,
      );
      return;
    }

    this.printing.set(true);
    try {
      await this.printService.printItems(items, preview, this.printSettings());
      const totalLabels = items.reduce(
        (s, i) => s + Math.max(1, i.labelQty || i.qty || 1), 0
      );
      this.flash('success', `${label}: ${totalLabels} label(s) sent to printer.`);
    } catch (err: any) {
      this.flash('error', err?.message || 'Failed to print labels.', 7000);
    } finally {
      this.printing.set(false);
    }
  }

  // ── Label preview helpers ─────────────────────────────────────────────────────

  renderBarcode(value: string): string {
    const chars = Array.from(String(value || 'N/A'));
    const spans: string[] = [];

    // Start guard bars
    spans.push(`<span style="height:72px;width:3px;background:#111827;display:inline-block;vertical-align:bottom;"></span>`);
    spans.push(`<span style="width:2px;display:inline-block;"></span>`);
    spans.push(`<span style="height:72px;width:2px;background:#111827;display:inline-block;vertical-align:bottom;"></span>`);
    spans.push(`<span style="width:3px;display:inline-block;"></span>`);

    chars.forEach((ch, i) => {
      const code = ch.charCodeAt(0);
      // 7 bar/space alternations per character for realistic density
      for (let b = 0; b < 7; b++) {
        const isBar = ((code >> (b % 8)) & 1) === 1;
        const h = isBar ? 62 + ((code * 3 + i * 7 + b) % 12) : 0;
        const w = 1 + ((code + b * 5 + i) % 3);
        if (isBar) {
          spans.push(`<span style="height:${h}px;width:${w}px;background:#111827;display:inline-block;vertical-align:bottom;margin-right:1px;"></span>`);
        } else {
          spans.push(`<span style="width:${w}px;display:inline-block;margin-right:1px;"></span>`);
        }
      }
    });

    // End guard bars
    spans.push(`<span style="width:3px;display:inline-block;"></span>`);
    spans.push(`<span style="height:72px;width:2px;background:#111827;display:inline-block;vertical-align:bottom;"></span>`);
    spans.push(`<span style="width:1px;display:inline-block;"></span>`);
    spans.push(`<span style="height:72px;width:3px;background:#111827;display:inline-block;vertical-align:bottom;"></span>`);

    return spans.join('');
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);
  }

  formatDate(value?: string | null): string {
    if (!value) return '-';
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
      });
    }
    return value;
  }

  matchBadgeStyle(status: string): string {
    return status === 'Matched'
      ? 'background:#DCFCE7;color:#166534;'
      : 'background:#FEE2E2;color:#991B1B;';
  }

  private flash(type: 'success' | 'error', msg: string, ms = 3500): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), ms);
  }
}
