// Stub: actual lexicon fetch from Apps Script will be wired up next.
// For now this just clears the loading state.
(() => {
  const body = document.getElementById('lexicon-body');
  if (!body) return;
  body.innerHTML = '<p class="archive-empty">your lexicon will live here — no words yet</p>';
})();
