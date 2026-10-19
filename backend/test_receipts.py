"""Checks the untrusted-model-output handling. Run with: .venv/Scripts/python test_receipts.py
The model call itself is verified by scanning a receipt in the app."""

from datetime import date

from receipts import NotAReceipt, normalize_scan

# Well-formed reply: items add up, camelCase JSON out
sm = normalize_scan({
    "merchant": "SM Supermarket", "date": "2026-08-19", "total": 209.2, "categoryId": "groceries",
    "paymentMethod": "e_wallet", "paymentLabel": "GCash",
    "items": [{"name": "EcoBag", "qty": 1, "price": 5}, {"name": "Cheese Buns", "qty": 1, "price": 57.25},
              {"name": "Sbrit Heavy Duty", "qty": 1, "price": 69}, {"name": "Croley Butter Cream", "qty": 1, "price": 77.95}],
})
assert sm.low_confidence is False
out = sm.model_dump(by_alias=True)
assert out["suggestedCategoryId"] == "groceries" and out["paymentLabel"] == "GCash" and out["lowConfidence"] is False

# Sloppy reply: string numbers, unknown category, bad date, bad payment type, junk items, items not adding up
sloppy = normalize_scan({
    "merchant": "  ", "date": "19/08/26", "total": "208.20", "categoryId": "snacks", "paymentMethod": "gcash",
    "items": [{"name": "Rice", "qty": "2", "price": "50"}, {"name": "", "price": 10}, {"name": "Free bag", "price": 0}, "junk"],
})
assert (sloppy.merchant, sloppy.date, sloppy.total) == ("Receipt", date.today().isoformat(), 208.2)
assert [(i.name, i.qty, i.price) for i in sloppy.items] == [("Rice", 2, 50)]
assert (sloppy.suggested_category_id, sloppy.payment_method, sloppy.low_confidence) == (None, None, True)

# Not a receipt
for reply in ({"total": 0}, {}, {"total": "abc"}):
    try:
        normalize_scan(reply)
        raise AssertionError(f"expected NotAReceipt for {reply}")
    except NotAReceipt:
        pass

print("Receipt scan self-checks passed")
