"""Evaluation for the paper (DSS feature 9): K-means vs the plain 3x median rule on planted unusual purchases.

Each category's real amounts are taken as normal. One unusual purchase at a time is planted at 1.5x, 2x, 4x or 8x its
highest amount (one per run, as in a real month), and both methods score everything: precision (of what's flagged, how
much was planted) and recall (of what was planted, how much was flagged), overall and by size. Also writes each category's elbow (inertia by k) and silhouette by k.

Run with:
  .venv/Scripts/python paper_anomalies.py                       # a seeded sample user
  .venv/Scripts/python paper_anomalies.py --user <auth user id> # a real user's last 6 months (needs DATABASE_URL)
Writes docs/kmeans-evaluation.html.
"""

import argparse
import html
import math
import random
from pathlib import Path
from statistics import median

from anomalies import MAX_K, MIN_KMEANS, SILHOUETTE_MIN, check_category, kmeans_1d, pick_k

PLANTS = (1.5, 2, 4, 8)
BLUE, ORANGE = "#2a78d6", "#eb6834"  # dataviz reference palette slots 1 and 2, validated on the light surface


def _clusters(xs, labels):
    groups: dict[int, list[float]] = {}
    for x, l in zip(xs, labels):
        groups.setdefault(l, []).append(x)
    return {l: (g, sum(g) / len(g)) for l, g in groups.items()}


def davies_bouldin_1d(xs, labels) -> float:
    """Davies-Bouldin index (lower is better): for each cluster, the worst ratio of the two clusters' spreads (mean
    distance to their centre) to the distance between their centres, averaged over clusters."""
    cl = _clusters(xs, labels)
    spread = {l: sum(abs(x - c) for x in g) / len(g) for l, (g, c) in cl.items()}
    return sum(max((spread[i] + spread[j]) / abs(cl[i][1] - cl[j][1]) for j in cl if j != i) for i in cl) / len(cl)


def calinski_harabasz_1d(xs, labels) -> float:
    """Calinski-Harabasz index (higher is better): spread between centres over spread within clusters, each per
    degree of freedom: (B / (k - 1)) / (W / (n - k))."""
    cl, n = _clusters(xs, labels), len(xs)
    mean = sum(xs) / n
    between = sum(len(g) * (c - mean) ** 2 for g, c in cl.values())
    within = sum((x - c) ** 2 for g, c in cl.values() for x in g)
    return (between / (len(cl) - 1)) / (within / (n - len(cl))) if within else math.inf


def gap_k(zs: list[float], seed: int, refs: int = 20) -> int:
    """The gap statistic's k (Tibshirani, Walther & Hastie, 2001), the textbook test that can answer k = 1: compare
    log(inertia) with that of uniform random data over the same range; take the smallest k whose gap is at least the
    next k's gap minus its standard error. Paper only: it fits K-means on `refs` random sets per k, too slow per request."""
    rng = random.Random(seed)
    lo, hi = min(zs), max(zs)
    ks = range(1, min(MAX_K, len(zs) // 3) + 2)  # one past the app's range, to test its last k
    gaps, errs = {}, {}
    for k in ks:
        ref_logs = [math.log(kmeans_1d([rng.uniform(lo, hi) for _ in zs], k, seed)[2] or 1e-12) for _ in range(refs)]
        mean = sum(ref_logs) / refs
        gaps[k] = mean - math.log(kmeans_1d(zs, k, seed)[2] or 1e-12)
        errs[k] = (sum((x - mean) ** 2 for x in ref_logs) / refs) ** 0.5 * (1 + 1 / refs) ** 0.5
    return next((k for k in ks[:-1] if gaps[k] >= gaps[k + 1] - errs[k + 1]), ks[-2])


def sample_user() -> dict[str, list[float]]:
    rng = random.Random(2026)
    def lognorm(n, around, spread):
        return [round(rng.lognormvariate(math.log(around), spread), 2) for _ in range(n)]
    return {
        "Food & dining": lognorm(70, 110, 0.25) + lognorm(30, 400, 0.15),  # snacks and meals
        "Transport": [float(rng.choice([13, 15, 20, 25, 30, 40])) for _ in range(90)],
        "Groceries": lognorm(24, 850, 0.3),
        "Load & internet": [99.0] * 10 + [299.0] * 6,
        "Shopping": lognorm(12, 600, 0.6),
        "Health": lognorm(6, 300, 0.4),
    }


def real_user(user_id: str) -> dict[str, list[float]]:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).with_name(".env"))
    from db import connect
    with connect() as conn:
        rows = conn.execute(
            """
            select c.name, t.amount from transactions t join categories c on c.id = t.category_id and not c.once_a_month
            where t.user_id = %s and t.kind = 'expense' and t.date >= date_trunc('month', now()) - interval '5 months'
            """,
            (user_id,),
        ).fetchall()
    out: dict[str, list[float]] = {}
    for r in rows:
        out.setdefault(r["name"], []).append(float(r["amount"]))
    return out


