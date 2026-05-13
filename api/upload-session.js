import { createUploadSession } from '../lib/graph.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { filename, uploaderName } = body;
    if (!filename) return res.status(400).json({ error: 'filename required' });

    const subfolder = uploaderName
      ? String(uploaderName).slice(0, 60)
      : new Date().toISOString().slice(0, 10);

    const session = await createUploadSession({ filename, subfolder });
    res.status(200).json({
      uploadUrl: session.uploadUrl,
      expirationDateTime: session.expirationDateTime,
    });
  } catch (err) {
    console.error('upload-session error:', err.message);
    res.status(500).json({ error: 'Could not start upload.' });
  }
}
