import os
import json
import re
import math
import asyncio
import tempfile
import logging
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Request
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Any, Dict
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Load environment variables from .env file
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

from services.ocr import get_ocr_service
from services.cloudinary import upload_to_cloudinary
from services.firebase import (
    save_bill,
    get_bill,
    update_bill_expected_users,
    get_selections_count,
    is_all_submitted,
    calculate_split,
    cleanup_expired,
    create_user,
    save_selection,
    get_selections,
    TAX_ITEM_TYPES,
)

MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10MB
MAX_JSON_SIZE = 64 * 1024  # 64KB
BILL_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{20,}$")
MAX_ITEM_NAME_LENGTH = int(os.environ.get("MAX_ITEM_NAME_LENGTH", "200"))
MAX_ITEM_ABS_PRICE = float(os.environ.get("MAX_ITEM_ABS_PRICE", "1000000"))
MAX_BILL_TOTAL = float(os.environ.get("MAX_BILL_TOTAL", "10000000"))

limiter = Limiter(key_func=get_remote_address)

app = FastAPI()
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded. Try again later."},
    )


def _extract_bill_id_from_path(path: str) -> str | None:
    parts = [part for part in path.split("/") if part]
    if len(parts) >= 3 and parts[0] == "api" and parts[1] == "bill":
        return parts[2]
    return None

# ──────────────────────────────────────────────
# Security Middleware
# ──────────────────────────────────────────────

MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10MB
MAX_JSON_SIZE = 64 * 1024  # 64KB
BILL_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{20,}$")


class BillApiExceptionMiddleware(BaseHTTPMiddleware):
    """Return JSON for unexpected /api/bill/* failures instead of plain text."""

    async def dispatch(self, request, call_next):
        try:
            return await call_next(request)
        except HTTPException:
            raise
        except Exception:
            if request.url.path.startswith("/api/bill/"):
                logger.exception(
                    "Unexpected bill API error",
                    extra={
                        "path": request.url.path,
                        "bill_id": _extract_bill_id_from_path(request.url.path),
                    },
                )
                return JSONResponse(
                    status_code=500,
                    content={"detail": "Failed to load bill. Please try again."},
                )
            raise


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if request.url.path in ("/", "/bill/{bill_id}") or request.url.path.startswith("/bill/"):
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: blob:; "
                "font-src 'self'; "
                "connect-src 'self'; "
                "frame-ancestors 'none'; "
                "base-uri 'self'; "
                "form-action 'self'"
            )
        return response


class BodySizeMiddleware(BaseHTTPMiddleware):
    """Reject oversized JSON request bodies."""

    async def dispatch(self, request, call_next):
        if request.method == "POST":
            content_type = request.headers.get("content-type", "")
            if "application/json" in content_type:
                body = await request.body()
                if len(body) > MAX_JSON_SIZE:
                    return JSONResponse(
                        status_code=413,
                        content={"detail": "Request body too large"},
                    )
        return await call_next(request)


def validate_bill_id(bill_id: str) -> None:
    """Raise 400 if bill_id doesn't look like a valid Firestore document ID."""
    if not BILL_ID_PATTERN.match(bill_id):
        raise HTTPException(status_code=400, detail="Invalid bill ID format")


