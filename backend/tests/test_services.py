"""Tests for OCR service parsing and normalization."""

import sys
from unittest.mock import MagicMock

# Mock huggingface_hub before importing ocr
sys.modules.setdefault("huggingface_hub", MagicMock())

from services.ocr import OCRService


class TestParseResponse:
    """Test the _parse_response method."""

    def setup_method(self):
        self.service = OCRService.__new__(OCRService)
        self.service.client = MagicMock()

    def test_object_format(self):
        """Should parse {items: [...], currency: str} format."""
        text = '{"items": [{"name": "Burger", "price": 10.50}], "currency": "USD"}'
        result = self.service._parse_response(text)
        assert result["currency"] == "USD"
        assert len(result["items"]) == 1
        assert result["items"][0]["name"] == "Burger"

    def test_array_format(self):
        """Should parse legacy [...] format."""
        text = '[{"name": "Fries", "price": 5.00}]'
        result = self.service._parse_response(text)
        assert result["currency"] == ""
        assert len(result["items"]) == 1

    def test_markdown_fenced(self):
        """Should strip markdown code fences."""
        text = '```json\n[{"name": "Salad", "price": 8.00}]\n```'
        result = self.service._parse_response(text)
        assert len(result["items"]) == 1

    def test_invalid_json(self):
        """Should return empty items on invalid JSON."""
        text = 'not json at all'
        result = self.service._parse_response(text)
        assert result["items"] == []
        assert result["currency"] == ""

    def test_empty_string(self):
        """Should return empty on empty string."""
        result = self.service._parse_response("")
        assert result["items"] == []


class TestNormalizeItems:
    """Test the _normalize_items method."""

    def setup_method(self):
        self.service = OCRService.__new__(OCRService)

    def test_string_price(self):
        """Should coerce string prices to float."""
        items = [{"name": "Item", "price": "12.50"}]
        result = self.service._normalize_items(items)
        assert result[0]["price"] == 12.50

    def test_missing_name(self):
        """Should skip items without name."""
        items = [{"price": 10.00}]
        result = self.service._normalize_items(items)
        assert len(result) == 0

    def test_missing_price(self):
        """Should skip items without price."""
        items = [{"name": "Item"}]
        result = self.service._normalize_items(items)
        assert len(result) == 0

    def test_non_dict_items(self):
        """Should skip non-dict items."""
        items = ["not a dict", 42, None]
        result = self.service._normalize_items(items)
        assert len(result) == 0

    def test_invalid_string_price(self):
        """Should skip items with non-numeric string price."""
        items = [{"name": "Item", "price": "abc"}]
        result = self.service._normalize_items(items)
        assert len(result) == 0

    def test_rounds_price(self):
        """Should round price to 2 decimal places."""
        items = [{"name": "Item", "price": 12.567}]
        result = self.service._normalize_items(items)
        assert result[0]["price"] == 12.57


class TestSanitizeGuards:
    """Test OCR sanitization guardrails."""

    def setup_method(self):
        self.service = OCRService.__new__(OCRService)
        self.service.client = MagicMock()

    def test_sanitize_items_drops_non_finite_and_huge_values(self):
        items = [
            {"name": "Burger", "price": 120.0},
            {"name": "Broken", "price": float("inf")},
            {"name": "Huge", "price": "999999999999"},
        ]
        sanitized, stats = self.service._sanitize_items(items)
        assert sanitized == [{"name": "Burger", "price": 120.0}]
        assert stats["dropped_items"] == 2


class TestSplitCents:
    """Test the _split_cents helper used in calculate_split."""

    def test_even_split(self):
        from services.firebase import _split_cents
        assert _split_cents(100, 4) == [25, 25, 25, 25]

    def test_uneven_split(self):
        from services.firebase import _split_cents
        assert _split_cents(100, 3) == [34, 33, 33]

    def test_single_user(self):
        from services.firebase import _split_cents
        assert _split_cents(99, 1) == [99]

    def test_zero_users(self):
        from services.firebase import _split_cents
        assert _split_cents(100, 0) == []

    def test_one_cent_three_ways(self):
        from services.firebase import _split_cents
        assert _split_cents(1, 3) == [1, 0, 0]

    def test_total_preserved(self):
        from services.firebase import _split_cents
        for n in range(1, 10):
            for total in [1, 7, 99, 100, 101, 333]:
                shares = _split_cents(total, n)
                assert sum(shares) == total, f"total={total}, n={n}, shares={shares}"


class TestCleanupAuth:
    """Test that /cleanup requires auth when CLEANUP_SECRET is set."""

    def test_cleanup_no_secret(self):
        """Should allow cleanup when no secret is configured."""
        import os
        from unittest.mock import patch, MagicMock

        # Mock slowapi
        sys.modules.setdefault("slowapi", MagicMock())
        sys.modules.setdefault("slowapi.util", MagicMock())
        sys.modules.setdefault("slowapi.errors", MagicMock())

        with patch("services.firebase._get_db"), \
             patch.dict(os.environ, {}, clear=False):
            os.environ.pop("CLEANUP_SECRET", None)
            from main import app
            from fastapi.testclient import TestClient
            client = TestClient(app)
            response = client.post("/cleanup")
            assert response.status_code == 200

    def test_cleanup_with_secret_unauthorized(self):
        """Should reject cleanup without correct secret."""
        import os
        from unittest.mock import patch

        sys.modules.setdefault("slowapi", MagicMock())
        sys.modules.setdefault("slowapi.util", MagicMock())
        sys.modules.setdefault("slowapi.errors", MagicMock())

        with patch("services.firebase._get_db"), \
             patch.dict(os.environ, {"CLEANUP_SECRET": "mysecret"}, clear=False):
            from main import app
            from fastapi.testclient import TestClient
            client = TestClient(app)
            response = client.post("/cleanup")
            assert response.status_code == 401

    def test_cleanup_with_secret_authorized(self):
        """Should allow cleanup with correct secret."""
        import os
        from unittest.mock import patch

        sys.modules.setdefault("slowapi", MagicMock())
        sys.modules.setdefault("slowapi.util", MagicMock())
        sys.modules.setdefault("slowapi.errors", MagicMock())

        with patch("services.firebase._get_db"), \
             patch("services.firebase.cleanup_expired", return_value=5), \
             patch.dict(os.environ, {"CLEANUP_SECRET": "mysecret"}, clear=False):
            from main import app
            from fastapi.testclient import TestClient
            client = TestClient(app)
            response = client.post(
                "/cleanup",
                headers={"Authorization": "Bearer mysecret"},
            )
            assert response.status_code == 200
            assert response.json()["deleted"] == 5
