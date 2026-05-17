import { createUploadSession } from '../lib/graph.js';

function dateToMonthFolder(input) {
  let d;
  if (input) {
    const ms = typeof input === 'number' ? input : Date.parse(input);
    if (!Number.isNaN(ms)) d = new Date(ms);
  }
  if (!d || Number.isNaN(d.getTime())) d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { filename, takenAt } = body;
    if (!filename) return res.status(400).json({ error: 'filename required' });

    // Files land in /WaiNui-Uploads/YYYY-MM/ based on when the file was taken
    // (client passes file.lastModified). Keeps OneDrive tidy as members grow.
    const subfolder = dateToMonthFolder(takenAt);

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
