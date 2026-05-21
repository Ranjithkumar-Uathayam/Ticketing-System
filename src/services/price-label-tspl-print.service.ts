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
}

export const DEFAULT_PRICE_LABEL_SETTINGS: PriceLabelPrintSettings = {
  printerName: '',
  density: 10,
  speed: 2,
  gapMm: 3,
  mfgDate: '',
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

  // ── TSPL builders ────────────────────────────────────────────────────────────

  buildBatchTspl(
    items: PriceConfigItem[],
    preview: PriceConfigPreview,
    settings: PriceLabelPrintSettings,
  ): string {
    return items
      .flatMap((item) => {
        const copies = Math.max(1, item.labelQty || item.qty || 1);
        return Array.from({ length: copies }, () =>
          this.buildSingleLabelTspl(item, preview, settings)
        );
      })
      .join('\r\n');
  }

  /**
   * Builds TSPL for one 90 mm × 44 mm price label (203 DPI = 8 dots/mm).
   *
   * Layout (dots):
   *   y=4   – CODE128 barcode, height 80 dots (~10 mm)
   *   y=86  – horizontal separator
   *   y=90  – left col: SKU / right col: SIZE
   *   y=118 – left: MRP (large) / right: Color
   *   y=152 – left: (Incl. taxes) / right: Net Qty
   *   y=170 – left: Category / right: Country of Origin
   *   y=196 – left: Brand
   *   y=222 – left: Mkg Dt
   *   y=248 – footer separator
   *   y=252 – footer: Mfg & Mktd by
   *   y=270 – footer: unit/address line
   *   y=288 – website | email
   *   y=306 – customer care  (bottom = 322 dots = 40.25 mm < 44 mm ✓)
   */
  buildSingleLabelTspl(
    item: PriceConfigItem,
    preview: PriceConfigPreview,
    settings: PriceLabelPrintSettings,
  ): string {
    const esc = (v = '') =>
      String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    const tpl  = preview.labelTemplate;
    const barcode = (item.ean || item.skuCode || 'N/A')
      .replace(/[^A-Za-z0-9\-\.\/\+\s]/g, '');
    const mrp  = item.currentPrice > 0
      ? `Rs.${item.currentPrice.toFixed(2)}`
      : 'Rs.0.00';
    const netQty  = String(item.labelQty || item.qty || 1);
    const mfgDate = esc(settings.mfgDate || '-');

    const lines = [
      `SIZE 90 mm,44 mm`,
      `GAP ${settings.gapMm} mm,0 mm`,
      `DENSITY ${settings.density}`,
      `SPEED ${settings.speed}`,
      `DIRECTION 0`,
      `REFERENCE 0,0`,
      `CLS`,

      // ── Barcode (no HRI – item code printed as TEXT below) ──────────────────
      `BARCODE 8,4,"128",80,0,0,2,2,"${esc(barcode)}"`,

      // ── Separator after barcode (barcode ends at y=84) ──────────────────────
      `BAR 0,86,720,1`,

      // ── Vertical separator between left / right columns (x=430 = 53.75 mm) ─
      `BAR 430,86,1,162`,

      // ── Left column ─────────────────────────────────────────────────────────
      `TEXT 8,90,"2",0,1,1,"${esc(item.skuCode || item.ean || '-')}"`,
      `TEXT 8,118,"3",0,1,1,"MRP :${mrp}"`,
      `TEXT 8,152,"1",0,1,1,"(Incl.of all Taxes)"`,
      `TEXT 8,170,"2",0,1,1,"Category : ${esc(item.category || '-')}"`,
      `TEXT 8,196,"2",0,1,1,"Brand : ${esc(item.brand || '-')}"`,
      `TEXT 8,222,"2",0,1,1,"Mkg Dt : ${mfgDate}"`,

      // ── Right column ─────────────────────────────────────────────────────────
      `TEXT 434,90,"2",0,1,1,"SIZE : ${esc(item.size || '-')}"`,
      `TEXT 434,118,"2",0,1,1,"Color : ${esc(item.color || '-')}"`,
      `TEXT 434,144,"2",0,1,1,"Net Qty : ${esc(netQty)}"`,
      `TEXT 434,170,"1",0,1,1,"Country Of Origin : ${esc(tpl.countryOfOrigin || 'India')}"`,

      // ── Footer separator ─────────────────────────────────────────────────────
      `BAR 0,248,720,1`,

      // ── Footer (font "1" = 8×16 tiny) ────────────────────────────────────────
      `TEXT 8,252,"1",0,1,1,"Mfg & Mktd by : ${esc(tpl.companyName)}"`,
      `TEXT 8,270,"1",0,1,1,"${esc(tpl.unitLine)}"`,
      `TEXT 8,288,"1",0,1,1,"website : ${esc(tpl.website)}"`,
      `TEXT 310,288,"1",0,1,1,"Email : ${esc(tpl.email)}"`,
      `TEXT 8,306,"1",0,1,1,"Customer Care No: ${esc(tpl.customerCare)}"`,

      `PRINT 1,1`,
    ];

    return lines.join('\r\n') + '\r\n';
  }

  // ── QZ Tray ──────────────────────────────────────────────────────────────────

  private async sendViaQzTray(
    printerName: string,
    content: string,
    jobName: string,
  ): Promise<void> {
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
