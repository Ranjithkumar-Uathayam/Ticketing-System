'use strict';

const XLSX = require('xlsx');
const pdfParse = require('pdf-parse');
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
  // Join ALL detail lines into one string.
  // CRITICAL: Unicommerce PDFs extract table columns WITHOUT spaces between them,
  // producing strings like "KANSAS 34-(TR15512)DEFAULT34TR155122" where
  // "DEFAULT" + size("34") + color("TR15512") + qty("2") are all concatenated.
  const combined = detailLines.map(cleanText).filter(Boolean).join(' ');

  let qty = 1, pickListName = '', shelfCode = '', size = '', color = '';

  // Find "DEFAULT" anywhere in the text. Do NOT use \bDEFAULT\b — that word
  // boundary fails when DEFAULT is immediately preceded/followed by alphanumeric
  // chars (the no-space PDF format).
  const defIdx = combined.search(/DEFAULT/i);

  if (defIdx !== -1) {
    // Everything before DEFAULT is the item name
    pickListName = cleanText(combined.slice(0, defIdx));
    shelfCode    = 'DEFAULT';

    // Everything after DEFAULT: "34TR155122" or "XL432042" or "M 22810 1" etc.
    const afterDef = combined.slice(defIdx + 7).trim(); // 7 = 'DEFAULT'.length

    // ── Qty extraction ─────────────────────────────────────────────────────────
    // In the no-space format the qty is the LAST digit(s) of afterDef:
    //   qty 1-99 with space-separated columns → rawNum is 1-2 digits → use whole rawNum
    //   qty 1-9  with no-space color-code blend → rawNum is 3+ digits (e.g. "155122")
    //                                            → last character is the qty digit
    //   qty 10+  ending in 0 (e.g. "10","20") → rawNum 3+ digits ending in 0 → last two
    let sizeColorStr = afterDef;

    const trailingDigits = afterDef.match(/(\d+)\s*$/);
    if (trailingDigits) {
      const rawNum  = trailingDigits[1];   // e.g. "18" from "WHITE 18", or "155122" from "TR155122"
      const lastOne = rawNum.slice(-1);    // "8"
      const lastTwo = rawNum.slice(-2);    // "18" when rawNum has ≥2 chars

      if (rawNum.length <= 2) {
        // Short sequence: the entire rawNum is the qty (handles 1–99 in normal spaced format)
        qty          = parseInt(rawNum, 10) || 1;
        sizeColorStr = afterDef.slice(0, afterDef.length - rawNum.length).trim();
      } else if (/[1-9]/.test(lastOne)) {
        // Long sequence: color-code digits blended with a 1-digit qty (no-space format)
        qty          = parseInt(lastOne, 10);
        sizeColorStr = afterDef.slice(0, afterDef.length - 1).trim();
      } else if (lastOne === '0' && parseInt(lastTwo, 10) > 0) {
        // Long sequence ending in 0: qty is "10", "20", etc.
        qty          = parseInt(lastTwo, 10);
        sizeColorStr = afterDef.slice(0, afterDef.length - 2).trim();
      }
      // else: trailing digit is "0" alone – keep qty=1 and leave sizeColorStr intact
    }

    // ── Size + Color extraction ────────────────────────────────────────────────
    // Size is at the very start of sizeColorStr, either:
    //   - Numeric 2-digit (trouser waist: 28-50)
    //   - Alpha clothing size (M, L, XL, XXL, XXXL, S, XS)
    const sizeRe = /^(\d{2}|XXXL|XXL|XL|L|M|S|XS)\s*/i;
    const sizeMatch = sizeColorStr.match(sizeRe);
    if (sizeMatch) {
      size         = sizeMatch[1].toUpperCase();
      color        = cleanText(sizeColorStr.slice(sizeMatch[0].length));
    } else {
      // Size not detected (might have spaces) — fall back to space-split
      const parts  = sizeColorStr.split(/\s+/).filter(Boolean);
      if (parts.length >= 1) size  = parts[0];
      if (parts.length >= 2) color = parts.slice(1).join(' ');
    }

  } else {
    // No DEFAULT found — use the whole combined text as name.
    // Try to pick up qty from a trailing space-separated number.
    const qtyMatch = combined.match(/\s+(\d+)\s*$/);
    if (qtyMatch) {
      qty          = parseInt(qtyMatch[1], 10) || 1;
      pickListName = cleanText(combined.slice(0, combined.length - qtyMatch[0].length));
    } else {
      pickListName = combined;
    }
  }

  return {
    serialNo,
    skuCode,
    pickListName : pickListName || skuCode,
    shelfCode,
    size,
    color,
    qty,
  };
}

