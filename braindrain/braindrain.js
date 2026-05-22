const BRAINDRAIN_API_URL = 'https://script.google.com/macros/s/AKfycbygsC3wKaB2dps8ghda6Abyte2gCgdgTLqSbKqG7iXJtR9JVMUAuqZEeLPcxkBnuqjM/exec';
const LOCAL_KEY = 'braindrain.entries';
const LEXICON_LOCAL_KEY = 'braindrain.lexicon';
const BOOK_POS_KEY = 'braindrain.book_position';
const BOOK_SIZE_KEY = 'braindrain.book_size';
const STAMP_POS_KEY = 'braindrain.stamp_position';
const CATEGORIES_KEY = 'braindrain.categories';
const DEFAULT_CATEGORIES = ['fact', 'memory', 'feeling'];
const CONTEXT_MAX = 120;
const CATEGORY_MAX = 30;

(() => {
  const path = document.getElementById('rings-spiral');
  if (!path) return;
  const cx = 100, cy = 100, maxR = 92, turns = 5, ptsPerTurn = 28;
  const total = turns * ptsPerTurn;
  let d = '';
  for (let i = 0; i <= total; i++) {
    const ratio = i / total;
    const angle = ratio * turns * 2 * Math.PI;
    const r = ratio * maxR;
    const x = (cx + r * Math.cos(angle)).toFixed(2);
    const y = (cy + r * Math.sin(angle)).toFixed(2);
    d += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
  }
  path.setAttribute('d', d);
})();

function alignNowStampToA() {
  if (window.matchMedia('(max-width: 720px)').matches) return;
  const wordmark = document.querySelector('.wordmark h1');
  const now = document.getElementById('now-stamp');
  const main = document.querySelector('.bd-main');
  if (!wordmark || !now || !main || !wordmark.firstChild) return;
  const text = wordmark.textContent;
  const idx = text.indexOf('a');
  if (idx === -1) return;
  const range = document.createRange();
  range.setStart(wordmark.firstChild, idx);
  range.setEnd(wordmark.firstChild, idx + 1);
  const rect = range.getBoundingClientRect();
  const mainRect = main.getBoundingClientRect();
  now.style.left = Math.max(0, rect.left - mainRect.left) + 'px';
}
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(alignNowStampToA);
} else {
  setTimeout(alignNowStampToA, 300);
}
window.addEventListener('resize', alignNowStampToA);

const nowEl = document.getElementById('now-stamp');
const nowDateEl = document.getElementById('now-date');
const nowTimeEl = document.getElementById('now-time');
const composeOverlay = document.getElementById('compose-overlay');
const reviewOverlay = document.getElementById('review-overlay');
const savedOverlay = document.getElementById('saved-overlay');
const composeActions = document.getElementById('compose-actions');
const reviewActions = document.getElementById('review-actions');
const savedActions = document.getElementById('saved-actions');
const newThoughtBtn = document.getElementById('new-thought-btn');
const input = document.getElementById('factoid-input');
const reviewBtn = document.getElementById('review-btn');
const editBtn = document.getElementById('edit-btn');
const enterBtn = document.getElementById('enter-btn');
const reviewStamp = document.getElementById('review-stamp');
const reviewText = document.getElementById('review-text');
const reviewContext = document.getElementById('review-context');
const statusEl = document.getElementById('status');
const contextArea = document.getElementById('context-area');
const addContextBtn = document.getElementById('add-context-btn');

function formatNowParts(date) {
  const day = date.toLocaleDateString(undefined, { weekday: 'long' });
  const md = date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  const t = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return { date: `${day}, ${md}`.toLowerCase(), time: t.toLowerCase() };
}
function formatNow(date) {
  const p = formatNowParts(date);
  return `${p.date} · ${p.time}`;
}

function tickClock() {
  const p = formatNowParts(new Date());
  if (nowDateEl) nowDateEl.textContent = p.date;
  if (nowTimeEl) nowTimeEl.textContent = p.time;
}
tickClock();
setInterval(tickClock, 1000);

function showStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('bd-status-error', isError);
  statusEl.hidden = false;
  if (!isError) setTimeout(() => { statusEl.hidden = true; }, 2400);
}

function hideAllStates() {
  composeOverlay.hidden = true;
  composeActions.hidden = true;
  reviewOverlay.hidden = true;
  reviewActions.hidden = true;
  savedOverlay.hidden = true;
  savedActions.hidden = true;
}

function showCompose() {
  hideAllStates();
  if (nowEl) nowEl.hidden = false;
  composeOverlay.hidden = false;
  composeActions.hidden = false;
  input.focus();
}

function showReview(text, capturedAt, context) {
  hideAllStates();
  if (nowEl) nowEl.hidden = true;
  reviewOverlay.hidden = false;
  reviewActions.hidden = false;
  reviewStamp.textContent = formatNow(capturedAt);
  reviewText.textContent = text;
  if (context) {
    reviewContext.textContent = context;
    reviewContext.hidden = false;
  } else {
    reviewContext.textContent = '';
    reviewContext.hidden = true;
  }
}

function showSaved() {
  hideAllStates();
  if (nowEl) nowEl.hidden = false;
  savedOverlay.hidden = false;
  savedActions.hidden = false;
}

let pendingText = '';
let pendingDate = null;
let pendingContext = '';
let contextDraft = '';
let pendingCategory = '';
let pinnedCards = [];
let reviewCards = [];
let reviewIndex = 0;

const pinBtn = document.getElementById('pin-btn');
const pinCountEl = document.getElementById('pin-count');
const prevCardBtn = document.getElementById('prev-card-btn');
const nextCardBtn = document.getElementById('next-card-btn');
const reviewCounterEl = document.getElementById('review-counter');

function updatePinCount() {
  if (!pinCountEl) return;
  if (pinnedCards.length > 0) {
    pinCountEl.textContent = pinnedCards.length;
    pinCountEl.hidden = false;
  } else {
    pinCountEl.hidden = true;
  }
}

if (pinBtn) {
  pinBtn.addEventListener('click', () => {
    const text = input.value.trim();
    if (!text) {
      showStatus("type something first", true);
      return;
    }
    pinnedCards.push({
      text,
      context: (contextDraft || '').trim(),
      category: pendingCategory || '',
      stamp: new Date().toISOString(),
    });
    const wrap = composeOverlay.querySelector('.textbox-wrap');
    wrap.classList.add('pin-out');
    setTimeout(() => {
      input.value = '';
      contextDraft = '';
      pendingCategory = '';
      updateSortBtn();
      collapseContext();
      updatePinCount();
      wrap.classList.remove('pin-out');
      wrap.classList.add('pin-in');
      setTimeout(() => wrap.classList.remove('pin-in'), 320);
      input.focus();
    }, 280);
  });
}
let categories = (() => {
  try { return JSON.parse(localStorage.getItem(CATEGORIES_KEY)) || [...DEFAULT_CATEGORIES]; }
  catch { return [...DEFAULT_CATEGORIES]; }
})();

const sortBtn = document.getElementById('sort-btn');
const sortMenu = document.getElementById('sort-menu');

function persistCategories() {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
}

function updateSortBtn() {
  if (pendingCategory) {
    sortBtn.textContent = pendingCategory;
    sortBtn.classList.add('has-selection');
  } else {
    sortBtn.textContent = '+ sort';
    sortBtn.classList.remove('has-selection');
  }
}

function renderSortMenu() {
  sortMenu.innerHTML = '';
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sort-menu-item';
    if (cat === pendingCategory) btn.classList.add('active');
    btn.textContent = cat;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      pendingCategory = cat;
      updateSortBtn();
      hideSortMenu();
    });
    sortMenu.appendChild(btn);
  });
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'sort-menu-item sort-add';
  addBtn.textContent = '+ add new';
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showAddNew();
  });
  sortMenu.appendChild(addBtn);
}

