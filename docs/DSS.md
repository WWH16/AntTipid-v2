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
| 9 | Anomaly detection with K-means: flags unusual purchases and leaves them out of the pace | ML (clustering) | Activity, Budgets, Home | Done, waiting for commit |

**Order:** 9 next (K-means then suggests the switch from 6: "Rent looks like a monthly bill. Leave it out of the pace?").
8 only if the subject requires a prediction model.

## When each one starts showing

| Feature | Needs |
|---|---|
| 3 Run-out date | Day 5 or later (a count of expenses was dropped: a one-off big buy skews the pace either way; features 6 and 9 handle that) |
| 5 Saved vs budget | A finished month with spending, and a budget set |
| 9 Anomaly detection | 10 expenses in a category within 6 months (3 for the simple rule) |

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
Per user and per spending category: learn the usual amounts from the last 6 months, flag a purchase far from them.
Once-a-month categories (feature 6) are skipped; they're already out of the pace.

| Setting | Decision |
|---|---|
| History | Last 6 months, this month included |
| Minimum | 10 expenses in the category for K-means; 3 to 9 use a simple rule (over 3x the highest other amount: too few to tell a second habit from an outlier, and 3x the median flagged every meal among snacks); under 3 aren't checked |
| Feature | log(amount), standardized |
| k | Silhouette over k = 2 to min(4, n / 3); best under 0.75 means k = 1 (one habit; in 1-D a single habit still scores 0.55 to 0.72 when split, measured). Checked in the paper against the gap statistic (Tibshirani et al., 2001), the textbook test for k = 1: same k on 4 of 5 sample categories; Transport's exact fixed fares differ (4 vs 1) with no false flags either way |
| Algorithm | Plain Python K-means (Lloyd's), k-means++ start, 5 restarts, lowest inertia kept; seeded per user and category |
| Flag | Habits as in CBLOF (He et al., 2003): the biggest clusters covering 90% of purchases, or until the next is 5x smaller. Each purchase is judged against its nearest habit: modified z-score over 3.5 (median and MAD, Iglewicz & Hoaglin) and at least 1.5x the habit's centre. Only above: a small purchase never counts |
| Checked | This month's expenses |
| Speed | 1-D: sorted values and prefix sums make silhouette O(n log n); 2,000 expenses must score in under 100 ms. Older purchases are judged in one batch: one history query per category, judging in memory, one write (75 purchases: 23 s before, about 1.4 s after, identical verdicts, tested) |
| Result (sample user) | K-means precision 1.00, recall 0.71, F1 0.83; 3x median 0.18 / 0.88 / 0.30. Every 4x and 8x caught, most 2x, few 1.5x (borderline by design). `backend/paper_anomalies.py`, `docs/kmeans-evaluation.html` |

- [x] `backend/anomalies.py`: K-means, k-means++, silhouette, flag rules, median fallback (test-first)
- [x] The decision loop (model recommends, user decides, decision recorded, only "normal" teaches): `anomaly_checks`
  keeps each purchase's verdict from when it was saved, judged on the history before it, with the user's decision
  (one-off or normal) and the usual range at the time. A later purchase never rewrites an earlier flag.
- [x] Add form: a verdict card (reason, number line of the usual band and this amount, the last one-off like it) and the
  decision as the save buttons: Save as one-off (default) or It's normal for me; from the 3rd one-off like it, "normal"
  becomes the default ("Make it part of your habits?"). "Normal" asks once about earlier one-offs like it.
  A same-day same-amount entry says "Is this a duplicate?"
- [x] Activity: "One-off" (decided) or "Unusual" (waiting for review); details: the verdict as it was, and both choices
  with Undo. Home's Needs attention lists purchases to review.
- [x] Edge cases: saved before the check answered or older data: judged once, point-in-time, then reviewed; editing the
  amount, category or date judges it again; once-a-month categories never; income and transfers never.
- Cold start: a new habit (the first meals after only snacks) is flagged until the user calls it normal; repeats make
  "normal" the default, so a genuine new habit is one tap.
- [x] Pace: a flagged purchase counts once, not projected (same as feature 6), with a note
- [x] Paper script: K-means vs the 3x median rule (the baseline) on real data plus planted outliers; elbow and silhouette charts
- On hold: the monthly-bill suggestion ("Rent looks like a monthly bill. Leave it out of the pace?"). Idea: K-means
  finds a group of similar amounts, a date check confirms it repeats monthly; a category under 10 uses the date check alone.
