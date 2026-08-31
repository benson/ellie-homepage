/* Rest Energy — arrange/edit tool.
   two modes:
     arrange  — drag tiles to reorder; × marks a photo for removal (toggle)
     captions — every photo gets title + caption fields, all editable at once
   loads manifest.json AND the saved server arrangement (so it always starts
   from what's actually live), and publishes order + removals + captions back
   to the backend in one go via the "publish changes" button.
   window.getArrangement() -> { slug: { order:[], remove:[], captions:{file:{title,caption}} } } */

(function () {
  const root = document.getElementById('arr-collections');
  if (!root) return;

  let manifest = null;
  const state = {};      // slug -> { remove:Set, orig:[file...], captions:{}, origCaptionsJson }
  let mode = 'arrange';

  function fileOf(entry) { return (typeof entry === 'string') ? entry : entry.file; }
  function thumb(slug, file) { return 'img/' + slug + '/thumb/' + file + '.jpg'; }

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
    if (!el) return;
    if (!changes && !removing && !caps) {
      el.innerHTML = mode === 'captions'
        ? 'type titles/captions under any photos — one publish saves them all.'
        : 'no changes yet — drag to reorder, × to mark for removal, or switch to captions.';
    } else {
      const bits = [];
      if (changes) bits.push('<strong>' + changes + '</strong> reordered');
      if (removing) bits.push('<strong>' + removing + '</strong> to remove');
      if (caps) bits.push('<strong>captions</strong> edited');
      el.innerHTML = bits.join(' · ') + ' — hit <strong>publish changes</strong> to go live.';
    }
    const btn = document.getElementById('arr-publish');
    if (btn) btn.disabled = !(changes || removing || caps);
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
      const st = state[slug];
      if (st.remove.has(file)) { st.remove.delete(file); tile.classList.remove('removing'); rm.textContent = '×'; }
      else { st.remove.add(file); tile.classList.add('removing'); rm.textContent = '↺'; }
      renumber(tile.parentElement);
      markChanged(slug);
    });
    tile.appendChild(rm);

    tile.addEventListener('pointerdown', onPointerDown);
    return tile;
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
    Array.prototype.forEach.call(document.querySelectorAll('.arr-mode'), b =>
      b.classList.toggle('active', b.dataset.mode === m));
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

  function render() {
    root.innerHTML = '';

    const modes = document.createElement('div');
    modes.className = 'arr-modes';
    modes.innerHTML =
      '<button type="button" class="arr-mode active" data-mode="arrange">arrange</button>' +
      '<button type="button" class="arr-mode" data-mode="captions">captions</button>';
    modes.addEventListener('click', e => {
      const b = e.target.closest('.arr-mode');
      if (b) setMode(b.dataset.mode);
    });
    root.appendChild(modes);

    manifest.collections.forEach(col => {
      const files = col.photos.map(fileOf);
      const captions = {};
      col.photos.forEach(e => {
        if (typeof e !== 'string' && (e.title || e.caption)) {
          captions[e.file] = { title: e.title || '', caption: e.caption || '' };
        }
      });
      state[col.slug] = {
        remove: new Set(),
        orig: files.slice(),
        captions: captions,
        origCaptionsJson: JSON.stringify(cleanCaptions(captions)),
      };

      const section = document.createElement('section');
      section.className = 'arr-col';

      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'arr-col-head';
      head.innerHTML =
        '<span class="arr-col-title">' + col.title + '</span>' +
        '<span class="arr-col-count">' + files.length + ' photos</span>' +
        '<span class="arr-col-changed" id="arr-changed-' + col.slug + '" hidden></span>' +
        '<span class="arr-col-chev" aria-hidden="true"></span>';
      head.addEventListener('click', () => toggleSection(section, col.slug));
      section.appendChild(head);

      const grid = document.createElement('div');
      grid.className = 'arr-grid';
      grid.id = 'arr-grid-' + col.slug;
      grid.dataset.slug = col.slug;
      files.forEach(f => grid.appendChild(buildTile(col.slug, f)));
      section.appendChild(grid);

      const caps = document.createElement('div');
      caps.className = 'arr-caps';
      caps.id = 'arr-caps-' + col.slug;
      section.appendChild(caps);

      root.appendChild(section);
      renumber(grid);
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
      applySaved(saved);
      render();
    } catch (err) {
      root.innerHTML = '<p class="re-empty">couldn’t load the galleries.</p>';
    }
  })();
})();
