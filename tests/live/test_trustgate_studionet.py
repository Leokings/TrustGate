"""Opt-in smoke tests against the deployed TrustGate StudioNet contract."""

from __future__ import annotations

import json
import os
import secrets
import time
from pathlib import Path

import pytest
from genlayer_py.exceptions import GenLayerError
from gltest import create_accounts, get_contract_factory
from gltest.assertions import tx_execution_succeeded
from gltest.clients import get_gl_client
from gltest.types import TransactionStatus


CONTRACT_ADDRESS = os.environ.get(
    "TRUSTGATE_STUDIONET_ADDRESS",
    "0xB57fE57B3c4EECd29b8544EB54e15B8368cF253D",
)
EVIDENCE_URLS = [
    "https://raw.githubusercontent.com/circlefin/skills/58ab8648bb1ae9d037a3bf5197ad3bb01262f5b1/plugins/circle/skills/use-usdc/SKILL.md",
    "https://sourcify.dev/server/v2/contract/1/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
]
TARGET_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
SPENDER_ADDRESS = "0x3333333333333333333333333333333333333333"
RECIPIENT_ADDRESS = "0x4444444444444444444444444444444444444444"
SAFE_INTENT = (
    "Transfer exactly 1 USDC (1000000 base units) to "
    + RECIPIENT_ADDRESS
    + " using the official Ethereum USDC token contract."
)

pytestmark = pytest.mark.live


def _receipt_dump(receipt) -> str:
    return json.dumps(receipt, indent=2, sort_keys=True, default=str)


def _contract():
    requester = create_accounts(1)[0]
    path = Path(__file__).resolve().parents[2] / "contracts" / "TrustGate.py"
    factory = get_contract_factory(contract_file_path=path)
    return factory.build_contract(CONTRACT_ADDRESS, account=requester), requester


def _reference(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(6)}"


def _approval_calldata() -> str:
    return "0x095ea7b3" + ("0" * 24) + SPENDER_ADDRESS[2:] + ("f" * 64)


def _transfer_calldata() -> str:
    return (
        "0xa9059cbb"
        + ("0" * 24)
        + RECIPIENT_ADDRESS[2:]
        + format(1_000_000, "064x")
    )


def _request(contract, requester, reference: str, calldata: str, evidence: list[str]):
    args = [
        reference,
        "balanced-v1",
        1,
        7,
        str(requester.address).lower(),
        TARGET_ADDRESS,
        0,
        calldata,
        SAFE_INTENT,
        json.dumps(evidence, separators=(",", ":")),
        3600,
    ]
    client = get_gl_client()
    last_error: GenLayerError | None = None
    tx_hash = None
    for attempt in range(5):
        try:
            tx_hash = client.write_contract(
                address=contract.address,
                function_name="request_clearance",
                account=requester,
                args=args,
                leader_only=False,
            )
            break
        except GenLayerError as error:
            last_error = error
            time.sleep(2 * (attempt + 1))
    if tx_hash is None:
        if last_error is not None:
            raise last_error
        raise AssertionError("StudioNet submission ended without a transaction hash")
    last_error = None
    for _ in range(8):
        try:
            return tx_hash, client.wait_for_transaction_receipt(
                transaction_hash=tx_hash,
                status=TransactionStatus.FINALIZED,
                interval=3_000,
                retries=12,
            )
        except GenLayerError as error:
            last_error = error
            time.sleep(2)
    if last_error is not None:
        raise last_error
    raise AssertionError("StudioNet receipt polling ended without a receipt")


def _read_clearance(contract, requester, reference: str):
    last_error: GenLayerError | None = None
    for attempt in range(8):
        try:
            return contract.get_clearance_by_reference(
                args=[str(requester.address).lower(), reference]
            ).call()
        except GenLayerError as error:
            last_error = error
            time.sleep(2 * (attempt + 1))
    if last_error is not None:
        raise last_error
    raise AssertionError("StudioNet clearance read ended without a result")


def test_studionet_deterministic_block_finalizes_and_is_readable():
    contract, requester = _contract()
    reference = _reference("smoke-block")

    tx_hash, receipt = _request(contract, requester, reference, _approval_calldata(), [])
    assert tx_execution_succeeded(receipt), _receipt_dump(receipt)

    clearance = _read_clearance(contract, requester, reference)
    assert clearance["decision"] == "BLOCK"
    assert json.loads(clearance["reason_codes_json"]) == ["UNLIMITED_TOKEN_APPROVAL"]
    assert clearance["requester"].lower() == str(requester.address).lower()
    print(json.dumps({
        "clearance_digest": clearance["clearance_digest"],
        "clearance_id": clearance["clearance_id"],
        "decision": clearance["decision"],
        "transaction_hash": tx_hash,
    }, sort_keys=True))


def test_studionet_real_validators_finalize_independent_public_evidence():
    contract, requester = _contract()
    reference = _reference("smoke-safe")

    tx_hash, receipt = _request(
        contract,
        requester,
        reference,
        _transfer_calldata(),
        EVIDENCE_URLS,
    )
    print(json.dumps({"finalized_transaction_hash": tx_hash}, sort_keys=True), flush=True)
    assert tx_execution_succeeded(receipt), _receipt_dump(receipt)

    clearance = _read_clearance(contract, requester, reference)
    assert clearance["decision"] in {"ALLOW", "REVIEW"}
    assert clearance["to_address"].lower() == TARGET_ADDRESS.lower()
    assert clearance["action_kind"] == "ERC20_TRANSFER"
    assert json.loads(clearance["evidence_urls_json"]) == sorted(EVIDENCE_URLS)
    source_results = json.loads(clearance["source_results_json"])
    assert len(source_results) == 2
    assert all(source["status"] == "AVAILABLE" for source in source_results)
    assert all(len(source["sha256"]) == 64 for source in source_results)
    facts = json.loads(clearance["facts_json"])
    assert len(facts) == 7
    assert all(fact["status"] in {"SUPPORTED", "CONTRADICTED", "UNCLEAR"} for fact in facts)
    print(json.dumps({
        "clearance_digest": clearance["clearance_digest"],
        "clearance_id": clearance["clearance_id"],
        "decision": clearance["decision"],
        "evidence_sha256": [source["sha256"] for source in source_results],
        "reason_codes": json.loads(clearance["reason_codes_json"]),
        "transaction_hash": tx_hash,
    }, sort_keys=True))
