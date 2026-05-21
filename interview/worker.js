// ─────────────────────────────────────────────────────────────
//  CTI Interview API — Cloudflare Worker (OneDrive storage)
//  Format: Service Worker (addEventListener) — paste into Cloudflare dashboard
//
//  Required secrets (Worker Settings → Bindings → Secret):
//    ADMIN_KEY       — your chosen admin password
//    TENANT_ID       — Azure tenant ID
//    CLIENT_ID       — Azure app client ID
//    CLIENT_SECRET   — Azure app client secret
//    ONEDRIVE_USER   — OneDrive owner email (e.g. putua@ctigroup.com)
//
//  Required KV binding (Worker Settings → Bindings → KV Namespace):
//    INTERVIEW_DATA  → interview-data
//
//  No R2 bucket needed.
// ─────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
};

addEventListener('fetch', event => {
  event.respondWith(handle(event.request));
});

async function handle(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  try {
    return await route(request);
  } catch (e) {
    const status = e.message === 'Unauthorized' ? 401 : 500;
    return jsonRes({ error: e.message }, status);
  }
}

// ── Router ────────────────────────────────────────────────────

async function route(request) {
  const url = new URL(request.url);
  const m = request.method;
  const seg = url.pathname.replace(/^\/api\//, '').split('/');

  if (seg[0] === 'interviews' && seg.length === 1) {
    if (m === 'GET')  return listInterviews(request);
    if (m === 'POST') return createInterview(request);
  }
  if (seg[0] === 'interview' && seg.length === 2) {
    if (m === 'GET')    return getInterview(seg[1], request);
    if (m === 'DELETE') return deleteInterview(seg[1], request);
  }
  if (seg[0] === 'interview' && seg[2] === 'sessions') {
    if (m === 'GET')  return listSessions(seg[1], request);
    if (m === 'POST') return createSession(seg[1], request);
  }
  if (seg[0] === 'session' && seg.length === 2 && m === 'GET') {
    return getSession(seg[1]);
  }
  if (seg[0] === 'session' && seg[2] === 'upload' && m === 'POST') {
    return uploadVideo(seg[1], parseInt(seg[3]), request);
  }
  if (seg[0] === 'session' && seg[2] === 'complete' && m === 'POST') {
    return completeSession(seg[1]);
  }
  if (seg[0] === 'session' && seg[2] === 'video' && m === 'GET') {
    return getVideoUrl(seg[1], parseInt(seg[3]), request);
  }

  return jsonRes({ error: 'Not found' }, 404);
}

// ── Helpers ───────────────────────────────────────────────────

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function requireAdmin(request) {
  if (request.headers.get('X-Admin-Key') !== ADMIN_KEY) throw new Error('Unauthorized');
}

function uid() {
  return crypto.randomUUID();
}

async function kvGet(key) {
  const v = await INTERVIEW_DATA.get(key);
  return v ? JSON.parse(v) : null;
}

async function kvPut(key, value) {
  await INTERVIEW_DATA.put(key, JSON.stringify(value));
}

// ── Microsoft Graph ───────────────────────────────────────────

async function getAccessToken() {
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope:         'https://graph.microsoft.com/.default',
      }),
    }
  );
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get Microsoft access token');
  return data.access_token;
}

async function uploadToOneDrive(filePath, blob, accessToken) {
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  const sessionUrl = `https://graph.microsoft.com/v1.0/users/${ONEDRIVE_USER}/drive/root:/${encodedPath}:/createUploadSession`;

  // Create upload session
  const sessionRes = await fetch(sessionUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      item: { '@microsoft.graph.conflictBehavior': 'replace' },
    }),
  });

  const session = await sessionRes.json();
  if (!session.uploadUrl) throw new Error('Could not create OneDrive upload session');

  // Upload file in one PUT (works up to ~150MB)
  const size = blob.byteLength;
  const uploadRes = await fetch(session.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': String(size),
      'Content-Range': `bytes 0-${size - 1}/${size}`,
      'Content-Type': 'video/webm',
    },
    body: blob,
  });

  if (!uploadRes.ok) throw new Error('OneDrive upload failed: ' + uploadRes.status);
  return await uploadRes.json(); // file item with id, webUrl, etc.
}

// ── Interview handlers ────────────────────────────────────────

async function createInterview(request) {
  requireAdmin(request);
  const { title, description, questions } = await request.json();
  if (!title || !questions?.length) return jsonRes({ error: 'title and questions required' }, 400);

  const id = uid();
  const interview = { id, title, description: description || '', questions, createdAt: Date.now() };
  await kvPut(`interview:${id}`, interview);

  const list = (await kvGet('interview:list')) || [];
  list.unshift(id);
  await kvPut('interview:list', list);

  return jsonRes(interview, 201);
}