function showAddNew() {
  sortMenu.innerHTML = '';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'sort-add-input';
  input.placeholder = 'new category';
  input.maxLength = CATEGORY_MAX;
  input.setAttribute('autocapitalize', 'none');
  input.setAttribute('autocorrect', 'off');
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = input.value.trim().toLowerCase();
      if (!v) return;
      if (!categories.includes(v)) {
        categories.push(v);
        persistCategories();
      }
      pendingCategory = v;
      updateSortBtn();
      hideSortMenu();
    } else if (e.key === 'Escape') {
      renderSortMenu();
    }
  });
  input.addEventListener('click', e => e.stopPropagation());
  sortMenu.appendChild(input);
  input.focus();
}

function showSortMenu() {
  renderSortMenu();
  sortMenu.hidden = false;
}

function hideSortMenu() {
  sortMenu.hidden = true;
}

sortBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (sortMenu.hidden) showSortMenu();
  else hideSortMenu();
});

document.addEventListener('click', (e) => {
  if (!sortMenu.hidden && !sortMenu.contains(e.target) && e.target !== sortBtn) {
    hideSortMenu();
  }
});

// Context expand/collapse
function expandContext(initial = '') {
  contextArea.innerHTML = '';
  const wrap = document.createElement('span');
  wrap.id = 'context-input-wrap';

  const ctx = document.createElement('input');
  ctx.type = 'text';
  ctx.id = 'context-input';
  ctx.maxLength = CONTEXT_MAX;
  ctx.placeholder = 'context';
  ctx.value = initial;
  ctx.setAttribute('autocapitalize', 'none');
  ctx.setAttribute('autocorrect', 'off');

  const counter = document.createElement('span');
  counter.id = 'context-counter';
  const updateCounter = () => {
    const remaining = CONTEXT_MAX - ctx.value.length;
    if (remaining <= 15) {
      counter.textContent = `${ctx.value.length}/${CONTEXT_MAX}`;
      counter.hidden = false;
    } else {
      counter.textContent = '';
      counter.hidden = true;
    }
  };
  updateCounter();
  ctx.addEventListener('input', () => { contextDraft = ctx.value; updateCounter(); });

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'context-cancel';
  cancel.setAttribute('aria-label', 'remove context');
  cancel.textContent = '×';
  cancel.addEventListener('click', () => { contextDraft = ''; collapseContext(); });

  wrap.append(ctx, counter, cancel);
  contextArea.append(wrap);
  ctx.focus();
}

function collapseContext() {
  contextArea.innerHTML = '';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'add-context-btn';
  btn.className = 'link-btn';
  btn.textContent = '+ context';
  btn.addEventListener('click', () => expandContext(contextDraft));
  contextArea.append(btn);
}

addContextBtn.addEventListener('click', () => expandContext(contextDraft));

reviewBtn.addEventListener('click', () => {
  const text = input.value.trim();
  if (!text && pinnedCards.length === 0) {
    showStatus("type something first", true);
    return;
  }
  reviewCards = [...pinnedCards];
  if (text) {
    reviewCards.push({
      text,
      context: (contextDraft || '').trim(),
      category: pendingCategory || '',
      stamp: new Date().toISOString(),
    });
  }
  reviewIndex = 0;
  showReviewMulti();
});

function showReviewMulti() {
  const card = reviewCards[reviewIndex];
  if (!card) return;
  pendingText = card.text;
  pendingDate = new Date(card.stamp);
  pendingContext = card.context || '';
  pendingCategory = card.category || '';
  updateSortBtn();
  showReview(pendingText, pendingDate, pendingContext);
  // counter
  if (reviewCounterEl) {
    if (reviewCards.length > 1) {
      reviewCounterEl.textContent = `${reviewIndex + 1} of ${reviewCards.length}`;
      reviewCounterEl.hidden = false;
    } else {
      reviewCounterEl.hidden = true;
    }
  }
  // prev / next visibility
  if (prevCardBtn) prevCardBtn.hidden = reviewIndex === 0;
  const isLast = reviewIndex === reviewCards.length - 1;
  if (nextCardBtn) nextCardBtn.hidden = isLast;
  if (enterBtn) {
    enterBtn.hidden = !isLast;
    enterBtn.textContent = reviewCards.length > 1 ? 'enter all >' : 'enter >';
  }
}

