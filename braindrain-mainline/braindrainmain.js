const BRAINDRAIN_API_URL = 'https://script.google.com/macros/s/AKfycbygsC3wKaB2dps8ghda6Abyte2gCgdgTLqSbKqG7iXJtR9JVMUAuqZEeLPcxkBnuqjM/exec';
const LOCAL_KEY = 'braindrain.entries';

const container = document.getElementById('archive-container');

function formatStamp(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const md = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const t = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${md} · ${t}`.toLowerCase();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function renderEntries(entries) {
  if (!entries.length) {
    container.innerHTML = '<p class="archive-empty">nothing in here yet — head to <a href="/braindrain">/braindrain</a> to add your first factoid</p>';
    return;
  }
  const sorted = [...entries].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  const rows = sorted.map(e => `
    <li class="archive-entry">
      <div class="entry-time">${escapeHtml(formatStamp(e.timestamp))}</div>
      <div class="entry-body">
        <div class="entry-text">${escapeHtml(e.text || '')}</div>
        ${e.context ? `<div class="entry-context">${escapeHtml(e.context)}</div>` : ''}
      </div>
      <div class="entry-category">${e.category ? escapeHtml(e.category) : ''}</div>
    </li>
  `).join('');
  container.innerHTML = `<ul class="archive-list">${rows}</ul>`;
}

async function loadEntries() {
  if (BRAINDRAIN_API_URL) {
    try {
      const res = await fetch(BRAINDRAIN_API_URL);
      if (!res.ok) throw new Error(`load failed: ${res.status}`);
      const data = await res.json();
      return data.entries || [];
    } catch (err) {
      console.error(err);
      container.innerHTML = '<p class="archive-empty">couldn\'t load — try refreshing</p>';
      throw err;
    }
  }
  return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
}

loadEntries().then(renderEntries).catch(() => {});
