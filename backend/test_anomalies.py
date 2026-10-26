"""Checks for the K-means anomaly detection (DSS feature 9). No database: pure functions on amounts.

Run with:
  .venv/Scripts/python -m pytest test_anomalies.py
"""

import math
import random
import time

from anomalies import SILHOUETTE_MIN, check_category, kmeans_1d, pick_k, silhouette_1d

# A month of Food: snacks around ₱110, meals around ₱410.
SNACKS = [85, 95, 100, 105, 110, 115, 120, 125, 130, 140]
MEALS = [380, 390, 400, 410, 420, 430, 450]


def log_z(amounts):
    """Same feature the module uses: log of the amount, standardized."""
    logs = [math.log(a) for a in amounts]
    mean = sum(logs) / len(logs)
    std = (sum((x - mean) ** 2 for x in logs) / len(logs)) ** 0.5
    return [(x - mean) / std for x in logs]


def test_kmeans_finds_snacks_and_meals():
    xs = [math.log(a) for a in SNACKS + MEALS]
    centres, labels, _ = kmeans_1d(xs, 2, seed=1)
    assert [round(math.exp(c)) for c in centres] == [111, 411]  # geometric means of each group
    # Every snack in one cluster, every meal in the other.
    assert len(set(labels[: len(SNACKS)])) == 1 and len(set(labels[len(SNACKS):])) == 1
    assert labels[0] != labels[-1]


def test_kmeans_same_seed_same_answer():
    rng = random.Random(7)
    xs = [rng.gauss(0, 1) for _ in range(200)]
    assert kmeans_1d(xs, 3, seed=42) == kmeans_1d(xs, 3, seed=42)


def test_silhouette_matches_the_textbook_formula():
    rng = random.Random(3)
    xs = sorted(rng.gauss(0, 1) for _ in range(60)) + sorted(rng.gauss(5, 1) for _ in range(40))
    labels = [0 if x < 2.5 else 1 for x in xs]
    # Brute force: a = mean distance inside own cluster, b = mean distance to the nearest other cluster.
    scores = []
    for i, x in enumerate(xs):
        own = [abs(x - y) for j, y in enumerate(xs) if labels[j] == labels[i] and j != i]
        other = [abs(x - y) for j, y in enumerate(xs) if labels[j] != labels[i]]
        a, b = sum(own) / len(own), sum(other) / len(other)
        scores.append((b - a) / max(a, b))
    assert math.isclose(silhouette_1d(xs, labels), sum(scores) / len(scores), rel_tol=1e-9)


def test_pick_k_two_habits():
    k, _, _, scores = pick_k(log_z(SNACKS + MEALS), seed=1)
    assert k == 2 and scores[2] > 0.5


def test_pick_k_one_habit_when_no_real_groups():
    # Jeepney and bus fares: one spread-out habit, no clear groups.
    rng = random.Random(5)
    fares = [round(rng.uniform(13, 40)) for _ in range(30)]
    k, _, _, scores = pick_k(log_z(fares), seed=1)
    assert k == 1 and max(scores.values()) < SILHOUETTE_MIN


def test_ordinary_spending_raises_few_false_flags():
    # 300 ordinary purchases with the usual long tail of pricier ones: at most 1% may be flagged.
    rng = random.Random(9)
    items = [(f"t{i}", round(rng.lognormvariate(5, 0.5), 2)) for i in range(300)]
    v = check_category(items, current={i for i, _ in items}, seed=1)
    assert v.k == 1 and len(v.flagged) <= 3


def test_pick_k_never_tries_more_than_n_over_3():
    _, _, _, scores = pick_k(log_z(SNACKS[:10]), seed=1)
    assert set(scores) == {2, 3}  # 10 expenses: k = 2 and 3 are tried


def test_two_habits_and_an_outlier_in_few_expenses():
    # 13 purchases: snacks, a few meals, one ₱4,500 dinner. Three groups; the meals are a habit, not unusual.
    items = history([85, 95, 100, 105, 110, 115, 120, 380, 400, 420, 450, 4500, 130])
    v = check_category(items, current={i for i, _ in items}, seed=1)
    assert v.flagged == {"t11"} and v.usual == (85, 450)


def history(amounts):
    return [(f"t{i}", a) for i, a in enumerate(amounts)]


