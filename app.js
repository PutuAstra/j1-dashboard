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
      el.title = 'Click to connect your Zoho Recruit account';
      el.onclick = () => ZohoAuth.startOAuth();
    }
  }

  // ── Zoho connect prompt (shown when not connected) ────────

  function connectPromptHTML() {
    return `
      <div class="connect-prompt">
        <div class="connect-icon">🔗</div>
        <h2>Connect your Zoho Recruit account</h2>
        <p>To load live J1 participant data, connect your Zoho account. You'll be redirected to Zoho to log in, then brought back here.</p>
        <button class="btn-connect" onclick="ZohoAuth.startOAuth()">
          Connect Zoho Recruit
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
        <p>Live summary from Zoho Recruit — ${s.total} participants total</p>
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
  //  PAGE: PARTICIPANTS
  // ═══════════════════════════════════════════════════════════
  async function renderParticipants() {
    const mc = document.getElementById('main-content');
    mc.innerHTML = skeletonHTML();

    const participants = await loadData();
    if (!participants) { mc.innerHTML = connectPromptHTML(); return; }

    function buildTable(list) {
      if (!list.length) return `<div class="empty-state"><p>No participants match your filter.</p></div>`;
      return `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Country</th><th>Program</th>
                <th>Host Company</th><th>Status</th>
                <th>Visa Status</th><th>Arrival</th><th>Flight</th>
              </tr>
            </thead>
            <tbody>
              ${list.map(p => `
                <tr>
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

    mc.innerHTML = `
      <div class="page-header">
        <h1>Participants</h1>
        <p>${participants.length} participants loaded from Zoho Recruit</p>
      </div>
      <div class="card">
        <div class="filter-bar">
          <input class="search-input" id="searchInput" placeholder="Search by name, country, company…">
          <select class="filter-select" id="filterProgram">
            <option value="">All Programs</option>
            <option value="intern">Intern</option>
            <option value="trainee">Trainee</option>
          </select>
          <select class="filter-select" id="filterFlight">
            <option value="">All Flight Status</option>
            <option value="booked">Booked</option>
            <option value="not">Not Booked</option>
          </select>
        </div>
        <div id="participantTable">${buildTable(participants)}</div>
      </div>
    `;

    function applyFilters() {
      const q       = document.getElementById('searchInput').value.toLowerCase();
      const prog    = document.getElementById('filterProgram').value.toLowerCase();
      const flight  = document.getElementById('filterFlight').value;

      let list = participants;
      if (q)      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.country.toLowerCase().includes(q) ||
        p.hostCompany.toLowerCase().includes(q)
      );
      if (prog)   list = list.filter(p => p.programType.toLowerCase().includes(prog));
      if (flight === 'booked')
        list = list.filter(p => p.flightBooked === true || /yes|booked/i.test(String(p.flightBooked)));
      if (flight === 'not')
        list = list.filter(p => !(p.flightBooked === true || /yes|booked/i.test(String(p.flightBooked))));

      document.getElementById('participantTable').innerHTML = buildTable(list);
    }

    document.getElementById('searchInput').addEventListener('input', applyFilters);
    document.getElementById('filterProgram').addEventListener('change', applyFilters);
    document.getElementById('filterFlight').addEventListener('change', applyFilters);
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
  async function renderTravel() {
    const mc = document.getElementById('main-content');
    mc.innerHTML = skeletonHTML();

    const participants = await loadData();
    if (!participants) { mc.innerHTML = connectPromptHTML(); return; }

    const booked    = participants.filter(p =>  p.flightBooked === true || /yes|booked|confirmed/i.test(String(p.flightBooked)));
    const notBooked = participants.filter(p => !(p.flightBooked === true || /yes|booked|confirmed/i.test(String(p.flightBooked))));

    function travelTable(list) {
      if (!list.length) return `<div class="empty-state"><p>No participants in this category.</p></div>`;
      return `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Country</th><th>Route</th>
                <th>Departure</th><th>Arrival</th>
                <th>Airline</th><th>PNR</th><th>Gateway</th><th>Flight</th>
              </tr>
            </thead>
            <tbody>
              ${list.map(p => `
                <tr>
                  <td><strong>${p.name}</strong></td>
                  <td>${p.country}</td>
                  <td style="font-size:0.8rem">${p.tripFrom} → ${p.tripTo}</td>
                  <td>${formatDate(p.departureDate)}</td>
                  <td>${formatDate(p.arrivalDate)}</td>
                  <td>${p.airline}</td>
                  <td style="font-family:monospace;font-size:0.82rem">${p.pnrNumber}</td>
                  <td>${p.airportGateway}</td>
                  <td>${flightBadge(p.flightBooked)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    mc.innerHTML = `
      <div class="page-header">
        <h1>Travel</h1>
        <p>Track flight booking status for all participants</p>
      </div>

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
          <div class="stat-value">${participants.length ? Math.round(booked.length / participants.length * 100) : 0}%</div>
          <div class="stat-label">Booking Rate</div>
        </div>
      </div>

      <div class="chart-grid" style="grid-template-columns: 280px 1fr; align-items: start;">
        <div class="card">
          <div class="card-header"><div class="card-title">Booking Status</div></div>
          <canvas id="chartTravelPie" height="200"></canvas>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Not Yet Booked</div></div>
          ${travelTable(notBooked)}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title" style="color:#166534">✓ Flights Booked</div></div>
        ${travelTable(booked)}
      </div>
    `;

    new Chart(document.getElementById('chartTravelPie').getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Booked', 'Not Booked'],
        datasets: [{ data: [booked.length, notBooked.length],
          backgroundColor: ['#16a34a', '#B01A18'], borderWidth: 2,
          borderColor: getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#fff' }]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 12, family: 'Inter' }, padding: 12 } },
          datalabels: { display: false }
        }
      }
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

  function init() {
    document.querySelectorAll('.nav-link').forEach(link =>
      link.addEventListener('click', e => { e.preventDefault(); navigate(link.dataset.page); })
    );
    navigate('overview');
  }

  return { init, navigate };
})();
