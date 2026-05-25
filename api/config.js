// Returns runtime config the frontend needs (currently just the allowed tag list).
// To change tags, edit the ALLOWED_TAGS environment variable in Vercel and redeploy.
const DEFAULT_TAGS = [
  'coaching', 'people', 'nature', 'Kupuna', 'Junior', 'camps', 'events',
  'OC1 / OC2', 'OC6', 'V12', 'surfski', 'SUP', 'huli', 'racing', 'WNWN?', "KOA's CUP",
];

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');

  const raw = process.env.ALLOWED_TAGS || '';
  const tags = raw
    ? raw.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_TAGS;

  res.status(200).json({ tags });
}
