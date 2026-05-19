// ─────────────────────────────────────────────────────────────
//  ZOHO API CLIENT  (Recruit + CRM combined)
// ─────────────────────────────────────────────────────────────
const Zoho = (() => {

  // Cloudflare CORS proxy
  const PROXY = 'https://zoho-proxy.putuastrawijaya.workers.dev';

  // ── Recruit API request ───────────────────────────────────
  async function request(endpoint, params = {}) {
    const token = ZohoAuth.getToken();
    if (!token) throw new Error('NO_TOKEN');

    const url = new URL(`${PROXY}/recruit/v2/${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const resp = await fetch(url.toString(), {
      headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
    });

    if (resp.status === 401) { ZohoAuth.clearToken(); throw new Error('TOKEN_EXPIRED'); }
    if (!resp.ok) throw new Error(`API_ERROR_${resp.status}`);
    return resp.json();
  }

  // ── CRM API request ───────────────────────────────────────
  async function crmRequest(endpoint, params = {}) {
    const token = ZohoAuth.getToken();
    if (!token) throw new Error('NO_TOKEN');

    const url = new URL(`${PROXY}/crm/v2/${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const resp = await fetch(url.toString(), {
      headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
    });

    if (resp.status === 401) { ZohoAuth.clearToken(); throw new Error('TOKEN_EXPIRED'); }
    if (!resp.ok) throw new Error(`CRM_API_ERROR_${resp.status}`);
    return resp.json();
  }

  // ── Fetch all from Zoho Recruit ───────────────────────────
  async function getRecruitParticipants() {
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

    return all.map(r => ({
      _source:            'recruit',
      id:                 r.id,
      name:               r[F.name] || [r[F.firstName], r[F.lastName]].filter(Boolean).join(' ') || '—',
      country:            r[F.country]            || '—',
      gender:             r[F.gender]             || '—',
      email:              r[F.email]              || '—',
      programType:        r[F.programType]        || '—',
      programSource:      r[F.programSources]     || '—',
      eligiblePrograms:   Array.isArray(r[F.eligiblePrograms])
                            ? r[F.eligiblePrograms].join(', ')
                            : r[F.eligiblePrograms] || '—',
      placementStatus:    r[F.appStatus]          || '—',
      hostCompany:        r[F.hostCompany]        || '—',
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
      flightBooked:       r[F.flightBooked],
      ticketPayStatus:    r[F.ticketPayStatus]    || '—',
      ticketPricing:      r[F.ticketPricing]      || null,
      airline:            r[F.airline]            || '—',
      pnrNumber:          r[F.pnrNumber]          || '—',
      tripFrom:           r[F.tripFrom]           || '—',
      tripTo:             r[F.tripTo]             || '—',
      departureDate:      r[F.departureDate]      || null,
      arrivalDate:        r[F.arrivalDate]        || null,
      airportGateway:     r[F.airportGateway]     || '—',
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
      // Housing
      housingAvailability: r[F.housingAvailability] || '—',
      housingLandlord:     r[F.housingLandlord]     || '—',
      housingPaymentInit:  r[F.housingPaymentInit]  || null,
      housingPaymentMo:    r[F.housingPaymentMo]    || null,
      housingAddress:      r[F.housingAddress]      || '—',
    }));
  }

  // ── Fetch all from Zoho CRM ───────────────────────────────
  async function getCRMParticipants() {
    const module = CONFIG.CRM_MODULE;
    const CF = CONFIG.CRM_FIELDS;
    let all = [], page = 1, more = true;

    const fields = Object.values(CF).join(',');
    while (more) {
      const data = await crmRequest(module, { fields, page, per_page: 200 });
      const records = data.data || [];
      all = all.concat(records);
      more = data.info?.more_records === true;
      page++;
    }

    return all.map(r => ({
      _source:                'crm',
      id:                     'crm_' + r.id,
      name:                   r[CF.fullName] || [r[CF.firstName], r[CF.lastName]].filter(Boolean).join(' ') || '—',
      firstName:              r[CF.firstName]              || '—',
      lastName:               r[CF.lastName]               || '—',
      country:                r[CF.country]                || '—',
      gender:                 r[CF.gender]                 || '—',
      email:                  r[CF.email]                  || '—',
      phone:                  r[CF.phone]                  || '—',
      age:                    r[CF.age]                    || '—',
      positionApplied:        r[CF.positionApplied]        || '—',
      permanentAddress:       r[CF.permanentAddress]       || '—',
      ctiUsaReview:           r[CF.ctiUsaReview]           || '—',
      consultationCallStatus: r[CF.consultationCallStatus] || '—',
      consultationCallNotes:  r[CF.consultationCallNotes]  || '—',
      programType:            r[CF.programType]            || '—',
      programSource:          r[CF.programSource]          || '—',
      eligiblePrograms:       Array.isArray(r[CF.eligiblePrograms])
                                ? r[CF.eligiblePrograms].join(', ')
                                : r[CF.eligiblePrograms]   || '—',
      placementStatus:        r[CF.appStatus]              || '—',
      hostCompany:            r[CF.hostCompany]            || '—',
      programStart:       null,
      programEnd:         null,
      sponsorStatus:      '—',
      hcInterviewStatus:  '—',
      // Visa / travel — not applicable at this stage
      ds2019End:          null,
      visaStatus:         '—',
      visaNumber:         '—',
      visaAppointment:    null,
      refLetterStatus:    '—',
      flightBooked:       false,
      ticketPayStatus:    '—',
      ticketPricing:      null,
      airline:            '—',
      pnrNumber:          '—',
      tripFrom:           '—',
      tripTo:             '—',
      departureDate:      null,
      arrivalDate:        null,
      airportGateway:     '—',
      airportPickup:      '—',
      returnFlightStatus: '—',
      returnDeparture:    null,
      returnArrival:      null,
      returnAirline:      '—',
      returnPNR:          '—',
      returnTripFrom:     '—',
      returnTripTo:       '—',
      returnGateway:      '—',
      // Housing
      housingAvailability: '—',
      housingLandlord:     '—',
      housingPaymentInit:  null,
      housingPaymentMo:    null,
      housingAddress:      '—',
    }));
  }

  // ── Fetch from both and merge ─────────────────────────────
  async function getAllParticipants() {
    const [recruitData, crmData] = await Promise.allSettled([
      getRecruitParticipants(),
      getCRMParticipants(),
    ]);

    const fromRecruit = recruitData.status === 'fulfilled' ? recruitData.value : [];
    const fromCRM     = crmData.status     === 'fulfilled' ? crmData.value     : [];

    if (recruitData.status === 'rejected') {
      console.error('❌ Recruit fetch failed:', recruitData.reason?.message);
    }
    if (crmData.status === 'rejected') {
      console.error('❌ CRM fetch failed:', crmData.reason?.message);
      // Show visible toast if App is available
      if (typeof App !== 'undefined' && App._toast) {
        App._toast(`CRM data failed: ${crmData.reason?.message}`, 'error');
      }
    }

    console.log(`✅ Loaded: ${fromRecruit.length} from Recruit, ${fromCRM.length} from CRM`);

    // Combine all records — CRM (early stages) first, then Recruit (later stages)
    return [...fromCRM, ...fromRecruit];
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
