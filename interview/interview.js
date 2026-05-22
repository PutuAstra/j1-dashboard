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

// ── Setup / virtual bg state ───────────────────────────────────
let bgMode = 'none';
let bgCanvas = null;
let bgCtx = null;
let segReady = false;
let segModel = null;
let segLoopId = null;
let lastSendTs = 0;
let lastSegMask = null;   // stores latest segmentation mask for use in draw loop
let tmpCanvas = null;     // reusable off-screen canvas (avoid creating per-frame)
let tmpCtx = null;
let canvasStream = null;
let micAnalyser = null;
let micMeterFrameId = null;
let setupAudioCtx = null;
const BG_FILLS = { white: '#f0ede8', navy: '#1a2744', slate: '#374151' };
let logoImg = null;

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

      <button class="btn btn-primary btn-lg mt-24" onclick="showSetup()">
        Setup &amp; Preview
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

// ── Setup screen ──────────────────────────────────────────────

async function showSetup() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (e) {
    return showError(e.name === 'NotAllowedError'
      ? 'Camera and microphone access was denied. Please allow access in your browser settings and reload the page.'
      : 'Could not access your camera or microphone: ' + e.message);
  }

  main().innerHTML = `
    <div style="max-width:820px;width:100%">
      <div style="text-align:center;margin-bottom:20px">
        <h2>Setup &amp; Preview</h2>
        <p class="text-muted text-sm mt-4">Check your camera, microphone, and background before starting</p>
      </div>
      <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:20px;align-items:start">
        <div style="position:relative">
          <canvas id="bg-canvas" style="width:100%;border-radius:12px;background:#111;display:block"></canvas>
          <video id="setup-vid" autoplay muted playsinline style="display:none"></video>
        </div>
        <div style="display:flex;flex-direction:column;gap:14px">

          <div class="card" style="padding:16px">
            <p class="setup-section-label">🖼 Virtual Background</p>
            <div id="bg-opts" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">
              <button class="bg-opt active" data-bg="none" onclick="setBg('none')">None</button>
              <button class="bg-opt"        data-bg="blur" onclick="setBg('blur')">Blur</button>
              <button class="bg-swatch" data-bg="white" onclick="setBg('white')" style="background:#f0ede8" title="Light"></button>
              <button class="bg-swatch" data-bg="navy"  onclick="setBg('navy')"  style="background:#1a2744" title="Navy"></button>
              <button class="bg-swatch" data-bg="slate" onclick="setBg('slate')" style="background:#374151" title="Slate"></button>
            </div>
            <p id="seg-status" style="font-size:11px;color:var(--muted)">Loading AI segmentation…</p>
          </div>

          <div class="card" style="padding:16px">
            <p class="setup-section-label">🎤 Microphone</p>
            <div style="height:8px;background:var(--bg);border-radius:4px;overflow:hidden;margin-bottom:6px">
              <div id="mic-bar" style="height:100%;width:0%;background:var(--accent);border-radius:4px;transition:width 0.07s linear"></div>
            </div>
            <p style="font-size:12px;color:var(--muted)">Speak to test your microphone</p>
          </div>

          <div class="card" style="padding:16px">
            <p class="setup-section-label">🔊 Speakers</p>
            <button class="btn btn-outline" style="width:100%;font-size:13px" onclick="testSpeakers()">▶ Play Test Sound</button>
          </div>

        </div>
      </div>
      <div style="text-align:center;margin-top:24px">
        <button class="btn btn-primary btn-lg" onclick="continueToInterview()">Continue to Interview →</button>
      </div>
    </div>`;

  const vid = document.getElementById('setup-vid');
  vid.srcObject = mediaStream;
  await vid.play();

  bgCanvas = document.getElementById('bg-canvas');
  bgCtx = bgCanvas.getContext('2d');
  // Set canvas resolution once video has dimensions
  vid.addEventListener('loadedmetadata', () => {
    bgCanvas.width  = vid.videoWidth  || 640;
    bgCanvas.height = vid.videoHeight || 360;
  }, { once: true });
  bgCanvas.width = 640; bgCanvas.height = 360; // default until metadata fires

  // Preload CTI logo for watermark
  if (!logoImg) {
    logoImg = new Image();
    logoImg.src = 'cti-logo.png';
  }

  startBgLoop(vid);
  startMicMeter();
  loadSegmentation(vid);
}

async function loadSegmentation(vid) {
  const status = document.getElementById('seg-status');
  const MP_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation';
  try {
    // Dynamically load MediaPipe so we can catch failures cleanly
    if (typeof SelfieSegmentation === 'undefined') {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = MP_CDN + '/selfie_segmentation.js';
        s.crossOrigin = 'anonymous';
        s.onload = resolve;
        s.onerror = () => reject(new Error('Script load failed'));
        document.head.appendChild(s);
      });
    }
    if (typeof SelfieSegmentation === 'undefined') throw new Error('SelfieSegmentation not defined');
    segModel = new SelfieSegmentation({ locateFile: f => `${MP_CDN}/${f}` });
    segModel.setOptions({ modelSelection: 1 });
    segModel.onResults(handleSegResults);
    await segModel.initialize();
    segReady = true;
    if (status) { status.textContent = '✓ AI ready — select a background above'; status.style.color = '#22c55e'; }
  } catch (e) {
    console.warn('[VirtualBg]', e.message);
    // Blur works without AI (portrait-mode fallback); only colour swatches need AI
    if (status) status.textContent = 'Blur ✓ (no AI) · Solid colours need AI (unavailable)';
    document.querySelectorAll('.bg-swatch').forEach(b => {
      b.style.opacity = '0.35'; b.style.pointerEvents = 'none';
    });
  }
}

