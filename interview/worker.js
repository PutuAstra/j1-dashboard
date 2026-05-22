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
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
    if (status === 500) console.error('Worker unhandled error:', e.message, e.stack || '');
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
    if (m === 'PUT')    return updateInterview(seg[1], request);
    if (m === 'DELETE') return deleteInterview(seg[1], request);
  }
  if (seg[0] === 'interview' && seg[2] === 'sessions') {
    if (m === 'GET')  return listSessions(seg[1], request);
    if (m === 'POST') return createSession(seg[1], request);
  }
  if (seg[0] === 'session' && seg.length === 2 && m === 'GET') {
    return getSession(seg[1]);
  }
  if (seg[0] === 'session' && seg.length === 2 && m === 'DELETE') {
    return deleteSession(seg[1], request);
  }
  if (seg[0] === 'session' && seg[2] === 'send-email' && m === 'POST') {
    return sendInterviewEmail(seg[1], request);
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

  // Two-way sessions
  if (seg[0] === 'tw-sessions' && seg.length === 1) {
    if (m === 'GET')  return listTWSessions(request);
    if (m === 'POST') return createTWSession(request);
  }
  if (seg[0] === 'tw-session' && seg.length === 2) {
    if (m === 'PUT')    return updateTWSession(seg[1], request);
    if (m === 'DELETE') return deleteTWSessionHandler(seg[1], request);
  }
  if (seg[0] === 'tw-session' && seg[2] === 'send-email' && m === 'POST') {
    return sendTWEmail(seg[1], request);
  }
  if (seg[0] === 'tw-session' && seg[2] === 'fetch-recording' && m === 'POST') {
    return fetchTWRecording(seg[1], request);
  }
  if (seg[0] === 'tw-session' && seg[2] === 'recording-url' && m === 'GET') {
    return getTWRecordingUrl(seg[1], request);
  }

  // One-way: AI English analysis
  if (seg[0] === 'session' && seg[2] === 'analyze' && m === 'POST') {
    return analyzeSession(seg[1], request);
  }
  if (seg[0] === 'session' && seg[2] === 'analysis' && m === 'GET') {
    return getAnalysis(seg[1], request);
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
  const items = await Promise.all(ids.map(async id => {
    const interview = await kvGet(`interview:${id}`);
    if (!interview) return null;
    const tokens = (await kvGet(`interview:${id}:sessions`)) || [];
    const sessions = await Promise.all(tokens.map(t => kvGet(`session:${t}`)));
    const valid = sessions.filter(Boolean);
    interview._counts = {
      total: valid.length,
      pending: valid.filter(s => s.status === 'pending').length,
      completed: valid.filter(s => s.status === 'completed').length,
    };
    return interview;
  }));
  return jsonRes(items.filter(Boolean));
}

async function getInterview(id, request) {
  requireAdmin(request);
  const interview = await kvGet(`interview:${id}`);
  if (!interview) return jsonRes({ error: 'Not found' }, 404);
  return jsonRes(interview);
}

async function updateInterview(id, request) {
  requireAdmin(request);
  const existing = await kvGet(`interview:${id}`);
  if (!existing) return jsonRes({ error: 'Not found' }, 404);

  const { title, description, questions } = await request.json();
  if (!title || !questions?.length) return jsonRes({ error: 'title and questions required' }, 400);

  const updated = { ...existing, title, description: description || '', questions };
  await kvPut(`interview:${id}`, updated);
  return jsonRes(updated);
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

async function sendInterviewEmail(token, request) {
  requireAdmin(request);
  const session = await kvGet(`session:${token}`);
  if (!session) return jsonRes({ error: 'Session not found' }, 404);
  if (!session.candidateEmail) return jsonRes({ error: 'No email address for this candidate' }, 400);

  const { link } = await request.json();
  const interview = await kvGet(`interview:${session.interviewId}`);
  const interviewTitle = interview?.title || 'Interview';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <div style="background:#B01A18;padding:28px 32px">
        <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700">CTI ClaudeHire</h1>
        <p style="color:rgba(255,255,255,0.75);margin:4px 0 0;font-size:13px">CTI Group Worldwide Services, Inc.</p>
      </div>
      <div style="padding:32px;background:#ffffff">
        <p style="font-size:15px;color:#1a1a1a">Dear <strong>${session.candidateName}</strong>,</p>
        <p style="color:#374151">You have been invited to complete a one-way video interview for the following position:</p>
        <div style="background:#f9fafb;border-left:4px solid #B01A18;padding:14px 18px;margin:20px 0;border-radius:0 6px 6px 0">
          <strong style="font-size:16px;color:#1a1a1a">${interviewTitle}</strong>
        </div>
        <p style="color:#374151">Please click the button below to begin. You can complete the interview at your own pace.</p>
        <div style="text-align:center;margin:32px 0">
          <a href="${link}" style="background:#B01A18;color:#ffffff;padding:14px 36px;text-decoration:none;border-radius:6px;font-size:15px;font-weight:700;display:inline-block">
            Start Interview →
          </a>
        </div>
        <p style="color:#6b7280;font-size:12px">Or copy this link into your browser:</p>
        <p style="color:#6b7280;font-size:12px;word-break:break-all;background:#f3f4f6;padding:10px;border-radius:4px">${link}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0" />
        <p style="color:#9ca3af;font-size:11px;text-align:center;margin:0">
          CTI Group Worldwide Services, Inc. &nbsp;·&nbsp; ClaudeHire Portal<br/>
          This is an automated message — please do not reply to this email.
        </p>
      </div>
    </div>`;

  const sender = EMAIL_SENDER || ONEDRIVE_USER;
  const accessToken = await getAccessToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${sender}/sendMail`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: `Interview Invitation: ${interviewTitle} — CTI ClaudeHire`,
        body: { contentType: 'HTML', content: html },
        from: { emailAddress: { name: 'CTI ClaudeHire', address: sender } },
        toRecipients: [{ emailAddress: { address: session.candidateEmail } }],
      },
      saveToSentItems: true,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return jsonRes({ error: 'Email failed: ' + (err.error?.message || res.status) }, 500);
  }
  return jsonRes({ ok: true });
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

async function deleteSession(token, request) {
  requireAdmin(request);
  const session = await kvGet(`session:${token}`);
  if (!session) return jsonRes({ error: 'Session not found' }, 404);
  if (session.status === 'completed') return jsonRes({ error: 'Cannot revoke a completed session' }, 400);

  await INTERVIEW_DATA.delete(`session:${token}`);
  await INTERVIEW_DATA.delete(`session:${token}:analysis`); // clean up cached analysis
  const sessions = (await kvGet(`interview:${session.interviewId}:sessions`)) || [];
  await kvPut(`interview:${session.interviewId}:sessions`, sessions.filter(t => t !== token));
  return jsonRes({ ok: true });
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

// ── Two-way session handlers ──────────────────────────────────

async function createTWSession(request) {
  requireAdmin(request);
  const { candidateName, candidateEmail, position, scheduledAt, duration, meetingLink, notes, autoMeeting } = await request.json();
  if (!candidateName || !candidateEmail || !position) {
    return jsonRes({ error: 'candidateName, candidateEmail, and position are required' }, 400);
  }

  const id = uid();
  const session = {
    id, candidateName, candidateEmail, position,
    scheduledAt: scheduledAt || null,
    duration: duration || 60,
    meetingLink: meetingLink || '',
    notes: notes || '',
    status: 'scheduled',
    createdAt: Date.now(),
  };

  if (autoMeeting && scheduledAt) {
    try {
      const meeting = await createTeamsMeeting(session);
      session.meetingLink        = meeting.joinUrl;
      session.calendarEventId    = meeting.eventId;
      session.calendarWebLink    = meeting.webLink;
      session.meetingShortId     = meeting.shortId;    // e.g. "a1b2c3d4"
      session.meetingSubjectTag  = meeting.subjectTag; // e.g. "[CTI-a1b2c3d4]"
      session.teamsGenerated     = true;
    } catch (e) {
      session.teamsError = e.message;
    }
  }

  await kvPut(`tw-session:${id}`, session);

  const list = (await kvGet('tw-session:list')) || [];
  list.unshift(id);
  await kvPut('tw-session:list', list);

  return jsonRes(session, 201);
}

async function listTWSessions(request) {
  requireAdmin(request);
  const ids = (await kvGet('tw-session:list')) || [];
  const items = await Promise.all(ids.map(id => kvGet(`tw-session:${id}`)));
  return jsonRes(items.filter(Boolean));
}

async function updateTWSession(id, request) {
  requireAdmin(request);
  const existing = await kvGet(`tw-session:${id}`);
  if (!existing) return jsonRes({ error: 'Not found' }, 404);
  const updates = await request.json();
  const updated = { ...existing, ...updates };
  await kvPut(`tw-session:${id}`, updated);
  return jsonRes(updated);
}

async function deleteTWSessionHandler(id, request) {
  requireAdmin(request);
  await INTERVIEW_DATA.delete(`tw-session:${id}`);
  const list = (await kvGet('tw-session:list')) || [];
  await kvPut('tw-session:list', list.filter(i => i !== id));
  return jsonRes({ ok: true });
}

async function sendTWEmail(id, request) {
  requireAdmin(request);
  const session = await kvGet(`tw-session:${id}`);
  if (!session) return jsonRes({ error: 'Session not found' }, 404);
  if (!session.candidateEmail) return jsonRes({ error: 'No email address for this candidate' }, 400);

  const dt = session.scheduledAt ? new Date(session.scheduledAt) : null;
  const dateStr = dt
    ? dt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : 'To Be Confirmed';
  const timeStr = dt
    ? dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : '';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <div style="background:#B01A18;padding:28px 32px">
        <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700">CTI ClaudeHire</h1>
        <p style="color:rgba(255,255,255,0.75);margin:4px 0 0;font-size:13px">CTI Group Worldwide Services, Inc.</p>
      </div>
      <div style="padding:32px;background:#ffffff">
        <p style="font-size:15px;color:#1a1a1a">Dear <strong>${session.candidateName}</strong>,</p>
        <p style="color:#374151">You have been scheduled for a two-way interview for the following position:</p>
        <div style="background:#f9fafb;border-left:4px solid #B01A18;padding:14px 18px;margin:20px 0;border-radius:0 6px 6px 0">
          <strong style="font-size:16px;color:#1a1a1a">${session.position}</strong>
        </div>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">
          <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:100px;vertical-align:top">Date</td><td style="padding:8px 0;color:#1a1a1a;font-size:14px;font-weight:600">${dateStr}</td></tr>
          ${timeStr ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px;vertical-align:top">Time</td><td style="padding:8px 0;color:#1a1a1a;font-size:14px;font-weight:600">${timeStr}</td></tr>` : ''}
          <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;vertical-align:top">Duration</td><td style="padding:8px 0;color:#1a1a1a;font-size:14px">${session.duration} minutes</td></tr>
          ${session.meetingLink ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px;vertical-align:top">Meeting</td><td style="padding:8px 0"><a href="${session.meetingLink}" style="color:#B01A18;font-weight:600">Join Meeting Link</a></td></tr>` : ''}
        </table>
        ${session.meetingLink ? `
        <div style="text-align:center;margin:32px 0">
          <a href="${session.meetingLink}" style="background:#B01A18;color:#ffffff;padding:14px 36px;text-decoration:none;border-radius:6px;font-size:15px;font-weight:700;display:inline-block">
            Join Interview →
          </a>
        </div>` : ''}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0" />
        <p style="color:#9ca3af;font-size:11px;text-align:center;margin:0">
          CTI Group Worldwide Services, Inc. &nbsp;·&nbsp; ClaudeHire Portal<br/>
          This is an automated message — please do not reply to this email.
        </p>
      </div>
    </div>`;

  const sender = EMAIL_SENDER || ONEDRIVE_USER;
  const accessToken = await getAccessToken();
  const emailRes = await fetch(`https://graph.microsoft.com/v1.0/users/${sender}/sendMail`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: `Interview Scheduled: ${session.position} — CTI ClaudeHire`,
        body: { contentType: 'HTML', content: html },
        from: { emailAddress: { name: 'CTI ClaudeHire', address: sender } },
        toRecipients: [{ emailAddress: { address: session.candidateEmail } }],
      },
      saveToSentItems: true,
    }),
  });

  if (!emailRes.ok) {
    const err = await emailRes.json().catch(() => ({}));
    return jsonRes({ error: 'Email failed: ' + (err.error?.message || emailRes.status) }, 500);
  }
  return jsonRes({ ok: true });
}

