/* studio "listening" tab — the homepage listening shelf, picked by hand.
   replaces the old spotify feed (its login kept expiring). any audio link
   works: the backend reads the link's own title + cover (og: tags), and she
   can fix either, or upload her own cover when a site doesn't give one.

   needs the v4 backend (apps-script.gs). against an older backend the list
   still builds but publish is blocked with a clear message. */

(function () {
  const API = window.STUDIO_API_URL || '';
  const panel = document.getElementById('listen-panel');
  if (!panel) return;
  const addForm = document.getElementById('listen-add');
  const urlInput = document.getElementById('listen-url');
  const statusEl = document.getElementById('listen-status');
  const listEl = document.getElementById('listen-list');
  const publishBtn = document.getElementById('listen-publish');
  const publishStatus = document.getElementById('listen-publish-status');

  let items = [];          // { url, title, by, art, coverData? }
  let loaded = false;
  let backendOk = null;    // true once the backend answers ?type=listening
  let savedJson = '[]';    // what's live, to know when there are changes

  function setStatus(text) {
    statusEl.hidden = !text;
    statusEl.textContent = text || '';
  }

  function dirty() {
    return JSON.stringify(items.map(strip)) !== savedJson;
  }
  function strip(it) {
    return { url: it.url, title: it.title, by: it.by, art: it.art, cover: !!it.coverData };
  }
  function markSaved() { savedJson = JSON.stringify(items.map(strip)); }

  function refreshPublish() {
    publishBtn.disabled = !dirty();
    if (dirty()) {
      publishStatus.className = 'form-status';
      publishStatus.textContent = 'unpublished changes';
    } else if (publishStatus.textContent === 'unpublished changes') {
      publishStatus.textContent = '';
    }
  }

  // -- load what's live --------------------------------------------
  async function load() {
    loaded = true;
    if (!API) { setStatus('backend not connected yet.'); return; }
    setStatus('loading…');
    try {
      const res = await fetch(API + '?type=listening&t=' + Date.now(), { cache: 'no-store' });
      const data = await res.json();
      if (Array.isArray(data.items)) {
        backendOk = true;
        // show entries the way the homepage does (nts dates trimmed, the
        // source off the "by" line); saved as-is until she next publishes
        items = data.items.map(it => Object.assign({}, it, {
          title: window.studioListeningTitle ? window.studioListeningTitle(it) : it.title,
          by: window.studioListeningBy ? window.studioListeningBy(it) : it.by,
        }));
        markSaved();
        if (!items.length) await seedFromHomepage();
      } else {
        backendOk = false;
        await seedFromHomepage();
        markSaved();
      }
    } catch (e) {
      backendOk = false;
      await seedFromHomepage();
      markSaved();
    }
    setStatus(backendOk === false
      ? 'the backend update isn’t switched on yet, so you can line things up here but publish won’t work until it is.'
      : '');
    render();
  }

  // first run: start from whatever the homepage shows right now
  async function seedFromHomepage() {
    try {
      const html = await (await fetch('../index.html?t=' + Date.now(), { cache: 'no-store' })).text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const links = doc.querySelectorAll('#spotify-recent a.album-wrap');
      const seeded = [];
      for (const a of links) {
        const spans = a.querySelectorAll('.album-tip span');
        const it = {
          url: a.getAttribute('href') || '',
          title: (spans[0] && spans[0].textContent || '').toLowerCase(),
          by: (spans[1] && spans[1].textContent || '').toLowerCase(),
          art: '',
        };
        const src = (a.querySelector('img') || {}).getAttribute ? a.querySelector('img').getAttribute('src') : '';
        if (src && !/^data:/.test(src)) it.art = src;
        if (!it.art && /open\.spotify\.com/.test(it.url)) it.art = await spotifyArt(it.url);
        seeded.push(it);
      }
      if (seeded.length) items = seeded;
    } catch (e) {}
  }

  // spotify answers this one directly from the browser (no backend needed)
  async function spotifyArt(url) {
    try {
      const r = await fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent(url));
      const d = await r.json();
      return d.thumbnail_url || '';
    } catch (e) { return ''; }
  }

  // -- add a link ---------------------------------------------------
  async function preview(url) {
    if (backendOk) {
      const r = await fetch(API + '?type=preview&url=' + encodeURIComponent(url) + '&t=' + Date.now(), { cache: 'no-store' });
      const d = await r.json();
      if (!d.error) return d;
    }
    if (/open\.spotify\.com/.test(url)) {
      const r = await fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent(url));
      const d = await r.json();
      return { title: d.title || '', image: d.thumbnail_url || '', site: 'Spotify' };
    }
    return {};
  }

  // turn a page title into title + who, for the sites that pack both in
  function guessNames(p, url) {
    let title = (p.title || '').trim();
    let by = '';
    let m;
    if ((m = /^(.*?) - (?:Album|Single|EP|Song|Playlist|Compilation|Podcast|Episode) by (.+?) \| Spotify$/i.exec(title))) {
      title = m[1]; by = m[2];
    } else if ((m = /^(.*?) \| (?:Spotify|Podcast on Spotify)$/i.exec(title))) {
      title = m[1];
    } else if ((m = /^(.*), by (.+)$/.exec(title))) {          // bandcamp
      title = m[1]; by = m[2];
    } else if ((m = /^(.+?) by (.+?) on (?:Apple Music|SoundCloud)$/i.exec(title))) {
      title = m[1]; by = m[2];
    } else if ((m = /^(.+?) - (.+?) \| (?:Listen|Stream)/i.exec(title))) {
      title = m[1]; by = m[2];
    }
    // spotify playlists: "Playlist · Will Miller · 50 items"
    if (!by && (m = /^Playlist · (.+?) ·/.exec(p.description || ''))) by = m[1];
    // the source (spotify, nts…) is shown on its own label, never as "by";
    // studioListeningBy fills nts shows in from the link
    const it = { url, title, by };
    if (window.studioListeningBy) by = window.studioListeningBy(it);
    return { title: title.toLowerCase(), by: by.toLowerCase() };
  }
  addForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;
    const btn = addForm.querySelector('button');
    btn.disabled = true;
    setStatus('looking it up…');
    let p = {};
    try { p = await preview(url); } catch (e) {}
    const names = guessNames(p, url);
    const title = window.studioListeningTitle ? window.studioListeningTitle({ url, title: names.title }) : names.title;
    items.unshift({ url, title, by: names.by, art: p.image || '' });
    urlInput.value = '';
    btn.disabled = false;
    setStatus(p.image ? '' : 'couldn’t find a cover for that one. tap the empty square to add your own.');
    render();
  });

  // -- list ---------------------------------------------------------
  function render() {
    listEl.innerHTML = '';
    if (!items.length) {
      listEl.innerHTML = '<p class="listen-empty">nothing here yet. paste a link above.</p>';
    }
    items.forEach((it, i) => {
      const card = document.createElement('div');
      card.className = 'listen-card';

      const cover = document.createElement('label');
      cover.className = 'listen-cover';
      cover.title = 'change cover';
      const src = it.coverData || it.art;
      cover.innerHTML = src
        ? '<img alt="" src="' + src.replace(/"/g, '&quot;') + '"><span class="listen-cover-hint">change</span>'
        : '<span class="listen-cover-empty">+ cover</span>';
      const file = document.createElement('input');
      file.type = 'file';
      file.accept = 'image/*';
      file.hidden = true;
      file.addEventListener('change', async () => {
        if (!file.files[0]) return;
        it.coverData = await squareCover(file.files[0]);
        render();
      });
      cover.appendChild(file);

      const fields = document.createElement('div');
      fields.className = 'listen-fields';
      fields.appendChild(field('title', it.title, v => { it.title = v; }));
      fields.appendChild(field('by', it.by, v => { it.by = v; }, 'artist, host, show…'));
      const link = document.createElement('a');
      link.className = 'listen-link';
      link.href = it.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = it.url.replace(/^https?:\/\/(www\.)?/, '');
      fields.appendChild(link);
      const tag = window.studioListeningTag ? window.studioListeningTag(it) : '';
      if (tag) {
        const t = document.createElement('span');
        t.className = 'listen-tag';
        t.textContent = tag;
        t.title = 'worked out from the link';
        fields.appendChild(t);
      }

      const actions = document.createElement('div');
      actions.className = 'listen-actions';
      actions.appendChild(btn('←', 'move left', i === 0, () => move(i, -1)));
      actions.appendChild(btn('→', 'move right', i === items.length - 1, () => move(i, 1)));
      actions.appendChild(btn('×', 'remove', false, () => { items.splice(i, 1); render(); }, 'listen-remove'));

      card.appendChild(cover);
      card.appendChild(fields);
      card.appendChild(actions);
      listEl.appendChild(card);
    });
    refreshPublish();
  }

  function field(name, value, onInput, placeholder) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'listen-input listen-input-' + name;
    input.value = value || '';
    input.placeholder = placeholder || name;
    input.setAttribute('aria-label', name);
    input.addEventListener('input', () => { onInput(input.value); refreshPublish(); });
    return input;
  }
  function btn(text, label, disabled, onClick, cls) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'listen-btn' + (cls ? ' ' + cls : '');
    b.textContent = text;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    return b;
  }
  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const t = items[i]; items[i] = items[j]; items[j] = t;
    render();
  }

  // her own cover: center-cropped square, 600px jpeg (homepage shows ~60px)
  function squareCover(fileObj) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const s = Math.min(img.naturalWidth, img.naturalHeight);
          const out = Math.min(600, s);
          const c = document.createElement('canvas');
          c.width = c.height = out;
          c.getContext('2d').drawImage(img,
            (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, out, out);
          resolve(c.toDataURL('image/jpeg', 0.86));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(fileObj);
    });
  }

  // -- publish ------------------------------------------------------
  publishBtn.addEventListener('click', async () => {
    if (!backendOk) {
      publishStatus.className = 'form-status error';
      publishStatus.textContent = 'needs the backend update first (redeploy apps-script.gs).';
      return;
    }
    publishBtn.disabled = true;
    publishStatus.className = 'form-status';
    publishStatus.textContent = 'publishing…';
    try {
      const res = await fetch(API, {
        method: 'POST',
        body: JSON.stringify({ action: 'setListening', items }),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'unknown error');
      items = json.items;   // uploaded covers come back as their drive links
      markSaved();
      render();
      publishStatus.className = 'form-status success';
      publishStatus.textContent = 'published! it’s on your homepage now.';
    } catch (err) {
      publishStatus.className = 'form-status error';
      publishStatus.textContent = 'failed: ' + (err.message || err);
      publishBtn.disabled = false;
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (loaded && dirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  window.studioListeningShow = function () { if (!loaded) load(); };
  if (!panel.hidden) load();
})();
