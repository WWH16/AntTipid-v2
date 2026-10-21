# AntTipid v2

Personal money tracker in Philippine pesos, built with React + Vite + Tailwind v4 + shadcn/ui (Base UI) on the frontend, FastAPI on the backend, and Supabase (Auth, Postgres, Storage).

```
frontend/   React + Vite + Tailwind v4 + shadcn/ui (Base UI)
backend/    FastAPI + psycopg (Supabase transaction pooler) + Supabase Storage
supabase/   SQL migrations (tables, RLS policies, default category trigger, receipts bucket)
```

## Run locally

1. Apply `supabase/migrations/20261020000000_init.sql` in your Supabase project's SQL Editor.
2. Configure environment files:
   - Copy `backend/.env.example` to `backend/.env` and set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DATABASE_URL` (transaction pooler, port `6543`), and `OPENROUTER_API_KEY` or `GEMINI_API_KEY`.
   - Copy `frontend/.env.example` to `frontend/.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Optional, for "Continue with Google":
   - In Google Cloud Console → APIs & Services → Credentials, create an OAuth client ID (Web application) with the authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`.
   - In Supabase → Authentication → Sign In / Providers → Google, turn it on and paste the client ID and secret.
   - In Supabase → Authentication → URL Configuration → Redirect URLs, add `http://localhost:5173/sign-in` and your deployed `https://<your-domain>/sign-in`.
4. Start both servers:

```bash
# Terminal 1: backend on :8000
cd backend
.venv/Scripts/python -m uvicorn main:app --reload --port 8000

# Terminal 2: frontend on :5173 (proxies /api to :8000)
cd frontend
npm install
npm run dev
```

## Screens

| Nav | What comes first |
|---|---|
| Home | Left to spend this month with a pace bar, then budgets needing attention, wallets, recent activity |
| Activity | All transactions for a month grouped by day; search, filters, CSV export |
| Add (sheet) | Amount, category, save. Wallet and date are pre-filled. "Scan a receipt instead" fills it from a photo |
| Budgets | Whole-month budget, category budgets worst first, quick-add for unbudgeted categories |
| Reports | Earned/spent/saved, spending by category, 6-month income vs spending (chart or table) |
| Settings | Wallets, categories, account |
