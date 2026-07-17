import { Injectable } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { DetectedLabel, LabelBoundingBox, PageLabelGroup } from '../label-print.models';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

/** Render resolution used for both on-screen preview and the print raster. */
const RENDER_DPI = 200;
const PDF_POINTS_DPI = 72;

/** Minimum ink pixels in a row/column before it counts as "content", to ignore anti-aliasing noise. */
const MIN_INK_FRACTION = 0.004;
/** Luminance below this (0-255) counts as ink (dark) rather than background. */
const INK_LUMINANCE_THRESHOLD = 200;

export interface RenderedPage {
  pageNumber: number;
  canvas: HTMLCanvasElement;
}

@Injectable({ providedIn: 'root' })
export class LabelPdfService {

  // ── Load & validate ──────────────────────────────────────────────────────────

  async loadPdf(file: File): Promise<PDFDocumentProxy> {
    const name = (file.name || '').toLowerCase();
    if (!name.endsWith('.pdf') && file.type && file.type !== 'application/pdf') {
      throw new Error(`"${file.name}" is not a PDF file. Please upload a .pdf file.`);
    }

    const buffer = await file.arrayBuffer();

    let pdfDoc: PDFDocumentProxy;
    try {
      pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
    } catch (err: any) {
      if (err?.name === 'PasswordException') {
        throw new Error('This PDF is password-protected. Remove the password and re-upload.');
      }
      if (err?.name === 'InvalidPDFException') {
        throw new Error(`"${file.name}" could not be read as a valid PDF. The file may be corrupted or not a real PDF.`);
      }
      throw new Error(`Could not read "${file.name}" as a PDF. ${err?.message || 'The file may be corrupted.'}`);
    }

    if (!pdfDoc.numPages) {
      throw new Error('The uploaded PDF has no pages.');
    }

    return pdfDoc;
  }

  // ── Rendering ────────────────────────────────────────────────────────────────

