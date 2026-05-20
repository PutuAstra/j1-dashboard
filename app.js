// ─────────────────────────────────────────────────────────────
//  APP — SPA router + all dashboard pages
// ─────────────────────────────────────────────────────────────
const App = (() => {

  let _participants = null; // cached data

  // ── Helpers ───────────────────────────────────────────────

  function toast(msg, type = 'info') {
    const tc  = document.getElementById('toastContainer');
    const el  = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    tc.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  function badge(text) {
    if (!text || text === '—') return `<span class="badge badge-gray">—</span>`;
    const t = String(text).toLowerCase();
    if (/placed|active|on.?site|approved|hired/i.test(t))   return `<span class="badge badge-green">${text}</span>`;
    if (/pending|in.?progress|processing/i.test(t))          return `<span class="badge badge-yellow">${text}</span>`;
    if (/expired|rejected|cancelled|denied/i.test(t))        return `<span class="badge badge-red">${text}</span>`;
    if (/intern/i.test(t))                                   return `<span class="badge badge-blue">${text}</span>`;
    if (/trainee/i.test(t))                                  return `<span class="badge badge-green">${text}</span>`;
    return `<span class="badge badge-gray">${text}</span>`;
  }

  function flightBadge(val) {
    const yes = val === true || /yes|booked|confirmed/i.test(String(val));
    return yes
      ? `<span class="badge badge-green">✓ Booked</span>`
      : `<span class="badge badge-red">✗ Not booked</span>`;
  }

  function formatDate(str) {
    if (!str) return '—';
    const d = new Date(str);
    if (isNaN(d)) return str;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    return Math.ceil((d - Date.now()) / 86_400_000);
  }

  function updateZohoStatus() {
    const el = document.getElementById('zohoStatus');
    if (!el) return;
    if (ZohoAuth.isConnected()) {
      el.className = 'zoho-status connected';
      el.innerHTML = `<span class="dot"></span> Zoho Connected`;
      el.title = 'Click to disconnect';
      el.onclick = () => { ZohoAuth.clearToken(); _participants = null; _jobCache = null; renderCurrentPage(); updateZohoStatus(); };
    } else {
      el.className = 'zoho-status disconnected';
      el.innerHTML = `<span class="dot"></span> Connect Zoho`;
      el.title = 'Click to connect your Zoho account';
      el.onclick = () => ZohoAuth.startOAuth();
    }
  }

  // ── Zoho connect prompt (shown when not connected) ────────

  function connectPromptHTML() {
    return `
      <div class="connect-prompt">
        <div class="connect-icon">🔗</div>
        <h2>Connect your Zoho account</h2>
        <p>To load live J1 participant data, connect your Zoho account. You'll be redirected to Zoho to log in, then brought back here.</p>
        <button class="btn-connect" onclick="ZohoAuth.startOAuth()">
          Connect Zoho
        </button>
      </div>
    `;
  }

  // ── Skeleton loader ────────────────────────────────────────

  function skeletonHTML() {
    return `
      <div class="skeleton">
        <div class="skeleton-stat-grid">
          ${[1,2,3,4,5,6].map(() => `<div class="skeleton-stat"></div>`).join('')}
        </div>
        <div class="skeleton-block" style="height:220px"></div>
        <div class="skeleton-block" style="height:180px"></div>
      </div>
    `;
  }

  // ── Load data (with cache) ─────────────────────────────────

  async function loadData(force = false) {
    if (_participants && !force) return _participants;
    if (!ZohoAuth.isConnected()) return null;
    try {
      _participants = await Zoho.getAllParticipants();
      return _participants;
    } catch (err) {
      if (err.message === 'TOKEN_EXPIRED' || err.message === 'NO_TOKEN') {
        updateZohoStatus();
        return null;
      }
      toast(`Failed to load data: ${err.message}`, 'error');
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  PAGE: OVERVIEW
  // ═══════════════════════════════════════════════════════════
  async function renderOverview() {
    const mc = document.getElementById('main-content');
    mc.innerHTML = skeletonHTML();

    const participants = await loadData();
    if (!participants) { mc.innerHTML = connectPromptHTML(); return; }

    const s  = Zoho.computeStats(participants);
    const byProgram  = Zoho.groupBy(participants, 'programType');
    const byStatus   = Zoho.groupBy(participants, 'placementStatus');
    const byCountry  = Zoho.groupBy(participants, 'country');
    const byFlight   = {
      'Booked':     participants.filter(p => p.flightBooked === true || /yes|booked/i.test(String(p.flightBooked))).length,
      'Not Booked': participants.filter(p => !(p.flightBooked === true || /yes|booked/i.test(String(p.flightBooked)))).length,
    };

    // ── Housing stats ─────────────────────────────────────────
    const withCompanyOv  = participants.filter(p => p._source === 'recruit' && p.hostCompany && p.hostCompany !== '—');
    const housedOv       = withCompanyOv.filter(p => p.housingAvailability && p.housingAvailability !== '—');
    const noHousingOv    = withCompanyOv.filter(p => !p.housingAvailability || p.housingAvailability === '—');
    const housingRateOv  = withCompanyOv.length ? Math.round(housedOv.length / withCompanyOv.length * 100) : 0;

    // ── Travel — Joining (Visa Approved) ──────────────────────
    const joiningOv      = participants.filter(p => /^approved$/i.test(p.visaStatus));
    const joiningBookedOv    = joiningOv.filter(p =>  p.flightBooked === true || /yes|booked|confirmed/i.test(String(p.flightBooked)));
    const joiningNotBookedOv = joiningOv.filter(p => !(p.flightBooked === true || /yes|booked|confirmed/i.test(String(p.flightBooked))));
    const joiningRateOv  = joiningOv.length ? Math.round(joiningBookedOv.length / joiningOv.length * 100) : 0;

    // ── Travel — Returning (USA Onboard + Program Completed) ──
    const returningOv    = participants.filter(p => /^(usa onboard|program completed)$/i.test(p.placementStatus));
    const returnBookedOv    = returningOv.filter(p => /yes|booked|confirmed/i.test(String(p.returnFlightStatus)));
    const returnNotBookedOv = returningOv.filter(p => !/yes|booked|confirmed/i.test(String(p.returnFlightStatus)));
    const returnRateOv   = returningOv.length ? Math.round(returnBookedOv.length / returningOv.length * 100) : 0;

    // ── Stage 3 / Stage 4 counts ──────────────────────────────
    const stage3Count = participants.filter(p => /^stage 3$/i.test(p.placementStatus)).length;
    const stage4Count = participants.filter(p => /^stage 4$/i.test(p.placementStatus)).length;

    // ── Successful Placement by Sponsor ───────────────────────
    const placed = participants.filter(p => /^(usa onboard|program completed)$/i.test(p.placementStatus));
    const bySponsor = {};
    placed.forEach(p => {
      const sponsor = (p.processingSponsor && p.processingSponsor !== '—') ? p.processingSponsor : (p.programSource || 'Unknown');
      bySponsor[sponsor] = (bySponsor[sponsor] || 0) + 1;
    });
    const sponsorEntries = Object.entries(bySponsor).sort((a, b) => b[1] - a[1]);

    // ── Requisition stats (from job cache if available) ───────
    let reqActive = [], reqTotalOpenings = 0, reqByClient = {};
    try {
      const jobs = await Zoho.getJobOpenings();
      reqActive = jobs.filter(j =>
        /^j1 program$/i.test((j.placementCategory || '').trim()) &&
        /^active$/i.test((j.status || '').trim())
      );
      reqTotalOpenings = reqActive.reduce((s, j) => s + (Number(j.numPositions) || 0), 0);
      reqActive.forEach(j => {
        const client = j.clientName || 'Unknown';
        if (!reqByClient[client]) reqByClient[client] = { reqs: 0, openings: 0 };
        reqByClient[client].reqs++;
        reqByClient[client].openings += Number(j.numPositions) || 0;
      });
    } catch(e) { /* job openings optional */ }

    // ── Visa stats ────────────────────────────────────────────
    const visaPool     = participants.filter(p => p.visaStatus && p.visaStatus !== '—');
    const visaTotal    = visaPool.length;
    const visaApproved = visaPool.filter(p => /^approved$/i.test(p.visaStatus)).length;
    const visaPending  = visaPool.filter(p => /^pending$/i.test(p.visaStatus)).length;
    const visaRejected = visaPool.filter(p => !/^approved$/i.test(p.visaStatus) && !/^pending$/i.test(p.visaStatus)).length;
    const todayStr     = new Date().toISOString().split('T')[0];
    const visaUpcoming = participants.filter(p => p.visaAppointment && p.visaAppointment >= todayStr).length;
    const visaPassPct  = visaTotal ? Math.round(visaApproved / visaTotal * 100) : 0;

    mc.innerHTML = `
      <div class="page-header" style="margin-bottom:6px">
        <h1 style="font-size:1rem;margin-bottom:1px">Overview</h1>
        <p style="margin:0;font-size:0.73rem">Live summary · ${s.total} participants total</p>
      </div>

      <!-- Row 1: 3 bar charts -->
      <div class="ov-grid ov-grid-3" style="margin-bottom:6px">
        <div class="card ov-card">
          <div class="ov-card-title">Top Countries</div>
          <div class="ov-chart-wrap"><canvas id="chartCountry"></canvas></div>
        </div>
        <div class="card ov-card">
          <div class="ov-card-title">Stage Progress</div>
          <div class="ov-chart-wrap"><canvas id="chartStage"></canvas></div>
        </div>
        <div class="card ov-card">
          <div class="ov-card-title">Placement by Sponsor <span class="ov-sub">${placed.length} placed</span></div>
          <div class="ov-chart-wrap"><canvas id="chartSponsor"></canvas></div>
        </div>
      </div>

      <!-- Row 2: 3 donuts + Requisition bar -->
      <div class="ov-grid ov-grid-4">
        <div class="card ov-card">
          <div class="ov-card-title">Housing <span class="ov-sub">${housingRateOv}% rate</span></div>
          <div class="ov-chart-wrap ov-chart-donut"><canvas id="chartHousing"></canvas></div>
        </div>
        <div class="card ov-card">
          <div class="ov-card-title">✈️ Joining Flights <span class="ov-sub">${joiningOv.length} visa approved</span></div>
          <div class="ov-chart-wrap ov-chart-donut"><canvas id="chartJoining"></canvas></div>
        </div>
        <div class="card ov-card">
          <div class="ov-card-title">🏠 Return Flights <span class="ov-sub">${returningOv.length} onboard/completed</span></div>
          <div class="ov-chart-wrap ov-chart-donut"><canvas id="chartReturning"></canvas></div>
        </div>
        ${reqActive.length ? `
        <div class="card ov-card">
          <div class="ov-card-title">Requisition <span class="ov-sub">${reqActive.length} companies · ${reqTotalOpenings} openings</span></div>
          <div class="ov-chart-wrap ov-chart-donut"><canvas id="chartReq"></canvas></div>
        </div>` : ''}
      </div>

      <!-- Row 3: Visa Summary -->
      <div class="card ov-card" style="margin-top:6px">
        <div class="ov-card-title" style="margin-bottom:8px">🛂 Visa Summary</div>
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">

          <!-- Stat chips -->
          <div style="display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0">
            ${[
              { label:'Total Application', val: visaTotal,    color:'var(--text)' },
              { label:'Approved',          val: visaApproved, color:'#16a34a' },
              { label:'Rejected',          val: visaRejected, color:'var(--accent)' },
              { label:'Pending',           val: visaPending,  color:'#d97706' },
              { label:'Upcoming Appt.',    val: visaUpcoming, color:'#2563eb' },
            ].map(c => `
              <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:6px 12px;white-space:nowrap">
                <div style="font-size:1.1rem;font-weight:700;line-height:1.1;color:${c.color}">${c.val}</div>
                <div style="font-size:0.65rem;color:var(--muted);margin-top:1px">${c.label}</div>
              </div>
            `).join('')}
          </div>

          <!-- Divider -->
          <div style="width:1px;background:var(--border);align-self:stretch;flex-shrink:0"></div>

          <!-- Pie chart -->
          <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">
            <div style="font-size:0.68rem;font-weight:600;color:var(--text-secondary);margin-bottom:2px">Approved vs Rejected</div>
            <div style="position:relative;height:100px;width:130px"><canvas id="chartVisaOv"></canvas></div>
          </div>

          <!-- Divider -->
          <div style="width:1px;background:var(--border);align-self:stretch;flex-shrink:0"></div>

          <!-- Pass % -->
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 8px">
            <div style="font-size:2.4rem;font-weight:800;line-height:1;color:#16a34a">${visaPassPct}%</div>
            <div style="font-size:0.65rem;font-weight:600;color:var(--muted);margin-top:4px;text-align:center">Visa Passing<br>Percentage</div>
          </div>

        </div>
      </div>
    `;

    // Charts
    const COLORS = ['#B01A18','#1B3A6B','#16a34a','#d97706','#2563eb','#7c3aed','#db2777','#0891b2','#059669','#dc2626'];
    const cardBg = () => getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#fff';

    const donutOpts = (labels, data, colors) => ({
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors || COLORS, borderWidth: 2, borderColor: cardBg() }] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { font: { size: 9, family: 'Inter' }, padding: 5, boxWidth: 9 } }, datalabels: { display: false } } }
    });

    const hBarOpts = (labels, data, color, yWidth) => ({
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: color || '#1B3A6B', borderRadius: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false }, datalabels: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { font: { size: 8 } }, grid: { display: false } },
          y: {
            ticks: { font: { size: 8 } },
            afterFit: yWidth ? (axis => { axis.width = yWidth; }) : undefined
          }
        }
      }
    });

    // Top Countries — horizontal bar
    const sortedCountries = Object.entries(byCountry).sort((a,b) => b[1]-a[1]).slice(0, 10);
    new Chart(document.getElementById('chartCountry').getContext('2d'), hBarOpts(sortedCountries.map(e=>e[0]), sortedCountries.map(e=>e[1]), '#1B3A6B', 90));

    // Stage Progress — horizontal bar
    const stageLabels = ['New Submission','Consultation Call','Sales Call','Stage 1','Stage 2','Stage 3','Stage 4','USA Onboard','Program Completed'];
    const stageData   = stageLabels.map(l => participants.filter(p => p.placementStatus?.toLowerCase() === l.toLowerCase()).length);
    new Chart(document.getElementById('chartStage').getContext('2d'), hBarOpts(stageLabels, stageData, COLORS, 110));

    // Housing — donut
    new Chart(document.getElementById('chartHousing').getContext('2d'),
      donutOpts(['Available','No Info'], [housedOv.length, noHousingOv.length], ['#16a34a','#B01A18']));

    // Joining flights — donut
    new Chart(document.getElementById('chartJoining').getContext('2d'),
      donutOpts(['Booked','Not Booked'], [joiningBookedOv.length, joiningNotBookedOv.length], ['#16a34a','#B01A18']));

    // Returning flights — donut
    new Chart(document.getElementById('chartReturning').getContext('2d'),
      donutOpts(['Booked','Not Booked'], [returnBookedOv.length, returnNotBookedOv.length], ['#16a34a','#B01A18']));

    // Requisition by client — horizontal bar
    if (reqActive.length && document.getElementById('chartReq')) {
      const reqClients = Object.entries(reqByClient).sort((a,b) => b[1].openings - a[1].openings);
      new Chart(document.getElementById('chartReq').getContext('2d'), hBarOpts(reqClients.map(e=>e[0]), reqClients.map(e=>e[1].openings), '#2563eb', 150));
    }

    // Successful Placement by Sponsor — horizontal bar
    if (sponsorEntries.length && document.getElementById('chartSponsor')) {
      new Chart(document.getElementById('chartSponsor').getContext('2d'), hBarOpts(sponsorEntries.map(e=>e[0]), sponsorEntries.map(e=>e[1]), '#16a34a', 110));
    }

    // Visa summary pie
    if (document.getElementById('chartVisaOv') && (visaApproved || visaRejected || visaPending)) {
      const visaSum = visaApproved + visaRejected + visaPending;
      new Chart(document.getElementById('chartVisaOv').getContext('2d'), {
        type: 'pie',
        data: {
          labels: ['Approved','Rejected','Pending'],
          datasets: [{ data: [visaApproved, visaRejected, visaPending], backgroundColor: ['#16a34a','#B01A18','#d97706'], borderWidth: 2, borderColor: cardBg() }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 8, family:'Inter' }, padding: 5, boxWidth: 8 } },
            datalabels: {
              display: ctx => ctx.dataset.data[ctx.dataIndex] > 0,
              color: '#fff', font: { size: 10, weight: '700' },
              formatter: val => visaSum ? Math.round(val / visaSum * 100) + '%' : '',
            }
          }
        }
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  PAGE: PARTICIPANTS  (tabbed by J1 Application Status)
  // ═══════════════════════════════════════════════════════════

  // Tab definitions — label shown in UI, filter matches against placementStatus
  const PARTICIPANT_TABS = [
    { key: 'all',                label: 'All',                match: null },
    { key: 'new_submission',     label: 'New Submission',     match: /^new submission$/i },
    { key: 'consultation_call',  label: 'Consultation Call',  match: /^consultation call$/i },
    { key: 'sales_call',         label: 'Sales Call',         match: /^sales call$/i },
    { key: 'stage_1',            label: 'Stage 1',            match: /^stage 1$/i },
    { key: 'stage_2',            label: 'Stage 2',            match: /^stage 2$/i },
    { key: 'stage_3',            label: 'Stage 3',            match: /^stage 3$/i },
    { key: 'stage_4',            label: 'Stage 4',            match: /^stage 4$/i },
    { key: 'usa_onboard',        label: 'USA Onboard',        match: /^usa onboard$/i },
    { key: 'program_completed',  label: 'Program Completed',  match: /^program completed$/i },
    { key: 'total_placement',    label: 'Total J1 Placement', match: /^(usa onboard|program completed)$/i },
    { key: 'archived',           label: 'Archived Participants', match: null, archived: true },
  ];

  // All statuses covered by the named tabs — anything else goes to Archived
  const KNOWN_STATUSES = /^(new submission|consultation call|sales call|stage 1|stage 2|stage 3|stage 4|usa onboard|program completed)$/i;

  let _activeParticipantTab = 'all';
  let _sortCol = null;
  let _sortDir = null;

  // ── Per-tab column helpers ─────────────────────────────────
  const tc  = (label, key, render) => ({
    label, key,
    get:    p => (p[key] != null ? String(p[key]) : '').toLowerCase(),
    render: render || (p => p[key] || '—'),
  });
  const tcDate  = (label, key) => tc(label, key, p => formatDate(p[key]));
  const tcBadge = (label, key) => tc(label, key, p => badge(p[key]));
  const tcSrc   = () => ({ label: 'Source', key: '_source', get: p => p._source || '',
    render: p => `<span class="source-badge source-${p._source||'recruit'}">${p._source==='crm'?'CRM':'Recruit'}</span>` });

  // ── Column sets per tab ────────────────────────────────────
  const TAB_COLS = {
    all: [
      tc('Name','name', p => `<strong>${p.name||'—'}</strong>`),
      tc('Gender','gender'),
      tc('Email','email'),
      tc('Phone','phone'),
      tc('Age','age'),
      tc('Department','department'),
      tc('Nationality','country'),
      tc('Permanent Address','permanentAddress'),
      tc('J1 Program Sources','programSource'),
      tcSrc(),
    ],
    new_submission: [
      tc('Name','name', p => `<strong>${p.name||'—'}</strong>`),
      tc('Gender','gender'),
      tc('Email','email'),
      tc('Phone','phone'),
      tc('Age','age'),
      tc('Department','department'),
      tc('Nationality','country'),
      tc('Permanent Address','permanentAddress'),
      tcBadge("CTI USA's Review",'ctiUsaReview'),
      tc('Eligible Programs','eligiblePrograms'),
      tcSrc(),
    ],
    consultation_call: [
      tc('Name','name', p => `<strong>${p.name||'—'}</strong>`),
      tc('Gender','gender'),
      tc('Age','age'),
      tc('Department','department'),
      tc('Nationality','country'),
      tc('Permanent Address','permanentAddress'),
      tcDate('Consultation Call Date','consultationCallDate'),
      tc('Done By','consultationCallBy'),
      tc('Call Notes','consultationCallNotes'),
      tcBadge('Call Status','consultationCallStatus'),
      tcSrc(),
    ],
    sales_call: [
      tc('Name','name', p => `<strong>${p.name||'—'}</strong>`),
      tc('Gender','gender'),
      tc('Age','age'),
      tc('Department','department'),
      tc('Nationality','country'),
      tc('Permanent Address','permanentAddress'),
      tcDate('Consultation Call Date','consultationCallDate'),
      tcBadge('Call Status','consultationCallStatus'),
      tc('J1 Program Sources','programSource'),
      tc('Stage 1 Investment','stage1Investment'),
      tcSrc(),
    ],
    stage_1: [
      tc('Name','name', p => `<strong>${p.name||'—'}</strong>`),
      tc('Gender','gender'),
      tc('Age','age'),
      tc('Department','department'),
      tc('Nationality','country'),
      tcBadge('Passport Status','passportStatus'),
      tc('Passport Number','passportNumber'),
      tcDate('Passport Expiry','passportExpiry'),
      tcBadge('Proof of Academic','proofAcademic'),
      tc('Processing Sponsor','processingSponsor'),
      tcSrc(),
    ],
    stage_2: [
      tc('Name','name', p => `<strong>${p.name||'—'}</strong>`),
      tc('Gender','gender'),
      tc('Age','age'),
      tc('Department','department'),
      tc('Nationality','country'),
      tc('Processing Sponsor','processingSponsor'),
      tc('Hosting Company','hostCompany'),
      tcDate('HC Interview Date','hcInterviewDate'),
      tcBadge('HC Interview Status','hcInterviewStatus'),
      tcSrc(),
    ],
    stage_3: [
      tc('Name','name', p => `<strong>${p.name||'—'}</strong>`),
      tc('Gender','gender'),
      tc('Department','department'),
      tc('Nationality','country'),
      tc('Processing Sponsor','processingSponsor'),
      tc('Hosting Company','hostCompany'),
      tcBadge('J1 Visa Status','visaStatus'),
      tcDate('Visa Appointment','visaAppointment'),
      tc('Visa Number','visaNumber'),
      tcDate('Visa Expired','ds2019End'),
    ],
    stage_4: [
      tc('Name','name', p => `<strong>${p.name||'—'}</strong>`),
      tc('Gender','gender'),
      tc('Nationality','country'),
      tc('Hosting Company','hostCompany'),
      tcDate('Departure Date','departureDate'),
      tcDate('Arrival Date','arrivalDate'),
      { label:'Route', key:null, get:()=>'', render: p => [p.tripFrom,p.tripTo].filter(v=>v&&v!=='—').join(' → ')||'—' },
      tc('Airline','airline'),
      tc('PNR Number','pnrNumber'),
      tcBadge('Flight Status','flightBooked'),
      tcBadge('Housing Avail.','housingAvailability'),
      tc('Landlord','housingLandlord'),
      tc('Housing Address','housingAddress'),
    ],
    usa_onboard: [
      tc('Name','name', p => `<strong>${p.name||'—'}</strong>`),
      tc('Gender','gender'),
      tc('Department','department'),
      tc('Nationality','country'),
      tc('Processing Sponsor','processingSponsor'),
      tc('Hosting Company','hostCompany'),
      tc('Landlord','housingLandlord'),
      tc('Housing Address','housingAddress'),
      tcDate('Program Start','programStart'),
      tcDate('Program End','programEnd'),
      tc('Total Paid Investment','totalPaidInvestment'),
      tcBadge('Sponsor Invoice Status','sponsorInvoiceStatus'),
    ],
    program_completed: [
      tc('Name','name', p => `<strong>${p.name||'—'}</strong>`),
      tc('Gender','gender'),
      tc('Department','department'),
      tc('Nationality','country'),
      tc('Processing Sponsor','processingSponsor'),
      tc('Hosting Company','hostCompany'),
      tcDate('Program Start','programStart'),
      tcDate('Program End','programEnd'),
      tcDate('Return Arrival','returnArrival'),
    ],
    total_placement: [
      tc('Name','name', p => `<strong>${p.name||'—'}</strong>`),
      tc('Gender','gender'),
      tc('Department','department'),
      tc('Nationality','country'),
      tc('Processing Sponsor','processingSponsor'),
      tc('Hosting Company','hostCompany'),
      tcDate('Program Start','programStart'),
      tcDate('Program End','programEnd'),
      tcBadge('App Status','placementStatus'),
    ],
    archived: [
      tc('Name','name', p => `<strong>${p.name||'—'}</strong>`),
      tc('Gender','gender'),
      tc('Email','email'),
      tc('Phone','phone'),
      tc('Age','age'),
      tc('Department','department'),
      tc('Nationality','country'),
      tc('Permanent Address','permanentAddress'),
      tcBadge('J1 App Status','placementStatus'),
      tcBadge("CTI USA's Review",'ctiUsaReview'),
      tcDate('Consultation Call Date','consultationCallDate'),
      tc('Done By','consultationCallBy'),
      tcBadge('Call Status','consultationCallStatus'),
      tc('Call Notes','consultationCallNotes'),
      tc('Withdrawal Reason','withdrawalReason'),
      tc('J1 Program Sources','programSource'),
    ],
  };

  async function renderParticipants() {
    const mc = document.getElementById('main-content');
    mc.innerHTML = skeletonHTML();

    const participants = await loadData();
    if (!participants) { mc.innerHTML = connectPromptHTML(); return; }

    // Count per tab for the badges
    function countForTab(tab) {
      if (tab.archived) return participants.filter(p => !KNOWN_STATUSES.test(p.placementStatus)).length;
      if (!tab.match)   return participants.length;
      return participants.filter(p => tab.match.test(p.placementStatus)).length;
    }

    function sortIcon(key) {
      if (_sortCol !== key) return `<span class="sort-icon">⇅</span>`;
      if (_sortDir === 'asc')  return `<span class="sort-icon active">↑</span>`;
      if (_sortDir === 'desc') return `<span class="sort-icon active">↓</span>`;
      return `<span class="sort-icon">⇅</span>`;
    }

    function buildTable(list) {
      const cols = TAB_COLS[_activeParticipantTab] || TAB_COLS.all;
      if (!list.length) return `<div class="empty-state"><p>No participants in this category.</p></div>`;
      return `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="position:sticky;left:0;z-index:12;background:var(--card)">#</th>
                ${cols.map((col, ci) => {
                  const frozen = ci === 0 ? `style="position:sticky;left:40px;z-index:12;background:var(--card)"` : '';
                  return col.key
                    ? `<th class="sortable ${_sortCol===col.key?'sorted':''}" data-col="${col.key}" ${frozen}>${col.label} ${sortIcon(col.key)}</th>`
                    : `<th ${frozen}>${col.label}</th>`;
                }).join('')}
              </tr>
            </thead>
            <tbody>
              ${list.map((p, i) => `
                <tr>
                  <td class="row-num" style="position:sticky;left:0;z-index:1;background:var(--card)">${i+1}</td>
                  ${cols.map((col, ci) => {
                    const frozen = ci === 0 ? `style="position:sticky;left:40px;z-index:1;background:var(--card)"` : '';
                    return `<td ${frozen}>${col.render(p)}</td>`;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    function getTabData(key) {
      const tab = PARTICIPANT_TABS.find(t => t.key === key);
      if (!tab) return participants;
      if (tab.archived) return participants.filter(p => !KNOWN_STATUSES.test(p.placementStatus));
      if (!tab.match)   return participants;
      return participants.filter(p => tab.match.test(p.placementStatus));
    }

    function applyFilters(list) {
      const q       = (document.getElementById('searchInput')?.value || '').toLowerCase();
      const country = (document.getElementById('filterCountry')?.value || '').toLowerCase();
      const source  = (document.getElementById('filterSource')?.value || '').toLowerCase();

      if (q)       list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.country.toLowerCase().includes(q) ||
        p.hostCompany.toLowerCase().includes(q)
      );
      if (country) list = list.filter(p => p.country.toLowerCase() === country);
      if (source)  list = list.filter(p => (p.programSource || '').toLowerCase() === source);

      return list;
    }

    function applySort(list) {
      if (!_sortCol || !_sortDir) return list;
      const cols = TAB_COLS[_activeParticipantTab] || TAB_COLS.all;
      const col = cols.find(c => c.key === _sortCol);
      if (!col || !col.get) return list;
      return [...list].sort((a, b) => {
        const av = col.get(a), bv = col.get(b);
        if (av < bv) return _sortDir === 'asc' ? -1 : 1;
        if (av > bv) return _sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    function refreshTable() {
      const base     = getTabData(_activeParticipantTab);
      const filtered = applyFilters(base);
      const sorted   = applySort(filtered);
      document.getElementById('participantTable').innerHTML = buildTable(sorted);
      document.getElementById('tabCount').textContent = `${sorted.length} participant${sorted.length !== 1 ? 's' : ''}`;

      // Wire sort clicks on freshly rendered headers
      document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
          const col = th.dataset.col;
          if (_sortCol !== col) {
            _sortCol = col; _sortDir = 'asc';
          } else if (_sortDir === 'asc') {
            _sortDir = 'desc';
          } else if (_sortDir === 'desc') {
            _sortCol = null; _sortDir = null;
          }
          refreshTable();
        });
      });
    }

    mc.innerHTML = `
      <div class="page-header">
        <h1>Participants</h1>
        <p>${participants.length} participants loaded from Zoho CRM &amp; Recruit</p>
      </div>

      <!-- Sticky header: tabs + filters -->
      <div class="participants-sticky-header">
        <div class="tab-bar">
          ${PARTICIPANT_TABS.map(t => `
            <button class="tab-btn ${t.key === _activeParticipantTab ? 'active' : ''}" data-tab="${t.key}">
              ${t.label}
              <span class="tab-count-badge">${countForTab(t)}</span>
            </button>
          `).join('')}
        </div>
        <div class="filter-bar">
          <input class="search-input" id="searchInput" placeholder="Search by name, country, company…">
          <select class="filter-select" id="filterCountry">
            <option value="">All Countries</option>
            ${[...new Set(participants.map(p => p.country).filter(c => c && c !== '—'))].sort()
              .map(c => `<option value="${c.toLowerCase()}">${c}</option>`).join('')}
          </select>
          <select class="filter-select" id="filterSource">
            <option value="">All Program Sources</option>
            ${[...new Set(participants.map(p => p.programSource).filter(s => s && s !== '—'))].sort()
              .map(s => `<option value="${s.toLowerCase()}">${s}</option>`).join('')}
          </select>
          <span id="tabCount" style="margin-left:auto;font-size:0.82rem;color:var(--muted)"></span>
        </div>
      </div>

      <div class="card" style="margin-top:0;border-top-left-radius:0;border-top-right-radius:0;">
        <div id="participantTable"></div>
      </div>
    `;

    // Wire up tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _activeParticipantTab = btn.dataset.tab;
        _sortCol = null; _sortDir = null; // reset sort on tab change
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        refreshTable();
      });
    });

    // Wire up filters
    document.getElementById('searchInput').addEventListener('input', refreshTable);
    document.getElementById('filterCountry').addEventListener('change', refreshTable);
    document.getElementById('filterSource').addEventListener('change', refreshTable);

    refreshTable(); // initial render
  }

  // ═══════════════════════════════════════════════════════════
  //  PAGE: VISA
  // ═══════════════════════════════════════════════════════════
  let _visaFilterMonth       = '';
  let _visaFilterNationality = '';
  let _visaSortCol           = null;
  let _visaSortDir           = null;
  let _visaChartInst         = null;

  async function renderVisa() {
    const mc = document.getElementById('main-content');
    mc.innerHTML = skeletonHTML();

    const participants = await loadData();
    if (!participants) { mc.innerHTML = connectPromptHTML(); return; }

    // Visa pool = all participants with any visa status
    const visaPool = participants.filter(p => p.visaStatus && p.visaStatus !== '—');

    const VISA_COLS = [
      { label: 'Name',                     key: 'name',           get: p => (p.name || '').toLowerCase(),           render: p => `<strong>${p.name || '—'}</strong>` },
      { label: 'Program Start',            key: 'programStart',   get: p => p.programStart || '',                   render: p => formatDate(p.programStart) },
      { label: 'Nationality',              key: 'country',        get: p => (p.country || '').toLowerCase(),        render: p => p.country || '—' },
      { label: 'J1 Visa Status',           key: 'visaStatus',     get: p => (p.visaStatus || '').toLowerCase(),     render: p => badge(p.visaStatus) },
      { label: 'Supporting Letter Status', key: 'refLetterStatus',get: p => (p.refLetterStatus || '').toLowerCase(),render: p => badge(p.refLetterStatus) },
      { label: 'Visa Payment Date',        key: 'visaPaymentDate',get: p => p.visaPaymentDate || '',                render: p => formatDate(p.visaPaymentDate) },
      { label: 'Visa Appointment Date',    key: 'visaAppointment',get: p => p.visaAppointment || '',                render: p => formatDate(p.visaAppointment) },
      { label: 'Visa Number',              key: 'visaNumber',     get: p => (p.visaNumber || '').toLowerCase(),     render: p => p.visaNumber || '—' },
      { label: 'Visa Expired Date',        key: 'ds2019End',      get: p => p.ds2019End || '',                      render: p => formatDate(p.ds2019End) },
    ];

    function computeStats(list) {
      const today    = new Date().toISOString().split('T')[0];
      const total    = list.length;
      const approved = list.filter(p => /^approved$/i.test(p.visaStatus)).length;
      const pending  = list.filter(p => /^pending$/i.test(p.visaStatus)).length;
      const rejected = list.filter(p => !/^approved$/i.test(p.visaStatus) && !/^pending$/i.test(p.visaStatus)).length;
      // Upcoming = all participants with a future appointment, regardless of visa status
      const upcoming = participants.filter(p => p.visaAppointment && p.visaAppointment >= today).length;
      return { total, approved, rejected, pending, upcoming };
    }

    function applyVisaFilter(list) {
      let out = list;
      if (_visaFilterMonth)       out = out.filter(p => p.visaAppointment && p.visaAppointment.substring(0, 7) === _visaFilterMonth);
      if (_visaFilterNationality) out = out.filter(p => (p.country || '').toLowerCase() === _visaFilterNationality);
      return out;
    }

    function vSortIcon(key) {
      if (_visaSortCol !== key) return `<span class="sort-icon">⇅</span>`;
      return `<span class="sort-icon active">${_visaSortDir === 'asc' ? '↑' : '↓'}</span>`;
    }

    function applyVisaSort(list) {
      if (!_visaSortCol || !_visaSortDir) return list;
      const col = VISA_COLS.find(c => c.key === _visaSortCol);
      if (!col) return list;
      return [...list].sort((a, b) => {
        const av = col.get(a), bv = col.get(b);
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return _visaSortDir === 'asc' ? cmp : -cmp;
      });
    }

    function renderStatsHTML(s) {
      const mini = 'background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:7px 14px;white-space:nowrap';
      return `
        <div style="${mini}">
          <div style="font-size:1.2rem;font-weight:700;line-height:1.1">${s.total}</div>
          <div style="font-size:0.67rem;color:var(--muted);margin-top:1px">Total Application</div>
        </div>
        <div style="${mini}">
          <div style="font-size:1.2rem;font-weight:700;line-height:1.1;color:#16a34a">${s.approved}</div>
          <div style="font-size:0.67rem;color:var(--muted);margin-top:1px">Approved</div>
        </div>
        <div style="${mini}">
          <div style="font-size:1.2rem;font-weight:700;line-height:1.1;color:var(--accent)">${s.rejected}</div>
          <div style="font-size:0.67rem;color:var(--muted);margin-top:1px">Rejected</div>
        </div>
        <div style="${mini}">
          <div style="font-size:1.2rem;font-weight:700;line-height:1.1;color:#d97706">${s.pending}</div>
          <div style="font-size:0.67rem;color:var(--muted);margin-top:1px">Pending</div>
        </div>
        <div style="${mini}">
          <div style="font-size:1.2rem;font-weight:700;line-height:1.1;color:#2563eb">${s.upcoming}</div>
          <div style="font-size:0.67rem;color:var(--muted);margin-top:1px">Upcoming Appt.</div>
        </div>
      `;
    }

    function renderPassRate(s) {
      const el = document.getElementById('visaPassRate');
      if (!el) return;
      const pct = s.total ? Math.round(s.approved / s.total * 100) : 0;
      el.innerHTML = `
        <div style="font-size:2.6rem;font-weight:800;line-height:1;color:#16a34a">${pct}%</div>
        <div style="font-size:0.67rem;font-weight:600;color:var(--muted);margin-top:4px;text-align:center;white-space:nowrap">Visa Passing<br>Percentage</div>
      `;
    }

    function drawPieChart(s) {
      if (_visaChartInst) { _visaChartInst.destroy(); _visaChartInst = null; }
      const canvas = document.getElementById('visaPieChart');
      if (!canvas || !(s.approved || s.rejected || s.pending)) return;
      const sum = s.approved + s.rejected + s.pending;
      _visaChartInst = new Chart(canvas.getContext('2d'), {
        type: 'pie',
        data: {
          labels: ['Approved', 'Rejected', 'Pending'],
          datasets: [{
            data: [s.approved, s.rejected, s.pending],
            backgroundColor: ['#16a34a', '#B01A18', '#d97706'],
            borderWidth: 2,
            borderColor: getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#fff',
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 9, family: 'Inter' }, padding: 6, boxWidth: 10 } },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const pct = sum ? Math.round(ctx.parsed / sum * 100) : 0;
                  return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
                }
              }
            },
            datalabels: {
              display: ctx => ctx.dataset.data[ctx.dataIndex] > 0,
              color: '#fff',
              font: { size: 11, weight: '700', family: 'Inter' },
              formatter: (val) => sum ? Math.round(val / sum * 100) + '%' : '',
            }
          }
        }
      });
    }

    function visaTable(list) {
      const sorted = applyVisaSort(list);
      if (!sorted.length) return `<div class="empty-state"><p>No visa records match the selected filters.</p></div>`;
      return `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="position:sticky;left:0;z-index:12;background:var(--card)">#</th>
                ${VISA_COLS.map((c, ci) => {
                  const frozen = ci === 0 ? `style="position:sticky;left:40px;z-index:12;background:var(--card)"` : '';
                  return `<th class="sortable ${_visaSortCol === c.key ? 'sorted' : ''}" data-vcol="${c.key}" ${frozen}>${c.label} ${vSortIcon(c.key)}</th>`;
                }).join('')}
              </tr>
            </thead>
            <tbody>
              ${sorted.map((p, i) => `
                <tr>
                  <td class="row-num" style="position:sticky;left:0;z-index:1;background:var(--card)">${i + 1}</td>
                  ${VISA_COLS.map((c, ci) => {
                    const frozen = ci === 0 ? `style="position:sticky;left:40px;z-index:1;background:var(--card)"` : '';
                    return `<td ${frozen}>${c.render(p)}</td>`;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    function refreshVisa() {
      const filtered = applyVisaFilter(visaPool);
      const s = computeStats(filtered);

      document.getElementById('visaStatsGrid').innerHTML  = renderStatsHTML(s);
      drawPieChart(s);
      renderPassRate(s);
      document.getElementById('visaTableCard').innerHTML  = visaTable(filtered);
      const countEl = document.getElementById('visaFilterCount');
      if (countEl) countEl.textContent = `${filtered.length} record${filtered.length !== 1 ? 's' : ''}`;
      // restore select values after innerHTML replace (stats grid only, selects are outside)
      wireVisaSort();
    }

    function wireVisaSort() {
      document.querySelectorAll('[data-vcol]').forEach(th => {
        th.addEventListener('click', () => {
          const col = th.dataset.vcol;
          if (_visaSortCol !== col) { _visaSortCol = col; _visaSortDir = 'asc'; }
          else if (_visaSortDir === 'asc') { _visaSortDir = 'desc'; }
          else { _visaSortCol = null; _visaSortDir = null; }
          document.getElementById('visaTableCard').innerHTML = visaTable(applyVisaFilter(visaPool));
          wireVisaSort();
        });
      });
    }

    // Initial stats
    const initFiltered = applyVisaFilter(visaPool);
    const initStats    = computeStats(initFiltered);

    mc.innerHTML = `
      <div class="page-header">
        <h1>Visa</h1>
        <p>J1 Visa application status and tracking</p>
      </div>

      <!-- Stats + pie + filters — all in one compact band -->
      <div class="card" style="margin-bottom:12px;padding:10px 14px">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">

          <!-- Stat chips -->
          <div id="visaStatsGrid" style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap">
            ${renderStatsHTML(initStats)}
          </div>

          <!-- Divider -->
          <div style="width:1px;background:var(--border);align-self:stretch;flex-shrink:0"></div>

          <!-- Pie chart + passing % -->
          <div style="display:flex;align-items:center;gap:14px;flex-shrink:0">
            <div style="display:flex;flex-direction:column;align-items:center">
              <div style="font-size:0.7rem;font-weight:600;color:var(--text-secondary);margin-bottom:2px">Approved vs Rejected</div>
              <div style="position:relative;height:110px;width:140px"><canvas id="visaPieChart"></canvas></div>
            </div>
            <div id="visaPassRate" style="display:flex;flex-direction:column;align-items:center;justify-content:center"></div>
          </div>

          <!-- Divider -->
          <div style="width:1px;background:var(--border);align-self:stretch;flex-shrink:0"></div>

          <!-- Filter controls -->
          <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
            <!-- Row 1: month picker -->
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:0.73rem;font-weight:600;color:var(--text-secondary);white-space:nowrap">Appointment Month:</span>
              <select class="filter-select" id="visaMonthFilter" style="font-size:0.72rem;min-width:150px">
                <option value="">All Months</option>
                ${[...new Set(visaPool.map(p => p.visaAppointment ? p.visaAppointment.substring(0,7) : null).filter(Boolean))].sort()
                  .map(ym => {
                    const [yr, mo] = ym.split('-');
                    const label = new Date(yr, mo - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    return `<option value="${ym}" ${_visaFilterMonth === ym ? 'selected' : ''}>${label}</option>`;
                  }).join('')}
              </select>
            </div>
            <!-- Row 2: nationality + clear + count -->
            <div style="display:flex;align-items:center;gap:6px">
              <select class="filter-select" id="visaFilterNat" style="font-size:0.72rem">
                <option value="">All Nationalities</option>
                ${[...new Set(visaPool.map(p => p.country).filter(c => c && c !== '—'))].sort()
                  .map(c => `<option value="${c.toLowerCase()}" ${_visaFilterNationality === c.toLowerCase() ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
              <button id="visaClearFilter" style="font-size:0.72rem;padding:3px 10px;border-radius:6px;border:1px solid var(--border);background:var(--card);color:var(--text);cursor:pointer;white-space:nowrap">Clear</button>
              <span id="visaFilterCount" style="font-size:0.72rem;color:var(--muted);white-space:nowrap">${initFiltered.length} record${initFiltered.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

        </div>
      </div>

      <!-- Table -->
      <div class="card" id="visaTableCard">
        ${visaTable(initFiltered)}
      </div>
    `;

    drawPieChart(initStats);
    renderPassRate(initStats);
    wireVisaSort();

    document.getElementById('visaMonthFilter').addEventListener('change', e => { _visaFilterMonth       = e.target.value; refreshVisa(); });
    document.getElementById('visaFilterNat').addEventListener('change',   e => { _visaFilterNationality = e.target.value; refreshVisa(); });
    document.getElementById('visaClearFilter').addEventListener('click', () => {
      _visaFilterMonth = ''; _visaFilterNationality = '';
      document.getElementById('visaMonthFilter').value = '';
      document.getElementById('visaFilterNat').value   = '';
      refreshVisa();
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  PAGE: TRAVEL
  // ═══════════════════════════════════════════════════════════
  let _activeTravelTab  = 'joining';
  let _travelSortCol    = null;
  let _travelSortDir    = null;

  async function renderTravel() {
    const mc = document.getElementById('main-content');
    mc.innerHTML = skeletonHTML();

    const participants = await loadData();
    if (!participants) { mc.innerHTML = connectPromptHTML(); return; }

    // ── Joining = J1 Visa Status is Approved only ───────────
    const joiningAll       = participants.filter(p => /^approved$/i.test(p.visaStatus));
    const joiningBooked    = joiningAll.filter(p =>  p.flightBooked === true || /yes|booked|confirmed/i.test(String(p.flightBooked)));
    const joiningNotBooked = joiningAll.filter(p => !(p.flightBooked === true || /yes|booked|confirmed/i.test(String(p.flightBooked))));

    // ── Returning = USA Onboard & Program Completed only ────
    const returningAll    = participants.filter(p => /^(usa onboard|program completed)$/i.test(p.placementStatus));
    const returnBooked    = returningAll.filter(p => /yes|booked|confirmed/i.test(String(p.returnFlightStatus)));
    const returnNotBooked = returningAll.filter(p => !/yes|booked|confirmed/i.test(String(p.returnFlightStatus)));

    // Column defs for each tab
    const JOINING_COLS = [
      { label: '#',             key: null },
      { label: 'Name',          key: 'name',           get: p => (p.name || '').toLowerCase() },
      { label: 'Country',       key: 'country',        get: p => (p.country || '').toLowerCase() },
      { label: 'Route',         key: 'tripFrom',       get: p => (p.tripFrom || '').toLowerCase() },
      { label: 'Departure',     key: 'departureDate',  get: p => p.departureDate || '' },
      { label: 'Arrival',       key: 'arrivalDate',    get: p => p.arrivalDate || '' },
      { label: 'Airline',       key: 'airline',        get: p => (p.airline || '').toLowerCase() },
      { label: 'PNR',           key: 'pnrNumber',      get: p => (p.pnrNumber || '').toLowerCase() },
      { label: 'Gateway',       key: 'airportGateway', get: p => (p.airportGateway || '').toLowerCase() },
      { label: 'Pick-Up',       key: 'airportPickup',  get: p => (p.airportPickup || '').toLowerCase() },
      { label: 'Flight Status', key: 'flightBooked',   get: p => String(p.flightBooked) },
      { label: 'Ticket Payment',key: 'ticketPayStatus',get: p => (p.ticketPayStatus || '').toLowerCase() },
      { label: 'Pricing',       key: 'ticketPricing',  get: p => p.ticketPricing || 0 },
    ];

    const RETURNING_COLS = [
      { label: '#',             key: null },
      { label: 'Name',          key: 'name',              get: p => (p.name || '').toLowerCase() },
      { label: 'Country',       key: 'country',           get: p => (p.country || '').toLowerCase() },
      { label: 'Route',         key: 'returnTripFrom',    get: p => (p.returnTripFrom || '').toLowerCase() },
      { label: 'Departure',     key: 'returnDeparture',   get: p => p.returnDeparture || '' },
      { label: 'Arrival',       key: 'returnArrival',     get: p => p.returnArrival || '' },
      { label: 'Airline',       key: 'returnAirline',     get: p => (p.returnAirline || '').toLowerCase() },
      { label: 'PNR',           key: 'returnPNR',         get: p => (p.returnPNR || '').toLowerCase() },
      { label: 'Gateway',       key: 'returnGateway',     get: p => (p.returnGateway || '').toLowerCase() },
      { label: 'Flight Status', key: 'returnFlightStatus',get: p => (p.returnFlightStatus || '').toLowerCase() },
    ];

    function tSortIcon(key) {
      if (_travelSortCol !== key) return `<span class="sort-icon">⇅</span>`;
      if (_travelSortDir === 'asc')  return `<span class="sort-icon active">↑</span>`;
      if (_travelSortDir === 'desc') return `<span class="sort-icon active">↓</span>`;
      return `<span class="sort-icon">⇅</span>`;
    }

    function applySortTravel(list, cols) {
      if (!_travelSortCol || !_travelSortDir) return list;
      const col = cols.find(c => c.key === _travelSortCol);
      if (!col) return list;
      return [...list].sort((a, b) => {
        const av = col.get(a), bv = col.get(b);
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return _travelSortDir === 'asc' ? cmp : -cmp;
      });
    }

    function joiningTable(list) {
      if (!list.length) return `<div class="empty-state"><p>No participants in this category.</p></div>`;
      const sorted = applySortTravel(list, JOINING_COLS);
      return `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                ${JOINING_COLS.map(c => c.key
                  ? `<th class="sortable ${_travelSortCol === c.key ? 'sorted' : ''}" data-tcol="${c.key}">${c.label} ${tSortIcon(c.key)}</th>`
                  : `<th>#</th>`
                ).join('')}
              </tr>
            </thead>
            <tbody>
              ${sorted.map((p, i) => `
                <tr>
                  <td class="row-num">${i + 1}</td>
                  <td><strong>${p.name}</strong></td>
                  <td>${p.country}</td>
                  <td style="font-size:0.8rem;white-space:nowrap">${p.tripFrom} → ${p.tripTo}</td>
                  <td>${formatDate(p.departureDate)}</td>
                  <td>${formatDate(p.arrivalDate)}</td>
                  <td>${p.airline}</td>
                  <td style="font-family:monospace;font-size:0.82rem">${p.pnrNumber}</td>
                  <td>${p.airportGateway}</td>
                  <td>${p.airportPickup}</td>
                  <td>${flightBadge(p.flightBooked)}</td>
                  <td>${badge(p.ticketPayStatus)}</td>
                  <td>${p.ticketPricing ? '$' + p.ticketPricing : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    function returningTable(list) {
      if (!list.length) return `<div class="empty-state"><p>No participants in this category.</p></div>`;
      const sorted = applySortTravel(list, RETURNING_COLS);
      return `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                ${RETURNING_COLS.map(c => c.key
                  ? `<th class="sortable ${_travelSortCol === c.key ? 'sorted' : ''}" data-tcol="${c.key}">${c.label} ${tSortIcon(c.key)}</th>`
                  : `<th>#</th>`
                ).join('')}
              </tr>
            </thead>
            <tbody>
              ${sorted.map((p, i) => `
                <tr>
                  <td class="row-num">${i + 1}</td>
                  <td><strong>${p.name}</strong></td>
                  <td>${p.country}</td>
                  <td style="font-size:0.8rem;white-space:nowrap">${p.returnTripFrom} → ${p.returnTripTo}</td>
                  <td>${formatDate(p.returnDeparture)}</td>
                  <td>${formatDate(p.returnArrival)}</td>
                  <td>${p.returnAirline}</td>
                  <td style="font-family:monospace;font-size:0.82rem">${p.returnPNR}</td>
                  <td>${p.returnGateway}</td>
                  <td>${badge(p.returnFlightStatus)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    function renderTravelContent() {
      const isJoining = _activeTravelTab === 'joining';
      const booked    = isJoining ? joiningBooked    : returnBooked;
      const notBooked = isJoining ? joiningNotBooked : returnNotBooked;
      const total     = isJoining ? joiningAll.length : returningAll.length;

      return `
        <div class="stat-grid">
          <div class="stat-card good">
            <div class="stat-value">${booked.length}</div>
            <div class="stat-label">Flights Booked</div>
          </div>
          <div class="stat-card accent">
            <div class="stat-value">${notBooked.length}</div>
            <div class="stat-label">Not Yet Booked</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${total ? Math.round(booked.length / total * 100) : 0}%</div>
            <div class="stat-label">Booking Rate</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><div class="card-title accent" style="color:var(--accent)">Not Yet Booked (${notBooked.length})</div></div>
          ${isJoining ? joiningTable(notBooked) : returningTable(notBooked)}
        </div>

        <div class="card">
          <div class="card-header"><div class="card-title" style="color:#166534">✓ Flights Booked (${booked.length})</div></div>
          ${isJoining ? joiningTable(booked) : returningTable(booked)}
        </div>
      `;
    }

    function renderTravelPage() {
      mc.innerHTML = `
        <div class="page-header">
          <h1>Travel</h1>
          <p>Track flight booking status for all participants</p>
        </div>

        <div class="participants-sticky-header">
          <div class="tab-bar" id="travelTabBar">
            <button class="tab-btn ${_activeTravelTab === 'joining'   ? 'active' : ''}" data-ttab="joining">
              ✈️ Joining Participants
              <span class="tab-count-badge">${joiningAll.length}</span>
            </button>
            <button class="tab-btn ${_activeTravelTab === 'returning' ? 'active' : ''}" data-ttab="returning">
              🏠 Returning Participants
              <span class="tab-count-badge">${returningAll.length}</span>
            </button>
          </div>
        </div>

        <div id="travelContent" style="margin-top:12px">
          ${renderTravelContent()}
        </div>
      `;

      document.getElementById('travelTabBar').addEventListener('click', e => {
        const btn = e.target.closest('[data-ttab]');
        if (!btn) return;
        _activeTravelTab = btn.dataset.ttab;
        _travelSortCol = null; _travelSortDir = null;
        renderTravelPage();
      });

      // Sort column clicks — delegate from mc so it survives content re-renders
      mc.addEventListener('click', function onTravelSort(e) {
        const th = e.target.closest('[data-tcol]');
        if (!th) return;
        const col = th.dataset.tcol;
        if (_travelSortCol === col) {
          _travelSortDir = _travelSortDir === 'asc' ? 'desc' : _travelSortDir === 'desc' ? null : 'asc';
          if (!_travelSortDir) _travelSortCol = null;
        } else {
          _travelSortCol = col; _travelSortDir = 'asc';
        }
        document.getElementById('travelContent').innerHTML = renderTravelContent();
      });
    }

    renderTravelPage();
  }

  // ═══════════════════════════════════════════════════════════
  //  ROUTER
  // ═══════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════
  //  REQUISITION PAGE
  // ═══════════════════════════════════════════════════════════
  let _reqSortCol       = null;
  let _reqSortDir       = null;
  let _jobCache         = null;
  let _reqFilterDept    = '';
  let _reqFilterHousing = '';
  let _reqFilterProgram = '';

  async function renderRequisition() {
    const mc = document.getElementById('main-content');
    mc.innerHTML = skeletonHTML();

    if (!ZohoAuth.isConnected()) { mc.innerHTML = connectPromptHTML(); return; }

    try {
      _jobCache = await Zoho.getJobOpenings();
    } catch (e) {
      mc.innerHTML = `<div class="empty-state"><p>Failed to load Job Openings: ${e.message}</p></div>`;
      return;
    }

    // Filter: Placement Category = J1 Program AND Requisition Status = Active
    const active = _jobCache.filter(j =>
      /^j1 program$/i.test((j.placementCategory || '').trim()) &&
      /^active$/i.test((j.status || '').trim())
    );
    const allJ1  = _jobCache.filter(j => /^j1 program$/i.test((j.placementCategory || '').trim()));
    const filled = allJ1.filter(j => /filled|closed/i.test(j.status));

    const REQ_COLS = [
      { label: '#',                  key: null },
      { label: 'Hosting Company',    key: 'hostingCompany',   get: j => (j.hostingCompany || '').toLowerCase() },
      { label: 'City',               key: 'city',             get: j => (j.city || '').toLowerCase() },
      { label: 'Department',         key: 'department',       get: j => (j.department || '').toLowerCase() },
      { label: 'Requisition',        key: 'numPositions',     get: j => j.numPositions || 0 },
      { label: 'Stipend',            key: 'salary',           get: j => parseFloat(String(j.salary || '').replace(/[^0-9.]/g, '')) || 0 },
      { label: 'Payment Frequency',  key: 'paymentFrequency', get: j => (j.paymentFrequency || '').toLowerCase() },
      { label: 'Housing Availability', key: 'housingAvail',   get: j => (j.housingAvail || '').toLowerCase() },
      { label: 'Contract Length',    key: 'contractLength',   get: j => (j.contractLength || '').toLowerCase() },
      { label: 'J1 Program Type',    key: 'j1ProgramType',    get: j => (j.j1ProgramType || '').toLowerCase() },
      { label: 'Client Name',        key: 'clientName',       get: j => (j.clientName || '').toLowerCase() },
    ];

    function rSortIcon(key) {
      if (_reqSortCol !== key) return `<span class="sort-icon">⇅</span>`;
      if (_reqSortDir === 'asc')  return `<span class="sort-icon active">↑</span>`;
      if (_reqSortDir === 'desc') return `<span class="sort-icon active">↓</span>`;
      return `<span class="sort-icon">⇅</span>`;
    }

    function applyReqSort(list) {
      if (!_reqSortCol || !_reqSortDir) return list;
      const col = REQ_COLS.find(c => c.key === _reqSortCol);
      if (!col) return list;
      return [...list].sort((a, b) => {
        const av = col.get(a), bv = col.get(b);
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return _reqSortDir === 'asc' ? cmp : -cmp;
      });
    }

    function reqTable(list) {
      if (!list.length) return `<div class="empty-state"><p>No job openings in this category.</p></div>`;
      const sorted = applyReqSort(list);
      return `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                ${REQ_COLS.map((c, ci) => {
                  const sticky = ci === 1 ? 'style="position:sticky;left:40px;z-index:11;background:var(--card)"' : '';
                  return c.key
                    ? `<th class="sortable ${_reqSortCol === c.key ? 'sorted' : ''}" data-rcol="${c.key}" ${sticky}>${c.label} ${rSortIcon(c.key)}</th>`
                    : `<th style="position:sticky;left:0;z-index:11;background:var(--card)">#</th>`;
                }).join('')}
              </tr>
            </thead>
            <tbody>
              ${sorted.map((j, i) => `
                <tr>
                  <td class="row-num" style="position:sticky;left:0;z-index:1;background:var(--card)">${i + 1}</td>
                  <td style="position:sticky;left:40px;z-index:1;background:var(--card)"><strong>${j.hostingCompany}</strong></td>
                  <td>${[j.city, j.state].filter(v => v && v !== '—').join(', ') || '—'}</td>
                  <td>${j.department}</td>
                  <td style="text-align:center;font-weight:600">${j.numPositions || '—'}</td>
                  <td>${j.salary !== '—' ? (String(j.salary).startsWith('$') ? j.salary : '$' + j.salary) : '—'}</td>
                  <td>${j.paymentFrequency}</td>
                  <td>${j.housingAvail}</td>
                  <td>${j.contractLength}</td>
                  <td style="font-size:0.75rem">${j.j1ProgramType}</td>
                  <td>${j.clientName}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    // Unique filter options
    const deptOptions    = [...new Set(active.map(j => j.department).filter(d => d && d !== '—'))].sort();
    const housingOptions = [...new Set(active.map(j => j.housingAvail).filter(h => h && h !== '—'))].sort();
    const programOptions = [...new Set(
      active.flatMap(j => j.j1ProgramType && j.j1ProgramType !== '—'
        ? j.j1ProgramType.split(/[;,]\s*/).map(v => v.trim()).filter(Boolean)
        : [])
    )].sort();

    function applyReqFilters(list) {
      let out = list;
      if (_reqFilterDept)    out = out.filter(j => (j.department  || '').toLowerCase() === _reqFilterDept);
      if (_reqFilterHousing) out = out.filter(j => (j.housingAvail || '').toLowerCase() === _reqFilterHousing);
      if (_reqFilterProgram) {
        out = out.filter(j => {
          const types = (j.j1ProgramType && j.j1ProgramType !== '—')
            ? j.j1ProgramType.split(/[;,]\s*/).map(v => v.trim().toLowerCase())
            : [];
          return types.includes(_reqFilterProgram);
        });
      }
      return out;
    }

    function renderReqStats(list) {
      const byClient = {};
      list.forEach(j => {
        const client = j.clientName || 'Unknown';
        if (!byClient[client]) byClient[client] = { reqs: 0, openings: 0 };
        byClient[client].reqs++;
        byClient[client].openings += Number(j.numPositions) || 0;
      });

      const metricCards = `
        <div class="stat-card accent">
          <div class="stat-value">${list.length}</div>
          <div class="stat-label">Hosting Company</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${list.reduce((s, j) => s + (Number(j.numPositions) || 0), 0)}</div>
          <div class="stat-label">Total Openings</div>
        </div>
        ${Object.entries(byClient)
          .sort((a, b) => b[1].openings - a[1].openings)
          .map(([client, data]) => `
            <div class="stat-card">
              <div class="stat-value">${data.openings}</div>
              <div class="stat-label" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:0.68rem" title="${client}">${client.split(' ').slice(0,2).join(' ')}</div>
              <div style="font-size:0.63rem;color:var(--muted-lt);margin-top:2px">${data.reqs} hosting company</div>
            </div>
          `).join('')}
      `;

      const filterCards = `
        <div class="stat-card req-filter-card" style="flex:1">
          <div class="req-filter-label">Department</div>
          <select class="filter-select" id="reqFilterDept" style="width:100%;margin:0">
            <option value="">All Departments</option>
            ${deptOptions.map(d => `<option value="${d.toLowerCase()}" ${_reqFilterDept === d.toLowerCase() ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
        </div>
        <div class="stat-card req-filter-card" style="flex:1">
          <div class="req-filter-label">Housing</div>
          <select class="filter-select" id="reqFilterHousing" style="width:100%;margin:0">
            <option value="">All Housing</option>
            ${housingOptions.map(h => `<option value="${h.toLowerCase()}" ${_reqFilterHousing === h.toLowerCase() ? 'selected' : ''}>${h}</option>`).join('')}
          </select>
        </div>
        <div class="stat-card req-filter-card" style="flex:1">
          <div class="req-filter-label">J1 Program Type</div>
          <select class="filter-select" id="reqFilterProgram" style="width:100%;margin:0">
            <option value="">All Types</option>
            ${programOptions.map(p => `<option value="${p.toLowerCase()}" ${_reqFilterProgram === p.toLowerCase() ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>
      `;

      return `
        <div style="display:flex;gap:8px;flex-shrink:0">${metricCards}</div>
        <div style="display:flex;gap:8px;flex:1;min-width:0">${filterCards}</div>
      `;
    }

    function renderReqContent() {
      const filtered = applyReqFilters(active);
      return `<div class="card">${reqTable(filtered)}</div>`;
    }

    function refreshReq() {
      const filtered = applyReqFilters(active);
      document.getElementById('reqStats').innerHTML   = renderReqStats(filtered);
      document.getElementById('reqContent').innerHTML = renderReqContent();
      document.getElementById('reqFilterDept').value    = _reqFilterDept;
      document.getElementById('reqFilterHousing').value = _reqFilterHousing;
      document.getElementById('reqFilterProgram').value = _reqFilterProgram;
      document.getElementById('reqFilterDept').addEventListener('change', onDeptChange);
      document.getElementById('reqFilterHousing').addEventListener('change', onHousingChange);
      document.getElementById('reqFilterProgram').addEventListener('change', onProgramChange);
    }

    function onDeptChange(e)    { _reqFilterDept    = e.target.value; refreshReq(); }
    function onHousingChange(e) { _reqFilterHousing = e.target.value; refreshReq(); }
    function onProgramChange(e) { _reqFilterProgram = e.target.value; refreshReq(); }

    mc.innerHTML = `
      <div class="page-header">
        <h1>Requisition</h1>
        <p>Active J1 Program openings from Zoho Recruit</p>
      </div>
      <div id="reqStats" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:stretch">
        ${renderReqStats(applyReqFilters(active))}
      </div>
      <div id="reqContent">
        ${renderReqContent()}
      </div>
    `;

    // Sort clicks
    mc.addEventListener('click', function onReqSort(e) {
      const th = e.target.closest('[data-rcol]');
      if (!th) return;
      const col = th.dataset.rcol;
      if (_reqSortCol === col) {
        _reqSortDir = _reqSortDir === 'asc' ? 'desc' : _reqSortDir === 'desc' ? null : 'asc';
        if (!_reqSortDir) _reqSortCol = null;
      } else {
        _reqSortCol = col; _reqSortDir = 'asc';
      }
      document.getElementById('reqContent').innerHTML = renderReqContent();
    });

    // Filter changes (initial wire-up)
    document.getElementById('reqFilterDept').addEventListener('change', onDeptChange);
    document.getElementById('reqFilterHousing').addEventListener('change', onHousingChange);
    document.getElementById('reqFilterProgram').addEventListener('change', onProgramChange);
  }

  // ═══════════════════════════════════════════════════════════
  //  HOUSING PAGE
  // ═══════════════════════════════════════════════════════════
  let _housingSortCol = null;
  let _housingSortDir = null;

  async function renderHousing() {
    const mc = document.getElementById('main-content');
    mc.innerHTML = skeletonHTML();

    const participants = await loadData();
    if (!participants) { mc.innerHTML = connectPromptHTML(); return; }

    // Only Recruit records have housing data
    const withCompany = participants.filter(p => p._source === 'recruit' && p.hostCompany && p.hostCompany !== '—');
    const housed    = withCompany.filter(p => p.housingAvailability && p.housingAvailability !== '—');
    const noHousing = withCompany.filter(p => !p.housingAvailability || p.housingAvailability === '—');

    const HOUSING_COLS = [
      { label: '#',                              key: null },
      { label: 'Name',                           key: 'name',              get: p => (p.name || '').toLowerCase() },
      { label: 'Country',                        key: 'country',           get: p => (p.country || '').toLowerCase() },
      { label: 'Host Company',                   key: 'hostCompany',       get: p => (p.hostCompany || '').toLowerCase() },
      { label: 'Housing Availability',           key: 'housingAvailability', get: p => (p.housingAvailability || '').toLowerCase() },
      { label: 'Housing Landlord',               key: 'housingLandlord',   get: p => (p.housingLandlord || '').toLowerCase() },
      { label: 'Initial Payment Before Departure', key: 'housingPaymentInit', get: p => p.housingPaymentInit || 0 },
      { label: 'Monthly Payment',                key: 'housingPaymentMo',  get: p => p.housingPaymentMo || 0 },
      { label: 'Housing Address',                key: 'housingAddress',    get: p => (p.housingAddress || '').toLowerCase() },
    ];

    function hSortIcon(key) {
      if (_housingSortCol !== key) return `<span class="sort-icon">⇅</span>`;
      if (_housingSortDir === 'asc')  return `<span class="sort-icon active">↑</span>`;
      if (_housingSortDir === 'desc') return `<span class="sort-icon active">↓</span>`;
      return `<span class="sort-icon">⇅</span>`;
    }

    function applyHousingSort(list) {
      if (!_housingSortCol || !_housingSortDir) return list;
      const col = HOUSING_COLS.find(c => c.key === _housingSortCol);
      if (!col) return list;
      return [...list].sort((a, b) => {
        const av = col.get(a), bv = col.get(b);
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return _housingSortDir === 'asc' ? cmp : -cmp;
      });
    }

    function housingTable(list) {
      if (!list.length) return `<div class="empty-state"><p>No participants in this category.</p></div>`;
      const sorted = applyHousingSort(list);
      return `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                ${HOUSING_COLS.map(c => c.key
                  ? `<th class="sortable ${_housingSortCol === c.key ? 'sorted' : ''}" data-hcol="${c.key}">${c.label} ${hSortIcon(c.key)}</th>`
                  : `<th>#</th>`
                ).join('')}
              </tr>
            </thead>
            <tbody>
              ${sorted.map((p, i) => `
                <tr>
                  <td class="row-num">${i + 1}</td>
                  <td><strong>${p.name}</strong></td>
                  <td>${p.country}</td>
                  <td>${p.hostCompany}</td>
                  <td>${badge(p.housingAvailability)}</td>
                  <td>${p.housingLandlord}</td>
                  <td>${p.housingPaymentInit ? '$' + p.housingPaymentInit : '—'}</td>
                  <td>${p.housingPaymentMo ? '$' + p.housingPaymentMo : '—'}</td>
                  <td>${p.housingAddress}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    function renderHousingContent() {
      return `
        <div class="card">
          <div class="card-header"><div class="card-title" style="color:#166534">✓ Housing Available (${housed.length})</div></div>
          ${housingTable(housed)}
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title" style="color:var(--accent)">No Housing Info (${noHousing.length})</div></div>
          ${housingTable(noHousing)}
        </div>
      `;
    }

    mc.innerHTML = `
      <div class="page-header">
        <h1>Housing</h1>
        <p>Participant housing assignments and payment details</p>
      </div>

      <div class="stat-grid">
        <div class="stat-card good">
          <div class="stat-value">${housed.length}</div>
          <div class="stat-label">Housing Available</div>
        </div>
        <div class="stat-card accent">
          <div class="stat-value">${noHousing.length}</div>
          <div class="stat-label">No Housing Info</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${withCompany.length ? Math.round(housed.length / withCompany.length * 100) : 0}%</div>
          <div class="stat-label">Housing Rate</div>
        </div>
      </div>

      <div id="housingContent">
        ${renderHousingContent()}
      </div>
    `;

    // Sort column click handler
    mc.addEventListener('click', function onHousingSort(e) {
      const th = e.target.closest('[data-hcol]');
      if (!th) return;
      const col = th.dataset.hcol;
      if (_housingSortCol === col) {
        _housingSortDir = _housingSortDir === 'asc' ? 'desc' : _housingSortDir === 'desc' ? null : 'asc';
        if (!_housingSortDir) _housingSortCol = null;
      } else {
        _housingSortCol = col; _housingSortDir = 'asc';
      }
      document.getElementById('housingContent').innerHTML = renderHousingContent();
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  ROUTER
  // ═══════════════════════════════════════════════════════════
  const PAGES = {
    overview:     { render: renderOverview,     title: 'Overview' },
    requisition:  { render: renderRequisition,  title: 'Requisition' },
    participants: { render: renderParticipants, title: 'Participants' },
    visa:         { render: renderVisa,         title: 'Visa' },
    travel:       { render: renderTravel,       title: 'Travel' },
    housing:      { render: renderHousing,      title: 'Housing' },
  };

  let _currentPage = 'overview';

  function renderCurrentPage() { navigate(_currentPage, false); }

  function navigate(pageName, updateHistory = true) {
    const page = PAGES[pageName];
    if (!page) return;
    _currentPage = pageName;

    document.querySelectorAll('.nav-link').forEach(l =>
      l.classList.toggle('active', l.dataset.page === pageName)
    );
    const titleEl = document.getElementById('topbarTitle');
    if (titleEl) titleEl.textContent = CONFIG.APP_NAME || 'J1 Program Dashboard';

    page.render();
    updateZohoStatus();
  }

  // Auto-refresh every 60 seconds
  let _refreshTimer = null;

  function updateLastRefresh() {
    const el = document.getElementById('lastRefresh');
    if (el) {
      el.textContent = '🔄 ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      el.style.display = 'block';
    }
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    updateLastRefresh();
    _refreshTimer = setInterval(() => {
      _participants = null; _jobCache = null; // clear cache
      renderCurrentPage();
      updateLastRefresh();
    }, 600_000);
  }

  function stopAutoRefresh() {
    if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
  }

  function closeSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('show');
  }

  function init() {
    document.querySelectorAll('.nav-link').forEach(link =>
      link.addEventListener('click', e => { e.preventDefault(); navigate(link.dataset.page); closeSidebar(); })
    );
    navigate('overview');

    // Start auto-refresh if Zoho is connected
    if (ZohoAuth.isConnected()) startAutoRefresh();

    // Also start auto-refresh after Zoho connects
    document.getElementById('zohoStatus').addEventListener('click', () => {
      setTimeout(() => { if (ZohoAuth.isConnected()) startAutoRefresh(); }, 3000);
    });
  }

  return { init, navigate };
})();
