const BRAINDRAIN_API_URL = 'https://script.google.com/macros/s/AKfycbygsC3wKaB2dps8ghda6Abyte2gCgdgTLqSbKqG7iXJtR9JVMUAuqZEeLPcxkBnuqjM/exec';
const LOCAL_KEY = 'braindrain.entries';
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
