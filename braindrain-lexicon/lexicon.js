const BRAINDRAIN_API_URL = 'https://script.google.com/macros/s/AKfycbygsC3wKaB2dps8ghda6Abyte2gCgdgTLqSbKqG7iXJtR9JVMUAuqZEeLPcxkBnuqjM/exec';
const LEXICON_LOCAL_KEY = 'braindrain.lexicon';

const body = document.getElementById('lexicon-body');
const tidyBtn = document.getElementById('tidy-btn');

let allEntries = [];
let tidyMode = false;
let editingTimestamp = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function escapeAttr(s) { return escapeHtml(s); }

function formatDefinition(def) {
  // Render parens as small italic gray spans. Escape first, then re-wrap
  // matched (...) ranges in styled spans.
  const escaped = escapeHtml(def || '');
  return escaped.replace(/\(([^)]+)\)/g, '<span class="lex-paren">($1)</span>');
}

function loadLocalLexicon() {
  try { return JSON.parse(localStorage.getItem(LEXICON_LOCAL_KEY) || '[]'); }
  catch { return []; }
}

function saveLocalLexicon(entries) {
  localStorage.setItem(LEXICON_LOCAL_KEY, JSON.stringify(entries));
}

async function fetchRemoteLexicon() {
  if (!BRAINDRAIN_API_URL) return [];
  try {
    const res = await fetch(BRAINDRAIN_API_URL + '?type=lexicon');
    if (!res.ok) return [];
    const data = await res.json();
    const entries = Array.isArray(data.entries) ? data.entries : [];
    return entries.filter(e => e && typeof e.word === 'string');
  } catch (err) {
    console.error(err);
    return [];
  }
}

function mergeEntries(remote, local) {
  const byKey = new Map();
  const consider = (e) => {
    if (!e || !e.word) return;
    const word = String(e.word).trim().toLowerCase();
    if (!word) return;
    // key by word+timestamp so duplicate words with different sources don't merge
    const key = `${word}|${e.timestamp || ''}`;
    const existing = byKey.get(word);
    if (!existing || (e.timestamp || '') > (existing.timestamp || '')) {
      byKey.set(word, { ...e, word });
    }
  };
  remote.forEach(consider);
  local.forEach(consider);
  return Array.from(byKey.values());
}

function renderLexicon() {
  if (!allEntries.length) {
    body.innerHTML = '<p class="archive-empty">your lexicon will live here — feed it from <a href="/braindrain">/braindrain</a></p>';
    return;
  }
  const sorted = [...allEntries].sort((a, b) => a.word.localeCompare(b.word));
  const rows = sorted.map(e => {
    const isEditing = tidyMode && editingTimestamp && e.timestamp === editingTimestamp;
    if (isEditing) {
      return `
        <li class="lexicon-entry tidy editing" data-timestamp="${escapeAttr(e.timestamp || '')}" data-word="${escapeAttr(e.word)}">
          <input class="edit-word" type="text" value="${escapeAttr(e.word)}" autocapitalize="none" autocorrect="off">
          <textarea class="edit-definition" rows="4" autocapitalize="sentences">${escapeHtml(e.definition || '')}</textarea>
          <div class="edit-actions">
            <button type="button" class="link-btn edit-cancel">cancel</button>
            <button type="button" class="link-btn edit-save">save</button>
          </div>
        </li>
      `;
    }
    return `
      <li class="lexicon-entry${tidyMode ? ' tidy' : ''}" data-timestamp="${escapeAttr(e.timestamp || '')}" data-word="${escapeAttr(e.word)}">
        <div class="lex-word">${escapeHtml(e.word)}</div>
        <div class="lex-definition">${formatDefinition(e.definition || '— no definition —')}</div>
        ${tidyMode ? '<button type="button" class="lex-delete" aria-label="delete">&times;</button>' : ''}
      </li>
    `;
  }).join('');
  body.innerHTML = `<ul class="lexicon-list">${rows}</ul>`;
  if (editingTimestamp) {
    const editingLi = body.querySelector('.lexicon-entry.editing');
    if (editingLi) {
      const input = editingLi.querySelector('.edit-word');
      if (input) input.focus();
    }
  }
}

