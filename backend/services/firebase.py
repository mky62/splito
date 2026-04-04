import os
import json
import logging
import uuid
import threading
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import firebase_admin
from firebase_admin import credentials, firestore

logger = logging.getLogger(__name__)

_initialized = False
_init_lock = threading.Lock()
_db_client = None

TAX_ITEM_TYPES = {"tax", "total", "subtotal", "net", "gratuity", "surcharge"}
SPLIT_ACROSS_ALL_TYPES = TAX_ITEM_TYPES | {"discount"}


def _get_db() -> firestore.firestore.Client:
    global _initialized, _db_client
    if not _initialized:
        with _init_lock:
            if not _initialized:
                cred_json = os.environ.get("FIREBASE_CREDENTIALS_JSON")
                if cred_json:
                    cred_dict = json.loads(cred_json)
                    cred = credentials.Certificate(cred_dict)
                else:
                    cred_path = os.environ.get(
                        "FIREBASE_CREDENTIALS",
                        os.path.join(os.path.dirname(__file__), "..", "firebase-credentials.json"),
                    )
                    if not os.path.exists(cred_path):
                        raise FileNotFoundError(
                            f"Firebase credentials not found at {cred_path}. "
                            "Set FIREBASE_CREDENTIALS_JSON env var with the JSON content, "
                            "or set FIREBASE_CREDENTIALS to the file path."
                        )
                    cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred)
                _db_client = firestore.client()
                _initialized = True
    if _db_client is None:
        _db_client = firestore.client()
    return _db_client


def _normalize_utc_datetime(value: Any) -> Any:
    if isinstance(value, datetime) and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def save_bill(
    items: List[Dict[str, Any]],
    currency: str,
    total: float,
    restaurant: str = "",
) -> str:
    db = _get_db()
    now = datetime.now(timezone.utc)

    tax_total = sum(
        item.get("price", 0) or 0
        for item in items
        if item.get("type") in TAX_ITEM_TYPES
    )

    doc_ref = db.collection("bills").document()
    doc_ref.set(
        {
            "items": items,
            "currency": currency,
            "total": total,
            "taxTotal": round(tax_total, 2),
            "restaurant": restaurant,
            "createdAt": now,
            "expiresAt": now + timedelta(hours=4),
        }
    )
    logger.info(f"Saved bill {doc_ref.id}, expires at {now + timedelta(hours=4)}")
    return doc_ref.id


def get_bill(doc_id: str) -> Optional[Dict[str, Any]]:
    db = _get_db()
    doc = db.collection("bills").document(doc_id).get()
    if not doc.exists:
        return None

    data = doc.to_dict()

    expires_at = _normalize_utc_datetime(data.get("expiresAt"))
    if expires_at and datetime.now(timezone.utc) > expires_at:
        db.collection("bills").document(doc_id).delete()
        logger.info(f"Bill {doc_id} expired, deleted")
        return None

    for field in ("createdAt", "expiresAt"):
        value = _normalize_utc_datetime(data.get(field))
        if isinstance(value, datetime):
            data[field] = value.isoformat()

    data["id"] = doc_id
    return data


def delete_bill(doc_id: str) -> bool:
    db = _get_db()
    doc_ref = db.collection("bills").document(doc_id)
    if doc_ref.get().exists:
        doc_ref.delete()
        return True
    return False


def cleanup_expired() -> int:
    db = _get_db()
    now = datetime.now(timezone.utc)
    expired = db.collection("bills").where("expiresAt", "<", now).stream()
    count = 0
    for doc in expired:
        doc.reference.delete()
        count += 1
    if count:
        logger.info(f"Cleaned up {count} expired bills")
    return count


# ──────────────────────────────────────────────
# Selection functions for bill splitting
# ──────────────────────────────────────────────


def create_user(bill_id: str, user_name: str) -> str:
    db = _get_db()
    user_id = str(uuid.uuid4())
    db.collection("bills").document(bill_id).collection("selections").document(user_id).set(
        {
            "userName": user_name,
            "items": [],
            "submittedAt": firestore.SERVER_TIMESTAMP,
        }
    )
    logger.info(f"User {user_name} ({user_id}) joined bill {bill_id}")
    return user_id


def save_selection(bill_id: str, user_id: str, user_name: str, item_indices: List[int]) -> bool:
    db = _get_db()
    doc_ref = db.collection("bills").document(bill_id).collection("selections").document(user_id)
    doc_ref.set(
        {
            "userName": user_name,
            "items": item_indices,
            "submittedAt": firestore.SERVER_TIMESTAMP,
        }
    )
    logger.info(f"Saved selection for {user_name} on bill {bill_id}: {len(item_indices)} items")
    return True


def get_selections(bill_id: str) -> List[Dict[str, Any]]:
    db = _get_db()
    docs = (
        db.collection("bills")
        .document(bill_id)
        .collection("selections")
        .stream()
    )
    selections = []
    for doc in docs:
        data = doc.to_dict()
        data["userId"] = doc.id
        selections.append(data)
    return selections


