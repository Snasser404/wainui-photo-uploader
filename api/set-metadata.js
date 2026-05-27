import { getAccessToken } from '../lib/graph.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { itemId, caption, tags, uploader } = body;
    if (!itemId) return res.status(400).json({ error: 'itemId required' });

    const { takenAt } = body;
    // Only keep a plausible date — reject 1601/1970 placeholders and future dates,
    // so the gallery falls back to OneDrive's extracted EXIF date for those files.
    let validTaken = null;
    if (takenAt) {
      const ms = Date.parse(takenAt);
      if (!Number.isNaN(ms)) {
        const d = new Date(ms);
        if (d.getUTCFullYear() >= 2000 && d.getTime() <= Date.now() + 86400000) {
          validTaken = takenAt;
        }
      }
    }
    const meta = {
      caption: (caption || '').slice(0, 500),
      tags: Array.isArray(tags)
        ? tags.map((t) => String(t).slice(0, 40)).slice(0, 20)
        : [],
      uploader: (uploader || '').slice(0, 60),
      // takenAt = the file's own date, captured on the device at upload time.
      // Stored immediately so the gallery shows the correct date without waiting
      // for OneDrive to extract EXIF (which happens minutes later).
      takenAt: validTaken,
      uploadedAt: new Date().toISOString(),
    };

    const token = await getAccessToken();
    const patchRes = await fetch(`${GRAPH}/me/drive/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: JSON.stringify(meta) }),
    });

    if (!patchRes.ok) {
      throw new Error(`Set metadata failed: ${patchRes.status} ${await patchRes.text()}`);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('set-metadata error:', err.message);
    res.status(500).json({ error: 'Could not save details.' });
  }
}
