"""Unusual purchases (DSS feature 9): K-means on each category's amounts, in plain Python.

Per user and per spending category, the last 6 months of amounts are clustered on log(amount), standardized. k is
picked by silhouette (k = 2 to min(4, n / 3); a best score under 0.75 means one habit, k = 1. In one dimension a
single spread-out habit still scores 0.55 to 0.72 when split, so the usual 0.5 cut-off would always split it). A purchase is unusual
when it sits well above its habit. Clusters split into habits and the rest as in CBLOF (He et al., 2003): sorted by size,
habits are the clusters that cover 90% of purchases, or end where the next cluster is 5x smaller. Every purchase is then
judged against its nearest habit: a modified z-score over 3.5 (median and MAD, so several big purchases can't stretch
the yardstick they're judged by) and at least 1.5x the habit's centre. Only big counts: an unusually small purchase
never overspends anything.
Categories with 3 to 9 expenses use a simple rule instead: over 3x the highest of the other amounts. Too few to tell a
second habit from an outlier, so only a clear jump counts (3x the median would flag every meal among snacks).
Under 3 aren't checked.

One dimension keeps it fast without numpy: clusters are runs of the sorted values, so assignment is a binary search
and silhouette uses prefix sums, O(n log n) instead of comparing every pair.
"""

import math
import random
import zlib
from bisect import bisect_left
from dataclasses import dataclass, field
from statistics import median

from months import month_range, shift_month

MIN_KMEANS = 10  # fewer expenses than this in a category: the simple rule
MIN_MEDIAN = 3  # fewer than this: not checked
MAX_K = 4
RESTARTS = 5
SILHOUETTE_MIN = 0.75  # best silhouette under this: no real groups, one habit (measured, see the module docstring)
HABIT_SHARE = 0.9  # CBLOF alpha: habits cover this share of purchases
HABIT_GAP = 5  # CBLOF beta: or end where the next cluster is this many times smaller
MODIFIED_Z = 3.5  # Iglewicz & Hoaglin's cut-off for the modified z-score
MIN_RATIO = 1.5  # and at least this many times its cluster's centre (geometric mean)
JUMP = 3  # simple rule: over JUMP x the highest other amount


def _assign(xs: list[float], centres: list[float]) -> list[int]:
    """Nearest centre for each value. Centres are sorted, so the cut points are the midpoints between them."""
    cuts = [(a + b) / 2 for a, b in zip(centres, centres[1:])]
    return [bisect_left(cuts, x) for x in xs]


def _plus_plus(xs: list[float], k: int, rng: random.Random) -> list[float]:
    """k-means++ start: the first centre at random, each next one far from those chosen (chance by squared distance)."""
    centres = [rng.choice(xs)]
    while len(centres) < k:
        d2 = [min((x - c) ** 2 for c in centres) for x in xs]
        total = sum(d2)
        if total == 0:
            break  # fewer distinct values than k
        centres.append(rng.choices(xs, weights=d2)[0])
    return sorted(centres)


def kmeans_1d(xs: list[float], k: int, seed: int) -> tuple[list[float], list[int], float]:
    """Lloyd's K-means with a k-means++ start, best of RESTARTS by inertia. Returns sorted centres, labels, inertia."""
    rng = random.Random(seed)
    best = None
    for _ in range(RESTARTS):
        centres = _plus_plus(xs, k, rng)
        for _ in range(100):
            labels = _assign(xs, centres)
            sums, counts = [0.0] * len(centres), [0] * len(centres)
            for x, c in zip(xs, labels):
                sums[c] += x
                counts[c] += 1
            # An empty cluster keeps its centre; the next restart may do better.
            moved = sorted(s / n if n else c for s, n, c in zip(sums, counts, centres))
            if moved == centres:
                break
            centres = moved
        labels = _assign(xs, centres)
        inertia = sum((x - centres[c]) ** 2 for x, c in zip(xs, labels))
        if best is None or inertia < best[2]:
            best = (centres, labels, inertia)
    return best


