import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createUploadSession, getAuthUrl, exchangeCodeForToken, getAccessToken, readSettingsFile, writeSettingsFile } from './lib/graph.js';
const GRAPH = 'https://graph.microsoft.com/v1.0';

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
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath === '/gallery') urlPath = '/gallery.html';
  if (urlPath === '/admin') urlPath = '/admin.html';
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
    if (pathname === '/api/config' && req.method === 'GET') {
      const DEFAULT_TAGS = ['coaching', 'people', 'nature', 'Kupuna', 'Junior', 'camps', 'events', 'OC1 / OC2', 'OC6', 'V12', 'surfski', 'SUP', 'huli', 'racing', 'WNWN?', "KOA's CUP"];
      let tags = null;
      try {
        const settings = await readSettingsFile();
        if (settings && Array.isArray(settings.tags) && settings.tags.length) tags = settings.tags;
      } catch (e) { /* fall through to defaults */ }
      if (!tags) {
        const raw = process.env.ALLOWED_TAGS || '';
        tags = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_TAGS;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ tags }));
    }

    if (pathname === '/api/save-config' && req.method === 'POST') {
      const expected = process.env.ADMIN_PASSWORD;
      if (!expected) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Admin password is not configured. Set ADMIN_PASSWORD.' }));
      }
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!body.password || body.password !== expected) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Wrong password.' }));
      }
      const tags = Array.isArray(body.tags)
        ? body.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 100)
        : [];
      if (tags.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Please keep at least one tag.' }));
      }
      await writeSettingsFile({ tags, updatedAt: new Date().toISOString() });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, tags }));
    }

    if (pathname === '/api/upload-session' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!body.filename) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'filename required' }));
      }
      const ms = body.takenAt ? Date.parse(body.takenAt) : Date.now();
      const d = new Date(Number.isNaN(ms) ? Date.now() : ms);
      const subfolder = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const session = await createUploadSession({ filename: body.filename, subfolder });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        uploadUrl: session.uploadUrl,
        expirationDateTime: session.expirationDateTime,
      }));
    }

    if (pathname === '/api/set-metadata' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!body.itemId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'itemId required' }));
      }
      const meta = {
        caption: (body.caption || '').slice(0, 500),
        tags: Array.isArray(body.tags) ? body.tags.slice(0, 20) : [],
        uploader: (body.uploader || '').slice(0, 60),
        takenAt: body.takenAt && !Number.isNaN(Date.parse(body.takenAt)) ? body.takenAt : null,
        uploadedAt: new Date().toISOString(),
      };
      const token = await getAccessToken();
      const r = await fetch(`${GRAPH}/me/drive/items/${encodeURIComponent(body.itemId)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: JSON.stringify(meta) }),
      });
      res.writeHead(r.ok ? 200 : 500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: r.ok }));
    }

    if (pathname === '/api/list-photos' && req.method === 'GET') {
      const decodeHtml = (s) => !s ? '' : String(s)
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      const DATE_RE = /^\d{4}-\d{2}$/;
      const pickTaken = (item, meta) =>
        (meta && meta.takenAt) ||
        (item.photo && item.photo.takenDateTime) ||
        (item.video && item.video.mediaCreatedDateTime) ||
        (meta && meta.uploadedAt) || item.createdDateTime;
      const toEntry = (item, folderUploader) => {
        if (!item.file) return null;
        const mime = item.file.mimeType || '';
        const isImage = mime.startsWith('image/');
        const isVideo = mime.startsWith('video/');
        if (!isImage && !isVideo) return null;
        let meta = { caption: '', tags: [], uploader: '', takenAt: null, uploadedAt: null };
        if (item.description) {
          try { meta = { ...meta, ...JSON.parse(decodeHtml(item.description)) }; } catch {}
        }
        const t = (item.thumbnails && item.thumbnails[0]) || {};
        const med = (t.medium && t.medium.url) || null;
        const lg = (t.large && t.large.url) || null;
        const sm = (t.small && t.small.url) || null;
        return {
          id: item.id, name: item.name, size: item.size, mime,
          type: isVideo ? 'video' : 'image',
          thumbnail: med || lg || sm,
          thumbnailHd: lg || med,
          download: item['@microsoft.graph.downloadUrl'] || null,
          caption: meta.caption || '',
          tags: Array.isArray(meta.tags) ? meta.tags : [],
          uploader: meta.uploader || folderUploader || '',
          takenAt: pickTaken(item, meta),
          uploadedAt: meta.uploadedAt || item.createdDateTime,
        };
      };
      const listFolder = async (token, encodedPath) => {
        const out = { photos: [], subfolders: [] };
        let next = `${GRAPH}/me/drive/root:/${encodedPath}:/children?$expand=thumbnails&$top=200`;
        let hops = 10;
        while (next && hops-- > 0) {
          const r = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
          if (!r.ok) { if (r.status === 404) return out; throw new Error(`List failed: ${r.status}`); }
          const data = await r.json();
          for (const item of data.value || []) {
            if (item.folder) out.subfolders.push(item);
            else { const e = toEntry(item, null); if (e) out.photos.push(e); }
          }
          next = data['@odata.nextLink'] || null;
        }
        return out;
      };
      const limit = Math.min(Number(url.searchParams.get('limit')) || 500, 1000);
      const token = await getAccessToken();
      const baseFolder = process.env.ONEDRIVE_FOLDER || 'WaiNui-Uploads';
      const allPhotos = [];
      const root = await listFolder(token, encodeURIComponent(baseFolder));
      allPhotos.push(...root.photos);
      const subResults = await Promise.all(root.subfolders.map(async (sub) => {
        const path = `${baseFolder}/${sub.name}`.split('/').map(encodeURIComponent).join('/');
        const inside = await listFolder(token, path);
        return { sub, photos: inside.photos };
      }));
      for (const { sub, photos } of subResults) {
        const folderUploader = DATE_RE.test(sub.name) ? '' : sub.name;
        for (const e of photos) {
          if (!e.uploader) e.uploader = folderUploader;
          allPhotos.push(e);
        }
      }
      allPhotos.sort((a, b) => new Date(b.takenAt) - new Date(a.takenAt));
      const total = allPhotos.length;
      const sliced = allPhotos.slice(0, limit);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ photos: sliced, total, returned: sliced.length, limit }));
    }

    if ((pathname === '/auth/start' || pathname === '/api/auth-start') && req.method === 'GET') {
      if (!process.env.MS_CLIENT_ID) {
        res.writeHead(500); return res.end('MS_CLIENT_ID not set');
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
        <p>Add this as <code>MS_REFRESH_TOKEN</code> in your environment, then restart:</p>
        <textarea readonly style="width:100%;height:160px;font-family:monospace;font-size:12px;padding:10px;border:1px solid #ccc;border-radius:6px">${data.refresh_token}</textarea>
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
