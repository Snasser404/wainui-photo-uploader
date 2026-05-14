const statusText = document.getElementById('status-text');
const statusCard = document.getElementById('gallery-status');
const sectionsEl = document.getElementById('gallery-sections');
const countEl = document.getElementById('gallery-count');

const lightbox = document.getElementById('lightbox');
const lightboxClose = document.getElementById('lightbox-close');
const lightboxPrev = document.getElementById('lightbox-prev');
const lightboxNext = document.getElementById('lightbox-next');
const lightboxMediaWrap = document.getElementById('lightbox-media-wrap');
const lightboxInfo = document.getElementById('lightbox-info');
const lightboxCounter = document.getElementById('lightbox-counter');

let photos = [];
let currentIndex = -1;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function groupLabel(iso) {
  if (!iso) return 'Earlier';
  const date = new Date(iso);
  const today = startOfDay(new Date());
  const that = startOfDay(date);
  const diff = (today - that) / (1000 * 60 * 60 * 24);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return 'Earlier this week';
  if (diff < 30) return 'Earlier this month';
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function shortDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function fullDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
      + ' • '
      + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

function groupByDate(list) {
  const groups = new Map();
  for (const p of list) {
    const key = groupLabel(p.uploadedAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  return groups;
}

function renderGallery() {
  if (photos.length === 0) {
    statusText.textContent = 'Nothing here yet. Be the first to share a photo or video!';
    countEl.textContent = 'Empty gallery';
    return;
  }
  statusCard.classList.add('hidden');
  sectionsEl.classList.remove('hidden');

  const totalImg = photos.filter((p) => p.type === 'image').length;
  const totalVid = photos.length - totalImg;
  const parts = [];
  if (totalImg) parts.push(`${totalImg} photo${totalImg === 1 ? '' : 's'}`);
  if (totalVid) parts.push(`${totalVid} video${totalVid === 1 ? '' : 's'}`);
  countEl.textContent = parts.join(' · ');

  const groups = groupByDate(photos);
  let runningIndex = 0;

  sectionsEl.innerHTML = '';
  for (const [label, items] of groups) {
    const section = document.createElement('section');
    section.className = 'date-section';
    section.innerHTML = `
      <h2 class="date-section-heading">${escapeHtml(label)}</h2>
      <div class="masonry">
        ${items.map((p) => {
          const idx = runningIndex++;
          const thumb = p.thumbnail || p.download || '';
          const isVideo = p.type === 'video';
          const hasOverlay = p.caption || p.uploader;
          return `
            <button type="button" class="tile" data-index="${idx}" aria-label="${escapeHtml(p.caption || p.name)}">
              <div class="tile-img-wrap">
                ${thumb
                  ? `<img class="tile-img" loading="lazy" src="${escapeHtml(thumb)}" alt="${escapeHtml(p.caption || p.name)}" />`
                  : `<div class="tile-placeholder">${isVideo ? '&#9658;' : '&#128247;'}</div>`}
                ${isVideo ? '<span class="tile-play" aria-hidden="true">&#9658;</span>' : ''}
                ${hasOverlay ? `
                  <div class="tile-overlay">
                    ${p.caption ? `<div class="tile-caption">${escapeHtml(p.caption)}</div>` : ''}
                    <div class="tile-meta">
                      ${p.uploader ? `<span class="tile-uploader">${escapeHtml(p.uploader)}</span>` : ''}
                      <span class="tile-date">${escapeHtml(shortDate(p.uploadedAt))}</span>
                    </div>
                  </div>
                ` : `
                  <div class="tile-overlay tile-overlay-bare">
                    <span class="tile-date">${escapeHtml(shortDate(p.uploadedAt))}</span>
                  </div>
                `}
              </div>
            </button>
          `;
        }).join('')}
      </div>
    `;
    sectionsEl.appendChild(section);
  }
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
    const msg = document.createElement('div');
    msg.className = 'lightbox-error';
    msg.textContent = 'Could not load this file.';
    lightboxMediaWrap.appendChild(msg);
  }

  const parts = [];
  if (p.caption) parts.push(`<div class="lb-caption">${escapeHtml(p.caption)}</div>`);
  const subParts = [];
  if (p.uploader) subParts.push(`<span class="lb-uploader">${escapeHtml(p.uploader)}</span>`);
  if (p.uploadedAt) subParts.push(`<span class="lb-date">${escapeHtml(fullDate(p.uploadedAt))}</span>`);
  if (subParts.length) parts.push(`<div class="lb-sub">${subParts.join(' <span class="dot">·</span> ')}</div>`);
  if (p.tags && p.tags.length) {
    parts.push(`<div class="lb-tags">${p.tags.map((t) => `<span class="lb-tag">${escapeHtml(t)}</span>`).join('')}</div>`);
  }
  lightboxInfo.innerHTML = parts.join('');
  lightboxCounter.textContent = `${index + 1} / ${photos.length}`;

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

sectionsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.tile');
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

let touchStartX = null;
lightbox.addEventListener('touchstart', (e) => {
  if (e.touches && e.touches[0]) touchStartX = e.touches[0].clientX;
}, { passive: true });
lightbox.addEventListener('touchend', (e) => {
  if (touchStartX === null) return;
  const endX = (e.changedTouches && e.changedTouches[0]?.clientX) ?? touchStartX;
  const dx = endX - touchStartX;
  if (Math.abs(dx) > 50) navLightbox(dx > 0 ? -1 : 1);
  touchStartX = null;
}, { passive: true });

async function load() {
  try {
    const res = await fetch('/api/list-photos');
    if (!res.ok) throw new Error('Could not load gallery');
    const data = await res.json();
    photos = data.photos || [];
    renderGallery();
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