def silhouette_1d(xs: list[float], labels: list[int]) -> float:
    """Mean silhouette, exact. Each cluster's values are sorted once with prefix sums, so the mean distance from any
    value to a cluster is a binary search away. A value alone in its cluster scores 0, as usual."""
    groups: dict[int, tuple[list[float], list[float]]] = {}
    for c in set(labels):
        vals = sorted(x for x, l in zip(xs, labels) if l == c)
        pre = [0.0]
        for v in vals:
            pre.append(pre[-1] + v)
        groups[c] = (vals, pre)

    def total_distance(x: float, c: int) -> float:
        vals, pre = groups[c]
        i = bisect_left(vals, x)
        return x * i - pre[i] + (pre[-1] - pre[i]) - x * (len(vals) - i)

    scores = []
    for x, c in zip(xs, labels):
        n = len(groups[c][0])
        if n == 1:
            scores.append(0.0)
            continue
        a = total_distance(x, c) / (n - 1)
        b = min(total_distance(x, o) / len(groups[o][0]) for o in groups if o != c)
        scores.append((b - a) / max(a, b) if max(a, b) > 0 else 0.0)
    return sum(scores) / len(scores)


def pick_k(zs: list[float], seed: int):
    """Best k by silhouette over 2 to min(MAX_K, n / 3); one habit (k = 1) when no k scores SILHOUETTE_MIN.
    Returns k, centres, labels and every k's score (for the paper)."""
    scores, fits = {}, {}
    for k in range(2, min(MAX_K, len(zs) // 3) + 1):
        centres, labels, _ = kmeans_1d(zs, k, seed)
        if len(set(labels)) < 2:
            continue  # fewer distinct values than k
        fits[k] = (centres, labels)
        scores[k] = silhouette_1d(zs, labels)
    k = max(scores, key=scores.get, default=1)
    if k == 1 or scores[k] < SILHOUETTE_MIN:
        return 1, [sum(zs) / len(zs)], [0] * len(zs), scores
    return k, *fits[k], scores


@dataclass
class Verdict:
    method: str  # "kmeans", "simple" or "none" (too few expenses)
    flagged: set[str] = field(default_factory=set)  # ids among `current` that are unusual
    usual: tuple[float, float] | None = None  # range of the amounts that aren't unusual
    k: int = 0


def check_category(items: list[tuple[str, float]], current: set[str], seed: int) -> Verdict:
    """One category's last 6 months as (id, amount); flags among `current` (this month's) ids."""
    amounts = [a for _, a in items]
    if len(items) < MIN_MEDIAN:
        return Verdict("none")
    if len(items) < MIN_KMEANS:
        top, second = sorted(amounts)[-1], sorted(amounts)[-2]
        unusual = {i for i, a in items if a == top and a > JUMP * second}
        return _verdict("simple", items, unusual, current, 0)

    logs = [math.log(a) for a in amounts]
    mean = sum(logs) / len(logs)
    std = (sum((x - mean) ** 2 for x in logs) / len(logs)) ** 0.5
    if std == 0:
        return _verdict("kmeans", items, set(), current, 1)  # the same amount every time: nothing stands out
    zs = [(x - mean) / std for x in logs]
    k, centres, labels, _ = pick_k(zs, seed)

    members = [[i for i, l in enumerate(labels) if l == c] for c in range(len(centres))]
    habits = _habits(members, len(zs))
    # Each purchase against its nearest habit, in log units: its signed distance above that habit's centre.
    ref = [l if l in habits else min(habits, key=lambda h: abs(centres[h] - centres[l])) for l in labels]
    above = [x - (mean + std * centres[r]) for x, r in zip(logs, ref)]
    unusual = set()
    for h in habits:
        mine = [above[i] for i in members[h]]  # the habit's own spread is the yardstick
        mid = median(mine)
        mad = median(abs(d - mid) for d in mine)
        for i, r in enumerate(ref):
            if r != h or above[i] < math.log(MIN_RATIO):
                continue
            if not mad or 0.6745 * (above[i] - mid) / mad > MODIFIED_Z:
                unusual.add(i)
    return _verdict("kmeans", items, {items[i][0] for i in unusual}, current, k)


def _habits(members: list[list[int]], n: int) -> set[int]:
    """CBLOF's large clusters: biggest first, until they cover HABIT_SHARE of n or the next is HABIT_GAP times smaller."""
    order = sorted(range(len(members)), key=lambda c: -len(members[c]))
    habits, covered = set(), 0
    for a, b in zip(order, order[1:] + [None]):
        habits.add(a)
        covered += len(members[a])
        if covered >= HABIT_SHARE * n or (b is not None and len(members[a]) >= HABIT_GAP * len(members[b])):
            break
    return habits


def _verdict(method: str, items, unusual: set[str], current: set[str], k: int) -> Verdict:
    normal = [a for i, a in items if i not in unusual]
    return Verdict(method, unusual & current, (min(normal), max(normal)) if normal else None, k)


# ---------------------------------------------------------------------------------------------- stored verdicts
# Each spending purchase is judged once, when saved, against the history before it, and the verdict is kept
# (anomaly_checks): a later purchase can never rewrite an earlier one. Only habits teach: an unusual purchase that the
# user hasn't called normal (a one-off, or not decided yet) stays out of every later purchase's history.

WINDOW_MONTHS = 6
SIMILAR = 1.5  # "a one-off like this": within 1.5x either way


def _window_start(day):
    return month_range(shift_month(day.strftime("%Y-%m"), -(WINDOW_MONTHS - 1)))[0]


def judge(conn, user_id, category_id, amount: float, day, before=None, exclude=None) -> Verdict | None:
    """Would `amount` on `day` be unusual, against the category's 6 months before it? `before` is when it was saved
    (same-day purchases saved earlier count; default: everything saved so far), `exclude` the purchase itself.
    None for a once-a-month category: its big payment is expected."""
    if conn.execute("select once_a_month from categories where id = %s", (category_id,)).fetchone()["once_a_month"]:
        return None
    rows = conn.execute(
        """
        select t.id, t.amount from transactions t
        left join anomaly_checks a on a.transaction_id = t.id
        where t.user_id = %(uid)s and t.kind = 'expense' and t.category_id = %(cat)s
          and t.date >= %(from)s and (t.date < %(day)s or (t.date = %(day)s and t.created_at < coalesce(%(before)s::timestamptz, now())))
          and t.id is distinct from %(exclude)s::uuid
          and not (coalesce(a.unusual, false) and a.decision is distinct from 'normal')
        """,
        {"uid": user_id, "cat": category_id, "from": _window_start(day), "day": day, "before": before, "exclude": exclude},
    ).fetchall()
    items = [(str(r["id"]), float(r["amount"])) for r in rows] + [("new", amount)]
    # Seeded per user and category, so a verdict never flips between runs, and the form agrees with the history.
    return check_category(items, {"new"}, zlib.crc32(f"{user_id}:{category_id}".encode()))


def record(conn, user_id, txn_id, decision: str | None = None, also_earlier: bool = False) -> None:
    """Judge a saved purchase and keep the verdict (with `decision` when it's unusual). Not a spending purchase, or in
    a once-a-month category: nothing is kept."""
    t = conn.execute(
        "select id, kind, category_id, amount, date, created_at from transactions where id = %s and user_id = %s", (txn_id, user_id)
    ).fetchone()
    conn.execute("delete from anomaly_checks where transaction_id = %s", (txn_id,))
    if not t or t["kind"] != "expense" or not t["category_id"]:
        return
    v = judge(conn, user_id, t["category_id"], float(t["amount"]), t["date"], before=t["created_at"], exclude=t["id"])
    if v is None:
        return
    unusual = "new" in v.flagged
    conn.execute(
        """
        insert into anomaly_checks (transaction_id, user_id, unusual, decision, method, usual_low, usual_high)
        values (%s, %s, %s, %s, %s, %s, %s)
        """,
        (txn_id, user_id, unusual, decision if unusual else None, v.method, *(v.usual or (None, None))),
    )
    if unusual and decision == "normal" and also_earlier:
        mark_normal(conn, similar_one_offs(conn, user_id, t["category_id"], float(t["amount"]), t["date"], exclude=t["id"]))


def mark_normal(conn, one_offs: list[dict]) -> None:
    conn.execute("update anomaly_checks set decision = 'normal' where transaction_id = any(%s)", ([o["transaction_id"] for o in one_offs],))


def similar_one_offs(conn, user_id, category_id, amount: float, day, exclude=None) -> list[dict]:
    """Earlier one-offs like this one (same category, within 1.5x, in the 6 months up to `day`), newest first."""
    return conn.execute(
        """
        select t.id::text as transaction_id, t.date, t.amount::float as amount from transactions t
        join anomaly_checks a on a.transaction_id = t.id and a.unusual and a.decision = 'one_off'
        where t.user_id = %(uid)s and t.category_id = %(cat)s and t.date >= %(from)s and t.date <= %(day)s
          and t.amount between %(lo)s and %(hi)s and t.id is distinct from %(exclude)s::uuid
        order by t.date desc, t.created_at desc
        """,
        {"uid": user_id, "cat": category_id, "from": _window_start(day), "day": day,
         "lo": amount / SIMILAR, "hi": amount * SIMILAR, "exclude": exclude},
    ).fetchall()
