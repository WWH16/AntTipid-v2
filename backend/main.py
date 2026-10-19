"""AntTipid API. Only receipt scanning is real so far; the frontend mocks everything else."""

import logging

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, UploadFile

load_dotenv()
logging.basicConfig(level=logging.INFO)

from receipts import NotAReceipt, ReceiptScan, ScanFailed, scan_receipt  # noqa: E402  (needs the env loaded)

MAX_PHOTO_BYTES = 8 * 1024 * 1024

app = FastAPI(title="AntTipid API")
api = APIRouter(prefix="/api")


@api.post("/receipts/scan", response_model=ReceiptScan)
async def scan(image: UploadFile) -> ReceiptScan:
    if image.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(415, "Upload a JPEG, PNG or WebP photo.")
    data = await image.read()
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "That photo is too big. Try one under 8 MB.")
    try:
        return await scan_receipt(data, image.content_type)
    except NotAReceipt:
        raise HTTPException(422, "Couldn't find a total on this photo. Try a sharper photo with the total visible.")
    except ScanFailed as e:
        logging.error("scan failed: %s", e)  # e.g. a missing API key, or every model down
        raise HTTPException(502, "Receipt reading is busy right now. Try again in a minute, or type it in.")


app.include_router(api)
