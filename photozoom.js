/* shared zoom + expand behaviour for both photo slideshows (the rest energy
   one in restenergy.js and the site-wide one in photobox.js).

   window.attachPhotoZoom({ lb, img }) -> { reset, isExpanded, collapse }

   zoom:   + / − buttons, scroll wheel, pinch, double-click. drag to pan once
           zoomed in. resets whenever the photo changes.
   expand: fills the screen and darkens the backdrop. asks for real fullscreen
           where the browser allows it, but the CSS state stands on its own so
           it still works on iPhones (which only ever go fullscreen for video). */

(function () {
  const MIN = 1, MAX = 5, STEP = 1.5, DBL = 2.5;

  const ICON_EXPAND =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6"/></svg>';
  const ICON_COLLAPSE =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h6V3M21 9h-6V3M3 15h6v6M21 15h-6v6"/></svg>';

  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }

  window.attachPhotoZoom = function (opts) {
    const lb = opts.lb, img = opts.img;
    if (!lb || !img) return null;

    let scale = 1, tx = 0, ty = 0, expanded = false;
    img.classList.add('pz-img');

    // ---- controls ----
    const bar = document.createElement('div');
    bar.className = 'pz-bar';
    bar.innerHTML =
      '<button type="button" class="pz-btn pz-out" aria-label="zoom out">&minus;</button>' +
      '<span class="pz-level">100%</span>' +
      '<button type="button" class="pz-btn pz-in" aria-label="zoom in">+</button>' +
      '<button type="button" class="pz-btn pz-expand" aria-label="expand to full screen">' + ICON_EXPAND + '</button>';
    lb.appendChild(bar);
    const outBtn = bar.querySelector('.pz-out');
    const inBtn = bar.querySelector('.pz-in');
    const level = bar.querySelector('.pz-level');
    const expandBtn = bar.querySelector('.pz-expand');
    bar.addEventListener('click', e => e.stopPropagation());   // never close the slideshow

    function apply() {
      img.style.transform = 'translate(' + tx + 'px, ' + ty + 'px) scale(' + scale + ')';
      lb.classList.toggle('pz-zoomed', scale > 1);
      level.textContent = Math.round(scale * 100) + '%';
      outBtn.disabled = scale <= MIN + 0.001;
      inBtn.disabled = scale >= MAX - 0.001;
    }

    // keep the photo from being dragged away into empty space
    function clampPan() {
      const cw = lb.clientWidth, ch = lb.clientHeight;
      const w = img.offsetWidth * scale, h = img.offsetHeight * scale;
      const maxX = Math.max(0, (w - cw) / 2 + 24);
      const maxY = Math.max(0, (h - ch) / 2 + 24);
      tx = Math.max(-maxX, Math.min(maxX, tx));
      ty = Math.max(-maxY, Math.min(maxY, ty));
    }

    // zoom about a point on screen, so whatever is under the cursor stays put
    function zoomAt(next, cx, cy) {
      next = Math.max(MIN, Math.min(MAX, next));
      if (next === scale) return;
      const r = img.getBoundingClientRect();
      const ox = (cx == null ? r.left + r.width / 2 : cx) - (r.left + r.width / 2);
      const oy = (cy == null ? r.top + r.height / 2 : cy) - (r.top + r.height / 2);
      const k = next / scale;
      tx -= ox * (k - 1);
      ty -= oy * (k - 1);
      scale = next;
      if (scale === MIN) { tx = 0; ty = 0; }
      clampPan();
      apply();
    }

    function reset() { scale = 1; tx = 0; ty = 0; apply(); }

    outBtn.addEventListener('click', () => zoomAt(scale / STEP));
    inBtn.addEventListener('click', () => zoomAt(scale * STEP));

    // ---- expand / fullscreen ----
    function setExpanded(on) {
      expanded = on;
      lb.classList.toggle('pz-expanded', on);
      expandBtn.innerHTML = on ? ICON_COLLAPSE : ICON_EXPAND;
      expandBtn.setAttribute('aria-label', on ? 'exit full screen' : 'expand to full screen');
      if (on) {
        const req = lb.requestFullscreen || lb.webkitRequestFullscreen;
        if (req) { try { const p = req.call(lb); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
      } else if (fsElement() === lb) {
        const ex = document.exitFullscreen || document.webkitExitFullscreen;
        if (ex) { try { const p = ex.call(document); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
      }
    }
    expandBtn.addEventListener('click', () => setExpanded(!expanded));

    // leaving fullscreen by any other route (esc, browser chrome) collapses too
    function onFsChange() { if (expanded && fsElement() !== lb) setExpanded(false); }
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);

    // ---- wheel ----
    lb.addEventListener('wheel', e => {
      e.preventDefault();
      zoomAt(scale * (e.deltaY < 0 ? 1.14 : 1 / 1.14), e.clientX, e.clientY);
    }, { passive: false });

    // ---- double-click / double-tap toggles a close-up ----
    img.addEventListener('dblclick', e => {
      e.preventDefault();
      zoomAt(scale > 1 ? MIN : DBL, e.clientX, e.clientY);
    });

    // ---- drag to pan, pinch to zoom ----
    const pts = new Map();
    let panning = false, lastX = 0, lastY = 0, moved = 0, pinchDist = 0;

    img.addEventListener('pointerdown', e => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const p = [...pts.values()];
        pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        panning = false;
        return;
      }
      if (scale <= 1) return;              // nothing to pan yet
      panning = true; moved = 0;
      lastX = e.clientX; lastY = e.clientY;
      img.classList.add('pz-dragging');
      try { img.setPointerCapture(e.pointerId); } catch (err) {}
    });

    img.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pts.size === 2) {
        const p = [...pts.values()];
        const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        if (pinchDist > 0) {
          zoomAt(scale * (d / pinchDist), (p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2);
        }
        pinchDist = d;
        return;
      }
      if (!panning) return;
      tx += e.clientX - lastX;
      ty += e.clientY - lastY;
      moved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
      lastX = e.clientX; lastY = e.clientY;
      clampPan();
      apply();
    });

    function endPointer(e) {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinchDist = 0;
      if (!panning) return;
      panning = false;
      img.classList.remove('pz-dragging');
      // a pan shouldn't register as a click (which would close the slideshow)
      if (moved > 6) {
        const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
        img.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => img.removeEventListener('click', swallow, true), 0);
      }
    }
    img.addEventListener('pointerup', endPointer);
    img.addEventListener('pointercancel', endPointer);

    apply();
    return {
      reset: reset,
      isExpanded: function () { return expanded; },
      collapse: function () { setExpanded(false); },
    };
  };
})();
