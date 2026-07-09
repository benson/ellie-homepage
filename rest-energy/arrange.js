/* Rest Energy — arrange/edit tool.
   loads manifest.json, shows each collection's photos as draggable tiles.
   drag to reorder; the × marks a photo for removal (toggle).
   nothing is saved from here — when the arrangement looks right, Claude reads
   window.getArrangement() and writes it back to manifest.json (+ removes files).
   window.getArrangement() -> { slug: { order: [file,...], remove: [file,...] } } */

(function () {
  const root = document.getElementById('arr-collections');
  if (!root) return;

  let manifest = null;
  const state = {};      // slug -> { order:[file...], remove:Set, orig:[file...] }
  let dragged = null;

  function fileOf(entry) { return (typeof entry === 'string') ? entry : entry.file; }
  function thumb(slug, file) { return 'img/' + slug + '/thumb/' + file + '.jpg'; }

  function renumber(grid) {
    let n = 0;
    Array.prototype.forEach.call(grid.children, tile => {
      const badge = tile.querySelector('.arr-num');
      if (tile.classList.contains('removing')) { badge.textContent = '—'; }
      else { n += 1; badge.textContent = n; }
    });
  }

  function markChanged(slug) {
    const grid = document.getElementById('arr-grid-' + slug);
    const order = Array.prototype.map.call(grid.children, t => t.dataset.file);
    const st = state[slug];
    const changedOrder = order.join(',') !== st.orig.join(',');
    const changedRemove = st.remove.size > 0;
    const flag = document.getElementById('arr-changed-' + slug);
    if (changedOrder || changedRemove) {
      flag.hidden = false;
      flag.textContent = (changedRemove ? st.remove.size + ' to remove' : '') +
        (changedRemove && changedOrder ? ' · ' : '') + (changedOrder ? 'reordered' : '');
    } else {
      flag.hidden = true;
    }
    updateStatus();
  }

  function updateStatus() {
    let reordered = 0, removing = 0;
    Object.keys(state).forEach(slug => {
      const grid = document.getElementById('arr-grid-' + slug);
      const order = Array.prototype.map.call(grid.children, t => t.dataset.file);
      if (order.join(',') !== state[slug].orig.join(',')) reordered += 1;
      removing += state[slug].remove.size;
    });
    const el = document.getElementById('arr-status-text');
    if (!el) return;
    if (!reordered && !removing) {
      el.innerHTML = 'no changes yet — drag to reorder, or × to mark a photo for removal.';
    } else {
      el.innerHTML = '<strong>' + reordered + '</strong> collection(s) reordered · <strong>' +
        removing + '</strong> photo(s) marked for removal — hit <strong>publish changes</strong> to go live.';
    }
    const btn = document.getElementById('arr-publish');
    if (btn) btn.disabled = !(reordered || removing);
  }

  async function doPublish() {
    const btn = document.getElementById('arr-publish');
    const txt = document.getElementById('arr-status-text');
    if (!window.STUDIO_API_URL) { txt.textContent = 'no backend configured yet.'; return; }
    btn.disabled = true;
    txt.textContent = 'publishing…';
    try {
      const capRes = await fetch(window.STUDIO_API_URL + '?type=restenergy');
      const cap = await capRes.json();
      if (!(cap && cap.apiVersion >= 2)) {
        txt.innerHTML = 'almost — the backend update needs its one-time switch-on first (same redeploy as studio editing). tell claude and it’s a 30-second step.';
        btn.disabled = false;
        return;
      }
      const res = await fetch(window.STUDIO_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'setArrangement', arrangement: window.getArrangement() }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'unknown error');
      // clear the marked-for-removal tiles and reset the baselines
      Object.keys(state).forEach(slug => {
        const grid = document.getElementById('arr-grid-' + slug);
        state[slug].remove.forEach(f => {
          const t = grid.querySelector('[data-file="' + f + '"]');
          if (t) t.remove();
        });
        state[slug].remove.clear();
        state[slug].orig = Array.prototype.map.call(grid.children, t => t.dataset.file);
        renumber(grid);
      });
      Object.keys(state).forEach(markChanged);
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

  function render() {
    root.innerHTML = '';
    manifest.collections.forEach(col => {
      const files = col.photos.map(fileOf);
      state[col.slug] = { remove: new Set(), orig: files.slice() };

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

  // Claude reads this to apply changes.
  window.getArrangement = function () {
    const out = {};
    Object.keys(state).forEach(slug => {
      const grid = document.getElementById('arr-grid-' + slug);
      const order = Array.prototype.map.call(grid.children, t => t.dataset.file)
        .filter(f => !state[slug].remove.has(f));
      out[slug] = { order: order, remove: Array.from(state[slug].remove) };
    });
    return out;
  };
  // convenience: copy the arrangement JSON to the clipboard
  window.copyArrangement = function () {
    const txt = JSON.stringify(window.getArrangement(), null, 2);
    if (navigator.clipboard) navigator.clipboard.writeText(txt);
    return txt;
  };

  (async function load() {
    try {
      const res = await fetch('manifest.json?v=' + Date.now());
      manifest = await res.json();
      if (!manifest.collections || !manifest.collections.length) {
        root.innerHTML = '<p class="re-empty">no photos yet.</p>';
        return;
      }
      render();
    } catch (err) {
      root.innerHTML = '<p class="re-empty">couldn’t load the galleries.</p>';
    }
  })();
})();
