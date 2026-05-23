import { Injectable } from '@angular/core';
import { PriceConfigItem, PriceConfigPreview } from '../price-configuration.models';

@Injectable({ providedIn: 'root' })
export class PriceLabelPrintService {
  print(preview: PriceConfigPreview, configurationNo?: string | null): void {
    const labels = preview.items.flatMap((item) => {
      const repeat = Math.max(0, item.labelQty || item.qty || 0);
      return Array.from({ length: repeat }, () => item);
    });

    if (labels.length === 0) {
      alert('There are no label quantities available to print.');
      return;
    }

    const html = this.buildPrintHtml(preview, labels, configurationNo);
    const win = window.open('', '_blank', 'width=1280,height=860');
    if (!win) {
      alert('Please allow popups to print labels.');
      return;
    }

    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.onafterprint = () => win.close();
    }, 700);
  }

  private buildPrintHtml(preview: PriceConfigPreview, labels: PriceConfigItem[], configurationNo?: string | null): string {
    const cards = labels.map((item) => `
      <div class="label-card">
        <div class="label-header">
          <div class="brand-line">${this.escape(item.brand || 'UATHAYAM')}</div>
          <div class="qty-badge">Qty ${item.labelQty || item.qty}</div>
        </div>

        <div class="barcode-row">
          <div class="barcode-block">
            <div class="barcode-bars">${this.renderBars(item.ean || item.skuCode)}</div>
            <div class="barcode-text">${this.escape(item.ean || item.skuCode)}</div>
          </div>
          <div class="price-panel">
            <div class="price-label">MRP</div>
            <div class="price-value">${this.formatCurrency(item.currentPrice)}</div>
            <div class="price-note">(Incl. of all taxes)</div>
          </div>
        </div>

        <div class="item-name">${this.escape(item.itemName || item.pickListName || item.skuCode)}</div>

        <div class="meta-grid">
          <div class="meta-row"><span>Category</span><strong>${this.escape(item.category || '-')}</strong></div>
          <div class="meta-row"><span>Size</span><strong>${this.escape(item.size || '-')}</strong></div>
          <div class="meta-row"><span>Color</span><strong>${this.escape(item.color || '-')}</strong></div>
          <div class="meta-row"><span>SKU</span><strong>${this.escape(item.skuCode || '-')}</strong></div>
        </div>

        <div class="footer-lines">
          <div>Mfg & Mktd by: ${this.escape(preview.labelTemplate.companyName)}</div>
          <div>${this.escape(preview.labelTemplate.unitLine)}</div>
          <div>${this.escape(preview.labelTemplate.website)} | ${this.escape(preview.labelTemplate.email)}</div>
          <div>Customer Care: ${this.escape(preview.labelTemplate.customerCare)}</div>
          <div>Country Of Origin: ${this.escape(preview.labelTemplate.countryOfOrigin)}</div>
        </div>
      </div>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Label Print - ${this.escape(configurationNo || preview.pickListNo)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 18px;
      font-family: 'Segoe UI', Arial, sans-serif;
      background: #F6F7FB;
      color: #111827;
    }
    .sheet-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
      margin-bottom: 18px;
    }
    .sheet-header h1 { margin: 0; font-size: 22px; }
    .sheet-header p { margin: 4px 0 0; font-size: 12px; color: rgba(27,47,110,0.6); }
    .sheet-badge {
      padding: 8px 12px;
      border-radius: 12px;
      background: #111827;
      color: white;
      font-weight: 800;
      font-size: 12px;
    }
    .label-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    .label-card {
      background: white;
      color: #111827;
      border-radius: 14px;
      border: 1px solid #D1D5DB;
      padding: 14px;
      min-height: 215px;
      break-inside: avoid;
      box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
    }
    .label-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
    }
    .brand-line {
      color: #111827;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .qty-badge {
      background: #FEF3C7;
      color: #92400E;
      border-radius: 999px;
      padding: 5px 10px;
      font-weight: 800;
      font-size: 11px;
      white-space: nowrap;
    }
    .barcode-row {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 12px;
      margin-top: 10px;
      align-items: stretch;
    }
    .barcode-block {
      background: white;
      color: #111827;
      border-radius: 10px;
      padding: 10px 12px 8px;
      border: 1px solid #D1D5DB;
    }
    .barcode-bars {
      display: flex;
      align-items: flex-end;
      gap: 1px;
      height: 56px;
      overflow: hidden;
    }
    .barcode-bars span {
      display: block;
      background: #111827;
      width: 2px;
      border-radius: 1px;
    }
    .barcode-text {
      margin-top: 8px;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-align: center;
      font-weight: 700;
    }
    .price-panel {
      border: 1px solid #D1D5DB;
      border-radius: 10px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      background: #F9FAFB;
    }
    .price-label {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #6B7280;
    }
    .price-value {
      margin-top: 6px;
      font-size: 20px;
      font-weight: 900;
      color: #111827;
    }
    .price-note {
      margin-top: 6px;
      font-size: 10px;
      color: #6B7280;
    }
    .item-name {
      margin-top: 10px;
      font-size: 16px;
      line-height: 1.25;
      font-weight: 900;
      color: #111827;
      min-height: 40px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px 12px;
      margin-top: 10px;
    }
    .meta-row {
      border-bottom: 1px dashed #E5E7EB;
      padding-bottom: 5px;
    }
    .meta-row span {
      display: block;
      color: #6B7280;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .meta-row strong {
      display: block;
      margin-top: 3px;
      font-size: 12px;
      color: #111827;
    }
    .footer-lines {
      margin-top: 10px;
      font-size: 10px;
      line-height: 1.45;
      color: #374151;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    @media print {
      body { background: white; padding: 8mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { size: A4 portrait; margin: 8mm; }
      .sheet-header { margin-bottom: 10px; }
    }
  </style>
</head>
<body>
  <div class="sheet-header">
    <div>
      <h1>Price Configuration Labels</h1>
      <p>Pick List ${this.escape(preview.pickListNo)} | ${labels.length} label${labels.length !== 1 ? 's' : ''}</p>
    </div>
    <div class="sheet-badge">${this.escape(configurationNo || 'Draft')}</div>
  </div>
  <div class="label-grid">${cards}</div>
</body>
</html>`;
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);
  }

  private renderBars(value: string): string {
    const chars = Array.from(String(value || 'N/A'));
    return chars.map((char, index) => {
      const code = char.charCodeAt(0);
      const tall = 18 + ((code + index * 7) % 40);
      const width = (code % 3) + 1;
      return `<span style="height:${tall}px;width:${width}px"></span>`;
    }).join('');
  }

  private escape(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
