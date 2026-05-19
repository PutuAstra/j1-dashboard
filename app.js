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
      el.onclick = () => { ZohoAuth.clearToken(); _participants = null; renderCurrentPage(); updateZohoStatus(); };
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

    mc.innerHTML = `
      <div class="page-header">
        <h1>Overview</h1>
        <p>Live summary from Zoho CRM & Recruit — ${s.total} participants total</p>
      </div>

      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-icon"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
          <div class="stat-value">${s.total}</div>
          <div class="stat-label">Total Participants</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a8.38 8.38 0 0 1 13 0"/></svg></div>
          <div class="stat-value">${s.interns}</div>
          <div class="stat-label">Interns</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg></div>
          <div class="stat-value">${s.trainees}</div>
          <div class="stat-label">Trainees</div>
        </div>
        <div class="stat-card good">
          <div class="stat-icon"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
          <div class="stat-value">${s.placed}</div>
          <div class="stat-label">Placed</div>
        </div>
        <div class="stat-card good">
          <div class="stat-icon"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.38 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.59 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16l.19.92z"/></svg></div>
          <div class="stat-value">${s.flightDone}</div>
          <div class="stat-label">Flights Booked</div>
        </div>
        <div class="stat-card ${s.expiringDS > 0 ? 'warn' : ''}">
          <div class="stat-icon"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg></div>
          <div class="stat-value">${s.expiringDS}</div>
          <div class="stat-label">DS-2019 Expiring (30d)</div>
        </div>
      </div>

      <div class="chart-grid">
        <div class="card">
          <div class="card-header">
            <div><div class="card-title">Program Type</div><div class="card-sub">Intern vs Trainee</div></div>
          </div>
          <canvas id="chartProgram" height="200"></canvas>
        </div>
        <div class="card">
          <div class="card-header">
            <div><div class="card-title">Flight Booking</div><div class="card-sub">Travel status</div></div>
          </div>
          <canvas id="chartFlight" height="200"></canvas>
        </div>
        <div class="card">
          <div class="card-header">
            <div><div class="card-title">Placement Status</div><div class="card-sub">Current stage breakdown</div></div>
          </div>
          <canvas id="chartStatus" height="200"></canvas>
        </div>
        <div class="card">
          <div class="card-header">
            <div><div class="card-title">Top Countries</div><div class="card-sub">Participants by nationality</div></div>
          </div>
          <canvas id="chartCountry" height="200"></canvas>
        </div>
      </div>
    `;

    // Charts
    const COLORS = ['#B01A18','#1B3A6B','#16a34a','#d97706','#2563eb','#7c3aed','#db2777','#0891b2'];

    const chartOpts = (labels, data, type = 'doughnut') => ({
      type,
      data: {
        labels,
        datasets: [{ data, backgroundColor: COLORS, borderWidth: 2,
          borderColor: getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#fff' }]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: {
          legend: { position: 'right', labels: { font: { size: 12, family: 'Inter' }, padding: 12, boxWidth: 12 } },
          datalabels: { display: false }
        }
      }
    });

    new Chart(document.getElementById('chartProgram').getContext('2d'),
      chartOpts(Object.keys(byProgram), Object.values(byProgram)));

    new Chart(document.getElementById('chartFlight').getContext('2d'),
      chartOpts(Object.keys(byFlight), Object.values(byFlight)));

    new Chart(document.getElementById('chartStatus').getContext('2d'),
      chartOpts(Object.keys(byStatus), Object.values(byStatus)));

    // Top 7 countries bar chart
    const sortedCountries = Object.entries(byCountry).sort((a,b) => b[1]-a[1]).slice(0, 7);
    new Chart(document.getElementById('chartCountry').getContext('2d'), {
      type: 'bar',
      data: {
        labels: sortedCountries.map(e => e[0]),
        datasets: [{ data: sortedCountries.map(e => e[1]), backgroundColor: '#1B3A6B', borderRadius: 6 }]
      },
      options: {
        responsive: true, maintainAspectRatio: true, indexAxis: 'y',
        plugins: { legend: { display: false }, datalabels: { display: false } },
        scales: { x: { beginAtZero: true, ticks: { font: { size: 11 } } }, y: { ticks: { font: { size: 11 } } } }
      }
    });
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
  let _sortCol = null;   // field key e.g. 'name'
  let _sortDir = null;   // 'asc' | 'desc' | null

  // Column definitions: label, field key, value getter
  const P_COLS = [
    { label: '#',           key: null,              get: null },
    { label: 'Source',      key: '_source',         get: p => (p._source || '').toLowerCase() },
    { label: 'Name',        key: 'name',            get: p => (p.name || '').toLowerCase() },
    { label: 'Country',     key: 'country',         get: p => (p.country || '').toLowerCase() },
    { label: 'Program',     key: 'programType',     get: p => (p.programType || '').toLowerCase() },
    { label: 'Host Company',key: 'hostCompany',     get: p => (p.hostCompany || '').toLowerCase() },
    { label: 'App Status',  key: 'placementStatus', get: p => (p.placementStatus || '').toLowerCase() },
    { label: 'Visa Status', key: 'visaStatus',      get: p => (p.visaStatus || '').toLowerCase() },
    { label: 'Arrival',     key: 'arrivalDate',     get: p => p.arrivalDate || '' },
    { label: 'Flight',      key: 'flightBooked',    get: p => String(p.flightBooked) },
  ];

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
      if (!list.length) return `<div class="empty-state"><p>No participants in this category.</p></div>`;
      return `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                ${P_COLS.map(c => c.key
                  ? `<th class="sortable ${_sortCol === c.key ? 'sorted' : ''}" data-col="${c.key}">${c.label} ${sortIcon(c.key)}</th>`
                  : `<th>#</th>`
                ).join('')}
              </tr>
            </thead>
            <tbody>
              ${list.map((p, i) => `
                <tr>
                  <td class="row-num">${i + 1}</td>
                  <td><span class="source-badge source-${p._source || 'recruit'}">${p._source === 'crm' ? 'CRM' : 'Recruit'}</span></td>
                  <td><strong>${p.name}</strong></td>
                  <td>${p.country}</td>
                  <td>${badge(p.programType)}</td>
                  <td>${p.hostCompany}</td>
                  <td>${badge(p.placementStatus)}</td>
                  <td>${badge(p.visaStatus)}</td>
                  <td>${formatDate(p.arrivalDate)}</td>
                  <td>${flightBadge(p.flightBooked)}</td>
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
      const col = P_COLS.find(c => c.key === _sortCol);
      if (!col) return list;
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
  //  PAGE: VISA / DS-2019
  // ═══════════════════════════════════════════════════════════
  async function renderVisa() {
    const mc = document.getElementById('main-content');
    mc.innerHTML = skeletonHTML();

    const participants = await loadData();
    if (!participants) { mc.innerHTML = connectPromptHTML(); return; }

    const today = new Date();
    const withDates = participants
      .filter(p => p.ds2019End)
      .map(p => ({ ...p, daysLeft: daysUntil(p.ds2019End) }))
      .sort((a, b) => a.daysLeft - b.daysLeft);

    const expired  = withDates.filter(p => p.daysLeft < 0);
    const urgent   = withDates.filter(p => p.daysLeft >= 0 && p.daysLeft <= 30);
    const warning  = withDates.filter(p => p.daysLeft > 30 && p.daysLeft <= 90);
    const ok       = withDates.filter(p => p.daysLeft > 90);
    const noDates  = participants.filter(p => !p.ds2019End);

    function visaList(list) {
      if (!list.length) return `<div class="empty-state"><p>None in this category.</p></div>`;
      return list.map(p => {
        const d     = p.daysLeft;
        const cls   = d < 0 ? 'urgent' : d <= 30 ? 'urgent' : d <= 90 ? 'warning' : 'ok';
        const label = d < 0 ? 'Expired' : `${d}d`;
        return `
          <div class="visa-item">
            <div class="visa-days ${cls}">
              <span class="days-num">${d < 0 ? '!' : d}</span>
              <span class="days-lbl">${d < 0 ? 'exp.' : 'days'}</span>
            </div>
            <div class="visa-info">
              <div class="visa-name">${p.name}</div>
              <div class="visa-meta">
                ${p.country} · ${p.programType} ·
                DS-2019 expires: <strong>${formatDate(p.ds2019End)}</strong>
              </div>
            </div>
            ${badge(p.visaStatus)}
          </div>
        `;
      }).join('');
    }

    mc.innerHTML = `
      <div class="page-header">
        <h1>Visa / DS-2019 Tracker</h1>
        <p>Monitor DS-2019 expiry dates and visa statuses</p>
      </div>

      <div class="stat-grid">
        <div class="stat-card accent">
          <div class="stat-value">${expired.length}</div>
          <div class="stat-label">Expired</div>
        </div>
        <div class="stat-card warn">
          <div class="stat-value">${urgent.length}</div>
          <div class="stat-label">Expiring ≤ 30 days</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${warning.length}</div>
          <div class="stat-label">Expiring 31–90 days</div>
        </div>
        <div class="stat-card good">
          <div class="stat-value">${ok.length}</div>
          <div class="stat-label">Valid > 90 days</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${noDates.length}</div>
          <div class="stat-label">No Date on File</div>
        </div>
      </div>

      ${expired.length ? `
      <div class="card">
        <div class="card-header"><div class="card-title" style="color:var(--accent)">⚠ Expired DS-2019</div></div>
        ${visaList(expired)}
      </div>` : ''}

      ${urgent.length ? `
      <div class="card">
        <div class="card-header"><div class="card-title" style="color:#d97706">⚡ Expiring Within 30 Days</div></div>
        ${visaList(urgent)}
      </div>` : ''}

      <div class="card">
        <div class="card-header"><div class="card-title">Expiring 31–90 Days</div></div>
        ${visaList(warning.length ? warning : [])}
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Valid > 90 Days</div></div>
        ${visaList(ok.length ? ok : [])}
      </div>
    `;
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
              ✈️ Joining
              <span class="tab-count-badge">${joiningAll.length}</span>
            </button>
            <button class="tab-btn ${_activeTravelTab === 'returning' ? 'active' : ''}" data-ttab="returning">
              🏠 Returning
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
    const housed    = participants.filter(p => p._source === 'recruit' && p.housingAvailability && p.housingAvailability !== '—');
    const noHousing = participants.filter(p => p._source === 'recruit' && (!p.housingAvailability || p.housingAvailability === '—'));

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
          <div class="stat-value">${participants.filter(p => p._source === 'recruit').length ? Math.round(housed.length / participants.filter(p => p._source === 'recruit').length * 100) : 0}%</div>
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
    participants: { render: renderParticipants, title: 'Participants' },
    visa:         { render: renderVisa,         title: 'Visa / DS-2019' },
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
    if (titleEl) titleEl.textContent = page.title;

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
      _participants = null; // clear cache
      renderCurrentPage();
      updateLastRefresh();
    }, 600_000);
  }

  function stopAutoRefresh() {
    if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
  }

  function init() {
    document.querySelectorAll('.nav-link').forEach(link =>
      link.addEventListener('click', e => { e.preventDefault(); navigate(link.dataset.page); })
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
