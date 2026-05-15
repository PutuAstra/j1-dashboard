// ─────────────────────────────────────────────────────────────
//  ZOHO RECRUIT API CLIENT
// ─────────────────────────────────────────────────────────────
const Zoho = (() => {

  async function request(endpoint, params = {}) {
    const token = ZohoAuth.getToken();
    if (!token) throw new Error('NO_TOKEN');

    const url = new URL(`${CONFIG.RECRUIT_API}/${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const resp = await fetch(url.toString(), {
      headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
    });

    if (resp.status === 401) { ZohoAuth.clearToken(); throw new Error('TOKEN_EXPIRED'); }
    if (!resp.ok) throw new Error(`API_ERROR_${resp.status}`);
    return resp.json();
  }

  // Fetch ALL records from the J1 module (handles pagination automatically)
  async function getAllParticipants() {
    const module = CONFIG.J1_MODULE;
    const F = CONFIG.FIELDS;
    const fields = Object.values(F).join(',');
    let all = [], page = 1, more = true;

    while (more) {
      const data = await request(module, { fields, page, per_page: 200 });
      const records = data.data || [];
      all = all.concat(records);
      more = data.info?.more_records === true;
      page++;
    }

    // Normalize using verified API names
    return all.map(r => ({
      id:                 r.id,
      name:               r[F.name] || [r[F.firstName], r[F.lastName]].filter(Boolean).join(' ') || '—',
      country:            r[F.country]            || '—',
      gender:             r[F.gender]             || '—',
      email:              r[F.email]              || '—',
      programType:        r[F.programType]        || '—',
      eligiblePrograms:   Array.isArray(r[F.eligiblePrograms])
                            ? r[F.eligiblePrograms].join(', ')
                            : r[F.eligiblePrograms] || '—',
      placementStatus:    r[F.appStatus]          || '—',
      hostCompany:        r[F.hostCompany]        || '—',  // Hosting_Company_2 (Pick List)
      programStart:       r[F.programStart]       || null,
      programEnd:         r[F.programEnd]         || null,
      sponsorStatus:      r[F.sponsorStatus]      || '—',
      hcInterviewStatus:  r[F.hcInterviewStatus]  || '—',
      // Visa
      ds2019End:          r[F.visaExpiredDate]    || null,
      visaStatus:         r[F.visaStatus]         || '—',
      visaNumber:         r[F.visaNumber]         || '—',
      visaAppointment:    r[F.visaAppointment]    || null,
      refLetterStatus:    r[F.refLetterStatus]    || '—',
      // Outbound travel
      flightBooked:       r[F.flightBooked],               // Flight_Ticket_Status
      ticketPayStatus:    r[F.ticketPayStatus]    || '—',
      ticketPricing:      r[F.ticketPricing]      || null,
      airline:            r[F.airline]            || '—',  // Pick List
      pnrNumber:          r[F.pnrNumber]          || '—',  // PNR_Number
      tripFrom:           r[F.tripFrom]           || '—',
      tripTo:             r[F.tripTo]             || '—',
      departureDate:      r[F.departureDate]      || null,
      arrivalDate:        r[F.arrivalDate]        || null,
      airportGateway:     r[F.airportGateway]     || '—',  // Pick List
      airportPickup:      r[F.airportPickup]      || '—',
      // Return travel
      returnFlightStatus: r[F.returnFlightStatus] || '—',
      returnDeparture:    r[F.returnDeparture]    || null,
      returnArrival:      r[F.returnArrival]      || null,
      returnAirline:      r[F.returnAirline]      || '—',
      returnPNR:          r[F.returnPNR]          || '—',
      returnTripFrom:     r[F.returnTripFrom]     || '—',
      returnTripTo:       r[F.returnTripTo]       || '—',
      returnGateway:      r[F.returnGateway]      || '—',
    }));
  }

  // ── Derived stats ─────────────────────────────────────────

  function computeStats(participants) {
    const total      = participants.length;
    const interns    = participants.filter(p => /intern/i.test(p.programType)).length;
    const trainees   = participants.filter(p => /trainee/i.test(p.programType)).length;
    const placed     = participants.filter(p => /placed|active|on.?site/i.test(p.placementStatus)).length;
    const flightDone = participants.filter(p => p.flightBooked === true || /yes/i.test(p.flightBooked)).length;

    const today = new Date();
    const soon  = new Date(today); soon.setDate(soon.getDate() + 30);
    const expiringDS = participants.filter(p => {
      if (!p.ds2019End) return false;
      const d = new Date(p.ds2019End);
      return d >= today && d <= soon;
    }).length;

    return { total, interns, trainees, placed, flightDone, expiringDS };
  }

  function groupBy(arr, key) {
    return arr.reduce((acc, item) => {
      const k = item[key] || 'Unknown';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
  }

  return { getAllParticipants, computeStats, groupBy };
})();
