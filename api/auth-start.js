import { getAuthUrl } from '../lib/graph.js';

export default function handler(req, res) {
  if (!process.env.MS_CLIENT_ID) {
    return res.status(500).send('MS_CLIENT_ID not configured.');
  }
  res.writeHead(302, { Location: getAuthUrl() });
  res.end();
}
