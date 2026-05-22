// ─────────────────────────────────────────────────────────────
//  Interview Admin Panel
// ─────────────────────────────────────────────────────────────

const WORKER_URL = 'https://interview-api.putuastrawijaya.workers.dev';

// ── State ─────────────────────────────────────────────────────
let adminKey = '';
let questions = [];
let currentInterviewId = null;
let editInterviewId = null;
let editQuestions = [];
let _allInterviews = [];
let _allSessions = [];
let _sessionFilter = 'all';
let _allTWSessions = [];
let _twFilter = 'all';
let _twSort = 'asc';
let _bulkRows = [];
let _bulkHeaders = [];
let _bulkNameCol = null;
let _bulkEmailCol = null;

// ── Auth ──────────────────────────────────────────────────────

async function doLogin() {
  const key = document.getElementById('key-input').value.trim();
  if (!key) return;
  try {
    const res = await api('GET', '/api/interviews', null, key);
    if (res.status === 401) {
      document.getElementById('login-err').style.display = 'block';
      return;
    }
    adminKey = key;
    sessionStorage.setItem('interview_admin_key', key);
    showApp();
  } catch {
    document.getElementById('login-err').style.display = 'block';
  }
}

function doLogout() {
  sessionStorage.removeItem('interview_admin_key');
  adminKey = '';
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-gate').style.display = 'flex';
}

function showApp() {
  document.getElementById('login-gate').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  const valid = ['ow-list', 'ow-create', 'tw-list', 'tw-schedule'];
  const hash  = window.location.hash.replace('#', '');
  gotoPage(valid.includes(hash) ? hash : 'ow-list');
}

window.addEventListener('DOMContentLoaded', () => {
  const saved = sessionStorage.getItem('interview_admin_key');
  if (saved) { adminKey = saved; showApp(); }
  document.getElementById('key-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
});

// ── API client ────────────────────────────────────────────────

async function api(method, path, body = null, keyOverride = null) {
  return fetch(WORKER_URL + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': keyOverride || adminKey },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function apiJSON(method, path, body = null) {
  const res = await api(method, path, body);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// ── Navigation ────────────────────────────────────────────────

function toggleSidebarGroup(btn) {
  const expanded = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  btn.nextElementSibling.classList.toggle('collapsed', expanded);
}

function gotoPage(page) {
  history.replaceState(null, '', '#' + page);
  const activeNav = ['ow-create', 'ow-list'].includes(page) ? 'ow-list' : 'tw-list';
  document.querySelectorAll('.sidebar-item').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.page === activeNav)
  );
  const main = document.getElementById('admin-main');
  main.innerHTML = '<div class="spinner" style="margin:auto;margin-top:80px"></div>';

  if (page === 'ow-list')     renderOWListPage();
  if (page === 'ow-create')   renderOWCreatePage();
  if (page === 'tw-list')     renderTWListPage();
  if (page === 'tw-schedule') renderTWSchedulePage();
}

// ── One-Way: List page ────────────────────────────────────────

async function renderOWListPage() {
  const main = document.getElementById('admin-main');
  main.innerHTML = `
    <div class="flex justify-between items-center mb-16">
      <h2>One-Way Interviews</h2>
      <button class="btn btn-primary" onclick="gotoPage('ow-create')">+ New Interview</button>
    </div>
    <div class="flex gap-8 mb-16 items-center">
      <input type="text" id="search-interviews" placeholder="Search interviews…"
        oninput="filterAndRenderInterviews()"
        style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:7px 12px;color:var(--text);font-size:13px;width:220px" />
      <select id="sort-interviews" onchange="filterAndRenderInterviews()"
        style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:7px 12px;color:var(--text);font-size:13px">
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="az">A → Z</option>
        <option value="za">Z → A</option>
        <option value="candidates">Most candidates</option>
      </select>
    </div>
    <div id="interviews-list"><div class="empty-state">Loading…</div></div>
  `;
  loadInterviews();
}

// ── One-Way: Create page ──────────────────────────────────────

function renderOWCreatePage() {
  questions = [{ text: '', duration: 120 }];
  const main = document.getElementById('admin-main');
  main.innerHTML = `
    <div style="max-width:680px">
      <h2 class="mb-16">New One-Way Interview</h2>
      <div class="card">
        <div class="form-group">
          <label>Interview Title *</label>
          <input type="text" id="new-title" placeholder="e.g. J1 Intern Initial Screening" />
        </div>
        <div class="form-group">
          <label>Description (shown to candidate)</label>
          <textarea id="new-desc" placeholder="Brief instructions for the candidate..."></textarea>
        </div>
        <hr class="divider" />
        <div class="flex justify-between items-center mb-16">
          <h3>Questions</h3>
          <button class="btn btn-outline" onclick="addQuestion()">+ Add Question</button>
        </div>
        <div id="questions-builder"></div>
        <div class="mt-24 flex gap-8">
          <button class="btn btn-primary" onclick="submitInterview()">Create Interview</button>
          <button class="btn btn-outline" onclick="gotoPage('ow-list')">Cancel</button>
        </div>
      </div>
    </div>
  `;
  renderQuestions();
}

// ── Interviews list ───────────────────────────────────────────

async function loadInterviews() {
  const el = document.getElementById('interviews-list');
  if (!el) return;
  el.innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    const interviews = await apiJSON('GET', '/api/interviews');
    _allInterviews = interviews;
    if (!interviews.length) {
      el.innerHTML = `<div class="empty-state">No interviews yet. <button class="btn btn-primary" style="margin-top:12px" onclick="gotoPage('ow-create')">Create one</button></div>`;
      return;
    }
    filterAndRenderInterviews();
  } catch (e) {
    el.innerHTML = `<div class="empty-state" style="color:var(--red)">${e.message}</div>`;
  }
}