async function deleteEntry(word, timestamp) {
  if (!confirm(`delete "${word}"? this cannot be undone.`)) return;
  // Remove from local immediately so UX is instant
  const local = loadLocalLexicon().filter(e => {
    const sameWord = (String(e.word || '').trim().toLowerCase() === word);
    const sameTs = timestamp && e.timestamp === timestamp;
    // If we have a timestamp, only remove that one; otherwise remove by word
    return timestamp ? !(sameWord && sameTs) : !sameWord;
  });
  saveLocalLexicon(local);
  allEntries = allEntries.filter(e => !(e.word === word && (!timestamp || e.timestamp === timestamp)));
  renderLexicon();
  // Try cloud delete (best-effort — needs the redeployed Apps Script)
  if (BRAINDRAIN_API_URL && timestamp) {
    try {
      await fetch(BRAINDRAIN_API_URL, {
        method: 'POST',
        body: JSON.stringify({ type: 'lexicon', action: 'delete', timestamp }),
      });
    } catch (err) {
      console.error('cloud delete failed', err);
    }
  }
}

if (tidyBtn) {
  tidyBtn.addEventListener('click', () => {
    tidyMode = !tidyMode;
    if (!tidyMode) editingTimestamp = null;
    tidyBtn.classList.toggle('active', tidyMode);
    renderLexicon();
  });
}

body.addEventListener('click', (e) => {
  if (!tidyMode) return;
  // Delete button takes priority
  const delBtn = e.target.closest('.lex-delete');
  if (delBtn) {
    const li = delBtn.closest('.lexicon-entry');
    if (li) deleteEntry(li.dataset.word, li.dataset.timestamp);
    return;
  }
  // Edit-mode buttons inside an editing entry
  const li = e.target.closest('.lexicon-entry');
  if (!li) return;
  if (e.target.classList.contains('edit-cancel')) {
    editingTimestamp = null;
    renderLexicon();
    return;
  }
  if (e.target.classList.contains('edit-save')) {
    saveEdit(li);
    return;
  }
  // Already editing? Don't re-enter on clicks inside the form
  if (li.classList.contains('editing')) return;
  // Otherwise: open this entry for editing
  const ts = li.dataset.timestamp;
  if (!ts) return;
  editingTimestamp = ts;
  renderLexicon();
});

async function saveEdit(li) {
  const word = (li.querySelector('.edit-word').value || '').trim().toLowerCase();
  const definition = (li.querySelector('.edit-definition').value || '').trim();
  if (!word) return;
  const ts = editingTimestamp;
  const saveBtn = li.querySelector('.edit-save');
  saveBtn.disabled = true;
  saveBtn.textContent = 'saving…';
  // Update in memory + local cache immediately
  const idx = allEntries.findIndex(e => e.timestamp === ts);
  if (idx >= 0) allEntries[idx] = { ...allEntries[idx], word, definition };
  const local = loadLocalLexicon();
  const localIdx = local.findIndex(e => e.timestamp === ts);
  if (localIdx >= 0) {
    local[localIdx] = { ...local[localIdx], word, definition };
  } else {
    // Wasn't in local cache (cloud-only entry) — add it so edits persist.
    local.push({ word, definition, timestamp: ts });
  }
  local.sort((a, b) => String(a.word || '').localeCompare(String(b.word || '')));
  saveLocalLexicon(local);
  editingTimestamp = null;
  renderLexicon();
  // Best-effort cloud update — needs the redeployed Apps Script.
  if (BRAINDRAIN_API_URL) {
    try {
      await fetch(BRAINDRAIN_API_URL, {
        method: 'POST',
        body: JSON.stringify({ type: 'lexicon', action: 'update', timestamp: ts, word, definition }),
      });
    } catch (err) {
      console.error('cloud update failed', err);
    }
  }
}

(async () => {
  body.innerHTML = '<p class="archive-empty">loading…</p>';
  const local = loadLocalLexicon();
  if (local.length) {
    allEntries = mergeEntries([], local);
    renderLexicon();
  }
  const remote = await fetchRemoteLexicon();
  allEntries = mergeEntries(remote, local);
  renderLexicon();
})();
