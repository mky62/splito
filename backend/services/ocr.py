import os
import base64
import json
import re
import math
import logging
from typing import List, Dict, Any, Optional
from huggingface_hub import InferenceClient

logger = logging.getLogger(__name__)

OCR_MODEL = os.environ.get("OCR_MODEL", "google/gemma-4-31B-it:novita")
OCR_MAX_ABS_ITEM_PRICE = float(os.environ.get("OCR_MAX_ABS_ITEM_PRICE", "1000000"))

EXTRACTION_SYSTEM = (
    "You are a receipt OCR engine. Output only valid JSON. "
    "Never explain or add commentary."
)

EXTRACTION_USER = (
    "Read every line item on this receipt. For each item, extract the name and price.\n\n"
    "CRITICAL PRICE RULES:\n"
    "- Read numbers EXACTLY as they appear. Do NOT drop trailing zeros.\n"
    "- '600' means six hundred (600.00), NOT sixty (60.00)\n"
    "- '100' means one hundred (100.00), NOT ten (10.00)\n"
    "- The quantity column (QTY) shows how many were ordered - extract the AMOUNT column (total), not the Rate\n"
    "- Only fix OCR letter-in-number errors: O→0, l→1, S→5, B→8\n"
    "- Do NOT guess decimal placement. Use the exact number shown.\n\n"
    "IMPORTANT - WHAT TO EXTRACT:\n"
    "- Extract ALL individual line items (food, drinks, services)\n"
    "- Extract ALL taxes (VAT, GST, CGST, SGST, Service Tax, etc.)\n"
    "- Extract tips/gratuity if present\n"
    "\n"
    "CRITICAL - DISCOUNTS:\n"
    "- ALWAYS extract discounts, coupons, offers, and promotions\n"
    "- Discounts MUST be negative values\n"
    "- If bill shows 'Discount 50%: 475', extract as {\"name\":\"Discount 50%\",\"price\":-475}\n"
    "- If bill shows 'Coupon: -100', extract as {\"name\":\"Coupon\",\"price\":-100}\n"
    "- Common discount patterns: 'Discount', 'Offer', 'Coupon', 'Promo', '% off', 'BOGO'\n"
    "\n"
    "IMPORTANT - WHAT TO EXCLUDE:\n"
    "- Do NOT extract summary rows like: Sub Total, Gross Amount, Grand Total, Net Amount\n"
    "- These are calculated summaries, not actual bill items\n"
    "- Examples of lines to SKIP: 'Sub Total 950.00', 'Gross Amount 563.00', 'Grand Total'\n"
    "\n"
    "Rules:\n"
    "- Keep original item names, only fix clear OCR artifacts\n\n"
    "Output ONLY this JSON format, nothing else:\n"
    '{"items":[{"name":"Item Name","price":12.50}],"currency":"INR"}'
)

