/* studio uploader page — making/walking entries
   posts to the apps script backend (see apps-script.gs for setup). */

// PASTE THE DEPLOYED APPS SCRIPT /exec URL HERE once you've deployed it.
// e.g. 'https://script.google.com/macros/s/AKfycb.../exec'
const STUDIO_API_URL = '';

(function () {
  const body = document.body;
  const tabs = document.querySelectorAll('.mode-tab');
  const form = document.getElementById('entry-form');
  const dateInput = document.getElementById('date-input');
  const photoInput = document.getElementById('photo-input');
  const uploadZone = document.querySelector('.upload-zone');
  const previews = document.getElementById('photo-previews');
  const status = document.getElementById('form-status');
  const publishBtn = form.querySelector('.publish-btn');

  // -- mode tabs (making / walking) ---------------------------------
  function setMode(mode) {
    body.dataset.mode = mode;
    tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    try { localStorage.setItem('studio-mode', mode); } catch (e) {}
  }
  tabs.forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode)));
  let savedMode = 'making';
  try { savedMode = localStorage.getItem('studio-mode') || 'making'; } catch (e) {}
  setMode(savedMode === 'walking' ? 'walking' : 'making');

  // -- default date to today ----------------------------------------
  const today = new Date();
  dateInput.value = today.toISOString().slice(0, 10);

  // -- photo upload (file input + drag/drop) ------------------------
  // pendingFiles holds { file, dataUrl } — we pre-read to base64 so submit is fast.
  let pendingFiles = [];

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  function renderPreviews() {
    previews.innerHTML = '';
    pendingFiles.forEach((entry, idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'photo-preview';
      const img = document.createElement('img');
      img.alt = entry.file.name;
      img.src = entry.dataUrl;
      wrap.appendChild(img);

      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'photo-preview-remove';
      rm.textContent = '×';
      rm.title = 'remove';
      rm.addEventListener('click', () => {
        pendingFiles.splice(idx, 1);
        renderPreviews();
      });
      wrap.appendChild(rm);
      previews.appendChild(wrap);
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
    uploadZone.addEventListener(evt, e => {
      e.preventDefault();
      uploadZone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(evt => {
    uploadZone.addEventListener(evt, e => {
      e.preventDefault();
      uploadZone.classList.remove('dragover');
    });
  });
  uploadZone.addEventListener('drop', e => {
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  // -- submit -------------------------------------------------------
  form.addEventListener('submit', async e => {
    e.preventDefault();

    const fd = new FormData(form);
    const mode = body.dataset.mode;
    const payload = {
      type: mode,
      date: fd.get('date'),
      caption: fd.get('caption') || '',
      link: mode === 'walking' ? (fd.get('link') || '') : '',
      photos: pendingFiles.map(p => p.dataUrl),
    };

    if (!STUDIO_API_URL) {
      console.log('[studio] preview only (no backend yet):', payload);
      status.className = 'form-status';
      status.textContent = 'backend not connected yet — see apps-script.gs setup steps.';
      return;
    }

    publishBtn.disabled = true;
    status.className = 'form-status';
    status.textContent = 'publishing…';

    try {
      // NOTE: apps script web apps don't honor custom content-type from browsers
      // (CORS-ish quirk). Sending as text/plain bypasses the preflight and the
      // script still parses e.postData.contents as JSON.
      const res = await fetch(STUDIO_API_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      });
      const json = await res.json();
      if (json.ok) {
        status.className = 'form-status success';
        status.textContent = `published! ${json.photoCount} photo(s) uploaded.`;
        // reset form for next entry
        form.querySelector('#caption-input').value = '';
        form.querySelector('#link-input').value = '';
        pendingFiles = [];
        renderPreviews();
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
