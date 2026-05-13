import { exchangeCodeForToken } from '../lib/graph.js';

export default async function handler(req, res) {
  const code = req.query?.code;
  const error = req.query?.error;
  const errorDesc = req.query?.error_description;
  if (error) {
    return res.status(400).send(`<pre>${error}: ${errorDesc || ''}</pre>`);
  }
  if (!code) return res.status(400).send('Missing code.');
  try {
    const data = await exchangeCodeForToken(String(code));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).end(`
<!doctype html>
<html><body style="font-family:system-ui;padding:40px;max-width:760px;margin:auto;line-height:1.5">
  <h1>Setup complete</h1>
  <p>Add this as <code>MS_REFRESH_TOKEN</code> in your hosting environment variables, then redeploy:</p>
  <textarea readonly style="width:100%;height:160px;font-family:monospace;font-size:12px;padding:10px;border:1px solid #ccc;border-radius:6px">${data.refresh_token}</textarea>
  <p style="color:#666;margin-top:20px">Keep this private — it grants ongoing access to your OneDrive.</p>
</body></html>
    `);
  } catch (err) {
    res.status(500).send(`<pre>${err.message}</pre>`);
  }
}