function drawWatermark() {
  if (!logoImg || !logoImg.complete || !bgCtx || !bgCanvas) return;
  const logoH = Math.round(bgCanvas.height * 0.07); // ~7% of canvas height
  const logoW = Math.round(logoImg.naturalWidth * (logoH / logoImg.naturalHeight));
  const pad = Math.round(bgCanvas.width * 0.02);
  bgCtx.save();
  bgCtx.globalAlpha = 0.72;
  bgCtx.drawImage(logoImg, bgCanvas.width - logoW - pad, pad, logoW, logoH);
  bgCtx.restore();
}

// Ensure a reusable temp canvas the right size
function ensureTmp(w, h) {
  if (!tmpCanvas) { tmpCanvas = document.createElement('canvas'); tmpCtx = tmpCanvas.getContext('2d'); }
  if (tmpCanvas.width !== w) tmpCanvas.width = w;
  if (tmpCanvas.height !== h) tmpCanvas.height = h;
  return { tc: tmpCtx, tw: w, th: h };
}

// Portrait-mode blur — no AI required
function applySimpleBlur(vid, w, h) {
  // Strong background blur
  bgCtx.save();
  bgCtx.filter = 'blur(24px)';
  bgCtx.drawImage(vid, -32, -32, w + 64, h + 64);
  bgCtx.restore();
  // Tight sharp oval over the person — narrower so edges/chair hide behind blur
  const cx = w / 2, cy = h * 0.40;
  const r1 = Math.min(w, h) * 0.22;  // inner fully-sharp radius (tighter)
  const r2 = Math.min(w, h) * 0.46;  // outer fade radius (tighter)
  const grd = bgCtx.createRadialGradient(cx, cy, r1, cx, cy, r2);
  grd.addColorStop(0,    'rgba(0,0,0,1)');
  grd.addColorStop(0.55, 'rgba(0,0,0,0.9)');
  grd.addColorStop(1,    'rgba(0,0,0,0)');
  const { tc } = ensureTmp(w, h);
  tc.clearRect(0, 0, w, h);
  tc.drawImage(vid, 0, 0, w, h);
  tc.globalCompositeOperation = 'destination-in';
  tc.fillStyle = grd;
  tc.fillRect(0, 0, w, h);
  tc.globalCompositeOperation = 'source-over';
  bgCtx.drawImage(tmpCanvas, 0, 0, w, h);
}

// Draw frame using the stored AI segmentation mask
function drawWithMask(vid, w, h) {
  if (!lastSegMask) {
    // Mask not yet available — use blur fallback for blur mode, raw video otherwise
    if (bgMode === 'blur') { applySimpleBlur(vid, w, h); }
    else { bgCtx.drawImage(vid, 0, 0, w, h); }
    return;
  }
  // Draw background
  if (BG_FILLS[bgMode]) {
    bgCtx.fillStyle = BG_FILLS[bgMode];
    bgCtx.fillRect(0, 0, w, h);
  }
  // Cut out person using AI mask — minimal 2px blur just for natural edge softening
  // No scaling/erosion: aggressive erosion was making the person look transparent/blurry
  const { tc } = ensureTmp(w, h);
  tc.clearRect(0, 0, w, h);
  tc.save();
  tc.filter = 'blur(2px)';
  tc.drawImage(lastSegMask, 0, 0, w, h);
  tc.restore();
  tc.globalCompositeOperation = 'source-in';
  tc.drawImage(vid, 0, 0, w, h);
  tc.globalCompositeOperation = 'source-over';
  bgCtx.drawImage(tmpCanvas, 0, 0, w, h);
}

function startBgLoop(vid) {
  function loop(ts) {
    if (!bgCanvas || !bgCtx) return;
    const w = bgCanvas.width, h = bgCanvas.height;
    if (!vid.videoWidth) { segLoopId = requestAnimationFrame(loop); return; }

    if (bgMode === 'none') {
      bgCtx.drawImage(vid, 0, 0, w, h);
    } else if (bgMode === 'blur') {
      // Portrait-mode oval blur — always reliable, hides chair regardless of AI
      applySimpleBlur(vid, w, h);
    } else if (segReady) {
      // Solid colour backgrounds: use AI segmentation mask
      if (ts - lastSendTs >= 66 && segModel) {
        lastSendTs = ts;
        segModel.send({ image: vid }).catch(() => {});
      }
      drawWithMask(vid, w, h);
    } else {
      // AI not yet ready + solid colour selected — show raw video temporarily
      bgCtx.drawImage(vid, 0, 0, w, h);
    }
    drawWatermark();
    segLoopId = requestAnimationFrame(loop);
  }
  segLoopId = requestAnimationFrame(loop);
}

