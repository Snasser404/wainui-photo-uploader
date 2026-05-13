const statusText = document.getElementById('status-text');
const statusCard = document.getElementById('gallery-status');
const grid = document.getElementById('gallery-grid');

const lightbox = document.getElementById('lightbox');
const lightboxClose = document.getElementById('lightbox-close');
const lightboxPrev = document.getElementById('lightbox-prev');
const lightboxNext = document.getElementById('lightbox-next');
const lightboxMediaWrap = document.getElementById('lightbox-media-wrap');
const lightboxCaption = document.getElementById('lightbox-caption');

let photos = [];
let currentIndex = -1;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function renderGrid() {
  if (photos.length === 0) {
    statusText.textContent = 'No photos yet. Be the first to share one!';
    return;
  }
  statusCard.classList.add('hidden');
  grid.classList.remove('hidden');

  grid.innerHTML = photos
    .map((p, i) => {
      const thumb = p.thumbnail || p.download || '';
      const isVideo = p.type === 'video';
      return `
        <button type="button" class="thumb" data-index="${i}" aria-label="${escapeHtml(p.caption || p.name)}">
          ${thumb
            ? `<img class="thumb-img" loading="lazy" src="${escapeHtml(thumb)}" alt="${escapeHtml(p.caption || p.name)}" />`
            : `<div class="thumb-placeholder">${isVideo ? '&#9658;' : '&#128247;'}</div>`}
          ${isVideo ? '<span class="thumb-play" aria-hidden="true">&#9658;</span>' : ''}
          <div class="thumb-overlay">
            ${p.caption ? `<div class="thumb-caption">${escapeHtml(p.caption)}</div>` : ''}
            <div class="thumb-meta">
              ${p.uploader ? `<span>${escapeHtml(p.uploader)}</span>` : ''}
              <span>${formatDate(p.uploadedAt)}</span>
            </div>
            ${p.tags && p.tags.length
              ? `<div class="thumb-tags">${p.tags.slice(0, 5).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`
              : ''}
          </div>
        </button>
      `;
    })
    .join('');
}

function openLightbox(index) {
  currentIndex = index;
  const p = photos[index];
  if (!p) return;

  lightboxMediaWrap.innerHTML = '';
  if (p.type === 'video' && p.download) {
    const v = document.createElement('video');
    v.src = p.download;
    v.controls = true;
    v.autoplay = true;
    v.playsInline = true;
    v.className = 'lightbox-media';
    lightboxMediaWrap.appendChild(v);
  } else if (p.download) {
    const img = document.createElement('img');
    img.src = p.download;
    img.alt = p.caption || p.name;
    img.className = 'lightbox-media';
    lightboxMediaWrap.appendChild(img);
  } else {
    lightboxMediaWrap.textContent = 'Could not load this photo.';
  }

  const parts = [];
  if (p.caption) parts.push(`<div class="lb-caption-text">${escapeHtml(p.caption)}</div>`);
  const meta = [];
  if (p.uploader) meta.push(escapeHtml(p.uploader));
  if (p.uploadedAt) meta.push(formatDate(p.uploadedAt));
  if (meta.length) parts.push(`<div class="lb-meta">${meta.join(' • ')}</div>`);
  if (p.tags && p.tags.length) {
    parts.push(`<div class="lb-tags">${p.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`);
  }
  lightboxCaption.innerHTML = parts.join('');

  lightbox.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.classList.add('hidden');
  lightboxMediaWrap.innerHTML = '';
  document.body.style.overflow = '';
}

function navLightbox(delta) {
  if (currentIndex < 0) return;
  const next = (currentIndex + delta + photos.length) % photos.length;
  openLightbox(next);
}

grid.addEventListener('click', (e) => {
  const btn = e.target.closest('.thumb');
  if (!btn) return;
  const i = Number(btn.dataset.index);
  if (!Number.isNaN(i)) openLightbox(i);
});

lightboxClose.addEventListener('click', closeLightbox);
lightboxPrev.addEventListener('click', () => navLightbox(-1));
lightboxNext.addEventListener('click', () => navLightbox(1));
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});

document.addEventListener('keydown', (e) => {
  if (lightbox.classList.contains('hidden')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') navLightbox(-1);
  if (e.key === 'ArrowRight') navLightbox(1);
});

async function load() {
  try {
    const res = await fetch('/api/list-photos');
    if (!res.ok) throw new Error('Could not load gallery');
    const data = await res.json();
    photos = data.photos || [];
    renderGrid();
  } catch (err) {
    statusText.textContent = 'Could not load the gallery. Please try again.';
    console.error(err);
  }
}

load();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
