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
  let dragged = null;
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

  // ---- drag reorder (within a grid) ----
  function onDragStart(e) {
    dragged = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', this.dataset.file); } catch (err) {}
  }
  function onDragEnd() {
    if (dragged) dragged.classList.remove('dragging');
    Array.prototype.forEach.call(root.querySelectorAll('.drop-target'), t => t.classList.remove('drop-target'));
    const grid = this.parentElement;
    renumber(grid);
    markChanged(grid.dataset.slug);
    dragged = null;
  }
  function onDragOver(e) {
    if (!dragged || dragged === this) return;
    if (dragged.parentElement !== this.parentElement) return; // same collection only
    e.preventDefault();
    const rect = this.getBoundingClientRect();
    const after = (e.clientX - rect.left) > rect.width / 2;
    this.classList.add('drop-target');
    const ref = after ? this.nextSibling : this;
    if (ref !== dragged) this.parentElement.insertBefore(dragged, after ? this.nextSibling : this);
  }
  function onDragLeave() { this.classList.remove('drop-target'); }

  function buildTile(slug, file) {
    const tile = document.createElement('div');
    tile.className = 'arr-tile';
    tile.draggable = true;
    tile.dataset.file = file;
    tile.dataset.slug = slug;

    const img = document.createElement('img');
    img.src = thumb(slug, file);
    img.alt = '';
    img.loading = 'lazy';
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

    tile.addEventListener('dragstart', onDragStart);
    tile.addEventListener('dragend', onDragEnd);
    tile.addEventListener('dragover', onDragOver);
    tile.addEventListener('dragleave', onDragLeave);
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
      img.src = thumb(slug, file);
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

  function setMode(m) {
    mode = m;
    document.body.classList.toggle('mode-captions', m === 'captions');
    Array.prototype.forEach.call(document.querySelectorAll('.arr-mode'), b =>
      b.classList.toggle('active', b.dataset.mode === m));
    if (m === 'captions') {
      // rebuild rows from the current tile order so both views stay in sync
      Object.keys(state).forEach(buildCapsList);
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

      const head = document.createElement('div');
      head.className = 'arr-col-head';
      head.innerHTML =
        '<span class="arr-col-title">' + col.title + '</span>' +
        '<span class="arr-col-count">' + files.length + ' photos</span>' +
        '<span class="arr-col-changed" id="arr-changed-' + col.slug + '" hidden></span>';
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
