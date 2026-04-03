import os
import base64
import json
import re
import math
import logging
from typing import List, Dict, Any, Optional
from huggingface_hub import InferenceClient

logger = logging.getLogger(__name__)

EXTRACTION_MODEL = os.environ.get("OCR_EXTRACTION_MODEL", "Qwen/Qwen2.5-VL-72B-Instruct")
CORRECTION_MODEL = os.environ.get("OCR_CORRECTION_MODEL", "openai/gpt-oss-120b")
OCR_MAX_ABS_ITEM_PRICE = float(os.environ.get("OCR_MAX_ABS_ITEM_PRICE", "1000000"))
OCR_MAX_ABS_TOTAL = float(os.environ.get("OCR_MAX_ABS_TOTAL", "10000000"))

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

CORRECTION_SYSTEM = (
    "You fix OCR extraction data. Output only valid JSON. No commentary."
)

CORRECTION_USER = """Fix these receipt items. Apply all corrections silently:

PRICES: Fix letter-in-number errors (O→0, l→1). Keep numbers as-is - do NOT drop trailing zeros.
Example: 600 is 600.00 (six hundred), NOT 60.00. 330 is 330.00, NOT 33.00.
NAMES: Fix garbled text, normalize to Title Case, remove stray symbols.
DUPLICATES: Remove exact duplicates.
TAX/TOTAL: Keep CGST, SGST, VAT, Service Tax as separate items if present.
SUMMARY ROWS: Remove summary rows like Sub Total, Gross Amount, Grand Total, Net Amount - these are calculated values, not actual items.

Items:
{items_json}

Output ONLY a JSON object like: {{"items":[{{"name":"Fixed Name","price":12.50}}],"currency":"INR"}}"""


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

        logger.info("Starting extraction with vision model")
        completion = self.client.chat.completions.create(
            model=EXTRACTION_MODEL,
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

        parsed, parse_meta = self._parse_response_with_meta(raw_response)
        items = parsed.get("items", [])
        currency = parsed.get("currency", "")
        extraction_stats = parsed.get("_sanitize_stats", self._empty_sanitize_stats())
        logger.info(f"Extracted {len(items)} items before correction, currency={currency}")

        if not items:
            logger.warning("No items extracted, returning empty list")
            return {"items": [], "currency": currency}

        if self._should_skip_correction(parse_meta, extraction_stats, items):
            logger.info("Skipping correction: extraction is clean and stable")
            return {"items": items, "currency": currency}

        corrected = self._correct_items(items, currency)

        if not corrected.get("items"):
            logger.warning("Correction returned empty, using original extraction")
            return {"items": items, "currency": currency}

        corrected_items = corrected.get("items", [])
        corrected_stats = corrected.get("_sanitize_stats", self._empty_sanitize_stats())

        if self._is_correction_worse(items, corrected_items, extraction_stats, corrected_stats):
            logger.warning("Correction appears worse than extraction; using extraction output")
            return {"items": items, "currency": currency}

        final_currency = corrected.get("currency") or currency
        logger.info(f"Returning {len(corrected_items)} corrected items, currency={final_currency}")
        return {"items": corrected_items, "currency": final_currency}

    def _parse_response(self, text: str) -> Dict[str, Any]:
        """Parse the LLM response into items + currency. Handles both old array format and new object format."""
        parsed, _ = self._parse_response_with_meta(text)
        return {
            "items": parsed.get("items", []),
            "currency": parsed.get("currency", ""),
        }

    def _parse_response_with_meta(self, text: str) -> tuple[Dict[str, Any], Dict[str, Any]]:
        """Parse response and include parse metadata for correction gating."""
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

    def _sum_total(self, items: List[Dict[str, Any]]) -> float:
        return round(sum(item.get("price", 0.0) or 0.0 for item in items), 2)

    def _should_skip_correction(
        self,
        parse_meta: Dict[str, Any],
        sanitize_stats: Dict[str, Any],
        items: List[Dict[str, Any]],
    ) -> bool:
        if not items:
            return False
        if parse_meta.get("parse_mode") != "direct_json":
            return False

        raw_items = max(1, int(sanitize_stats.get("raw_items", len(items)) or len(items)))
        kept_items = max(1, int(sanitize_stats.get("kept_items", len(items)) or len(items)))
        dropped_ratio = (sanitize_stats.get("dropped_items", 0) or 0) / raw_items
        coerced_ratio = (sanitize_stats.get("coerced_prices", 0) or 0) / kept_items
        trimmed_ratio = (sanitize_stats.get("trimmed_names", 0) or 0) / kept_items
        stable_totals = (sanitize_stats.get("total_delta", 0.0) or 0.0) <= 0.01
        extracted_total = abs(self._sum_total(items))

        return (
            dropped_ratio <= 0.05
            and coerced_ratio <= 0.05
            and trimmed_ratio <= 0.05
            and stable_totals
            and extracted_total <= OCR_MAX_ABS_TOTAL
        )

    def _is_correction_worse(
        self,
        extracted_items: List[Dict[str, Any]],
        corrected_items: List[Dict[str, Any]],
        extracted_stats: Dict[str, Any],
        corrected_stats: Dict[str, Any],
    ) -> bool:
        if not corrected_items:
            return True

        extracted_total = self._sum_total(extracted_items)
        corrected_total = self._sum_total(corrected_items)
        if not math.isfinite(corrected_total):
            return True
        if abs(corrected_total) > OCR_MAX_ABS_TOTAL:
            return True

        # Guard against correction outputs that explode totals or invert sign unexpectedly.
        if abs(corrected_total) > max(abs(extracted_total) * 2.0, abs(extracted_total) + 50.0):
            return True
        if extracted_total > 0 and corrected_total <= 0 and abs(extracted_total - corrected_total) > 20.0:
            return True

        extracted_count = len(extracted_items)
        corrected_count = len(corrected_items)
        min_allowed_count = max(1, int(extracted_count * 0.3))
        if corrected_count < min_allowed_count:
            return True

        extracted_dropped = int(extracted_stats.get("dropped_items", 0) or 0)
        corrected_dropped = int(corrected_stats.get("dropped_items", 0) or 0)
        if corrected_dropped > extracted_dropped + max(3, int(extracted_count * 0.2)):
            return True

        return False

    def _correct_items(self, items: List[Dict[str, Any]], currency: str) -> Dict[str, Any]:
        if not items:
            return {"items": items, "currency": currency}

        items_json = json.dumps({"items": items, "currency": currency}, ensure_ascii=False)
        correction_prompt = CORRECTION_USER.replace("{items_json}", items_json)

        logger.info(f"Sending {len(items)} items to correction model")

        try:
            completion = self.client.chat.completions.create(
                model=CORRECTION_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": CORRECTION_SYSTEM,
                    },
                    {
                        "role": "user",
                        "content": correction_prompt,
                    },
                ],
            )

            response = completion.choices[0].message.content or ""
            logger.info(f"Correction raw response: {response[:500]}")

            parsed, _ = self._parse_response_with_meta(response)
            if parsed.get("items"):
                return parsed
            return {"items": items, "currency": currency}

        except Exception as e:
            logger.error(f"Correction failed: {e}")
            return {"items": items, "currency": currency}


def get_ocr_service() -> OCRService:
    api_key = os.environ.get("HF_TOKEN")
    if not api_key:
        raise ValueError("HF_TOKEN environment variable is not set")
    timeout = float(os.environ.get("OCR_TIMEOUT", 90))
    return OCRService(api_key, timeout=timeout)
