// ellie's studio uploader — handles making/walking entries.
//
// SETUP (one-time, done in your Google account):
//   1. Create a new Google Sheet, name it "ellie-studio" or whatever.
//        Tabs: leave default for now — the script auto-creates "making"/"walking".
//   2. Create a new Drive folder for photos, name it "ellie-studio-photos".
//   3. Open the Sheet → Extensions → Apps Script.
//   4. Paste this entire file into Code.gs (replace the default).
//   5. Replace SHEET_ID and FOLDER_ID below with your actual IDs:
//        - Sheet ID = the long string in the Sheet URL between /d/ and /edit
//        - Folder ID = the long string in the Drive folder URL after /folders/
//   6. Save (disk icon).
//   7. Deploy → New deployment:
//        - Type: Web app
//        - Execute as: Me
//        - Who has access: Anyone
//      Click Deploy, copy the /exec URL.
//   8. Paste that URL into studio.js (STUDIO_API_URL constant) and into
//      build-page.js / homepage script as needed (claude will handle that).
//
// To redeploy after edits:
//   Deploy → Manage deployments → pencil icon → New version → Deploy.
//
// v2 (2026-07) adds EDIT + DELETE. doPost now dispatches on data.action:
//   'update' → editEntry, 'delete' → deleteEntry, anything else → createEntry.
//   doGet responses now include apiVersion so the client can tell whether
//   this newer backend is live before it offers editing.
// v3 (2026-07) adds archiveOnly — a "straight to archive" flag (new last
//   column) so backfilled past entries don't take over the homepage.
//   AFTER PASTING THIS YOU MUST REDEPLOY (step above) or new features stay dark.
// v4 (2026-10) adds LISTENING — the homepage "listening" shelf, picked by hand
//   in the studio (replaces the old spotify feed). The whole list lives in one
//   Script Property as JSON: GET ?type=listening, POST {action:'setListening'}.
//   GET ?type=preview&url=... reads a link's title/cover (og: tags) so the
//   studio can fill them in for any audio link (spotify, bandcamp, nts, ...).

const SHEET_ID  = 'REPLACE_WITH_YOUR_SHEET_ID';
const FOLDER_ID = 'REPLACE_WITH_YOUR_FOLDER_ID';
const API_VERSION = 4;

// column layout per type (order matters — must match the header row;
// archiveOnly is appended last so older rows/sheets stay compatible)
const COLUMNS = {
  making:  ['timestamp', 'date', 'caption', 'link', 'photoIds', 'archiveOnly'],
  walking: ['timestamp', 'date', 'caption', 'link', 'photoIds', 'state', 'archiveOnly'],
};

// ---------- READ: GET ?type=making|walking[&limit=N] ----------
function doGet(e) {
  try {
    const type = (e.parameter.type || 'making').toLowerCase();
    // rest energy photo arrangement (order + removals) lives in Script Properties
    if (type === 'restenergy') {
      const raw = PropertiesService.getScriptProperties().getProperty('RESTENERGY_ARRANGEMENT');
      let arrangement = {};
      if (raw) { try { arrangement = JSON.parse(raw); } catch (e2) { arrangement = {}; } }
      return jsonOut({ arrangement: arrangement, apiVersion: API_VERSION });
    }
    if (type === 'listening') {
      const raw = PropertiesService.getScriptProperties().getProperty('LISTENING_ITEMS');
      let items = [];
      if (raw) { try { items = JSON.parse(raw); } catch (e2) { items = []; } }
      return jsonOut({ items: items, apiVersion: API_VERSION });
    }
    if (type === 'preview') return jsonOut(Object.assign(linkPreview(e.parameter.url), { apiVersion: API_VERSION }));
    if (!COLUMNS[type]) return jsonOut({ error: 'invalid type', apiVersion: API_VERSION });

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(type);
    if (!sheet || sheet.getLastRow() < 2) return jsonOut({ entries: [], apiVersion: API_VERSION });

    const cols = COLUMNS[type];
    const limit = Math.min(parseInt(e.parameter.limit, 10) || 100, 500);
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, cols.length).getValues();
    const entries = rows
      .map(row => {
        const rec = {};
        cols.forEach((name, i) => {
          const val = row[i];
          rec[name] = val instanceof Date ? val.toISOString() : String(val || '');
        });
        const ids = String(rec.photoIds || '').split(',').filter(Boolean);
        rec.photoUrls = ids.map(id => 'https://lh3.googleusercontent.com/d/' + id + '=s1200');
        delete rec.photoIds;
        return rec;
      })
      .reverse() // newest first
      .slice(0, limit);

    return jsonOut({ entries, apiVersion: API_VERSION });
  } catch (err) {
    return jsonOut({ error: String(err), apiVersion: API_VERSION });
  }
}

