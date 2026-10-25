# AntTipid as a Decision Support System

The roadmap for turning AntTipid from an expense tracker into a DSS. Each feature is built one at a time; its
sub-tasks are added here as the work is broken down, and checked off as they land.

The core loop: **data** (transactions) → **model** (run-out date, unusual purchases) → **decision** (move money)
→ **record** (decision log, for the paper's results).

## Features

| # | Feature | Type | Where | Status |
|---|---|---|---|---|
| 1 | Budget limit rule: category budgets can't add up past the monthly budget | Rules | Budget form + API | Done (`737714e`) |
| 2 | Outside-budget spending flag: spending in categories without a budget, flagged past the unassigned room | Statistics | Budgets, Reports | Done (`737714e`) |
| 3 | Run-out date + safe daily amount | Statistics (pace) | Budgets, Home | Done, waiting for test |
| 4 | Move money: "Food runs out Oct 21. Move ₱1,000 from Shopping?" Move / Keep | Rules (the decision) | Budgets | Not started |
| 5 | Saved vs your usual month: "You saved ₱1,750. Most came from Food." | Statistics (median) | Reports | Not started |
| 6 | Unusual purchase flag: over 3× your usual for the category and over ₱500 | Statistics | Activity | Not started |
| 7 | Decision log: every Move / Keep choice from 4, for the paper | Data | Database table | Not started |
| 8 | ML forecast (optional): predicts the run-out date, compared against 3's pace method | ML | Paper / Budgets | Optional, last |

**Order:** 3 → 6 (makes 3's pace more accurate) → 4 with 7 → 5 → 8 if the subject requires ML.

## When each one starts showing

| Feature | Needs |
|---|---|
| 3 Run-out date | Day 5 or later (a count of expenses was dropped: a one-off big buy skews the pace either way, and feature 6 handles that) |
| 5 Saved vs usual | 2 full months with spending in the category |
| 6 Unusual purchase | 10+ past expenses in the category, over 30+ days |

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

### 4. Move money
- _To break down when we start._

### 5. Saved vs your usual month
- _To break down when we start._

### 6. Unusual purchase flag
- _To break down when we start._

### 7. Decision log
- _To break down when we start._

### 8. ML forecast
- _To break down when we start._
