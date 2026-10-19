# Backend (FastAPI)

Only `POST /api/receipts/scan` exists so far. It reads the photo with free vision models on OpenRouter
and returns the result; nothing is stored (there is no database yet). The frontend calls it even in mock mode.

## Run

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # macOS/Linux: .venv/bin/python
cp .env.example .env                                       # then set OPENROUTER_API_KEY
.venv/Scripts/python -m uvicorn main:app --reload --port 8000
```

The Vite dev server proxies `/api` to `http://localhost:8000`, so no CORS setup is needed in development.
Check the output parsing with `.venv/Scripts/python test_receipts.py`.

## Routes still to build

The frontend already calls these routes through `frontend/src/api/endpoints.ts`. Mount them under `/api`.
Request/response shapes are in `frontend/src/types.ts`; mirror them as Pydantic models.
Errors should use FastAPI's default `{"detail": "..."}` body; the client shows `detail` to the user.

| Method | Path | Notes |
|---|---|---|
| POST | /auth/sign-in | `{email, password}` returns `User` |
| GET / POST | /wallets | list includes computed `balance` |
| PATCH | /wallets/{id} | `{name?, archived?}` |
| GET / POST | /categories | |
| PATCH / DELETE | /categories/{id} | DELETE returns 409 + detail if the category has transactions |
| GET | /transactions | query: `month, kind, walletId, categoryId, search` |
| POST | /transactions | |
| GET / PATCH / DELETE | /transactions/{id} | |
| GET | /transactions/export.csv | same query params as the list |
| GET | /budgets?month=YYYY-MM | returns `BudgetStatus[]` with `spent` for that month |
| POST / PUT / DELETE | /budgets, /budgets/{id} | |
| GET | /reports/summary?month= | `MonthSummary` |
| GET | /reports/monthly?month= | `MonthlyReport` (by category, 6-month trend, spending per day) |
| POST | /receipts/scan | multipart `image`; returns `ReceiptScan` |

Point the frontend at it with `VITE_USE_MOCK=false`. In development `/api` goes through the Vite proxy; a deployed API on another origin needs `VITE_API_URL` and CORS that allows credentials from the frontend origin.