// ---------- WRITE: POST JSON ----------
// create: { type, date, caption, link, state, photos[] }
// update: { action:'update', type, timestamp, date, caption, link, state,
//           keepPhotoIds[], photos[] }   (photos[] = NEW photos to add)
// delete: { action:'delete', type, timestamp }
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = (data.action || 'create').toLowerCase();
    if (action === 'setarrangement') return setArrangement(data);
    if (action === 'setlistening') return setListening(data);
    if (action === 'update') return editEntry(data);
    if (action === 'delete') return deleteEntry(data);
    return createEntry(data);
  } catch (err) {
    return jsonOut({ error: String(err) });
  }
}

// store the rest energy photo arrangement: { arrangement: { slug: {order:[],remove:[]} } }
function setArrangement(data) {
  const arr = data.arrangement;
  if (!arr || typeof arr !== 'object') return jsonOut({ error: 'no arrangement' });
  PropertiesService.getScriptProperties()
    .setProperty('RESTENERGY_ARRANGEMENT', JSON.stringify(arr));
  return jsonOut({ ok: true });
}

// store the listening shelf: { items: [{ url, title, by, art, coverData? }] }
// coverData (a data: URL) = a cover she uploaded herself; it goes to Drive and
// becomes the item's art. Covers she later removes are NOT trashed (cheap, and
// keeps an accidental publish recoverable).
function setListening(data) {
  const items = data.items;
  if (!Array.isArray(items)) return jsonOut({ error: 'no items' });
  const clean = items.map(function (it) {
    let art = String(it.art || '');
    if (it.coverData) {
      const ids = uploadPhotos('listening', [it.coverData]);
      if (ids.length) art = 'https://lh3.googleusercontent.com/d/' + ids[0] + '=s600';
    }
    return {
      url: String(it.url || ''),
      title: String(it.title || ''),
      by: String(it.by || ''),
      art: art,
    };
  });
  PropertiesService.getScriptProperties()
    .setProperty('LISTENING_ITEMS', JSON.stringify(clean));
  return jsonOut({ ok: true, items: clean });
}

// read a page's og: tags so any audio link can fill in its own title + cover
function linkPreview(url) {
  if (!/^https?:\/\//i.test(String(url || ''))) return { error: 'bad url' };
  try {
    const res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15' },
    });
    if (res.getResponseCode() >= 400) return { error: 'http ' + res.getResponseCode() };
    const html = res.getContentText().slice(0, 300000);
    function meta(name) {
      const re1 = new RegExp('<meta[^>]+(?:property|name)=["\']' + name + '["\'][^>]*content=["\']([^"\']*)', 'i');
      const re2 = new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + name + '["\']', 'i');
      const m = re1.exec(html) || re2.exec(html);
      return m ? decodeEntities(m[1]) : '';
    }
    let title = meta('og:title') || meta('twitter:title');
    if (!title) { const t = /<title[^>]*>([^<]*)/i.exec(html); title = t ? decodeEntities(t[1]) : ''; }
    return {
      title: title.trim(),
      image: meta('og:image') || meta('twitter:image'),
      description: meta('og:description'),
      site: meta('og:site_name'),
      musician: meta('music:musician_description'),
    };
  } catch (err) {
    return { error: String(err) };
  }
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); });
}

