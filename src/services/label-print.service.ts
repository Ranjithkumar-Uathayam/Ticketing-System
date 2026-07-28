import { Injectable } from '@angular/core';
import { environment } from '../environments/environment';
import { LabelPrintSettings } from '../label-print.models';
import { QzTrayService } from './qz-tray.service';

@Injectable({ providedIn: 'root' })
export class LabelPrintService {

  constructor(private qzTray: QzTrayService) {}

  // ── Public API ───────────────────────────────────────────────────────────────

  async detectPrinters(): Promise<string[]> {
    this.assertQzTrayMode();
    return this.qzTray.findPrinters();
  }

  /** Sends a single cropped label image (base64 PNG, no data-URI prefix) to the printer. */
  async printImage(pngBase64: string, settings: LabelPrintSettings): Promise<void> {
    this.assertQzTrayMode();

    const printerName = (settings.printerName || '').trim();
    if (!printerName) throw new Error('Select a printer before printing.');

    await this.qzTray.print(
      printerName,
      [{ type: 'pixel', format: 'image', flavor: 'base64', data: pngBase64 }],
      {
        jobName: 'Label Print',
        size: { width: settings.widthMm, height: settings.heightMm },
        units: 'mm',
        scaleContent: true,
      }
    );
  }

  private assertQzTrayMode(): void {
    if (environment.hwLabelPrintMode !== 'qz-tray') {
      throw new Error(
        `Label Print requires hwLabelPrintMode: 'qz-tray' (currently "${environment.hwLabelPrintMode}"). ` +
        `The local-agent/server print modes only support raw TSPL text jobs, not arbitrary label images.`
      );
    }
  }
}
