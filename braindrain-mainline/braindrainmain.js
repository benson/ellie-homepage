const BRAINDRAIN_API_URL = 'https://script.google.com/macros/s/AKfycbygsC3wKaB2dps8ghda6Abyte2gCgdgTLqSbKqG7iXJtR9JVMUAuqZEeLPcxkBnuqjM/exec';
const LOCAL_KEY = 'braindrain.entries';
const CATEGORIES_KEY = 'braindrain.categories';
const CONTEXT_MAX = 120;
const CATEGORY_MAX = 30;

const body = document.getElementById('archive-body');
const sortByBtn = document.getElementById('sort-by-btn');
const sortByMenu = document.getElementById('sort-by-menu');
const rethinkBtn = document.getElementById('rethink-btn');

const SORT_OPTIONS = [
  { id: 'newest', label: 'newest first' },
  { id: 'oldest', label: 'oldest first' },
  { id: 'category', label: 'by category' },
];

const PAGE_SIZE = 20;

let allEntries = [];
let currentSort = 'newest';
let categoryFilter = null; // null = show all; string = show only that category
let editingEntryId = null;
let currentPage = 1;

function loadStoredCategories() {
  try { return JSON.parse(localStorage.getItem(CATEGORIES_KEY) || '[]'); }
  catch { return []; }
}

function persistCategoriesFromEntries() {
  // Union of stored categories + every category seen in entries, so we
  // never forget a category Ellie has used (even after a cache clear).
  const set = new Set(loadStoredCategories());
  allEntries.forEach(e => { if (e.category) set.add(e.category); });
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(Array.from(set)));
}

function getKnownCategories() {
  const set = new Set(loadStoredCategories());
  allEntries.forEach(e => { if (e.category) set.add(e.category); });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function parseStamp(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: String(iso), time: '' };
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).toLowerCase();
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  return { date, time };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s);
}

function sortEntries(entries, mode) {
  let arr = [...entries];
  if (categoryFilter !== null) {
    arr = arr.filter(e => (e.category || '') === categoryFilter);
  }
  if (mode === 'oldest') {
    arr.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
  } else if (mode === 'category') {
    arr.sort((a, b) => {
      const ac = (a.category || '~').toLowerCase();
      const bc = (b.category || '~').toLowerCase();
      if (ac !== bc) return ac.localeCompare(bc);
      return (b.timestamp || '').localeCompare(a.timestamp || '');
    });
  } else {
    arr.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  }
  return arr;
}

