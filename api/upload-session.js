import { createUploadSession } from '../lib/graph.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { filename } = body;
    if (!filename) return res.status(400).json({ error: 'filename required' });

    // Flat folder structure — all uploads in one place, simpler for the gallery.
    // Per-file metadata (caption, tags, uploader) goes into the file's description
    // via /api/set-metadata after upload, so the gallery can show everything in one feed.
    const session = await createUploadSession({ filename, subfolder: null });
    res.status(200).json({
      uploadUrl: session.uploadUrl,
      expirationDateTime: session.expirationDateTime,
    });
  } catch (err) {
    console.error('upload-session error:', err.message);
    res.status(500).json({ error: 'Could not start upload.' });
  }
}