def get_user_selection(bill_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    db = _get_db()
    doc = (
        db.collection("bills")
        .document(bill_id)
        .collection("selections")
        .document(user_id)
        .get()
    )
    if not doc.exists:
        return None
    data = doc.to_dict()
    data["userId"] = doc.id
    return data


def get_selections_count(bill_id: str) -> int:
    """Get number of users who have submitted selections."""
    db = _get_db()
    docs = (
        db.collection("bills")
        .document(bill_id)
        .collection("selections")
        .stream()
    )
    return sum(1 for doc in docs if doc.to_dict().get("items"))


def update_bill_expected_users(bill_id: str, expected_users: int) -> bool:
    """Set the expected number of users for a bill."""
    db = _get_db()
    doc_ref = db.collection("bills").document(bill_id)
    doc_ref.update({"expectedUsers": expected_users})
    return True


def get_expected_users(bill_id: str) -> int:
    """Get expected number of users for a bill."""
    db = _get_db()
    doc = db.collection("bills").document(bill_id).get()
    if not doc.exists:
        return 0
    return doc.to_dict().get("expectedUsers", 0)


def is_all_submitted(bill_id: str) -> bool:
    """Check if all expected users have submitted."""
    expected = get_expected_users(bill_id)
    if expected <= 0:
        return False
    submitted = get_selections_count(bill_id)
    return submitted >= expected


def _split_cents(total_cents: int, n: int) -> list[int]:
    """Split total_cents into n parts using integer math.

    First (total_cents % n) parts get ceil, rest get floor.
    Deterministic — no floating-point drift.
    """
    if n <= 0:
        return []
    base = total_cents // n
    remainder = total_cents % n
    return [base + 1 if i < remainder else base for i in range(n)]


def calculate_split(bill_id: str) -> Optional[Dict[str, Any]]:
    """Calculate bill split based on selections.

    For regular items: cost is split among users who selected that item.
    For tax/charge/discount items: cost is split equally among ALL users.

    Uses integer-cent arithmetic to prevent rounding drift.

    Returns:
        {
            "users": {userId: {name, total, items: [{name, price, share}]}},
            "items": [{name, price, type, selectors: [{userId, share}]}],
            "total": float,
            "currency": str
        }
    """
    db = _get_db()
    bill_doc = db.collection("bills").document(bill_id).get()
    if not bill_doc.exists:
        return None

    bill_data = bill_doc.to_dict()
    items = bill_data.get("items", [])
    currency = bill_data.get("currency", "")
    tax_total = bill_data.get("taxTotal", 0)

    selections = get_selections(bill_id)
    num_users = len(selections)

    if num_users == 0:
        return {
            "users": {},
            "items": [],
            "total": bill_data.get("total", 0),
            "currency": currency,
            "taxTotal": tax_total,
            "numUsers": 0,
        }

    users = {}
    user_ids_ordered = []
    for sel in selections:
        uid = sel["userId"]
        user_ids_ordered.append(uid)
        users[uid] = {
            "name": sel.get("userName", "Unknown"),
            "total": 0.0,
            "items": [],
        }

    item_splits = []
    for idx, item in enumerate(items):
        item_name = item.get("name", "Unknown")
        item_price = item.get("price", 0) or 0
        item_type = item.get("type", "item")

        if item_type in SPLIT_ACROSS_ALL_TYPES:
            split_item_type = "discount" if item_type == "discount" else "tax"
            total_cents = round(item_price * 100)
            shares_cents = _split_cents(total_cents, num_users)

            selectors = []
            for i, uid in enumerate(user_ids_ordered):
                share = shares_cents[i] / 100.0
                users[uid]["total"] = round(users[uid]["total"] + share, 2)
                users[uid]["items"].append(
                    {
                        "name": item_name,
                        "price": item_price,
                        "share": share,
                        "type": split_item_type,
                    }
                )
                selectors.append({"userId": uid, "share": share})

            base_share = round(item_price / num_users, 2) if num_users > 0 else 0
            item_splits.append(
                {
                    "index": idx,
                    "name": item_name,
                    "price": item_price,
                    "type": split_item_type,
                    "splitAmong": "all",
                    "sharePerUser": base_share,
                    "selectors": selectors,
                }
            )
        else:
            selectors_for_item = []
            for sel in selections:
                if idx in sel.get("items", []):
                    selectors_for_item.append(sel["userId"])

            n_selectors = len(selectors_for_item)
            if n_selectors == 0:
                item_splits.append(
                    {
                        "index": idx,
                        "name": item_name,
                        "price": item_price,
                        "type": "item",
                        "splitAmong": 0,
                        "sharePerUser": 0,
                        "selectors": [],
                    }
                )
                continue

            total_cents = round(item_price * 100)
            shares_cents = _split_cents(total_cents, n_selectors)

            selectors_data = []
            for i, uid in enumerate(selectors_for_item):
                share = shares_cents[i] / 100.0
                users[uid]["total"] = round(users[uid]["total"] + share, 2)
                users[uid]["items"].append(
                    {
                        "name": item_name,
                        "price": item_price,
                        "share": share,
                        "type": "item",
                    }
                )
                selectors_data.append({"userId": uid, "share": share})

            base_share = round(item_price / n_selectors, 2)
            item_splits.append(
                {
                    "index": idx,
                    "name": item_name,
                    "price": item_price,
                    "type": "item",
                    "splitAmong": n_selectors,
                    "sharePerUser": base_share,
                    "selectors": selectors_data,
                }
            )

    for uid in users:
        users[uid]["total"] = round(users[uid]["total"], 2)

    return {
        "users": users,
        "items": item_splits,
        "total": bill_data.get("total", 0),
        "currency": currency,
        "taxTotal": tax_total,
        "numUsers": num_users,
    }