function handleSegResults(results) {
  // Just store the mask; drawing happens in the animation loop every frame
  lastSegMask = results.segmentationMask;
}

function setBg(mode) {
  bgMode = mode;
  document.querySelectorAll('.bg-opt, .bg-swatch').forEach(b =>
    b.classList.toggle('active', b.dataset.bg === mode)
  );
}

function startMicMeter() {
  try {
    setupAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    micAnalyser = setupAudioCtx.createAnalyser();
    micAnalyser.fftSize = 512;
    setupAudioCtx.createMediaStreamSource(mediaStream).connect(micAnalyser);
    const buf = new Uint8Array(micAnalyser.frequencyBinCount);
    function tick() {
      if (!micAnalyser) return;
      micAnalyser.getByteFrequencyData(buf);
      const avg = buf.reduce((s, v) => s + v, 0) / buf.length;
      const bar = document.getElementById('mic-bar');
      if (!bar) return;
      bar.style.width = Math.min(100, avg * 3) + '%';
      micMeterFrameId = requestAnimationFrame(tick);
    }
    micMeterFrameId = requestAnimationFrame(tick);
  } catch (e) {}
}

// Build a WAV blob for a single tone
// Uses incremental phase to avoid floating-point drift (no "breaking up")
function _makeTone(freq, secs) {
  const SR = 44100;
  const n  = Math.floor(SR * secs);
  const ab = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(ab);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0,'RIFF'); dv.setUint32(4, 36 + n * 2, true);
  ws(8,'WAVE'); ws(12,'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2, true);
  dv.setUint16(32, 2, true);  dv.setUint16(34, 16, true);
  ws(36,'data'); dv.setUint32(40, n * 2, true);
  const FADE = Math.floor(SR * 0.022); // 22 ms fade in/out — removes clicks
  const inc  = 2 * Math.PI * freq / SR;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const fade = Math.min(i, FADE, n - 1 - i) / FADE; // 0→1→1→0
    dv.setInt16(44 + i * 2, Math.round(0.88 * Math.min(fade, 1) * 32767 * Math.sin(ph)), true);
    ph += inc;
    if (ph > 2 * Math.PI) ph -= 2 * Math.PI;
  }
  return URL.createObjectURL(new Blob([ab], { type: 'audio/wav' }));
}

function testSpeakers() {
  // Play 3 tones (A4 → C#5 → E5) sequentially; chain via onended (no setTimeout gaps)
  const tones = [440, 554, 659];
  let i = 0;
  (function next() {
    if (i >= tones.length) return;
    const url = _makeTone(tones[i], 0.35);
    const a = new Audio(url);
    a.onended = () => { URL.revokeObjectURL(url); i++; next(); };
    a.onerror  = () => { URL.revokeObjectURL(url); i++; next(); };
    a.play().catch(() => {});
  })();
}

function continueToInterview() {
  // Stop mic meter
  cancelAnimationFrame(micMeterFrameId); micMeterFrameId = null;
  if (micAnalyser) { micAnalyser.disconnect(); micAnalyser = null; }
  if (setupAudioCtx) { setupAudioCtx.close().catch(() => {}); setupAudioCtx = null; }

  if (bgMode !== 'none' && bgCanvas) {
    // Canvas stream: video from bgCanvas (with bg applied) + audio from mediaStream
    canvasStream = bgCanvas.captureStream(30);
    mediaStream.getAudioTracks().forEach(t => canvasStream.addTrack(t));
  } else {
    // No virtual bg — stop canvas loop, use raw stream
    cancelAnimationFrame(segLoopId); segLoopId = null;
    bgMode = 'none';
  }

  showQuestion(0);
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
          <div class="progress-bar-fill" id="progress-fill" style="width:${((index) / total) * 100}%"></div>
        </div>

        <div id="question-text" style="filter:blur(7px);user-select:none;transition:filter 0.4s ease">
          <p style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">Question ${index + 1}</p>
          <p class="question-text">${esc(q.text)}</p>
        </div>
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
  preview.srcObject = canvasStream || mediaStream;
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

  recorder = new MediaRecorder(canvasStream || mediaStream, { mimeType: getSupportedMimeType() });
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.onstop = handleRecordingStop;
  recorder.start(1000);

  // Show timer
  timeLeft = q.duration;
  const fill = document.getElementById('progress-fill');
  if (fill) fill.style.width = '0%';
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

  // Drive the recording progress bar
  const q = interview.questions[currentQ];
  const fill = document.getElementById('progress-fill');
  if (fill && q) {
    const elapsed = q.duration - timeLeft;
    fill.style.width = `${(elapsed / q.duration) * 100}%`;
  }
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
  if (segLoopId) { cancelAnimationFrame(segLoopId); segLoopId = null; }
  if (segModel) { try { segModel.close(); } catch (e) {} segModel = null; }
  bgCanvas = null; bgCtx = null; canvasStream = null;
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