if (prevCardBtn) {
  prevCardBtn.addEventListener('click', () => {
    // Save current edits back to reviewCards
    reviewCards[reviewIndex] = {
      ...reviewCards[reviewIndex],
      category: pendingCategory || '',
    };
    if (reviewIndex > 0) {
      reviewIndex--;
      showReviewMulti();
    }
  });
}

if (nextCardBtn) {
  nextCardBtn.addEventListener('click', () => {
    reviewCards[reviewIndex] = {
      ...reviewCards[reviewIndex],
      category: pendingCategory || '',
    };
    if (reviewIndex < reviewCards.length - 1) {
      reviewIndex++;
      showReviewMulti();
    }
  });
}

const cardDeleteBtn = document.getElementById('card-delete-btn');
if (cardDeleteBtn) {
  cardDeleteBtn.addEventListener('click', () => {
    if (reviewCards.length === 0) return;
    reviewCards.splice(reviewIndex, 1);
    pinnedCards = [...reviewCards]; // sync queue (may include current-as-pinned)
    updatePinCount();
    if (reviewCards.length === 0) {
      // Nothing left → back to empty compose
      pendingText = '';
      pendingDate = null;
      pendingContext = '';
      pendingCategory = '';
      contextDraft = '';
      updateSortBtn();
      input.value = '';
      collapseContext();
      showCompose();
      return;
    }
    if (reviewIndex >= reviewCards.length) reviewIndex = reviewCards.length - 1;
    showReviewMulti();
  });
}

editBtn.addEventListener('click', () => {
  // If we're cycling through multi cards, edit the current one in compose mode.
  // Pop the currently-shown card off and put its content back into the compose form.
  if (reviewCards.length > 0) {
    const card = reviewCards[reviewIndex];
    input.value = card.text;
    contextDraft = card.context || '';
    pendingCategory = card.category || '';
    updateSortBtn();
    // Remove this card from the queue so it'll be re-added on next review
    reviewCards.splice(reviewIndex, 1);
    // Sync pinnedCards: rebuild from reviewCards (excluding the in-edit one)
    pinnedCards = [...reviewCards];
    updatePinCount();
    reviewCards = [];
    reviewIndex = 0;
  } else {
    input.value = pendingText;
    contextDraft = pendingContext;
  }
  showCompose();
  if (contextDraft) expandContext(contextDraft);
  else collapseContext();
  input.setSelectionRange(input.value.length, input.value.length);
});

enterBtn.addEventListener('click', async () => {
  enterBtn.disabled = true;
  editBtn.disabled = true;
  try {
    // If multi-card review, persist last category edit and save all
    if (reviewCards.length > 0) {
      reviewCards[reviewIndex] = {
        ...reviewCards[reviewIndex],
        category: pendingCategory || '',
      };
      for (const card of reviewCards) {
        await saveEntry({
          timestamp: card.stamp,
          text: card.text,
          context: card.context || '',
          category: card.category || '',
        });
      }
    } else {
      await saveEntry({
        timestamp: pendingDate.toISOString(),
        text: pendingText,
        context: pendingContext,
        category: pendingCategory,
      });
    }
    pinnedCards = [];
    reviewCards = [];
    reviewIndex = 0;
    pendingText = '';
    pendingDate = null;
    pendingContext = '';
    contextDraft = '';
    pendingCategory = '';
    updateSortBtn();
    updatePinCount();
    input.value = '';
    collapseContext();
    showSaved();
  } catch (err) {
    showStatus("couldn't save — try again", true);
    console.error(err);
  } finally {
    enterBtn.disabled = false;
    editBtn.disabled = false;
  }
});

if (newThoughtBtn) {
  newThoughtBtn.addEventListener('click', () => {
    showCompose();
  });
}