// ── Resolve the organizer's OneDrive drive base URL ──────────────
// Tries /users/{email}/drive first. If that returns 423 (common when the
// account has sign-in blocked or SharePoint access policies block the
// /users/ endpoint), falls back to /sites/{host}/personal/{path}/drive
// which only requires Sites.ReadWrite.All and is not user-account-gated.
async function resolveOrganizerDriveBase(organizer, accessToken) {
  const userBase = `https://graph.microsoft.com/v1.0/users/${organizer}/drive`;
  const testRes  = await fetch(`${userBase}/root`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  console.log(`[drive] /users/ → ${testRes.status}`);
  if (testRes.ok) return { driveBase: userBase, error: null };

  if (testRes.status !== 423) {
    const err = await testRes.json().catch(() => ({}));
    console.error(`[drive] /users/ failed: ${testRes.status} ${JSON.stringify(err.error || {})}`);
    return {
      driveBase: null,
      error: {
        message: `Cannot access OneDrive for ${organizer} (HTTP ${testRes.status}): ${err.error?.message || 'unknown'}`,
        code: err.error?.code,
        innerError: err.error?.innerError,
      },
    };
  }

  // 423 → try site-based access.
  // Derive the personal site path from the email:
  //   corporate-recruiter@cti-usa.com  →  corporate-recruiter_cti-usa_com
  // Rule: replace '@' with '_', keep hyphens, replace '.' with '_'.
  const sitePath   = organizer.toLowerCase().replace('@', '_').replace(/\./g, '_');
  const siteApiUrl = `https://graph.microsoft.com/v1.0/sites/ctiworldwide-my.sharepoint.com:/personal/${sitePath}`;
  console.log(`[drive] 423 → trying site fallback: /personal/${sitePath}`);

  const siteRes = await fetch(siteApiUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  console.log(`[drive] site fallback → ${siteRes.status}`);
  if (!siteRes.ok) {
    const siteErr = await siteRes.json().catch(() => ({}));
    console.error(`[drive] site fallback failed: ${siteRes.status} ${JSON.stringify(siteErr.error || {})}`);
    return {
      driveBase: null,
      error: {
        message: `Cannot access OneDrive for ${organizer}: /users/ returned 423, site fallback returned ${siteRes.status}: ${siteErr.error?.message || 'unknown'}`,
        code: siteErr.error?.code,
        hint: 'Check if the account is blocked in Azure AD (portal.azure.com → Users → Block sign-in) or if a SharePoint network location policy is restricting access.',
      },
    };
  }

  const siteData  = await siteRes.json();
  console.log(`[drive] site fallback OK, siteId=${siteData.id}`);
  const siteBase  = `https://graph.microsoft.com/v1.0/sites/${siteData.id}/drive`;
  return { driveBase: siteBase, error: null };
}

async function fetchTWRecording(id, request) {
  requireAdmin(request);
  const session = await kvGet(`tw-session:${id}`);
  if (!session) return jsonRes({ error: 'Session not found' }, 404);

  // Use ONEDRIVE_USER (not EMAIL_SENDER) — Teams meetings are created in
  // ONEDRIVE_USER's calendar so recordings land in their accessible drive.
  const organizer   = ONEDRIVE_USER;
  const accessToken = await getAccessToken();

  // ── Step 1: resolve drive base (with 423 fallback) ─────────────
  const { driveBase, error } = await resolveOrganizerDriveBase(organizer, accessToken);
  if (error) return jsonRes(error, 500);

  // ── Step 2: search for recordings ──────────────────────────────
  // Teams recordings are named after the meeting subject (e.g. "Interview -
  // Cunard Line.mp4"), NOT "recording.mp4", so we search several terms and
  // also list the Recordings folder directly.
  let files = [];
  const videoExt = /\.(mp4|mkv|webm)$/i;

  // 2a. List Recordings folder (most reliable — Teams saves here by default)
  const recFolderRes = await fetch(
    `${driveBase}/root:/Recordings:/children` +
    `?$orderby=createdDateTime+desc&$top=50&$select=id,name,createdDateTime,size,webUrl`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  if (recFolderRes.ok) {
    const data = await recFolderRes.json();
    files.push(...(data.value || []).filter(f => videoExt.test(f.name)));
  }

  // 2b. Drive search for ".mp4" — catches files outside the Recordings folder
  if (!files.length) {
    const s = await fetch(
      `${driveBase}/search(q='.mp4')` +
      `?$top=50&$select=id,name,createdDateTime,size,webUrl`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    if (s.ok) {
      const data = await s.json();
      files.push(...(data.value || []).filter(f => videoExt.test(f.name)));
    }
  }

  const meetingStart = session.scheduledAt || 0;
  // Only look for recordings created AFTER the meeting started (not before).
  // This prevents picking up recordings from earlier sessions.
  const windowStart  = meetingStart;

  // Match video files created at or after the meeting time
  let candidates = files.filter(f =>
    new Date(f.createdDateTime).getTime() >= windowStart
  );
  // If time filter yields nothing (meeting time not set / clock skew), use all
  if (!candidates.length) candidates = files;

  if (!candidates.length) {
    return jsonRes({ notFound: true, message: 'No recording found yet. Recording may still be processing — try again in a few minutes.' });
  }

  // ── Match by unique session ID tag first (most reliable) ──────
  // New meetings have [CTI-xxxxxxxx] embedded in the subject → filename.
  const idTag     = session.meetingShortId ? `cti-${session.meetingShortId}` : null;
  const idMatch   = idTag
    ? candidates.find(f => f.name.toLowerCase().includes(idTag))
    : null;

  // ── Fallback: meaningful words from the candidate's name ────────
  // (skip short words/honorifics like "I", "de", "Mr")
  const nameWords = session.candidateName
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2);

  const nameMatch = candidates.find(f => {
    const fn = f.name.toLowerCase();
    return nameWords.some(w => fn.includes(w));
  });

  const best = idMatch || nameMatch;

  if (!best) {
    // Neither tag nor name matched — don't guess, report what was found
    const fileList = candidates.map(f => f.name).join(', ');
    return jsonRes({
      notFound: true,
      message: `Found ${candidates.length} recording(s) after meeting time but none matched "${session.candidateName}". Files found: ${fileList}`,
    });
  }

  session.recordingDriveItemId = best.id;
  session.recordingFileName    = best.name;
  session.recordingWebUrl      = best.webUrl;
  await kvPut(`tw-session:${id}`, session);

  return jsonRes({ ok: true, fileName: best.name, webUrl: best.webUrl });
}

async function getTWRecordingUrl(id, request) {
  requireAdmin(request);
  const session = await kvGet(`tw-session:${id}`);
  if (!session) return jsonRes({ error: 'Session not found' }, 404);
  if (!session.recordingDriveItemId) return jsonRes({ error: 'No recording linked to this session' }, 404);

  try {
    const organizer   = ONEDRIVE_USER;
    const accessToken = await getAccessToken();

    const { driveBase, error } = await resolveOrganizerDriveBase(organizer, accessToken);
    if (error) return jsonRes(error, 500);

    const itemRes = await fetch(
      `${driveBase}/items/${session.recordingDriveItemId}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const item = await itemRes.json();
    return jsonRes({
      downloadUrl: item['@microsoft.graph.downloadUrl'],
      webUrl:      item.webUrl,
      fileName:    session.recordingFileName,
    });
  } catch (e) {
    return jsonRes({ error: 'Could not fetch recording URL: ' + e.message }, 500);
  }
}

async function createTeamsMeeting(session) {
  const accessToken = await getAccessToken();
  // Always use ONEDRIVE_USER as the Teams meeting organizer so that
  // recordings land in ONEDRIVE_USER's drive (accessible via app-only auth).
  // EMAIL_SENDER is only used as the FROM address in notification emails.
  const organizer   = ONEDRIVE_USER;

  const startMs  = session.scheduledAt;
  const endMs    = startMs + (session.duration || 60) * 60 * 1000;
  const startStr = new Date(startMs).toISOString().replace('Z', '');
  const endStr   = new Date(endMs).toISOString().replace('Z', '');

  // Embed a short session ID tag in the meeting subject.
  // Teams includes the meeting subject in the recording filename, so
  // fetchTWRecording can match by this tag instead of guessing by name.
  // e.g. subject = "Interview: Cunard Line - Waiter — Herry Wahyudi [CTI-a1b2c3d4]"
  // recording  = "Interview Cunard Line - Waiter — Herry Wahyudi [CTI-a1b2c3d4]-Meeting Recording.mp4"
  const shortId  = session.id.replace(/-/g, '').slice(0, 8); // 8-char hex tag
  const subjectTag = `[CTI-${shortId}]`;

  const eventBody = {
    subject: `Interview: ${session.position} — ${session.candidateName} ${subjectTag}`,
    body: {
      contentType: 'HTML',
      content: `
        <p>Interview scheduled via <strong>CTI ClaudeHire</strong>.</p>
        <table cellpadding="6" style="font-family:Arial,sans-serif;font-size:14px">
          <tr><td style="color:#6b7280;width:100px">Candidate</td><td><strong>${session.candidateName}</strong> &lt;${session.candidateEmail}&gt;</td></tr>
          <tr><td style="color:#6b7280">Position</td><td>${session.position}</td></tr>
          <tr><td style="color:#6b7280">Duration</td><td>${session.duration || 60} minutes</td></tr>
          ${session.notes ? `<tr><td style="color:#6b7280;vertical-align:top">Notes</td><td>${session.notes}</td></tr>` : ''}
        </table>
      `,
    },
    start: { dateTime: startStr, timeZone: 'UTC' },
    end:   { dateTime: endStr,   timeZone: 'UTC' },
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
    attendees: [
      {
        emailAddress: { address: session.candidateEmail, name: session.candidateName },
        type: 'required',
      },
    ],
  };

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${organizer}/calendar/events`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(eventBody),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error('Teams: ' + (err.error?.message || res.status));
  }

  const event = await res.json();
  return {
    joinUrl:  event.onlineMeeting?.joinUrl || '',
    eventId:  event.id,
    webLink:  event.webLink || '',
    shortId,           // passed back so caller can store it on the session
    subjectTag,        // e.g. "[CTI-a1b2c3d4]"
  };
}

// ── English Analysis (One-Way Interview) ──────────────────────
// Required Worker secrets: OPENAI_API_KEY, ANTHROPIC_API_KEY

async function analyzeSession(token, request) {
  requireAdmin(request);

  if (typeof OPENAI_API_KEY === 'undefined' || !OPENAI_API_KEY) {
    return jsonRes({ error: 'OPENAI_API_KEY is not configured in Worker secrets.' }, 500);
  }
  if (typeof ANTHROPIC_API_KEY === 'undefined' || !ANTHROPIC_API_KEY) {
    return jsonRes({ error: 'ANTHROPIC_API_KEY is not configured in Worker secrets.' }, 500);
  }

  const session = await kvGet(`session:${token}`);
  if (!session) return jsonRes({ error: 'Session not found' }, 404);

  const responses = (session.responses || []).filter(r => r.driveItemId);
  if (!responses.length) return jsonRes({ error: 'No recordings found for this session.' }, 400);

  const interview  = await kvGet(`interview:${session.interviewId}`);
  const questions  = interview?.questions || [];
  const accessToken = await getAccessToken();

  // ── Step 1: resolve @microsoft.graph.downloadUrl for every response ──
  const downloadItems = await Promise.all(responses.map(async r => {
    try {
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users/${ONEDRIVE_USER}/drive/items/${r.driveItemId}`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      const item = await res.json();
      return { qIndex: r.questionIndex, url: item['@microsoft.graph.downloadUrl'] || null };
    } catch {
      return { qIndex: r.questionIndex, url: null };
    }
  }));

  // ── Step 2: download each video + transcribe via OpenAI Whisper (parallel) ──
  const transcripts = await Promise.all(downloadItems.map(async ({ qIndex, url }) => {
    const qText = questions[qIndex]?.text || `Question ${qIndex + 1}`;

    if (!url) {
      return { qIndex, qText, transcript: '[Recording unavailable]', error: true };
    }
    try {
      const videoRes = await fetch(url);
      if (!videoRes.ok) {
        return { qIndex, qText, transcript: '[Download failed]', error: true };
      }
      const blob = await videoRes.blob();

      // Whisper hard limit is 25 MB
      if (blob.size > 24 * 1024 * 1024) {
        return { qIndex, qText, transcript: '[Recording too large to transcribe (>24 MB)]', error: true };
      }

      const form = new FormData();
      form.append('file', blob, `q${qIndex + 1}.webm`);
      form.append('model', 'whisper-1');
      form.append('language', 'en');

      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: form,
      });
      if (!whisperRes.ok) {
        const e = await whisperRes.json().catch(() => ({}));
        console.error(`[analyze] Whisper Q${qIndex + 1}:`, JSON.stringify(e));
        return { qIndex, qText, transcript: '[Transcription failed]', error: true };
      }
      const wData = await whisperRes.json();
      return { qIndex, qText, transcript: wData.text?.trim() || '' };
    } catch (e) {
      console.error(`[analyze] Q${qIndex + 1} exception:`, e.message);
      return { qIndex, qText, transcript: '[Error: ' + e.message + ']', error: true };
    }
  }));

  // Sort by question order
  transcripts.sort((a, b) => a.qIndex - b.qIndex);

  // ── Step 3: analyze with Claude ──
  const qaBlock = transcripts.map(t =>
    `Question ${t.qIndex + 1}: ${t.qText}\nCandidate's answer: ${t.transcript}`
  ).join('\n\n---\n\n');

  const prompt = `You are a professional recruiter evaluating a candidate's English language proficiency from their video interview answers.

Candidate: ${session.candidateName}

${qaBlock}

Rate each answer's English on a 1–5 scale:
1 ⭐ Very limited — hard to follow, major errors, very basic vocabulary
2 ⭐⭐ Basic — understandable but frequent grammar/vocabulary errors
3 ⭐⭐⭐ Intermediate — communicates ideas, noticeable but not blocking errors
4 ⭐⭐⭐⭐ Good — fluent and professional, occasional minor errors
5 ⭐⭐⭐⭐⭐ Excellent — near-native, sophisticated vocabulary, polished tone

Criteria: grammar accuracy, vocabulary range, sentence complexity, fluency, professional tone.

Respond with ONLY a valid JSON object — no commentary before or after:
{
  "questions": [
    {
      "questionIndex": 0,
      "stars": 4,
      "feedback": "One concise sentence summarising this answer's English quality."
    }
  ],
  "overall": {
    "stars": 4,
    "level": "Good",
    "summary": "2–3 sentence professional summary of the candidate's overall English proficiency."
  }
}`;

  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  if (!claudeRes.ok) {
    const e = await claudeRes.json().catch(() => ({}));
    console.error('[analyze] Claude error:', JSON.stringify(e));
    return jsonRes({ error: 'Analysis failed: ' + (e.error?.message || claudeRes.status) }, 500);
  }

  const claudeData = await claudeRes.json();
  const rawText = claudeData.content?.[0]?.text || '{}';

  let analysis;
  try {
    const match = rawText.match(/\{[\s\S]*\}/);
    analysis = JSON.parse(match ? match[0] : rawText);
  } catch (e) {
    console.error('[analyze] JSON parse failed. Raw:', rawText.slice(0, 300));
    return jsonRes({ error: 'Could not parse AI response. Raw: ' + rawText.slice(0, 200) }, 500);
  }

  // Attach transcripts to each question result
  analysis.questions = (analysis.questions || []).map(q => {
    const t = transcripts.find(t => t.qIndex === q.questionIndex);
    return { ...q, transcript: t?.transcript || '', qText: t?.qText || '' };
  });
  analysis.analyzedAt     = Date.now();
  analysis.candidateName  = session.candidateName;

  // Cache in KV
  await kvPut(`session:${token}:analysis`, analysis);
  return jsonRes(analysis);
}

async function getAnalysis(token, request) {
  requireAdmin(request);
  const analysis = await kvGet(`session:${token}:analysis`);
  if (!analysis) return jsonRes({ notFound: true });
  return jsonRes(analysis);
}
