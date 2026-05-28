import { getAccessToken } from '../lib/graph.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const DEFAULT_LIMIT = 500;
const DATE_FOLDER_RE = /^\d{4}-\d{2}$/;

function decodeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseDescription(desc) {
  if (!desc) return { caption: '', tags: [], uploader: '', takenAt: null, uploadedAt: null };
  const decoded = decodeHtml(desc);
  try {
    const parsed = JSON.parse(decoded);
    return {
      caption: parsed.caption || '',
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      uploader: parsed.uploader || '',
      takenAt: parsed.takenAt || null,
      uploadedAt: parsed.uploadedAt || null,
    };
  } catch {
    return { caption: decoded, tags: [], uploader: '', takenAt: null, uploadedAt: null };
  }
}

function pickThumbnails(thumbs) {
  if (!thumbs || !thumbs.length) return { small: null, medium: null, large: null };
  const t = thumbs[0];
  return {
    small: (t.small && t.small.url) || null,
    medium: (t.medium && t.medium.url) || null,
    large: (t.large && t.large.url) || null,
  };
}

function pickTakenAt(item, meta) {
  // Prefer the photo/video's embedded "date taken" (EXIF / video metadata) — this is
  // the real capture date and is what members expect when sorting. Fall back to the
  // file-modified date stored at upload (used only when EXIF is missing, e.g. files
  // that have passed through WhatsApp), then to upload/created time as a last resort.
  return (
    (item.photo && item.photo.takenDateTime) ||
    (item.video && item.video.mediaCreatedDateTime) ||
    (meta && meta.takenAt) ||
    (meta && meta.uploadedAt) ||
    item.createdDateTime
  );
}

function buildEntry(item, folderUploader) {
  if (!item.file) return null;
  const mime = item.file.mimeType || '';
  const isImage = mime.startsWith('image/');
  const isVideo = mime.startsWith('video/');
  if (!isImage && !isVideo) return null;

  const meta = parseDescription(item.description);
  const takenAt = pickTakenAt(item, meta);
  const thumbs = pickThumbnails(item.thumbnails);

  return {
    id: item.id,
    name: item.name,
    size: item.size,
    mime,
    type: isVideo ? 'video' : 'image',
    // medium thumb is the gallery default (~10–30 KB); large is used for retina (srcset) and lightbox preview.
    thumbnail: thumbs.medium || thumbs.large || thumbs.small,
    thumbnailHd: thumbs.large || thumbs.medium,
    download: item['@microsoft.graph.downloadUrl'] || null,
    caption: meta.caption,
    tags: meta.tags,
    uploader: meta.uploader || folderUploader || '',
    takenAt,
    uploadedAt: meta.uploadedAt || item.createdDateTime,
  };
}

async function listFolder(token, encodedPath) {
  const photos = [];
  const subfolders = [];
  // No $select — Graph's default response includes file, image, video, photo facets
  // and the downloadUrl annotation, which we all need.
  let next = `${GRAPH}/me/drive/root:/${encodedPath}:/children?$expand=thumbnails&$top=200`;
  let safetyHops = 10;
  while (next && safetyHops-- > 0) {
    const r = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) {
      if (r.status === 404) return { photos, subfolders };
      throw new Error(`List failed (${encodedPath}): ${r.status}`);
    }
    const data = await r.json();
    for (const item of data.value || []) {
      if (item.folder) subfolders.push(item);
      else { const e = buildEntry(item, null); if (e) photos.push(e); }
    }
    next = data['@odata.nextLink'] || null;
  }
  return { photos, subfolders };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const limit = Math.min(Number(req.query?.limit) || DEFAULT_LIMIT, 1000);
    const token = await getAccessToken();
    const baseFolder = process.env.ONEDRIVE_FOLDER || 'WaiNui-Uploads';
    const allPhotos = [];

    const root = await listFolder(token, encodeURIComponent(baseFolder));
    allPhotos.push(...root.photos);

    const subResults = await Promise.all(
      root.subfolders.map(async (sub) => {
        const path = `${baseFolder}/${sub.name}`.split('/').map(encodeURIComponent).join('/');
        const inside = await listFolder(token, path);
        return { sub, photos: inside.photos };
      })
    );

    for (const { sub, photos } of subResults) {
      // Folder name is only a useful uploader fallback when it isn't a YYYY-MM date folder.
      const folderUploader = DATE_FOLDER_RE.test(sub.name) ? '' : sub.name;
      for (const entry of photos) {
        if (!entry.uploader) entry.uploader = folderUploader;
        allPhotos.push(entry);
      }
    }

    // Sort by date taken, newest first.
    allPhotos.sort((a, b) => new Date(b.takenAt) - new Date(a.takenAt));
    const total = allPhotos.length;
    const photos = allPhotos.slice(0, limit);

    res.setHeader('Cache-Control', 'public, max-age=20');
    res.status(200).json({ photos, total, returned: photos.length, limit });
  } catch (err) {
    console.error('list-photos error:', err.message);
    res.status(500).json({ error: 'Could not load gallery.' });
  }
}
