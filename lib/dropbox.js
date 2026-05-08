const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const AUTH_URL = 'https://www.dropbox.com/oauth2/authorize';

let cachedToken = null;
let cachedExpiry = 0;

function basicAuth() {
  const { DROPBOX_APP_KEY, DROPBOX_APP_SECRET } = process.env;
  return 'Basic ' + Buffer.from(`${DROPBOX_APP_KEY}:${DROPBOX_APP_SECRET}`).toString('base64');
}

export async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedExpiry - 60_000) return cachedToken;

  const { DROPBOX_REFRESH_TOKEN } = process.env;
  if (!DROPBOX_REFRESH_TOKEN) {
    throw new Error('DROPBOX_REFRESH_TOKEN not set. Visit /auth/start once to obtain it.');
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: DROPBOX_REFRESH_TOKEN,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!res.ok) {
    throw new Error(`Dropbox token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  cachedExpiry = now + data.expires_in * 1000;
  return cachedToken;
}

export function getAuthUrl() {
  const { DROPBOX_APP_KEY, DROPBOX_REDIRECT_URI } = process.env;
  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id', DROPBOX_APP_KEY);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', DROPBOX_REDIRECT_URI);
  url.searchParams.set('token_access_type', 'offline');
  return url.toString();
}

export async function exchangeCodeForToken(code) {
  const { DROPBOX_REDIRECT_URI } = process.env;

  const params = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    redirect_uri: DROPBOX_REDIRECT_URI,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!res.ok) throw new Error(`Code exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export function safeName(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 200);
}
