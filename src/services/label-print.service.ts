import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';
import { LabelPrintSettings } from '../label-print.models';
// @ts-ignore – qz-tray ships no TypeScript declarations
import qz from 'qz-tray';

@Injectable({ providedIn: 'root' })
export class LabelPrintService {

  constructor(private http: HttpClient) {}

  // ── Public API ───────────────────────────────────────────────────────────────

  async detectPrinters(): Promise<string[]> {
    this.assertQzTrayMode();
    await this.initQzTray();
    try {
      const found = await qz.printers.find();
      return Array.isArray(found) ? found : (found ? [found] : []);
    } catch {
      throw new Error('QZ Tray could not list printers on this PC.');
    }
  }

  /** Sends a single cropped label image (base64 PNG, no data-URI prefix) to the printer. */
  async printImage(pngBase64: string, settings: LabelPrintSettings): Promise<void> {
    this.assertQzTrayMode();

    const printerName = (settings.printerName || '').trim();
    if (!printerName) throw new Error('Select a printer before printing.');

    await this.initQzTray();

    const allPrinters = await this.listPrinters();
    const resolved = resolvePrinterName(printerName, allPrinters);
    if (!resolved) {
      throw new Error(
        `Printer "${printerName}" not found. Installed: ${allPrinters.join(', ') || '(none)'}`
      );
    }

    const config = qz.configs.create(resolved, {
      jobName: 'Label Print',
      size: { width: settings.widthMm, height: settings.heightMm },
      units: 'mm',
      scaleContent: true,
    });

    try {
      await qz.print(config, [{ type: 'pixel', format: 'image', flavor: 'base64', data: pngBase64 }]);
    } catch (err: any) {
      throw new Error(err?.message || 'QZ Tray failed to send the label to the printer.');
    }
  }

  private assertQzTrayMode(): void {
    if (environment.hwLabelPrintMode !== 'qz-tray') {
      throw new Error(
        `Label Print requires hwLabelPrintMode: 'qz-tray' (currently "${environment.hwLabelPrintMode}"). ` +
        `The local-agent/server print modes only support raw TSPL text jobs, not arbitrary label images.`
      );
    }
  }

  private async listPrinters(): Promise<string[]> {
    try {
      const found = await qz.printers.find();
      return Array.isArray(found) ? found : [found];
    } catch {
      throw new Error('QZ Tray could not list printers on this PC.');
    }
  }

  // ── QZ Tray connection boilerplate (mirrors price-label-tspl-print.service.ts) ─

  private async initQzTray(): Promise<void> {
    const cert: string = (environment as any).qzCertificate || '';

    qz.security.setCertificatePromise((resolve: (c: string) => void) => resolve(cert));

    qz.security.setSignaturePromise((toSign: string) =>
      (resolve: (sig: string) => void, reject: (err: any) => void) => {
        if (!cert) { resolve(''); return; }
        firstValueFrom(
          this.http.post<{ signature: string }>(
            `${environment.apiUrl}/hw-inventory/qz-sign`,
            { request: toSign },
          )
        ).then(r => resolve(r.signature)).catch(reject);
      }
    );

    qz.websocket.setErrorCallbacks((err: any) =>
      console.error('[QZ label-print]', err)
    );

    if (qz.websocket.isActive()) {
      try { await qz.websocket.disconnect(); } catch { /* ignore */ }
    }

    try {
      await qz.websocket.connect();
    } catch {
      throw new Error(
        'QZ Tray is not running on this PC. Install and start QZ Tray, then try again.'
      );
    }
  }
}

function resolvePrinterName(target: string, allPrinters: string[]): string | undefined {
  return (
    allPrinters.find(p => p === target) ??
    allPrinters.find(p => p.toLowerCase() === target.toLowerCase()) ??
    allPrinters.find(p =>
      p.toLowerCase().includes(target.toLowerCase()) ||
      target.toLowerCase().includes(p.toLowerCase())
    )
  );
}
