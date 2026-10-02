const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'index.html');

const GOODREADS_USER_ID = '145364144';

async function fetchBase64(url) {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const type = res.headers.get('content-type') || 'image/jpeg';
  return `data:${type};base64,${btoa(binary)}`;
}

const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// the listening shelf is picked by hand in the studio (studio/listening.js)
// and stored by the studio backend. bake it in so the page shows the right
// albums before the homepage's live fetch lands (the backend cold-starts slowly).
function studioApiUrl() {
  const cfg = fs.readFileSync(path.join(ROOT, 'studio-config.js'), 'utf8');
  const m = cfg.match(/STUDIO_API_URL\s*=\s*'([^']+)'/);
  return m ? m[1] : '';
}

// small covers get inlined; big ones (some sites only offer 1600px art) stay
// as plain links so index.html doesn't balloon
async function coverSrc(url) {
  if (!url) return '';
  // spotify serves several sizes off the same id; 300px is plenty here
  url = url.replace(/(i\.scdn\.co\/image\/ab67616d)0000b273/, '$100001e02');
  try {
    const data = await fetchBase64(url);
    return data.length < 60000 ? data : url;
  } catch (e) {
    return url;
  }
}

// reuse the homepage's own label logic ("album · spotify") so baked and live match
function loadListeningHelpers() {
  const vm = require('vm');
  const sandbox = { window: {}, URL };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'studio-render.js'), 'utf8'), sandbox);
  return {
    tag: sandbox.window.studioListeningTag || (() => ''),
    title: sandbox.window.studioListeningTitle || (it => it.title || ''),
    by: sandbox.window.studioListeningBy || (it => it.by || ''),
  };
}

async function buildListening() {
  const api = studioApiUrl();
  if (!api) return null;
  const res = await fetch(api + '?type=listening&t=' + Date.now());
  const data = await res.json();
  if (!Array.isArray(data.items) || !data.items.length) return null;

  const helpers = loadListeningHelpers();
  let html = '<div id="spotify-recent">\n';
  for (const it of data.items) {
    const art = await coverSrc(it.art);
    html += `      <a class="album-wrap" href="${esc(it.url || '')}" target="_blank" rel="noopener">`;
    html += `<img class="album-icon" src="${art}" alt="${esc(it.title || '')}">`;
    html += `<div class="album-tip"><span class="tip-track">${esc(helpers.title(it))}</span><span>${esc(helpers.by(it))}</span><span class="album-tag">${esc(helpers.tag(it))}</span></div>`;
    html += `</a>\n`;
  }
  html += '    </div>';
  console.log(`listening: ${data.items.length} items inlined`);
  return html;
}

function decodeCdata(str) {
  return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function extractField(itemXml, tag) {
  const m = itemXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? decodeCdata(m[1]) : '';
}

async function buildBookStrip(books, containerId) {
  let html = `<div id="${containerId}">\n`;
  for (const b of books) {
    const cover = b.coverUrl ? await fetchBase64(b.coverUrl) : '';
    html += `      <a class="book-wrap" href="${esc(b.url)}" target="_blank">`;
    html += `<img class="book-icon" src="${cover}" alt="${esc(b.title)}">`;
    html += `<div class="book-tip"><span class="tip-track">${esc(b.title)}</span><span>${esc(b.author)}</span></div>`;
    html += `</a>\n`;
  }
  html += '    </div>';
  return html;
}

async function buildGoodreadsShelf(shelf, containerId) {
  if (!GOODREADS_USER_ID) return null;
  const sortParam = shelf === 'read' ? '&sort=date_read&order=d' : '';
  const url = `https://www.goodreads.com/review/list_rss/${GOODREADS_USER_ID}?shelf=${shelf}${sortParam}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`goodreads ${shelf}: ${res.status}`);
  const xml = await res.text();

  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  const books = [];
  for (const item of items.slice(0, 5)) {
    books.push({
      title: extractField(item, 'title'),
      author: extractField(item, 'author_name'),
      coverUrl: extractField(item, 'book_medium_image_url')
        || extractField(item, 'book_image_url')
        || extractField(item, 'book_large_image_url'),
      url: extractField(item, 'link'),
    });
  }

  console.log(`goodreads ${shelf}: ${books.length} books inlined`);
  return buildBookStrip(books, containerId);
}

async function main() {
  let html = fs.readFileSync(HTML_PATH, 'utf8');

  try {
    const listeningHtml = await buildListening();
    if (listeningHtml) {
      html = html.replace(
        /<!-- SPOTIFY_START -->[\s\S]*?<!-- SPOTIFY_END -->/,
        `<!-- SPOTIFY_START -->\n    ${listeningHtml}\n    <!-- SPOTIFY_END -->`
      );
    }
  } catch (err) {
    console.error('listening error:', err.message);
  }

  try {
    const readingHtml = await buildGoodreadsShelf('currently-reading', 'goodreads-reading');
    if (readingHtml) {
      html = html.replace(
        /<!-- READING_START -->[\s\S]*?<!-- READING_END -->/,
        `<!-- READING_START -->\n    ${readingHtml}\n    <!-- READING_END -->`
      );
    }
  } catch (err) {
    console.error('goodreads currently-reading error:', err.message);
  }

  try {
    const readHtml = await buildGoodreadsShelf('read', 'goodreads-read');
    if (readHtml) {
      html = html.replace(
        /<!-- READ_START -->[\s\S]*?<!-- READ_END -->/,
        `<!-- READ_START -->\n    ${readHtml}\n    <!-- READ_END -->`
      );
    }
  } catch (err) {
    console.error('goodreads read error:', err.message);
  }

  fs.writeFileSync(HTML_PATH, html);
  console.log('wrote index.html');
}

main();
