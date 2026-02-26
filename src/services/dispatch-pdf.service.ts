// src/services/dispatch-pdf.service.ts
import { Injectable } from '@angular/core';
import { DispatchRecord } from '../dispatch.models';

@Injectable({ providedIn: 'root' })
export class DispatchPdfService {

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────

  /** Print / download a single dispatch entry (mirrors the entry form layout) */
  printEntry(rec: DispatchRecord): void {
    const html = this.buildEntryHtml(rec);
    this.openPrintWindow(html);
  }

  /** Print / download overall report for multiple records */
  printReport(records: DispatchRecord[], dateLabel: string): void {
    const html = this.buildReportHtml(records, dateLabel);
    this.openPrintWindow(html);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SINGLE ENTRY PDF
  // ─────────────────────────────────────────────────────────────────────────

  private buildEntryHtml(rec: DispatchRecord): string {
    const totalDispatched = rec.dispatchItems?.reduce((s, r) => s + (r.quantity || 0), 0) ?? 0;
    const totalRTO        = rec.returnItems?.reduce((s, r)  => s + (r.rto || 0), 0) ?? 0;
    const totalCUS        = rec.returnItems?.reduce((s, r)  => s + (r.cus || 0), 0) ?? 0;
    const totalReturns    = totalRTO + totalCUS;

    // Build dispatch rows HTML
    let dispatchRows = '';
    let lastChannel = '';
    for (const item of rec.dispatchItems ?? []) {
      const isGroupStart = item.channel && item.channel !== lastChannel;
      if (item.channel) lastChannel = item.channel;
      dispatchRows += `
        <tr class="${isGroupStart ? 'group-start' : ''}">
          <td class="channel-cell">${isGroupStart ? `<span class="channel-badge">${item.channel}</span>` : ''}</td>
          <td>${item.courier}</td>
          <td class="num">${item.quantity > 0 ? item.quantity : '—'}</td>
        </tr>`;
    }

    // Build return rows HTML
    let returnRows = '';
    let lastReturnChannel = '';
    for (const item of rec.returnItems ?? []) {
      const isGroupStart = item.channel && item.channel !== lastReturnChannel;
      if (item.channel) lastReturnChannel = item.channel;
      returnRows += `
        <tr class="${isGroupStart ? 'group-start' : ''}">
          <td class="channel-cell">${isGroupStart ? `<span class="channel-badge">${item.channel}</span>` : ''}</td>
          <td>${item.courier}</td>
          <td class="num rto">${item.rto > 0 ? item.rto : '—'}</td>
          <td class="num cus">${item.cus > 0 ? item.cus : '—'}</td>
        </tr>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Dispatch Entry – ${this.fmtDate(rec.dispatchDate)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1B2F6E; background: white; }

    /* ── Header ── */
    .page-header {
      background: #1B2F6E;
      color: white;
      padding: 14px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .page-header h1 { font-size: 16px; font-weight: 800; letter-spacing: 0.5px; }
    .page-header .sub { font-size: 10px; opacity: 0.65; margin-top: 2px; }
    .date-badge {
      background: #FDB515;
      color: #1B2F6E;
      font-weight: 800;
      font-size: 13px;
      padding: 6px 14px;
      border-radius: 8px;
    }

    /* ── Meta row ── */
    .meta-row {
      display: flex;
      gap: 0;
      border-bottom: 2px solid #E8EDF8;
    }
    .meta-item {
      flex: 1;
      padding: 8px 16px;
      border-right: 1px solid #E8EDF8;
    }
    .meta-item:last-child { border-right: none; }
    .meta-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: rgba(27,47,110,0.45); }
    .meta-value { font-size: 14px; font-weight: 800; color: #1B2F6E; margin-top: 2px; }

    /* ── Summary chips ── */
    .summary-bar {
      display: flex;
      gap: 12px;
      padding: 10px 16px;
      background: #F8F9FC;
      border-bottom: 2px solid #E8EDF8;
    }
    .chip {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 11px;
    }
    .chip-dispatched { background: #1B2F6E; color: white; }
    .chip-dispatched .num { color: #FDB515; font-size: 18px; font-weight: 900; }
    .chip-returns { background: rgba(220,38,38,0.08); border: 1px solid rgba(220,38,38,0.2); color: #dc2626; }
    .chip-returns .num { font-size: 18px; font-weight: 900; }
    .chip-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.8; }
    .chip-sub { font-size: 9px; opacity: 0.7; margin-left: 8px; }

    /* ── Two-column tables ── */
    .tables-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border-top: 3px solid #FDB515;
    }
    .table-section { border-right: 1px solid #E8EDF8; }
    .table-section:last-child { border-right: none; }

    .table-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: #F0F4FC;
      border-bottom: 1px solid #E8EDF8;
    }
    .table-header h3 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: rgba(27,47,110,0.5); }
    .table-header .total { font-size: 12px; font-weight: 800; color: #1B2F6E; }

    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #F8F9FC; }
    thead th { padding: 6px 10px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: rgba(27,47,110,0.4); border-bottom: 1px solid #E8EDF8; }
    thead th.num { text-align: right; }
    tbody tr { border-bottom: 1px solid #F5F7FC; }
    tbody tr.group-start { background: rgba(253,181,21,0.04); }
    tbody td { padding: 6px 10px; color: rgba(27,47,110,0.75); }
    tbody td.num { text-align: right; font-weight: 700; color: #1B2F6E; }
    tbody td.rto { color: #dc2626; }
    tbody td.cus { color: #7c3aed; }

    .channel-cell { width: 80px; }
    .channel-badge {
      display: inline-block;
      background: rgba(27,47,110,0.08);
      color: #1B2F6E;
      font-weight: 700;
      font-size: 9px;
      padding: 2px 6px;
      border-radius: 4px;
    }

    /* Totals footer rows */
    .total-row td { padding: 6px 10px; font-weight: 700; font-size: 11px; }
    .total-row-rto { background: rgba(220,38,38,0.04); }
    .total-row-grand { background: rgba(220,38,38,0.08); }

    /* ── Footer ── */
    .page-footer {
      margin-top: 12px;
      padding: 8px 16px;
      border-top: 1px solid #E8EDF8;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: rgba(27,47,110,0.4);
    }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { size: A4 landscape; margin: 8mm; }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="page-header">
    <div>
      <h1>Online Dispatch Entry</h1>
      <div class="sub">Uathayam – Daily Dispatch & Returns Report</div>
    </div>
    <div class="date-badge">${this.fmtDate(rec.dispatchDate)}</div>
  </div>

  <!-- Meta row -->
  <div class="meta-row">
    <div class="meta-item">
      <div class="meta-label">Dispatch Date</div>
      <div class="meta-value">${this.fmtDate(rec.dispatchDate)}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Total Persons</div>
      <div class="meta-value">${rec.totalPersons ?? 0}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Pending Orders</div>
      <div class="meta-value">${rec.pendingOrders ?? 0}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Only Invoiced</div>
      <div class="meta-value">${rec.onlyInvoiced || 'NIL'}</div>
    </div>
  </div>

  <!-- Summary bar -->
  <div class="summary-bar">
    <div class="chip chip-dispatched">
      <div>
        <div class="chip-label">Total Dispatched</div>
        <div class="num">${totalDispatched}</div>
      </div>
    </div>
    <div class="chip chip-returns">
      <div>
        <div class="chip-label">Total Returns</div>
        <div class="num">${totalReturns}</div>
      </div>
      <span class="chip-sub">RTO: ${totalRTO} &nbsp;|&nbsp; CUS: ${totalCUS}</span>
    </div>
  </div>

  <!-- Tables grid -->
  <div class="tables-grid">

    <!-- Dispatch Table -->
    <div class="table-section">
      <div class="table-header">
        <h3>Daily Online Dispatch</h3>
        <span class="total">Total: ${totalDispatched}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Channel</th>
            <th>Courier</th>
            <th class="num">Qty</th>
          </tr>
        </thead>
        <tbody>
          ${dispatchRows}
          <tr class="total-row" style="background:#1B2F6E;">
            <td colspan="2" style="color:rgba(253,181,21,0.8); font-weight:800;">Total Dispatched</td>
            <td class="num" style="color:#FDB515; font-size:13px;">${totalDispatched}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Returns Table -->
    <div class="table-section">
      <div class="table-header">
        <h3>Daily Returns</h3>
        <span class="total" style="color:#dc2626;">Total: ${totalReturns}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Channel</th>
            <th>Courier</th>
            <th class="num">RTO</th>
            <th class="num">CUS</th>
          </tr>
        </thead>
        <tbody>
          ${returnRows}
          <tr class="total-row total-row-rto">
            <td colspan="2" style="color:rgba(27,47,110,0.6);">Sub-Total (RTO / CUS)</td>
            <td class="num rto">${totalRTO}</td>
            <td class="num cus">${totalCUS}</td>
          </tr>
          <tr class="total-row total-row-grand">
            <td colspan="2" style="color:#1B2F6E; font-size:12px;">Grand Total Returns</td>
            <td colspan="2" class="num" style="color:#dc2626; font-size:13px;">${totalReturns}</td>
          </tr>
        </tbody>
      </table>
    </div>

  </div>

  <!-- Footer -->
  <div class="page-footer">
    <span>Uathayam Ticketing System – Dispatch Report</span>
    <span>Printed: ${new Date().toLocaleString('en-IN')}</span>
  </div>

</body>
</html>`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // OVERALL REPORT PDF
  // ─────────────────────────────────────────────────────────────────────────

  private buildReportHtml(records: DispatchRecord[], dateLabel: string): string {
    if (!records.length) return '<html><body><p>No records to report.</p></body></html>';

    // Aggregate totals
    const grandDispatched = records.reduce((s, r) => s + (r.dispatchItems?.reduce((a, i) => a + (i.quantity || 0), 0) ?? 0), 0);
    const grandRTO        = records.reduce((s, r) => s + (r.returnItems?.reduce((a, i) => a + (i.rto || 0), 0) ?? 0), 0);
    const grandCUS        = records.reduce((s, r) => s + (r.returnItems?.reduce((a, i) => a + (i.cus || 0), 0) ?? 0), 0);
    const grandReturns    = grandRTO + grandCUS;

    // ── Summary table rows (one row per date) ──
    let summaryRows = '';
    for (const rec of records) {
      const dispatched = rec.dispatchItems?.reduce((s, i) => s + (i.quantity || 0), 0) ?? 0;
      const rto        = rec.returnItems?.reduce((s, i) => s + (i.rto || 0), 0) ?? 0;
      const cus        = rec.returnItems?.reduce((s, i) => s + (i.cus || 0), 0) ?? 0;
      const returns    = rto + cus;
      const net        = dispatched - returns;
      summaryRows += `
        <tr>
          <td class="date-cell"><strong>${this.fmtDate(rec.dispatchDate)}</strong></td>
          <td class="num">${rec.totalPersons ?? 0}</td>
          <td class="num">${rec.pendingOrders ?? 0}</td>
          <td class="num dispatched">${dispatched}</td>
          <td class="num rto">${rto}</td>
          <td class="num cus">${cus}</td>
          <td class="num returns">${returns}</td>
          <td class="num net ${net >= 0 ? 'positive' : 'negative'}">${net >= 0 ? '+' : ''}${net}</td>
        </tr>`;
    }

    // ── Per-channel aggregation ──
    const channelMap: Record<string, { dispatched: number; rto: number; cus: number }> = {};
    for (const rec of records) {
      let lastCh = '';
      for (const item of rec.dispatchItems ?? []) {
        const ch = item.channel || lastCh;
        if (item.channel) lastCh = item.channel;
        if (!ch) continue;
        if (!channelMap[ch]) channelMap[ch] = { dispatched: 0, rto: 0, cus: 0 };
        channelMap[ch].dispatched += item.quantity || 0;
      }
      let lastRCh = '';
      for (const item of rec.returnItems ?? []) {
        const ch = item.channel || lastRCh;
        if (item.channel) lastRCh = item.channel;
        if (!ch) continue;
        if (!channelMap[ch]) channelMap[ch] = { dispatched: 0, rto: 0, cus: 0 };
        channelMap[ch].rto += item.rto || 0;
        channelMap[ch].cus += item.cus || 0;
      }
    }

    let channelRows = '';
    const channels = Object.entries(channelMap).sort((a, b) => b[1].dispatched - a[1].dispatched);
    for (const [ch, vals] of channels) {
      const returns  = vals.rto + vals.cus;
      const net      = vals.dispatched - returns;
      const pct      = vals.dispatched > 0 ? Math.round((returns / vals.dispatched) * 100) : 0;
      channelRows += `
        <tr>
          <td><span class="channel-badge">${ch}</span></td>
          <td class="num dispatched">${vals.dispatched}</td>
          <td class="num rto">${vals.rto}</td>
          <td class="num cus">${vals.cus}</td>
          <td class="num returns">${returns}</td>
          <td class="num ${net >= 0 ? 'positive' : 'negative'}">${net >= 0 ? '+' : ''}${net}</td>
          <td class="num">
            <div class="bar-wrap">
              <div class="bar-fill" style="width:${Math.min(pct, 100)}%"></div>
              <span>${pct}%</span>
            </div>
          </td>
        </tr>`;
    }

    // ── Per-courier aggregation ──
    const courierMap: Record<string, { dispatched: number; rto: number; cus: number }> = {};
    for (const rec of records) {
      for (const item of rec.dispatchItems ?? []) {
        const key = item.courier || 'Unknown';
        if (!courierMap[key]) courierMap[key] = { dispatched: 0, rto: 0, cus: 0 };
        courierMap[key].dispatched += item.quantity || 0;
      }
      for (const item of rec.returnItems ?? []) {
        const key = item.courier || 'Unknown';
        if (!courierMap[key]) courierMap[key] = { dispatched: 0, rto: 0, cus: 0 };
        courierMap[key].rto += item.rto || 0;
        courierMap[key].cus += item.cus || 0;
      }
    }

    let courierRows = '';
    const couriers = Object.entries(courierMap).sort((a, b) => b[1].dispatched - a[1].dispatched);
    for (const [courier, vals] of couriers) {
      const returns = vals.rto + vals.cus;
      courierRows += `
        <tr>
          <td>${courier}</td>
          <td class="num dispatched">${vals.dispatched}</td>
          <td class="num rto">${vals.rto}</td>
          <td class="num cus">${vals.cus}</td>
          <td class="num returns">${returns}</td>
        </tr>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Dispatch Report – ${dateLabel}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1B2F6E; background: white; }

    /* ── Header ── */
    .page-header {
      background: #1B2F6E;
      color: white;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .page-header h1 { font-size: 18px; font-weight: 800; }
    .page-header .sub { font-size: 10px; opacity: 0.6; margin-top: 3px; }
    .header-right { text-align: right; }
    .period-badge {
      background: #FDB515;
      color: #1B2F6E;
      font-weight: 800;
      font-size: 12px;
      padding: 5px 12px;
      border-radius: 8px;
      display: inline-block;
      margin-bottom: 4px;
    }
    .record-count { font-size: 10px; opacity: 0.6; }

    /* ── KPI cards ── */
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      border-bottom: 2px solid #E8EDF8;
    }
    .kpi {
      padding: 14px 18px;
      border-right: 1px solid #E8EDF8;
      position: relative;
    }
    .kpi:last-child { border-right: none; }
    .kpi-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: rgba(27,47,110,0.4); }
    .kpi-value { font-size: 28px; font-weight: 900; margin-top: 4px; }
    .kpi-sub { font-size: 9px; color: rgba(27,47,110,0.45); margin-top: 2px; }
    .kpi-dispatched .kpi-value { color: #1B2F6E; }
    .kpi-returns .kpi-value { color: #dc2626; }
    .kpi-rto .kpi-value { color: #dc2626; }
    .kpi-cus .kpi-value { color: #7c3aed; }
    .kpi-accent { position: absolute; top: 0; left: 0; width: 4px; height: 100%; border-radius: 2px 0 0 2px; }

    /* ── Section titles ── */
    .section-title {
      padding: 10px 16px 6px;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: rgba(27,47,110,0.5);
      border-bottom: 2px solid #E8EDF8;
      display: flex;
      align-items: center;
      gap: 8px;
      background: #F8F9FC;
    }
    .section-title .dot { width: 8px; height: 8px; border-radius: 50%; background: #FDB515; }

    /* ── Tables ── */
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #F0F4FC; }
    thead th { padding: 7px 12px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: rgba(27,47,110,0.5); border-bottom: 1px solid #E8EDF8; }
    thead th.num { text-align: right; }
    tbody tr { border-bottom: 1px solid #F5F7FC; }
    tbody tr:hover { background: rgba(253,181,21,0.03); }
    tbody td { padding: 7px 12px; }
    tbody td.num { text-align: right; font-weight: 600; }
    tbody td.date-cell { font-weight: 700; color: #1B2F6E; }
    .dispatched { color: #1B2F6E; }
    .rto { color: #dc2626; }
    .cus { color: #7c3aed; }
    .returns { color: #dc2626; font-weight: 700; }
    .positive { color: #16a34a; font-weight: 700; }
    .negative { color: #dc2626; font-weight: 700; }
    tfoot tr { background: #1B2F6E; }
    tfoot td { padding: 8px 12px; color: rgba(253,181,21,0.85); font-weight: 800; font-size: 12px; }
    tfoot td.num { text-align: right; color: #FDB515; font-size: 13px; }

    /* ── Channel badge ── */
    .channel-badge {
      display: inline-block;
      background: rgba(27,47,110,0.08);
      color: #1B2F6E;
      font-weight: 700;
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 4px;
    }

    /* ── Bar chart ── */
    .bar-wrap { display: flex; align-items: center; gap: 6px; min-width: 80px; }
    .bar-fill { height: 6px; background: #dc2626; border-radius: 3px; min-width: 2px; opacity: 0.7; }
    .bar-wrap span { font-size: 10px; font-weight: 700; color: #dc2626; white-space: nowrap; }

    /* ── Section spacing ── */
    .section { margin-top: 0; page-break-inside: avoid; }
    .section + .section { border-top: 2px solid #E8EDF8; margin-top: 0; }

    /* ── Footer ── */
    .page-footer {
      margin-top: 14px;
      padding: 8px 16px;
      border-top: 2px solid #E8EDF8;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: rgba(27,47,110,0.4);
    }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { size: A4 portrait; margin: 8mm; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>

  <!-- ── Page Header ── -->
  <div class="page-header">
    <div>
      <h1>Online Dispatch – Overall Report</h1>
      <div class="sub">Uathayam – Consolidated Dispatch & Returns Summary</div>
    </div>
    <div class="header-right">
      <div class="period-badge">${dateLabel}</div>
      <div class="record-count">${records.length} working day${records.length !== 1 ? 's' : ''}</div>
    </div>
  </div>

  <!-- ── KPI Cards ── -->
  <div class="kpi-row">
    <div class="kpi kpi-dispatched">
      <div class="kpi-accent" style="background:#FDB515;"></div>
      <div class="kpi-label">Total Dispatched</div>
      <div class="kpi-value">${grandDispatched}</div>
      <div class="kpi-sub">Across all channels</div>
    </div>
    <div class="kpi kpi-returns">
      <div class="kpi-accent" style="background:#dc2626;"></div>
      <div class="kpi-label">Total Returns</div>
      <div class="kpi-value">${grandReturns}</div>
      <div class="kpi-sub">${grandDispatched > 0 ? Math.round((grandReturns / grandDispatched) * 100) : 0}% return rate</div>
    </div>
    <div class="kpi kpi-rto">
      <div class="kpi-accent" style="background:#ef4444;"></div>
      <div class="kpi-label">RTO Returns</div>
      <div class="kpi-value">${grandRTO}</div>
      <div class="kpi-sub">Return to origin</div>
    </div>
    <div class="kpi kpi-cus">
      <div class="kpi-accent" style="background:#7c3aed;"></div>
      <div class="kpi-label">CUS Returns</div>
      <div class="kpi-value">${grandCUS}</div>
      <div class="kpi-sub">Customer returns</div>
    </div>
  </div>

  <!-- ── Daily Summary Table ── -->
  <div class="section">
    <div class="section-title">
      <span class="dot"></span>
      Daily Summary
    </div>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th class="num">Persons</th>
          <th class="num">Pending</th>
          <th class="num dispatched">Dispatched</th>
          <th class="num rto">RTO</th>
          <th class="num cus">CUS</th>
          <th class="num returns">Returns</th>
          <th class="num">Net</th>
        </tr>
      </thead>
      <tbody>${summaryRows}</tbody>
      <tfoot>
        <tr>
          <td colspan="3">Grand Total (${records.length} days)</td>
          <td class="num">${grandDispatched}</td>
          <td class="num" style="color:#ef9999;">${grandRTO}</td>
          <td class="num" style="color:#c4b5fd;">${grandCUS}</td>
          <td class="num">${grandReturns}</td>
          <td class="num" style="color:${grandDispatched - grandReturns >= 0 ? '#86efac' : '#fca5a5'};">
            ${grandDispatched - grandReturns >= 0 ? '+' : ''}${grandDispatched - grandReturns}
          </td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- ── Channel-wise Breakdown ── -->
  <div class="section">
    <div class="section-title">
      <span class="dot"></span>
      Channel-wise Breakdown
    </div>
    <table>
      <thead>
        <tr>
          <th>Channel</th>
          <th class="num dispatched">Dispatched</th>
          <th class="num rto">RTO</th>
          <th class="num cus">CUS</th>
          <th class="num returns">Returns</th>
          <th class="num">Net</th>
          <th class="num">Return Rate</th>
        </tr>
      </thead>
      <tbody>${channelRows}</tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td class="num">${grandDispatched}</td>
          <td class="num" style="color:#ef9999;">${grandRTO}</td>
          <td class="num" style="color:#c4b5fd;">${grandCUS}</td>
          <td class="num">${grandReturns}</td>
          <td class="num">${grandDispatched - grandReturns >= 0 ? '+' : ''}${grandDispatched - grandReturns}</td>
          <td class="num">${grandDispatched > 0 ? Math.round((grandReturns / grandDispatched) * 100) : 0}%</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- ── Courier-wise Breakdown ── -->
  <div class="section">
    <div class="section-title">
      <span class="dot"></span>
      Courier-wise Breakdown
    </div>
    <table>
      <thead>
        <tr>
          <th>Courier</th>
          <th class="num dispatched">Dispatched</th>
          <th class="num rto">RTO</th>
          <th class="num cus">CUS</th>
          <th class="num returns">Total Returns</th>
        </tr>
      </thead>
      <tbody>${courierRows}</tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td class="num">${grandDispatched}</td>
          <td class="num" style="color:#ef9999;">${grandRTO}</td>
          <td class="num" style="color:#c4b5fd;">${grandCUS}</td>
          <td class="num">${grandReturns}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- ── Footer ── -->
  <div class="page-footer">
    <span>Uathayam Ticketing System – Dispatch Overall Report</span>
    <span>Generated: ${new Date().toLocaleString('en-IN')}</span>
  </div>

</body>
</html>`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  private openPrintWindow(html: string): void {
    const win = window.open('', '_blank', 'width=1100,height=800');
    if (!win) { alert('Please allow popups to download the PDF.'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    // Give images/fonts time to load, then trigger print
    setTimeout(() => {
      win.print();
      // Optionally close after print dialog closes
      win.onafterprint = () => win.close();
    }, 600);
  }

  private fmtDate(d: string): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}