// ─── Pick List PDF ────────────────────────────────────────────────────────────

async function parsePickListPdf(filePath) {
  const buf = fs.readFileSync(filePath);
  const data = await pdfParse(buf);
  const fullText = data.text || '';

  // ── DEBUG: log first 1500 chars so we can see exactly what pdf-parse extracts ─
  console.log('[PDF-PARSER] Raw text (first 1500 chars):\n', JSON.stringify(fullText.slice(0, 1500)));

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
  let pendingLines  = [];   // all lines collected for the current item (before classification)

  // A real SKU code: single alphanumeric token, ≥9 chars, has BOTH letters AND digits.
  // This distinguishes SKU codes (e.g. "CLNS34TR15512") from shelf codes ("DEFAULT"),
  // size values ("34", "XL"), color codes ("TR15512", ≤8 chars), and item names (have spaces).
  function looksLikeSku(s) {
    return /^[A-Za-z0-9]{9,}$/.test(s) && /[A-Za-z]/.test(s) && /[0-9]/.test(s);
  }

  function flushCurrent() {
    if (currentSerial === null || pendingLines.length === 0) {
      currentSerial = null; pendingLines = [];
      return;
    }

    // Classify collected lines: find the SKU (single alphanumeric ≥9 chars with letters+digits),
    // everything else is a detail line.
    // This handles Unicommerce PDFs where the barcode text (SKU) is extracted AFTER the
    // detail row because the barcode image pushes the SKU text lower on the page.
    let skuLine   = '';
    const details = [];

    for (const l of pendingLines) {
      if (!skuLine && looksLikeSku(l)) {
        skuLine = l;
      } else {
        details.push(l);
      }
    }

    // Fallback: if no line matched the SKU pattern, use the first line as the SKU
    if (!skuLine && pendingLines.length > 0) {
      skuLine = pendingLines[0];
      details.push(...pendingLines.slice(1));
    }

    items.push(parsePickItem(currentSerial, skuLine, details));
    currentSerial = null; pendingLines = [];
  }

  for (let i = startLine; i < rawLines.length; i++) {
    const line = cleanText(rawLines[i]);
    if (!line) continue;
    if (/powered\s+by/i.test(line)) continue;  // footer on every page — skip, don't break
    if (/\bpage\b/i.test(line)) continue;

    // Format 1 — isolated serial number: "1", "1.", "12."
    // Only accept the EXPECTED NEXT sequential number so that numeric sizes like
    // "34" or "42" are not misidentified as serial numbers.
    if (/^\d+[.)]?$/.test(line)) {
      const num = parseInt(line.replace(/\D/g, ''), 10);
      const expectedNext = currentSerial !== null ? currentSerial + 1 : 1;
      if (num === expectedNext) {
        flushCurrent();
        currentSerial = num;
        continue;
      }
      // Not the expected next serial — treat as a size/qty detail line
    }

    // Format 2 — serial + SKU merged on one line by pdf layout extraction
    // e.g. "1.PROD-SKU-001", "1. PROD-SKU-001", "1 PROD-SKU-001 detail text..."
    const inline = line.match(
      /^(\d{1,5})[.)\s]\s*([A-Za-z0-9][A-Za-z0-9_./-]{2,})(?:\s+(.+))?$/
    );
    if (inline && parseInt(inline[1], 10) > 0) {
      const inlineNum = parseInt(inline[1], 10);
      const expectedNextInline = currentSerial !== null ? currentSerial + 1 : 1;
      if (inlineNum !== expectedNextInline) {
        // Number in the line is not the expected next serial (e.g. "4010 TOWEL..." from an
        // item name starting with 4010). Treat the whole line as a detail line instead.
        if (currentSerial !== null) pendingLines.push(line);
        continue;
      }
      flushCurrent();
      currentSerial = inlineNum;
      // For Format 2 the SKU is explicit — push it first so classification picks it up
      pendingLines.push(cleanText(inline[2]));
      const rem = cleanText(inline[3] || '');
      if (rem) pendingLines.push(rem);
      continue;
    }

    if (currentSerial === null) continue;
    pendingLines.push(line);
  }

  flushCurrent();

  // ── DEBUG: log qty for every parsed item ──────────────────────────────────────
  console.log('[PDF-PARSER] Parsed items (serialNo → skuCode → qty):');
  items.forEach(it => console.log(`  #${it.serialNo}  ${it.skuCode}  qty=${it.qty}`));

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
