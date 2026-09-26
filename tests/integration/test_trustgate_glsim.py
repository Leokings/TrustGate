"""Five-validator GLSim consensus tests for TrustGate."""

from __future__ import annotations

import json
from pathlib import Path

from gltest import create_accounts, get_contract_factory, get_validator_factory
from gltest.assertions import tx_execution_succeeded
from gltest.types import TransactionStatus
from gltest.utils import extract_contract_address


TEST_DATETIME = "2026-09-24T12:00:00Z"
CHAIN_ID = 1
TARGET_ADDRESS = "0x1111111111111111111111111111111111111111"
SPENDER_ADDRESS = "0x3333333333333333333333333333333333333333"
EVIDENCE_URL = "https://evidence.example.com/acme-security-report.txt"
SAFE_INTENT = "Verify the official Acme destination without transferring native value."
SAFE_SOURCE = (
    "Acme publishes 0x1111111111111111111111111111111111111111 as its official contract address. "
    "The deployed source code is verified and matches the published Acme release. "
    "The proxy administrator and upgrade controls are disclosed in the deployment record. "
    "The independent security review supports the project's stated audit claims. "
    "No credible scam, phishing, exploit, or abuse reports were found for this target in this report. "
    "The zero-value verification call matches the user's stated verification intent. "
    "This transaction complies with the Balanced policy requirements."
)


def _compact(value) -> str:
    return json.dumps(value, separators=(",", ":"))


def _receipt_dump(receipt) -> str:
    return json.dumps(receipt, indent=2, sort_keys=True, default=str)


def _fact(key: str, status: str, excerpt: str = "") -> dict:
    if status == "UNCLEAR":
        return {"key": key, "status": status, "source_index": -1, "excerpt": ""}
    return {"key": key, "status": status, "source_index": 0, "excerpt": excerpt}


def _safe_facts() -> list[dict]:
    return [
        _fact(
            "TARGET_IDENTITY_MATCHES",
            "SUPPORTED",
            "Acme publishes 0x1111111111111111111111111111111111111111 as its official contract address.",
        ),
        _fact(
            "SOURCE_OR_BYTECODE_VERIFIED",
            "SUPPORTED",
            "The deployed source code is verified and matches the published Acme release.",
        ),
        _fact(
            "PRIVILEGED_CONTROL_DISCLOSED",
            "SUPPORTED",
            "The proxy administrator and upgrade controls are disclosed in the deployment record.",
        ),
        _fact(
            "SECURITY_CLAIMS_SUPPORTED",
            "SUPPORTED",
            "The independent security review supports the project's stated audit claims.",
        ),
        _fact(
            "CREDIBLE_ABUSE_REPORTS_PRESENT",
            "CONTRADICTED",
            "No credible scam, phishing, exploit, or abuse reports were found for this target in this report.",
        ),
        _fact(
            "ACTION_MATCHES_STATED_INTENT",
            "SUPPORTED",
            "The zero-value verification call matches the user's stated verification intent.",
        ),
        _fact(
            "CUSTOM_POLICY_COMPLIANT",
            "SUPPORTED",
            "This transaction complies with the Balanced policy requirements.",
        ),
    ]


def _approval_calldata(amount: int) -> str:
    return "0x095ea7b3" + ("0" * 24) + SPENDER_ADDRESS[2:] + f"{amount:064x}"


def _deploy():
    owner = create_accounts(1)[0]
    contract_path = Path(__file__).resolve().parents[2] / "contracts" / "TrustGate.py"
    factory = get_contract_factory(contract_file_path=contract_path)
    receipt = factory.deploy_contract_tx(
        args=[],
        account=owner,
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    assert tx_execution_succeeded(receipt), _receipt_dump(receipt)
    return factory.build_contract(extract_contract_address(receipt), account=owner), owner


def _validator_context() -> dict:
    validators = get_validator_factory().batch_create_mock_validators(
        5,
        mock_llm_response={
            "nondet_exec_prompt": {
                "TRUSTGATE_EVIDENCE_EVALUATION_V1": _compact({"facts": _safe_facts()})
            }
        },
        mock_web_response={
            "nondet_web_request": {
                EVIDENCE_URL: {"method": "GET", "status": 200, "body": SAFE_SOURCE}
            }
        },
    )
    return {
        "validators": [validator.to_dict() for validator in validators],
        "genvm_datetime": TEST_DATETIME,
    }


def _request_args(owner_address: str, reference: str, calldata: str, evidence_urls: list[str]) -> list:
    return [
        reference,
        "balanced-v1",
        CHAIN_ID,
        7,
        owner_address.lower(),
        TARGET_ADDRESS,
        0,
        calldata,
        SAFE_INTENT,
        _compact(evidence_urls),
        3600,
    ]


def test_glsim_deployment_exposes_built_in_policy_state():
    contract, owner = _deploy()

    info = contract.get_contract_info(args=[]).call()
    balanced = contract.get_policy(args=["balanced-v1"]).call()

    assert info["policy_count"] == 3
    assert info["clearance_count"] == 0
    assert balanced["owner"].lower() == str(owner.address).lower()
    assert balanced["block_unlimited_approvals"] is True
    assert balanced["require_verified_source"] is True


def test_glsim_deterministic_block_finalizes_without_external_evidence():
    contract, owner = _deploy()
    receipt = contract.request_clearance(
        args=_request_args(
            str(owner.address),
            "glsim-blocked-approval",
            _approval_calldata(2**256 - 1),
            [],
        )
    ).transact(wait_transaction_status=TransactionStatus.FINALIZED)
    assert tx_execution_succeeded(receipt), _receipt_dump(receipt)

    clearance = contract.get_clearance(args=[1]).call()
    assert clearance["decision"] == "BLOCK"
    assert json.loads(clearance["reason_codes_json"]) == ["UNLIMITED_TOKEN_APPROVAL"]
    assert contract.get_clearance_count(args=[]).call() == 1


def test_glsim_five_validators_finalize_evidence_backed_allow():
    contract, owner = _deploy()
    receipt = contract.request_clearance(
        args=_request_args(str(owner.address), "glsim-safe-allow", "0x", [EVIDENCE_URL])
    ).transact(
        transaction_context=_validator_context(),
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    assert tx_execution_succeeded(receipt), _receipt_dump(receipt)

    clearance = contract.get_clearance(args=[1]).call()
    assert clearance["decision"] == "ALLOW"
    assert json.loads(clearance["reason_codes_json"]) == []
    assert json.loads(clearance["facts_json"])[0]["status"] == "SUPPORTED"
    assert json.loads(clearance["source_results_json"])[0]["status"] == "AVAILABLE"
    assert len(clearance["clearance_digest"]) == 64
