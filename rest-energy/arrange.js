/* Rest Energy — arrange/edit tool.
   three modes:
     arrange  — drag tiles to reorder; × marks a photo for removal (toggle)
     captions — every photo gets title + caption fields, all editable at once
     sort     — tap a photo to move it into a new collection you name here;
                tap it again in there to send it home. no files move on disk —
                the new collection just points at where each photo already
                lives (photo.src), so it's pure data and fully reversible.
   loads manifest.json AND the saved server arrangement (so it always starts
   from what's actually live), and publishes order + removals + captions back
   to the backend in one go via the "publish changes" button.
   window.getArrangement() -> { slug: { order:[], remove:[], captions:{file:{title,caption}} } } */

(function () {
  const root = document.getElementById('arr-collections');
  if (!root) return;

  let manifest = null;
  const state = {};      // slug -> { remove:Set, orig:[file...], captions:{}, origCaptionsJson }
  const srcOf = {};      // file -> the collection folder its image actually lives in
  let mode = 'arrange';

  // the re-sorted collection built in sort mode (one for now; stored as a list
  // in the saved arrangement so more can be added later without a format change)
  const NEW_SLUG = 'sorted-1';
  const custom = { title: '', prints: '' };
  let customOrig = { title: '', prints: '' };

  function fileOf(entry) { return (typeof entry === 'string') ? entry : entry.file; }
  // photos keep their original folder wherever they end up, so a re-sorted
  // collection needs no file moves at all
  function thumb(slug, file) { return 'img/' + (srcOf[file] || slug) + '/thumb/' + file + '.jpg'; }

  function cleanCaptions(caps) {
    // keep only photos that actually have text
    const out = {};
    Object.keys(caps || {}).forEach(f => {
      const c = caps[f] || {};
      const title = String(c.title || '').trim();
      const caption = String(c.caption || '').trim();
      if (title || caption) out[f] = { title: title, caption: caption };
    });
    return out;
  }

  function renumber(grid) {
    let n = 0;
    Array.prototype.forEach.call(grid.children, tile => {
      const badge = tile.querySelector('.arr-num');
      if (tile.classList.contains('removing')) { badge.textContent = '—'; }
      else { n += 1; badge.textContent = n; }
    });
  }

  function currentOrder(slug) {
    const grid = document.getElementById('arr-grid-' + slug);
    return Array.prototype.map.call(grid.children, t => t.dataset.file);
  }

  function markChanged(slug) {
    const st = state[slug];
    const changedOrder = currentOrder(slug).join(',') !== st.orig.join(',');
    const changedRemove = st.remove.size > 0;
    const changedCaps = JSON.stringify(cleanCaptions(st.captions)) !== st.origCaptionsJson;
    const flag = document.getElementById('arr-changed-' + slug);
    const bits = [];
    if (changedOrder) bits.push('reordered');
    if (changedRemove) bits.push(st.remove.size + ' to remove');
    if (changedCaps) bits.push('captions edited');
    flag.hidden = !bits.length;
    flag.textContent = bits.join(' · ');
    updateStatus();
  }

  function updateStatus() {
    let changes = 0, removing = 0, caps = 0;
    Object.keys(state).forEach(slug => {
      const st = state[slug];
      if (currentOrder(slug).join(',') !== st.orig.join(',')) changes += 1;
      removing += st.remove.size;
      if (JSON.stringify(cleanCaptions(st.captions)) !== st.origCaptionsJson) caps += 1;
    });
    const el = document.getElementById('arr-status-text');
    const btn = document.getElementById('arr-publish');
    if (!el) return;

    const newFiles = state[NEW_SLUG] ? currentOrder(NEW_SLUG) : [];
    const named = custom.title.trim().length > 0;
    const nameEdited = custom.title.trim() !== customOrig.title || custom.prints.trim() !== customOrig.prints;

    // a collection with no name can't go live — say so instead of a dead button
    if (newFiles.length && !named) {
      el.innerHTML = '<strong>' + newFiles.length + '</strong> photo' + (newFiles.length === 1 ? '' : 's') +
        ' picked — <strong>name your new collection</strong> to publish it.';
      if (btn) btn.disabled = true;
      return;
    }

    const anything = changes || removing || caps || nameEdited;
    if (!anything) {
      el.innerHTML = mode === 'captions'
        ? 'type titles/captions under any photos — one publish saves them all.'
        : mode === 'sort'
          ? 'tap any photo to move it into your new collection · tap it again there to send it home.'
          : 'no changes yet — drag to reorder, × to mark for removal, or switch to captions.';
    } else {
      const bits = [];
      if (newFiles.length && named) bits.push('<strong>' + newFiles.length + '</strong> in “' + custom.title.trim() + '”');
      if (changes) bits.push('<strong>' + changes + '</strong> reordered');
      if (removing) bits.push('<strong>' + removing + '</strong> to remove');
      if (caps) bits.push('<strong>captions</strong> edited');
      el.innerHTML = bits.join(' · ') + ' — hit <strong>publish changes</strong> to go live.';
    }
    if (btn) btn.disabled = !anything;
  }

  async function doPublish() {
    const btn = document.getElementById('arr-publish');
    const txt = document.getElementById('arr-status-text');
    if (!window.STUDIO_API_URL) { txt.textContent = 'no backend configured yet.'; return; }
    btn.disabled = true;
    txt.textContent = 'publishing…';
    try {
      const res = await fetch(window.STUDIO_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'setArrangement', arrangement: window.getArrangement() }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'unknown error');
      // reset baselines: drop removed tiles, snapshot order + captions
      Object.keys(state).forEach(slug => {
        const grid = document.getElementById('arr-grid-' + slug);
        state[slug].remove.forEach(f => {
          const t = grid.querySelector('[data-file="' + f + '"]');
          if (t) t.remove();
          const row = document.querySelector('#arr-caps-' + slug + ' [data-file="' + f + '"]');
          if (row) row.remove();
        });
        state[slug].remove.clear();
        state[slug].orig = currentOrder(slug);
        customOrig = { title: custom.title.trim(), prints: custom.prints.trim() };
        state[slug].origCaptionsJson = JSON.stringify(cleanCaptions(state[slug].captions));
        renumber(grid);
        markChanged(slug);
      });
      txt.innerHTML = '<strong>published!</strong> your gallery updates in a moment.';
    } catch (e) {
      txt.textContent = 'publish failed: ' + (e.message || e);
    } finally {
      const b = document.getElementById('arr-publish');
      if (b) b.disabled = false;
    }
  }

  // ---- drag reorder (pointer-based, so it works with a mouse AND a finger) ----
  // touch: press and hold a photo, then drag. moving before the hold = normal scrolling.
  const HOLD_MS = 220;     // how long to hold on touch before a drag starts
  const MOUSE_SLOP = 4;    // mouse: px of movement before a drag starts
  const TOUCH_SLOP = 10;   // touch: moving further than this cancels the hold (they're scrolling)
  let drag = null;         // active drag: { tile, grid, ghost, dx, dy, pointerId }
  let pending = null;      // pointer is down but a drag hasn't started yet

  function clearPending() {
    if (pending && pending.timer) clearTimeout(pending.timer);
    pending = null;
  }

  function beginDrag(p, x, y) {
    const tile = p.tile;
    const grid = tile.parentElement;
    const rect = tile.getBoundingClientRect();

    // a floating copy follows the finger/cursor; the original stays put as a gap marker
    const ghost = tile.cloneNode(true);
    ghost.classList.add('arr-ghost');
    ghost.classList.remove('dragging');
    ghost.style.width = rect.width + 'px';
    ghost.style.height = rect.height + 'px';
    document.body.appendChild(ghost);

    drag = { tile: tile, grid: grid, ghost: ghost, dx: x - rect.left, dy: y - rect.top, pointerId: p.pointerId };
    tile.classList.add('dragging');
    document.body.classList.add('arr-dragging');
    // capture on the GRID (not the tile) — the tile gets moved around in the DOM,
    // which would drop the capture and strand the drag mid-gesture.
    try { grid.setPointerCapture(p.pointerId); } catch (err) {}
    if (p.touch && navigator.vibrate) { try { navigator.vibrate(12); } catch (err) {} }
    moveGhost(x, y);
    clearPending();
  }

  function moveGhost(x, y) {
    drag.ghost.style.left = (x - drag.dx) + 'px';
    drag.ghost.style.top = (y - drag.dy) + 'px';
  }

  function dropInto(x, y) {
    const under = document.elementFromPoint(x, y);
    const target = under && under.closest ? under.closest('.arr-tile') : null;
    if (!target || target === drag.tile) return;
    if (target.parentElement !== drag.grid) return;   // same collection only
    const rect = target.getBoundingClientRect();
    const after = (x - rect.left) > rect.width / 2;
    drag.grid.insertBefore(drag.tile, after ? target.nextSibling : target);
  }

  // nudge the page along when dragging near the top/bottom edge (long grids on a phone)
  function edgeScroll(y) {
    const zone = 72;
    if (y < zone) window.scrollBy(0, -Math.ceil((zone - y) / 5));
    else if (y > window.innerHeight - zone) window.scrollBy(0, Math.ceil((y - (window.innerHeight - zone)) / 5));
  }

  function endDrag() {
    if (!drag) return;
    try { drag.grid.releasePointerCapture(drag.pointerId); } catch (err) {}
    drag.ghost.remove();
    drag.tile.classList.remove('dragging');
    document.body.classList.remove('arr-dragging');
    const grid = drag.grid;
    drag = null;
    renumber(grid);
    markChanged(grid.dataset.slug);
  }

  function onPointerDown(e) {
    if (mode !== 'arrange') return;      // in sort mode a tap moves the photo instead
    if (drag || e.button > 0) return;
    if (e.target.closest('.arr-remove')) return;          // the × button is its own thing
    if (this.classList.contains('removing')) return;      // don't shuffle photos already marked
    const touch = e.pointerType !== 'mouse';
    pending = { tile: this, pointerId: e.pointerId, x: e.clientX, y: e.clientY, touch: touch, timer: null };
    if (touch) {
      const p = pending;
      p.timer = setTimeout(function () { if (pending === p) beginDrag(p, p.x, p.y); }, HOLD_MS);
    }
  }

  function onPointerMove(e) {
    if (drag) {
      if (e.pointerId !== drag.pointerId) return;
      moveGhost(e.clientX, e.clientY);
      dropInto(e.clientX, e.clientY);
      edgeScroll(e.clientY);
      return;
    }
    if (!pending || e.pointerId !== pending.pointerId) return;
    const dist = Math.hypot(e.clientX - pending.x, e.clientY - pending.y);
    if (pending.touch) { if (dist > TOUCH_SLOP) clearPending(); }        // a scroll, not a drag
    else if (dist > MOUSE_SLOP) beginDrag(pending, e.clientX, e.clientY);
  }

  function onPointerUp(e) {
    clearPending();
    if (drag && e.pointerId === drag.pointerId) endDrag();
  }

  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);
  // once a drag is underway, stop the page scrolling under the finger.
  // must be non-passive, and touch-action can't do it (it's fixed when the gesture starts).
  document.addEventListener('touchmove', function (e) { if (drag) e.preventDefault(); }, { passive: false });
  // no iOS copy/lookup bubble on a long press
  document.addEventListener('contextmenu', function (e) { if (drag || pending) e.preventDefault(); });

  function buildTile(slug, file) {
    const tile = document.createElement('div');
    tile.className = 'arr-tile';
    tile.dataset.file = file;
    tile.dataset.slug = slug;

    // src is deferred (data-src) — photos only load when the collection opens
    const img = document.createElement('img');
    img.dataset.src = thumb(slug, file);
    img.alt = '';
    img.loading = 'lazy';
    img.draggable = false;
    tile.appendChild(img);

    const num = document.createElement('span');
    num.className = 'arr-num';
    tile.appendChild(num);

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'arr-remove';
    rm.textContent = '×';
    rm.title = 'mark for removal';
    rm.addEventListener('click', e => {
      e.stopPropagation();
      const s = tile.dataset.slug;          // not `slug` — sort mode can move the tile
      const st = state[s];
      if (st.remove.has(file)) { st.remove.delete(file); tile.classList.remove('removing'); rm.textContent = '×'; }
      else { st.remove.add(file); tile.classList.add('removing'); rm.textContent = '↺'; }
      renumber(tile.parentElement);
      markChanged(s);
    });
    tile.appendChild(rm);

    tile.addEventListener('pointerdown', onPointerDown);
    tile.addEventListener('click', e => {
      if (mode !== 'sort') return;
      if (e.target.closest('.arr-remove')) return;
      moveTile(tile);
    });
    return tile;
  }

  // ---- sort mode: tap a photo to send it to the new collection, or home ----
  function moveTile(tile) {
    if (tile.classList.contains('removing')) return;   // un-mark it first
    const file = tile.dataset.file;
    const from = tile.parentElement;
    const fromSlug = from.dataset.slug;
    const toSlug = (fromSlug === NEW_SLUG) ? (srcOf[file] || fromSlug) : NEW_SLUG;
    if (toSlug === fromSlug) return;
    const to = document.getElementById('arr-grid-' + toSlug);
    if (!to) return;

    // a caption belongs to the photo, so carry it across with the tile
    const cap = state[fromSlug].captions[file];
    if (cap) { state[toSlug].captions[file] = cap; delete state[fromSlug].captions[file]; }

    to.appendChild(tile);
    tile.dataset.slug = toSlug;
    tile.classList.add('just-moved');
    setTimeout(() => tile.classList.remove('just-moved'), 400);

    renumber(from);
    renumber(to);
    markChanged(fromSlug);
    markChanged(toSlug);
    refreshNewSection();
  }

  // the new collection's section is the drop destination, so it's always there
  // in sort mode; elsewhere it only shows once it actually holds photos
  function refreshNewSection() {
    const sec = document.getElementById('arr-sec-' + NEW_SLUG);
    if (!sec) return;
    const n = currentOrder(NEW_SLUG).length;
    sec.hidden = (mode !== 'sort') && !n;
    const count = sec.querySelector('.arr-col-count');
    if (count) count.textContent = n + (n === 1 ? ' photo' : ' photos');
    const empty = sec.querySelector('.arr-new-empty');
    if (empty) empty.hidden = n > 0;
    if (n && !sec.classList.contains('open')) { sec.classList.add('open'); hydrate(sec); }
  }

  // ---- captions mode: one editable row per photo, all at once ----
  function buildCapsList(slug) {
    const wrap = document.getElementById('arr-caps-' + slug);
    wrap.innerHTML = '';
    currentOrder(slug).forEach(file => {
      const st = state[slug];
      const c = st.captions[file] || (st.captions[file] = { title: '', caption: '' });

      const row = document.createElement('div');
      row.className = 'arr-cap-row';
      row.dataset.file = file;

      const img = document.createElement('img');
      img.dataset.src = thumb(slug, file);
      img.alt = '';
      img.loading = 'lazy';
      row.appendChild(img);

      const fields = document.createElement('div');
      fields.className = 'arr-cap-fields';

      const title = document.createElement('input');
      title.type = 'text';
      title.placeholder = 'title (optional)';
      title.value = c.title || '';
      title.addEventListener('input', () => { c.title = title.value; markChanged(slug); });

      const cap = document.createElement('textarea');
      cap.rows = 2;
      cap.placeholder = 'caption (optional)';
      cap.value = c.caption || '';
      cap.addEventListener('input', () => { c.caption = cap.value; markChanged(slug); });

      fields.appendChild(title);
      fields.appendChild(cap);
      row.appendChild(fields);
      wrap.appendChild(row);
    });
  }

  // load a section's photos only once it's opened (keeps the page light)
  function hydrate(section) {
    Array.prototype.forEach.call(section.querySelectorAll('img[data-src]'), img => {
      img.src = img.dataset.src;
      delete img.dataset.src;
    });
  }

  function toggleSection(section, slug) {
    const open = section.classList.toggle('open');
    if (open) {
      if (mode === 'captions') buildCapsList(slug);
      hydrate(section);
    }
  }

  function setMode(m) {
    mode = m;
    document.body.classList.toggle('mode-captions', m === 'captions');
    document.body.classList.toggle('mode-sort', m === 'sort');
    Array.prototype.forEach.call(document.querySelectorAll('.arr-mode'), b =>
      b.classList.toggle('active', b.dataset.mode === m));
    refreshNewSection();
    if (m === 'sort') {
      // every collection needs to be reachable to pick from, so open them all
      Array.prototype.forEach.call(document.querySelectorAll('.arr-col'), sec => {
        sec.classList.add('open');
        hydrate(sec);
      });
    }
    if (m === 'captions') {
      // rebuild rows (from current tile order) for the OPEN sections only
      Array.prototype.forEach.call(document.querySelectorAll('.arr-col.open'), sec => {
        const slug = sec.querySelector('.arr-grid').dataset.slug;
        buildCapsList(slug);
        hydrate(sec);
      });
    }
    updateStatus();
  }

  function makeSection(slug, title, files, opts) {
    opts = opts || {};
    const section = document.createElement('section');
    section.className = 'arr-col' + (opts.isNew ? ' arr-col-new' : '');
    section.id = 'arr-sec-' + slug;

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'arr-col-head';
    head.innerHTML =
      '<span class="arr-col-title">' + title + '</span>' +
      '<span class="arr-col-count">' + files.length + ' photos</span>' +
      '<span class="arr-col-changed" id="arr-changed-' + slug + '" hidden></span>' +
      '<span class="arr-col-chev" aria-hidden="true"></span>';
    head.addEventListener('click', () => toggleSection(section, slug));
    section.appendChild(head);

    if (opts.isNew) section.appendChild(buildNewFields(head));

    const grid = document.createElement('div');
    grid.className = 'arr-grid';
    grid.id = 'arr-grid-' + slug;
    grid.dataset.slug = slug;
    files.forEach(f => grid.appendChild(buildTile(slug, f)));
    section.appendChild(grid);

    if (opts.isNew) {
      const empty = document.createElement('p');
      empty.className = 'arr-new-empty';
      empty.textContent = 'tap photos below to gather them in here.';
      section.appendChild(empty);
    }

    const caps = document.createElement('div');
    caps.className = 'arr-caps';
    caps.id = 'arr-caps-' + slug;
    section.appendChild(caps);

    root.appendChild(section);
    renumber(grid);
    return section;
  }

  // name (and optional prints link) for the collection being built in sort mode
  function buildNewFields(head) {
    const wrap = document.createElement('div');
    wrap.className = 'arr-new-fields';

    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'arr-new-name';
    name.placeholder = 'name this collection…';
    name.value = custom.title;
    name.addEventListener('click', e => e.stopPropagation());
    name.addEventListener('input', () => {
      custom.title = name.value;
      const t = head.querySelector('.arr-col-title');
      t.textContent = custom.title.trim() || 'new collection';
      t.classList.toggle('arr-untitled', !custom.title.trim());
      updateStatus();
    });

    const prints = document.createElement('input');
    prints.type = 'url';
    prints.className = 'arr-new-prints';
    prints.placeholder = 'prints link (optional)';
    prints.value = custom.prints;
    prints.addEventListener('click', e => e.stopPropagation());
    prints.addEventListener('input', () => { custom.prints = prints.value; updateStatus(); });

    wrap.appendChild(name);
    wrap.appendChild(prints);
    return wrap;
  }

  function seedState(slug, photos) {
    const files = photos.map(fileOf);
    const captions = {};
    photos.forEach(e => {
      if (typeof e !== 'string' && (e.title || e.caption)) {
        captions[e.file] = { title: e.title || '', caption: e.caption || '' };
      }
    });
    state[slug] = {
      remove: new Set(),
      orig: files.slice(),
      captions: captions,
      origCaptionsJson: JSON.stringify(cleanCaptions(captions)),
    };
    return files;
  }

  function render(customPhotos) {
    root.innerHTML = '';

    const modes = document.createElement('div');
    modes.className = 'arr-modes';
    modes.innerHTML =
      '<button type="button" class="arr-mode active" data-mode="arrange">arrange</button>' +
      '<button type="button" class="arr-mode" data-mode="captions">captions</button>' +
      '<button type="button" class="arr-mode" data-mode="sort">sort</button>';
    modes.addEventListener('click', e => {
      const b = e.target.closest('.arr-mode');
      if (b) setMode(b.dataset.mode);
    });
    root.appendChild(modes);

    // the collection being assembled sits at the top, where it's easy to see fill up
    const newFiles = seedState(NEW_SLUG, customPhotos || []);
    const newSec = makeSection(NEW_SLUG, custom.title.trim() || 'new collection', newFiles, { isNew: true });
    if (!custom.title.trim()) newSec.querySelector('.arr-col-title').classList.add('arr-untitled');

    manifest.collections.forEach(col => {
      makeSection(col.slug, col.title, seedState(col.slug, col.photos));
    });

    const status = document.createElement('div');
    status.className = 'arr-status';
    status.id = 'arr-status';
    status.innerHTML = '<span class="arr-status-text" id="arr-status-text"></span>';
    const publish = document.createElement('button');
    publish.type = 'button';
    publish.className = 'arr-publish';
    publish.id = 'arr-publish';
    publish.textContent = 'publish changes';
    publish.disabled = true;
    publish.addEventListener('click', doPublish);
    status.appendChild(publish);
    document.body.appendChild(status);
    refreshNewSection();
    updateStatus();
  }

  // Claude (and the publish button) read this to apply changes.
  window.getArrangement = function () {
    const out = {};
    Object.keys(state).forEach(slug => {
      const st = state[slug];
      const order = currentOrder(slug).filter(f => !st.remove.has(f));
      out[slug] = {
        order: order,
        remove: Array.from(st.remove),
        captions: cleanCaptions(st.captions),
      };
    });
    // the re-sorted collection, as pointers to where each photo already lives.
    // no name or no photos = nothing to publish, and it quietly disappears.
    const picked = (out[NEW_SLUG] && out[NEW_SLUG].order) || [];
    const title = custom.title.trim();
    if (title && picked.length) {
      out._collections = [{
        slug: NEW_SLUG,
        title: title,
        prints: custom.prints.trim(),
        photos: picked.map(f => ({ src: srcOf[f], file: f })),
      }];
    }
    return out;
  };
  // convenience: copy the arrangement JSON to the clipboard
  window.copyArrangement = function () {
    const txt = JSON.stringify(window.getArrangement(), null, 2);
    if (navigator.clipboard) navigator.clipboard.writeText(txt);
    return txt;
  };

  // start from what's actually live: manifest + the saved server arrangement
  function applySaved(arr) {
    if (!arr || typeof arr !== 'object') return;
    manifest.collections.forEach(col => {
      const o = arr[col.slug];
      if (!o || !o.order) return;
      const byFile = {};
      col.photos.forEach(e => { byFile[fileOf(e)] = e; });
      const caps = o.captions || {};
      function withCaption(f, e) {
        const c = caps[f];
        if (!c) return e;
        const base = (typeof e === 'string') ? { file: e } : e;
        return Object.assign({}, base, { title: c.title || '', caption: c.caption || '' });
      }
      const ordered = [];
      o.order.forEach(f => { if (byFile[f]) { ordered.push(withCaption(f, byFile[f])); delete byFile[f]; } });
      col.photos.forEach(e => {
        const f = fileOf(e);
        if (byFile[f]) { ordered.push(withCaption(f, byFile[f])); delete byFile[f]; }
      });
      col.photos = ordered;
    });
  }

  // every photo's home folder, indexed before anything is pulled out of a
  // collection — this is what lets a re-sorted photo still find its image
  function indexSources() {
    manifest.collections.forEach(col => {
      col.photos.forEach(e => { srcOf[fileOf(e)] = col.slug; });
    });
  }

  // rebuild the sorted collection saved last time: take its photos back out of
  // the collections they came from, and hand them to render()
  function applyCustom(arr) {
    const c = (arr && Array.isArray(arr._collections)) ? arr._collections[0] : null;
    if (!c) return [];
    custom.title = c.title || '';
    custom.prints = c.prints || '';
    customOrig = { title: custom.title.trim(), prints: custom.prints.trim() };

    const photos = (c.photos || []).filter(p => p && p.file && srcOf[p.file]);
    const moved = {};
    photos.forEach(p => { const h = srcOf[p.file]; (moved[h] || (moved[h] = {}))[p.file] = true; });
    manifest.collections.forEach(col => {
      const m = moved[col.slug];
      if (m) col.photos = col.photos.filter(e => !m[fileOf(e)]);
    });

    const caps = (arr[NEW_SLUG] && arr[NEW_SLUG].captions) || {};
    return photos.map(p => {
      const cap = caps[p.file];
      return cap ? { file: p.file, title: cap.title || '', caption: cap.caption || '' } : p.file;
    });
  }

  async function fetchSaved() {
    if (!window.STUDIO_API_URL) return null;
    try {
      const res = await fetch(window.STUDIO_API_URL + '?type=restenergy&t=' + Date.now(), { cache: 'no-store' });
      const data = await res.json();
      return (data && data.arrangement) ? data.arrangement : null;
    } catch (e) { return null; }
  }

  (async function load() {
    try {
      const [mRes, saved] = await Promise.all([
        fetch('manifest.json?v=' + Date.now()),
        fetchSaved(),
      ]);
      manifest = await mRes.json();
      if (!manifest.collections || !manifest.collections.length) {
        root.innerHTML = '<p class="re-empty">no photos yet.</p>';
        return;
      }
      indexSources();
      const customPhotos = applyCustom(saved);
      applySaved(saved);
      render(customPhotos);
    } catch (err) {
      root.innerHTML = '<p class="re-empty">couldn’t load the galleries.</p>';
    }
  })();
})();
