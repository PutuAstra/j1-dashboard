// ─────────────────────────────────────────────────────────────
//  Candidate Interview Recording Page
//  Update WORKER_URL after deploying your Cloudflare Worker
// ─────────────────────────────────────────────────────────────

const WORKER_URL = 'https://interview-api.putuastrawijaya.workers.dev';

// ── State ─────────────────────────────────────────────────────
let session = null;
let interview = null;
let currentQ = 0;
let mediaStream = null;
let recorder = null;
let chunks = [];
let recordingTimer = null;
let timeLeft = 0;

const token = new URLSearchParams(location.search).get('token');
const main = () => document.getElementById('take-main');

// ── Boot ──────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
  if (!token) return showError('No interview token found in the URL.');
  try {
    const res = await fetch(`${WORKER_URL}/api/session/${token}`);
    if (!res.ok) return showError('This interview link is invalid or has expired.');
    const data = await res.json();
    session = data.session;
    interview = data.interview;

    if (session.status === 'completed') return showThankYou(true);
    showIntro();
  } catch {
    showError('Could not connect to the interview server. Please try again later.');
  }
});

// ── Screens ───────────────────────────────────────────────────

function showError(msg) {
  main().innerHTML = `
    <div class="thankyou-screen">
      <div class="thankyou-icon">⚠️</div>
      <h2 style="color:var(--red)">Something went wrong</h2>
      <p class="mt-8">${msg}</p>
    </div>`;
}

function showIntro() {
  const totalDuration = interview.questions.reduce((s, q) => s + q.duration, 0);
  const mins = Math.ceil(totalDuration / 60);

  main().innerHTML = `
    <div class="card" style="max-width:560px;width:100%;text-align:center">
      <div style="font-size:40px;margin-bottom:16px">🎙️</div>
      <h1>${esc(interview.title)}</h1>
      <p class="mt-8">Hello, <strong>${esc(session.candidateName)}</strong> 👋</p>

      ${interview.description ? `<p class="mt-16" style="color:var(--text-2)">${esc(interview.description)}</p>` : ''}

      <div class="card" style="background:var(--bg);margin-top:20px;text-align:left">
        <p class="text-sm text-muted mb-8">Before you start:</p>
        <ul style="list-style:disc;padding-left:18px;display:flex;flex-direction:column;gap:6px;color:var(--text-2);font-size:13px">
          <li>You will answer <strong>${interview.questions.length} question${interview.questions.length !== 1 ? 's' : ''}</strong>, taking around <strong>~${mins} min</strong></li>
          <li>Each question has a time limit — recording stops automatically</li>
          <li>Make sure your camera and microphone are ready</li>
          <li>Find a quiet place with good lighting</li>
          <li>Once you start a question you cannot redo it</li>
        </ul>
      </div>

      <button class="btn btn-primary btn-lg mt-24" onclick="requestCamera()">
        Start Interview
      </button>
    </div>`;
}

async function requestCamera() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    showQuestion(0);
  } catch (e) {
    if (e.name === 'NotAllowedError') {
      showError('Camera and microphone access was denied. Please allow access in your browser settings and reload the page.');
    } else {
      showError('Could not access your camera or microphone: ' + e.message);
    }
  }
}

function showQuestion(index) {
  currentQ = index;
  const q = interview.questions[index];
  const total = interview.questions.length;
  updateProgress(index, total);

  main().innerHTML = `
    <div class="question-card" style="max-width:720px;width:100%">
      <div class="question-header">
        <span class="text-muted text-sm">Question ${index + 1} of ${total}</span>
        <span class="text-sm" style="color:var(--text-2)">Time limit: ${formatTime(q.duration)}</span>
      </div>

      <div class="question-body">
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" style="width:${((index) / total) * 100}%"></div>
        </div>

        <p class="question-text" id="question-text" style="filter:blur(7px);user-select:none;transition:filter 0.4s ease">
          Question ${index + 1}: ${esc(q.text)}
        </p>
        <p id="question-hint" class="text-sm text-muted" style="margin-top:-4px;margin-bottom:4px">
          🔒 Question will be revealed when you press Record
        </p>

        <div class="camera-wrap" id="camera-wrap">
          <video id="preview" autoplay muted playsinline></video>
          <div id="timer-overlay" class="timer-overlay" style="display:none"></div>
          <div id="overlay"></div>
        </div>

        <div id="controls" class="flex gap-12 justify-between items-center mt-16">
          <p class="text-muted text-sm">Press Record when you're ready. You have ${formatTime(q.duration)}.</p>
          <button class="btn btn-primary btn-lg" id="record-btn" onclick="startCountdown()">
            ● Record
          </button>
        </div>
      </div>
    </div>`;

  const preview = document.getElementById('preview');
  preview.srcObject = mediaStream;
}

function updateProgress(index, total) {
  document.getElementById('topbar-progress').textContent =
    `Question ${index + 1} of ${total}`;
}

// ── Recording flow ────────────────────────────────────────────

function startCountdown() {
  // Reveal the question now that candidate has committed to record
  const qText = document.getElementById('question-text');
  if (qText) { qText.style.filter = 'none'; qText.style.userSelect = ''; }
  const hint = document.getElementById('question-hint');
  if (hint) hint.style.display = 'none';

  document.getElementById('record-btn').disabled = true;
  let count = 3;

  showOverlay(`
    <div class="countdown-overlay" id="countdown-overlay">
      <div class="countdown-number" id="countdown-num">${count}</div>
      <div class="countdown-label">Get ready…</div>
    </div>`);

  const tick = setInterval(() => {
    count--;
    const numEl = document.getElementById('countdown-num');
    if (!numEl) return clearInterval(tick);
    if (count <= 0) {
      clearInterval(tick);
      clearOverlay();
      startRecording();
    } else {
      numEl.textContent = count;
    }
  }, 1000);
}

