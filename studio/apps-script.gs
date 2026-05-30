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

const SHEET_ID  = 'REPLACE_WITH_YOUR_SHEET_ID';
const FOLDER_ID = 'REPLACE_WITH_YOUR_FOLDER_ID';

// ---------- READ: GET ?type=making|walking[&limit=N] ----------
function doGet(e) {
  try {
    const type = (e.parameter.type || 'making').toLowerCase();
    if (type !== 'making' && type !== 'walking') {
      return jsonOut({ error: 'invalid type' });
    }

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(type);
    if (!sheet || sheet.getLastRow() < 2) return jsonOut({ entries: [] });

    const limit = Math.min(parseInt(e.parameter.limit, 10) || 100, 500);
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
    const entries = rows
      .map(row => ({
        timestamp: row[0] instanceof Date ? row[0].toISOString() : String(row[0]),
        date:      String(row[1] || ''),
        caption:   String(row[2] || ''),
        link:      String(row[3] || ''),
        photoUrls: String(row[4] || '').split(',').filter(Boolean).map(id =>
          'https://lh3.googleusercontent.com/d/' + id + '=s1200'
        ),
      }))
      .reverse() // newest first
      .slice(0, limit);

    return jsonOut({ entries });
  } catch (err) {
    return jsonOut({ error: String(err) });
  }
}

// ---------- WRITE: POST JSON { type, date, caption, link, photos[] } ----------
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const type = (data.type || '').toLowerCase();
    if (type !== 'making' && type !== 'walking') {
      return jsonOut({ error: 'invalid type' });
    }

    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName(type);
    if (!sheet) {
      sheet = ss.insertSheet(type);
      sheet.appendRow(['timestamp', 'date', 'caption', 'link', 'photoIds']);
    }

    const folder = DriveApp.getFolderById(FOLDER_ID);
    const photoIds = [];

    if (Array.isArray(data.photos)) {
      for (let i = 0; i < data.photos.length; i++) {
        const photo = data.photos[i];
        const match = /^data:(image\/[^;]+);base64,(.+)$/.exec(photo);
        if (!match) continue;
        const mimeType = match[1];
        const bytes    = Utilities.base64Decode(match[2]);
        const ext      = (mimeType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        const fileName = type + '-' + Date.now() + '-' + i + '.' + ext;
        const blob     = Utilities.newBlob(bytes, mimeType, fileName);
        const file     = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        photoIds.push(file.getId());
      }
    }

    sheet.appendRow([
      new Date().toISOString(),
      data.date    || '',
      data.caption || '',
      data.link    || '',
      photoIds.join(','),
    ]);

    return jsonOut({ ok: true, photoCount: photoIds.length });
  } catch (err) {
    return jsonOut({ error: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
