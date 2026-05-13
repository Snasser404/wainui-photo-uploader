import { getAccessToken } from '../lib/graph.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';

function parseDescription(desc) {
  if (!desc) return { caption: '', tags: [], uploader: '', uploadedAt: null };
  try {
    const parsed = JSON.parse(desc);
    return {
      caption: parsed.caption || '',
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      uploader: parsed.uploader || '',
      uploadedAt: parsed.uploadedAt || null,
    };
  } catch {
    return { caption: desc, tags: [], uploader: '', uploadedAt: null };
  }
}

function pickThumbnail(thumbs, prefer) {
  if (!thumbs || !thumbs.length) return null;
  const t = thumbs[0];
  return (t[prefer] && t[prefer].url) || (t.large && t.large.url) || (t.medium && t.medium.url) || (t.small && t.small.url) || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = await getAccessToken();
    const baseFolder = process.env.ONEDRIVE_FOLDER || 'WaiNui-Uploads';
    const select = 'id,name,size,createdDateTime,lastModifiedDateTime,description,file,image,video';

    const photos = [];
    let nextLink = `${GRAPH}/me/drive/root:/${encodeURIComponent(baseFolder)}:/children?$select=${select}&$expand=thumbnails&$top=200`;

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
          thumbnail: pickThumbnail(item.thumbnails, 'large'),
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
