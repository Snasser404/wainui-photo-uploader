const statusText = document.getElementById('status-text');
const statusCard = document.getElementById('gallery-status');
const sectionsEl = document.getElementById('gallery-sections');
const countEl = document.getElementById('gallery-count');
const tagFiltersEl = document.getElementById('tag-filters');

const lightbox = document.getElementById('lightbox');
const lightboxClose = document.getElementById('lightbox-close');
const lightboxDownload = document.getElementById('lightbox-download');
const lightboxPrev = document.getElementById('lightbox-prev');
const lightboxNext = document.getElementById('lightbox-next');
const lightboxMediaWrap = document.getElementById('lightbox-media-wrap');
const lightboxInfo = document.getElementById('lightbox-info');
const lightboxCounter = document.getElementById('lightbox-counter');

let allPhotos = [];
let visiblePhotos = [];
let currentIndex = -1;
let activeTag = null;
let controlledTags = [];

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }

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
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch { return ''; }
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

function applyFilter() {
  visiblePhotos = activeTag
    ? allPhotos.filter((p) => Array.isArray(p.tags) && p.tags.includes(activeTag))
    : allPhotos;
}

function renderTagFilters() {
  const counts = new Map();
  for (const p of allPhotos) {
    for (const t of p.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  }
  // Only the admin-controlled tags appear as filter chips, and only when at least
  // one photo carries that tag. Older photos with free-form tags still show under
  // "All" but don't clutter the chip bar.
  const shown = controlledTags
    .map((tag) => [tag, counts.get(tag) || 0])
    .filter((entry) => entry[1] > 0);

  if (shown.length === 0) {
    tagFiltersEl.classList.add('hidden');
    return;
  }
  tagFiltersEl.classList.remove('hidden');
  const html = [
    `<button type="button" class="chip ${activeTag === null ? 'chip-active' : ''}" data-tag="">All <span class="chip-count">${allPhotos.length}</span></button>`,
    ...shown.map(([tag, count]) =>
      `<button type="button" class="chip ${activeTag === tag ? 'chip-active' : ''}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)} <span class="chip-count">${count}</span></button>`
    ),
  ];
  tagFiltersEl.innerHTML = html.join('');
}

function renderGallery() {
  if (allPhotos.length === 0) {
    statusText.textContent = 'Nothing here yet. Be the first to share a photo or video!';
    countEl.textContent = 'Empty gallery';
    return;
  }
  statusCard.classList.add('hidden');
  sectionsEl.classList.remove('hidden');

  applyFilter();

  const totalImg = visiblePhotos.filter((p) => p.type === 'image').length;
  const totalVid = visiblePhotos.length - totalImg;
  const parts = [];
  if (totalImg) parts.push(`${totalImg} photo${totalImg === 1 ? '' : 's'}`);
  if (totalVid) parts.push(`${totalVid} video${totalVid === 1 ? '' : 's'}`);
  countEl.textContent = activeTag
    ? `${parts.join(' · ')} tagged "${activeTag}"`
    : parts.join(' · ') || '0 items';

  renderTagFilters();

  if (visiblePhotos.length === 0) {
    sectionsEl.innerHTML = `<p class="empty-filter">No items match this tag.</p>`;
    return;
  }

  const groups = new Map();
  for (const p of visiblePhotos) {
    const key = groupLabel(p.takenAt || p.uploadedAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

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
          // Use the lightweight medium thumbnail for the grid (~10-25 KB).
          // The full file only loads when a tile is clicked (lightbox).
          const thumb = p.thumbnail || p.download || '';
          const isVideo = p.type === 'video';
          const hasOverlay = p.caption || p.uploader;
          const when = p.takenAt || p.uploadedAt;
          return `
            <button type="button" class="tile" data-index="${idx}" aria-label="${escapeHtml(p.caption || p.name)}">
              <div class="tile-img-wrap">
                ${thumb
                  ? `<img class="tile-img" loading="lazy" decoding="async" src="${escapeHtml(thumb)}" alt="${escapeHtml(p.caption || p.name)}" />`
                  : `<div class="tile-placeholder">${isVideo ? '&#9658;' : '&#128247;'}</div>`}
                ${isVideo ? '<span class="tile-play" aria-hidden="true">&#9658;</span>' : ''}
                ${hasOverlay ? `
                  <div class="tile-overlay">
                    ${p.caption ? `<div class="tile-caption">${escapeHtml(p.caption)}</div>` : ''}
                    <div class="tile-meta">
                      ${p.uploader ? `<span class="tile-uploader">${escapeHtml(p.uploader)}</span>` : ''}
                      <span class="tile-date">${escapeHtml(shortDate(when))}</span>
                    </div>
                  </div>
                ` : `
                  <div class="tile-overlay tile-overlay-bare">
                    <span class="tile-date">${escapeHtml(shortDate(when))}</span>
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

// ---------- Fullscreen helpers ----------
function requestFs(el) {
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  if (fn) { try { fn.call(el).catch(() => {}); } catch {} }
}
function exitFs() {
  const fn = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
  const has = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
  if (fn && has) { try { fn.call(document).catch(() => {}); } catch {} }
}

function openLightbox(index) {
  currentIndex = index;
  const p = visiblePhotos[index];
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

  if (p.download) {
    lightboxDownload.href = p.download;
    lightboxDownload.setAttribute('download', p.name || '');
    lightboxDownload.style.display = '';
  } else {
    lightboxDownload.style.display = 'none';
  }

  const parts = [];
  if (p.caption) parts.push(`<div class="lb-caption">${escapeHtml(p.caption)}</div>`);
  const subParts = [];
  if (p.uploader) subParts.push(`<span class="lb-uploader">${escapeHtml(p.uploader)}</span>`);
  const when = p.takenAt || p.uploadedAt;
  if (when) subParts.push(`<span class="lb-date">${escapeHtml(fullDate(when))}</span>`);
  if (subParts.length) parts.push(`<div class="lb-sub">${subParts.join(' <span class="dot">·</span> ')}</div>`);
  if (p.tags && p.tags.length) {
    parts.push(`<div class="lb-tags">${p.tags.map((t) =>
      `<button type="button" class="lb-tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`
    ).join('')}</div>`);
  }
  lightboxInfo.innerHTML = parts.join('');
  lightboxCounter.textContent = `${index + 1} / ${visiblePhotos.length}`;

  lightbox.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  requestFs(lightbox);
}

function closeLightbox() {
  exitFs();
  lightbox.classList.add('hidden');
  lightboxMediaWrap.innerHTML = '';
  document.body.style.overflow = '';
  currentIndex = -1;
}

function navLightbox(delta) {
  if (currentIndex < 0) return;
  const next = (currentIndex + delta + visiblePhotos.length) % visiblePhotos.length;
  openLightbox(next);
}

// ---------- Event wiring ----------
sectionsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.tile');
  if (!btn) return;
  const i = Number(btn.dataset.index);
  if (!Number.isNaN(i)) openLightbox(i);
});

tagFiltersEl.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const t = chip.dataset.tag;
  activeTag = t === '' ? null : t;
  renderGallery();
  // Scroll back to top of gallery so the user sees the filtered view
  sectionsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

lightboxInfo.addEventListener('click', (e) => {
  const tagBtn = e.target.closest('.lb-tag');
  if (!tagBtn) return;
  activeTag = tagBtn.dataset.tag;
  closeLightbox();
  renderGallery();
  setTimeout(() => sectionsEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
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

// Sync lightbox open state with fullscreen — if user exits fullscreen, close the lightbox.
function onFsChange() {
  const fs = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
  if (!fs && !lightbox.classList.contains('hidden')) {
    lightbox.classList.add('hidden');
    lightboxMediaWrap.innerHTML = '';
    document.body.style.overflow = '';
    currentIndex = -1;
  }
}
document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);

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
    const [cfgRes, photosRes] = await Promise.all([
      fetch('/api/config').catch(() => null),
      fetch('/api/list-photos'),
    ]);
    if (cfgRes && cfgRes.ok) {
      const cfg = await cfgRes.json();
      if (Array.isArray(cfg.tags)) controlledTags = cfg.tags;
    }
    if (!photosRes.ok) throw new Error('Could not load gallery');
    const data = await photosRes.json();
    allPhotos = data.photos || [];
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

// When embedded with ?uploadUrl=... the in-app "Send Photos" link navigates the
// PARENT window so the WordPress URL matches the page being shown.
(function rewriteNavLinks() {
  const params = new URLSearchParams(window.location.search);
  const uploadUrl = params.get('uploadUrl');
  if (!uploadUrl) return;
  document.querySelectorAll('a[data-nav="upload"]').forEach((a) => {
    a.href = uploadUrl;
    a.setAttribute('target', '_top');
  });
})();

// ---------- Auto-resize: report content height to the parent (WordPress) page ----------
// Grows the embedding iframe to fit the gallery so there's no scrolling inside the frame.
// Re-fires whenever content changes (images load, filters applied, sections expand/collapse).
(function setupAutoResize() {
  function postHeight() {
    // While the fullscreen lightbox is open the browser owns the screen; skip resizing.
    if (!lightbox.classList.contains('hidden')) return;
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
  setTimeout(postHeight, 300);
  setTimeout(postHeight, 1200);
})();