function renderEntries() {
  if (!allEntries.length) {
    body.innerHTML = '<p class="archive-empty">plant a thought at <a href="/braindrain">/braindrain</a></p>';
    return;
  }
  const sorted = sortEntries(allEntries, currentSort);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageEntries = sorted.slice(start, start + PAGE_SIZE);
  let lastDate = null;
  const rows = pageEntries.map(e => {
    const fmt = parseStamp(e.timestamp);
    const isEditing = e.timestamp === editingEntryId;
    const showDate = fmt.date !== lastDate;
    lastDate = fmt.date;
    // Date stacks above time on the first entry of each day; subsequent
    // same-day entries show just the time.
    const timeHtml = showDate
      ? `<span class="entry-date">${escapeHtml(fmt.date)}</span><span class="entry-clock">${escapeHtml(fmt.time)}</span>`
      : `<span class="entry-clock">${escapeHtml(fmt.time)}</span>`;
    if (isEditing) {
      return `
        <li class="archive-entry editing" data-timestamp="${escapeAttr(e.timestamp)}">
          <div class="entry-time">${timeHtml}</div>
          <div class="entry-edit-form">
            <textarea class="edit-text" rows="2" autocapitalize="none" autocorrect="off">${escapeHtml(e.text || '')}</textarea>
            <input class="edit-context" type="text" maxlength="${CONTEXT_MAX}" placeholder="context (optional)" autocapitalize="none" autocorrect="off" value="${escapeAttr(e.context || '')}">
            <div class="edit-controls">
              <input class="edit-category" type="text" maxlength="${CATEGORY_MAX}" placeholder="category" autocapitalize="none" autocorrect="off" value="${escapeAttr(e.category || '')}">
              <div class="edit-actions">
                <button type="button" class="edit-delete">del</button>
                <button type="button" class="link-btn edit-cancel">cancel</button>
                <button type="button" class="link-btn edit-save">save</button>
              </div>
            </div>
          </div>
        </li>
      `;
    }
    return `
      <li class="archive-entry" data-timestamp="${escapeAttr(e.timestamp)}">
        <div class="entry-time">${timeHtml}</div>
        <div class="entry-body">
          <div class="entry-text">${escapeHtml(e.text || '')}</div>
          ${e.context ? `<div class="entry-context">${escapeHtml(e.context)}</div>` : ''}
        </div>
        <div class="entry-category">${e.category ? escapeHtml(e.category) : ''}</div>
      </li>
    `;
  }).join('');
  const pager = totalPages > 1 ? `
    <nav class="pager" aria-label="archive pagination">
      <button type="button" class="link-btn pager-prev" ${currentPage === 1 ? 'disabled' : ''}>&lt; prev</button>
      <span class="pager-status">page ${currentPage} of ${totalPages} · ${sorted.length} ${sorted.length === 1 ? 'entry' : 'entries'}</span>
      <button type="button" class="link-btn pager-next" ${currentPage === totalPages ? 'disabled' : ''}>next &gt;</button>
    </nav>
  ` : '';
  body.innerHTML = `<ul class="archive-list">${rows}</ul>${pager}`;
  if (editingEntryId) {
    const editingLi = body.querySelector('.archive-entry.editing');
    if (editingLi) editingLi.querySelector('.edit-text').focus();
  }
  const prev = body.querySelector('.pager-prev');
  const next = body.querySelector('.pager-next');
  if (prev) prev.addEventListener('click', () => { currentPage--; renderEntries(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  if (next) next.addEventListener('click', () => { currentPage++; renderEntries(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
}

function setSortLabel() {
  if (currentSort === 'category' && categoryFilter) {
    sortByBtn.textContent = `category: ${categoryFilter}`;
  } else {
    const opt = SORT_OPTIONS.find(o => o.id === currentSort);
    sortByBtn.textContent = opt ? opt.label : 'sort >';
  }
}

function renderSortMenu() {
  sortByMenu.innerHTML = '';
  SORT_OPTIONS.forEach(opt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sort-menu-item';
    if (opt.id === currentSort) btn.classList.add('active');
    btn.textContent = opt.label;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (opt.id === 'category') {
        // Toggle expand the category submenu inline; don't close the menu.
        currentSort = 'category';
        categoryFilter = null;
        currentPage = 1;
        setSortLabel();
        renderSortMenu();
        renderEntries();
      } else {
        currentSort = opt.id;
        categoryFilter = null;
        currentPage = 1;
        setSortLabel();
        hideSortMenu();
        renderEntries();
      }
    });
    sortByMenu.appendChild(btn);

    if (opt.id === 'category' && currentSort === 'category') {
      // Inline submenu of known categories.
      const cats = getKnownCategories();
      const all = document.createElement('button');
      all.type = 'button';
      all.className = 'sort-menu-item sort-submenu-item';
      if (categoryFilter === null) all.classList.add('active');
      all.textContent = '· all';
      all.addEventListener('click', (e) => {
        e.stopPropagation();
        categoryFilter = null;
        currentPage = 1;
        setSortLabel();
        renderSortMenu();
        renderEntries();
      });
      sortByMenu.appendChild(all);

      cats.forEach(cat => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sort-menu-item sort-submenu-item';
        if (categoryFilter === cat) b.classList.add('active');
        b.textContent = `· ${cat}`;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          categoryFilter = cat;
          currentPage = 1;
          setSortLabel();
          hideSortMenu();
          renderEntries();
        });
        sortByMenu.appendChild(b);
      });

      if (cats.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'sort-menu-item sort-submenu-item';
        empty.style.color = '#999';
        empty.style.fontStyle = 'italic';
        empty.style.cursor = 'default';
        empty.textContent = '· (no categories yet)';
        sortByMenu.appendChild(empty);
      }
    }
  });
}

function showSortMenu() {
  renderSortMenu();
  sortByMenu.hidden = false;
}

function hideSortMenu() {
  sortByMenu.hidden = true;
}

sortByBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (sortByMenu.hidden) showSortMenu();
  else hideSortMenu();
});