app.add_middleware(BillApiExceptionMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(BodySizeMiddleware)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        logger.info(f"{request.method} {request.url.path}")
        response = await call_next(request)
        return response


app.add_middleware(RequestLoggingMiddleware)

# CORS middleware - restrictive origins for production
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "").split(",") if os.environ.get("ALLOWED_ORIGINS") else [
    "http://localhost",
    "http://localhost:8081",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


# ──────────────────────────────────────────────
# Request Models
# ──────────────────────────────────────────────

class JoinRequest(BaseModel):
    userName: str = Field(..., min_length=1, max_length=50)
    totalPeople: int = Field(..., ge=1, le=50)


class SelectRequest(BaseModel):
    userId: str = Field(..., min_length=1, max_length=100)
    userName: str = Field(..., min_length=1, max_length=50)
    items: List[int] = Field(default_factory=list, max_length=200)


class SetPeopleRequest(BaseModel):
    totalPeople: int = Field(..., ge=1, le=50)


# ──────────────────────────────────────────────
# Background task tracking
# ──────────────────────────────────────────────

_background_tasks: set[asyncio.Task] = set()


# ──────────────────────────────────────────────
# Item classification
# ──────────────────────────────────────────────

DISCOUNT_KEYWORDS = {"discount", "coupon", "promo", "offer", "bogo", "off"}
TAX_KEYWORDS = {"tax", "cgst", "sgst", "igst", "vat", "gst", "service tax"}
CHARGE_KEYWORDS = {"gratuity", "tip", "service charge", "surcharge"}

SUMMARY_NAMES = {
    "gross amount", "gross total", "grand total", "amount due",
    "total due", "total amount", "total rs.", "total rs", "total",
    "subtotal", "sub total", "sub-total",
    "net total", "net amount", "net rs.", "net rs", "net",
}

TOTAL_PRIORITY = [
    "gross amount", "gross total", "grand total", "amount due",
    "total due", "total amount", "total rs.", "total rs", "total",
    "net total", "net amount", "net rs.", "net rs", "net",
    "subtotal", "sub total", "sub-total",
]


def classify_item_type(name: str) -> str:
    lower_name = name.strip().lower()

    for keyword in DISCOUNT_KEYWORDS:
        if keyword in lower_name:
            return "discount"

    for keyword in TAX_KEYWORDS:
        if keyword in lower_name:
            return "tax"

    for keyword in CHARGE_KEYWORDS:
        if keyword in lower_name:
            return "tax"

    return "item"


def sanitize_ocr_items(raw_items: Any) -> List[Dict[str, Any]]:
    """Enforce item schema and numeric sanity before bill processing/persistence."""
    if not isinstance(raw_items, list):
        return []

    sanitized: List[Dict[str, Any]] = []
    for raw in raw_items:
        if not isinstance(raw, dict):
            continue

        name = str(raw.get("name", "")).strip()
        if not name:
            continue
        if len(name) > MAX_ITEM_NAME_LENGTH:
            name = name[:MAX_ITEM_NAME_LENGTH]

        price_raw = raw.get("price")
        if isinstance(price_raw, (int, float)):
            price = float(price_raw)
        elif isinstance(price_raw, str):
            cleaned = price_raw.strip().replace(",", "")
            if not cleaned:
                continue
            try:
                price = float(cleaned)
            except ValueError:
                continue
        else:
            continue

        if not math.isfinite(price):
            continue
        if abs(price) > MAX_ITEM_ABS_PRICE:
            continue

        sanitized.append({"name": name, "price": round(price, 2)})

    return sanitized


# ──────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────

@app.get("/")
def read_root():
    return FileResponse("index.html")


@app.get("/bill.js")
async def serve_bill_js():
    return FileResponse("bill.js", media_type="application/javascript")


@app.get("/bill/{bill_id}")
def serve_bill_page(bill_id: str):
    validate_bill_id(bill_id)
    data = get_bill(bill_id)
    if not data:
        raise HTTPException(status_code=404, detail="Bill not found or expired")

    bill_html = Path("bill.html").read_text(encoding="utf-8")
    initial_bill_json = json.dumps(data).replace("</", "<\\/")
    return HTMLResponse(
        content=bill_html.replace("__INITIAL_BILL_DATA__", initial_bill_json),
    )


@app.get("/api/bill/{bill_id}")
def get_bill_data(bill_id: str):
    validate_bill_id(bill_id)
    data = get_bill(bill_id)
    if not data:
        raise HTTPException(status_code=404, detail="Bill not found or expired")
    return JSONResponse(content=data)


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.post("/extract-bill")
@limiter.limit("10/minute")
async def extract_bill(request: Request, file: UploadFile = File(...)):
    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    try:
        # Read file in chunks to enforce size limit
        content = b""
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            content += chunk
            if len(content) > MAX_UPLOAD_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail="File too large. Maximum size is 10MB.",
                )

        # Pipeline B: Cloudinary upload (fire-and-forget, parallel to OCR)
        try:
            task = asyncio.create_task(upload_to_cloudinary(content, file.filename or "unknown"))
            _background_tasks.add(task)
            task.add_done_callback(_background_tasks.discard)
        except Exception as e:
            logger.warning(f"Cloudinary upload init failed: {e}")

        # Pipeline A: OCR processing
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=file.filename) as tmp:
                tmp.write(content)
                tmp_path = tmp.name

            ocr_service = get_ocr_service()
            ocr_timeout = float(os.environ.get("OCR_TIMEOUT", 90)) + 10
            ocr_result = await asyncio.wait_for(
                asyncio.to_thread(ocr_service.extract_items, tmp_path),
                timeout=ocr_timeout,
            )
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)

        raw_items = ocr_result.get("items", []) if isinstance(ocr_result, dict) else (ocr_result if isinstance(ocr_result, list) else [])
        items = sanitize_ocr_items(raw_items)
        currency = ocr_result.get("currency", "") if isinstance(ocr_result, dict) else ""
        if not currency:
            currency = "INR"

        total = 0
        filtered_items = []
        summary_items = []

        for item in items:
            name = item.get("name", "").strip()
            name_lower = name.lower()
            item_type = classify_item_type(name)
            item_price = item.get("price", 0) or 0

            is_summary = name_lower in SUMMARY_NAMES

            if is_summary:
                summary_items.append({"name": name_lower, "price": item_price})
            else:
                filtered_items.append(
                    {
                        "name": name,
                        "price": item_price,
                        "type": item_type,
                    }
                )

        for priority_name in TOTAL_PRIORITY:
            for summary in summary_items:
                if summary["name"] == priority_name:
                    total = summary["price"]
                    break
            if total:
                break

        if not total:
            total = sum(i.get("price", 0) or 0 for i in filtered_items)
        if not math.isfinite(total) or abs(total) > MAX_BILL_TOTAL:
            logger.warning("Computed total failed sanity check; falling back to sum(filtered_items)")
            total = sum(i.get("price", 0) or 0 for i in filtered_items)
        total = round(total, 2)

        share_url = ""
        bill_id = ""
        try:
            bill_id = save_bill(
                items=filtered_items,
                currency=currency,
                total=total,
            )
            share_url = f"/bill/{bill_id}"
        except Exception as e:
            logging.error(f"Firebase save failed: {e}")

        return JSONResponse(
            content={
                "success": True,
                "items": filtered_items,
                "currency": currency,
                "total": total,
                "bill_id": bill_id,
                "share_url": share_url,
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Bill splitting endpoints
# ──────────────────────────────────────────────


@app.post("/api/bill/{bill_id}/join")
@limiter.limit("30/minute")
def join_bill(request: Request, bill_id: str, req: JoinRequest):
    validate_bill_id(bill_id)
    bill = get_bill(bill_id)
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found or expired")

    current_expected = bill.get("expectedUsers", 0)
    if current_expected == 0 and req.totalPeople > 0:
        update_bill_expected_users(bill_id, req.totalPeople)

    user_id = create_user(bill_id, req.userName)
    return {"userId": user_id, "userName": req.userName}


@app.post("/api/bill/{bill_id}/select")
@limiter.limit("30/minute")
def submit_selection(request: Request, bill_id: str, req: SelectRequest):
    validate_bill_id(bill_id)
    bill = get_bill(bill_id)
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found or expired")

    save_selection(bill_id, req.userId, req.userName, req.items)
    return {"success": True}


@app.get("/api/bill/{bill_id}/split")
def get_split(bill_id: str):
    validate_bill_id(bill_id)
    bill = get_bill(bill_id)
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found or expired")

    num_submitted = get_selections_count(bill_id)
    expected_users = bill.get("expectedUsers", 0)

    if not is_all_submitted(bill_id):
        return JSONResponse(
            content={
                "allSubmitted": False,
                "numSubmitted": num_submitted,
                "expectedUsers": expected_users,
            }
        )

    split = calculate_split(bill_id)
    if split is None:
        raise HTTPException(status_code=404, detail="Split calculation failed")

    split["allSubmitted"] = True
    split["numSubmitted"] = num_submitted
    split["expectedUsers"] = expected_users
    return JSONResponse(content=split)


@app.get("/api/bill/{bill_id}/status")
def get_bill_status(bill_id: str):
    """Check how many users have submitted."""
    validate_bill_id(bill_id)
    bill = get_bill(bill_id)
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found or expired")

    num_submitted = get_selections_count(bill_id)
    expected_users = bill.get("expectedUsers", 0)

    return JSONResponse(
        content={
            "numSubmitted": num_submitted,
            "expectedUsers": expected_users,
            "allSubmitted": is_all_submitted(bill_id),
        }
    )


@app.post("/api/bill/{bill_id}/set-people")
def set_expected_people(bill_id: str, data: SetPeopleRequest):
    """Update expected number of people for a bill."""
    validate_bill_id(bill_id)
    bill = get_bill(bill_id)
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found or expired")

    update_bill_expected_users(bill_id, data.totalPeople)

    return {"success": True, "expectedUsers": data.totalPeople}


@app.get("/api/bill/{bill_id}/selections")
def list_selections(bill_id: str):
    validate_bill_id(bill_id)
    bill = get_bill(bill_id)
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found or expired")

    selections = get_selections(bill_id)
    return JSONResponse(content={"selections": selections})


@app.post("/cleanup")
def trigger_cleanup(authorization: str = Header(default="")):
    secret = os.environ.get("CLEANUP_SECRET")
    if secret:
        expected = f"Bearer {secret}"
        if authorization != expected:
            raise HTTPException(status_code=401, detail="Unauthorized")
    count = cleanup_expired()
    return {"deleted": count}
