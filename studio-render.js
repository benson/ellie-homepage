/* shared helpers for rendering entries on homepage + archive pages */

(function () {
  // tiny markdown renderer — bold, italic, links, line breaks
  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  window.studioRenderCaption = function (md) {
    if (!md) return '';
    let s = escapeHtml(md);
    // [text](url) — must come before bold/italic to avoid eating brackets
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener" class="craft-link">$1</a>');
    // **bold** (greedy not allowed — non-asterisk runs)
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // *italic*
    s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    // line breaks
    s = s.replace(/\r?\n/g, '<br>');
    return s;
  };

  // fetch entries from the studio backend.
  // type: 'making' | 'walking'. limit: optional number (defaults to 1).
  // returns a promise of an array of entries, or [] on any error.
  window.studioFetchEntries = async function (type, limit) {
    if (!window.STUDIO_API_URL) return [];
    // cache-buster + no-store: without these, browsers re-serve a cached
    // response and pages keep showing pre-edit entries
    const url = window.STUDIO_API_URL +
      '?type=' + encodeURIComponent(type) +
      '&limit=' + encodeURIComponent(limit || 1) +
      '&t=' + Date.now();
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.entries) ? data.entries : [];
    } catch (err) {
      console.warn('[studio] fetch failed for', type, err);
      return [];
    }
  };

  // format an ISO date string as 'mmm d, yyyy' lowercase ('april 16, 2026')
  window.studioFormatDate = function (dateStr) {
    if (!dateStr) return '';
    // handle YYYY-MM-DD or full ISO timestamp
    const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
      ? new Date(dateStr + 'T12:00:00')
      : new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr).toLowerCase();
    const months = ['january','february','march','april','may','june',
                    'july','august','september','october','november','december'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  };
})();
