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
      grid.className = 'gal-photos' + (photos.length > 1 ? ' pol-stack' : '');
      photos.forEach((url, i) => {
        const pol = document.createElement('div');
        pol.className = 'polaroid';

        const ph = document.createElement('div');
        ph.className = 'pol-ph';
        const img = document.createElement('img');
        img.className = 'gal-photo';
        img.src = url;
        img.alt = '';
        img.loading = 'lazy';
        img.addEventListener('click', () => window.openPhotoLightbox(lbList, i));
        ph.appendChild(img);
        pol.appendChild(ph);

        const corner = document.createElement('div');
        corner.className = 'pol-corner';
        pol.appendChild(corner);

        grid.appendChild(pol);
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
    window.renderGallery(entries);
  })();
})();
