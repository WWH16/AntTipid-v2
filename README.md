# AntTipid v2 (prototype)

Frontend-only redesign of AntTipid, a personal money tracker in Philippine pesos. Runs on mock data.

```
frontend/   React + Vite + Tailwind v4 + shadcn/ui (Base UI)
backend/    empty; FastAPI goes here (see backend/README.md for the routes the frontend expects)
```

## Run

```bash
cd frontend
npm install
npm run dev
```

Sign in with any email and password. Mock data resets on page reload.

## Screens

| Nav | What comes first |
|---|---|
| Home | Left to spend this month with a pace bar, then budgets needing attention, wallets, recent activity |
| Activity | All transactions for a month grouped by day; search, filters, CSV export |
| Add (sheet) | Amount, category, save. Wallet and date are pre-filled. "Scan a receipt instead" fills it from a photo |
| Budgets | Whole-month budget, category budgets worst first, quick-add for unbudgeted categories |
| Reports | Earned/spent/saved, spending by category, 6-month income vs spending (chart or table) |
| Settings | Wallets, categories, account |

Phone: bottom bar with a centre Add button. Tablet: icon rail. Laptop: sidebar.

## Connecting the backend

All network calls live in `frontend/src/api/endpoints.ts`. Each one runs the mock handler from
`frontend/src/mocks/db.ts` while `VITE_USE_MOCK` is not `false`, and the real `fetch` otherwise.
Copy `frontend/.env.example` to `frontend/.env` and set `VITE_USE_MOCK=false` once FastAPI is up.
