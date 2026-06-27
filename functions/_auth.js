// functions/_auth.js
// Lightweight session check shared by every API route.
// Sessions are simple signed tokens stored in an httpOnly cookie.

function base64url(input) {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(input) {
  input = input.replace(/-/g, '+').replace(/_/g, '/');
  while (input.length % 4) input += '=';
  return atob(input);
}

async function hmac(key, message) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return base64url(String.fromCharCode(...new Uint8Array(sig)));
}

export async function createSessionToken(env, payload) {
  const body = base64url(JSON.stringify(payload));
  const sig = await hmac(env.SESSION_SECRET || 'dev-secret-change-me', body);
  return `${body}.${sig}`;
}

export async function verifySessionToken(env, token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expectedSig = await hmac(env.SESSION_SECRET || 'dev-secret-change-me', body);
  if (sig !== expectedSig) return null;
  try {
    return JSON.parse(base64urlDecode(body));
  } catch {
    return null;
  }
}

export function getCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

export async function requireAuth(request, env) {
  const token = getCookie(request, 'pg_session');
  const session = await verifySessionToken(env, token);
  if (!session || !session.staffId) {
    return null;
  }
  return session;
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function unauthorized() {
  return jsonResponse({ error: 'Unauthorized' }, 401);
}
