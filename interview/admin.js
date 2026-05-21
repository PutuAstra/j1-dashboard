// ─────────────────────────────────────────────────────────────
//  Interview Admin Panel
//  Update WORKER_URL after deploying your Cloudflare Worker
// ─────────────────────────────────────────────────────────────

const WORKER_URL = 'https://interview-api.putuastrawijaya.workers.dev';

// ── State ─────────────────────────────────────────────────────
let adminKey = '';
let questions = [];
let currentInterviewId = null;

// ── Auth ──────────────────────────────────────────────────────

async function doLogin() {
  const key = document.getElementById('key-input').value.trim();
  if (!key) return;

  // Verify key by making a real API call
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
  loadInterviews();
}

// Auto-login from session
window.addEventListener('DOMContentLoaded', () => {
  const saved = sessionStorage.getItem('interview_admin_key');
  if (saved) {
    adminKey = saved;
    showApp();
  }

  document.getElementById('key-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });

  addQuestion(); // start with one question in the builder
});

// ── API client ────────────────────────────────────────────────

async function api(method, path, body = null, keyOverride = null) {
  const res = await fetch(WORKER_URL + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': keyOverride || adminKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

async function apiJSON(method, path, body = null) {
  const res = await api(method, path, body);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// ── Tabs ──────────────────────────────────────────────────────

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach((btn, i) => {
    const names = ['interviews', 'create'];
    btn.classList.toggle('active', names[i] === name);
  });
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
}

// ── Interviews list ───────────────────────────────────────────

async function loadInterviews() {
  const el = document.getElementById('interviews-list');
  el.innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    const interviews = await apiJSON('GET', '/api/interviews');
    if (!interviews.length) {
      el.innerHTML = '<div class="empty-state">No interviews yet. Create one using the "+ New Interview" tab.</div>';
      return;
    }
    el.innerHTML = interviews.map(renderInterviewCard).join('');
  } catch (e) {
    el.innerHTML = `<div class="empty-state" style="color:var(--red)">${e.message}</div>`;
  }
}

function renderInterviewCard(interview) {
  const qCount = interview.questions?.length || 0;
  const created = new Date(interview.createdAt).toLocaleDateString();
  return `
    <div class="card mb-16" style="margin-bottom:14px">
      <div class="flex justify-between items-center">
        <div>
          <h3>${esc(interview.title)}</h3>
          <p class="text-muted text-sm mt-8">${qCount} question${qCount !== 1 ? 's' : ''} &nbsp;·&nbsp; Created ${created}</p>
          ${interview.description ? `<p class="text-sm mt-8" style="color:var(--text-2)">${esc(interview.description)}</p>` : ''}
        </div>
        <div class="flex gap-8">
          <button class="btn btn-outline" onclick="openSessions('${interview.id}', '${esc(interview.title)}')">
            Candidates
          </button>
          <button class="btn btn-danger" onclick="deleteInterview('${interview.id}')">Delete</button>
        </div>
      </div>

      <hr class="divider" style="margin:16px 0" />
      <p class="text-sm text-muted mb-8">Questions:</p>
      <ol style="padding-left:18px;display:flex;flex-direction:column;gap:6px">
        ${interview.questions.map(q => `
          <li style="color:var(--text-2);font-size:13px">
            ${esc(q.text)}
            <span class="text-muted"> — ${q.duration}s</span>
          </li>
        `).join('')}
      </ol>
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

// ── Create interview ──────────────────────────────────────────

function addQuestion() {
  questions.push({ text: '', duration: 120 });
  renderQuestions();
}

function removeQuestion(i) {
  if (questions.length === 1) return toast('Need at least one question', 'error');
  questions.splice(i, 1);
  renderQuestions();
}

function renderQuestions() {
  const builder = document.getElementById('questions-builder');
  builder.innerHTML = questions.map((q, i) => `
    <div class="question-item">
      <div class="q-num">${i + 1}</div>
      <div class="q-fields">
        <input
          type="text"
          placeholder="Question text *"
          value="${esc(q.text)}"
          oninput="questions[${i}].text = this.value"
        />
        <select onchange="questions[${i}].duration = parseInt(this.value)">
          ${[30, 60, 90, 120, 180, 240, 300].map(s =>
            `<option value="${s}" ${q.duration === s ? 'selected' : ''}>${s}s (${s/60 < 1 ? s + 's' : (s/60) + ' min'})</option>`
          ).join('')}
        </select>
      </div>
      <button class="btn btn-ghost" title="Move up" onclick="moveQuestion(${i}, -1)" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="btn btn-ghost" title="Remove" onclick="removeQuestion(${i})" style="color:var(--red)">✕</button>
    </div>
  `).join('');
}

function moveQuestion(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= questions.length) return;
  [questions[i], questions[j]] = [questions[j], questions[i]];
  renderQuestions();
}

async function submitInterview() {
  const title = document.getElementById('new-title').value.trim();
  const description = document.getElementById('new-desc').value.trim();

  if (!title) return toast('Title is required', 'error');
  if (questions.some(q => !q.text.trim())) return toast('All questions need text', 'error');

  try {
    await apiJSON('POST', '/api/interviews', { title, description, questions });
    toast('Interview created!', 'success');
    resetCreateForm();
    switchTab('interviews');
    loadInterviews();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function resetCreateForm() {
  document.getElementById('new-title').value = '';
  document.getElementById('new-desc').value = '';
  questions = [{ text: '', duration: 120 }];
  renderQuestions();
}

// ── Sessions (candidates) ─────────────────────────────────────

async function openSessions(interviewId, title) {
  currentInterviewId = interviewId;
  document.getElementById('modal-interview-title').textContent = title;
  document.getElementById('generated-link-box').style.display = 'none';
  document.getElementById('new-cand-name').value = '';
  document.getElementById('new-cand-email').value = '';
  openModal('modal-sessions');
  await loadSessions(interviewId);
}

async function loadSessions(interviewId) {
  const el = document.getElementById('sessions-list');
  el.innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    const sessions = await apiJSON('GET', `/api/interview/${interviewId}/sessions`);
    if (!sessions.length) {
      el.innerHTML = '<div class="empty-state">No candidates yet. Generate a link above.</div>';
      return;
    }
    el.innerHTML = sessions.map(s => renderSessionRow(s, interviewId)).join('');
  } catch (e) {
    el.innerHTML = `<div class="empty-state" style="color:var(--red)">${e.message}</div>`;
  }
}

function renderSessionRow(s, interviewId) {
  const date = s.completedAt
    ? new Date(s.completedAt).toLocaleDateString()
    : s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—';

  const responseCount = s.responses?.length || 0;

  return `
    <div class="session-row">
      <div>
        <strong style="font-size:13px">${esc(s.candidateName)}</strong>
        ${s.candidateEmail ? `<div class="text-muted text-sm">${esc(s.candidateEmail)}</div>` : ''}
      </div>
      <span class="badge badge-${s.status}">${s.status.replace('_', ' ')}</span>
      <span class="text-muted text-sm">${responseCount} video${responseCount !== 1 ? 's' : ''}</span>
      <div class="flex gap-8">
        <button class="btn btn-ghost" title="Copy link" onclick="copySessionLink('${s.token}')">🔗</button>
        ${s.status !== 'pending' ? `<button class="btn btn-outline" onclick="openReview('${s.token}', '${esc(s.candidateName)}')">Review</button>` : ''}
      </div>
    </div>
  `;
}

async function generateLink() {
  const name = document.getElementById('new-cand-name').value.trim();
  const email = document.getElementById('new-cand-email').value.trim();
  if (!name) return toast('Candidate name is required', 'error');

  try {
    const data = await apiJSON('POST', `/api/interview/${currentInterviewId}/sessions`, {
      candidateName: name,
      candidateEmail: email,
    });
    const link = buildTakeUrl(data.token);
    document.getElementById('generated-link-text').textContent = link;
    document.getElementById('generated-link-box').style.display = 'block';
    toast('Link generated!', 'success');
    await loadSessions(currentInterviewId);
  } catch (e) {
    toast(e.message, 'error');
  }
}

function buildTakeUrl(token) {
  const base = window.location.href.replace('admin.html', 'take.html');
  return `${base.split('?')[0]}?token=${token}`;
}

function copySessionLink(token) {
  navigator.clipboard.writeText(buildTakeUrl(token));
  toast('Link copied!', 'success');
}

function copyLink() {
  const text = document.getElementById('generated-link-text').textContent;
  navigator.clipboard.writeText(text);
  toast('Copied!', 'success');
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

    const items = await Promise.all(session.responses.map(async (r) => {
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

// ── Modals ────────────────────────────────────────────────────

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
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
