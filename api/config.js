import { readSettingsFile } from '../lib/graph.js';

// Fallback chain: OneDrive settings file → ALLOWED_TAGS env var → this default list.
// Admins edit the list via the /admin page (writes to the OneDrive settings file).
const DEFAULT_TAGS = [
  'coaching', 'people', 'nature', 'Kupuna', 'Junior', 'camps', 'events',
  'OC1 / OC2', 'OC6', 'V12', 'surfski', 'SUP', 'huli', 'racing', 'WNWN?', "KOA's CUP",
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=30');

  let tags = null;
  try {
    const settings = await readSettingsFile();
    if (settings && Array.isArray(settings.tags) && settings.tags.length) {
      tags = settings.tags;
    }
  } catch (e) {
    console.warn('config: settings read failed:', e.message);
  }

  if (!tags) {
    const raw = process.env.ALLOWED_TAGS || '';
    tags = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_TAGS;
  }

  res.status(200).json({ tags });
}
