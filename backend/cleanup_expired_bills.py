#!/usr/bin/env python3
"""Cleanup expired bills from Firestore.

Usage:
    python cleanup_expired_bills.py

Run via cron for automated cleanup:
    0 */1 * * * cd /path/to/splito/backend && python cleanup_expired_bills.py
"""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from services.firebase import cleanup_expired

if __name__ == "__main__":
    count = cleanup_expired()
    print(f"Cleaned up {count} expired bills")
