"""Shared direct-mode configuration for TrustGate."""

from pathlib import Path
import sys

from gltest.direct.sdk_loader import setup_sdk_paths


PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from tests.gltest_windows_compat import install_windows_direct_compatibility


CONTRACT_PATH = Path("contracts/TrustGate.py")


install_windows_direct_compatibility()


def pytest_configure():
    setup_sdk_paths(CONTRACT_PATH, "v0.2.16")