document.addEventListener('click', (e) => {
  if (!sortByMenu.hidden && !sortByMenu.contains(e.target) && e.target !== sortByBtn) {
    hideSortMenu();
  }
});

function updateRethinkBtnText() {
  rethinkBtn.textContent = editingEntryId ? 'remember >' : 'rethink >';
}

rethinkBtn.addEventListener('click', () => {
  const active = document.body.classList.toggle('rethink-active');
  rethinkBtn.classList.toggle('active', active);
  if (!active && editingEntryId) {
    editingEntryId = null;
    renderEntries();
  }
  updateRethinkBtnText();
});

body.addEventListener('click', (e) => {
  if (!document.body.classList.contains('rethink-active')) return;
  const li = e.target.closest('.archive-entry');
  if (!li) return;

  // Cancel button
  if (e.target.classList.contains('edit-cancel')) {
    editingEntryId = null;
    renderEntries();
    updateRethinkBtnText();
    return;
  }
  // Delete button
  if (e.target.classList.contains('edit-delete')) {
    deleteEdit(li);
    return;
  }
  // Save button
  if (e.target.classList.contains('edit-save')) {
    saveEdit(li);
    return;
  }
  // Don't enter edit mode if clicking inside form
  if (li.classList.contains('editing')) return;

  // Enter edit mode for this entry
  const ts = li.dataset.timestamp;
  if (!ts) return;
  editingEntryId = ts;
  renderEntries();
  updateRethinkBtnText();
});

async function saveEdit(li) {
  const text = li.querySelector('.edit-text').value.trim();
  const context = li.querySelector('.edit-context').value.trim();
  const category = li.querySelector('.edit-category').value.trim().toLowerCase();
  if (!text) return;
  const saveBtn = li.querySelector('.edit-save');
  const cancelBtn = li.querySelector('.edit-cancel');
  saveBtn.disabled = true;
  cancelBtn.disabled = true;
  saveBtn.textContent = 'saving…';
  try {
    const res = await fetch(BRAINDRAIN_API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'update',
        timestamp: editingEntryId,
        text, context, category,
      }),
    });
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
    // Optimistically update the entry in allEntries so UX is instant
    const idx = allEntries.findIndex(e => e.timestamp === editingEntryId);
    if (idx >= 0) {
      allEntries[idx] = { ...allEntries[idx], text, context, category };
    }
    persistCategoriesFromEntries();
    editingEntryId = null;
    renderEntries();
    updateRethinkBtnText();
  } catch (err) {
    console.error(err);
    saveBtn.disabled = false;
    cancelBtn.disabled = false;
    saveBtn.textContent = 'save';
    alert("couldn't save — try again");
  }
}

async function deleteEdit(li) {
  if (!confirm('delete this entry? this cannot be undone.')) return;
  const ts = editingEntryId;
  const delBtn = li.querySelector('.edit-delete');
  delBtn.disabled = true;
  delBtn.textContent = 'deleting…';
  try {
    const res = await fetch(BRAINDRAIN_API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', timestamp: ts }),
    });
    if (!res.ok) throw new Error(`delete failed: ${res.status}`);
    allEntries = allEntries.filter(e => e.timestamp !== ts);
    editingEntryId = null;
    renderEntries();
    updateRethinkBtnText();
  } catch (err) {
    console.error(err);
    delBtn.disabled = false;
    delBtn.textContent = 'delete';
    alert("couldn't delete — try again");
  }
}

const downloadBtn = document.getElementById('download-btn');
if (downloadBtn) {
  downloadBtn.addEventListener('click', () => {
    window.print();
  });
}

async function loadEntries() {
  if (BRAINDRAIN_API_URL) {
    try {
      const res = await fetch(BRAINDRAIN_API_URL);
      if (!res.ok) throw new Error(`load failed: ${res.status}`);
      const data = await res.json();
      if (data.sheetUrl) {
        const link = document.getElementById('sheet-link');
        link.href = data.sheetUrl;
        link.hidden = false;
      }
      return data.entries || [];
    } catch (err) {
      console.error(err);
      body.innerHTML = '<p class="archive-empty">couldn\'t load — try refreshing</p>';
      throw err;
    }
  }
  return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
}

loadEntries().then(entries => {
  allEntries = entries;
  persistCategoriesFromEntries();
  renderEntries();
}).catch(() => {});
