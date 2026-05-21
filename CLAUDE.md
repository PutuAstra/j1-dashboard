# J1 Dashboard — Project Context for Claude

## What This Is
A vanilla JS single-page application (SPA) for CTI Group Worldwide Services, Inc. to manage J1 exchange visitor program participants. Deployed on **GitHub Pages** at `https://putuastra.github.io/j1-dashboard/`.

No build tools, no framework — plain HTML/CSS/JS served as static files.

## Repository
- **GitHub:** `https://github.com/PutuAstra/j1-dashboard`
- **Local path:** `C:\Users\putua\j1-dashboard\`
- **Branch:** `main` → auto-deploys to GitHub Pages

## File Structure
```
index.html        — SPA shell, sidebar, topbar, auth guard
login.html        — Login page
app.js            — All page rendering logic (router + all pages)
style.css         — All styles (dark/light theme via CSS variables)
config.js         — Zoho field mappings, users, branding
auth.js           — Local username/password auth (sessionStorage)
zoho.js           — Zoho Recruit + CRM API client (via Cloudflare proxy)
logo.png          — CTI Group logo
```

## Architecture

### Authentication
- Local username/password only. SHA-256 hashed passwords in `config.js → USERS`.
- Session stored in `sessionStorage` (cleared on tab close).
- No Zoho OAuth needed — all Zoho auth is server-side.

### Data Flow
```
Browser → Cloudflare Worker (zoho-proxy.putuastrawijaya.workers.dev)
        → Zoho Recruit API  (J1_Participants module)
        → Zoho CRM API      (J1_Participants1 module)
```
- Worker holds the Zoho refresh token as a **secret** and auto-refreshes the access token (cached 55 min in KV namespace `TOKEN_CACHE`).
- No token handling needed in the browser at all.

### Cloudflare Worker
- **URL:** `https://zoho-proxy.putuastrawijaya.workers.dev`
- **Secrets:** `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`
- **KV binding:** `TOKEN_CACHE`
- Routes: `/recruit/v2/*` → Zoho Recruit, `/crm/v2/*` → Zoho CRM
- If the refresh token expires (rare), generate a new one via Zoho Self Client and update the secret in the Cloudflare dashboard.

### Zoho Self Client credentials (for refresh token generation only)
- Client ID: `1000.LDBY7U84F5AOO72UDXJQ1T1T7VQ1AR`
- These are separate from the dashboard OAuth client (`1000.ETQWHXIHDYG1HWGG91JUHRQI8L6IAD`)

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Overview | `#overview` | Charts: Top Countries, Stage Progress, Requisition. Visa Summary row. Travel/Housing donuts. |
| Participants | `#participants` | Tabbed table by stage (New Submission → Program Completed + Archived). Search + filter. |
| Visa | `#visa` | Clickable stat chips (Total/Approved/Rejected/Pending/Upcoming/SL Requested) + table + pie chart |
| Travel | `#travel` | Joining (visa approved) and Returning (USA Onboard/Completed) flight status |
| Housing | `#housing` | Housing assignment tracking |
| Requisition | `#requisition` | Job openings from Zoho Recruit. Clickable client cards filter the table. |

## Key Implementation Patterns

### Click-to-filter chips
Both Requisition client cards and Visa stat chips are clickable to filter the table:
- Requisition: CSS class `.req-client-card` / `.req-client-active`, state `_reqFilterClient`
- Visa: CSS class `.visa-stat-chip` / `.active`, state `_visaFilterStatus`
- Toggle behavior: click active chip again to deselect
- Wired via `wireVisaChips()` (called after every render) and event delegation for Requisition

### Auto-refresh
Data refreshes every 10 minutes (`startAutoRefresh()`). Participants cached in `_participants`, jobs in `_jobCache`. Set to `null` to force a fresh fetch.

### Date handling
Zoho returns dates as `MM/DD/YYYY`. Always parse with `new Date(dateStr)` — never use `substring(0,7)` for YYYY-MM extraction.

### Cache busting
All asset URLs have `?v=20250520` to force browsers to fetch fresh files after deployments.

## Zoho Data Sources

### Recruit (`J1_Participants` module)
Used for participants in Stage 1 through Program Completed. Key fields in `config.js → FIELDS`.

### CRM (`J1_Participants1` module)
Used for early-stage participants (New Submission, Consultation Call, Sales Call). Key fields in `config.js → CRM_FIELDS`.

Both sources are merged in `zoho.js → getAllParticipants()` — CRM first, then Recruit.

## Visa Page Logic
- **Pool:** Participants with `visaAppointment` filled (regardless of visa status)
- **Approved:** `visaStatus === "Approved"`
- **Rejected:** has a status, not approved/pending
- **Pending:** `visaStatus === "Pending"`
- **Upcoming Appt.:** appointment date >= today
- **SL Requested:** `refLetterStatus === "Requested"`

## Deployment
```bash
git add -A
git commit -m "Description"
git push
# GitHub Pages deploys in ~1-2 minutes
```

## Credentials & Logins
- Dashboard login: `admin` / `staff` (passwords are the same hash — see config.js)
- Cloudflare Worker dashboard: cloudflare.com (account: putuastrawijaya)
- GitHub: PutuAstra

## Active TODOs / Known State
- Overview visa section: has 6 chips (Total, Approved, Rejected, Pending, Upcoming Appt., SL Requested)
- Visa page: fully working click-to-filter on all 6 chips
- Requisition page: client cards are clickable with hover+active red outline
- All pages push to GitHub and deploy via Pages — no local server needed
