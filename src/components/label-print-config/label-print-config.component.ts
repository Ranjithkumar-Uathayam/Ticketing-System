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

@Component({
  selector: 'app-label-print-config',
  templateUrl: './label-print-config.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
})
export class LabelPrintConfigComponent {
  readonly records       = this.configService.records;
  readonly recordsLoading = this.configService.loading;

  readonly toast          = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  readonly preview        = signal<PriceConfigPreview | null>(null);
  readonly selectedConfigId = signal<number | null>(null);
  readonly loadingConfig  = signal(false);
  readonly printing       = signal(false);
  readonly settingsOpen   = signal(true);

  /** Serial numbers of checked items */
  readonly selectedSerialNos = signal<Set<number>>(new Set());
  /** Serial number of the item currently shown in the label preview */
  readonly previewSerialNo   = signal<number | null>(null);

  readonly printSettings = signal<PriceLabelPrintSettings>({
    ...DEFAULT_PRICE_LABEL_SETTINGS,
    printerName: (environment as any).hwLabelPrinterName || 'TSC TTP-244 Pro',
  });

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

  constructor(
    private configService: PriceConfigurationService,
    private printService:  PriceLabelTsplPrintService,
    private cdr: ChangeDetectorRef,
  ) {
    this.configService.getAll();
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
    return chars
      .map((ch, i) => {
        const code = ch.charCodeAt(0);
        const h    = 22 + ((code + i * 7) % 34);
        const w    = (code % 3) + 1;
        return `<span style="height:${h}px;width:${w}px;display:inline-block;background:#111827;margin-right:1px;vertical-align:bottom;border-radius:0.5px;"></span>`;
      })
      .join('');
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