function filterAndRenderInterviews() {
  const query = (document.getElementById('search-interviews')?.value || '').trim().toLowerCase();
  const sort = document.getElementById('sort-interviews')?.value || 'newest';

  let list = _allInterviews.filter(i => !query || i.title.toLowerCase().includes(query));
  list.sort((a, b) => {
    if (sort === 'newest')     return b.createdAt - a.createdAt;
    if (sort === 'oldest')     return a.createdAt - b.createdAt;
    if (sort === 'az')         return a.title.localeCompare(b.title);
    if (sort === 'za')         return b.title.localeCompare(a.title);
    if (sort === 'candidates') return (b._counts?.total || 0) - (a._counts?.total || 0);
    return 0;
  });

  const el = document.getElementById('interviews-list');
  if (!el) return;
  if (!list.length) {
    el.innerHTML = '<div class="empty-state">No interviews match your search.</div>';
    return;
  }
  el.innerHTML = list.map(renderInterviewCard).join('');
}

function renderInterviewCard(interview) {
  const qCount = interview.questions?.length || 0;
  const created = new Date(interview.createdAt).toLocaleDateString();
  const c = interview._counts || { total: 0, pending: 0, completed: 0 };

  const candidateLine = c.total > 0
    ? `<span style="font-weight:600">${c.total} Candidate${c.total !== 1 ? 's' : ''}</span> <span class="text-muted">&nbsp;·&nbsp; ${c.pending} Pending &nbsp;·&nbsp; ${c.completed} Completed</span>`
    : `<span class="text-muted">No candidates yet</span>`;

  return `
    <div class="card" style="margin-bottom:10px">
      <div class="flex justify-between items-center">
        <div>
          <h3>${esc(interview.title)}</h3>
          <p class="text-muted text-sm" style="margin-top:4px">${qCount} question${qCount !== 1 ? 's' : ''} &nbsp;·&nbsp; Created ${created}</p>
          <p class="text-sm" style="margin-top:6px">${candidateLine}</p>
        </div>
        <div class="flex gap-8 items-center">
          <button class="btn btn-primary" onclick="openSessions('${interview.id}', '${esc(interview.title)}', 'candidates')">Candidates</button>
          <button class="btn btn-outline" onclick="openSessions('${interview.id}', '${esc(interview.title)}', 'invite')">Invite</button>
          <button class="btn btn-ghost" style="padding:6px 10px;font-size:15px" title="Edit" onclick="openEditInterview('${interview.id}')">✏</button>
          <button class="btn btn-ghost" style="padding:6px 10px;font-size:15px;color:var(--red)" title="Delete" onclick="deleteInterview('${interview.id}')">🗑</button>
        </div>
      </div>
    </div>
  `;
}

