import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';
import { PriceConfigItem, PriceConfigPreview } from '../price-configuration.models';
// @ts-ignore – qz-tray ships no TypeScript declarations
import qz from 'qz-tray';

export interface PriceLabelPrintSettings {
  printerName: string;
  density: number;   // 1–15
  speed: number;     // 1–4
  gapMm: number;     // label gap in mm
  mfgDate: string;   // e.g. "May-26"
  labelWidthMm: number;   // label width in mm
  labelHeightMm: number;  // label height in mm
}

export const DEFAULT_PRICE_LABEL_SETTINGS: PriceLabelPrintSettings = {
  printerName: '',
  density: 10,
  speed: 2,
  gapMm: 3,
  mfgDate: new Date().toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit'
  }).replace(' ', '-'),
  labelWidthMm: 90,
  labelHeightMm: 44,
};

@Injectable({ providedIn: 'root' })
export class PriceLabelTsplPrintService {

  constructor(private http: HttpClient) {}

  // ── Public API ───────────────────────────────────────────────────────────────

  async printItems(
    items: PriceConfigItem[],
    preview: PriceConfigPreview,
    settings: PriceLabelPrintSettings,
  ): Promise<void> {
    if (!items.length) throw new Error('No items selected for printing.');

    const mode = environment.hwLabelPrintMode;
    const printerName = (
      settings.printerName ||
      (environment as any).hwLabelPrinterName ||
      'TSC TTP-244 Pro'
    ).trim();

    const tspl = this.buildBatchTspl(items, preview, settings);

    if (mode === 'qz-tray') {
      await this.sendViaQzTray(printerName, tspl, 'Price Labels');
      return;
    }

    if (mode === 'local-agent') {
      await this.sendViaLocalAgent(printerName, tspl);
      return;
    }

    // server mode
    await firstValueFrom(
      this.http.post(`${environment.apiUrl}/price-labels/print`, { tspl, printerName })
    );
  }

  async detectPrinters(): Promise<string[]> {
    const mode = environment.hwLabelPrintMode;

    if (mode === 'qz-tray') {
      await this.initQzTray();
      try {
        const found = await qz.printers.find();
        return Array.isArray(found) ? found : (found ? [found] : []);
      } catch {
        throw new Error('QZ Tray could not list printers on this PC.');
      }
    }

    if (mode === 'local-agent') {
      try {
        const response = await firstValueFrom(
          this.http.get<{ printers: string[] }>(`${environment.hwLabelAgentUrl}/api/printers`)
        );
        return response.printers || [];
      } catch {
        throw new Error('Could not reach local print agent to list printers. Ensure the agent is running.');
      }
    }

    // server mode
    try {
      const response = await firstValueFrom(
        this.http.get<{ printers: string[] }>(`${environment.apiUrl}/price-labels/printers`)
      );
      return response.printers || [];
    } catch {
      throw new Error('Could not fetch printer list from server.');
    }
  }

  // ── TSPL builders ────────────────────────────────────────────────────────────

  buildBatchTspl(
    items: PriceConfigItem[],
    preview: PriceConfigPreview,
    settings: PriceLabelPrintSettings,
  ): string {
    // One TSPL block per item — PRINT qty,1 inside each block handles repetition
    return items
      .map((item) => this.buildSingleLabelTspl(item, preview, settings))
      .join('\r\n');
  }

