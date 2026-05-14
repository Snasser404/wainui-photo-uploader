import { getAccessToken } from '../lib/graph.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const DEFAULT_LIMIT = 500;

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
  if (!desc) return { caption: '', tags: [], uploader: '', uploadedAt: null };
  const decoded = decodeHtml(desc);
  try {
    const parsed = JSON.parse(decoded);
    return {
      caption: parsed.caption || '',
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      uploader: parsed.uploader || '',
      uploadedAt: parsed.uploadedAt || null,
    };
  } catch {
    return { caption: decoded, tags: [], uploader: '', uploadedAt: null };
  }
}

function pickThumbnail(thumbs) {
  if (!thumbs || !thumbs.length) return null;
  const t = thumbs[0];
  return (t.large && t.large.url) || (t.medium && t.medium.url) || (t.small && t.small.url) || null;
}

function buildEntry(item, folderUploader) {
  if (!item.file) return null;
  const mime = item.file.mimeType || '';
  const isImage = mime.startsWith('image/');
  const isVideo = mime.startsWith('video/');
  if (!isImage && !isVideo) return null;

  const meta = parseDescription(item.description);
  return {
    id: item.id,
    name: item.name,
    size: item.size,
    createdAt: item.createdDateTime,
    modifiedAt: item.lastModifiedDateTime,
    mime,
    type: isVideo ? 'video' : 'image',
    thumbnail: pickThumbnail(item.thumbnails),
    download: item['@microsoft.graph.downloadUrl'] || null,
    caption: meta.caption,
    tags: meta.tags,
    uploader: meta.uploader || folderUploader || '',
    uploadedAt: meta.uploadedAt || item.createdDateTime,
  };
}

async function listFolder(token, encodedPath) {
  const photos = [];
  const subfolders = [];
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

    // Root listing first to discover subfolders + capture any flat-root files.
    const root = await listFolder(token, encodeURIComponent(baseFolder));
    allPhotos.push(...root.photos);

    // Fetch every uploader's subfolder in parallel — much faster than serial.
    const subResults = await Promise.all(
      root.subfolders.map(async (sub) => {
        const path = `${baseFolder}/${sub.name}`.split('/').map(encodeURIComponent).join('/');
        const inside = await listFolder(token, path);
        return { sub, photos: inside.photos };
      })
    );

    for (const { sub, photos } of subResults) {
      for (const entry of photos) {
        if (!entry.uploader) entry.uploader = sub.name;
        allPhotos.push(entry);
      }
    }

    allPhotos.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    const total = allPhotos.length;
    const photos = allPhotos.slice(0, limit);

    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).json({ photos, total, returned: photos.length, limit });
  } catch (err) {
    console.error('list-photos error:', err.message);
    res.status(500).json({ error: 'Could not load gallery.' });
  }
}
