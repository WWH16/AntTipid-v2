"""Read receipt photos with free vision models on OpenRouter, falling back to Gemini. Nothing is stored."""

import base64
import json
import logging
import os
import re
import time
from datetime import date

import httpx
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

log = logging.getLogger("receipts")

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
# Thinking slows reading (Dots: 3s off vs 26s on) and eats the token budget; each provider turns it down differently.
GEMINI_FAST = {"reasoning_effort": "low"}
OPENROUTER_FAST = {"reasoning": {"enabled": False}}

# Tried in order: OpenRouter's free models first, Gemini if they all fail. A model whose key isn't set is skipped.
# Benchmarked on a real SM receipt (2026-10-19): Dots read every field right in ~3-4s; Nemotron got amounts
# right but sometimes missed the date; Gemini Flash-Lite read every field right in ~2s.
# ponytail: model names change; when all fail, check https://openrouter.ai/models?q=free (image input)
# and https://aistudio.google.com for current ones.
MODELS = [
    (OPENROUTER_URL, "OPENROUTER_API_KEY", "dots-studio/dots-3-note-preview:free", OPENROUTER_FAST),
    (OPENROUTER_URL, "OPENROUTER_API_KEY", "nvidia/nemotron-3.5-super-vl:free", OPENROUTER_FAST),
    # Each has its own free-tier quota, so one still answers when the other is rate-limited.
    (GEMINI_URL, "GEMINI_API_KEY", "gemini-3.5-flash-lite", GEMINI_FAST),
    (GEMINI_URL, "GEMINI_API_KEY", "gemini-3.8-flash", GEMINI_FAST),
]
# A free model sometimes hangs instead of failing; don't let one stall the whole scan.
PER_MODEL_TIMEOUT_S = 25

WALLET_TYPES = ["cash", "e_wallet", "bank", "credit_card", "savings"]
# ponytail: mirrors the frontend's default expense categories; read the user's own from the DB once it exists.
CATEGORIES = {
    "food": "Food & dining",
    "groceries": "Groceries",
    "transport": "Transport",
    "bills": "Bills & utilities",
    "load": "Load & internet",
    "shopping": "Shopping",
    "health": "Health",
    "fun": "Going out",
}

PROMPT = f"""Read this Philippine receipt photo (amounts in PHP). Reply with JSON only:
{{
  "merchant": store name,
  "date": purchase date as "YYYY-MM-DD", often printed next to the time near the bottom. Ignore permit dates (DATE ISSUED, PTU, accreditation). Short dates are usually DD/MM/YY. null only if no purchase date is printed,
  "total": amount paid, as a number,
  "items": [{{ "name": string, "qty": number, "price": unit price as a number }}]. Skip subtotal, VAT, discount, change, payment and reference lines,
  "categoryId": one of {", ".join(f'"{k}" ({v})' for k, v in CATEGORIES.items())}, or null,
  "paymentMethod": one of {", ".join(f'"{t}"' for t in WALLET_TYPES)}, or null if not printed,
  "paymentLabel": payment provider as printed, e.g. "GCash", "Maya", "VISA", "Cash", or null
}}
If the image is not a receipt, reply {{"total": 0}}."""


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ReceiptItem(CamelModel):
    name: str
    qty: float
    price: float


class ReceiptScan(CamelModel):
    """Mirrors ReceiptScan in frontend/src/types.ts."""

    merchant: str
    date: str
    total: float
    items: list[ReceiptItem]
    suggested_category_id: str | None = None
    payment_method: str | None = None
    payment_label: str | None = None
    low_confidence: bool = False


class NotAReceipt(ValueError):
    """The model answered, but found no total: a bad photo, not a model failure."""


class ScanFailed(RuntimeError):
    """No model gave a usable answer."""


async def _ask_model(client: httpx.AsyncClient, url: str, api_key: str, model: str, fast: dict, image_url: str) -> dict:
    """Ask one model. Raises on HTTP errors, timeouts, empty or non-JSON replies so the caller moves on."""
    res = await client.post(url, headers={"Authorization": f"Bearer {api_key}"}, json={
        "model": model,
        **fast,
        # Room for a long receipt plus any thinking left on; also stops OpenRouter reserving credit
        # for the model's max output (402 on a low balance).
        "max_tokens": 2000,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": PROMPT},
            {"type": "image_url", "image_url": {"url": image_url}},
        ]}],
    })
    if res.is_error:
        raise ScanFailed(f"{model}: HTTP {res.status_code} {res.text[:200]}")
    body = res.json()
    if "error" in body:  # OpenRouter reports upstream failures inside a 200
        raise ScanFailed(f"{model}: {body['error']}")
    content = body["choices"][0]["message"]["content"] or ""
    # Some models wrap JSON in a ```json fence.
    raw = json.loads(re.sub(r"^\s*```(?:json)?|```\s*$", "", content))
    if not isinstance(raw, dict):
        raise ScanFailed(f"{model}: reply was not a JSON object")
    return raw


async def scan_receipt(image: bytes, content_type: str) -> ReceiptScan:
    models = [(url, os.environ[key], model, fast) for url, key, model, fast in MODELS if os.environ.get(key)]
    if not models:
        raise ScanFailed("Set GEMINI_API_KEY or OPENROUTER_API_KEY (see backend/.env.example)")
    image_url = f"data:{content_type};base64,{base64.b64encode(image).decode()}"
    errors = []
    async with httpx.AsyncClient(timeout=PER_MODEL_TIMEOUT_S) as client:
        for url, api_key, model, fast in models:
            start = time.perf_counter()
            try:
                raw = await _ask_model(client, url, api_key, model, fast, image_url)
            except (httpx.HTTPError, ScanFailed, ValueError, KeyError, IndexError, TypeError) as e:
                errors.append(f"{e!r}")
                log.warning("scan: %s failed after %.1fs: %r", model, time.perf_counter() - start, e)
                continue
            log.info("scan: %s answered in %.1fs", model, time.perf_counter() - start)
            # A clean answer that isn't a receipt is final, not a reason to ask the next model.
            return normalize_scan(raw)
    raise ScanFailed("; ".join(errors))


def _num(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def normalize_scan(raw: dict) -> ReceiptScan:
    """Model output is untrusted: coerce types, drop unknown categories, flag totals the items don't add up to."""
    total = _num(raw.get("total"))
    if not total > 0:
        raise NotAReceipt("no total found")
    items = [
        ReceiptItem(name=str(i.get("name") or "").strip(), qty=_num(i.get("qty"), 1) or 1, price=_num(i.get("price")))
        for i in raw.get("items") or []
        if isinstance(i, dict)
    ]
    items = [i for i in items if i.name and i.price > 0]
    day = raw.get("date")
    label = raw.get("paymentLabel")
    return ReceiptScan(
        merchant=str(raw.get("merchant") or "").strip() or "Receipt",
        date=day if isinstance(day, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", day) else date.today().isoformat(),
        total=total,
        items=items,
        suggested_category_id=raw.get("categoryId") if raw.get("categoryId") in CATEGORIES else None,
        payment_method=raw.get("paymentMethod") if raw.get("paymentMethod") in WALLET_TYPES else None,
        payment_label=label.strip() if isinstance(label, str) and label.strip() else None,
        # A misread digit (or an unlisted discount) shows up as items not adding up to the total.
        low_confidence=bool(items) and abs(sum(i.qty * i.price for i in items) - total) > 0.05,
    )
