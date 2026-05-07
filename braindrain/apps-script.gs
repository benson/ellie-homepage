// braindrain backend — paste this into the Apps Script editor attached
// to the braindrain Google Sheet, then deploy as a web app (or update the
// existing deployment). v3 adds the "category" column.

const SHEET_NAME = 'braindrain';
const HEADERS = ['timestamp', 'text', 'context', 'category'];

function doPost(e) {
  try {
    const sheet = getSheet();
    const data = JSON.parse(e.postData.contents);
    const text = String(data.text || '').trim();
    if (!text) return jsonResponse({ ok: false, error: 'empty' });
    const timestamp = data.timestamp || new Date().toISOString();
    const context = String(data.context || '').slice(0, 120);
    const category = String(data.category || '').slice(0, 30);
    sheet.appendRow([timestamp, text, context, category]);
    return jsonResponse({ ok: true, timestamp });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doGet() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return jsonResponse({ entries: [] });
  const values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  const entries = values
    .filter(r => r[0] !== '' || r[1] !== '')
    .map(r => ({
      timestamp: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
      text: String(r[1]),
      context: String(r[2] || ''),
      category: String(r[3] || ''),
    }));
  return jsonResponse({ entries });
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
