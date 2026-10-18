# Backend (FastAPI, not started)

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

Point the frontend at it with `VITE_USE_MOCK=false` and `VITE_API_URL=http://localhost:8000/api` (CORS must allow credentials from the Vite origin).
