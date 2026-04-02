"""Tests for split calculation logic."""

import pytest
from unittest.mock import MagicMock, patch


class TestCalculateSplit:
    """Test the calculate_split function for correctness."""

    @pytest.fixture
    def mock_db(self):
        """Mock Firestore database."""
        db = MagicMock()
        bill_doc = MagicMock()
        bill_doc.exists = True
        bill_doc.to_dict.return_value = {
            "items": [
                {"name": "Burger", "price": 10.00, "type": "item"},
                {"name": "Fries", "price": 5.00, "type": "item"},
                {"name": "Tax", "price": 1.50, "type": "tax"},
            ],
            "currency": "USD",
            "taxTotal": 1.50,
            "total": 16.50,
        }
        db.collection.return_value.document.return_value.get.return_value = bill_doc
        return db

    def test_single_user_single_item(self):
        """A single user who selected one item pays for it plus their tax share."""
        from services.firebase import calculate_split

        with patch("services.firebase._get_db") as mock_get_db:
            db = MagicMock()
            bill_doc = MagicMock()
            bill_doc.exists = True
            bill_doc.to_dict.return_value = {
                "items": [{"name": "Burger", "price": 10.00, "type": "item"}],
                "currency": "USD",
                "taxTotal": 0,
                "total": 10.00,
            }
            db.collection.return_value.document.return_value.get.return_value = bill_doc

            sel_doc = MagicMock()
            sel_doc.id = "user-1"
            sel_doc.to_dict.return_value = {
                "userName": "Alice",
                "items": [0],
                "submittedAt": MagicMock(),
            }
            db.collection.return_value.document.return_value.collection.return_value.stream.return_value = [sel_doc]

            mock_get_db.return_value = db
            result = calculate_split("test-bill")

            assert result is not None
            assert len(result["users"]) == 1
            assert result["users"]["user-1"]["total"] == 10.00

    def test_tax_split_rounding_no_drift(self):
        """Tax split among 3 users should sum to exactly the tax total."""
        from services.firebase import calculate_split

        with patch("services.firebase._get_db") as mock_get_db:
            db = MagicMock()
            bill_doc = MagicMock()
            bill_doc.exists = True
            bill_doc.to_dict.return_value = {
                "items": [{"name": "Tax", "price": 1.00, "type": "tax"}],
                "currency": "USD",
                "taxTotal": 1.00,
                "total": 1.00,
            }
            db.collection.return_value.document.return_value.get.return_value = bill_doc

            selections = []
            for i, name in enumerate(["Alice", "Bob", "Charlie"]):
                sel_doc = MagicMock()
                sel_doc.id = f"user-{i}"
                sel_doc.to_dict.return_value = {
                    "userName": name,
                    "items": [],
                    "submittedAt": MagicMock(),
                }
                selections.append(sel_doc)

            db.collection.return_value.document.return_value.collection.return_value.stream.return_value = selections
            mock_get_db.return_value = db
            result = calculate_split("test-bill")

            assert result is not None
            total_tax_collected = sum(
                user["items"][0]["share"]
                for user in result["users"].values()
                if user["items"]
            )
            assert total_tax_collected == 1.00

    def test_item_split_among_selectors_only(self):
        """An item should only be split among users who selected it."""
        from services.firebase import calculate_split

        with patch("services.firebase._get_db") as mock_get_db:
            db = MagicMock()
            bill_doc = MagicMock()
            bill_doc.exists = True
            bill_doc.to_dict.return_value = {
                "items": [
                    {"name": "Steak", "price": 30.00, "type": "item"},
                    {"name": "Salad", "price": 10.00, "type": "item"},
                ],
                "currency": "USD",
                "taxTotal": 0,
                "total": 40.00,
            }
            db.collection.return_value.document.return_value.get.return_value = bill_doc

            alice_doc = MagicMock()
            alice_doc.id = "alice"
            alice_doc.to_dict.return_value = {"userName": "Alice", "items": [0], "submittedAt": MagicMock()}

            bob_doc = MagicMock()
            bob_doc.id = "bob"
            bob_doc.to_dict.return_value = {"userName": "Bob", "items": [1], "submittedAt": MagicMock()}

            db.collection.return_value.document.return_value.collection.return_value.stream.return_value = [alice_doc, bob_doc]
            mock_get_db.return_value = db
            result = calculate_split("test-bill")

            assert result is not None
            assert result["users"]["alice"]["total"] == 30.00
            assert result["users"]["bob"]["total"] == 10.00

    def test_empty_selections(self):
        """No selections should return empty users dict."""
        from services.firebase import calculate_split

        with patch("services.firebase._get_db") as mock_get_db:
            db = MagicMock()
            bill_doc = MagicMock()
            bill_doc.exists = True
            bill_doc.to_dict.return_value = {
                "items": [{"name": "Burger", "price": 10.00, "type": "item"}],
                "currency": "USD",
                "taxTotal": 0,
                "total": 10.00,
            }
            db.collection.return_value.document.return_value.get.return_value = bill_doc
            db.collection.return_value.document.return_value.collection.return_value.stream.return_value = []
            mock_get_db.return_value = db
            result = calculate_split("test-bill")

            assert result is not None
            assert result["users"] == {}
            assert result["numUsers"] == 0

    def test_nonexistent_bill(self):
        """A nonexistent bill should return None."""
        from services.firebase import calculate_split

        with patch("services.firebase._get_db") as mock_get_db:
            db = MagicMock()
            bill_doc = MagicMock()
            bill_doc.exists = False
            db.collection.return_value.document.return_value.get.return_value = bill_doc
            mock_get_db.return_value = db
            result = calculate_split("nonexistent")

            assert result is None

    def test_discount_item_split(self):
        """Discount items should be split among all users."""
        from services.firebase import calculate_split

        with patch("services.firebase._get_db") as mock_get_db:
            db = MagicMock()
            bill_doc = MagicMock()
            bill_doc.exists = True
            bill_doc.to_dict.return_value = {
                "items": [
                    {"name": "Burger", "price": 20.00, "type": "item"},
                    {"name": "Discount 10%", "price": -2.00, "type": "discount"},
                ],
                "currency": "USD",
                "taxTotal": 0,
                "total": 18.00,
            }
            db.collection.return_value.document.return_value.get.return_value = bill_doc

            selections = []
            for i, name in enumerate(["Alice", "Bob"]):
                sel_doc = MagicMock()
                sel_doc.id = f"user-{i}"
                sel_doc.to_dict.return_value = {
                    "userName": name,
                    "items": [0],
                    "submittedAt": MagicMock(),
                }
                selections.append(sel_doc)

            db.collection.return_value.document.return_value.collection.return_value.stream.return_value = selections
            mock_get_db.return_value = db
            result = calculate_split("test-bill")

            assert result is not None
            assert len(result["users"]) == 2