function startRecording() {
  const q = interview.questions[currentQ];
  chunks = [];

  recorder = new MediaRecorder(mediaStream, { mimeType: getSupportedMimeType() });
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.onstop = handleRecordingStop;
  recorder.start(1000);

  // Show timer
  timeLeft = q.duration;
  const timerEl = document.getElementById('timer-overlay');
  timerEl.style.display = 'block';
  updateTimerDisplay();

  // Controls: show stop button
  document.getElementById('controls').innerHTML = `
    <div class="flex items-center gap-8">
      <span class="rec-dot"></span>
      <span style="color:var(--red);font-size:13px;font-weight:600">Recording</span>
    </div>
    <button class="btn btn-outline" onclick="stopRecording()">■ Stop Early</button>`;

  recordingTimer = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      clearInterval(recordingTimer);
      stopRecording();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const el = document.getElementById('timer-overlay');
  if (!el) return;
  el.textContent = formatTime(timeLeft);
  el.className = 'timer-overlay' +
    (timeLeft <= 10 ? ' danger' : timeLeft <= 30 ? ' warning' : '');
}

function stopRecording() {
  clearInterval(recordingTimer);
  if (recorder?.state !== 'inactive') recorder.stop();
}

async function handleRecordingStop() {
  document.getElementById('controls').innerHTML = '';

  showOverlay(`
    <div class="upload-overlay">
      <div class="spinner"></div>
      <p style="color:var(--muted);font-size:13px">Uploading your answer…</p>
    </div>`);

  const blob = new Blob(chunks, { type: getSupportedMimeType() });

  try {
    const res = await fetch(`${WORKER_URL}/api/session/${token}/upload/${currentQ}`, {
      method: 'POST',
      headers: { 'Content-Type': 'video/webm' },
      body: blob,
    });
    if (!res.ok) throw new Error('Upload failed');
    clearOverlay();
    showAfterRecording();
  } catch {
    clearOverlay();
    showOverlay(`
      <div class="upload-overlay" style="gap:16px">
        <p style="color:var(--red)">Upload failed. Please retry.</p>
        <button class="btn btn-primary" onclick="retryUpload()">Retry</button>
      </div>`);
  }
}

async function retryUpload() {
  showOverlay(`
    <div class="upload-overlay">
      <div class="spinner"></div>
      <p style="color:var(--muted);font-size:13px">Retrying upload…</p>
    </div>`);

  const blob = new Blob(chunks, { type: getSupportedMimeType() });
  try {
    const res = await fetch(`${WORKER_URL}/api/session/${token}/upload/${currentQ}`, {
      method: 'POST',
      headers: { 'Content-Type': 'video/webm' },
      body: blob,
    });
    if (!res.ok) throw new Error('Upload failed');
    clearOverlay();
    showAfterRecording();
  } catch {
    clearOverlay();
    showOverlay(`
      <div class="upload-overlay" style="gap:16px">
        <p style="color:var(--red)">Upload failed again. Check your connection.</p>
        <button class="btn btn-primary" onclick="retryUpload()">Retry</button>
      </div>`);
  }
}

function showAfterRecording() {
  const total = interview.questions.length;
  const isLast = currentQ === total - 1;

  document.getElementById('controls').innerHTML = `
    <p class="text-muted text-sm" style="color:var(--green)">✓ Answer saved</p>
    <button class="btn btn-primary btn-lg" onclick="${isLast ? 'finishInterview()' : `showQuestion(${currentQ + 1})`}">
      ${isLast ? 'Finish Interview' : 'Next Question →'}
    </button>`;
}

async function finishInterview() {
  main().innerHTML = `<div class="spinner" style="margin:auto"></div>`;
  try {
    await fetch(`${WORKER_URL}/api/session/${token}/complete`, { method: 'POST' });
  } catch {}
  stopStream();
  showThankYou(false);
}

function showThankYou(alreadyDone) {
  document.getElementById('topbar-progress').textContent = '';
  main().innerHTML = `
    <div class="thankyou-screen">
      <div class="thankyou-icon">${alreadyDone ? '✅' : '🎉'}</div>
      <h1>${alreadyDone ? 'Already Submitted' : 'Thank You!'}</h1>
      <p class="mt-8">
        ${alreadyDone
          ? 'This interview has already been completed.'
          : `Your interview has been submitted, <strong>${esc(session?.candidateName || '')}</strong>. The CTI Group team will review your responses and be in touch.`}
      </p>
      <p class="mt-16 text-muted text-sm">You may now close this tab.</p>
    </div>`;
}

// ── Overlay helpers ───────────────────────────────────────────

function showOverlay(html) {
  const el = document.getElementById('overlay');
  if (el) el.innerHTML = html;
}

function clearOverlay() {
  const el = document.getElementById('overlay');
  if (el) el.innerHTML = '';
}

// ── Utilities ─────────────────────────────────────────────────

function stopStream() {
  mediaStream?.getTracks().forEach(t => t.stop());
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

function getSupportedMimeType() {
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return types.find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';
}

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let toastTimer;
function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}
