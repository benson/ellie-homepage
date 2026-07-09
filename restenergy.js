/* Rest Energy photography page.
   reads manifest.json, renders each collection as a masonry grid,
   with a shared lightbox that steps through the collection you opened. */

(function () {
  const root = document.getElementById('re-collections');
  if (!root) return;

  // ---- lightbox (built once, reused) ----
  const lb = document.createElement('div');
  lb.className = 're-lightbox';
  lb.hidden = true;
  lb.innerHTML =
    '<button type="button" class="re-lb-close" aria-label="close">&times;</button>' +
    '<button type="button" class="re-lb-nav re-lb-prev" aria-label="previous">&#8249;</button>' +
    '<figure class="re-lb-figure">' +
      '<img class="re-lb-img" src="" alt="">' +
      '<figcaption class="re-lb-count"></figcaption>' +
    '</figure>' +
    '<button type="button" class="re-lb-nav re-lb-next" aria-label="next">&#8250;</button>';
  document.body.appendChild(lb);

  const lbImg = lb.querySelector('.re-lb-img');
  const lbCount = lb.querySelector('.re-lb-count');
  let lbPhotos = [];
  let lbIndex = 0;

  function openLightbox(photos, startIndex) {
    lbPhotos = photos;
    lbIndex = startIndex || 0;
    updateLightbox();
    lb.hidden = false;
    document.body.classList.add('re-lb-open');
  }
  function updateLightbox() {
    lbImg.src = lbPhotos[lbIndex] || '';
    const multi = lbPhotos.length > 1;
    lbCount.textContent = multi ? (lbIndex + 1) + ' / ' + lbPhotos.length : '';
    lb.querySelector('.re-lb-prev').style.display = multi ? '' : 'none';
    lb.querySelector('.re-lb-next').style.display = multi ? '' : 'none';
  }
  function closeLightbox() {
    lb.hidden = true;
    document.body.classList.remove('re-lb-open');
    lbImg.src = '';
  }
  function step(delta) {
    if (!lbPhotos.length) return;
    lbIndex = (lbIndex + delta + lbPhotos.length) % lbPhotos.length;
    updateLightbox();
  }

  lb.querySelector('.re-lb-close').addEventListener('click', closeLightbox);
  lb.querySelector('.re-lb-prev').addEventListener('click', e => { e.stopPropagation(); step(-1); });
  lb.querySelector('.re-lb-next').addEventListener('click', e => { e.stopPropagation(); step(1); });
  lb.addEventListener('click', e => { if (e.target === lb) closeLightbox(); });
  document.addEventListener('keydown', e => {
    if (lb.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  // ---- rendering ----
  function renderCollection(col) {
    const large = col.photos.map(p => 'img/' + col.slug + '/large/' + p + '.jpg');

    const section = document.createElement('section');
    section.className = 're-collection';

    const head = document.createElement('div');
    head.className = 're-col-head';
    const h = document.createElement('h2');
    h.className = 're-col-title';
    h.textContent = col.title;
    head.appendChild(h);
    if (col.prints) {
      const a = document.createElement('a');
      a.className = 're-prints';
      a.href = col.prints;
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML = 'order prints &#8599;';
      head.appendChild(a);
    }
    section.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 're-grid';
    col.photos.forEach((p, i) => {
      const img = document.createElement('img');
      img.className = 're-photo';
      img.src = 'img/' + col.slug + '/thumb/' + p + '.jpg';
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('click', () => openLightbox(large, i));
      grid.appendChild(img);
    });
    section.appendChild(grid);
    return section;
  }

  (async function load() {
    root.innerHTML = '<p class="re-loading">loading…</p>';
    try {
      const res = await fetch('manifest.json?v=' + Date.now());
      const data = await res.json();
      const cols = (data && data.collections) || [];
      root.innerHTML = '';
      if (!cols.length) {
        root.innerHTML = '<p class="re-empty">no photos yet.</p>';
        return;
      }
      cols.forEach(c => root.appendChild(renderCollection(c)));
    } catch (err) {
      root.innerHTML = '<p class="re-empty">couldn’t load the galleries.</p>';
    }
  })();
})();
