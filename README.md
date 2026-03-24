# Kinematic Dashboard

Admin dashboard for the Kinematic Field Force Management platform.

## Tech Stack
- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS** 
- **Supabase** (auth + database)

---

## Quick Start (Local)

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env.local
# → Edit .env.local with your Railway API URL and Supabase credentials

# 3. Run dev server
npm run dev
# → Open http://localhost:3000
```

---

## Deploy to Vercel (5 minutes)

### Option A — Vercel CLI (fastest)
```bash
npm install -g vercel
vercel
# Follow prompts → choose "Next.js" → set env vars when asked
```

### Option B — Vercel Dashboard
1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → **New Project**
3. Import your GitHub repo
4. Add Environment Variables (from `.env.example`)
5. Click **Deploy** — done!

---

## Environment Variables

| Variable | Description | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Your Railway API URL | Railway dashboard → your service → Public URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Supabase → Project Settings → API |
| `NEXTAUTH_SECRET` | JWT secret (32+ chars) | Run: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Your production URL | e.g. `https://dashboard.kinematic.in` |

---

## Railway API — Required Endpoints

Your Railway API must expose these routes for the dashboard to work:

```
POST /api/v1/auth/login          → { email, password } → { user, access_token }
GET  /api/v1/dashboard/stats     → DashboardStats
GET  /api/v1/field-executives    → FieldExecutive[]
GET  /api/v1/attendance          → AttendanceRecord[]
GET  /api/v1/builder               → CCForm[]
GET  /api/v1/stock               → StockItem[]
GET  /api/v1/broadcast           → BroadcastQuestion[]
POST /api/v1/broadcast           → Create question
GET  /api/v1/notifications       → Notification[]
POST /api/v1/notifications/send  → Send notification
GET  /api/v1/analytics           → Analytics data
```

---

## Project Structure

```
src/
├── app/
│   ├── login/              ← Login page
│   ├── dashboard/
│   │   ├── layout.tsx      ← Sidebar + header
│   │   ├── page.tsx        ← Dashboard home (KPIs, charts)
│   │   ├── field-executives/
│   │   ├── analytics/
│   │   ├── warehouse/
│   │   ├── broadcast/
│   │   ├── hr/
│   │   ├── live-tracking/
│   │   ├── notifications/
│   │   └── settings/
│   └── globals.css
├── lib/
│   ├── api.ts              ← API client (connects to Railway)
│   ├── auth.ts             ← Auth helpers (localStorage session)
│   └── utils.ts            ← Utility functions
├── hooks/
│   ├── useAuth.ts
│   └── useApi.ts
└── types/
    └── index.ts            ← Shared TypeScript types
```

---

## Adding Real Data

Each page currently shows **mock data**. To connect to your live Railway API:

1. Set `NEXT_PUBLIC_API_URL` in `.env.local`
2. In each page, replace mock data with an `api.get(...)` call:

```tsx
// Before (mock)
const [stats] = useState(MOCK.stats);

// After (live)
const { data, loading } = useApi(() => api.getDashboardStats());
```

---

## Custom Domain (Optional)

After deploying to Vercel:
1. Vercel Dashboard → your project → **Settings** → **Domains**
2. Add `dashboard.kinematic.in`
3. In your DNS provider, add a CNAME: `dashboard` → `cname.vercel-dns.com`

---

## Support

Built by the Kinematic engineering team. For issues, contact your admin.
