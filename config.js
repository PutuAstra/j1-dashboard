// ─────────────────────────────────────────────────────────────
//  CONFIGURATION — fill in your values before deploying
// ─────────────────────────────────────────────────────────────
const CONFIG = {

  // 1. Your Zoho API Client ID
  //    → Go to https://api-console.zoho.com/
  //    → Add Client → "JavaScript Client (Implicit)"
  //    → Authorized Redirect URI: your GitHub Pages URL (e.g. https://USERNAME.github.io/j1-dashboard/)
  //    → Copy the Client ID here
  ZOHO_CLIENT_ID: '1000.ETQWHXIHDYG1HWGG91JUHRQI8L6IAD',

  // 2. Your GitHub Pages URL (must match what you registered in Zoho API Console)
  REDIRECT_URI: 'https://putuastra.github.io/j1-dashboard/',

  // 3. Your Zoho data center
  //    zoho.com   → US (default)
  //    zoho.eu    → Europe
  //    zoho.in    → India
  //    zoho.com.au → Australia
  //    zoho.jp    → Japan
  ZOHO_DOMAIN: 'https://accounts.zoho.com',
  RECRUIT_API:  'https://recruit.zoho.com/recruit/v2',

  // 4. Your J1 Participants module API name (Zoho Recruit)
  J1_MODULE: 'J1_Participants',

  // Job Openings module (Zoho Recruit)
  JOB_MODULE: 'Job_Openings',
  JOB_FIELDS: {
    jobId:             'Job_Opening_ID',
    status:            'Requisition_Status',
    placementCategory: 'Placement_Category',
    hostingCompany:    'Hosting_Company_2',
    positionName:      'Position',
    city:              'City',
    state:             'State',
    department:        'Department',
    numPositions:      'Requisition',
    salary:            'Salary',
    paymentFrequency:  'Payment_Frequency',
    housingAvail:      'Housing_Availability',
    targetDate:        'Target_Date',
    contractLength:    'Contract_Length',
    j1ProgramType:     'xx',
    clientName:        'Client_Name',
  },

  // 4b. Zoho CRM — J1 Participants module
  //     → In Zoho CRM: Settings → Modules → J1 Participants → note the API Name
  //     → From your URL it appears to be CustomModule22
  CRM_MODULE: 'J1_Participants1',

  // 4c. Zoho CRM field API names
  //     → CRM: Settings → Modules → J1 Participants → Fields → API Name column
  CRM_FIELDS: {
    fullName:               'Full_Name',
    firstName:              'First_Name',
    lastName:               'Last_Name',
    email:                  'Email',
    country:                'Country',
    phone:                  'Phone',
    gender:                 'Gender',
    appStatus:              'J1_Application_Status',
    programSource:          'J1_Program_Source',
    programType:            'Program_Option',
    hostCompany:            'Hosting_Company',
    // New Submission columns
    age:                    'Age',
    positionApplied:        'Position_Applied',
    permanentAddress:       'Permanent_Address',
    ctiUsaReview:           'CTI_USA_s_Review',
    eligiblePrograms:       'Eligible_Programs',
    consultationCallStatus: 'Consultation_Call_Status',
    consultationCallNotes:  'Consultation_Call_Notes',
  },

  // 5. Verified field API names from Zoho Recruit → Developer Space → API Names
  FIELDS: {
    // Basic Information
    name:              'Full_Name',               // Formula (First + Last)
    firstName:         'First_Name',
    lastName:          'CustomModule2_Name',      // Zoho's internal name for Last Name
    country:           'Country',
    appStatus:         'J1_Application_Status',
    programSources:    'J1_Program_Sources',
    eligiblePrograms:  'Eligible_Programs',       // Multiselect: Intern / Trainee / etc.
    gender:            'Gender',
    email:             'Email',
    phone:             'Phone_Number1',
    dateOfBirth:       'Date_Of_Birth',
    participantRating: 'Participant_Rating',
    attendance:        'Attendance',

    // Placement
    programType:       'Program_Option',          // Intern / Trainee
    programStart:      'Program_Start_Date',
    programEnd:        'Program_End_Date',
    selectedJob:       'Select_a_Job',
    occupationalFields:'Occupational_Fields',
    project:           'Project',
    documentsStatus:   'Documents_Status',
    passportStatus:    'Passport_Status',
    passportNumber:    'Passport_Number',
    passportExpiry:    'Passport_Expired_Date',

    // Stage 2 — Sponsor / Hosting Company
    hostCompany:       'Hosting_Company_2',       // NOTE: API name is Hosting_Company_2
    sponsorStatus:     'Sponsor_Interview_Status',
    sponsorSubmission: 'Submission_Date_Sponsor',
    hcInterviewStatus: 'Hosting_Company_Interview_Status',
    hcSubmissionDate:  'Submission_Date_Hosting_Company',
    housingAvailability:'Housing_Availability',
    housingLandlord:    'Housing_Landlord',
    housingPaymentInit: 'Initial_Housing_Payment_Before_Departure',
    housingPaymentMo:   'Monthly_Housing_Payment',
    housingAddress:     'Housing_Address',

    // Stage 3 — Visa
    visaStatus:        'J1_Visa_Status',
    visaExpiredDate:   'J1_Visa_Expired_Date',    // DS-2019 / Visa expiry date
    visaAppointment:   'J1_Visa_Appointment_Date',
    visaNumber:        'J1_Visa_Number',
    refLetterStatus:   'Reference_Letter_Status',

    // Stage 4 — Travel (outbound)
    flightBooked:      'Flight_Ticket_Status',    // Pick List: Booked / Not Booked
    ticketPayStatus:   'Ticket_Payment_Status',
    ticketPricing:     'Ticket_Pricing',
    airline:           'Airline',
    pnrNumber:         'PNR_Number',              // NOTE: API name is PNR_Number
    tripFrom:          'Trip_From',
    tripTo:            'Trip_To',
    departureDate:     'Departure_Date',
    arrivalDate:       'Arrival_Date',
    airportGateway:    'Airport_Gateway',
    airportPickup:     'Airport_Pick_Up',

    // Returning Home
    returnFlightStatus:'Returning_Flight_Ticket_Status',
    returnDeparture:   'Returning_Departure_Date',
    returnArrival:     'Returning_Arrival_Date',
    returnAirline:     'Returning_Airline',
    returnPNR:         'Returning_Airline_PNR_Number',
    returnTripFrom:    'Returning_Trip_From',
    returnTripTo:      'Returning_Trip_To',
    returnGateway:     'Returning_Airport_Gateway',
  },

  // 6. Local dashboard users (same pattern as Athena)
  //    Generate a SHA-256 hash of each password in your browser console:
  //    crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourpassword'))
  //      .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
  USERS: {
    admin: { hash: 'a43a776d172522fbeed37dae6d1e7b0edfa58843500d5030b24d8e3515215988', role: 'admin' },
    staff: { hash: 'a43a776d172522fbeed37dae6d1e7b0edfa58843500d5030b24d8e3515215988', role: 'staff' },
  },

  // 7. Dashboard branding
  APP_NAME:    'J1 Dashboard',
  ORG_NAME:    'CTI Group Worldwide Services, Inc.',
  ACCENT_COLOR: '#B01A18',
};
