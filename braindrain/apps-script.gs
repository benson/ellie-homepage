// braindrain backend — paste this into the Apps Script editor attached
// to the braindrain Google Sheet, then deploy as a web app (or update the
// existing deployment). v7 adds a Merriam-Webster lookup proxy so MW API
// keys can live in Script Properties instead of being exposed in the
// public site JS. Set two Script Properties before deploying:
//   MW_COLLEGIATE_KEY = <key from dictionaryapi.com>
//   MW_LEARNERS_KEY   = <key from dictionaryapi.com>

const SHEET_NAME = 'braindrain';
const HEADERS = ['timestamp', 'text', 'context', 'category'];
const LEXICON_SHEET_NAME = 'lexicon';
const LEXICON_HEADERS = ['timestamp', 'word', 'definition'];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.type === 'lexicon') {
      if (data.action === 'delete') return deleteLexiconEntry(data);
      if (data.action === 'update') return updateLexiconEntry(data);
      return createLexiconEntry(data);
    }
    if (data.action === 'update') return updateEntry(data);
    if (data.action === 'delete') return deleteEntry(data);
    return createEntry(data);
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function updateLexiconEntry(data) {
  const sheet = getLexiconSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return jsonResponse({ ok: false, error: 'empty' });
  const targetTs = String(data.timestamp || '');
  const stamps = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < stamps.length; i++) {
    const cell = stamps[i][0];
    const cellTs = cell instanceof Date ? cell.toISOString() : String(cell);
    if (cellTs === targetTs) {
      const row = i + 2;
      const word = String(data.word || '').trim().toLowerCase();
      const definition = String(data.definition || '');
      if (word) sheet.getRange(row, 2).setValue(word);
      sheet.getRange(row, 3).setValue(definition);
      // Re-sort since the word may have changed.
      const lastR = sheet.getLastRow();
      if (lastR > 2) {
        sheet.getRange(2, 1, lastR - 1, sheet.getLastColumn())
          .sort({ column: 2, ascending: true });
      }
      return jsonResponse({ ok: true, updated: row });
    }
  }
  return jsonResponse({ ok: false, error: 'not found' });
}

function deleteLexiconEntry(data) {
  const sheet = getLexiconSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return jsonResponse({ ok: false, error: 'empty' });
  const targetTs = String(data.timestamp || '');
  const stamps = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < stamps.length; i++) {
    const cell = stamps[i][0];
    const cellTs = cell instanceof Date ? cell.toISOString() : String(cell);
    if (cellTs === targetTs) {
      sheet.deleteRow(i + 2);
      return jsonResponse({ ok: true, deleted: i + 2 });
    }
  }
  return jsonResponse({ ok: false, error: 'not found' });
}

function createLexiconEntry(data) {
  const sheet = getLexiconSheet();
  const word = String(data.word || '').trim().toLowerCase();
  if (!word) return jsonResponse({ ok: false, error: 'empty word' });
  const timestamp = data.timestamp || new Date().toISOString();
  const definition = String(data.definition || '');
  sheet.appendRow([timestamp, word, definition]);
  // Keep the sheet sorted alphabetically by word.
  const lastRow = sheet.getLastRow();
  if (lastRow > 2) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn())
      .sort({ column: 2, ascending: true });
  }
  return jsonResponse({ ok: true, timestamp });
}

function getLexiconSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(LEXICON_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(LEXICON_SHEET_NAME);
    sheet.appendRow(LEXICON_HEADERS);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(LEXICON_HEADERS);
  }
  return sheet;
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

function doGet(e) {
  if (e && e.parameter && e.parameter.type === 'lookup') {
    return mwLookup(e.parameter.word, e.parameter.dict);
  }
  if (e && e.parameter && e.parameter.type === 'lexicon') {
    return getLexicon();
  }
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

function getLexicon() {
  const sheet = getLexiconSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return jsonResponse({ entries: [] });
  const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  const entries = values
    .filter(r => r[1] !== '')
    .map(r => ({
      timestamp: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
      word: String(r[1]),
      definition: String(r[2] || ''),
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

// Proxy a Merriam-Webster lookup so API keys stay server-side. Returns
// definitions normalized to the same shape the client already understands:
// [{ meanings: [{ partOfSpeech, definitions: [{ definition }] }] }].
// Results are cached for 24h to stay under the free 1000/day quota.
function mwLookup(word, dict) {
  const w = String(word || '').trim().toLowerCase();
  const d = dict === 'learners' ? 'learners' : 'collegiate';
  if (!w) return jsonResponse({ entries: [] });
  const keyName = d === 'learners' ? 'MW_LEARNERS_KEY' : 'MW_COLLEGIATE_KEY';
  const apiKey = PropertiesService.getScriptProperties().getProperty(keyName);
  if (!apiKey) return jsonResponse({ entries: [], error: 'no key configured' });
  const cache = CacheService.getScriptCache();
  const cacheKey = `mw:${d}:${w}`;
  const cached = cache.get(cacheKey);
  if (cached) return jsonResponse(JSON.parse(cached));
  const url = `https://www.dictionaryapi.com/api/v3/references/${d}/json/${encodeURIComponent(w)}?key=${apiKey}`;
  let payload = { entries: [] };
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const code = res.getResponseCode();
    if (code === 200) {
      const data = JSON.parse(res.getContentText());
      if (Array.isArray(data) && data.length && typeof data[0] === 'object') {
        const meanings = [];
        for (const entry of data) {
          const pos = entry.fl || '';
          const defs = (entry.shortdef || []).map(s => ({ definition: s }));
          if (defs.length) meanings.push({ partOfSpeech: pos, definitions: defs });
        }
        if (meanings.length) payload = { entries: [{ meanings }] };
      }
    }
  } catch (err) {
    return jsonResponse({ entries: [], error: String(err) });
  }
  // Cache both hits and misses for 24h to spare the daily quota.
  cache.put(cacheKey, JSON.stringify(payload), 86400);
  return jsonResponse(payload);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
