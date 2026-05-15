// ─────────────────────────────────────────────────────────────
//  AUTH — local dashboard session (username/password)
// ─────────────────────────────────────────────────────────────
const Auth = (() => {
  const SESSION_KEY = 'j1_session';

  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function login(username, password) {
    const user = CONFIG.USERS[username.toLowerCase()];
    if (!user) return null;
    const hash = await sha256(password);
    if (hash !== user.hash) return null;
    const session = { user: username.toLowerCase(), role: user.role, loginAt: Date.now() };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return user.role;
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    ZohoAuth.clearToken();
    window.location.replace('login.html');
  }

  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); }
    catch { return null; }
  }

  function requireAuth() {
    if (!getSession()) { window.location.replace('login.html'); return false; }
    return true;
  }

  return { login, logout, getSession, requireAuth };
})();


// ─────────────────────────────────────────────────────────────
//  ZOHO AUTH — implicit OAuth flow (no backend needed)
// ─────────────────────────────────────────────────────────────
const ZohoAuth = (() => {
  const TOKEN_KEY = 'zoho_token';
  const SCOPE     = 'ZohoRecruit.modules.ALL,ZohoRecruit.settings.ALL';

  function startOAuth() {
    const params = new URLSearchParams({
      response_type: 'token',
      client_id:     CONFIG.ZOHO_CLIENT_ID,
      scope:         SCOPE,
      redirect_uri:  CONFIG.REDIRECT_URI,
      access_type:   'online',
      prompt:        'consent',
    });
    window.location.href = `${CONFIG.ZOHO_DOMAIN}/oauth/v2/auth?${params}`;
  }

  // Call this on index.html load to capture token from URL hash after Zoho redirect
  function handleCallback() {
    const hash = window.location.hash.slice(1);
    if (!hash) return false;
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const expiresIn   = params.get('expires_in');
    if (!accessToken) return false;

    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({
      access_token: accessToken,
      expires_at:   Date.now() + (parseInt(expiresIn, 10) * 1000),
    }));
    // Clean hash from URL
    window.history.replaceState({}, '', window.location.pathname);
    return true;
  }

  function getToken() {
    try {
      const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY));
      if (!t) return null;
      if (Date.now() > t.expires_at - 60_000) { clearToken(); return null; }
      return t.access_token;
    } catch { return null; }
  }

  function clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
  }

  function isConnected() { return !!getToken(); }

  return { startOAuth, handleCallback, getToken, clearToken, isConnected };
})();
