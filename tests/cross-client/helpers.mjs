// Shared helpers for cross-client tests. Pure ESM, no external deps —
// uses Node's built-in fetch (Node 20+).

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

const WEB_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  Origin: 'http://localhost:5173',
  Referer: 'http://localhost:5173/',
};

const MOBILE_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'TheHive/1.0 (Expo; iOS 17.0)',
};

export async function login(email, password, surface = 'web') {
  const headers = surface === 'mobile' ? MOBILE_HEADERS : WEB_HEADERS;
  const resp = await fetch(`${BACKEND_URL}/api/auth/login/`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password }),
  });
  if (!resp.ok) {
    throw new Error(
      `login(${email}, ${surface}) failed: ${resp.status} ${await resp.text()}`,
    );
  }
  const body = await resp.json();
  // CustomTokenObtainPairView returns { access, refresh, user }
  return {
    access: body.access,
    refresh: body.refresh,
    user: body.user,
    surface,
  };
}

export function authed(session) {
  const baseHeaders = session.surface === 'mobile' ? MOBILE_HEADERS : WEB_HEADERS;
  return {
    headers: { ...baseHeaders, Authorization: `Bearer ${session.access}` },
  };
}

export async function api(method, path, session, body) {
  const init = {
    method,
    headers: authed(session).headers,
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const resp = await fetch(`${BACKEND_URL}${path}`, init);
  const text = await resp.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: resp.status, ok: resp.ok, body: json };
}

export const env = {
  USER_A_EMAIL: process.env.USER_A || 'elif@demo.com',
  USER_A_PASSWORD: process.env.USER_A_PASSWORD || 'demo123',
  USER_B_EMAIL: process.env.USER_B || 'mert@demo.com',
  USER_B_PASSWORD: process.env.USER_B_PASSWORD || 'demo123',
  BACKEND_URL,
};
