import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LabelPdfService } from '../../services/label-pdf.service';
import { LabelPrintService } from '../../services/label-print.service';
import { LabelPrintLogService } from '../../services/label-print-log.service';
import {
  DetectedLabel,
  LabelPrintSettings,
  LabelSizePreset,
  LabelSizeUnit,
  PageLabelGroup,
  PrintLogEntry,
  PrintStatus,
  DEFAULT_LABEL_PRINT_SETTINGS,
} from '../../label-print.models';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const SETTINGS_STORAGE_KEY = 'label_print_settings';

const SIZE_PRESET_VALUES: Record<Exclude<LabelSizePreset, 'custom'>, { widthMm: number; heightMm: number }> = {
  '4x6in':    { widthMm: 101.6, heightMm: 152.4 },
  '100x150mm': { widthMm: 100,  heightMm: 150 },
};

const mmToIn = (mm: number) => mm / 25.4;
const inToMm = (inch: number) => inch * 25.4;

@Component({
  selector: 'app-label-print',
  templateUrl: './label-print.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class LabelPrintComponent {
  readonly toast          = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  readonly fileName       = signal<string | null>(null);
  readonly loadingPdf     = signal(false);
  readonly loadError      = signal<string | null>(null);

  readonly pageGroups     = signal<PageLabelGroup[]>([]);
  readonly currentIndex   = signal(0);
  readonly currentPreviewPng = signal<string | null>(null);
  readonly previewLoading = signal(false);

  readonly printSettings  = signal<LabelPrintSettings>(this.loadSavedSettings());
  readonly customUnit     = signal<LabelSizeUnit>('mm');

  readonly availablePrinters  = signal<string[]>([]);
  readonly detectingPrinters  = signal(false);
  readonly printerDetectError = signal<string | null>(null);

  readonly printing         = signal(false);
  readonly printAllProgress = signal<{ current: number; total: number } | null>(null);

  readonly recentLogs = signal<PrintLogEntry[]>([]);

  readonly gridOverrideOpenPage = signal<number | null>(null);
  readonly overrideRowsDraft    = signal(1);
  readonly overrideColsDraft    = signal(1);

  // ── Computed ─────────────────────────────────────────────────────────────────

  readonly allLabels    = computed(() => this.pageGroups().flatMap(g => g.labels));
  readonly totalLabels  = computed(() => this.allLabels().length);
  readonly hasLabels    = computed(() => this.totalLabels() > 0);
  readonly currentLabel = computed<DetectedLabel | null>(() => this.allLabels()[this.currentIndex()] ?? null);

  readonly targetAspectRatio = computed(() => {
    const s = this.printSettings();
    return s.widthMm / s.heightMm;
  });

  readonly customWidthDisplay = computed(() =>
    this.customUnit() === 'mm' ? this.printSettings().widthMm : Math.round(mmToIn(this.printSettings().widthMm) * 100) / 100
  );
  readonly customHeightDisplay = computed(() =>
    this.customUnit() === 'mm' ? this.printSettings().heightMm : Math.round(mmToIn(this.printSettings().heightMm) * 100) / 100
  );

  private pdfDoc: PDFDocumentProxy | null = null;
  private readonly pageCanvases = new Map<number, HTMLCanvasElement>();

  constructor(
    private pdfService:   LabelPdfService,
    private printService: LabelPrintService,
    private logService:   LabelPrintLogService,
    private cdr: ChangeDetectorRef,
  ) {
    this.loadRecentLogs();
  }

  // ── Settings persistence ─────────────────────────────────────────────────────

  private loadSavedSettings(): LabelPrintSettings {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_LABEL_PRINT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch { /* ignore parse errors */ }
    return { ...DEFAULT_LABEL_PRINT_SETTINGS };
  }

  private persistSettings(): void {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.printSettings()));
    } catch { /* ignore storage errors */ }
  }

  updateSetting<K extends keyof LabelPrintSettings>(key: K, value: LabelPrintSettings[K]): void {
    this.printSettings.update(s => ({ ...s, [key]: value }));
    this.persistSettings();
  }

  // ── Label size ───────────────────────────────────────────────────────────────

  selectSizePreset(preset: LabelSizePreset): void {
    if (preset === 'custom') {
      this.printSettings.update(s => ({ ...s, sizePreset: 'custom' }));
    } else {
      const { widthMm, heightMm } = SIZE_PRESET_VALUES[preset];
      this.printSettings.update(s => ({ ...s, sizePreset: preset, widthMm, heightMm }));
    }
    this.persistSettings();
    this.refreshPreview();
  }

  toggleCustomUnit(): void {
    this.customUnit.update(u => (u === 'mm' ? 'in' : 'mm'));
  }

  onCustomWidthInput(value: number): void {
    if (!Number.isFinite(value) || value <= 0) return;
    const widthMm = this.customUnit() === 'mm' ? value : inToMm(value);
    this.printSettings.update(s => ({ ...s, widthMm }));
    this.persistSettings();
    this.refreshPreview();
  }

  onCustomHeightInput(value: number): void {
    if (!Number.isFinite(value) || value <= 0) return;
    const heightMm = this.customUnit() === 'mm' ? value : inToMm(value);
    this.printSettings.update(s => ({ ...s, heightMm }));
    this.persistSettings();
    this.refreshPreview();
  }

  // ── File upload / parsing ─────────────────────────────────────────────────────

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (file) this.parsePdf(file);
  }

  private async parsePdf(file: File): Promise<void> {
    this.loadingPdf.set(true);
    this.loadError.set(null);
    this.pageGroups.set([]);
    this.currentIndex.set(0);
    this.currentPreviewPng.set(null);
    this.pageCanvases.clear();
    this.pdfDoc = null;
    this.cdr.markForCheck();

    try {
      const pdfDoc = await this.pdfService.loadPdf(file);
      this.pdfDoc = pdfDoc;
      this.fileName.set(file.name);

      const groups: PageLabelGroup[] = [];
      let globalIdx = 0;
      for (let p = 1; p <= pdfDoc.numPages; p++) {
        const canvas = await this.pdfService.renderPage(pdfDoc, p);
        this.pageCanvases.set(p, canvas);
        const { boxes, rows } = this.pdfService.detectLabelCells(canvas);
        const group = this.pdfService.boxesToGroup(p, boxes, rows, globalIdx, true);
        groups.push(group);
        globalIdx += group.labels.length;
      }

      this.pageGroups.set(groups);
      this.flash('success', `Detected ${globalIdx} label(s) across ${pdfDoc.numPages} page(s).`);
      await this.refreshPreview();
    } catch (err: any) {
      const msg = err?.message || 'Could not process this PDF.';
      this.loadError.set(msg);
      this.flash('error', msg, 7000);
    } finally {
      this.loadingPdf.set(false);
      this.cdr.markForCheck();
    }
  }

  clearFile(): void {
    this.fileName.set(null);
    this.pageGroups.set([]);
    this.currentIndex.set(0);
    this.currentPreviewPng.set(null);
    this.pageCanvases.clear();
    this.pdfDoc = null;
    this.loadError.set(null);
  }

  // ── Grid override ────────────────────────────────────────────────────────────

  openOverride(page: PageLabelGroup): void {
    this.gridOverrideOpenPage.set(page.pageNumber);
    this.overrideRowsDraft.set(page.rows || 1);
    this.overrideColsDraft.set(page.cols || 1);
  }

  closeOverride(): void {
    this.gridOverrideOpenPage.set(null);
  }

  applyOverride(pageNumber: number, applyToAll: boolean): void {
    const rows = this.overrideRowsDraft();
    const cols = this.overrideColsDraft();
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
      this.flash('error', 'Rows and columns must be whole numbers of at least 1.');
      return;
    }

    const targetPages = applyToAll ? this.pageGroups().map(g => g.pageNumber) : [pageNumber];

    const updated = this.pageGroups().map(g => {
      if (!targetPages.includes(g.pageNumber)) return g;
      const canvas = this.pageCanvases.get(g.pageNumber);
      if (!canvas) return g;
      const boxes = this.pdfService.sliceGrid(canvas, rows, cols);
      const labels: DetectedLabel[] = boxes.map((bbox, cellIndex) => ({
        globalIndex: 0, pageNumber: g.pageNumber, cellIndex, bbox,
      }));
      return { ...g, rows, cols, labels, autoDetected: false };
    });

    this.pageGroups.set(this.recomputeGlobalIndices(updated));
    this.gridOverrideOpenPage.set(null);
    this.currentIndex.set(0);
    this.refreshPreview();
    this.flash('success', `Grid set to ${rows} × ${cols} on ${targetPages.length} page(s).`);
  }

  redetectPage(pageNumber: number): void {
    const canvas = this.pageCanvases.get(pageNumber);
    if (!canvas) return;
    const { boxes, rows } = this.pdfService.detectLabelCells(canvas);

    const updated = this.pageGroups().map(g =>
      g.pageNumber === pageNumber
        ? this.pdfService.boxesToGroup(pageNumber, boxes, rows, 0, true)
        : g
    );

    this.pageGroups.set(this.recomputeGlobalIndices(updated));
    this.currentIndex.set(0);
    this.refreshPreview();
    this.flash('success', `Page ${pageNumber} re-detected automatically.`);
  }

  private recomputeGlobalIndices(groups: PageLabelGroup[]): PageLabelGroup[] {
    let idx = 0;
    return groups.map(g => {
      const labels = g.labels.map((l, cellIndex) => ({ ...l, cellIndex, globalIndex: idx + cellIndex }));
      idx += labels.length;
      return { ...g, labels };
    });
  }

  // ── Preview navigation ───────────────────────────────────────────────────────

  goNext(): void {
    if (this.currentIndex() < this.totalLabels() - 1) {
      this.currentIndex.update(i => i + 1);
      this.refreshPreview();
    }
  }

  goPrev(): void {
    if (this.currentIndex() > 0) {
      this.currentIndex.update(i => i - 1);
      this.refreshPreview();
    }
  }

  private async refreshPreview(): Promise<void> {
    const label = this.currentLabel();
    if (!label) { this.currentPreviewPng.set(null); return; }

    this.previewLoading.set(true);
    try {
      const canvas = this.pageCanvases.get(label.pageNumber);
      if (!canvas) { this.currentPreviewPng.set(null); return; }
      const png = this.pdfService.cropToPng(canvas, label.bbox, this.targetAspectRatio());
      this.currentPreviewPng.set(png);
    } finally {
      this.previewLoading.set(false);
      this.cdr.markForCheck();
    }
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
        this.updateSetting('printerName', printers[0]);
      }
    } catch (err: any) {
      this.printerDetectError.set(err?.message || 'Failed to detect printers.');
      this.availablePrinters.set([]);
    } finally {
      this.detectingPrinters.set(false);
      this.cdr.markForCheck();
    }
  }

  // ── Printing ─────────────────────────────────────────────────────────────────

  async printCurrent(): Promise<void> {
    const label = this.currentLabel();
    if (!label) { this.flash('error', 'No label to print.'); return; }
    if (!this.printSettings().printerName) { this.flash('error', 'Select a printer first.'); return; }

    this.printing.set(true);
    const status = await this.printOneLabel(label);
    this.printing.set(false);
    if (status === 'Success') {
      this.flash('success', `Label ${label.globalIndex + 1} of ${this.totalLabels()} sent to printer.`);
    } else {
      this.flash('error', `Label ${label.globalIndex + 1} failed to print. See log below.`, 6000);
    }
    this.cdr.markForCheck();
  }

  async printAll(): Promise<void> {
    if (!this.hasLabels()) { this.flash('error', 'No labels to print.'); return; }
    if (!this.printSettings().printerName) { this.flash('error', 'Select a printer first.'); return; }

    const labels = this.allLabels();
    this.printing.set(true);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < labels.length; i++) {
      this.printAllProgress.set({ current: i + 1, total: labels.length });
      this.cdr.markForCheck();
      const status = await this.printOneLabel(labels[i]);
      if (status === 'Success') successCount++; else failCount++;
    }

    this.printing.set(false);
    this.printAllProgress.set(null);

    if (failCount === 0) {
      this.flash('success', `All ${successCount} label(s) sent to printer.`);
    } else {
      this.flash('error', `Printed ${successCount} label(s), ${failCount} failed. See log below.`, 7000);
    }
    this.cdr.markForCheck();
  }

  /** Prints one label, always recording a log entry, and never throwing. */
  private async printOneLabel(label: DetectedLabel): Promise<PrintStatus> {
    const canvas = this.pageCanvases.get(label.pageNumber);
    const settings = this.printSettings();
    let status: PrintStatus = 'Success';
    let errorMessage: string | null = null;

    try {
      if (!canvas) throw new Error(`Page ${label.pageNumber} raster is not available.`);
      const png = this.pdfService.cropToPng(canvas, label.bbox, this.targetAspectRatio());
      await this.printService.printImage(png, settings);
    } catch (err: any) {
      status = 'Failed';
      errorMessage = err?.message || 'Unknown print error.';
    }

    const entry: PrintLogEntry = {
      globalIndex: label.globalIndex,
      pageNumber: label.pageNumber,
      fileName: this.fileName() || '',
      totalLabels: this.totalLabels(),
      printerName: settings.printerName,
      widthMm: settings.widthMm,
      heightMm: settings.heightMm,
      status,
      errorMessage,
      printedAt: new Date().toISOString(),
    };

    this.recentLogs.update(list => [entry, ...list].slice(0, 100));
    this.logService.logPrint(entry);

    return status;
  }

  private async loadRecentLogs(): Promise<void> {
    try {
      const logs = await this.logService.getRecent('', 20);
      this.recentLogs.set(logs);
      this.cdr.markForCheck();
    } catch {
      // Non-fatal — recent log history is a convenience, not a requirement to use the screen.
    }
  }

  // ── Formatting helpers ───────────────────────────────────────────────────────

  formatTime(value: string): string {
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  private flash(type: 'success' | 'error', msg: string, ms = 3500): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), ms);
  }
}