def test_flags_a_big_dinner_not_a_normal_snack():
    items = history(SNACKS + MEALS + [4500, 130])
    v = check_category(items, current={"t17", "t18"}, seed=1)
    assert v.method == "kmeans"
    assert v.flagged == {"t17"}  # the ₱4,500; the ₱130 is a normal snack
    assert v.usual == (85, 450)


def test_only_this_months_expenses_are_flagged():
    items = history(SNACKS + MEALS + [4500])
    assert check_category(items, current={"t0"}, seed=1).flagged == set()


def test_simple_rule_under_10_expenses():
    items = history([120, 150, 100, 130, 900])
    v = check_category(items, current={"t3", "t4"}, seed=1)
    assert v.method == "simple" and v.flagged == {"t4"}  # ₱900 is over 3 x the next highest, ₱150
    assert v.usual == (100, 150)


def test_simple_rule_leaves_a_second_habit_alone():
    # 8 expenses, snacks and meals: too few to tell a second habit from an outlier, so meals aren't flagged
    # (3 x the ₱115 median would flag every meal).
    items = history([85, 105, 120, 420, 95, 110, 380, 450])
    assert check_category(items, current={i for i, _ in items}, seed=1).flagged == set()


def test_too_few_expenses_are_not_checked():
    v = check_category(history([150, 5000]), current={"t1"}, seed=1)
    assert v.method == "none" and v.flagged == set()


def test_same_amount_every_time_is_never_unusual():
    v = check_category(history([50] * 20), current={"t19"}, seed=1)
    assert v.flagged == set()


def test_several_big_purchases_dont_hide_each_other():
    # One habit of groceries plus four planted big ones: they mustn't stretch the yardstick they're judged by.
    rng = random.Random(4)
    normal = [round(rng.lognormvariate(math.log(850), 0.3), 2) for _ in range(24)]
    big = [max(normal) * m for m in (2, 4, 8)]
    items = history(normal + big)
    v = check_category(items, current={i for i, _ in items}, seed=1)
    assert v.flagged == {"t24", "t25", "t26"}


def test_a_small_purchase_is_never_unusual():
    items = history(SNACKS + MEALS + [5])
    assert check_category(items, current={"t17"}, seed=1).flagged == set()


def test_a_little_more_than_usual_is_not_unusual():
    # ₱52 among ₱50s: barely different; never flagged, however tight the habit.
    items = history([50] * 19 + [52])
    assert check_category(items, current={"t19"}, seed=1).flagged == set()


def test_fast_enough_for_a_busy_user():
    # 2,000 expenses over 8 categories, scored like one request.
    rng = random.Random(11)
    cats = [[(f"c{c}-{i}", round(rng.lognormvariate(5 + c * 0.3, 0.6), 2)) for i in range(250)] for c in range(8)]
    start = time.perf_counter()
    for c, items in enumerate(cats):
        check_category(items, current={i for i, _ in items[-40:]}, seed=c)
    assert time.perf_counter() - start < 0.1


def test_davies_bouldin_and_calinski_harabasz_by_hand():
    # Two clusters, {0, 1} and {10, 11}: centres 0.5 and 10.5, spread 0.5 each, 10 apart.
    from paper_anomalies import calinski_harabasz_1d, davies_bouldin_1d
    xs, labels = [0, 1, 10, 11], [0, 0, 1, 1]
    assert math.isclose(davies_bouldin_1d(xs, labels), (0.5 + 0.5) / 10)  # lower is better
    # Between 2 x 5^2 + 2 x 5^2 = 100 over k - 1 = 1; within 4 x 0.5^2 = 1 over n - k = 2.
    assert math.isclose(calinski_harabasz_1d(xs, labels), 200)  # higher is better


def test_gap_statistic_finds_two_habits():
    from paper_anomalies import gap_k
    assert gap_k(log_z(SNACKS + MEALS), seed=1) == 2


def test_gap_statistic_says_one_habit_for_one_spread():
    # The textbook test for k = 1 (Tibshirani et al., 2001): no more clustered than random data, so one group.
    from paper_anomalies import gap_k
    # Spending amounts are log-normal; one habit of them is one group. (Its uniform reference reads skew as structure:
    # flat-in-pesos fares come out as k = 2, a known limit the paper reports rather than hides.)
    rng = random.Random(9)
    assert gap_k(log_z([rng.lognormvariate(5, 0.5) for _ in range(100)]), seed=1) == 1
