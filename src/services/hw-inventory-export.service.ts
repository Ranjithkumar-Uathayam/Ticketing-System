// src/services/hw-inventory-export.service.ts
import { Injectable } from '@angular/core';
import { HWAsset } from '../hw-inventory.models';

@Injectable({ providedIn: 'root' })
export class HwInventoryExportService {

  // ── Public API ────────────────────────────────────────────────────────────

  exportToExcel(assets: HWAsset[], filename = 'hardware-inventory'): void {
    const headers = [
      'Asset ID', 'Category', 'Manufacturer', 'Model', 'Serial Number',
      'Location', 'Floor', 'Department', 'Assigned To', 'Place',
      'Processor', 'RAM (GB)', 'HDD (GB/TB)', 'SSD (GB/TB)', 'OS', 'IP Address',
      'Status', 'Warranty Status', 'Warranty Expiry', 'Antivirus', 'Remarks', 'Created At',
    ];

    const rows = assets.map(a => [
      a.assetId,
      a.category,
      a.manufacturer,
      a.model,
      a.serialNumber,
      a.location,
      a.floor ?? '',
      a.department ?? '',
      a.assignedTo ?? '',
      a.place ?? '',
      a.processor ?? '',
      a.ramGb ?? '',
      a.hddGbTb ?? '',
      a.ssdGbTb ?? '',
      a.os ?? '',
      a.ipAddress ?? '',
      a.status,
      a.warrantyStatus,
      this.fmtDate(a.warrantyExpiry),
      a.antivirusActive === true ? 'Yes' : a.antivirusActive === false ? 'No' : '',
      a.remarks ?? '',
      this.fmtDate(a.createdAt),
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  printReport(assets: HWAsset[]): void {
    const html = this.buildReportHtml(assets);
    this.openPrintWindow(html);
  }

  // ── PDF Builder ───────────────────────────────────────────────────────────

  private buildReportHtml(assets: HWAsset[]): string {
    const today = new Date();
    const in90  = new Date(today.getTime() + 90 * 86400_000);

    const total        = assets.length;
    const active       = assets.filter(a => a.status === 'Active').length;
    const spare        = assets.filter(a => a.status === 'Spare').length;
    const faulty       = assets.filter(a => a.status === 'Faulty' || a.status === 'In Repair').length;
    const inWarranty   = assets.filter(a => a.warrantyStatus === 'In Warranty').length;
    const expiringSoon = assets.filter(a => {
      if (!a.warrantyExpiry || a.warrantyStatus !== 'In Warranty') return false;
      const exp = new Date(a.warrantyExpiry);
      return exp >= today && exp <= in90;
    }).length;
    const desktop = assets.filter(a => a.category === 'Desktop').length;
    const laptop  = assets.filter(a => a.category === 'Laptop').length;
    const printer = assets.filter(a => a.category === 'Printer').length;
    const scanner = assets.filter(a => a.category === 'Scanner').length;

    let tableRows = '';
    for (const a of assets) {
      const expiring = a.warrantyExpiry && a.warrantyStatus === 'In Warranty'
        ? (() => { const d = new Date(a.warrantyExpiry!); return d >= today && d <= in90; })()
        : false;

      const statusColor  = a.status === 'Active'    ? 'color:#065F46;background:#D1FAE5;'
                         : a.status === 'Spare'     ? 'color:#1e40af;background:#DBEAFE;'
                         : a.status === 'Faulty' || a.status === 'In Repair' ? 'color:#991B1B;background:#FEE2E2;'
                         : 'color:#374151;background:#F3F4F6;';
      const warrantyColor = a.warrantyStatus === 'In Warranty'      ? 'color:#065F46;background:#D1FAE5;'
                          : a.warrantyStatus === 'Out of Warranty'   ? 'color:#991B1B;background:#FEE2E2;'
                          : 'color:#374151;background:#F3F4F6;';

      tableRows += `
        <tr>
          <td>${a.assetId}</td>
          <td>${a.category}</td>
          <td>${a.manufacturer}</td>
          <td>${a.model}</td>
          <td class="mono">${a.serialNumber || '—'}</td>
          <td>${a.location}${a.floor ? `<br><span class="sub">${a.floor}</span>` : ''}</td>
          <td>${a.department || '—'}${a.assignedTo ? `<br><span class="sub">${a.assignedTo}</span>` : ''}</td>
          <td class="mono">${a.ipAddress || '—'}</td>
          <td><span class="badge" style="${statusColor}">${a.status}</span></td>
          <td><span class="badge" style="${warrantyColor}">${a.warrantyStatus}</span></td>
          <td style="${expiring ? 'color:#c2410c;font-weight:700;' : ''}">
            ${this.fmtDate(a.warrantyExpiry) || '—'}
            ${expiring ? '<span style="background:#FED7AA;color:#c2410c;padding:1px 5px;border-radius:4px;font-size:7px;margin-left:3px;">Soon</span>' : ''}
          </td>
          <td class="remarks">${a.remarks || '—'}</td>
        </tr>`;
    }

    const printedAt = today.toLocaleString('en-IN');
    const dateLabel = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Hardware Inventory Report – ${dateLabel}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI',Arial,sans-serif; font-size:10px; color:#1B2F6E; background:white; }

    .page-header {
      background:#1B2F6E; color:white; padding:14px 20px;
      display:flex; align-items:center; justify-content:space-between;
    }
    .page-header h1 { font-size:16px; font-weight:800; }
    .page-header .sub { font-size:9px; opacity:0.6; margin-top:2px; }
    .date-badge { background:#FDB515; color:#1B2F6E; font-weight:800; font-size:11px; padding:5px 12px; border-radius:6px; }

    .kpi-row { display:grid; grid-template-columns:repeat(5,1fr); border-bottom:2px solid #E8EDF8; }
    .kpi { padding:10px 14px; border-right:1px solid #E8EDF8; }
    .kpi:last-child { border-right:none; }
    .kpi-label { font-size:8px; font-weight:700; text-transform:uppercase; letter-spacing:0.8px; color:rgba(27,47,110,0.4); }
    .kpi-value { font-size:22px; font-weight:900; color:#1B2F6E; margin-top:3px; }
    .kpi-sub { font-size:8px; color:rgba(27,47,110,0.4); margin-top:2px; }

    .kpi2-row { display:grid; grid-template-columns:repeat(6,1fr); border-bottom:2px solid #E8EDF8; background:#F8F9FC; }
    .kpi2 { padding:8px 14px; border-right:1px solid #E8EDF8; text-align:center; }
    .kpi2:last-child { border-right:none; }
    .kpi2-label { font-size:8px; font-weight:700; text-transform:uppercase; letter-spacing:0.6px; color:rgba(27,47,110,0.4); }
    .kpi2-value { font-size:16px; font-weight:800; color:#1B2F6E; margin-top:2px; }

    table { width:100%; border-collapse:collapse; }
    thead tr { background:#F0F4FC; }
    thead th { padding:6px 8px; text-align:left; font-size:8px; font-weight:700; text-transform:uppercase;
               letter-spacing:0.5px; color:rgba(27,47,110,0.5); border-bottom:1px solid #E8EDF8; white-space:nowrap; }
    tbody tr { border-bottom:1px solid #F5F7FC; }
    tbody tr:nth-child(even) { background:#FAFBFD; }
    tbody td { padding:5px 8px; color:rgba(27,47,110,0.8); font-size:9px; vertical-align:middle; }
    .mono { font-family:'Courier New',monospace; font-size:8px; }
    .sub { font-size:8px; color:rgba(27,47,110,0.45); }
    .badge { padding:2px 6px; border-radius:4px; font-size:8px; font-weight:700; white-space:nowrap; }
    .remarks { max-width:100px; word-break:break-word; color:rgba(27,47,110,0.5); font-size:8px; }

    .page-footer {
      margin-top:10px; padding:6px 16px; border-top:1px solid #E8EDF8;
      display:flex; justify-content:space-between; font-size:8px; color:rgba(27,47,110,0.4);
    }

    @media print {
      body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      @page { size:A3 landscape; margin:8mm; }
      tr { page-break-inside:avoid; }
    }
  </style>
</head>
<body>

  <div class="page-header">
    <div>
      <h1>Hardware Inventory Report</h1>
      <div class="sub">Uathayam – IT Asset Management &nbsp;·&nbsp; ${total} asset${total !== 1 ? 's' : ''}</div>
    </div>
    <div class="date-badge">${dateLabel}</div>
  </div>

  <div class="kpi-row">
    <div class="kpi">
      <div class="kpi-label">Total Assets</div>
      <div class="kpi-value">${total}</div>
      <div class="kpi-sub">All categories</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Active</div>
      <div class="kpi-value" style="color:#16a34a;">${active}</div>
      <div class="kpi-sub">${total ? Math.round(active / total * 100) : 0}% of total</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Spare</div>
      <div class="kpi-value" style="color:#1d4ed8;">${spare}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Faulty / In Repair</div>
      <div class="kpi-value" style="color:#dc2626;">${faulty}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">In Warranty</div>
      <div class="kpi-value" style="color:#059669;">${inWarranty}</div>
      <div class="kpi-sub">${expiringSoon} expiring within 90 days</div>
    </div>
  </div>

  <div class="kpi2-row">
    <div class="kpi2"><div class="kpi2-label">Desktop</div><div class="kpi2-value">${desktop}</div></div>
    <div class="kpi2"><div class="kpi2-label">Laptop</div><div class="kpi2-value">${laptop}</div></div>
    <div class="kpi2"><div class="kpi2-label">Printer</div><div class="kpi2-value">${printer}</div></div>
    <div class="kpi2"><div class="kpi2-label">Scanner</div><div class="kpi2-value">${scanner}</div></div>
    <div class="kpi2">
      <div class="kpi2-label">Expiring Soon</div>
      <div class="kpi2-value" style="color:#c2410c;">${expiringSoon}</div>
    </div>
    <div class="kpi2">
      <div class="kpi2-label">Generated</div>
      <div class="kpi2-value" style="font-size:9px;line-height:1.4;">${printedAt}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Asset ID</th>
        <th>Category</th>
        <th>Manufacturer</th>
        <th>Model</th>
        <th>Serial No.</th>
        <th>Location / Floor</th>
        <th>Dept / Assigned</th>
        <th>IP Address</th>
        <th>Status</th>
        <th>Warranty</th>
        <th>Expiry</th>
        <th>Remarks</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <div class="page-footer">
    <span>Uathayam Ticketing System – Hardware Inventory Report</span>
    <span>Printed: ${printedAt} &nbsp;·&nbsp; ${total} asset${total !== 1 ? 's' : ''}</span>
  </div>

</body>
</html>`;
  }

  private openPrintWindow(html: string): void {
    const win = window.open('', '_blank', 'width=1200,height=850');
    if (!win) { alert('Please allow popups to print.'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.onafterprint = () => win.close();
    }, 600);
  }

  private fmtDate(d?: string | null): string {
    if (!d) return '';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
