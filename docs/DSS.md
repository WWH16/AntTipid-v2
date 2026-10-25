# AntTipid as a Decision Support System

The roadmap for turning AntTipid from an expense tracker into a DSS. Each feature is built one at a time; its
sub-tasks are added here as the work is broken down, and checked off as they land.

The core loop: **data** (transactions) → **model** (run-out date, anomalies) → **warning** the user acts on.
(A recorded decision step, "Move money" with a decision log, was dropped on 2026-10-25.)

## Features

| # | Feature | Type | Where | Status |
|---|---|---|---|---|
| 1 | Budget limit rule: category budgets can't add up past the monthly budget | Rules | Budget form + API | Done (`737714e`) |
| 2 | Outside-budget spending flag: spending in categories without a budget, flagged past the unassigned room | Statistics | Budgets, Reports | Done (`737714e`) |
| 3 | Run-out date + safe daily amount | Statistics (pace) | Budgets, Home | Done (`94851e1`) |
| 5 | Saved vs your usual month: "You saved ₱1,750. Most came from Food." | Statistics (median) | Reports | Done, waiting for test |
| 8 | ML forecast (optional): predicts the run-out date, compared against 3's pace method | ML | Paper / Budgets | Optional |
| 6 | Paid once a month: a switch on categories like rent and tuition, left out of the pace | Rules | Settings, Budgets | Before 9 |
| 9 | Anomaly detection with K-means: flags unusual purchases and leaves them out of the pace | ML (clustering) | Activity, Budgets | Last |

**Order:** 3 → 5 → 8 if the subject requires ML → 6 → 9 (K-means then suggests the switch from 6: "Rent looks like a monthly bill. Leave it out of the pace?").

## When each one starts showing

| Feature | Needs |
|---|---|
| 3 Run-out date | Day 5 or later (a count of expenses was dropped: a one-off big buy skews the pace either way; features 6 and 9 handle that) |
| 5 Saved vs usual | 2 full months with spending in the category |
| 9 Anomaly detection | Enough past expenses to form clusters (to settle when we start; around 30+) |

Until then a feature says what it's waiting for ("Shows after 10 Food expenses, 6 so far") instead of guessing.

## Rules that apply throughout

- The monthly budget is the real limit; category budgets are shares of it. When they disagree, the monthly one wins.
- Budgets aren't kept per month, so past months are read against today's budgets.
- Statistics first. ML only replaces a statistic when it predicts better on real data, measured against it.

## Words

One word per idea in everything the app says:

| Idea | Word |
|---|---|
| The overall limit | monthly budget |
| A per-category limit | category budget |
| Money not given to any category | unassigned |
| The last day of the month | month-end |
| The pace lasts the month | On track (pace line, Home badge) |
| The pace runs out early | Spending fast |
| Usage below the warning point | Under limit (usage badge) |
| Usage exactly at the limit | Used up |

## Sub-tasks

### 3. Run-out date + safe daily amount
- [x] Pace, run-out date and safe daily amount, worked out per budget (monthly and each category)
- [x] One line on each budget card on Budgets; nothing for past months, before day 5, or once over
- [x] Monthly budget wins: a category that lasts still says when the monthly budget runs out first
- [x] Run-out date on Home's "Left to spend" card, in its "spending fast" line (it already had the daily amount)
- [x] A check that fails if the math breaks (`frontend/src/lib/budget.test.ts`)
- [x] One daily amount everywhere: days left count today, as Home's card already did

### 5. Saved vs your usual month
- [x] Usual month per category: median of the 3 months before, for categories with spending in 2+ of them (API)
- [x] One line on Reports for finished months: "You spent ₱1,750 less than your usual month. Most of it came from Food (₱1,200 less)."
- [x] Checks (`frontend/src/lib/budget.test.ts`, `backend/test_receipts.py`)

### 6. Paid once a month
- [ ] "Paid once a month" toggle on a category (rent, tuition, bills)
- [ ] The pace leaves those categories out: the monthly line uses everything else; their own card shows paid / not yet paid, no forecast
- [ ] A check that a once-a-month payment no longer makes the month look like it runs out

### Polish (feature 3, no effect on decisions)
- [ ] "With ₱0 to spare": say "You'll just make it to month-end" when the leftover rounds to ₱0
- [ ] Page left open past midnight: recompute the pace when the app comes back into view
- [ ] A scanned receipt with a misread future date: clamp it to today
- [ ] A check for the last day of the month

### 8. ML forecast
- _To break down when we start._

### 9. Anomaly detection with K-means
- _To break down when we start._ Idea: cluster each user's expenses (amount, category, day of week); an expense far
  from its nearest cluster centre is unusual. Flag it on Activity and leave it out of the pace. A cluster of one big
  amount repeating each month is a regular bill: suggest feature 6's switch for that category.
  Wording: "Rent looks like a monthly bill. Leave it out of the pace?" How the user answers it (buttons, where it
  shows, what happens on yes/no) is decided when 9 is built. Compare against a plain
  statistical rule (over 3× the category's median) in the paper.