  async renderPage(pdfDoc: PDFDocumentProxy, pageNumber: number): Promise<HTMLCanvasElement> {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: RENDER_DPI / PDF_POINTS_DPI });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    return canvas;
  }

  // ── Detection: whitespace projection-profile grid segmentation ───────────────

  detectLabelCells(canvas: HTMLCanvasElement): { boxes: LabelBoundingBox[]; rows: number } {
    const { width, height } = canvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const { data } = ctx.getImageData(0, 0, width, height);

    const isInk = new Uint8Array(width * height);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      const luminance = a === 0 ? 255 : 0.299 * r + 0.587 * g + 0.114 * b;
      isInk[p] = luminance < INK_LUMINANCE_THRESHOLD ? 1 : 0;
    }

    const minGapPx = Math.max(6, Math.round(height * 0.01));
    const minColGapPx = Math.max(6, Math.round(width * 0.01));
    const rowInkThreshold = Math.max(1, Math.round(width * MIN_INK_FRACTION));
    const colInkThreshold = Math.max(1, Math.round(height * MIN_INK_FRACTION));

    const rowInkCount = new Int32Array(height);
    for (let y = 0; y < height; y++) {
      let count = 0;
      const base = y * width;
      for (let x = 0; x < width; x++) count += isInk[base + x];
      rowInkCount[y] = count;
    }
    const rowHasInk = (y: number) => rowInkCount[y] >= rowInkThreshold;
    const rowBands = clusterBands(height, rowHasInk, minGapPx);

    if (!rowBands.length) {
      // Blank/undetectable page — treat the whole page as a single label.
      return { boxes: [{ x: 0, y: 0, width, height }], rows: 1 };
    }

    const boxes: LabelBoundingBox[] = [];
    for (const [y0, y1] of rowBands) {
      const bandHeight = y1 - y0 + 1;
      const colInkCount = new Int32Array(width);
      for (let x = 0; x < width; x++) {
        let count = 0;
        for (let y = y0; y <= y1; y++) count += isInk[y * width + x];
        colInkCount[x] = count;
      }
      const colHasInk = (x: number) => colInkCount[x] >= colInkThreshold;
      const colBands = clusterBands(width, colHasInk, minColGapPx);

      const padY = Math.floor(minGapPx * 0.4);
      const padX = Math.floor(minColGapPx * 0.4);

      if (!colBands.length) {
        boxes.push({
          x: 0,
          y: Math.max(0, y0 - padY),
          width,
          height: Math.min(height, y1 + padY) - Math.max(0, y0 - padY),
        });
        continue;
      }

      for (const [x0, x1] of colBands) {
        const bx = Math.max(0, x0 - padX);
        const by = Math.max(0, y0 - padY);
        const bw = Math.min(width, x1 + padX) - bx;
        const bh = Math.min(height, y1 + padY) - by;
        boxes.push({ x: bx, y: by, width: bw, height: bh });
      }
    }

    return { boxes, rows: rowBands.length };
  }

  /** Manual-override fallback: slice a page into an equal-size rows x cols grid. */
  sliceGrid(canvas: HTMLCanvasElement, rows: number, cols: number): LabelBoundingBox[] {
    const { width, height } = canvas;
    const cellW = width / cols;
    const cellH = height / rows;
    const boxes: LabelBoundingBox[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        boxes.push({
          x: Math.round(c * cellW),
          y: Math.round(r * cellH),
          width: Math.round(cellW),
          height: Math.round(cellH),
        });
      }
    }
    return boxes;
  }

  // ── Cropping / export ─────────────────────────────────────────────────────────

  /** Crops a cell, pads with white to match the target aspect ratio (no stretching), returns base64 PNG (no data-URI prefix). */
  cropToPng(canvas: HTMLCanvasElement, bbox: LabelBoundingBox, targetAspectRatio: number): string {
    const srcAspect = bbox.width / bbox.height;

    let outW = bbox.width;
    let outH = bbox.height;
    if (srcAspect > targetAspectRatio) {
      outH = Math.round(bbox.width / targetAspectRatio);
    } else {
      outW = Math.round(bbox.height * targetAspectRatio);
    }

    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);

    const offsetX = Math.round((outW - bbox.width) / 2);
    const offsetY = Math.round((outH - bbox.height) / 2);
    ctx.drawImage(
      canvas,
      bbox.x, bbox.y, bbox.width, bbox.height,
      offsetX, offsetY, bbox.width, bbox.height,
    );

    const dataUrl = out.toDataURL('image/png');
    return dataUrl.substring(dataUrl.indexOf(',') + 1);
  }

  // ── Orchestration ──────────────────────────────────────────────────────────────

  boxesToGroup(
    pageNumber: number,
    boxes: LabelBoundingBox[],
    rows: number,
    startGlobalIndex: number,
    autoDetected: boolean,
  ): PageLabelGroup {
    const labels: DetectedLabel[] = boxes.map((bbox, cellIndex) => ({
      globalIndex: startGlobalIndex + cellIndex,
      pageNumber,
      cellIndex,
      bbox,
    }));
    const cols = Math.max(1, Math.round(boxes.length / Math.max(1, rows)));
    return { pageNumber, rows, cols, labels, autoDetected };
  }
}

/**
 * Clusters indices [0, length) where `hasContent(i)` is true into contiguous bands,
 * bridging blank gaps shorter than `minGapPx` (so a real label isn't split by
 * incidental noise) but treating longer blank runs as real separators.
 */
function clusterBands(length: number, hasContent: (i: number) => boolean, minGapPx: number): Array<[number, number]> {
  const bands: Array<[number, number]> = [];
  let bandStart: number | null = null;
  let lastContentIdx = -1;
  let blankRun = 0;

  for (let i = 0; i < length; i++) {
    if (hasContent(i)) {
      if (bandStart === null) bandStart = i;
      lastContentIdx = i;
      blankRun = 0;
    } else if (bandStart !== null) {
      blankRun++;
      if (blankRun >= minGapPx) {
        bands.push([bandStart, lastContentIdx]);
        bandStart = null;
        blankRun = 0;
      }
    }
  }
  if (bandStart !== null) bands.push([bandStart, lastContentIdx]);
  return bands;
}
