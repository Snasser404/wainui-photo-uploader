import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAccessToken, getAuthUrl, exchangeCodeForToken, safeName } from './lib/dropbox.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

if (fs.existsSync(path.join(__dirname, '.env'))) {
  const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, urlPath);
  if (!filePath.startsWith(PUBLIC_DIR)) return notFound(res);
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return notFound(res);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Security-Policy', 'frame-ancestors *');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  try {
    if (pathname === '/api/dropbox-token' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const accessToken = await getAccessToken();
      const folder = body.uploaderName
        ? safeName(body.uploaderName).slice(0, 60)
        : new Date().toISOString().slice(0, 10);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        accessToken,
        folder: '/' + folder,
        expiresInSeconds: 14400,
      }));
    }

    if ((pathname === '/auth/start' || pathname === '/api/auth-start') && req.method === 'GET') {
      if (!process.env.DROPBOX_APP_KEY) {
        res.writeHead(500); return res.end('DROPBOX_APP_KEY not set');
      }
      res.writeHead(302, { Location: getAuthUrl() });
      return res.end();
    }

    if ((pathname === '/auth/callback' || pathname === '/api/auth-callback') && req.method === 'GET') {
      const code = url.searchParams.get('code');
      if (!code) { res.writeHead(400); return res.end('Missing code'); }
      const data = await exchangeCodeForToken(code);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><html><body style="font-family:system-ui;padding:40px;max-width:760px;margin:auto;line-height:1.5">
        <h1>Setup complete</h1>
        <p>Add this as <code>DROPBOX_REFRESH_TOKEN</code> in your environment, then restart:</p>
        <textarea readonly style="width:100%;height:80px;font-family:monospace;font-size:12px;padding:10px;border:1px solid #ccc;border-radius:6px">${data.refresh_token}</textarea>
        <p style="color:#666;margin-top:20px">Keep this private.</p>
      </body></html>`);
    }

    if (req.method === 'GET') return serveStatic(req, res);
    notFound(res);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`WaiNui Photo Uploader running on http://localhost:${PORT}`);
});