function createEntry(data) {
  const type = (data.type || '').toLowerCase();
  if (!COLUMNS[type]) return jsonOut({ error: 'invalid type' });
  const cols = COLUMNS[type];
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(type);
  if (!sheet) {
    sheet = ss.insertSheet(type);
    sheet.appendRow(cols);
  }

  const photoIds = uploadPhotos(type, data.photos);

  const values = {
    timestamp: new Date().toISOString(),
    date:      data.date    || '',
    caption:   data.caption || '',
    link:      data.link    || '',
    photoIds:  photoIds.join(','),
    state:     (data.state  || '').toUpperCase(),
    archiveOnly: data.archiveOnly ? 'yes' : '',
  };
  sheet.appendRow(cols.map(name => values[name] || ''));

  return jsonOut({ ok: true, photoCount: photoIds.length });
}

function editEntry(data) {
  const type = (data.type || '').toLowerCase();
  if (!COLUMNS[type]) return jsonOut({ error: 'invalid type' });
  const cols = COLUMNS[type];
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(type);
  if (!sheet) return jsonOut({ error: 'not found' });

  const rowNum = findRow(sheet, data.timestamp);
  if (!rowNum) return jsonOut({ error: 'not found' });

  // existing photo IDs on this row
  const idCol = cols.indexOf('photoIds') + 1;
  const existingIds = String(sheet.getRange(rowNum, idCol).getValue() || '')
    .split(',').filter(Boolean);

  // which existing photos to keep (client sends the survivors)
  const keep = Array.isArray(data.keepPhotoIds)
    ? data.keepPhotoIds.filter(id => existingIds.indexOf(id) !== -1)
    : existingIds.slice();

  // trash the removed ones (best-effort)
  existingIds.filter(id => keep.indexOf(id) === -1).forEach(trashFile);

  // add any new photos
  const newIds = uploadPhotos(type, data.photos);
  const finalIds = keep.concat(newIds);

  // write updated cells (leave timestamp as the stable key)
  const write = (name, value) => {
    const c = cols.indexOf(name);
    if (c !== -1) sheet.getRange(rowNum, c + 1).setValue(value);
  };
  write('date', data.date || '');
  write('caption', data.caption || '');
  write('link', data.link || '');
  write('state', (data.state || '').toUpperCase());
  write('archiveOnly', data.archiveOnly ? 'yes' : '');
  write('photoIds', finalIds.join(','));

  return jsonOut({ ok: true, updated: rowNum, photoCount: finalIds.length });
}

function deleteEntry(data) {
  const type = (data.type || '').toLowerCase();
  if (!COLUMNS[type]) return jsonOut({ error: 'invalid type' });
  const cols = COLUMNS[type];
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(type);
  if (!sheet) return jsonOut({ error: 'not found' });

  const rowNum = findRow(sheet, data.timestamp);
  if (!rowNum) return jsonOut({ error: 'not found' });

  const idCol = cols.indexOf('photoIds') + 1;
  String(sheet.getRange(rowNum, idCol).getValue() || '')
    .split(',').filter(Boolean).forEach(trashFile);

  sheet.deleteRow(rowNum);
  return jsonOut({ ok: true, deleted: rowNum });
}

// ---------- helpers ----------
function uploadPhotos(type, photos) {
  const ids = [];
  if (!Array.isArray(photos)) return ids;
  const folder = DriveApp.getFolderById(FOLDER_ID);
  for (let i = 0; i < photos.length; i++) {
    const match = /^data:(image\/[^;]+);base64,(.+)$/.exec(photos[i]);
    if (!match) continue;
    const mimeType = match[1];
    const bytes    = Utilities.base64Decode(match[2]);
    const ext      = (mimeType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const fileName = type + '-' + Date.now() + '-' + i + '.' + ext;
    const blob     = Utilities.newBlob(bytes, mimeType, fileName);
    const file     = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    ids.push(file.getId());
  }
  return ids;
}

function trashFile(id) {
  try { DriveApp.getFileById(id).setTrashed(true); } catch (err) {}
}

function findRow(sheet, timestamp) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const targetTs = String(timestamp || '');
  if (!targetTs) return null;
  const stamps = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < stamps.length; i++) {
    const cell = stamps[i][0];
    const cellTs = cell instanceof Date ? cell.toISOString() : String(cell);
    if (cellTs === targetTs) return i + 2;
  }
  return null;
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
