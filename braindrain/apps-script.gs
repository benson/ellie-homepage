// braindrain backend — paste this into the Apps Script editor attached
// to the braindrain Google Sheet, then deploy as a web app (or update the
// existing deployment). v5 adds the "delete" action and exposes the sheet
// URL on GET so the archive can link to it.

const SHEET_NAME = 'braindrain';
const HEADERS = ['timestamp', 'text', 'context', 'category'];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'update') return updateEntry(data);
    if (data.action === 'delete') return deleteEntry(data);
    return createEntry(data);
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function createEntry(data) {
  const sheet = getSheet();
  const text = String(data.text || '').trim();
  if (!text) return jsonResponse({ ok: false, error: 'empty' });
  const timestamp = data.timestamp || new Date().toISOString();
  const context = String(data.context || '').slice(0, 120);
  const category = String(data.category || '').slice(0, 30);
  sheet.appendRow([timestamp, text, context, category]);
  return jsonResponse({ ok: true, timestamp });
}

function updateEntry(data) {
  const rowNum = findRowByTimestamp(data.timestamp);
  if (!rowNum) return jsonResponse({ ok: false, error: 'not found' });
  const text = String(data.text || '').trim();
  if (!text) return jsonResponse({ ok: false, error: 'empty' });
  const sheet = getSheet();
  sheet.getRange(rowNum, 2).setValue(text);
  sheet.getRange(rowNum, 3).setValue(String(data.context || '').slice(0, 120));
  sheet.getRange(rowNum, 4).setValue(String(data.category || '').slice(0, 30));
  return jsonResponse({ ok: true, updated: rowNum });
}

function deleteEntry(data) {
  const rowNum = findRowByTimestamp(data.timestamp);
  if (!rowNum) return jsonResponse({ ok: false, error: 'not found' });
  const sheet = getSheet();
  sheet.deleteRow(rowNum);
  return jsonResponse({ ok: true, deleted: rowNum });
}

function findRowByTimestamp(timestamp) {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const targetTs = String(timestamp || '');
  const stamps = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < stamps.length; i++) {
    const cell = stamps[i][0];
    const cellTs = cell instanceof Date ? cell.toISOString() : String(cell);
    if (cellTs === targetTs) return i + 2;
  }
  return null;
}

function doGet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetUrl = ss.getUrl();
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return jsonResponse({ entries: [], sheetUrl });
  const values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  const entries = values
    .filter(r => r[0] !== '' || r[1] !== '')
    .map(r => ({
      timestamp: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
      text: String(r[1]),
      context: String(r[2] || ''),
      category: String(r[3] || ''),
    }));
  return jsonResponse({ entries, sheetUrl });
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
  } else {
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
    } else {
      const headerRow = sheet.getRange(1, 1, 1, 4).getValues()[0];
      if (!headerRow[2]) sheet.getRange(1, 3).setValue('context');
      if (!headerRow[3]) sheet.getRange(1, 4).setValue('category');
    }
  }
  return sheet;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
