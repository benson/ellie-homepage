/* making gallery — photo grid of making entries, with a lightbox.
   reads body data-type (making), fetches entries, renders a grid. */

(function () {
  const type = document.body.dataset.type || 'making';
  const list = document.getElementById('archive-list');
  if (!list) return;

  // ---- lightbox (built once, reused) ----
  const lb = document.createElement('div');
  lb.className = 'gal-lightbox';
  lb.hidden = true;
  lb.innerHTML =
    '<button type="button" class="gal-lb-close" aria-label="close">&times;</button>' +
    '<button type="button" class="gal-lb-nav gal-lb-prev" aria-label="previous">&#8249;</button>' +
    '<figure class="gal-lb-figure">' +
      '<img class="gal-lb-img" src="" alt="">' +
      '<figcaption class="gal-lb-caption"></figcaption>' +
    '</figure>' +
    '<button type="button" class="gal-lb-nav gal-lb-next" aria-label="next">&#8250;</button>';
  document.body.appendChild(lb);

  const lbImg = lb.querySelector('.gal-lb-img');
  const lbCap = lb.querySelector('.gal-lb-caption');
  let lbPhotos = [];
  let lbIndex = 0;

  function showLightbox(photos, captionHtml, startIndex) {
    lbPhotos = photos;
    lbIndex = startIndex || 0;
    lbCap.innerHTML = captionHtml || '';
    lbCap.hidden = !captionHtml;
    updateLightbox();
    lb.hidden = false;
    document.body.classList.add('gal-lb-open');
  }
  function updateLightbox() {
    lbImg.src = lbPhotos[lbIndex] || '';
    const multi = lbPhotos.length > 1;
    lb.querySelector('.gal-lb-prev').style.display = multi ? '' : 'none';
    lb.querySelector('.gal-lb-next').style.display = multi ? '' : 'none';
  }
  function closeLightbox() {
    lb.hidden = true;
    document.body.classList.remove('gal-lb-open');
    lbImg.src = '';
  }
  function step(delta) {
    if (!lbPhotos.length) return;
    lbIndex = (lbIndex + delta + lbPhotos.length) % lbPhotos.length;
    updateLightbox();
  }

  lb.querySelector('.gal-lb-close').addEventListener('click', closeLightbox);
  lb.querySelector('.gal-lb-prev').addEventListener('click', e => { e.stopPropagation(); step(-1); });
  lb.querySelector('.gal-lb-next').addEventListener('click', e => { e.stopPropagation(); step(1); });
  lb.addEventListener('click', e => { if (e.target === lb) closeLightbox(); });
  document.addEventListener('keydown', e => {
    if (lb.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  // ---- rendering ----
  function renderEntry(entry) {
    const photos = entry.photoUrls || [];
    const dateStr = window.studioFormatDate(entry.date);
    const captionHtml = window.studioRenderCaption(entry.caption);

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
        img.addEventListener('click', () => showLightbox(photos, captionHtml, i));
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