async function deleteInterview(id) {
  if (!confirm('Delete this interview and all its sessions?')) return;
  try {
    await apiJSON('DELETE', `/api/interview/${id}`);
    toast('Interview deleted', 'success');
    loadInterviews();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ── Questions builder (one-way) ───────────────────────────────

function addQuestion() {
  questions.push({ text: '', duration: 120 });
  renderQuestions();
}

function removeQuestion(i) {
  if (questions.length === 1) return toast('Need at least one question', 'error');
  questions.splice(i, 1);
  renderQuestions();
}

function moveQuestion(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= questions.length) return;
  [questions[i], questions[j]] = [questions[j], questions[i]];
  renderQuestions();
}

function renderQuestions() {
  const builder = document.getElementById('questions-builder');
  if (!builder) return;
  builder.innerHTML = questions.map((q, i) => `
    <div class="question-item">
      <div class="q-num">${i + 1}</div>
      <div class="q-fields">
        <input type="text" placeholder="Question text *" value="${esc(q.text)}"
          oninput="questions[${i}].text = this.value" />
        <select onchange="questions[${i}].duration = parseInt(this.value)">
          ${[30, 60, 90, 120, 180, 240, 300].map(s =>
            `<option value="${s}" ${q.duration === s ? 'selected' : ''}>${s}s (${s < 60 ? s + 's' : (s/60) + ' min'})</option>`
          ).join('')}
        </select>
      </div>
      <button class="btn btn-ghost" onclick="moveQuestion(${i}, -1)" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="btn btn-ghost" onclick="removeQuestion(${i})" style="color:var(--red)">✕</button>
    </div>
  `).join('');
}

async function submitInterview() {
  const title = document.getElementById('new-title').value.trim();
  const description = document.getElementById('new-desc').value.trim();
  if (!title) return toast('Title is required', 'error');
  if (questions.some(q => !q.text.trim())) return toast('All questions need text', 'error');
  try {
    await apiJSON('POST', '/api/interviews', { title, description, questions });
    toast('Interview created!', 'success');
    gotoPage('ow-list');
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ── Two-Way: List page ────────────────────────────────────────

async function renderTWListPage() {
  const main = document.getElementById('admin-main');
  main.innerHTML = `
    <div class="flex justify-between items-center mb-16">
      <h2>Two-Way Interview Sessions</h2>
      <button class="btn btn-primary" onclick="gotoPage('tw-schedule')">+ Schedule</button>
    </div>
    <div class="flex gap-8 mb-16 items-center">
      <input type="text" id="tw-search" placeholder="Search candidates…"
        oninput="filterAndRenderTWSessions()"
        style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:7px 12px;color:var(--text);font-size:13px;width:220px" />
      <div class="flex gap-8">
        <button class="filter-chip active" id="tw-fc-all"       onclick="setTWFilter('all')">All</button>
        <button class="filter-chip"        id="tw-fc-scheduled"  onclick="setTWFilter('scheduled')">Scheduled</button>
        <button class="filter-chip"        id="tw-fc-completed"  onclick="setTWFilter('completed')">Completed</button>
        <button class="filter-chip"        id="tw-fc-cancelled"  onclick="setTWFilter('cancelled')">Cancelled</button>
      </div>
    </div>
    <div class="tw-table-header">
      <span>Candidate</span>
      <span>Position</span>
      <span style="cursor:pointer;user-select:none" onclick="toggleTWSort()">Scheduled <span id="tw-sort-indicator">↑</span></span>
      <span style="text-align:center">Status</span>
      <span style="text-align:right">Actions</span>
    </div>
    <div id="tw-sessions-list"></div>
  `;
  await loadTWSessions();
}

async function loadTWSessions() {
  const el = document.getElementById('tw-sessions-list');
  if (!el) return;
  el.innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    const sessions = await apiJSON('GET', '/api/tw-sessions');
    _allTWSessions = sessions;
    _twFilter = 'all';
    setTWFilter('all');
  } catch (e) {
    el.innerHTML = `<div class="empty-state" style="color:var(--red)">${e.message}</div>`;
  }
}

function toggleTWSort() {
  _twSort = _twSort === 'asc' ? 'desc' : 'asc';
  const ind = document.getElementById('tw-sort-indicator');
  if (ind) ind.textContent = _twSort === 'asc' ? '↑' : '↓';
  filterAndRenderTWSessions();
}

function setTWFilter(filter) {
  _twFilter = filter;
  ['all', 'scheduled', 'completed', 'cancelled'].forEach(f => {
    const chip = document.getElementById(`tw-fc-${f}`);
    if (chip) chip.classList.toggle('active', f === filter);
  });
  filterAndRenderTWSessions();
}

function filterAndRenderTWSessions() {
  const query = (document.getElementById('tw-search')?.value || '').trim().toLowerCase();
  let list = _allTWSessions.filter(s => {
    if (_twFilter !== 'all' && s.status !== _twFilter) return false;
    if (query && !s.candidateName.toLowerCase().includes(query) &&
        !(s.candidateEmail || '').toLowerCase().includes(query) &&
        !(s.position || '').toLowerCase().includes(query)) return false;
    return true;
  });

  list.sort((a, b) => {
    const ta = a.scheduledAt || 0, tb = b.scheduledAt || 0;
    return _twSort === 'asc' ? ta - tb : tb - ta;
  });

  const el = document.getElementById('tw-sessions-list');
  if (!el) return;
  if (!list.length) {
    el.innerHTML = `<div class="empty-state">${_allTWSessions.length ? 'No sessions match your filter.' : 'No sessions scheduled yet.'}</div>`;
    return;
  }
  el.innerHTML = list.map(renderTWSessionRow).join('');
}

function renderTWSessionRow(s) {
  const dt = s.scheduledAt ? new Date(s.scheduledAt) : null;
  const dateStr = dt ? dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const timeStr = dt ? dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';

  const statusBadge = {
    scheduled: `<span class="badge badge-pending">Scheduled</span>`,
    completed:  `<span class="badge badge-completed">Completed</span>`,
    cancelled:  `<span class="badge" style="background:rgba(148,163,184,0.15);color:var(--muted)">Cancelled</span>`,
  }[s.status] || `<span class="badge badge-pending">${esc(s.status)}</span>`;

  let actions = '';
  if (s.status === 'scheduled') {
    actions = `
      ${s.meetingLink ? `<a href="${esc(s.meetingLink)}" target="_blank" class="btn btn-ghost" style="padding:4px 8px;font-size:12px">${s.teamsGenerated ? '🟦' : '🔗'} Join</a>` : ''}
      <button class="btn btn-outline" style="padding:4px 10px;font-size:12px" onclick="markTWCompleted('${s.id}')">✓ Done</button>
      <button class="btn btn-danger"  style="padding:4px 10px;font-size:12px" onclick="cancelTWSession('${s.id}', '${esc(s.candidateName)}')">Cancel</button>
    `;
  } else if (s.status === 'completed') {
    const recBtn = s.recordingDriveItemId
      ? `<button class="btn btn-outline" style="padding:4px 10px;font-size:12px;color:var(--accent);border-color:var(--accent)" onclick="openTWRecording('${s.id}')">▶ Recording</button>`
      : `<button class="btn btn-ghost"   style="padding:4px 10px;font-size:12px" title="Search OneDrive Recordings folder" onclick="fetchAndRefreshTWRecording('${s.id}')">⟳ Fetch Recording</button>`;
    actions = `
      ${recBtn}
      <button class="btn btn-ghost" style="padding:4px 8px;font-size:15px;color:var(--muted);line-height:1" title="Delete session" onclick="deleteTWSession('${s.id}', '${esc(s.candidateName)}')">🗑</button>
    `;
  } else {
    actions = `<button class="btn btn-ghost" style="padding:4px 8px;font-size:15px;color:var(--muted);line-height:1" title="Delete session" onclick="deleteTWSession('${s.id}', '${esc(s.candidateName)}')">🗑</button>`;
  }

  return `
    <div class="tw-session-row">
      <div style="min-width:0">
        <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.candidateName)}</div>
        <div class="text-muted" style="font-size:11px">${s.candidateEmail ? esc(s.candidateEmail) : ''}${s.teamsGenerated ? ' &nbsp;·&nbsp; <span style="color:#6264a7">Teams</span>' : ''}</div>
      </div>
      <div style="font-size:13px;color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.position || '—')}</div>
      <div>
        <div style="font-size:13px">${dateStr}</div>
        <div class="text-muted" style="font-size:11px">${timeStr}${s.duration ? ' · ' + s.duration + ' min' : ''}</div>
      </div>
      <div style="text-align:center">${statusBadge}</div>
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:6px">${actions}</div>
    </div>
  `;
}

async function markTWCompleted(id) {
  if (!confirm('Mark this session as completed?')) return;
  try {
    await apiJSON('PUT', `/api/tw-session/${id}`, { status: 'completed' });
    toast('Marked as completed — searching for recording…', 'info');
    await loadTWSessions();
    // Auto-try to find the recording in OneDrive
    try {
      const result = await apiJSON('POST', `/api/tw-session/${id}/fetch-recording`);
      if (result.ok) {
        toast('Recording found and linked!', 'success');
        await loadTWSessions();
      } else {
        toast(result.message || 'No recording found yet — use ⟳ Fetch Recording to retry later.', 'info');
      }
    } catch { /* recording not ready yet */ }
  } catch (e) { toast(e.message, 'error'); }
}

async function fetchAndRefreshTWRecording(id) {
  toast('Searching OneDrive Recordings…', 'info');
  try {
    const result = await apiJSON('POST', `/api/tw-session/${id}/fetch-recording`);
    if (result.ok) {
      toast('Recording found: ' + result.fileName, 'success');
      await loadTWSessions();
    } else {
      toast(result.message || 'No recording found yet.', 'info');
    }
  } catch (e) { toast(e.message, 'error'); }
}

async function openTWRecording(id) {
  toast('Loading recording…', 'info');
  try {
    const { downloadUrl, webUrl, fileName } = await apiJSON('GET', `/api/tw-session/${id}/recording-url`);
    document.getElementById('review-candidate-name').textContent = fileName || 'Meeting Recording';
    document.getElementById('review-interview-title').textContent = 'Two-Way Interview Recording';
    document.getElementById('review-content').innerHTML = downloadUrl
      ? `<video src="${downloadUrl}" controls style="width:100%;border-radius:6px;background:#000;display:block"></video>
         <div class="mt-8" style="text-align:right">
           <a href="${webUrl}" target="_blank" class="btn btn-ghost" style="font-size:11px">Open in OneDrive ↗</a>
         </div>`
      : `<div class="empty-state"><a href="${webUrl}" target="_blank" class="btn btn-primary">Open Recording in OneDrive ↗</a></div>`;
    openModal('modal-review');
  } catch (e) { toast(e.message, 'error'); }
}

async function cancelTWSession(id, name) {
  if (!confirm(`Cancel ${name}'s interview session?`)) return;
  try {
    await apiJSON('PUT', `/api/tw-session/${id}`, { status: 'cancelled' });
    toast('Session cancelled', 'success');
    await loadTWSessions();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteTWSession(id, name) {
  if (!confirm(`Delete ${name}'s session record?`)) return;
  try {
    await apiJSON('DELETE', `/api/tw-session/${id}`);
    toast('Session deleted', 'success');
    await loadTWSessions();
  } catch (e) { toast(e.message, 'error'); }
}

// ── Two-Way: Schedule page ────────────────────────────────────


function renderTWSchedulePage() {
  const main = document.getElementById('admin-main');
  main.innerHTML = `
    <div style="max-width:680px">
      <h2 class="mb-16">Schedule Two-Way Interview</h2>
      <div class="card">
        <div class="form-row" style="grid-template-columns:1fr 1fr;gap:16px">
          <div class="form-group" style="margin-bottom:0">
            <label>Candidate Name *</label>
            <input type="text" id="tw-cand-name" placeholder="Full name" />
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label>Candidate Email *</label>
            <input type="email" id="tw-cand-email" placeholder="email@example.com" />
          </div>
        </div>
        <div class="form-group mt-16">
          <label>Position / Role *</label>
          <input type="text" id="tw-position" placeholder="e.g. J1 Summer Intern – Marketing" />
        </div>
        <div class="form-row mt-8" style="grid-template-columns:1fr 1fr 1fr;gap:16px">
          <div class="form-group" style="margin-bottom:0">
            <label>Date *</label>
            <input type="date" id="tw-date"
              value="${(() => { const d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().split('T')[0]; })()}"
              min="${new Date().toISOString().split('T')[0]}" />
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label>Time * &nbsp;<span style="font-size:10px;font-weight:400;text-transform:none;letter-spacing:0;color:var(--muted)">${(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch(e){ return ''; } })()}</span></label>
            <div style="display:flex;gap:6px">
              <select id="tw-time-h" style="flex:1">${[...Array(12)].map((_,i)=>{ const v=String(i+1).padStart(2,'0'); return `<option value="${v}"${i===8?' selected':''}>${v}</option>`; }).join('')}</select>
              <select id="tw-time-m" style="flex:1"><option value="00" selected>00</option><option value="15">15</option><option value="30">30</option><option value="45">45</option></select>
              <select id="tw-time-ap" style="flex:1"><option value="AM" selected>AM</option><option value="PM">PM</option></select>
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label>Duration</label>
            <select id="tw-duration">
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60" selected>60 minutes</option>
              <option value="90">90 minutes</option>
              <option value="120">2 hours</option>
            </select>
          </div>
        </div>

        <!-- Teams meeting section -->
        <div class="form-group mt-16">
          <label>Microsoft Teams Meeting</label>
          <div style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;background:var(--bg);border:1px solid var(--border);border-radius:6px;cursor:pointer"
            onclick="document.getElementById('tw-auto-meeting').click()">
            <input type="checkbox" id="tw-auto-meeting" checked
              style="accent-color:var(--accent);width:16px;height:16px;flex-shrink:0;margin-top:2px;cursor:pointer"
              onclick="event.stopPropagation()"
              onchange="toggleTWAutoMeeting(this.checked)" />
            <div>
              <div style="font-size:13px;font-weight:600;color:var(--text)">Auto-generate Microsoft Teams link</div>
              <div style="font-size:11px;color:var(--muted);margin-top:2px" id="tw-teams-description">
                Creates a Teams meeting on <strong style="color:var(--text-2)">corporate-recruiter@cti-usa.com</strong> calendar.
                Candidate receives a calendar invite with the join link automatically.
              </div>
            </div>
          </div>
        </div>
        <div id="tw-manual-link-wrap" style="display:none">
          <div class="form-group">
            <label>Meeting Link (manual)</label>
            <input type="url" id="tw-meeting-link" placeholder="https://teams.microsoft.com/… or Zoom link" />
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;cursor:pointer"
            onclick="document.getElementById('tw-send-email').click()">
            <input type="checkbox" id="tw-send-email"
              style="accent-color:var(--accent);width:14px;height:14px;flex-shrink:0;cursor:pointer"
              onclick="event.stopPropagation()" />
            <span style="font-size:13px;color:var(--muted)">Send email invite to candidate</span>
          </div>
        </div>

        <div class="form-group mt-8">
          <label>Notes (optional)</label>
          <textarea id="tw-notes" placeholder="Internal notes about this session..."></textarea>
        </div>
        <div class="flex gap-8 items-center">
          <button class="btn btn-primary" id="tw-schedule-btn" onclick="submitTWSession()">Schedule &amp; Create Teams Meeting</button>
          <button class="btn btn-outline" onclick="gotoPage('tw-list')">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function toggleTWAutoMeeting(checked) {
  document.getElementById('tw-manual-link-wrap').style.display = checked ? 'none' : 'block';
  document.getElementById('tw-schedule-btn').textContent = checked
    ? 'Schedule & Create Teams Meeting'
    : 'Schedule Interview';
}

async function submitTWSession() {
  const candidateName  = document.getElementById('tw-cand-name').value.trim();
  const candidateEmail = document.getElementById('tw-cand-email').value.trim();
  const position       = document.getElementById('tw-position').value.trim();
  const date           = document.getElementById('tw-date').value;
  const twH = document.getElementById('tw-time-h').value;
  const twM = document.getElementById('tw-time-m').value;
  const twAP = document.getElementById('tw-time-ap').value;
  let twHour24 = parseInt(twH);
  if (twAP === 'PM' && twHour24 !== 12) twHour24 += 12;
  if (twAP === 'AM' && twHour24 === 12) twHour24 = 0;
  const time = `${String(twHour24).padStart(2,'0')}:${twM}`;
  const duration       = parseInt(document.getElementById('tw-duration').value);
  const autoMeeting    = document.getElementById('tw-auto-meeting').checked;
  const meetingLink    = !autoMeeting ? (document.getElementById('tw-meeting-link')?.value.trim() || '') : '';
  const notes          = document.getElementById('tw-notes').value.trim();
  const sendEmail      = !autoMeeting && document.getElementById('tw-send-email')?.checked;

  if (!candidateName)  return toast('Candidate name is required', 'error');
  if (!candidateEmail) return toast('Candidate email is required', 'error');
  if (!position)       return toast('Position is required', 'error');
  if (!date || !time)  return toast('Date and time are required', 'error');

  const btn = document.getElementById('tw-schedule-btn');
  btn.disabled = true;
  btn.textContent = autoMeeting ? 'Creating Teams meeting…' : 'Scheduling…';

  const scheduledAt = new Date(`${date}T${time}`).getTime();

  try {
    const session = await apiJSON('POST', '/api/tw-sessions', {
      candidateName, candidateEmail, position,
      scheduledAt, duration, meetingLink, notes, autoMeeting,
    });

    if (session.teamsError) {
      toast('Scheduled, but Teams failed: ' + session.teamsError, 'info');
    } else if (autoMeeting && session.teamsGenerated) {
      toast('Teams meeting created! Calendar invite sent to candidate.', 'success');
    } else if (sendEmail && session.id) {
      try {
        await apiJSON('POST', `/api/tw-session/${session.id}/send-email`);
        toast('Session scheduled & email sent!', 'success');
      } catch {
        toast('Scheduled, but email could not be sent', 'info');
      }
    } else {
      toast('Session scheduled!', 'success');
    }
    gotoPage('tw-list');
  } catch (e) {
    toast(e.message, 'error');
    btn.disabled = false;
    btn.textContent = autoMeeting ? 'Schedule & Create Teams Meeting' : 'Schedule Interview';
  }
}

// ── Sessions modal (one-way) ──────────────────────────────────

function switchSessionTab(name) {
  ['invite', 'candidates'].forEach(t => {
    document.getElementById(`session-pane-${t}`).style.display = t === name ? 'block' : 'none';
  });
}

function resetInviteForm() {
  document.getElementById('new-cand-name').value = '';
  document.getElementById('new-cand-email').value = '';
  document.getElementById('generated-link-box').style.display = 'none';
  const btn = document.getElementById('send-email-btn');
  btn.style.display = 'none';
  btn.disabled = false;
  btn.textContent = '✉ Send Email';
  resetBulkUpload();
  switchInviteMode('single');
}

// ── Invite mode toggle ────────────────────────────────────────

function switchInviteMode(mode) {
  document.getElementById('invite-single-section').style.display = mode === 'single' ? 'block' : 'none';
  document.getElementById('invite-bulk-section').style.display   = mode === 'bulk'   ? 'block' : 'none';
  document.getElementById('invite-mode-single').classList.toggle('active', mode === 'single');
  document.getElementById('invite-mode-bulk').classList.toggle('active',   mode === 'bulk');
}

// ── Bulk import ───────────────────────────────────────────────

async function handleBulkFile(file) {
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();

  let rows, headers;
  try {
    if (ext === 'csv') {
      const text = await file.text();
      ({ rows, headers } = parseCsvText(text));
    } else if (ext === 'xlsx' || ext === 'xls') {
      if (typeof XLSX === 'undefined') return toast('Excel library not loaded — try CSV instead', 'error');
      const buffer = await file.arrayBuffer();
      ({ rows, headers } = parseXlsxBuffer(buffer));
    } else {
      return toast('Please upload a .csv, .xlsx, or .xls file', 'error');
    }
  } catch (e) {
    return toast('Could not read file: ' + e.message, 'error');
  }

  if (!rows.length) return toast('No data rows found in file', 'error');

  _bulkRows    = rows;
  _bulkHeaders = headers;

  // Auto-detect name column
  _bulkNameCol = detectBestCol(headers, ['full name', 'fullname', 'name', 'candidate']);
  if (!_bulkNameCol) {
    const first = headers.find(h => /first.?name|fname/i.test(h));
    const last  = headers.find(h => /last.?name|lname|surname/i.test(h));
    if (first && last) _bulkNameCol = `__concat__${first}__${last}`;
    else _bulkNameCol = first || last || headers[0];
  }

  // Auto-detect email column
  _bulkEmailCol = detectBestCol(headers, ['email', 'e-mail', 'mail']);

  renderBulkPreview();
}

function detectBestCol(headers, keywords) {
  for (const kw of keywords) {
    const m = headers.find(h => h.toLowerCase().includes(kw));
    if (m) return m;
  }
  return null;
}

function parseCsvText(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (!lines.length) return { rows: [], headers: [] };

  const parseRow = line => {
    const result = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseRow(lines[i]);
    if (cells.every(c => !c)) continue;
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = cells[idx] || ''; });
    rows.push(obj);
  }
  return { rows, headers };
}

function parseXlsxBuffer(buffer) {
  const wb   = XLSX.read(buffer, { type: 'array' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!data.length) return { rows: [], headers: [] };

  const headers = data[0].map(String);
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const cells = data[i];
    if (cells.every(c => !String(c))) continue;
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = String(cells[idx] ?? ''); });
    rows.push(obj);
  }
  return { rows, headers };
}

function getBulkName(row) {
  if (_bulkNameCol?.startsWith('__concat__')) {
    const parts = _bulkNameCol.slice('__concat__'.length).split('__');
    return parts.map(k => row[k] || '').filter(Boolean).join(' ');
  }
  return row[_bulkNameCol] || '';
}

function getBulkEmail(row) {
  return row[_bulkEmailCol] || '';
}

function renderBulkPreview() {
  const section = document.getElementById('bulk-preview-section');

  // Build name options (includes concat option if first+last exist)
  const first = _bulkHeaders.find(h => /first.?name|fname/i.test(h));
  const last  = _bulkHeaders.find(h => /last.?name|lname|surname/i.test(h));
  const concatKey = first && last ? `__concat__${first}__${last}` : null;

  const nameOpts = [
    ...(concatKey ? [`<option value="${esc(concatKey)}" ${_bulkNameCol === concatKey ? 'selected' : ''}>First + Last Name</option>`] : []),
    ..._bulkHeaders.map(h => `<option value="${esc(h)}" ${_bulkNameCol === h ? 'selected' : ''}>${esc(h)}</option>`),
  ].join('');

  const emailOpts = _bulkHeaders
    .map(h => `<option value="${esc(h)}" ${_bulkEmailCol === h ? 'selected' : ''}>${esc(h)}</option>`)
    .join('');

  const preview = _bulkRows.slice(0, 5);
  const validCount = _bulkRows.filter(r => getBulkName(r) && getBulkEmail(r)).length;

  section.style.display = 'block';
  section.innerHTML = `
    <div style="margin-top:14px;padding:14px 16px;background:var(--bg);border:1px solid var(--border);border-radius:8px">
      <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end;margin-bottom:14px">
        <div>
          <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted);display:block;margin-bottom:4px">Name Column</label>
          <select id="bulk-name-col" onchange="_bulkNameCol=this.value;renderBulkPreview()"
            style="width:100%;background:var(--card);border:1px solid var(--border);border-radius:6px;padding:7px 10px;color:var(--text);font-size:13px;font-family:inherit">
            ${nameOpts}
          </select>
        </div>
        <div>
          <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted);display:block;margin-bottom:4px">Email Column</label>
          <select id="bulk-email-col" onchange="_bulkEmailCol=this.value;renderBulkPreview()"
            style="width:100%;background:var(--card);border:1px solid var(--border);border-radius:6px;padding:7px 10px;color:var(--text);font-size:13px;font-family:inherit">
            ${emailOpts}
          </select>
        </div>
        <button class="btn btn-ghost" style="font-size:12px;white-space:nowrap" onclick="resetBulkUpload()">✕ Clear</button>
      </div>

      <div style="font-size:12px;color:var(--muted);margin-bottom:6px">
        Preview — first 5 of <strong style="color:var(--text)">${_bulkRows.length}</strong> rows
        ${validCount < _bulkRows.length ? `<span style="color:var(--red)">&nbsp;·&nbsp; ${_bulkRows.length - validCount} rows missing name or email</span>` : ''}
      </div>
      <div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:14px">
        <div style="display:grid;grid-template-columns:1fr 1fr;padding:7px 12px;background:var(--card-2);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted)">
          <span>Name</span><span>Email</span>
        </div>
        ${preview.map(r => {
          const name = getBulkName(r), email = getBulkEmail(r);
          return `<div style="display:grid;grid-template-columns:1fr 1fr;padding:7px 12px;border-top:1px solid rgba(51,65,85,0.5);font-size:12px${!name || !email ? ';background:rgba(239,68,68,0.05)' : ''}">
            <span style="${!name ? 'color:var(--red)' : ''}">${name || '⚠ missing'}</span>
            <span style="${!email ? 'color:var(--red)' : ''}">${email || '⚠ missing'}</span>
          </div>`;
        }).join('')}
        ${_bulkRows.length > 5 ? `<div style="padding:6px 12px;border-top:1px solid rgba(51,65,85,0.5);font-size:11px;color:var(--muted);text-align:center">and ${_bulkRows.length - 5} more…</div>` : ''}
      </div>

      <div class="flex gap-8 items-center">
        <button class="btn btn-primary"  onclick="runBulkImport(false)">Generate Links for ${validCount}</button>
        <button class="btn btn-outline"  onclick="runBulkImport(true)">Generate &amp; Send Emails</button>
      </div>
    </div>
  `;
}

function resetBulkUpload() {
  _bulkRows = []; _bulkHeaders = []; _bulkNameCol = null; _bulkEmailCol = null;
  const preview  = document.getElementById('bulk-preview-section');
  const progress = document.getElementById('bulk-import-progress');
  if (preview)  { preview.style.display  = 'none'; preview.innerHTML  = ''; }
  if (progress) { progress.style.display = 'none'; progress.innerHTML = ''; }
  const fi = document.getElementById('bulk-file-input');
  if (fi) fi.value = '';
}

async function runBulkImport(sendEmails) {
  const validRows = _bulkRows.filter(r => getBulkName(r) && getBulkEmail(r));
  if (!validRows.length) return toast('No valid rows to import', 'error');

  // Disable preview buttons
  document.getElementById('bulk-preview-section').querySelectorAll('button, select').forEach(el => el.disabled = true);

  const progress = document.getElementById('bulk-import-progress');
  progress.style.display = 'block';

  let done = 0, failed = 0;
  const errors = [];
  const total = validRows.length;

  const showProgress = () => {
    const pct = Math.round((done + failed) / total * 100);
    progress.innerHTML = `
      <div style="font-size:13px;color:var(--text-2);margin-bottom:8px">
        Importing${sendEmails ? ' &amp; sending emails' : ''}…
        <strong>${done + failed}</strong> / ${total}
      </div>
      <div style="background:var(--border);border-radius:4px;height:6px;overflow:hidden">
        <div style="background:var(--accent);height:100%;border-radius:4px;width:${pct}%;transition:width 0.15s"></div>
      </div>
    `;
  };

  showProgress();

  for (const row of validRows) {
    try {
      const name  = getBulkName(row);
      const email = getBulkEmail(row);
      const data  = await apiJSON('POST', `/api/interview/${currentInterviewId}/sessions`, {
        candidateName: name, candidateEmail: email,
      });
      if (sendEmails && data.token) {
        try {
          await apiJSON('POST', `/api/session/${data.token}/send-email`, { link: buildTakeUrl(data.token) });
        } catch { /* email fail is non-fatal */ }
      }
      done++;
    } catch (e) {
      failed++;
      errors.push(e.message);
    }
    showProgress();
  }

  progress.innerHTML = `
    <div style="padding:14px 16px;background:var(--bg);border:1px solid var(--border);border-radius:8px">
      <div style="font-size:14px;font-weight:600;margin-bottom:8px">Import complete</div>
      <div class="flex gap-16">
        <span style="color:var(--green)">✓ ${done} imported${sendEmails ? ' &amp; emailed' : ''}</span>
        ${failed ? `<span style="color:var(--red)">✗ ${failed} failed</span>` : ''}
      </div>
      ${errors.length ? `<div class="text-muted text-sm mt-8">${errors.slice(0, 3).map(e => `<div>• ${esc(e)}</div>`).join('')}${errors.length > 3 ? `<div>…and ${errors.length - 3} more</div>` : ''}</div>` : ''}
      <button class="btn btn-outline mt-16" onclick="resetBulkUpload();switchInviteMode('single')">Done</button>
    </div>
  `;

  await loadSessions(currentInterviewId);
  loadInterviews();
}

async function openSessions(interviewId, title, tab = 'invite') {
  currentInterviewId = interviewId;
  document.getElementById('modal-interview-title').textContent = title;
  resetInviteForm();
  switchSessionTab(tab);
  openModal('modal-sessions');
  await loadSessions(interviewId);
}

async function loadSessions(interviewId) {
  const el = document.getElementById('sessions-list');
  el.innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    const sessions = await apiJSON('GET', `/api/interview/${interviewId}/sessions`);
    _allSessions = sessions;
    _sessionFilter = 'all';
    setSessionFilter('all');
  } catch (e) {
    el.innerHTML = `<div class="empty-state" style="color:var(--red)">${e.message}</div>`;
  }
}

function setSessionFilter(filter) {
  _sessionFilter = filter;
  ['all', 'pending', 'completed'].forEach(f => {
    const chip = document.getElementById(`fc-${f}`);
    if (chip) chip.classList.toggle('active', f === filter);
  });
  filterAndRenderSessions();
}

function filterAndRenderSessions() {
  const query = (document.getElementById('search-candidates')?.value || '').trim().toLowerCase();
  let list = _allSessions.filter(s => {
    if (_sessionFilter !== 'all' && s.status !== _sessionFilter) return false;
    if (query && !s.candidateName.toLowerCase().includes(query) &&
        !(s.candidateEmail || '').toLowerCase().includes(query)) return false;
    return true;
  });

  const heading = document.getElementById('sessions-heading');
  if (heading) heading.textContent = `Candidates (${_allSessions.length})`;

  const el = document.getElementById('sessions-list');
  if (!list.length) {
    el.innerHTML = `<div class="empty-state">${_allSessions.length ? 'No candidates match your filter.' : 'No candidates yet. Use the Invite tab to generate a link.'}</div>`;
    return;
  }
  el.innerHTML = list.map((s, i) => renderSessionRow(s, i + 1)).join('');
}

function renderSessionRow(s, num) {
  const invitedDate = s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—';
  const responseCount = s.responses?.length || 0;

  const videosCell = responseCount > 0
    ? `<button class="btn btn-ghost" style="padding:3px 8px;font-size:12px;color:var(--accent);white-space:nowrap" onclick="openReview('${s.token}', '${esc(s.candidateName)}')">🎥 View ${responseCount}</button>`
    : `<span class="text-muted" style="font-size:12px">—</span>`;

  const actionsCell = s.status === 'pending'
    ? `<button class="btn btn-ghost" style="padding:4px 8px;font-size:13px" title="Copy interview link" onclick="copySessionLink('${s.token}')">🔗</button>
       <button class="btn btn-danger" style="padding:4px 10px;font-size:12px" onclick="revokeSession('${s.token}', '${esc(s.candidateName)}')">Revoke</button>`
    : `<button class="btn btn-ghost" style="padding:4px 8px;font-size:13px" title="Copy interview link" onclick="copySessionLink('${s.token}')">🔗</button>
       <button class="btn btn-outline" style="padding:4px 10px;font-size:12px" onclick="openReview('${s.token}', '${esc(s.candidateName)}')">Review</button>`;

  return `
    <div class="session-row">
      <div style="display:flex;align-items:center;gap:8px;min-width:0">
        <span class="text-muted" style="font-size:12px;min-width:18px;flex-shrink:0">${num}.</span>
        <div style="min-width:0">
          <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.candidateName)}</div>
          <div class="text-muted" style="font-size:11px">${s.candidateEmail ? esc(s.candidateEmail) + ' · ' : ''}Invited ${invitedDate}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:center">
        <span class="badge badge-${s.status}">${s.status.replace('_', ' ')}</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:center">
        ${videosCell}
      </div>
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:6px">
        ${actionsCell}
      </div>
    </div>
  `;
}

async function generateLink() {
  const name = document.getElementById('new-cand-name').value.trim();
  const email = document.getElementById('new-cand-email').value.trim();
  if (!name) return toast('Candidate name is required', 'error');
  if (!email) return toast('Email is required', 'error');

  try {
    const data = await apiJSON('POST', `/api/interview/${currentInterviewId}/sessions`, {
      candidateName: name,
      candidateEmail: email,
    });
    const link = buildTakeUrl(data.token);
    document.getElementById('generated-link-text').textContent = link;
    document.getElementById('generated-link-box').style.display = 'block';

    const sendBtn = document.getElementById('send-email-btn');
    sendBtn.style.display = 'inline-flex';
    sendBtn.onclick = () => sendLinkEmail(data.token, link, email);

    toast('Link generated!', 'success');
    await loadSessions(currentInterviewId);
  } catch (e) {
    toast(e.message, 'error');
  }
}

function buildTakeUrl(token) {
  const origin = window.location.origin;
  let path = window.location.pathname; // e.g. /j1-dashboard/interview/admin.html
  if (path.includes('admin.html')) {
    path = path.replace('admin.html', 'take.html');
  } else {
    path = path.replace(/\/?$/, '/') + 'take.html';
  }
  return `${origin}${path}?token=${token}`;
}

function copySessionLink(token) {
  navigator.clipboard.writeText(buildTakeUrl(token));
  toast('Link copied!', 'success');
}

function copyLink() {
  navigator.clipboard.writeText(document.getElementById('generated-link-text').textContent);
  toast('Copied!', 'success');
}

async function sendLinkEmail(token, link, email) {
  const btn = document.getElementById('send-email-btn');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    await apiJSON('POST', `/api/session/${token}/send-email`, { link });
    toast(`Email sent to ${email}`, 'success');
    resetInviteForm();
    await loadSessions(currentInterviewId);
  } catch (e) {
    toast('Failed to send: ' + e.message, 'error');
    btn.disabled = false;
    btn.textContent = '✉ Send Email';
  }
}

async function revokeSession(token, name) {
  if (!confirm(`Revoke ${name}'s invitation? Their interview link will stop working immediately.`)) return;
  try {
    await apiJSON('DELETE', `/api/session/${token}`);
    toast('Invitation revoked', 'success');
    await loadSessions(currentInterviewId);
  } catch (e) { toast(e.message, 'error'); }
}

