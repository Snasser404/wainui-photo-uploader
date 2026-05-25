import { writeSettingsFile } from '../lib/graph.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return res.status(503).json({ error: 'Admin password is not configured. Ask your developer to set ADMIN_PASSWORD in Vercel.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    if (!body.password || body.password !== expected) {
      return res.status(401).json({ error: 'Wrong password.' });
    }
    const tags = Array.isArray(body.tags)
      ? body.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 100)
      : [];
    if (tags.length === 0) {
      return res.status(400).json({ error: 'Please keep at least one tag.' });
    }
    await writeSettingsFile({ tags, updatedAt: new Date().toISOString() });
    res.status(200).json({ ok: true, tags });
  } catch (err) {
    console.error('save-config error:', err.message);
    res.status(500).json({ error: 'Could not save settings.' });
  }
}
