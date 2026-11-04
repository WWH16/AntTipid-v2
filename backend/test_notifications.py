"""Notification checks: the rules, what gets stored, what gets emailed. Never sends real email.

Run with: .venv/Scripts/python test_notifications.py
"""

from notify import budget_state, end_line, runs_out

RUN_OUT = [  # spent, limit, month, today, expected. The same table is in frontend/src/lib/budget.test.ts.
    (6000, 10000, "2026-11", "2026-11-10", "2026-11-17"),
    (1000, 10000, "2026-11", "2026-11-10", None),
    (6000, 10000, "2026-11", "2026-11-04", None),
    (11000, 10000, "2026-11", "2026-11-10", None),
    (0, 10000, "2026-11", "2026-11-10", None),
    (6000, 10000, "2026-10", "2026-11-10", None),
    (3000, 9000, "2026-11", "2026-11-10", None),
    (7000, 10000, "2026-02", "2026-02-14", "2026-02-20"),
]


def test_runs_out_matches_the_screen():
    for spent, limit, month, today_iso, want in RUN_OUT:
        assert runs_out(spent, limit, month, today_iso) == want, (spent, limit, month, today_iso)


def test_budget_state():
    for spent, want in ((799.99, "ok"), (800, "near"), (999.996, "used"), (1000, "used"), (1000.01, "over")):
        assert budget_state(spent, 1000, 80) == want, spent


def test_end_line():
    assert end_line(1000, 800) == "You stayed ₱200 under your ₱1,000 monthly budget."
    assert end_line(1000, 1200) == "You went ₱200 over your ₱1,000 monthly budget."
    assert end_line(1000, 1000) == "You used your whole ₱1,000 monthly budget."


if __name__ == "__main__":
    for name, test in list(globals().items()):
        if name.startswith("test_"):
            test()
    print("All notification checks passed")
