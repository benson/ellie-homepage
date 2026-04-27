const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'index.html');

const GOODREADS_USER_ID = '';

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

async function getSpotifyToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('spotify: no access token');
  return data.access_token;
}

async function buildAlbumStrip(albums, containerId) {
  let html = `<div id="${containerId}">\n`;
  for (const a of albums) {
    const art = a.artUrl ? await fetchBase64(a.artUrl) : '';
    html += `      <a class="album-wrap" href="${esc(a.url)}" target="_blank">`;
    html += `<img class="album-icon" src="${art}" alt="${esc(a.album)}">`;
    html += `<div class="album-tip"><span class="tip-track">${esc(a.album)}</span><span>${esc(a.artist)}</span></div>`;
    html += `</a>\n`;
  }
  html += '    </div>';
  return html;
}

async function buildSpotify(token) {
  const res = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=50', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`spotify recent: ${res.status}`);
  const data = await res.json();

  const seen = new Set();
  const albums = [];
  for (const item of data.items) {
    const t = item.track;
    const albumId = t.album.id;
    if (seen.has(albumId)) continue;
    seen.add(albumId);
    albums.push({
      album: t.album.name,
      artist: t.artists.map(a => a.name).join(', '),
      artUrl: t.album.images.find(i => i.width <= 64)?.url
        || t.album.images[t.album.images.length - 1]?.url || '',
      url: t.album.external_urls.spotify,
    });
    if (albums.length >= 5) break;
  }

  console.log(`spotify recent: ${albums.length} albums inlined`);
  return buildAlbumStrip(albums, 'spotify-recent');
}

async function buildOnRepeat(token) {
  const res = await fetch('https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=20', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`spotify top: ${res.status}`);
  const data = await res.json();

  if (!data.items || !data.items.length) return null;

  const seen = new Set();
  const albums = [];
  for (const t of data.items) {
    const albumId = t.album.id;
    if (seen.has(albumId)) continue;
    seen.add(albumId);
    albums.push({
      album: t.album.name,
      artist: t.artists.map(a => a.name).join(', '),
      artUrl: t.album.images.find(i => i.width <= 64)?.url
        || t.album.images[t.album.images.length - 1]?.url || '',
      url: t.album.external_urls.spotify,
    });
    if (albums.length >= 5) break;
  }

  console.log(`spotify on repeat: ${albums.length} tracks inlined`);
  return buildAlbumStrip(albums, 'spotify-top');
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
  const url = `https://www.goodreads.com/review/list_rss/${GOODREADS_USER_ID}?shelf=${shelf}`;
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

  const token = await getSpotifyToken();
  if (token) {
    try {
      const recentHtml = await buildSpotify(token);
      if (recentHtml) {
        html = html.replace(
          /<!-- SPOTIFY_START -->[\s\S]*?<!-- SPOTIFY_END -->/,
          `<!-- SPOTIFY_START -->\n    ${recentHtml}\n    <!-- SPOTIFY_END -->`
        );
      }
    } catch (err) {
      console.error('spotify recent error:', err.message);
    }

    try {
      const onRepeatHtml = await buildOnRepeat(token);
      if (onRepeatHtml) {
        html = html.replace(
          /<!-- ONREPEAT_START -->[\s\S]*?<!-- ONREPEAT_END -->/,
          `<!-- ONREPEAT_START -->\n    ${onRepeatHtml}\n    <!-- ONREPEAT_END -->`
        );
      }
    } catch (err) {
      console.error('spotify on repeat error:', err.message);
    }
  } else {
    console.error('spotify credentials not set, skipping');
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
