/* studio uploader page — making/walking entries
   posts to the apps script backend (see apps-script.gs for setup).
   URL is configured in ../studio-config.js (shared with homepage).

   modes: "making" / "walking" (create) and "manage" (edit/delete existing).
   editing + deleting require the v2 backend (apps-script.gs). the manage
   view checks apiVersion and stays read-only against an older backend so it
   can never misfire a destructive request at a server that can't handle it. */

(function () {
  const STUDIO_API_URL = window.STUDIO_API_URL || '';

  const body = document.body;
  const tabs = document.querySelectorAll('.mode-tab');
  const form = document.getElementById('entry-form');
  const dateInput = document.getElementById('date-input');
  const photoInput = document.getElementById('photo-input');
  const uploadZone = document.querySelector('.upload-zone');
  const previews = document.getElementById('photo-previews');
  const status = document.getElementById('form-status');
  const publishBtn = form.querySelector('.publish-btn');
  const stateInput = document.getElementById('state-input');

  const managePanel = document.getElementById('manage-panel');
  const manageList = document.getElementById('manage-list');
  const manageStatus = document.getElementById('manage-status');
  const editBanner = document.getElementById('edit-banner');
  const cancelEditBtn = document.getElementById('cancel-edit');

  // -- state --------------------------------------------------------
  let pendingFiles = [];       // NEW photos to add: { file, dataUrl }
  let keptPhotos = [];         // existing photos kept while editing: { id, url }
  let editing = null;          // null = creating; { type, timestamp } = editing
  let backendVersion = null;   // apiVersion reported by the backend (null=unknown)

  // -- mode tabs (making / walking / manage) ------------------------
  function setMode(mode) {
    body.dataset.mode = mode;
    tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    const isManage = mode === 'manage';
    form.hidden = isManage;
    managePanel.hidden = !isManage;
    try { localStorage.setItem('studio-mode', mode); } catch (e) {}
    if (isManage) loadManage();
  }
  tabs.forEach(t => t.addEventListener('click', () => {
    // leaving an in-progress edit by clicking a tab cancels it
    if (editing && t.dataset.mode !== editing.type) resetEditingState();
    setMode(t.dataset.mode);
  }));
  let savedMode = 'making';
  try { savedMode = localStorage.getItem('studio-mode') || 'making'; } catch (e) {}
  setMode(['walking', 'manage'].indexOf(savedMode) !== -1 ? savedMode : 'making');

  // -- populate state dropdown (walking) ----------------------------
  const US_STATES = [
    ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],
    ['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],
    ['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],
    ['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],
    ['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
    ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],
    ['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],
    ['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],
    ['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],
    ['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
    ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],
    ['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],
    ['WI','Wisconsin'],['WY','Wyoming'],
  ];
  if (stateInput) {
    US_STATES.forEach(([code, name]) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = name.toLowerCase();
      stateInput.appendChild(opt);
    });
  }

  // -- photo previews (kept existing + new pending) -----------------
  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // downscale + re-encode before upload. phone photos are 4-8MB each and the
  // backend chokes on multi-photo payloads that big ("failed" uploads from
  // mobile); the site never displays wider than ~1200px, so 2000px is plenty.
  const MAX_UPLOAD_DIM = 2000;
  async function fileToDataUrl(file) {
    const original = await readFileAsDataUrl(file);
    try {
      const img = await loadImage(original);
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) return original;
      const scale = Math.min(1, MAX_UPLOAD_DIM / Math.max(w, h));
      const alreadySmallJpeg = scale === 1 && /^data:image\/jpe?g/i.test(original) && original.length < 2500000;
      if (alreadySmallJpeg) return original;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const out = canvas.toDataURL('image/jpeg', 0.85);
      // if re-encoding somehow made it bigger, keep the smaller one
      return out.length < original.length ? out : original;
    } catch (e) {
      return original; // decoding failed — send as-is rather than block her
    }
  }

  function photoIdFromUrl(url) {
    const m = String(url).match(/\/d\/([^=/?]+)/);
    return m ? m[1] : '';
  }

  function makePreview(src, alt, onRemove) {
    const wrap = document.createElement('div');
    wrap.className = 'photo-preview';
    const img = document.createElement('img');
    img.alt = alt || '';
    img.src = src;
    wrap.appendChild(img);
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'photo-preview-remove';
    rm.textContent = '×';
    rm.title = 'remove';
    rm.addEventListener('click', onRemove);
    wrap.appendChild(rm);
    return wrap;
  }

  function renderPreviews() {
    previews.innerHTML = '';
    keptPhotos.forEach((p, idx) => {
      previews.appendChild(makePreview(p.url, 'existing photo', () => {
        keptPhotos.splice(idx, 1);
        renderPreviews();
      }));
    });
    pendingFiles.forEach((entry, idx) => {
      previews.appendChild(makePreview(entry.dataUrl, entry.file.name, () => {
        pendingFiles.splice(idx, 1);
        renderPreviews();
      }));
    });
  }

  async function addFiles(fileList) {
    const imgs = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    for (const f of imgs) {
      try {
        const dataUrl = await fileToDataUrl(f);
        pendingFiles.push({ file: f, dataUrl });
      } catch (e) {
        console.error('failed to read', f.name, e);
      }
    }
    renderPreviews();
  }

  photoInput.addEventListener('change', e => addFiles(e.target.files));
  ['dragenter', 'dragover'].forEach(evt => {
    uploadZone.addEventListener(evt, e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(evt => {
    uploadZone.addEventListener(evt, e => { e.preventDefault(); uploadZone.classList.remove('dragover'); });
  });
  uploadZone.addEventListener('drop', e => {
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  // -- editing state helpers ----------------------------------------
  function resetEditingState() {
    editing = null;
    keptPhotos = [];
    pendingFiles = [];
    editBanner.hidden = true;
    publishBtn.textContent = 'publish';
    status.className = 'form-status';
    status.textContent = '';
    form.reset();
    if (stateInput) stateInput.value = '';
    renderPreviews();
  }

  cancelEditBtn.addEventListener('click', () => {
    resetEditingState();
    setMode('manage');
  });

  function startEdit(entry) {
    editing = { type: entry.type, timestamp: entry.timestamp };
    setMode(entry.type);
    // pre-fill the form
    dateInput.value = entry.date || '';
    form.querySelector('#caption-input').value = entry.caption || '';
    form.querySelector('#link-input').value = entry.link || '';
    const archBox = document.getElementById('archive-only-input');
    if (archBox) archBox.checked = !!entry.archiveOnly;
    if (stateInput) stateInput.value = entry.state || '';
    keptPhotos = (entry.photoUrls || []).map(url => ({ id: photoIdFromUrl(url), url }));
    pendingFiles = [];
    renderPreviews();
    editBanner.hidden = false;
    publishBtn.textContent = 'save changes';
    status.className = 'form-status';
    status.textContent = '';
    window.scrollTo(0, 0);
  }

  // -- backend calls ------------------------------------------------
  function postJson(payload) {
    // text/plain avoids the CORS preflight; the apps script still JSON.parses it
    return fetch(STUDIO_API_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    }).then(r => r.json());
  }

  async function fetchType(type) {
    const url = STUDIO_API_URL + '?type=' + encodeURIComponent(type) + '&limit=500&t=' + Date.now();
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    if (typeof data.apiVersion === 'number') backendVersion = data.apiVersion;
    const entries = Array.isArray(data.entries) ? data.entries : [];
    entries.forEach(e => { e.type = type; });
    return entries;
  }

  // check the backend version on demand (used to gate newer features)
  async function ensureBackendVersion() {
    if (backendVersion !== null) return backendVersion;
    try {
      const res = await fetch(STUDIO_API_URL + '?type=making&limit=1&t=' + Date.now(), { cache: 'no-store' });
      const data = await res.json();
      if (typeof data.apiVersion === 'number') backendVersion = data.apiVersion;
    } catch (e) {}
    return backendVersion;
  }

  // -- manage view --------------------------------------------------
  async function loadManage() {
    if (!STUDIO_API_URL) {
      manageStatus.hidden = false;
      manageStatus.textContent = 'backend not connected yet.';
      manageList.innerHTML = '';
      return;
    }
    manageStatus.hidden = false;
    manageStatus.textContent = 'loading your entries…';
    manageList.innerHTML = '';
    try {
      const [making, walking] = await Promise.all([fetchType('making'), fetchType('walking')]);
      const all = making.concat(walking).sort((a, b) =>
        String(b.timestamp).localeCompare(String(a.timestamp)));
      renderManage(all);
    } catch (err) {
      manageStatus.hidden = false;
      manageStatus.textContent = 'could not load entries: ' + (err.message || err);
    }
  }

  function renderManage(entries) {
    const canEdit = backendVersion >= 2;
    manageList.innerHTML = '';
    if (!canEdit) {
      manageStatus.hidden = false;
      manageStatus.innerHTML = 'this list is read-only until the backend update is switched on. ' +
        'editing + deleting are built and ready — they just need the one-time redeploy.';
    } else if (!entries.length) {
      manageStatus.hidden = false;
      manageStatus.textContent = 'no entries yet.';
      return;
    } else {
      manageStatus.hidden = true;
    }

    entries.forEach(entry => {
      const card = document.createElement('article');
      card.className = 'manage-card';

      const thumbs = document.createElement('div');
      thumbs.className = 'manage-thumbs';
      (entry.photoUrls || []).slice(0, 4).forEach(url => {
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        img.loading = 'lazy';
        thumbs.appendChild(img);
      });
      if (!(entry.photoUrls || []).length) {
        const none = document.createElement('div');
        none.className = 'manage-nophoto';
        none.textContent = 'no photo';
        thumbs.appendChild(none);
      }
      card.appendChild(thumbs);

      const meta = document.createElement('div');
      meta.className = 'manage-meta';
      const badge = entry.type === 'walking'
        ? (entry.state ? 'walking · ' + entry.state : 'walking') : 'making';
      const dateStr = window.studioFormatDate ? window.studioFormatDate(entry.date) : (entry.date || '');
      meta.innerHTML =
        '<div class="manage-tags"><span class="manage-badge manage-badge-' + entry.type + '">' + badge + '</span>' +
        (entry.archiveOnly ? '<span class="manage-badge manage-badge-archive">archive</span>' : '') +
        (dateStr ? '<span class="manage-date">' + dateStr + '</span>' : '') + '</div>' +
        '<div class="manage-caption">' +
          (window.studioRenderCaption ? window.studioRenderCaption(entry.caption || '') : (entry.caption || '')) +
        '</div>';
      card.appendChild(meta);

      if (canEdit) {
        const actions = document.createElement('div');
        actions.className = 'manage-actions';
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'manage-edit';
        editBtn.textContent = 'edit';
        editBtn.addEventListener('click', () => startEdit(entry));
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'manage-delete';
        delBtn.textContent = 'delete';
        delBtn.addEventListener('click', () => removeEntry(entry, card));
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        card.appendChild(actions);
      }

      manageList.appendChild(card);
    });
  }

  async function removeEntry(entry, card) {
    if (!window.confirm('delete this entry? this also removes its photos and can’t be undone.')) return;
    card.classList.add('busy');
    try {
      const json = await postJson({ action: 'delete', type: entry.type, timestamp: entry.timestamp });
      if (json.ok) card.remove();
      else throw new Error(json.error || 'unknown error');
    } catch (err) {
      card.classList.remove('busy');
      window.alert('delete failed: ' + (err.message || err));
    }
  }

  // -- submit (create OR update) ------------------------------------
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const mode = editing ? editing.type : body.dataset.mode;

    const archiveOnly = !!fd.get('archiveOnly');
    const base = {
      type: mode,
      date: fd.get('date') || '',
      caption: fd.get('caption') || '',
      link: mode === 'walking' ? (fd.get('link') || '') : '',
      state: mode === 'walking' ? (fd.get('state') || '') : '',
      archiveOnly: archiveOnly ? 'yes' : '',
      photos: pendingFiles.map(p => p.dataUrl),
    };

    if (!STUDIO_API_URL) {
      console.log('[studio] preview only (no backend yet):', base);
      status.className = 'form-status';
      status.textContent = 'backend not connected yet — see apps-script.gs setup steps.';
      return;
    }

    if (editing && backendVersion !== null && backendVersion < 2) {
      status.className = 'form-status error';
      status.textContent = 'editing needs the backend update (redeploy apps-script.gs).';
      return;
    }

    // straight-to-archive needs the v3 backend — block rather than silently
    // publishing an entry that would take over the homepage
    if (archiveOnly) {
      const v = await ensureBackendVersion();
      if (v !== null && v < 3) {
        status.className = 'form-status error';
        status.textContent = '"straight to archive" needs the backend update — redeploy apps-script.gs first (30 seconds).';
        return;
      }
    }

    publishBtn.disabled = true;
    status.className = 'form-status';
    status.textContent = editing ? 'saving…' : 'publishing…';

    try {
      let payload = base;
      if (editing) {
        payload = Object.assign({}, base, {
          action: 'update',
          timestamp: editing.timestamp,
          keepPhotoIds: keptPhotos.map(p => p.id).filter(Boolean),
        });
      }
      const json = await postJson(payload);
      if (json.ok) {
        if (editing) {
          status.className = 'form-status success';
          status.textContent = 'saved!';
          resetEditingState();
          setMode('manage');
        } else {
          status.className = 'form-status success';
          status.textContent = `published! ${json.photoCount} photo(s) uploaded.`;
          form.querySelector('#caption-input').value = '';
          form.querySelector('#link-input').value = '';
          if (stateInput) stateInput.value = '';
          dateInput.value = '';
          const archBox = document.getElementById('archive-only-input');
          if (archBox) archBox.checked = false;
          pendingFiles = [];
          renderPreviews();
        }
      } else {
        throw new Error(json.error || 'unknown error');
      }
    } catch (err) {
      status.className = 'form-status error';
      status.textContent = 'failed: ' + (err.message || err);
      console.error(err);
    } finally {
      publishBtn.disabled = false;
    }
  });
})();
