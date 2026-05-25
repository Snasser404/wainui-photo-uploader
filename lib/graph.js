const GRAPH = 'https://graph.microsoft.com/v1.0';
const TOKEN_URL = (tenant) => `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
const AUTH_URL = (tenant) => `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
const SCOPE = 'offline_access Files.ReadWrite';

let cachedToken = null;
let cachedExpiry = 0;

export async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedExpiry - 60_000) return cachedToken;

  const { MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT, MS_REFRESH_TOKEN } = process.env;
  if (!MS_REFRESH_TOKEN) {
    throw new Error('MS_REFRESH_TOKEN not set. Visit /auth/start once to obtain it.');
  }

  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    client_secret: MS_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: MS_REFRESH_TOKEN,
    scope: SCOPE,
  });

  const res = await fetch(TOKEN_URL(MS_TENANT || 'common'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  if (!res.ok) {
    throw new Error(`Microsoft token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  cachedExpiry = now + data.expires_in * 1000;
  return cachedToken;
}

export function safeName(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 200);
}

async function ensureFolder(token, parentPath, folderName) {
  const url = parentPath
    ? `${GRAPH}/me/drive/root:/${encodeURIComponent(parentPath)}:/children`
    : `${GRAPH}/me/drive/root/children`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail',
    }),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`Folder create failed (${folderName}): ${res.status} ${await res.text()}`);
  }
}

export async function createUploadSession({ filename, subfolder }) {
  const token = await getAccessToken();
  const baseFolder = process.env.ONEDRIVE_FOLDER || 'WaiNui-Uploads';
  await ensureFolder(token, null, baseFolder);

  let folderPath = baseFolder;
  if (subfolder) {
    const cleanSub = safeName(subfolder);
    await ensureFolder(token, baseFolder, cleanSub);
    folderPath = `${baseFolder}/${cleanSub}`;
  }

  const cleanName = safeName(filename);
  const itemPath = `${folderPath}/${cleanName}`
    .split('/')
    .map(encodeURIComponent)
    .join('/');

  const sessionRes = await fetch(
    `${GRAPH}/me/drive/root:/${itemPath}:/createUploadSession`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item: {
          '@microsoft.graph.conflictBehavior': 'rename',
          name: cleanName,
        },
      }),
    }
  );
  if (!sessionRes.ok) {
    throw new Error(`Upload session failed: ${sessionRes.status} ${await sessionRes.text()}`);
  }
  return sessionRes.json();
}

export function getAuthUrl() {
  const { MS_CLIENT_ID, MS_TENANT, MS_REDIRECT_URI } = process.env;
  const url = new URL(AUTH_URL(MS_TENANT || 'common'));
  url.searchParams.set('client_id', MS_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', MS_REDIRECT_URI);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

export async function exchangeCodeForToken(code) {
  const { MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT, MS_REDIRECT_URI } = process.env;
  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    client_secret: MS_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: MS_REDIRECT_URI,
    scope: SCOPE,
  });
  const res = await fetch(TOKEN_URL(MS_TENANT || 'common'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  if (!res.ok) throw new Error(`Code exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// ---------- Settings file stored in OneDrive (for the admin tag editor) ----------
const SETTINGS_FILE = '_settings.json';

function settingsPath() {
  const baseFolder = process.env.ONEDRIVE_FOLDER || 'WaiNui-Uploads';
  return `${baseFolder}/${SETTINGS_FILE}`.split('/').map(encodeURIComponent).join('/');
}

export async function readSettingsFile() {
  const token = await getAccessToken();
  const res = await fetch(`${GRAPH}/me/drive/root:/${settingsPath()}:/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Settings read failed: ${res.status}`);
  return res.json();
}

export async function writeSettingsFile(data) {
  const token = await getAccessToken();
  const baseFolder = process.env.ONEDRIVE_FOLDER || 'WaiNui-Uploads';
  await ensureFolder(token, null, baseFolder).catch(() => {});
  const res = await fetch(`${GRAPH}/me/drive/root:/${settingsPath()}:/content`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Settings write failed: ${res.status} ${await res.text()}`);
  return res.json();
}