// ── Review videos ─────────────────────────────────────────────

async function openReview(token, candidateName) {
  document.getElementById('review-candidate-name').textContent = candidateName;
  openModal('modal-review');
  const content = document.getElementById('review-content');
  content.innerHTML = '<div class="empty-state">Loading…</div>';

  try {
    const res = await fetch(`${WORKER_URL}/api/session/${token}`, {
      headers: { 'X-Admin-Key': adminKey }
    });
    const { session, interview } = await res.json();
    document.getElementById('review-interview-title').textContent = interview?.title || '';

    if (!session.responses?.length) {
      content.innerHTML = '<div class="empty-state">No recordings found for this session.</div>';
      return;
    }

    const items = await Promise.all(session.responses.map(async r => {
      const q = interview?.questions?.[r.questionIndex];
      const urlRes = await fetch(
        `${WORKER_URL}/api/session/${token}/video/${r.questionIndex}`,
        { headers: { 'X-Admin-Key': adminKey } }
      );
      const { downloadUrl, webUrl } = await urlRes.json();
      return { q, downloadUrl, webUrl, questionIndex: r.questionIndex };
    }));

    content.innerHTML = `<div class="review-grid">
      ${items.map(({ q, downloadUrl, webUrl, questionIndex }) => `
        <div class="review-item">
          ${downloadUrl
            ? `<video src="${downloadUrl}" controls preload="metadata"></video>`
            : `<div style="aspect-ratio:16/9;background:#000;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:13px">Video unavailable</div>`
          }
          <div class="review-item-label" style="display:flex;justify-content:space-between;align-items:center">
            <span><strong>Q${questionIndex + 1}:</strong> ${q ? esc(q.text) : 'Question ' + (questionIndex + 1)}</span>
            ${webUrl ? `<a href="${webUrl}" target="_blank" class="btn btn-ghost" style="font-size:11px;padding:2px 8px">Open in OneDrive ↗</a>` : ''}
          </div>
        </div>
      `).join('')}
    </div>`;
  } catch (e) {
    content.innerHTML = `<div class="empty-state" style="color:var(--red)">${e.message}</div>`;
  }
}

