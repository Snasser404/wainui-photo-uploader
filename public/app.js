const fileInput = document.getElementById('file-input');
const pickButton = document.getElementById('pick-button');
const fileList = document.getElementById('file-list');
const uploadButton = document.getElementById('upload-button');
const nameInput = document.getElementById('uploader-name');

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

const SINGLE_UPLOAD_LIMIT = 140 * 1024 * 1024;
const CHUNK_SIZE = 16 * 1024 * 1024;
const DROPBOX_UPLOAD = 'https://content.dropboxapi.com/2/files/upload';
const DROPBOX_SESSION_START = 'https://content.dropboxapi.com/2/files/upload_session/start';
const DROPBOX_SESSION_APPEND = 'https://content.dropboxapi.com/2/files/upload_session/append_v2';
const DROPBOX_SESSION_FINISH = 'https://content.dropboxapi.com/2/files/upload_session/finish';

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

function asciifyArg(obj) {
  var re = new RegExp("[\u0080-\uFFFF]", "g");
  return JSON.stringify(obj).replace(re, function(c) {
    return "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4);
  });
}

async function getCredentials(uploaderName) {
  const res = await fetch('/api/dropbox-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploaderName }),
  });
  if (!res.ok) throw new Error('Could not start upload.');
  return res.json();
}

function uploadSingle(file, accessToken, dropboxPath, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', DROPBOX_UPLOAD);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader(
      'Dropbox-API-Arg',
      asciifyArg({
        path: dropboxPath,
        mode: 'add',
        autorename: true,
        mute: true,
        strict_conflict: false,
      })
    );
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText.slice(0, 200)}`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });
}

function chunkRequest(url, accessToken, argHeader, blob, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('Dropbox-API-Arg', argHeader);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.responseText ? JSON.parse(xhr.responseText) : null);
      } else {
        reject(new Error(`Chunk failed (${xhr.status}): ${xhr.responseText.slice(0, 200)}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(blob);
  });
}

async function uploadChunked(file, accessToken, dropboxPath, onProgress) {
  let offset = 0;
  let bytesDoneBefore = 0;
  const total = file.size;

  const firstChunk = file.slice(0, Math.min(CHUNK_SIZE, total));
  const startRes = await chunkRequest(
    DROPBOX_SESSION_START,
    accessToken,
    asciifyArg({ close: false }),
    firstChunk,
    (loaded) => onProgress(bytesDoneBefore + loaded)
  );
  const sessionId = startRes.session_id;
  offset = firstChunk.size;
  bytesDoneBefore = offset;

  while (offset < total) {
    const end = Math.min(offset + CHUNK_SIZE, total);
    const chunk = file.slice(offset, end);
    const isLast = end === total;

    if (isLast) {
      await chunkRequest(
        DROPBOX_SESSION_FINISH,
        accessToken,
        asciifyArg({
          cursor: { session_id: sessionId, offset },
          commit: {
            path: dropboxPath,
            mode: 'add',
            autorename: true,
            mute: true,
            strict_conflict: false,
          },
        }),
        chunk,
        (loaded) => onProgress(bytesDoneBefore + loaded)
      );
    } else {
      await chunkRequest(
        DROPBOX_SESSION_APPEND,
        accessToken,
        asciifyArg({ cursor: { session_id: sessionId, offset }, close: false }),
        chunk,
        (loaded) => onProgress(bytesDoneBefore + loaded)
      );
    }
    offset = end;
    bytesDoneBefore = offset;
  }
}

async function uploadOneFile(file, accessToken, folder, onProgress) {
  const path = `${folder}/${file.name}`;
  if (file.size <= SINGLE_UPLOAD_LIMIT) {
    return uploadSingle(file, accessToken, path, onProgress);
  }
  return uploadChunked(file, accessToken, path, onProgress);
}

uploadButton.addEventListener('click', async () => {
  if (chosenFiles.length === 0) return;
  show(stepUploading);
  progressBar.style.width = '2%';
  progressText.textContent = 'Getting ready...';

  const uploaderName = nameInput.value.trim();
  let creds;
  try {
    creds = await getCredentials(uploaderName);
  } catch (err) {
    errorDetail.textContent = 'Could not connect. Please check your internet and try again.';
    return show(stepError);
  }

  const totalBytes = chosenFiles.reduce((s, f) => s + f.size, 0);
  let bytesDoneBefore = 0;
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < chosenFiles.length; i++) {
    const file = chosenFiles[i];
    progressText.textContent = `Sending ${i + 1} of ${chosenFiles.length}: ${file.name}`;
    try {
      await uploadOneFile(file, creds.accessToken, creds.folder, (uploadedInThisFile) => {
        const overall = bytesDoneBefore + uploadedInThisFile;
        const pct = Math.min(99, Math.round((overall / totalBytes) * 100));
        progressBar.style.width = pct + '%';
      });
      succeeded += 1;
    } catch (err) {
      console.error(err);
      failed += 1;
    }
    bytesDoneBefore += file.size;
  }

  progressBar.style.width = '100%';

  if (succeeded > 0 && failed === 0) {
    doneDetail.textContent =
      succeeded === 1 ? 'We received 1 photo.' : `We received all ${succeeded} photos.`;
    show(stepDone);
  } else if (succeeded > 0) {
    doneDetail.textContent = `We received ${succeeded} of ${chosenFiles.length} photos. The rest did not send. You can try again.`;
    show(stepDone);
  } else {
    errorDetail.textContent = 'Your photos could not be sent. Please check your internet and try again.';
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

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!isStandalone()) installBanner.classList.remove('hidden');
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

if (isIOS() && !isStandalone()) {
  installBanner.classList.remove('hidden');
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