def evaluate(data: dict[str, list[float]]):
    rows = []
    counts = {"kmeans": [0, 0, 0], "median": [0, 0, 0]}  # true positives, flagged, planted
    by_size = {m: {"kmeans": 0, "median": 0, "runs": 0} for m in PLANTS}
    for seed, (name, amounts) in enumerate(sorted(data.items())):
        if len(amounts) < 3:
            continue
        hits = {"kmeans": 0, "median": 0}
        false = {"kmeans": 0, "median": 0}
        for m in PLANTS:
            items = [(f"r{i}", a) for i, a in enumerate(amounts)] + [("planted", round(max(amounts) * m, 2))]
            v = check_category(items, {i for i, _ in items}, seed)
            cut = 3 * median(a for _, a in items)
            for method, flagged in (("kmeans", v.flagged), ("median", {i for i, a in items if a > cut})):
                caught = "planted" in flagged
                counts[method][0] += caught
                counts[method][1] += len(flagged)
                counts[method][2] += 1
                by_size[m][method] += caught
                hits[method] += caught
                false[method] += len(flagged) - caught
            by_size[m]["runs"] += 1
        # Elbow and silhouette on the real amounts only: the habits, before anything is planted.
        logs = [math.log(a) for a in amounts]
        mean = sum(logs) / len(logs)
        std = (sum((x - mean) ** 2 for x in logs) / len(logs)) ** 0.5 or 1
        zs = [(x - mean) / std for x in logs]
        inertia = {k: kmeans_1d(zs, k, seed)[2] for k in range(1, MAX_K + 1) if k <= len(set(zs))}
        k, _, _, sil = pick_k(zs, seed) if len(zs) >= MIN_KMEANS else (0, None, None, {})
        gap = gap_k(zs, seed) if len(zs) >= MIN_KMEANS else 0
        db, ch = {}, {}
        for kk in sil:  # the same candidate k the app scores by silhouette
            labels = kmeans_1d(zs, kk, seed)[1]
            db[kk], ch[kk] = davies_bouldin_1d(zs, labels), calinski_harabasz_1d(zs, labels)
        method = "kmeans" if len(amounts) + 1 >= MIN_KMEANS else "simple"
        rows.append({"name": name, "n": len(amounts), "method": method, "k": k, "gap": gap, "sil": sil, "db": db, "ch": ch, "inertia": inertia,
                     "kmeans_hits": hits["kmeans"], "kmeans_false": false["kmeans"],
                     "median_hits": hits["median"], "median_false": false["median"]})
    scores = {}
    for method, (tp, flagged, planted) in counts.items():
        p = tp / flagged if flagged else 0.0
        r = tp / planted if planted else 0.0
        scores[method] = {"precision": p, "recall": r, "f1": 2 * p * r / (p + r) if p + r else 0.0}
    return rows, scores, by_size


