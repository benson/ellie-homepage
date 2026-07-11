/* making gallery — photo grid of making entries.
   reads body data-type (making), fetches entries, renders a grid.
   photos open in the shared slideshow (photobox.js). */

(function () {
  const type = document.body.dataset.type || 'making';
  const list = document.getElementById('archive-list');
  if (!list) return;

  // ---- rendering ----
  function renderEntry(entry) {
    const photos = entry.photoUrls || [];
    const dateStr = window.studioFormatDate(entry.date);
    const captionHtml = window.studioRenderCaption(entry.caption);
    const lbList = photos.map(u => ({ src: u, captionHtml: captionHtml }));

    const card = document.createElement('article');
    card.className = 'gal-entry' + (photos.length > 1 ? ' gal-multi' : '');

    if (photos.length) {
      const grid = document.createElement('div');
      grid.className = 'gal-photos' + (photos.length > 1 ? ' photo-pile' : '');
      photos.forEach((url, i) => {
        const img = document.createElement('img');
        img.className = 'gal-photo';
        img.src = url;
        img.alt = '';
        img.loading = 'lazy';
        img.addEventListener('click', () => window.openPhotoLightbox(lbList, 0)); // always start at 1/N
        grid.appendChild(img);
      });
      card.appendChild(grid);
    }

    if (dateStr) {
      const d = document.createElement('div');
      d.className = 'gal-date';
      d.textContent = dateStr;
      card.appendChild(d);
    }
    if (captionHtml) {
      const c = document.createElement('p');
      c.className = 'gal-caption';
      c.innerHTML = captionHtml;
      card.appendChild(c);
    }
    return card;
  }

  // exposed so the grid can be re-rendered (e.g. for previewing sample data)
  window.renderGallery = function (entries) {
    list.className = 'gal-grid';
    list.innerHTML = '';
    if (!entries || !entries.length) {
      list.innerHTML = '<p class="archive-empty">no entries yet.</p>';
      return;
    }
    entries.forEach(e => list.appendChild(renderEntry(e)));
  };

  (async function load() {
    if (!window.STUDIO_API_URL) {
      list.innerHTML = '<p class="archive-empty">not connected yet.</p>';
      return;
    }
    list.innerHTML = '<p class="archive-loading">loading…</p>';
    const entries = await window.studioFetchEntries(type, 500);
    window.renderGallery(orderForDisplay(entries));
  })();

  // the current piece (newest non-archive entry, same one the homepage
  // features) leads; everything else lands in a fresh random order each visit
  function orderForDisplay(entries) {
    if (!entries || entries.length < 2) return entries || [];
    const idx = entries.findIndex(e => !e.archiveOnly);
    const lead = idx === -1 ? null : entries[idx];
    const rest = entries.filter((e, i) => i !== idx);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = rest[i]; rest[i] = rest[j]; rest[j] = t;
    }
    return lead ? [lead].concat(rest) : rest;
  }
})();