async function listInterviews(request) {
  requireAdmin(request);
  const ids = (await kvGet('interview:list')) || [];
  const items = await Promise.all(ids.map(id => kvGet(`interview:${id}`)));
  return jsonRes(items.filter(Boolean));
}

async function getInterview(id, request) {
  requireAdmin(request);
  const interview = await kvGet(`interview:${id}`);
  if (!interview) return jsonRes({ error: 'Not found' }, 404);
  return jsonRes(interview);
}

async function deleteInterview(id, request) {
  requireAdmin(request);
  await INTERVIEW_DATA.delete(`interview:${id}`);
  const list = (await kvGet('interview:list')) || [];
  await kvPut('interview:list', list.filter(i => i !== id));
  return jsonRes({ ok: true });
}

// ── Session handlers ──────────────────────────────────────────

async function createSession(interviewId, request) {
  requireAdmin(request);
  const interview = await kvGet(`interview:${interviewId}`);
  if (!interview) return jsonRes({ error: 'Interview not found' }, 404);

  const { candidateName, candidateEmail } = await request.json();
  if (!candidateName) return jsonRes({ error: 'candidateName required' }, 400);

  const token = uid();
  const session = {
    token, interviewId, candidateName,
    candidateEmail: candidateEmail || '',
    status: 'pending',
    responses: [],
    createdAt: Date.now(),
    completedAt: null,
  };
  await kvPut(`session:${token}`, session);

  const sessions = (await kvGet(`interview:${interviewId}:sessions`)) || [];
  sessions.unshift(token);
  await kvPut(`interview:${interviewId}:sessions`, sessions);

  return jsonRes({ token, session }, 201);
}

async function listSessions(interviewId, request) {
  requireAdmin(request);
  const tokens = (await kvGet(`interview:${interviewId}:sessions`)) || [];
  const sessions = await Promise.all(tokens.map(t => kvGet(`session:${t}`)));
  return jsonRes(sessions.filter(Boolean));
}

async function getSession(token) {
  const session = await kvGet(`session:${token}`);
  if (!session) return jsonRes({ error: 'Session not found' }, 404);
  const interview = await kvGet(`interview:${session.interviewId}`);
  return jsonRes({ session, interview });
}

async function uploadVideo(token, qIndex, request) {
  const session = await kvGet(`session:${token}`);
  if (!session) return jsonRes({ error: 'Session not found' }, 404);
  if (session.status === 'completed') return jsonRes({ error: 'Session already completed' }, 400);

  const interview = await kvGet(`interview:${session.interviewId}`);
  const interviewTitle = interview?.title || 'Interview';
  const safeName = session.candidateName.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
  const shortToken = token.slice(0, 8);

  // Folder: CTI Interviews/{Interview Title}/{Candidate Name} ({shortToken})
  const filePath = `CTI Interviews/${interviewTitle}/${safeName} (${shortToken})/Q${qIndex + 1}.webm`;

  const blob = await request.arrayBuffer();

  let driveItemId = null;
  let webUrl = null;

  try {
    const accessToken = await getAccessToken();
    const fileItem = await uploadToOneDrive(filePath, blob, accessToken);
    driveItemId = fileItem.id;
    webUrl = fileItem.webUrl;
  } catch (e) {
    return jsonRes({ error: 'OneDrive upload failed: ' + e.message }, 500);
  }

  const existing = session.responses.find(r => r.questionIndex === qIndex);
  if (existing) {
    existing.driveItemId = driveItemId;
    existing.webUrl = webUrl;
    existing.uploadedAt = Date.now();
  } else {
    session.responses.push({ questionIndex: qIndex, driveItemId, webUrl, uploadedAt: Date.now() });
  }
  if (session.status === 'pending') session.status = 'in_progress';
  await kvPut(`session:${token}`, session);

  return jsonRes({ ok: true, webUrl });
}

async function completeSession(token) {
  const session = await kvGet(`session:${token}`);
  if (!session) return jsonRes({ error: 'Session not found' }, 404);
  session.status = 'completed';
  session.completedAt = Date.now();
  await kvPut(`session:${token}`, session);
  return jsonRes({ ok: true });
}

async function getVideoUrl(token, qIndex, request) {
  requireAdmin(request);
  const session = await kvGet(`session:${token}`);
  if (!session) return jsonRes({ error: 'Session not found' }, 404);

  const response = session.responses.find(r => r.questionIndex === qIndex);
  if (!response?.driveItemId) return jsonRes({ error: 'Video not found' }, 404);

  try {
    const accessToken = await getAccessToken();
    const itemRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${ONEDRIVE_USER}/drive/items/${response.driveItemId}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const item = await itemRes.json();

    return jsonRes({
      downloadUrl: item['@microsoft.graph.downloadUrl'],
      webUrl: item.webUrl,
    });
  } catch (e) {
    return jsonRes({ error: 'Could not fetch video URL: ' + e.message }, 500);
  }
}
