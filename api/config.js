// Returns runtime config the frontend needs (currently just the allowed tag list).
// To change tags, edit the ALLOWED_TAGS environment variable in Vercel and redeploy.
const DEFAULT_TAGS = ['Family', 'Events', 'Nature', 'Food', 'Travel', 'People', 'Celebrations', 'Outdoor'];

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');

  const raw = process.env.ALLOWED_TAGS || '';
  const tags = raw
    ? raw.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_TAGS;

  res.status(200).json({ tags });
}
