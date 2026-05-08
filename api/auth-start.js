import { getAuthUrl } from '../lib/dropbox.js';

export default function handler(req, res) {
  if (!process.env.DROPBOX_APP_KEY) {
    return res.status(500).send('DROPBOX_APP_KEY not configured.');
  }
  res.writeHead(302, { Location: getAuthUrl() });
  res.end();
}