// ── Edit interview ────────────────────────────────────────────

async function openEditInterview(id) {
  editInterviewId = id;
  try {
    const interview = await apiJSON('GET', `/api/interview/${id}`);
    document.getElementById('edit-title').value = interview.title;
    document.getElementById('edit-desc').value = interview.description || '';
    editQuestions = interview.questions.map(q => ({ ...q }));
    renderEditQuestions();
    openModal('modal-edit');
  } catch (e) { toast(e.message, 'error'); }
}

function addEditQuestion() {
  editQuestions.push({ text: '', duration: 120 });
  renderEditQuestions();
}

function removeEditQuestion(i) {
  if (editQuestions.length === 1) return toast('Need at least one question', 'error');
  editQuestions.splice(i, 1);
  renderEditQuestions();
}

function moveEditQuestion(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= editQuestions.length) return;
  [editQuestions[i], editQuestions[j]] = [editQuestions[j], editQuestions[i]];
  renderEditQuestions();
}

function renderEditQuestions() {
  const builder = document.getElementById('edit-questions-builder');
  builder.innerHTML = editQuestions.map((q, i) => `
    <div class="question-item">
      <div class="q-num">${i + 1}</div>
      <div class="q-fields">
        <input type="text" placeholder="Question text *" value="${esc(q.text)}"
          oninput="editQuestions[${i}].text = this.value" />
        <select onchange="editQuestions[${i}].duration = parseInt(this.value)">
          ${[30, 60, 90, 120, 180, 240, 300].map(s =>
            `<option value="${s}" ${q.duration === s ? 'selected' : ''}>${s}s (${s < 60 ? s + 's' : (s/60) + ' min'})</option>`
          ).join('')}
        </select>
      </div>
      <button class="btn btn-ghost" onclick="moveEditQuestion(${i}, -1)" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="btn btn-ghost" onclick="removeEditQuestion(${i})" style="color:var(--red)">✕</button>
    </div>
  `).join('');
}

async function submitEditInterview() {
  const title = document.getElementById('edit-title').value.trim();
  const description = document.getElementById('edit-desc').value.trim();
  if (!title) return toast('Title is required', 'error');
  if (editQuestions.some(q => !q.text.trim())) return toast('All questions need text', 'error');
  try {
    await apiJSON('PUT', `/api/interview/${editInterviewId}`, { title, description, questions: editQuestions });
    toast('Interview updated!', 'success');
    closeModal('modal-edit');
    loadInterviews();
  } catch (e) { toast(e.message, 'error'); }
}

// ── Modals ────────────────────────────────────────────────────

function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});

// ── Toast ─────────────────────────────────────────────────────

let toastTimer;
function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ── Utils ─────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
