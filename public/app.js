const fileInput = document.getElementById('file-input');
const pickButton = document.getElementById('pick-button');
const fileList = document.getElementById('file-list');
const uploadButton = document.getElementById('upload-button');
const nameInput = document.getElementById('uploader-name');
const captionInput = document.getElementById('caption-input');
const tagsRow = document.getElementById('tags-row');
const tagPillsEl = document.getElementById('tag-pills');

const stepPick = document.getElementById('step-pick');
const stepUploading = document.getElementById('step-uploading');
const stepDone = document.getElementById('step-done');
const stepError = document.getElementById('step-error');

const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const doneDetail = document.getElementById('done-detail');
const errorDetail = document.getElementById('error-detail');

const againButton = document.getElementById('again-button');
const retryButton = document.getElementById('retry-button');

// OneDrive upload-session chunk size: must be a multiple of 320 KiB
// (except the last chunk). 5 MiB is a good balance.
const CHUNK_SIZE = 5 * 1024 * 1024;

let chosenFiles = [];

function show(step) {
  [stepPick, stepUploading, stepDone, stepError].forEach((s) => s.classList.add('hidden'));
  step.classList.remove('hidden');
}

function refreshList() {
  fileList.innerHTML = '';
  chosenFiles.forEach((file, i) => {
    const li = document.createElement('li');
    li.dataset.index = String(i);
    li.innerHTML = `
      <span class="file-icon" aria-hidden="true">&#128247;</span>
      <span class="file-name"></span>
      <span class="file-status"></span>
    `;
    li.querySelector('.file-name').textContent = file.name;
    fileList.appendChild(li);
  });
  uploadButton.disabled = chosenFiles.length === 0;
}

fileInput.addEventListener('change', (e) => {
  const newFiles = Array.from(e.target.files || []);
  chosenFiles = chosenFiles.concat(newFiles);
  refreshList();
  fileInput.value = '';
});

pickButton.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

async function getUploadUrl(filename, takenAt) {
  const res = await fetch('/api/upload-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, takenAt }),
  });
  if (!res.ok) throw new Error('Could not start upload.');
  const data = await res.json();
  return data.uploadUrl;
}