// --- lexicon (vocab words) ---
const bookBtn = document.getElementById('book-btn');
const lexModal = document.getElementById('lex-modal');
const lexBackdrop = document.getElementById('lex-backdrop');
const lexClose = document.getElementById('lex-close');
const lexInput = document.getElementById('lex-input');
const lexPreview = document.getElementById('lex-preview');
const lexStatus = document.getElementById('lex-status');
const lexAdd = document.getElementById('lex-add');
const lexEnter = document.getElementById('lex-enter');
const lexQueueCount = document.getElementById('lex-queue-count');

const isMobile = window.matchMedia('(max-width: 720px)').matches;

function applySavedPosition(el, storageKey) {
  if (!el) return;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
      const maxLeft = window.innerWidth - el.offsetWidth;
      const maxTop = window.innerHeight - el.offsetHeight;
      el.style.position = 'fixed';
      el.style.left = Math.max(0, Math.min(maxLeft, saved.left)) + 'px';
      el.style.top = Math.max(0, Math.min(maxTop, saved.top)) + 'px';
      el.style.bottom = 'auto';
      el.style.right = 'auto';
    }
  } catch {}
}

function makeDraggable(el, storageKey, onTap) {
  if (!el) return;
  let dragStartX = 0, dragStartY = 0, originLeft = 0, originTop = 0;
  let moved = false;
  const DRAG_THRESHOLD = 5;

  const ensureFixed = () => {
    if (getComputedStyle(el).position !== 'fixed') {
      const r = el.getBoundingClientRect();
      el.style.position = 'fixed';
      el.style.left = r.left + 'px';
      el.style.top = r.top + 'px';
      el.style.bottom = 'auto';
      el.style.right = 'auto';
    }
  };

  const onMove = (e) => {
    const pt = e.touches ? e.touches[0] : e;
    const dx = pt.clientX - dragStartX;
    const dy = pt.clientY - dragStartY;
    if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      moved = true;
      el.classList.add('dragging');
      ensureFixed();
    }
    if (moved) {
      const maxLeft = window.innerWidth - el.offsetWidth;
      const maxTop = window.innerHeight - el.offsetHeight;
      const newLeft = Math.max(0, Math.min(maxLeft, originLeft + dx));
      const newTop = Math.max(0, Math.min(maxTop, originTop + dy));
      el.style.left = newLeft + 'px';
      el.style.top = newTop + 'px';
      el.style.bottom = 'auto';
      el.style.right = 'auto';
      if (e.cancelable) e.preventDefault();
    }
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
    el.classList.remove('dragging');
    if (moved) {
      const rect = el.getBoundingClientRect();
      localStorage.setItem(storageKey, JSON.stringify({ left: rect.left, top: rect.top }));
    } else if (onTap) {
      onTap();
    }
  };
  const onDown = (e) => {
    moved = false;
    const pt = e.touches ? e.touches[0] : e;
    dragStartX = pt.clientX;
    dragStartY = pt.clientY;
    const rect = el.getBoundingClientRect();
    originLeft = rect.left;
    originTop = rect.top;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  };
  el.addEventListener('mousedown', onDown);
  el.addEventListener('touchstart', onDown, { passive: true });
}

if (!isMobile) {
  // Timestamp position is only adjustable on mobile.
  try { localStorage.removeItem(STAMP_POS_KEY); } catch {}
}

// Storage keys are scoped per-viewport so mobile and desktop tunings don't
// overwrite each other.
const bookPosKey = BOOK_POS_KEY + (isMobile ? '_mobile' : '_desktop');
const bookSizeKey = BOOK_SIZE_KEY + (isMobile ? '_mobile' : '_desktop');

