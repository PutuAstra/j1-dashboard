// ─────────────────────────────────────────────────────────────
//  CTI Interview API — Cloudflare Worker
//
//  Required bindings (set in Cloudflare dashboard):
//    KV namespace : INTERVIEW_DATA
//    R2 bucket    : RECORDINGS
//    Secret       : ADMIN_KEY  (any string you choose)
// ─────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      return await route(request, env, cors, url);
    } catch (e) {
      const status = e.message === 'Unauthorized' ? 401 : 500;
      return json({ error: e.message }, status, cors);
    }
  }
};

// ── Router ────────────────────────────────────────────────────

async function route(request, env, cors, url) {
  const m = request.method;
  const seg = url.pathname.replace(/^\/api\//, '').split('/');

  // /api/interviews
  if (seg[0] === 'interviews' && seg.length === 1) {
    if (m === 'GET')  return listInterviews(request, env, cors);
    if (m === 'POST') return createInterview(request, env, cors);
  }

  // /api/interview/:id
  if (seg[0] === 'interview' && seg.length === 2) {
    if (m === 'GET')    return getInterview(seg[1], request, env, cors);
    if (m === 'DELETE') return deleteInterview(seg[1], request, env, cors);
  }

  // /api/interview/:id/sessions
  if (seg[0] === 'interview' && seg[2] === 'sessions') {
    if (m === 'GET')  return listSessions(seg[1], request, env, cors);
    if (m === 'POST') return createSession(seg[1], request, env, cors);
  }

  // /api/session/:token
  if (seg[0] === 'session' && seg.length === 2) {
    if (m === 'GET') return getSession(seg[1], env, cors);
  }

  // /api/session/:token/upload/:qIndex
  if (seg[0] === 'session' && seg[2] === 'upload' && m === 'POST') {
    return uploadVideo(seg[1], parseInt(seg[3]), request, env, cors);
  }

  // /api/session/:token/complete
  if (seg[0] === 'session' && seg[2] === 'complete' && m === 'POST') {
    return completeSession(seg[1], env, cors);
  }

  // /api/session/:token/video/:qIndex
  if (seg[0] === 'session' && seg[2] === 'video' && m === 'GET') {
    return streamVideo(seg[1], parseInt(seg[3]), request, env, cors);
  }

  return json({ error: 'Not found' }, 404, cors);
}

// ── Helpers ───────────────────────────────────────────────────

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function requireAdmin(request, env) {
  if (request.headers.get('X-Admin-Key') !== env.ADMIN_KEY) throw new Error('Unauthorized');
}

function uid() {
  return crypto.randomUUID();
}

// ── Interview handlers ────────────────────────────────────────

async function createInterview(request, env, cors) {
  requireAdmin(request, env);
  const { title, description, questions } = await request.json();
  if (!title || !questions?.length) return json({ error: 'title and questions required' }, 400, cors);

  const id = uid();
  const interview = { id, title, description: description || '', questions, createdAt: Date.now() };
  await env.INTERVIEW_DATA.put(`interview:${id}`, JSON.stringify(interview));

  const listRaw = await env.INTERVIEW_DATA.get('interview:list');
  const list = listRaw ? JSON.parse(listRaw) : [];
  list.unshift(id);
  await env.INTERVIEW_DATA.put('interview:list', JSON.stringify(list));

  return json(interview, 201, cors);
}

async function listInterviews(request, env, cors) {
  requireAdmin(request, env);
  const listRaw = await env.INTERVIEW_DATA.get('interview:list');
  const ids = listRaw ? JSON.parse(listRaw) : [];
  const items = await Promise.all(ids.map(id =>
    env.INTERVIEW_DATA.get(`interview:${id}`).then(v => v ? JSON.parse(v) : null)
  ));
  return json(items.filter(Boolean), 200, cors);
}

async function getInterview(id, request, env, cors) {
  requireAdmin(request, env);
  const raw = await env.INTERVIEW_DATA.get(`interview:${id}`);
  if (!raw) return json({ error: 'Not found' }, 404, cors);
  return json(JSON.parse(raw), 200, cors);
}

async function deleteInterview(id, request, env, cors) {
  requireAdmin(request, env);
  await env.INTERVIEW_DATA.delete(`interview:${id}`);
  const listRaw = await env.INTERVIEW_DATA.get('interview:list');
  const list = listRaw ? JSON.parse(listRaw) : [];
  await env.INTERVIEW_DATA.put('interview:list', JSON.stringify(list.filter(i => i !== id)));
  return json({ ok: true }, 200, cors);
}

// ── Session handlers ──────────────────────────────────────────

async function createSession(interviewId, request, env, cors) {
  requireAdmin(request, env);
  const raw = await env.INTERVIEW_DATA.get(`interview:${interviewId}`);
  if (!raw) return json({ error: 'Interview not found' }, 404, cors);

  const { candidateName, candidateEmail } = await request.json();
  if (!candidateName) return json({ error: 'candidateName required' }, 400, cors);

  const token = uid();
  const session = {
    token, interviewId, candidateName,
    candidateEmail: candidateEmail || '',
    status: 'pending',
    responses: [],
    createdAt: Date.now(),
    completedAt: null,
  };
  await env.INTERVIEW_DATA.put(`session:${token}`, JSON.stringify(session));

  const sessRaw = await env.INTERVIEW_DATA.get(`interview:${interviewId}:sessions`);
  const sess = sessRaw ? JSON.parse(sessRaw) : [];
  sess.unshift(token);
  await env.INTERVIEW_DATA.put(`interview:${interviewId}:sessions`, JSON.stringify(sess));

  return json({ token, session }, 201, cors);
}

async function listSessions(interviewId, request, env, cors) {
  requireAdmin(request, env);
  const raw = await env.INTERVIEW_DATA.get(`interview:${interviewId}:sessions`);
  const tokens = raw ? JSON.parse(raw) : [];
  const sessions = await Promise.all(tokens.map(t =>
    env.INTERVIEW_DATA.get(`session:${t}`).then(v => v ? JSON.parse(v) : null)
  ));
  return json(sessions.filter(Boolean), 200, cors);
}

async function getSession(token, env, cors) {
  const raw = await env.INTERVIEW_DATA.get(`session:${token}`);
  if (!raw) return json({ error: 'Session not found' }, 404, cors);
  const session = JSON.parse(raw);
  const intRaw = await env.INTERVIEW_DATA.get(`interview:${session.interviewId}`);
  return json({ session, interview: intRaw ? JSON.parse(intRaw) : null }, 200, cors);
}

async function uploadVideo(token, qIndex, request, env, cors) {
  const raw = await env.INTERVIEW_DATA.get(`session:${token}`);
  if (!raw) return json({ error: 'Session not found' }, 404, cors);

  const session = JSON.parse(raw);
  if (session.status === 'completed') return json({ error: 'Session already completed' }, 400, cors);

  const r2Key = `${token}/${qIndex}.webm`;
  const blob = await request.arrayBuffer();
  await env.RECORDINGS.put(r2Key, blob, { httpMetadata: { contentType: 'video/webm' } });

  const existing = session.responses.find(r => r.questionIndex === qIndex);
  if (existing) {
    existing.uploadedAt = Date.now();
  } else {
    session.responses.push({ questionIndex: qIndex, uploadedAt: Date.now() });
  }
  if (session.status === 'pending') session.status = 'in_progress';
  await env.INTERVIEW_DATA.put(`session:${token}`, JSON.stringify(session));

  return json({ ok: true }, 200, cors);
}

async function completeSession(token, env, cors) {
  const raw = await env.INTERVIEW_DATA.get(`session:${token}`);
  if (!raw) return json({ error: 'Session not found' }, 404, cors);
  const session = JSON.parse(raw);
  session.status = 'completed';
  session.completedAt = Date.now();
  await env.INTERVIEW_DATA.put(`session:${token}`, JSON.stringify(session));
  return json({ ok: true }, 200, cors);
}

async function streamVideo(token, qIndex, request, env, cors) {
  requireAdmin(request, env);
  const obj = await env.RECORDINGS.get(`${token}/${qIndex}.webm`);
  if (!obj) return json({ error: 'Video not found' }, 404, cors);
  return new Response(obj.body, {
    headers: { 'Content-Type': 'video/webm', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
  });
}
