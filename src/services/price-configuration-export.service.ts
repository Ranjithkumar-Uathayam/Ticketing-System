import { Injectable } from '@angular/core';
import { PriceConfigPreview } from '../price-configuration.models';

@Injectable({ providedIn: 'root' })
export class PriceConfigurationExportService {
  download(preview: PriceConfigPreview, configurationNo?: string | null): void {
    const rows = preview.items.map((item) => `
      <tr>
        <td>${item.serialNo}</td>
        <td>${this.escape(item.skuCode)}</td>
        <td>${this.escape(item.pickListName)}</td>
        <td>${this.escape(item.itemName)}</td>
        <td>${this.escape(item.brand)}</td>
        <td>${this.escape(item.category)}</td>
        <td>${this.escape(item.size)}</td>
        <td>${this.escape(item.color)}</td>
        <td>${item.qty}</td>
        <td>${item.currentPrice.toFixed(2)}</td>
        <td>${item.totalPrice.toFixed(2)}</td>
        <td>${this.escape(item.matchStatus)}</td>
        <td>${item.labelQty}</td>
        <td>${this.escape(item.notes)}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Price Configuration ${this.escape(preview.pickListNo)}</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; color: #1B2F6E; margin: 18px; }
    h1 { margin: 0 0 6px; }
    .meta { margin-bottom: 18px; font-size: 12px; color: rgba(27,47,110,0.7); }
    .meta strong { color: #1B2F6E; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #D7DDEA; padding: 8px; font-size: 11px; vertical-align: top; }
    th { background: #EEF3FF; text-align: left; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 0 0 18px; }
    .card { border: 1px solid #D7DDEA; border-radius: 12px; padding: 10px 12px; background: #F8FAFF; }
    .card .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(27,47,110,0.55); }
    .card .value { font-size: 18px; font-weight: 800; margin-top: 4px; }
  </style>
</head>
<body>
  <h1>Updated Pick List Pricing</h1>
  <div class="meta">
    <strong>Configuration:</strong> ${this.escape(configurationNo || 'Draft Preview')}
    &nbsp;&nbsp; <strong>Pick List:</strong> ${this.escape(preview.pickListNo)}
    &nbsp;&nbsp; <strong>Created:</strong> ${this.escape(preview.pickListCreatedAt || '-')}
  </div>
  <div class="summary">
    <div class="card"><div class="label">Lines</div><div class="value">${preview.totalLines}</div></div>
    <div class="card"><div class="label">Quantity</div><div class="value">${preview.totalQuantity}</div></div>
    <div class="card"><div class="label">Matched</div><div class="value">${preview.matchedCount}</div></div>
    <div class="card"><div class="label">Unmatched</div><div class="value">${preview.unmatchedCount}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>SI No.</th>
        <th>SKU Code</th>
        <th>Pick List Name</th>
        <th>Item Name</th>
        <th>Brand</th>
        <th>Category</th>
        <th>Size</th>
        <th>Color</th>
        <th>Qty</th>
        <th>Current Price</th>
        <th>Total Price</th>
        <th>Status</th>
        <th>Label Qty</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${configurationNo || preview.pickListNo || 'price-configuration'}.xls`;
    link.click();
    URL.revokeObjectURL(url);
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
