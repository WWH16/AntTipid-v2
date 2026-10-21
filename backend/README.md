# Backend (FastAPI)

FastAPI backend for AntTipid, deployed on Vercel behind `/api` (`ant-tipid-v2-backend`).
Data lives in Supabase Postgres (via the port `6543` transaction pooler), receipt photos in the private
Supabase Storage bucket `receipts`, and every user-data route verifies the caller's Supabase JWT and sets
their JWT claims on the database transaction so Postgres RLS (`user_id = auth.uid()`) applies alongside
explicit `user_id` filters.

## Database setup

Run `supabase/migrations/20261020000000_init.sql` in the Supabase SQL Editor (or with `psql "$DATABASE_URL" -f supabase/migrations/20261020000000_init.sql`). It creates:

- `wallets`, `categories`, `transactions`, `receipt_items`, and `budgets` with RLS enabled (`user_id = auth.uid()`)
- Trigger `on_auth_user_created_seed_categories` on `auth.users` that seeds the 11 default categories for every new user
- Private `receipts` Storage bucket (1 MB limit, `image/webp`, `image/jpeg`, `image/png`) with own-folder RLS policies

## Run locally

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # macOS/Linux: .venv/bin/python
cp .env.example .env                                       # fill in SUPABASE_URL, SUPABASE_ANON_KEY, DATABASE_URL, and a scan key
.venv/Scripts/python -m uvicorn main:app --reload --port 8000
```

Run the self-checks (receipt parsing, JWT verification, every route group, and user A vs user B isolation):

```bash
.venv/Scripts/python test_receipts.py
```

## Deploy on Vercel

Two Vercel projects from this repo:

1. **Backend** (`ant-tipid-v2-backend`, Root Directory `backend`): set these under **Settings > Environment Variables**:
   - `SUPABASE_URL` — Project URL (`https://<project-ref>.supabase.co`)
   - `SUPABASE_ANON_KEY` — Project anon / publishable key
   - `DATABASE_URL` — Supabase **Transaction pooler** URI (port `6543`)
   - `SUPABASE_JWT_SECRET` — Legacy HS256 JWT secret (optional if the project uses asymmetric ES256/RS256 signing keys via JWKS)
   - `OPENROUTER_API_KEY` and/or `GEMINI_API_KEY` — Vision model key(s) for receipt scanning
2. **Frontend** (Root Directory `frontend`): set these under **Settings > Environment Variables**:
   - `VITE_SUPABASE_URL` — Project URL (`https://<project-ref>.supabase.co`)
   - `VITE_SUPABASE_ANON_KEY` — Project anon / publishable key

## Routes (`/api`)

| Method | Path | Notes |
|---|---|---|
| GET / POST | `/wallets` | List includes computed `balance` |
| PATCH | `/wallets/{id}` | `{name?, archived?}` |
| GET / POST | `/categories` | Seeded automatically on sign-up |
| PATCH / DELETE | `/categories/{id}` | DELETE returns `409` if the category has transactions |
| GET | `/transactions` | Query: `month, kind, walletId, categoryId, search` |
| POST | `/transactions` | Creates transaction and any `items` |
| GET / PATCH / DELETE | `/transactions/{id}` | GET includes 10-min signed `receiptUrl`; DELETE also removes the photo from Storage |
| POST | `/transactions/{id}/receipt` | Multipart `image` (<= 1 MB, WebP/JPEG/PNG); stored at `{user_id}/{transaction_id}.{ext}` |
| GET | `/transactions/export.csv` | Same query params as `/transactions` |
| GET | `/budgets?month=YYYY-MM` | Returns `BudgetStatus[]` with `spent` for that month |
| POST / PUT / DELETE | `/budgets`, `/budgets/{id}` | Upserts by `(user_id, category_id)` on POST |
| GET | `/reports/summary?month=YYYY-MM` | `MonthSummary` |
| GET | `/reports/monthly?month=YYYY-MM` | `MonthlyReport` (by category, 6-month trend, daily spending) |
| POST | `/receipts/scan` | Multipart `image`; returns `ReceiptScan` |
