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
| 5 | Saved vs budget: how a finished month ended against the budgets it had | Rules (budget history) | Reports | Done (`e5dfcdc`), tested 2026-10-26 |
| 8 | ML forecast (optional): predicts the run-out date, compared against 3's pace method | ML | Paper / Budgets | Optional: only if the subject requires a prediction model (9 already covers ML) |
| 6 | Paid once a month: a switch on categories like rent and electricity, left out of the pace | Rules | Settings, Budgets, Home | Done (`bc590f3`) |
| 9 | Anomaly detection with K-means: flags unusual purchases and leaves them out of the pace | ML (clustering) | Activity, Budgets | Next |

**Order:** 9 next (K-means then suggests the switch from 6: "Rent looks like a monthly bill. Leave it out of the pace?").
8 only if the subject requires a prediction model.

## When each one starts showing

| Feature | Needs |
|---|---|
| 3 Run-out date | Day 5 or later (a count of expenses was dropped: a one-off big buy skews the pace either way; features 6 and 9 handle that) |
| 5 Saved vs budget | A finished month with spending, and a budget set |
| 9 Anomaly detection | Enough past expenses to form clusters (to settle when we start; around 30+) |

Until then a feature says what it's waiting for ("Shows after 10 Food expenses, 6 so far") instead of guessing.

## Rules that apply throughout

- The monthly budget is the real limit; category budgets are shares of it. When they disagree, the monthly one wins.
- Every budget change is kept per month (`budget_history`, from 2026-10-26). Reports reads a past month against the
  budgets it had; budgets set before that start from the month they were created. The Budgets page and month picker still show
  today's budgets for past months.
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

### 5. Saved vs budget
- [x] Budget history: every budget save or delete writes that month's limit (`supabase/migrations/20261026000000_budget_history.sql`)
- [x] Monthly report returns the budgets the month had; the summary's monthly budget too (API)
- [x] Reports, finished months only: "You stayed ₱1,350 under your ₱10,000 monthly budget." plus each category budget, "₱X left" or "₱X over"
- [x] The outside-budget line on Reports reads the month's own budgets too
- [x] Checks (`frontend/src/lib/budget.test.ts`, `backend/test_receipts.py`)
- Replaced "saved vs your usual month" (median of 3 months) on 2026-10-26: the budget is the user's own plan.

### 6. Paid once a month
- [x] "Paid once a month" switch on a spending category, in Settings (`categories.once_a_month`, migration `20261026020000`)
- [x] The pace leaves those categories out: the monthly line runs on everything else, with their category budget set aside
  until paid (only what's paid, without a budget); Home's card and Budgets say "Leaves out Rent, paid once a month."
- [x] Their own card shows "Paid ₱8,000 this month." or "Not paid yet. ₱8,000 is set aside for it.", no forecast
- [x] A bill paid in full isn't flagged as needing a look; only going over is
- [x] Checks (`frontend/src/lib/budget.test.ts`, `backend/test_receipts.py`)

### Polish (feature 3, no effect on decisions)
- [ ] "With ₱0 to spare": say "You'll just make it to month-end" when the leftover rounds to ₱0
- [ ] Page left open past midnight: recompute the pace when the app comes back into view
- [ ] A scanned receipt with a misread future date: clamp it to today
- [ ] A check for the last day of the month
- [ ] Running out on the last day reads "0 days before month-end": say "on Oct 31, the last day" instead
- [ ] Reports totals: "Overspent" means spent more than earned, and reads like over budget (with no income it equals Spent)

### 8. ML forecast
- _To break down when we start._

### 9. Anomaly detection with K-means
- _To break down when we start._ Idea: cluster each user's expenses (amount, category, day of week); an expense far
  from its nearest cluster centre is unusual. Flag it on Activity and leave it out of the pace. A cluster of one big
  amount repeating each month is a regular bill: suggest feature 6's switch for that category.
  Wording: "Rent looks like a monthly bill. Leave it out of the pace?" How the user answers it (buttons, where it
  shows, what happens on yes/no) is decided when 9 is built. Compare against a plain
  statistical rule (over 3× the category's median) in the paper.
