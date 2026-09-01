/* Rest Energy photography page.
   reads manifest.json and shows a text list of collections; clicking a
   collection name drops down its photos (accordion). clicking a photo opens
   a full-screen slideshow/lightbox that can show a per-photo title + caption.

   manifest photo entries may be either:
     "filename"                                        (no title/caption)
     { "file": "filename", "title": "...", "caption": "..." } */

(function () {
  const root = document.getElementById('re-collections');
  if (!root) return;

  let manifest = null;
  let ratios = {};   // "slug/file" -> width/height, for instant justified layout

  // ---- lightbox (built once, reused) ----
  const lb = document.createElement('div');
  lb.className = 're-lightbox';
  lb.hidden = true;
  lb.innerHTML =
    '<button type="button" class="re-lb-close" aria-label="close">&times;</button>' +
    '<button type="button" class="re-lb-nav re-lb-prev" aria-label="previous">&#8249;</button>' +
    '<figure class="re-lb-figure">' +
      '<img class="re-lb-img" src="" alt="">' +
      '<figcaption class="re-lb-cap">' +
        '<span class="re-lb-title"></span>' +
        '<span class="re-lb-caption"></span>' +
        '<span class="re-lb-count"></span>' +
      '</figcaption>' +
    '</figure>' +
    '<button type="button" class="re-lb-nav re-lb-next" aria-label="next">&#8250;</button>';
  document.body.appendChild(lb);

  const lbImg = lb.querySelector('.re-lb-img');
  const lbTitle = lb.querySelector('.re-lb-title');
  const lbCaption = lb.querySelector('.re-lb-caption');
  const lbCount = lb.querySelector('.re-lb-count');
  let lbPhotos = [];
  let lbIndex = 0;
  // zoom + expand controls (photozoom.js); absent = slideshow still works as before
  const zoom = window.attachPhotoZoom ? window.attachPhotoZoom({ lb: lb, img: lbImg }) : null;

  function openLightbox(photos, startIndex) {
    lbPhotos = photos;
    lbIndex = startIndex || 0;
    updateLightbox();
    lb.hidden = false;
    document.body.classList.add('re-lb-open');
  }
  function updateLightbox() {
    const p = lbPhotos[lbIndex] || {};
    if (zoom) zoom.reset();          // a new photo always starts at 100%
    lbImg.src = p.src || '';
    lbTitle.textContent = p.title || '';
    lbTitle.hidden = !p.title;
    lbCaption.textContent = p.caption || '';
    lbCaption.hidden = !p.caption;
    const multi = lbPhotos.length > 1;
    lbCount.textContent = multi ? (lbIndex + 1) + ' / ' + lbPhotos.length : '';
    lb.querySelector('.re-lb-prev').style.display = multi ? '' : 'none';
    lb.querySelector('.re-lb-next').style.display = multi ? '' : 'none';
  }
  function closeLightbox() {
    if (zoom) { zoom.collapse(); zoom.reset(); }
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
    if (e.key === 'Escape') { if (zoom && zoom.isExpanded()) zoom.collapse(); else closeLightbox(); }
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  // ---- helpers ----
  function normPhoto(col, entry) {
    const o = (typeof entry === 'string') ? { file: entry } : (entry || {});
    // `src` lets a photo sit in a collection other than the folder it lives in
    // (that's how the re-sorted collections work — no files get moved on disk)
    const src = o.src || col.slug;
    return {
      file: o.file,
      src: src,
      title: o.title || '',
      caption: o.caption || '',
      thumb: 'img/' + src + '/thumb/' + o.file + '.jpg',
      large: 'img/' + src + '/large/' + o.file + '.jpg'
    };
  }

  // ---- render the accordion ----
  function render() {
    root.innerHTML = '';
    manifest.collections.forEach(col => {
      const photos = col.photos.map(p => normPhoto(col, p));
      const lbList = photos.map(p => ({ src: p.large, title: p.title, caption: p.caption }));

      const section = document.createElement('section');
      section.className = 're-acc';

      const head = document.createElement('button');
      head.type = 'button';
      head.className = 're-acc-head';
      head.setAttribute('aria-expanded', 'false');
      head.innerHTML =
        '<span class="re-acc-title">' + col.title + '</span>' +
        '<span class="re-acc-meta">' +
          '<span class="re-acc-count">' + photos.length + '</span>' +
          '<span class="re-acc-icon" aria-hidden="true"></span>' +
        '</span>';

      const panel = document.createElement('div');
      panel.className = 're-acc-panel';
      const inner = document.createElement('div');
      inner.className = 're-acc-inner';

      const grid = document.createElement('div');
      grid.className = 're-grid';
      photos.forEach((p, i) => {
        const img = document.createElement('img');
        img.className = 're-photo';
        img.src = p.thumb;
        img.alt = p.title || '';
        img.loading = 'lazy';
        img.dataset.ratio = ratios[p.src + '/' + p.file] || '';
        img.addEventListener('click', () => openLightbox(lbList, i));
        img.addEventListener('load', () => { if (!img.dataset.ratio) justifyGrid(grid); });
        grid.appendChild(img);
      });
      inner.appendChild(grid);

      // prints link — bottom-left, under the photos
      if (col.prints) {
        const tools = document.createElement('div');
        tools.className = 're-acc-tools';
        const a = document.createElement('a');
        a.className = 're-prints';
        a.href = col.prints;
        a.target = '_blank';
        a.rel = 'noopener';
        a.innerHTML = 'prints &#8599;';
        tools.appendChild(a);
        inner.appendChild(tools);
      }
      panel.appendChild(inner);

      head.addEventListener('click', () => {
        const open = section.classList.toggle('open');
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) requestAnimationFrame(() => justifyGrid(grid));
      });

      // preview strip — a right-aligned taste of the collection, shown while
      // it's closed (hidden via CSS once open); clicking it opens the panel
      const strip = document.createElement('div');
      strip.className = 're-strip';
      photos.slice(0, 6).forEach(p => {
        const im = document.createElement('img');
        im.src = p.thumb;
        im.alt = '';
        im.loading = 'lazy';
        const r = parseFloat(ratios[p.src + '/' + p.file]);
        if (r) im.style.aspectRatio = r; // sizes correctly at any strip height, avoids reflow
        strip.appendChild(im);
      });
      strip.addEventListener('click', () => head.click());

      section.appendChild(head);
      section.appendChild(strip);
      section.appendChild(panel);
      root.appendChild(section);
    });
    requestAnimationFrame(justifyAll);
  }

  // ---- justified rows: equal-height rows, flush left+right, no cropping ----
  function targetRowHeight(W) {
    if (W <= 480) return 240;
    if (W <= 820) return 340;
    return 440;
  }
  function ratioOf(img) {
    const r = parseFloat(img.dataset.ratio);
    if (r) return r;
    if (img.naturalWidth && img.naturalHeight) return img.naturalWidth / img.naturalHeight;
    return 1.4;
  }
  function justifyGrid(grid) {
    const imgs = Array.prototype.slice.call(grid.querySelectorAll('.re-photo'));
    if (!imgs.length) return;
    const W = grid.clientWidth;
    if (!W) return;
    const gap = parseFloat(getComputedStyle(grid).gap) || 6;
    const targetH = targetRowHeight(W);
    let row = [], sumA = 0;
    const rows = [];
    imgs.forEach(im => {
      const a = ratioOf(im);
      im._ar = a;
      row.push(im);
      sumA += a;
      if (sumA * targetH + gap * (row.length - 1) >= W) { rows.push({ r: row, sumA: sumA }); row = []; sumA = 0; }
    });
    if (row.length) rows.push({ r: row, sumA: sumA });
    rows.forEach((o, idx) => {
      const gaps = gap * (o.r.length - 1);
      const last = idx === rows.length - 1;
      let h = last ? Math.min(targetH, (W - gaps) / o.sumA) : (W - gaps) / o.sumA;
      o.r.forEach(im => {
        im.style.width = Math.floor(im._ar * h) + 'px';
        im.style.height = Math.round(h) + 'px';
      });
    });
  }
  function justifyAll() {
    Array.prototype.slice.call(root.querySelectorAll('.re-grid')).forEach(justifyGrid);
  }
  // reflow on resize, but only when the width actually changed (ignore mobile
  // toolbar show/hide height jitter), debounced so it never thrashes
  let lastW = window.innerWidth, rzT;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    clearTimeout(rzT);
    rzT = setTimeout(justifyAll, 120);
  });

  // collections built in the arrange page's sort mode. they live entirely in
  // the saved arrangement — each photo just points at the folder it already
  // sits in, so re-sorting never moves a file. a photo pulled into one of
  // these is taken out of the collection it came from.
  function applyCustomCollections(arr) {
    const list = arr && arr._collections;
    if (!Array.isArray(list) || !list.length) return;

    const moved = {};
    list.forEach(c => (c.photos || []).forEach(p => {
      if (!p || !p.src || !p.file) return;
      (moved[p.src] || (moved[p.src] = {}))[p.file] = true;
    }));
    manifest.collections.forEach(col => {
      const m = moved[col.slug];
      if (!m) return;
      col.photos = col.photos.filter(e => !m[(typeof e === 'string') ? e : e.file]);
    });

    list.forEach(c => {
      const photos = (c.photos || []).filter(p => p && p.src && p.file);
      if (!c.title || !c.slug || !photos.length) return;
      manifest.collections.push({
        title: c.title,
        slug: c.slug,
        prints: c.prints || '',
        photos: photos.map(p => ({ file: p.file, src: p.src })),
      });
    });
  }

  // apply a saved arrangement (order + removals + captions) over the static
  // manifest. any photo not named in the saved order (e.g. newly added) is
  // appended, so adds still show; a missing/empty arrangement is a no-op.
  function applyArrangement(arr) {
    if (!arr || typeof arr !== 'object') return;
    manifest.collections.forEach(col => {
      const o = arr[col.slug];
      if (!o || !o.order) return;
      const byFile = {};
      col.photos.forEach(e => { byFile[(typeof e === 'string') ? e : e.file] = e; });
      const removeSet = {};
      (o.remove || []).forEach(f => { removeSet[f] = true; });
      const caps = o.captions || {};
      function withCaption(f, e) {
        const c = caps[f];
        if (!c) return e;
        const base = (typeof e === 'string') ? { file: e } : e;
        return Object.assign({}, base, { title: c.title || '', caption: c.caption || '' });
      }
      const ordered = [];
      o.order.forEach(f => { if (byFile[f] && !removeSet[f]) { ordered.push(withCaption(f, byFile[f])); delete byFile[f]; } });
      col.photos.forEach(e => {
        const f = (typeof e === 'string') ? e : e.file;
        if (byFile[f] && !removeSet[f]) { ordered.push(withCaption(f, byFile[f])); delete byFile[f]; }
      });
      col.photos = ordered;
    });
  }

  // fetch the saved arrangement from the backend, but never let it stall the
  // gallery — bail after a short timeout or any error.
  // the apps script cold-starts well past that timeout, which used to drop the
  // page back to the static manifest and show stale titles, so the last good
  // answer is kept in localStorage and used when the live one doesn't arrive.
  const ARR_CACHE = 'restenergy-arrangement';

  function cachedArrangement() {
    try {
      const s = localStorage.getItem(ARR_CACHE);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }

  async function fetchArrangement() {
    if (!window.STUDIO_API_URL) return null;
    try {
      const res = await Promise.race([
        fetch(window.STUDIO_API_URL + '?type=restenergy'),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1800)),
      ]);
      const data = await res.json();
      const arr = (data && data.arrangement) ? data.arrangement : null;
      if (arr) { try { localStorage.setItem(ARR_CACHE, JSON.stringify(arr)); } catch (e) {} }
      return arr;
    } catch (e) {
      return cachedArrangement();
    }
  }

  (async function load() {
    root.innerHTML = '<p class="re-loading">loading…</p>';
    try {
      const [mRes, rRes, arrangement] = await Promise.all([
        fetch('manifest.json?v=' + Date.now()),
        fetch('ratios.json?v=' + Date.now()).catch(() => null),
        fetchArrangement(),
      ]);
      manifest = await mRes.json();
      if (rRes) { try { ratios = await rRes.json(); } catch (e) { ratios = {}; } }
      if (!manifest.collections || !manifest.collections.length) {
        root.innerHTML = '<p class="re-empty">no photos yet.</p>';
        return;
      }
      applyCustomCollections(arrangement);
      applyArrangement(arrangement);
      render();
    } catch (err) {
      root.innerHTML = '<p class="re-empty">couldn’t load the galleries.</p>';
    }
  })();
})();
