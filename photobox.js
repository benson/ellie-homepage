/* shared photo slideshow used by the homepage, making gallery, and walking map.
   window.openPhotoLightbox(photos, startIndex) where photos is
   [{ src, caption?, captionHtml? }]. click a photo anywhere to open; arrows /
   ← → keys to move; esc, × or backdrop-click to close. matches the rest
   energy slideshow look (photobox.css). */

(function () {
  let lb, img, capEl, countEl, prevBtn, nextBtn, zoom;
  let photos = [];
  let idx = 0;
  let built = false;

  function build() {
    if (built) return;
    lb = document.createElement('div');
    lb.className = 'pb-lightbox';
    lb.hidden = true;
    lb.innerHTML =
      '<button type="button" class="pb-close" aria-label="close">&times;</button>' +
      '<button type="button" class="pb-nav pb-prev" aria-label="previous"><svg viewBox="0 0 20 24" aria-hidden="true"><path d="M16 2 4 12l12 10z"/></svg></button>' +
      '<figure class="pb-figure">' +
        '<img class="pb-img" src="" alt="">' +
        '<figcaption class="pb-cap">' +
          '<span class="pb-caption"></span>' +
          '<span class="pb-count"></span>' +
        '</figcaption>' +
      '</figure>' +
      '<button type="button" class="pb-nav pb-next" aria-label="next"><svg viewBox="0 0 20 24" aria-hidden="true"><path d="M4 2l12 10L4 22z"/></svg></button>';
    document.body.appendChild(lb);

    img = lb.querySelector('.pb-img');
    capEl = lb.querySelector('.pb-caption');
    countEl = lb.querySelector('.pb-count');
    prevBtn = lb.querySelector('.pb-prev');
    nextBtn = lb.querySelector('.pb-next');

    zoom = window.attachPhotoZoom ? window.attachPhotoZoom({ lb: lb, img: img }) : null;

    lb.querySelector('.pb-close').addEventListener('click', close);
    prevBtn.addEventListener('click', e => { e.stopPropagation(); step(-1); });
    nextBtn.addEventListener('click', e => { e.stopPropagation(); step(1); });
    lb.addEventListener('click', e => { if (e.target === lb) close(); });
    // capture phase + stopPropagation so esc closes the slideshow first, not a
    // popup/map underneath it
    document.addEventListener('keydown', e => {
      if (lb.hidden) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (zoom && zoom.isExpanded()) zoom.collapse(); else close();
      }
      else if (e.key === 'ArrowLeft') { step(-1); }
      else if (e.key === 'ArrowRight') { step(1); }
    }, true);

    built = true;
  }

  function update() {
    const p = photos[idx] || {};
    if (zoom) zoom.reset();          // a new photo always starts at 100%
    img.src = p.src || '';
    if (p.captionHtml) { capEl.innerHTML = p.captionHtml; capEl.hidden = false; }
    else if (p.caption) { capEl.textContent = p.caption; capEl.hidden = false; }
    else { capEl.textContent = ''; capEl.hidden = true; }
    const multi = photos.length > 1;
    countEl.textContent = multi ? (idx + 1) + ' / ' + photos.length : '';
    prevBtn.style.display = multi ? '' : 'none';
    nextBtn.style.display = multi ? '' : 'none';
  }

  function step(delta) {
    if (!photos.length) return;
    idx = (idx + delta + photos.length) % photos.length;
    update();
  }

  function close() {
    if (!lb) return;
    if (zoom) { zoom.collapse(); zoom.reset(); }
    lb.hidden = true;
    document.body.classList.remove('pb-open');
    img.src = '';
  }

  window.openPhotoLightbox = function (list, startIndex) {
    build();
    photos = Array.isArray(list) ? list : [];
    if (!photos.length) return;
    idx = Math.min(Math.max(startIndex || 0, 0), photos.length - 1);
    update();
    lb.hidden = false;
    document.body.classList.add('pb-open');
  };
  window.closePhotoLightbox = close;
})();