// One-time migration: any legacy single-key values become the desktop values
// (since that's what's currently in storage from the last desktop tune).
try {
  const legacyPos = localStorage.getItem(BOOK_POS_KEY);
  if (legacyPos && !localStorage.getItem(BOOK_POS_KEY + '_desktop')) {
    localStorage.setItem(BOOK_POS_KEY + '_desktop', legacyPos);
  }
  localStorage.removeItem(BOOK_POS_KEY);
  const legacySize = localStorage.getItem(BOOK_SIZE_KEY);
  if (legacySize && !localStorage.getItem(BOOK_SIZE_KEY + '_desktop')) {
    localStorage.setItem(BOOK_SIZE_KEY + '_desktop', legacySize);
  }
  localStorage.removeItem(BOOK_SIZE_KEY);
} catch {}

function applyBookSize(key) {
  if (!bookBtn) return;
  try {
    const saved = parseInt(localStorage.getItem(key) || '0', 10);
    if (saved >= 28 && saved <= 140) {
      bookBtn.style.width = saved + 'px';
      bookBtn.style.height = saved + 'px';
      bookBtn.style.padding = Math.max(4, Math.round(saved * 0.15)) + 'px';
    }
  } catch {}
}

function makeResizable(target, handle, storageKey, opts) {
  if (!target || !handle) return;
  const min = opts?.min ?? 28;
  const max = opts?.max ?? 140;
  let startX = 0, startY = 0, startSize = 0;
  const onMove = (e) => {
    const pt = e.touches ? e.touches[0] : e;
    const dx = pt.clientX - startX;
    const dy = pt.clientY - startY;
    const delta = (dx + dy) / 2;
    const newSize = Math.max(min, Math.min(max, startSize + delta));
    target.style.width = newSize + 'px';
    target.style.height = newSize + 'px';
    target.style.padding = Math.max(4, Math.round(newSize * 0.15)) + 'px';
    if (e.cancelable) e.preventDefault();
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
    const size = target.getBoundingClientRect().width;
    localStorage.setItem(storageKey, String(Math.round(size)));
  };
  const onDown = (e) => {
    e.stopPropagation();
    const pt = e.touches ? e.touches[0] : e;
    startX = pt.clientX;
    startY = pt.clientY;
    startSize = target.getBoundingClientRect().width;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  };
  handle.addEventListener('mousedown', onDown);
  handle.addEventListener('touchstart', onDown, { passive: false });
}

if (bookBtn) {
  applyBookSize(bookSizeKey);
  applySavedPosition(bookBtn, bookPosKey);
  const bookResize = document.getElementById('book-resize');
  bookBtn.style.cursor = 'pointer';
  bookBtn.addEventListener('click', openLexModal);
  if (bookResize) bookResize.style.display = 'none';
}

if (isMobile && nowEl) {
  applySavedPosition(nowEl, STAMP_POS_KEY);
}

function openLexModal() {
  if (!lexModal) return;
  lexModal.hidden = false;
  resetLexModal();
  setTimeout(() => lexInput && lexInput.focus(), 0);
}

function closeLexModal() {
  if (!lexModal) return;
  lexModal.hidden = true;
  resetLexModal();
}

function resetLexModal() {
  if (lexInput) lexInput.value = '';
  if (lexPreview) { lexPreview.hidden = true; lexPreview.innerHTML = ''; }
  if (lexStatus) { lexStatus.hidden = true; lexStatus.textContent = ''; lexStatus.classList.remove('lex-status-error'); }
  lexQueue = [];
  updateLexQueueCount();
}

let lexQueue = [];

function updateLexQueueCount() {
  if (!lexQueueCount) return;
  if (lexQueue.length > 0) {
    lexQueueCount.textContent = `${lexQueue.length} pinned`;
    lexQueueCount.hidden = false;
  } else {
    lexQueueCount.hidden = true;
  }
}

function flattenDefinitions(entries) {
  const lines = [];
  for (const entry of (entries || [])) {
    for (const meaning of (entry.meanings || [])) {
      const pos = meaning.partOfSpeech || '';
      for (const def of (meaning.definitions || [])) {
        lines.push(`${pos ? `(${pos}) ` : ''}${def.definition}`);
      }
    }
  }
  return lines.slice(0, 5).join('\n');
}

