'use strict';

const XLSX = require('xlsx');
const { PDFParse } = require('pdf-parse');
const fs = require('fs');
const nodePath = require('path');

// ─── Text helpers ────────────────────────────────────────────────────────────

function normalizeHeader(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function cleanText(value) {
  return String(value == null ? '' : value).split(/\s+/).filter(Boolean).join(' ').trim();
}

function normalizeSku(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function asNumber(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return value;
  const n = parseFloat(String(value).trim().replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

// ─── Header detection ────────────────────────────────────────────────────────

function detectHeaderRow(rows, requiredAny, maxRows = 20) {
  for (let ri = 0; ri < Math.min(rows.length, maxRows); ri++) {
    const normalized = (rows[ri] || []).map(normalizeHeader);
    if (normalized.some(k => requiredAny.includes(k))) {
      const headerMap = {};
      normalized.forEach((k, i) => { if (k && !(k in headerMap)) headerMap[k] = i; });
      return { headerRowIndex: ri + 1, headerMap };
    }
  }
  return { headerRowIndex: null, headerMap: {} };
}

function firstPresent(row, headerMap, ...names) {
  for (const name of names) {
    const idx = headerMap[normalizeHeader(name)];
    if (idx == null || idx >= row.length) continue;
    const val = row[idx];
    if (val != null && val !== '') return cleanText(val);
  }
  return '';
}

function firstNumber(row, headerMap, ...names) {
  for (const name of names) {
    const idx = headerMap[normalizeHeader(name)];
    if (idx == null || idx >= row.length) continue;
    const val = row[idx];
    if (val != null && val !== '') return asNumber(val);
  }
  return 0;
}

// ─── Item Master (Excel) ─────────────────────────────────────────────────────

function parseItemMaster(filePath) {
  const ext = nodePath.extname(filePath).toLowerCase();
  if (ext === '.xls') {
    throw new Error('Legacy .xls item master files are not supported. Please save as .xlsx and upload again.');
  }

  const wb = XLSX.readFile(filePath, { type: 'file', cellDates: false, raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Accept any common product-code column name used in item master exports
  const SKU_KEYS = ['skucode', 'sku', 'itemcode', 'productcode', 'stylecode', 'articleno', 'articlecode', 'style', 'product'];
  const { headerRowIndex, headerMap } = detectHeaderRow(rawRows, SKU_KEYS);
  if (!headerRowIndex) {
    const sampleHeaders = (rawRows.slice(0, 5))
      .map(r => (r || []).map(c => cleanText(c)).filter(Boolean).join(', '))
      .filter(Boolean)
      .join(' | ');
    throw new Error(
      `The item master file is missing a recognizable SKU Code header row (looked in first 20 rows). ` +
      `Accepted column names: "SKU Code", "SKU", "Item Code", "Style Code", "Product Code", "Article No". ` +
      `Headers found: ${sampleHeaders || '(empty file)'}`
    );
  }

  const items = [];
  const seenSkus = new Set();

  for (let i = headerRowIndex; i < rawRows.length; i++) {
    const row = rawRows[i];
    const skuCode = firstPresent(row, headerMap,
      'Sku Code', 'SKU', 'Item Code', 'Product Code', 'Style Code', 'Article No', 'Article Code', 'Style', 'Product');
    const normalizedSku = normalizeSku(skuCode);
    if (!normalizedSku || seenSkus.has(normalizedSku)) continue;
    seenSkus.add(normalizedSku);

    items.push({
      skuCode,
      itemName:   firstPresent(row, headerMap, 'Item Name'),
      category:   firstPresent(row, headerMap, 'Category'),
      color:      firstPresent(row, headerMap, 'Color', 'Colour'),
      brand:      firstPresent(row, headerMap, 'Brand'),
      hsnCode:    firstPresent(row, headerMap, 'HSN Code'),
      tat:        firstPresent(row, headerMap, 'Tat'),
      size:       firstPresent(row, headerMap, 'Size'),
      weight:     firstPresent(row, headerMap, 'Weight'),
      costPrice:  firstNumber(row, headerMap, 'Cost Price'),
      mrp:        firstNumber(row, headerMap, 'MRP'),
      batchGroup: firstPresent(row, headerMap, 'Batch Group'),
      ean:        firstPresent(row, headerMap, 'EAN'),
      dimensions: firstPresent(row, headerMap, 'Dimensions'),
      taxType:    firstPresent(row, headerMap, 'Tax Type'),
      enabled:    firstPresent(row, headerMap, 'Enabled'),
      itemType:   firstPresent(row, headerMap, 'Type', 'Item Type'),
      expirable:  firstPresent(row, headerMap, 'Expirable'),
      skuType:    firstPresent(row, headerMap, 'Sku Type'),
      image:      firstPresent(row, headerMap, 'Image'),
      pageUrl:    firstPresent(row, headerMap, 'Page URL'),
    });
  }

  return { items };
}

// ─── Pick List detail-line parser ─────────────────────────────────────────────

function parsePickItem(serialNo, skuCode, detailLines) {
  const cleaned = detailLines.map(cleanText).filter(Boolean);
  let summaryIndex = null;

  for (let i = cleaned.length - 1; i >= 0; i--) {
    if (/\bDEFAULT\b/i.test(cleaned[i]) && /\s\d+\s*$/.test(cleaned[i])) {
      summaryIndex = i;
      break;
    }
  }

  if (summaryIndex === null && cleaned.length > 0) {
    summaryIndex = cleaned.length - 1;
  }

  const summaryLine = summaryIndex !== null ? cleaned[summaryIndex] : '';
  const nameLines   = summaryIndex !== null ? cleaned.slice(0, summaryIndex) : [...cleaned];

  let leading = '', shelfCode = '', size = '', color = '', qty = 1;

  const m = summaryLine.match(
    /^(?:(.+?)\s+)?([A-Z0-9_-]+)\s+([A-Z0-9./+-]+)\s+(.+?)\s+(\d+)$/i
  );
  if (m) {
    leading    = cleanText(m[1] || '');
    shelfCode  = cleanText(m[2] || '');
    size       = cleanText(m[3] || '');
    color      = cleanText(m[4] || '');
    qty        = parseInt(m[5] || '1', 10) || 1;
  } else if (summaryLine) {
    const lastSpace = summaryLine.lastIndexOf(' ');
    if (lastSpace !== -1) {
      const tail = summaryLine.slice(lastSpace + 1);
      if (/^\d+$/.test(tail)) {
        qty     = parseInt(tail, 10) || 1;
        leading = summaryLine.slice(0, lastSpace).trim();
      } else {
        leading = summaryLine.trim();
      }
    } else {
      leading = summaryLine.trim();
    }
  }

  const nameParts = nameLines.filter(Boolean);
  if (leading) nameParts.push(leading);

  return {
    serialNo,
    skuCode,
    pickListName: nameParts.join(' ').trim() || skuCode,
    shelfCode,
    size,
    color,
    qty,
  };
}

// ─── Pick List PDF ────────────────────────────────────────────────────────────

async function parsePickListPdf(filePath) {
  const buf = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buf });
  const data = await parser.getText();
  await parser.destroy();
  const fullText = data.text || '';
  const rawLines = fullText.split('\n').map(l => l.trimEnd());

  // Extract pick list number — several header label formats
  let plNoMatch = fullText.match(
    /(?:Pick\s*List|Picklist|PL)\s*(?:No|#|Number)[.:\s]+([A-Za-z0-9_-]+)/i
  );
  if (!plNoMatch) plNoMatch = fullText.match(/\b(PK[0-9]{3,})\b/i);

  const createdMatch = fullText.match(
    /Created[:\s]+([0-9]{1,2}\s+[A-Za-z]{3}\s+[0-9]{4}\s+[0-9]{2}:[0-9]{2})/
  );

  // Find "Pick These Items" section start
  let startLine = 0;
  for (let i = 0; i < rawLines.length; i++) {
    if (/pick\s+these\s+items/i.test(rawLines[i])) {
      startLine = i + 1;
      break;
    }
  }

  const items = [];
  let currentSerial = null;
  let currentSku    = '';
  let detailLines   = [];

  function flushCurrent() {
    if (currentSerial === null || !currentSku) {
      currentSerial = null; currentSku = ''; detailLines = [];
      return;
    }
    items.push(parsePickItem(currentSerial, currentSku, detailLines));
    currentSerial = null; currentSku = ''; detailLines = [];
  }

  for (let i = startLine; i < rawLines.length; i++) {
    const line = cleanText(rawLines[i]);
    if (!line) continue;
    if (/powered\s+by/i.test(line)) break;
    if (/\bpage\b/i.test(line)) continue;

    // Format 1 — isolated serial number: "1", "1.", "12."
    if (/^\d+[.)]?$/.test(line)) {
      flushCurrent();
      currentSerial = parseInt(line.replace(/\D/g, ''), 10);
      continue;
    }

    // Format 2 — serial + SKU merged on one line by pypdf layout extraction
    // e.g. "1.PROD-SKU-001", "1. PROD-SKU-001", "1 PROD-SKU-001 detail text..."
    const inline = line.match(
      /^(\d{1,5})[.)\s]\s*([A-Za-z0-9][A-Za-z0-9_./-]{2,})(?:\s+(.+))?$/
    );
    if (inline && parseInt(inline[1], 10) > 0) {
      flushCurrent();
      currentSerial = parseInt(inline[1], 10);
      currentSku    = cleanText(inline[2]);
      const rem     = cleanText(inline[3] || '');
      if (rem) detailLines.push(rem);
      continue;
    }

    if (currentSerial === null) continue;
    if (!currentSku)  { currentSku = line; continue; }
    detailLines.push(line);
  }

  flushCurrent();

  return {
    pickListNo:       plNoMatch ? plNoMatch[1] : nodePath.parse(filePath).name,
    pickListCreatedAt: createdMatch ? createdMatch[1] : null,
    items,
  };
}

// ─── Pick List Excel ──────────────────────────────────────────────────────────

function parsePickListExcel(filePath) {
  const wb = XLSX.readFile(filePath, { type: 'file', cellDates: false, raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const { headerRowIndex, headerMap } = detectHeaderRow(
    rawRows,
    ['skucode', 'sku', 'qty', 'quantity'],
  );
  if (!headerRowIndex) {
    throw new Error('The pick list Excel file is missing a recognizable SKU/Qty header row.');
  }

  // Extract pick list number / created date from first 12 rows
  const metaText = rawRows
    .slice(0, 12)
    .flat()
    .map(String)
    .filter(Boolean)
    .join(' | ');

  let pickListNo = nodePath.parse(filePath).name;
  for (const pat of [
    /Pick\s*List\s*No[:\s-]*([A-Za-z0-9-]+)/i,
    /Picklist\s*No[:\s-]*([A-Za-z0-9-]+)/i,
    /\b(PK[0-9]{3,})\b/i,
  ]) {
    const m = metaText.match(pat);
    if (m) { pickListNo = cleanText(m[1]); break; }
  }

  const createdM = metaText.match(
    /Created[:\s-]*([0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4}(?:\s+[0-9]{1,2}:[0-9]{2})?)/i
  );
  const createdAt = createdM ? cleanText(createdM[1]) : null;

  const items = [];
  let blankStreak  = 0;
  let nextSerialNo = 1;

  for (let i = headerRowIndex; i < rawRows.length; i++) {
    const row    = rawRows[i];
    const skuCode  = firstPresent(row, headerMap, 'Sku Code', 'SKU');
    const name     = firstPresent(row, headerMap, 'Sku Name', 'Item Name', 'Product Name', 'Name');
    const shelfCode = firstPresent(row, headerMap, 'Shelf Code', 'Shelf', 'Bin Location');
    const size     = firstPresent(row, headerMap, 'Size');
    const color    = firstPresent(row, headerMap, 'Color', 'Colour');
    const qty      = Math.round(firstNumber(row, headerMap, 'Qty', 'Quantity', 'Pick Qty')) || 0;
    const serialTx = firstPresent(row, headerMap, 'SI.No', 'Sl.No', 'Serial No', 'S.No');

    if (!skuCode && !name && qty === 0) {
      if (++blankStreak >= 8 && items.length) break;
      continue;
    }
    blankStreak = 0;
    if (!skuCode) continue;

    const parsedSerial = parseFloat(serialTx);
    const serialNo = (!isNaN(parsedSerial) && isFinite(parsedSerial))
      ? Math.floor(parsedSerial)
      : nextSerialNo;

    items.push({ serialNo, skuCode, pickListName: name || skuCode, shelfCode, size, color, qty: Math.max(1, qty) });
    nextSerialNo = serialNo + 1;
  }

  return { pickListNo, pickListCreatedAt: createdAt, items };
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function parsePickList(filePath) {
  const ext = nodePath.extname(filePath).toLowerCase();
  if (ext === '.pdf')  return await parsePickListPdf(filePath);
  if (ext === '.xls')  throw new Error('Legacy .xls files are not supported. Save as .xlsx and upload again.');
  if (['.xlsx', '.xlsm', '.xltx', '.xltm'].includes(ext)) return parsePickListExcel(filePath);
  throw new Error('Unsupported pick list file type. Use PDF or Excel.');
}

module.exports = { parseItemMaster, parsePickList };
