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

  // listening shelf, worked out from the link. the gray label always says
  // what it is and where it lives: "album · spotify", "playlist · spotify",
  // "nts radio" (nts is the source, same as spotify; ellie's call).
  // (scripts/build-page.js runs these same functions when it bakes the shelf)
  const SOURCE_NAMES = /^(nts|nts radio|spotify|youtube|soundcloud|bandcamp|mixcloud|apple music)$/i;

  function parseUrl(item) {
    try { return new URL(item.url); } catch (e) { return null; }
  }
  function ntsShow(u) {
    const m = /\/shows\/([^/]+)/.exec(u.pathname);
    return m ? decodeURIComponent(m[1]).replace(/-/g, ' ') : '';
  }

  window.studioListeningTag = function (item) {
    const u = parseUrl(item);
    if (!u) return '';
    const host = u.hostname.replace(/^www\./, '');
    const p = u.pathname;
    let src = '', kind = '';
    if (/spotify\.com$/.test(host)) {
      src = 'spotify';
      kind = /\/album\//.test(p) ? 'album' : /\/playlist\//.test(p) ? 'playlist'
        : /\/track\//.test(p) ? 'song' : /\/(episode|show)\//.test(p) ? 'podcast' : '';
    } else if (/music\.apple\.com$/.test(host)) {
      src = 'apple music';
      kind = u.searchParams.get('i') || /\/song\//.test(p) ? 'song' : /\/album\//.test(p) ? 'album' : /\/playlist\//.test(p) ? 'playlist' : '';
    } else if (/bandcamp\.com$/.test(host)) {
      src = 'bandcamp';
      kind = /\/album\//.test(p) ? 'album' : /\/track\//.test(p) ? 'song' : '';
    } else if (/nts\.live$/.test(host)) {
      src = 'nts radio';
    } else if (/soundcloud\.com$/.test(host)) {
      src = 'soundcloud'; kind = /\/sets\//.test(p) ? 'playlist' : 'track';
    } else if (/mixcloud\.com$/.test(host)) {
      src = 'mixcloud'; kind = 'mix';
    } else if (/youtube\.com$|youtu\.be$/.test(host)) {
      src = 'youtube'; kind = /[?&]list=/.test(u.search) ? 'playlist' : '';
    } else {
      src = host.split('.').slice(-2, -1)[0] || host;
    }
    return [kind, src].filter(Boolean).join(' · ');
  };

  // the italic "who" line. the source never goes here (it's in the label);
  // for nts it's the show, read from the link (/shows/optimo/... -> optimo)
  window.studioListeningBy = function (item) {
    let by = String(item.by || '').trim().replace(/^playlist by\s+/i, '');
    if (SOURCE_NAMES.test(by)) by = '';
    const u = parseUrl(item);
    if (!by && u && /nts\.live$/.test(u.hostname)) by = ntsShow(u);
    return by;
  };

  // nts episode titles end in their broadcast date ("... 18th august 2026")
  // and often start with the show name ("optimo - ..."); ellie doesn't want
  // dates on the shelf, and the show is already on the "who" line
  const NTS_DATE = /[\s,\-–—]*\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}\s*$/i;
  window.studioListeningTitle = function (item) {
    let title = String(item.title || '').trim();
    const u = parseUrl(item);
    if (!u || !/nts\.live$/.test(u.hostname)) return title;
    title = title.replace(NTS_DATE, '').trim();
    const show = window.studioListeningBy(item).toLowerCase();
    if (show && title.toLowerCase().indexOf(show + ' - ') === 0) {
      const rest = title.slice(show.length + 3).trim();
      if (rest) title = rest;
    }
    return title;
  };
})();
