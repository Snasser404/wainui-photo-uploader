import { getAccessToken } from '../lib/graph.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = await getAccessToken();
    const baseFolder = process.env.ONEDRIVE_FOLDER || 'WaiNui-Uploads';
    const photos = [];
    // Use plain children listing (no $select) so @microsoft.graph.downloadUrl is included.
    let nextLink = `${GRAPH}/me/drive/root:/${encodeURIComponent(baseFolder)}:/children?$expand=thumbnails&$top=200`;

    let safetyHops = 10;
    while (nextLink && safetyHops-- > 0) {
      const r = await fetch(nextLink, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) {
        if (r.status === 404) break;
        throw new Error(`List failed: ${r.status} ${await r.text()}`);
      }
      const data = await r.json();
      for (const item of data.value || []) {
        if (!item.file) continue;
        const mime = item.file.mimeType || '';
        const isImage = mime.startsWith('image/');
        const isVideo = mime.startsWith('video/');
        if (!isImage && !isVideo) continue;

        const meta = parseDescription(item.description);
        photos.push({
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
          uploader: meta.uploader,
          uploadedAt: meta.uploadedAt || item.createdDateTime,
        });
      }
      nextLink = data['@odata.nextLink'] || null;
    }

    photos.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).json({ photos });
  } catch (err) {
    console.error('list-photos error:', err.message);
    res.status(500).json({ error: 'Could not load gallery.' });
  }
}
