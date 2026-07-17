export type LabelSizePreset = '4x6in' | '100x150mm' | 'custom';

export type LabelSizeUnit = 'in' | 'mm';

export interface LabelPrintSettings {
  printerName: string;
  sizePreset: LabelSizePreset;
  widthMm: number;
  heightMm: number;
}

export const DEFAULT_LABEL_PRINT_SETTINGS: LabelPrintSettings = {
  printerName: '',
  sizePreset: '4x6in',
  widthMm: 101.6,
  heightMm: 152.4,
};

export interface LabelBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One detected (or manually sliced) label cell within a rendered PDF page. */
export interface DetectedLabel {
  globalIndex: number;   // 0-based position across the whole document
  pageNumber: number;    // 1-based
  cellIndex: number;     // 0-based position within its page
  bbox: LabelBoundingBox; // pixel coords on that page's rendered canvas
}

/** Per-page detection summary, used to drive the grid-override panel. */
export interface PageLabelGroup {
  pageNumber: number;
  rows: number;
  cols: number;
  labels: DetectedLabel[];
  autoDetected: boolean; // false once the user has manually overridden this page's grid
}

export type PrintStatus = 'Success' | 'Failed';

export interface PrintLogEntry {
  globalIndex: number;
  pageNumber: number;
  fileName: string;
  totalLabels: number;
  printerName: string;
  widthMm: number;
  heightMm: number;
  status: PrintStatus;
  errorMessage: string | null;
  printedAt: string;
}