class OCRService:
    def __init__(self, api_key: str, timeout: float = 90.0):
        self.client = InferenceClient(api_key=api_key, timeout=timeout)

    def extract_items(self, image_path: str) -> Dict[str, Any]:
        """Extract items and currency from a receipt image.

        Returns:
            {"items": [{"name": str, "price": float}], "currency": str}
        """
        with open(image_path, "rb") as f:
            image_bytes = f.read()

        base64_image = base64.b64encode(image_bytes).decode("utf-8")

        logger.info("Starting extraction with model %s", OCR_MODEL)
        completion = self.client.chat.completions.create(
            model=OCR_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": EXTRACTION_SYSTEM,
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": EXTRACTION_USER,
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}"
                            },
                        },
                    ],
                },
            ],
        )

        raw_response = completion.choices[0].message.content or ""
        logger.info(f"Extraction raw response: {raw_response[:500]}")

        parsed, _ = self._parse_response_with_meta(raw_response)
        items = parsed.get("items", [])
        currency = parsed.get("currency", "")
        logger.info(f"Extracted {len(items)} items, currency={currency}")

        if not items:
            logger.warning("No items extracted, returning empty list")
            return {"items": [], "currency": currency}

        return {"items": items, "currency": currency}

    def _parse_response(self, text: str) -> Dict[str, Any]:
        """Parse the LLM response into items + currency. Handles both old array format and new object format."""
        parsed, _ = self._parse_response_with_meta(text)
        return {
            "items": parsed.get("items", []),
            "currency": parsed.get("currency", ""),
        }

    def _parse_response_with_meta(self, text: str) -> tuple[Dict[str, Any], Dict[str, Any]]:
        """Parse response and include parse metadata for diagnostics."""
        text = text.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        text = text.strip()

        parse_mode = "failed"
        parsed_obj = None

        # Try direct parse
        try:
            parsed_obj = json.loads(text)
            parse_mode = "direct_json"
        except json.JSONDecodeError:
            pass

        if parsed_obj is None:
            # Fallback: find first {...} or [...] block
            obj_match = re.search(r"\{.*\}", text, re.DOTALL)
            if obj_match:
                try:
                    parsed_obj = json.loads(obj_match.group())
                    parse_mode = "object_block"
                except json.JSONDecodeError:
                    pass

        if parsed_obj is None:
            arr_match = re.search(r"\[.*\]", text, re.DOTALL)
            if arr_match:
                try:
                    parsed_obj = json.loads(arr_match.group())
                    parse_mode = "array_block"
                except json.JSONDecodeError:
                    logger.warning("Failed to parse JSON from response")

        if parsed_obj is None:
            result = {"items": [], "currency": "", "_sanitize_stats": self._empty_sanitize_stats()}
            return result, {"parse_mode": "failed"}

        normalized, stats = self._normalize_response_with_stats(parsed_obj)
        normalized["_sanitize_stats"] = stats
        return normalized, {"parse_mode": parse_mode}

    def _normalize_response(self, parsed: Any) -> Dict[str, Any]:
        """Normalize parsed JSON into {items: [...], currency: str}."""
        normalized, _ = self._normalize_response_with_stats(parsed)
        return normalized

    def _normalize_response_with_stats(self, parsed: Any) -> tuple[Dict[str, Any], Dict[str, Any]]:
        """Normalize parsed JSON and capture sanitization stats."""
        if isinstance(parsed, list):
            items, stats = self._sanitize_items(parsed)
            return {"items": items, "currency": ""}, stats
        if isinstance(parsed, dict):
            items = parsed.get("items", [])
            currency = parsed.get("currency", "")
            if isinstance(items, list):
                normalized_items, stats = self._sanitize_items(items)
                currency_str = str(currency).strip() if currency is not None else ""
                return {"items": normalized_items, "currency": currency_str}, stats
        return {"items": [], "currency": ""}, self._empty_sanitize_stats()

    def _normalize_items(self, items: list) -> List[Dict[str, Any]]:
        sanitized, _ = self._sanitize_items(items)
        return sanitized

    def _empty_sanitize_stats(self) -> Dict[str, Any]:
        return {
            "raw_items": 0,
            "kept_items": 0,
            "dropped_items": 0,
            "coerced_prices": 0,
            "trimmed_names": 0,
            "parseable_total": 0.0,
            "sanitized_total": 0.0,
            "total_delta": 0.0,
        }

    def _coerce_price(self, value: Any) -> tuple[Optional[float], bool]:
        if isinstance(value, (int, float)):
            return float(value), False
        if isinstance(value, str):
            cleaned = value.strip().replace(",", "")
            if not cleaned:
                return None, True
            try:
                return float(cleaned), True
            except ValueError:
                return None, True
        return None, False

    def _sanitize_items(self, items: list) -> tuple[List[Dict[str, Any]], Dict[str, Any]]:
        result: List[Dict[str, Any]] = []
        stats = self._empty_sanitize_stats()
        stats["raw_items"] = len(items) if isinstance(items, list) else 0

        for item in items:
            if not isinstance(item, dict):
                stats["dropped_items"] += 1
                continue

            name = item.get("name")
            price = item.get("price")
            if name is None or price is None:
                stats["dropped_items"] += 1
                continue

            name_raw = str(name)
            name_clean = name_raw.strip()
            if name_clean != name_raw:
                stats["trimmed_names"] += 1
            if not name_clean:
                stats["dropped_items"] += 1
                continue

            price_num, coerced = self._coerce_price(price)
            if price_num is None:
                stats["dropped_items"] += 1
                if coerced:
                    stats["coerced_prices"] += 1
                continue
            if coerced:
                stats["coerced_prices"] += 1
            if not math.isfinite(price_num):
                stats["dropped_items"] += 1
                continue

            stats["parseable_total"] += price_num
            if abs(price_num) > OCR_MAX_ABS_ITEM_PRICE:
                stats["dropped_items"] += 1
                continue

            rounded_price = round(float(price_num), 2)
            stats["sanitized_total"] += rounded_price
            result.append({"name": name_clean, "price": rounded_price})

        stats["kept_items"] = len(result)
        stats["total_delta"] = round(abs(stats["parseable_total"] - stats["sanitized_total"]), 2)
        return result, stats


def get_ocr_service() -> OCRService:
    api_key = os.environ.get("HF_TOKEN")
    if not api_key:
        raise ValueError("HF_TOKEN environment variable is not set")
    timeout = float(os.environ.get("OCR_TIMEOUT", 90))
    return OCRService(api_key, timeout=timeout)