def svg_bars(scores) -> str:
    """Precision, recall and F1, K-means beside the median rule; values labelled, one shared 0 to 1 axis."""
    w, h, left, top, bottom = 560, 240, 48, 16, 40
    plot_h = h - top - bottom
    groups = ("precision", "recall", "f1")
    gw = (w - left - 16) / len(groups)
    out = [f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="Precision, recall and F1 for K-means and the 3x median rule">']
    for t in (0, 0.5, 1):
        y = top + plot_h * (1 - t)
        out.append(f'<line x1="{left}" x2="{w - 16}" y1="{y}" y2="{y}" stroke="#e4e3df" stroke-width="1"/>')
        out.append(f'<text x="{left - 8}" y="{y + 4}" text-anchor="end" class="axis">{t:.1f}</text>')
    for gi, g in enumerate(groups):
        x0 = left + gi * gw + gw / 2 - 46
        for si, (method, color) in enumerate((("kmeans", BLUE), ("median", ORANGE))):
            v = scores[method][g]
            bh = max(plot_h * v, 1)
            x = x0 + si * 48  # 44px bar + 4px surface gap
            y = top + plot_h - bh
            label = "K-means" if method == "kmeans" else "3x median"
            out.append(f'<path d="M{x},{top + plot_h} V{y + 4} Q{x},{y} {x + 4},{y} H{x + 40} Q{x + 44},{y} {x + 44},{y + 4} V{top + plot_h} Z" fill="{color}"><title>{label} {g}: {v:.2f}</title></path>')
            out.append(f'<text x="{x + 22}" y="{y - 6}" text-anchor="middle" class="value">{v:.2f}</text>')
        out.append(f'<text x="{left + gi * gw + gw / 2}" y="{h - 14}" text-anchor="middle" class="axis">{g.upper() if g == "f1" else g.capitalize()}</text>')
    out.append("</svg>")
    return "".join(out)


def svg_elbow(row) -> str:
    """One category's inertia by k: the elbow. A single series, so the heading names it; no legend."""
    w, h, left, top, bottom = 220, 140, 40, 12, 28
    ks = sorted(row["inertia"])
    hi = max(row["inertia"].values()) or 1
    xs = {k: left + (k - 1) * (w - left - 16) / max(MAX_K - 1, 1) for k in ks}
    ys = {k: top + (h - top - bottom) * (1 - row["inertia"][k] / hi) for k in ks}
    out = [f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="Inertia by k for {html.escape(row["name"])}">']
    out.append(f'<line x1="{left}" x2="{w - 16}" y1="{h - bottom}" y2="{h - bottom}" stroke="#e4e3df"/>')
    out.append(f'<polyline points="{" ".join(f"{xs[k]},{ys[k]}" for k in ks)}" fill="none" stroke="{BLUE}" stroke-width="2"/>')
    for k in ks:
        out.append(f'<circle cx="{xs[k]}" cy="{ys[k]}" r="4" fill="{BLUE}" stroke="#fcfcfb" stroke-width="2"><title>k = {k}: inertia {row["inertia"][k]:.1f}</title></circle>')
        out.append(f'<text x="{xs[k]}" y="{h - 10}" text-anchor="middle" class="axis">{k}</text>')
    out.append("</svg>")
    return "".join(out)


def by_k(values: dict, digits: int = 2) -> str:
    # Infinite when every cluster is a single repeated amount (no spread within): shown as ∞.
    return " · ".join(f"k={k}: {'∞' if math.isinf(v) else f'{v:.{digits}f}'}" for k, v in sorted(values.items())) or "—"


def page(rows, scores, by_size, source: str) -> str:
    table = "".join(
        f"<tr><td>{html.escape(r['name'])}</td><td>{r['n']}</td><td>{'K-means' if r['method'] == 'kmeans' else 'Simple rule' if r['method'] == 'simple' else 'Not checked'}</td>"
        f"<td>{r['k'] or '—'}</td><td>{r['gap'] or '—'}</td><td>{by_k(r['sil'])}</td><td>{by_k(r['db'])}</td><td>{by_k(r['ch'], 0)}</td>"
        f"<td>{r['kmeans_hits']}/{len(PLANTS)} · {r['kmeans_false']} false</td><td>{r['median_hits']}/{len(PLANTS)} · {r['median_false']} false</td></tr>"
        for r in rows
    )
    elbows = "".join(f"<figure><figcaption>{html.escape(r['name'])}, k = {r['k'] or '—'}</figcaption>{svg_elbow(r)}</figure>" for r in rows if r["n"] >= MIN_KMEANS)
    s = scores
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>K-means evaluation</title>
<style>
  body {{ font: 15px/1.6 system-ui, sans-serif; color: #0b0b0b; background: #fcfcfb; margin: 0 auto; max-width: 960px; padding: 32px 16px; }}
  h1 {{ font-size: 1.6rem; margin: 0 0 4px; }} h2 {{ font-size: 1.1rem; margin: 32px 0 8px; }}
  p {{ max-width: 70ch; color: #52514e; }}
  .legend {{ display: flex; gap: 16px; font-size: 13px; color: #52514e; }} .legend i {{ display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }}
  svg {{ width: 100%; max-width: 560px; height: auto; }} .elbows svg {{ max-width: 260px; }} .axis {{ font-size: 11px; fill: #52514e; }} .value {{ font-size: 12px; fill: #0b0b0b; font-variant-numeric: tabular-nums; }}
  .elbows {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }} figure {{ margin: 0; }} figcaption {{ font-size: 13px; color: #52514e; }}
  table {{ border-collapse: collapse; width: 100%; font-size: 13px; font-variant-numeric: tabular-nums; }} th, td {{ text-align: left; padding: 6px 8px; border-bottom: 1px solid #e4e3df; }}
  .wrap {{ overflow-x: auto; }}
</style></head><body>
<h1>Unusual purchases: K-means vs the 3x median rule</h1>
<p>Data: {html.escape(source)}. Each category's real amounts count as normal; one unusual purchase at a time is planted per category, at {', '.join(f'{m}x' for m in PLANTS)} its highest amount.
K-means uses log(amount), k by silhouette (2 to 4, under {SILHOUETTE_MIN} means one habit), k-means++ with 5 restarts; under {MIN_KMEANS} expenses the app uses its simple rule instead.</p>
<h2>Precision, recall and F1</h2>
<div class="legend"><span><i style="background:{BLUE}"></i>K-means (the app)</span><span><i style="background:{ORANGE}"></i>3x median rule (baseline)</span></div>
{svg_bars(s)}
<p>K-means: precision {s['kmeans']['precision']:.2f}, recall {s['kmeans']['recall']:.2f}, F1 {s['kmeans']['f1']:.2f}.
3x median: precision {s['median']['precision']:.2f}, recall {s['median']['recall']:.2f}, F1 {s['median']['f1']:.2f}.</p>
<h2>Recall by size of the unusual purchase</h2>
<div class="wrap"><table><thead><tr><th>Planted at</th><th>K-means caught</th><th>3x median caught</th></tr></thead><tbody>{''.join(f"<tr><td>{m}x the highest</td><td>{b['kmeans']}/{b['runs']}</td><td>{b['median']}/{b['runs']}</td></tr>" for m, b in by_size.items())}</tbody></table></div>
<h2>Elbow: inertia by k</h2>
<p>Inertia always falls as k grows; the bend is where more clusters stop helping. The app picks k by silhouette; Davies–Bouldin and Calinski–Harabasz in the table are the other two standard checks of the same clustering, for comparison only.</p>
<div class="elbows">{elbows}</div>
<h2>Choosing k: the app's rule vs the gap statistic</h2>
<p>The app picks k by the highest silhouette and calls it one habit (k = 1) below {SILHOUETTE_MIN}, since silhouette can't
score k = 1. The gap statistic (Tibshirani, Walther &amp; Hastie, 2001) is the textbook test that can: it compares the
clustering with uniform random data. They agree on {sum(r['k'] == r['gap'] for r in rows if r['k'])} of {sum(1 for r in rows if r['k'])} categories.
Where they differ, look at the amounts: exact repeats (fixed fares like ₱13, ₱15, ₱20) score high on silhouette as
separate groups, while the gap statistic sees no more structure than random; and the gap statistic's uniform reference
can read a skewed single habit as two groups. The flags are what matter: see each category's false flags below.</p>
<h2>Per category</h2>
<div class="wrap"><table><thead><tr><th>Category</th><th>Expenses</th><th>App method</th><th>k picked (app)</th><th>Gap statistic k</th><th>Silhouette by k (higher is better)</th><th>Davies–Bouldin by k (lower)</th><th>Calinski–Harabasz by k (higher)</th><th>K-means caught</th><th>3x median caught</th></tr></thead><tbody>{table}</tbody></table></div>
</body></html>"""


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--user", help="auth user id to evaluate on real data (default: a seeded sample user)")
    args = parser.parse_args()
    data = real_user(args.user) if args.user else sample_user()
    rows, scores, by_size = evaluate(data)
    out = Path(__file__).resolve().parent.parent / "docs" / "kmeans-evaluation.html"
    out.write_text(page(rows, scores, by_size, f"user {args.user}, last 6 months" if args.user else "a seeded sample user"), encoding="utf-8")
    for method, sc in scores.items():
        print(f"{method:7} precision {sc['precision']:.2f}  recall {sc['recall']:.2f}  F1 {sc['f1']:.2f}")
    for m, b in by_size.items():
        print(f"{m}x the highest: K-means {b['kmeans']}/{b['runs']}  3x median {b['median']}/{b['runs']}")
    print(f"wrote {out}")