  /**
   * Builds TSPL for one label scaled to the configured size.
   * Reference design: 90 mm × 44 mm = 720 × 352 dots at 203 DPI (8 dots/mm).
   * All coordinates are scaled proportionally when the label size differs.
   */
  buildSingleLabelTspl(
    item: PriceConfigItem,
    preview: PriceConfigPreview,
    settings: PriceLabelPrintSettings,
  ): string {
    const esc = (v = '') =>
      String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    const tpl  = preview.labelTemplate;
    // Use SKU first (matches the text shown on label), fall back to EAN.
    // Strip characters not valid in Code 128 and ensure result is non-empty.
    const sanitize = (v: string) => String(v).replace(/[^A-Za-z0-9\-\.\/\+\s]/g, '').trim();
    const barcode = sanitize(item.skuCode) || sanitize(item.ean) || 'N/A';
    const mrp  = item.currentPrice > 0
      ? `Rs.${item.currentPrice.toFixed(2)}`
      : 'Rs.0.00';
    const netQty  = String(item.labelQty || item.qty || 1);
    const mfgDate = new Date().toLocaleDateString('en-US', {
                    month: 'short',
                    year: '2-digit'
                }).replace(' ', '-');

    // Dots per mm at 203 DPI
    const DPM = 8;
    const W = Math.round(settings.labelWidthMm  * DPM);  // total width in dots
    const H = Math.round(settings.labelHeightMm * DPM);  // total height in dots

    // Scale helpers — reference design was 90 mm × 44 mm (720 × 352 dots)
    const sx = (x: number) => Math.round(x * W / 720);
    const sy = (y: number) => Math.round(y * H / 352);

    // Key x positions
    const xLeft  = sx(20);
    const divX   = sx(430);   // vertical divider
    const xRight = divX + sx(4);

    // Key y positions
    const yBarcode  = sy(4);
    const barcodeH  = sy(80);
    const yHSep1    = sy(86);
    const yHSep2    = sy(248);
    const ySku      = sy(90);
    const yMrp      = sy(118);
    const yTaxes    = sy(152);
    const yCategory = sy(170);
    const yBrand    = sy(196);
    const yMkgDt    = sy(222);
    const yNetQty   = sy(144);
    const yFooter1  = sy(252);
    const yFooter2  = sy(270);
    const yFooter3  = sy(288);
    const yFooter4  = sy(tpl.unitLine2 ? 306 : 288);
    const yFooter5  = sy(tpl.unitLine2 ? 324 : 306);

    const lines = [
      `SIZE ${settings.labelWidthMm} mm,${settings.labelHeightMm} mm`,
      `GAP ${settings.gapMm} mm,0 mm`,
      `DENSITY ${settings.density}`,
      `SPEED ${settings.speed}`,
      `DIRECTION 1`,
      `REFERENCE 0,0`,
      `CLS`,

      // ── Barcode (full label width) ────────────────────────────────────────────
      `BARCODE ${sx(8)},${yBarcode},"128",${barcodeH},0,0,2,2,"${esc(barcode)}"`,

      // ── Separator after barcode ──────────────────────────────────────────────
      `BAR 0,${yHSep1},${W},1`,

      // ── Vertical separator between left / right columns ───────────────────────
      `BAR ${divX},${yHSep1},1,${yHSep2 - yHSep1}`,

      // ── Left column ──────────────────────────────────────────────────────────
      `TEXT ${xLeft},${ySku},"2",0,1,1,"${esc(item.skuCode || item.ean || '-')}"`,
      `TEXT ${xLeft},${yMrp},"3",0,1,1,"MRP :${mrp}"`,
      `TEXT ${xLeft},${yTaxes},"1",0,1,1,"(Incl.of all Taxes)"`,
      `TEXT ${xLeft},${yCategory},"2",0,0.8,0.8,"Category : ${esc(item.category || '-')}"`,
      `TEXT ${xLeft},${yBrand},"2",0,1,1,"Brand : ${esc(item.brand || '-')}"`,
      `TEXT ${xLeft},${yMkgDt},"2",0,1,1,"Mkg Dt : ${mfgDate}"`,

      // ── Right column ─────────────────────────────────────────────────────────
      `TEXT ${xRight},${ySku},"2",0,1,1,"SIZE : ${esc(item.size || '-')}"`,
      `TEXT ${xRight},${yMrp},"2",0,1,1,"Color : ${esc(item.color || '-')}"`,
      `TEXT ${xRight},${yNetQty},"2",0,1,1,"Net Qty : ${esc(netQty)}"`,
      `TEXT ${xRight},${yBrand},"1",0,1,1,"Country Of Origin : ${esc(tpl.countryOfOrigin || 'India')}"`,

      // ── Footer separator ─────────────────────────────────────────────────────
      `BAR 0,${yHSep2},${W},1`,

      // ── Footer lines ─────────────────────────────────────────────────────────
      `TEXT ${xLeft},${yFooter1},"1",0,1,1,"Mfg & Mktd by : ${esc(tpl.companyName)}"`,
      `TEXT ${xLeft},${yFooter2},"1",0,1,1,"${esc(tpl.unitLine || '')}"`,
      ...(tpl.unitLine2 ? [`TEXT ${xLeft},${yFooter3},"1",0,1,1,"${esc(tpl.unitLine2)}"`] : []),
      `TEXT ${xLeft},${yFooter4},"1",0,1,1,"website : ${esc(tpl.website)}"`,
      `TEXT ${sx(300)},${yFooter4},"1",0,1,1,"Customer Care No: ${esc(tpl.customerCare)}"`,
      `TEXT ${xLeft},${yFooter5},"1",0,1,1,"Email : ${esc(tpl.email)}"`,

      // Print max(labelQty, qty) copies — labelQty can only be >= qty
      `PRINT ${Math.max(item.labelQty || 0, item.qty || 0, 1)},1`,
    ];

    return lines.join('\r\n') + '\r\n';
  }

  // ── QZ Tray ──────────────────────────────────────────────────────────────────

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
      console.error('[QZ price-label]', err)
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

  private async sendViaQzTray(
    printerName: string,
    content: string,
    jobName: string,
  ): Promise<void> {
    await this.initQzTray();

    let allPrinters: string[];
    try {
      const found = await qz.printers.find();
      allPrinters = Array.isArray(found) ? found : [found];
    } catch {
      throw new Error('QZ Tray could not list printers on this PC.');
    }

    const target = printerName.trim();
    const resolved =
      allPrinters.find(p => p === target) ??
      allPrinters.find(p => p.toLowerCase() === target.toLowerCase()) ??
      allPrinters.find(p =>
        p.toLowerCase().includes(target.toLowerCase()) ||
        target.toLowerCase().includes(p.toLowerCase())
      );

    if (!resolved) {
      throw new Error(
        `Printer "${target}" not found. Installed: ${allPrinters.join(', ') || '(none)'}`
      );
    }

    const config = qz.configs.create(resolved, { jobName });
    try {
      await qz.print(config, [{ type: 'raw', format: 'plain', data: content }]);
    } catch (err: any) {
      throw new Error(err?.message || 'QZ Tray failed to send the print job to the printer.');
    }
  }

  // ── Local Print Agent ────────────────────────────────────────────────────────

  private async sendViaLocalAgent(printerName: string, content: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post<{ message: string }>(
          `${environment.hwLabelAgentUrl}/api/print-jobs`,
          { printerName, jobName: 'Price Labels', encoding: 'ascii', content },
        )
      );
    } catch (error: any) {
      const msg = error?.error?.message;
      if (typeof msg === 'string' && msg.trim()) throw new Error(msg);
      if (error?.status === 0)
        throw new Error(
          'Local print agent is not running. Start the agent and try again.'
        );
      throw new Error('Failed to reach the local print agent.');
    }
  }
}
