/* walking map — a US states map that drops a pin per hike on its state.
   loads us-states.svg, places pins at each hike's state (scattered), and
   opens a card with photos / caption / alltrails link when a pin is clicked. */

(function () {
  const type = document.body.dataset.type || 'walking';
  const mapWrap = document.getElementById('walk-map');
  const empty = document.getElementById('walk-empty');
  if (!mapWrap) return;

  const STATE_NAMES = {
    AL:'alabama',AK:'alaska',AZ:'arizona',AR:'arkansas',CA:'california',
    CO:'colorado',CT:'connecticut',DE:'delaware',FL:'florida',GA:'georgia',
    HI:'hawaii',ID:'idaho',IL:'illinois',IN:'indiana',IA:'iowa',KS:'kansas',
    KY:'kentucky',LA:'louisiana',ME:'maine',MD:'maryland',MA:'massachusetts',
    MI:'michigan',MN:'minnesota',MS:'mississippi',MO:'missouri',MT:'montana',
    NE:'nebraska',NV:'nevada',NH:'new hampshire',NJ:'new jersey',NM:'new mexico',
    NY:'new york',NC:'north carolina',ND:'north dakota',OH:'ohio',OK:'oklahoma',
    OR:'oregon',PA:'pennsylvania',RI:'rhode island',SC:'south carolina',
    SD:'south dakota',TN:'tennessee',TX:'texas',UT:'utah',VT:'vermont',
    VA:'virginia',WA:'washington',WV:'west virginia',WI:'wisconsin',WY:'wyoming',
  };
  const SVGNS = 'http://www.w3.org/2000/svg';

  // ---- pin popup card (built once) ----
  const pop = document.createElement('div');
  pop.className = 'walk-pop';
  pop.hidden = true;
  pop.innerHTML =
    '<div class="walk-pop-card">' +
      '<button type="button" class="walk-pop-close" aria-label="close">&times;</button>' +
      '<div class="walk-pop-state"></div>' +
      '<div class="walk-pop-date"></div>' +
      '<div class="walk-pop-photos"></div>' +
      '<p class="walk-pop-caption"></p>' +
      '<div class="walk-pop-link"></div>' +
    '</div>';
  document.body.appendChild(pop);
  const popCard = pop.querySelector('.walk-pop-card');
  pop.addEventListener('click', e => { if (e.target === pop) closePop(); });
  pop.querySelector('.walk-pop-close').addEventListener('click', closePop);
  document.addEventListener('keydown', e => { if (!pop.hidden && e.key === 'Escape') closePop(); });

  function closePop() { pop.hidden = true; document.body.classList.remove('walk-pop-open'); }

  function openPop(entry) {
    pop.querySelector('.walk-pop-state').textContent = STATE_NAMES[entry.state] || '';
    const d = window.studioFormatDate(entry.date);
    pop.querySelector('.walk-pop-date').textContent = d || '';
    const photosEl = pop.querySelector('.walk-pop-photos');
    const photos = entry.photoUrls || [];
    const capHtml = window.studioRenderCaption(entry.caption);
    photosEl.className = 'walk-pop-photos' + (photos.length > 1 ? ' photo-pile' : '');
    photosEl.innerHTML = photos
      .map(u => '<img class="walk-pop-photo" src="' + u + '" alt="" loading="lazy">').join('');
    photosEl.hidden = !photos.length;
    // click any photo (incl. ones stacked underneath) to open the slideshow
    const lbList = photos.map(u => ({ src: u, captionHtml: capHtml }));
    Array.prototype.forEach.call(photosEl.querySelectorAll('.walk-pop-photo'), (im, i) => {
      im.addEventListener('click', () => window.openPhotoLightbox(lbList, i));
    });
    const capEl = pop.querySelector('.walk-pop-caption');
    capEl.innerHTML = capHtml;
    capEl.hidden = !entry.caption;
    const linkEl = pop.querySelector('.walk-pop-link');
    linkEl.innerHTML = entry.link
      ? '<a class="archive-link" href="' + entry.link + '" target="_blank" rel="noopener">alltrails &#8599;</a>'
      : '';
    pop.hidden = false;
    document.body.classList.add('walk-pop-open');
  }

  // deterministic scatter offset for the i-th pin within a state
  function scatter(i, spread) {
    if (i === 0) return [0, 0];
    const golden = 2.399963; // radians
    const a = i * golden;
    const r = spread * Math.sqrt(i) * 0.5;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }

  function placePins(svg, entries) {
    // group entries by state, preserving order (newest first from backend)
    const byState = {};
    entries.forEach(e => {
      const s = (e.state || '').toUpperCase();
      if (!s) return;
      (byState[s] = byState[s] || []).push(e);
    });

    const pinLayer = document.createElementNS(SVGNS, 'g');
    pinLayer.setAttribute('class', 'walk-pins');
    svg.appendChild(pinLayer);

    Object.keys(byState).forEach(state => {
      const path = svg.querySelector('#' + state);
      if (!path) return;
      const bb = path.getBBox();
      const cx = bb.x + bb.width / 2;
      const cy = bb.y + bb.height / 2;
      const spread = Math.min(bb.width, bb.height) * 0.6;
      byState[state].forEach((entry, i) => {
        const [dx, dy] = scatter(i, spread);
        const g = document.createElementNS(SVGNS, 'g');
        g.setAttribute('class', 'walk-pin');
        g.setAttribute('transform', 'translate(' + (cx + dx) + ',' + (cy + dy) + ')');
        const c = document.createElementNS(SVGNS, 'circle');
        c.setAttribute('r', '6');
        g.appendChild(c);
        g.addEventListener('click', () => openPop(entry));
        pinLayer.appendChild(g);
      });
    });
  }

  (async function load() {
    let svgText;
    try {
      const res = await fetch('us-states.svg');
      svgText = await res.text();
    } catch (e) {
      mapWrap.innerHTML = '<p class="archive-empty">couldn\'t load the map.</p>';
      return;
    }
    mapWrap.innerHTML = svgText;
    const svg = mapWrap.querySelector('svg');

    const entries = window.STUDIO_API_URL
      ? await window.studioFetchEntries(type, 500)
      : [];

    window.renderWalkMap = list => {
      svg.querySelectorAll('.walk-pins').forEach(n => n.remove());
      placePins(svg, list || []);
      if (empty) empty.hidden = (list || []).some(e => e.state);
    };
    window.renderWalkMap(entries);
  })();
})();
