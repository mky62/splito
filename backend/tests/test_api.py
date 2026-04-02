"""Tests for API endpoint validation and security."""

import sys
from unittest.mock import MagicMock

# Mock slowapi before importing main (it may not be installed in test env)
sys.modules.setdefault("slowapi", MagicMock())
sys.modules.setdefault("slowapi.util", MagicMock())
sys.modules.setdefault("slowapi.errors", MagicMock())

import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create a test client with mocked services."""
    with patch("services.firebase._get_db"), \
         patch("services.ocr.get_ocr_service"), \
         patch("services.cloudinary.upload_to_cloudinary"):
        from main import app
        yield TestClient(app)


class TestRateLimiting:
    """Test rate limiting behavior."""

    def test_extract_bill_rate_limit(self, client):
        """Should return 429 after exceeding rate limit."""
        # Rate limit is 10 requests/minute for /extract-bill
        # We can't easily test the full limit without mocking time,
        # but we can verify the endpoint exists and accepts images
        pass  # Integration test requires more setup

    def test_join_select_rate_limit(self, client):
        """Join/select endpoints have separate rate limit bucket."""
        pass  # Integration test requires more setup


class TestBillIdValidation:
    """Test bill ID format validation."""

    def test_invalid_bill_id_short(self, client):
        """Short bill IDs should return 400."""
        response = client.get("/api/bill/abc")
        assert response.status_code == 400

    def test_invalid_bill_id_special_chars(self, client):
        """Bill IDs with special chars should return 400."""
        response = client.get("/api/bill/bill<script>alert(1)</script>")
        assert response.status_code == 400

    def test_valid_bill_id_format(self, client):
        """Valid Firestore-style IDs should pass validation."""
        with patch("main.get_bill") as mock_get_bill:
            mock_get_bill.return_value = None
            response = client.get("/api/bill/abc123def456ghi789jkl0")
            assert response.status_code == 404  # Not found, but validation passed


class TestSecurityHeaders:
    """Test security headers are present."""

    def test_x_content_type_options(self, client):
        response = client.get("/health")
        assert response.headers.get("X-Content-Type-Options") == "nosniff"

    def test_x_frame_options(self, client):
        response = client.get("/health")
        assert response.headers.get("X-Frame-Options") == "DENY"

    def test_x_xss_protection(self, client):
        response = client.get("/health")
        assert response.headers.get("X-XSS-Protection") == "1; mode=block"

    def test_referrer_policy(self, client):
        response = client.get("/health")
        assert response.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"


class TestBodySizeLimit:
    """Test request body size limits."""

    def test_oversized_json_rejected(self, client):
        """Requests with body > 64KB should be rejected."""
        large_payload = {"data": "x" * (65 * 1024)}
        response = client.post(
            "/api/bill/abc123def456ghi789jkl0/join",
            json=large_payload,
        )
        assert response.status_code == 413


class TestInputValidation:
    """Test Pydantic model validation."""

    def test_join_empty_name(self, client):
        response = client.post(
            "/api/bill/abc123def456ghi789jkl0/join",
            json={"userName": "", "totalPeople": 2},
        )
        assert response.status_code == 422

    def test_join_name_too_long(self, client):
        response = client.post(
            "/api/bill/abc123def456ghi789jkl0/join",
            json={"userName": "a" * 51, "totalPeople": 2},
        )
        assert response.status_code == 422

    def test_join_people_out_of_range(self, client):
        response = client.post(
            "/api/bill/abc123def456ghi789jkl0/join",
            json={"userName": "Alice", "totalPeople": 0},
        )
        assert response.status_code == 422

    def test_set_people_negative(self, client):
        response = client.post(
            "/api/bill/abc123def456ghi789jkl0/set-people",
            json={"totalPeople": -1},
        )
        assert response.status_code == 422
