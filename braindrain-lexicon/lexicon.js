const BRAINDRAIN_API_URL = 'https://script.google.com/macros/s/AKfycbygsC3wKaB2dps8ghda6Abyte2gCgdgTLqSbKqG7iXJtR9JVMUAuqZEeLPcxkBnuqjM/exec';
const LEXICON_LOCAL_KEY = 'braindrain.lexicon';

const body = document.getElementById('lexicon-body');
const tidyBtn = document.getElementById('tidy-btn');

let allEntries = [];
let tidyMode = false;

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
  const rows = sorted.map(e => `
    <li class="lexicon-entry${tidyMode ? ' tidy' : ''}" data-timestamp="${escapeAttr(e.timestamp || '')}" data-word="${escapeAttr(e.word)}">
      <div class="lex-word">${escapeHtml(e.word)}</div>
      <div class="lex-definition">${formatDefinition(e.definition || '— no definition —')}</div>
      ${tidyMode ? '<button type="button" class="lex-delete" aria-label="delete">&times;</button>' : ''}
    </li>
  `).join('');
  body.innerHTML = `<ul class="lexicon-list">${rows}</ul>`;
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
    tidyBtn.classList.toggle('active', tidyMode);
    // Label stays "− tidy"; active state is conveyed via italic via CSS.
    renderLexicon();
  });
}

body.addEventListener('click', (e) => {
  if (!tidyMode) return;
  const btn = e.target.closest('.lex-delete');
  if (!btn) return;
  const li = btn.closest('.lexicon-entry');
  if (!li) return;
  deleteEntry(li.dataset.word, li.dataset.timestamp);
});

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