function setLexStatus(msg, isError = false) {
  if (!lexStatus) return;
  lexStatus.textContent = msg;
  lexStatus.hidden = !msg;
  lexStatus.classList.toggle('lex-status-error', isError);
}

async function lookupWord(word) {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`lookup failed: ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : null;
}

function renderLexPreview(word, entries) {
  if (!lexPreview) return;
  // Pull up to 3 definitions across part-of-speech buckets
  const rows = [];
  outer: for (const entry of entries) {
    for (const meaning of (entry.meanings || [])) {
      for (const def of (meaning.definitions || [])) {
        rows.push({ pos: meaning.partOfSpeech || '', def: def.definition || '' });
        if (rows.length >= 3) break outer;
      }
    }
  }
  if (!rows.length) {
    lexPreview.innerHTML = '<div class="lex-def">no definition found — save the word anyway?</div>';
  } else {
    lexPreview.innerHTML = rows.map(r =>
      `<div class="lex-def">${r.pos ? `<span class="lex-pos">${escapeHtml(r.pos)}</span>` : ''}${escapeHtml(r.def)}</div>`
    ).join('');
  }
  lexPreview.hidden = false;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

async function queueWord() {
  const word = lexInput.value.trim().toLowerCase();
  if (!word) {
    setLexStatus('type a word first', true);
    return;
  }
  setLexStatus('looking up…');
  try {
    const entries = await lookupWord(word);
    const definition = flattenDefinitions(entries);
    lexQueue.push({ word, definition, timestamp: new Date().toISOString() });
    updateLexQueueCount();
    renderLexPreview(word, entries);
    setLexStatus(entries && entries.length ? `pinned: ${word}` : `pinned: ${word} (no definition)`);
    lexInput.value = '';
    lexInput.focus();
  } catch (err) {
    console.error(err);
    setLexStatus('lookup failed — try again', true);
  }
}

async function commitQueue() {
  if (lexInput.value.trim()) {
    await queueWord();
  }
  if (lexQueue.length === 0) {
    setLexStatus('type a word first', true);
    return;
  }
  if (lexEnter) lexEnter.disabled = true;
  if (lexAdd) lexAdd.disabled = true;
  setLexStatus(`saving ${lexQueue.length}…`);
  try {
    for (const entry of lexQueue) {
      await saveLexiconEntry({ type: 'lexicon', ...entry });
    }
    const n = lexQueue.length;
    setLexStatus(`saved ${n} ${n === 1 ? 'word' : 'words'}`);
    lexQueue = [];
    updateLexQueueCount();
    setTimeout(closeLexModal, 800);
  } catch (err) {
    console.error(err);
    setLexStatus("couldn't save — try again", true);
  } finally {
    if (lexEnter) lexEnter.disabled = false;
    if (lexAdd) lexAdd.disabled = false;
  }
}

async function saveLexiconEntry(entry) {
  // Always cache locally so nothing's ever lost
  try {
    const local = JSON.parse(localStorage.getItem(LEXICON_LOCAL_KEY) || '[]');
    local.push(entry);
    localStorage.setItem(LEXICON_LOCAL_KEY, JSON.stringify(local));
  } catch {}
  if (BRAINDRAIN_API_URL) {
    const res = await fetch(BRAINDRAIN_API_URL, {
      method: 'POST',
      body: JSON.stringify(entry),
    });
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
  }
}

if (lexInput) {
  lexInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      queueWord();
    } else if (e.key === 'Escape') {
      closeLexModal();
    }
  });
}
if (lexAdd) lexAdd.addEventListener('click', queueWord);
if (lexEnter) lexEnter.addEventListener('click', commitQueue);
if (lexClose) lexClose.addEventListener('click', closeLexModal);
if (lexBackdrop) lexBackdrop.addEventListener('click', closeLexModal);

async function saveEntry(entry) {
  if (BRAINDRAIN_API_URL) {
    const res = await fetch(BRAINDRAIN_API_URL, {
      method: 'POST',
      body: JSON.stringify(entry),
    });
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
    return;
  }
  const existing = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
  existing.push(entry);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(existing));
}
