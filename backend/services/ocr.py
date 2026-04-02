import os
import base64
import json
import re
import logging
from typing import List, Dict, Any, Optional
from huggingface_hub import InferenceClient

logger = logging.getLogger(__name__)

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
            model="Qwen/Qwen2.5-VL-72B-Instruct:hyperbolic",
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

        parsed = self._parse_response(raw_response)
        items = parsed.get("items", [])
        currency = parsed.get("currency", "")
        logger.info(f"Extracted {len(items)} items before correction, currency={currency}")

        if not items:
            logger.warning("No items extracted, returning empty list")
            return {"items": [], "currency": currency}

        corrected = self._correct_items(items, currency)

        if not corrected.get("items"):
            logger.warning("Correction returned empty, using original extraction")
            return {"items": items, "currency": currency}

        logger.info(f"Returning {len(corrected['items'])} corrected items, currency={corrected.get('currency', currency)}")
        return corrected

    def _parse_response(self, text: str) -> Dict[str, Any]:
        """Parse the LLM response into items + currency. Handles both old array format and new object format."""
        text = text.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        text = text.strip()

        # Try direct parse
        try:
            parsed = json.loads(text)
            return self._normalize_response(parsed)
        except json.JSONDecodeError:
            pass

        # Fallback: find first {...} or [...] block
        obj_match = re.search(r"\{.*\}", text, re.DOTALL)
        if obj_match:
            try:
                parsed = json.loads(obj_match.group())
                return self._normalize_response(parsed)
            except json.JSONDecodeError:
                pass

        arr_match = re.search(r"\[.*\]", text, re.DOTALL)
        if arr_match:
            try:
                parsed = json.loads(arr_match.group())
                return self._normalize_response(parsed)
            except json.JSONDecodeError:
                logger.warning("Failed to parse JSON from response")

        return {"items": [], "currency": ""}

    def _normalize_response(self, parsed: Any) -> Dict[str, Any]:
        """Normalize parsed JSON into {items: [...], currency: str}."""
        if isinstance(parsed, list):
            return {"items": self._normalize_items(parsed), "currency": ""}
        if isinstance(parsed, dict):
            items = parsed.get("items", [])
            currency = parsed.get("currency", "")
            if isinstance(items, list):
                return {"items": self._normalize_items(items), "currency": str(currency)}
        return {"items": [], "currency": ""}

    def _normalize_items(self, items: list) -> List[Dict[str, Any]]:
        result = []
        for item in items:
            if not isinstance(item, dict):
                continue
            name = item.get("name")
            price = item.get("price")
            if name is None or price is None:
                continue
            # Coerce price to float
            if isinstance(price, str):
                price = price.strip().replace(",", "")
                try:
                    price = float(price)
                except ValueError:
                    continue
            if not isinstance(price, (int, float)):
                continue
            result.append({"name": str(name).strip(), "price": round(float(price), 2)})
        return result

    def _correct_items(self, items: List[Dict[str, Any]], currency: str) -> Dict[str, Any]:
        if not items:
            return {"items": items, "currency": currency}

        items_json = json.dumps({"items": items, "currency": currency}, ensure_ascii=False)
        correction_prompt = CORRECTION_USER.replace("{items_json}", items_json)

        logger.info(f"Sending {len(items)} items to correction model")

        try:
            completion = self.client.chat.completions.create(
                model="openai/gpt-oss-120b:groq",
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

            parsed = self._parse_response(response)
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