function putChunk(uploadUrl, blob, start, end, total, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Range', `bytes ${start}-${end - 1}/${total}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(start + e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        let body = null;
        try { body = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch {}
        resolve(body);
      } else {
        reject(new Error(`Chunk failed (${xhr.status}): ${xhr.responseText.slice(0, 200)}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(blob);
  });
}

function fileTakenAt(file) {
  return file.lastModified
    ? new Date(file.lastModified).toISOString()
    : new Date().toISOString();
}

async function uploadOneFile(file, takenAt, onProgress) {
  const uploadUrl = await getUploadUrl(file.name, takenAt);
  const total = file.size;
  let offset = 0;
  let lastBody = null;
  while (offset < total) {
    const end = Math.min(offset + CHUNK_SIZE, total);
    const chunk = file.slice(offset, end);
    const body = await putChunk(uploadUrl, chunk, offset, end, total, onProgress);
    if (body && body.id) lastBody = body;
    offset = end;
  }
  return lastBody;
}

// Always called after upload so the file's real date (takenAt) is stored
// immediately — this makes the gallery show the correct date right away
// instead of briefly showing the upload date until OneDrive extracts EXIF.
async function saveMetadata(itemId, caption, tags, uploader, takenAt) {
  if (!itemId) return;
  try {
    await fetch('/api/set-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, caption, tags, uploader, takenAt }),
    });
  } catch (e) {
    console.warn('metadata save failed', e);
  }
}

uploadButton.addEventListener('click', async () => {
  if (chosenFiles.length === 0) return;
  show(stepUploading);
  progressBar.style.width = '2%';
  progressText.textContent = 'Getting ready...';

  const uploaderName = nameInput.value.trim();
  const caption = (captionInput?.value || '').trim();
  const tags = [...tagPillsEl.querySelectorAll('input[type="checkbox"]:checked')].map((cb) => cb.value);
  const totalBytes = chosenFiles.reduce((s, f) => s + f.size, 0);
  let bytesDoneBefore = 0;
  let succeeded = 0;
  let failed = 0;

  const noun = chosenFiles.length === 1 ? 'file' : 'files';
  for (let i = 0; i < chosenFiles.length; i++) {
    const file = chosenFiles[i];
    progressText.textContent = `Sending ${i + 1} of ${chosenFiles.length} ${noun}: ${file.name}`;
    try {
      const takenAt = fileTakenAt(file);
      const item = await uploadOneFile(file, takenAt, (uploadedInThisFile) => {
        const overall = bytesDoneBefore + uploadedInThisFile;
        const pct = Math.min(99, Math.round((overall / totalBytes) * 100));
        progressBar.style.width = pct + '%';
      });
      if (item?.id) await saveMetadata(item.id, caption, tags, uploaderName, takenAt);
      succeeded += 1;
    } catch (err) {
      console.error(err);
      failed += 1;
    }
    bytesDoneBefore += file.size;
  }

  progressBar.style.width = '100%';

  const noun2 = succeeded === 1 ? 'file' : 'files';
  if (succeeded > 0 && failed === 0) {
    doneDetail.textContent =
      succeeded === 1 ? 'We received 1 file.' : `We received all ${succeeded} files.`;
    show(stepDone);
  } else if (succeeded > 0) {
    doneDetail.textContent = `We received ${succeeded} of ${chosenFiles.length} ${noun2}. The rest did not send. You can try again.`;
    show(stepDone);
  } else {
    errorDetail.textContent = 'Your files could not be sent. Please check your internet and try again.';
    show(stepError);
  }
});

againButton.addEventListener('click', () => {
  chosenFiles = [];
  refreshList();
  progressBar.style.width = '0%';
  show(stepPick);
});

retryButton.addEventListener('click', () => {
  show(stepPick);
});

// ---------- PWA: install prompt + service worker ----------

const installBanner = document.getElementById('install-banner');
const installButton = document.getElementById('install-button');
const iosModal = document.getElementById('ios-install-modal');
const iosClose = document.getElementById('ios-install-close');

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// True when the app is embedded in another page (i.e. inside the website iframe).
// Members always use it embedded, so we never show the "install" prompt there.
function isEmbedded() {
  try { return window.self !== window.top; } catch (e) { return true; }
}

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!isStandalone() && !isEmbedded()) installBanner.classList.remove('hidden');
});

installButton.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') installBanner.classList.add('hidden');
    deferredPrompt = null;
  } else if (isIOS()) {
    iosModal.classList.remove('hidden');
  }
});

iosClose.addEventListener('click', () => {
  iosModal.classList.add('hidden');
});

iosModal.addEventListener('click', (e) => {
  if (e.target === iosModal) iosModal.classList.add('hidden');
});

window.addEventListener('appinstalled', () => {
  installBanner.classList.add('hidden');
  deferredPrompt = null;
});

if (isIOS() && !isStandalone() && !isEmbedded()) {
  installBanner.classList.remove('hidden');
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// ---------- Auto-resize: report content height to the parent (WordPress) page ----------
// Lets the embedding iframe grow to fit content so there's no scrolling inside the frame.
(function setupAutoResize() {
  function postHeight() {
    const h = Math.ceil(document.documentElement.scrollHeight);
    try { window.parent.postMessage({ type: 'wainui-height', height: h }, '*'); } catch (e) {}
  }
  window.addEventListener('load', postHeight);
  window.addEventListener('resize', postHeight);
  if (window.ResizeObserver) {
    new ResizeObserver(postHeight).observe(document.body);
  } else {
    setInterval(postHeight, 1000);
  }
  [300, 1200, 2500].forEach((t) => setTimeout(postHeight, t));

  // The parent (embed.js) requests our height once it's ready — answer immediately.
  window.addEventListener('message', (e) => {
    if (e && e.data && e.data.type === 'wainui-request-height') postHeight();
  });
})();

// ---------- Iframe-aware navigation ----------
// When embedded with ?galleryUrl=... the in-app "View Gallery" links
// navigate the PARENT window instead of the iframe, so the URL bar matches.
(function rewriteNavLinks() {
  const params = new URLSearchParams(window.location.search);
  const galleryUrl = params.get('galleryUrl');
  if (!galleryUrl) return;
  document.querySelectorAll('a[data-nav="gallery"]').forEach((a) => {
    a.href = galleryUrl;
    a.setAttribute('target', '_top');
  });
})();

// ---------- Tag pills (admin-controlled list) ----------
async function loadTagPills() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const { tags } = await res.json();
    if (!Array.isArray(tags) || tags.length === 0) return;
    tagPillsEl.innerHTML = tags.map((t, i) => `
      <label class="tag-pill">
        <input type="checkbox" value="${t.replace(/"/g, '&quot;')}" />
        <span>${t.replace(/</g, '&lt;')}</span>
      </label>
    `).join('');
    tagsRow.classList.remove('hidden');
  } catch (e) {
    console.warn('Could not load tag config', e);
  }
}
loadTagPills();
