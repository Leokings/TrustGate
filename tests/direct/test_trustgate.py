import json
from pathlib import Path
import re

import pytest

from gltest.direct.sdk_loader import setup_sdk_paths


CONTRACT_PATH = Path("contracts/TrustGate.py")
TEST_TIME = "2026-09-24T12:00:00Z"
CHAIN_ID = 1
TRANSACTION_NONCE = 7
FROM_ADDRESS = "0x2222222222222222222222222222222222222222"
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


def as_address(value):
    from genlayer.py.types import Address

    return Address(value) if isinstance(value, (bytes, str)) else value


def address_text(value) -> str:
    return as_address(value).as_hex.lower()


def deploy_gate(direct_vm, direct_deploy, sender):
    setup_sdk_paths(CONTRACT_PATH, "v0.2.16")
    direct_vm.sender = as_address(sender)
    direct_vm.value = 0
    direct_vm.warp(TEST_TIME)
    direct_vm.check_pickling = True
    return direct_deploy(str(CONTRACT_PATH))


def approval_calldata(amount: int) -> str:
    return "0x095ea7b3" + ("0" * 24) + SPENDER_ADDRESS[2:] + f"{amount:064x}"


def operator_approval_calldata(enabled: bool = True) -> str:
    return "0xa22cb465" + ("0" * 24) + SPENDER_ADDRESS[2:] + f"{int(enabled):064x}"


def source_fact(key: str, status: str, excerpt: str = "") -> dict:
    if status == "UNCLEAR":
        return {"key": key, "status": status, "source_index": -1, "excerpt": ""}
    return {"key": key, "status": status, "source_index": 0, "excerpt": excerpt}


def safe_facts() -> list[dict]:
    return [
        source_fact(
            "TARGET_IDENTITY_MATCHES",
            "SUPPORTED",
            "Acme publishes 0x1111111111111111111111111111111111111111 as its official contract address.",
        ),
        source_fact(
            "SOURCE_OR_BYTECODE_VERIFIED",
            "SUPPORTED",
            "The deployed source code is verified and matches the published Acme release.",
        ),
        source_fact(
            "PRIVILEGED_CONTROL_DISCLOSED",
            "SUPPORTED",
            "The proxy administrator and upgrade controls are disclosed in the deployment record.",
        ),
        source_fact(
            "SECURITY_CLAIMS_SUPPORTED",
            "SUPPORTED",
            "The independent security review supports the project's stated audit claims.",
        ),
        source_fact(
            "CREDIBLE_ABUSE_REPORTS_PRESENT",
            "CONTRADICTED",
            "No credible scam, phishing, exploit, or abuse reports were found for this target in this report.",
        ),
        source_fact(
            "ACTION_MATCHES_STATED_INTENT",
            "SUPPORTED",
            "The zero-value verification call matches the user's stated verification intent.",
        ),
        source_fact(
            "CUSTOM_POLICY_COMPLIANT",
            "SUPPORTED",
            "This transaction complies with the Balanced policy requirements.",
        ),
    ]


def mock_source(direct_vm, body=SAFE_SOURCE, status=200):
    direct_vm.mock_web(
        re.escape(EVIDENCE_URL),
        {
            "method": "GET",
            "response": {
                "status": status,
                "headers": {"content-type": b"text/plain"},
                "body": body.encode("utf-8"),
            },
        },
    )


def mock_facts(direct_vm, facts):
    direct_vm.mock_llm(
        r".*TRUSTGATE_EVIDENCE_EVALUATION_V1.*",
        json.dumps({"facts": facts}),
    )


def request(
    contract,
    reference: str,
    *,
    policy_id="balanced-v1",
    transaction_nonce=TRANSACTION_NONCE,
    value_wei=0,
    calldata="0x",
    intent=SAFE_INTENT,
    evidence=None,
):
    urls = [EVIDENCE_URL] if evidence is None else evidence
    return contract.request_clearance(
        reference,
        policy_id,
        CHAIN_ID,
        transaction_nonce,
        FROM_ADDRESS,
        TARGET_ADDRESS,
        value_wei,
        calldata,
        intent,
        json.dumps(urls, separators=(",", ":")),
        3600,
    )


def test_contract_uses_pinned_runner():
    first_line = CONTRACT_PATH.read_text(encoding="utf-8").splitlines()[0]
    assert first_line.startswith('# { "Depends": "py-genlayer:')
    assert "test" not in first_line
    assert "latest" not in first_line


def test_deployment_seeds_three_policies(direct_vm, direct_deploy, direct_alice):
    contract = deploy_gate(direct_vm, direct_deploy, direct_alice)

    assert contract.get_policy_count() == 3
    assert contract.get_contract_info()["clearance_count"] == 0
    balanced = contract.get_policy("balanced-v1")
    assert balanced["name"] == "Balanced"
    assert balanced["block_unlimited_approvals"] is True
    assert balanced["require_verified_source"] is True


def test_user_can_create_and_deactivate_custom_policy(direct_vm, direct_deploy, direct_alice):
    contract = deploy_gate(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = as_address(direct_alice)

    policy_id = contract.create_policy(
        "agent-safe",
        "Agent Safe",
        "Block unlimited approvals and require the destination identity and requested action to be independently verified.",
        2 * 10**18,
        True,
        True,
        True,
    )

    assert policy_id == address_text(direct_alice) + ":agent-safe"
    assert contract.get_policy(policy_id)["active"] is True
    contract.deactivate_policy(policy_id)
    with direct_vm.expect_revert("POLICY_INACTIVE"):
        contract.get_policy(policy_id)


def test_only_policy_owner_can_deactivate(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_gate(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = as_address(direct_alice)
    policy_id = contract.create_policy(
        "owner-only",
        "Owner Only",
        "Require independently verified identity and block every transaction that conflicts with the stated user intent.",
        10**18,
        True,
        True,
        True,
    )

    direct_vm.sender = as_address(direct_bob)
    with direct_vm.expect_revert("POLICY_OWNER"):
        contract.deactivate_policy(policy_id)


def test_preview_blocks_unlimited_approval(direct_vm, direct_deploy, direct_alice):
    contract = deploy_gate(direct_vm, direct_deploy, direct_alice)
    preview = contract.preview_transaction(
        "balanced-v1",
        CHAIN_ID,
        TRANSACTION_NONCE,
        FROM_ADDRESS,
        TARGET_ADDRESS,
        0,
        approval_calldata(2**256 - 1),
        "Approve the exact amount required for a token swap.",
    )

    assert preview["decision"] == "BLOCK"
    assert preview["action_kind"] == "ERC20_APPROVE"
    assert json.loads(preview["reason_codes_json"]) == ["UNLIMITED_TOKEN_APPROVAL"]


def test_preview_requires_consensus_for_non_blocked_transaction(direct_vm, direct_deploy, direct_alice):
    contract = deploy_gate(direct_vm, direct_deploy, direct_alice)
    preview = contract.preview_transaction(
        "balanced-v1",
        CHAIN_ID,
        TRANSACTION_NONCE,
        FROM_ADDRESS,
        TARGET_ADDRESS,
        0,
        "0x",
        SAFE_INTENT,
    )

    assert preview["decision"] == "REQUIRES_CONSENSUS"
    assert preview["action_kind"] == "NATIVE_TRANSFER"
    assert json.loads(preview["reason_codes_json"]) == []


def test_transaction_nonce_is_bound_into_transaction_digest(direct_vm, direct_deploy, direct_alice):
    contract = deploy_gate(direct_vm, direct_deploy, direct_alice)

    first = contract.preview_transaction(
        "balanced-v1",
        CHAIN_ID,
        TRANSACTION_NONCE,
        FROM_ADDRESS,
        TARGET_ADDRESS,
        0,
        "0x",
        SAFE_INTENT,
    )
    next_nonce = contract.preview_transaction(
        "balanced-v1",
        CHAIN_ID,
        TRANSACTION_NONCE + 1,
        FROM_ADDRESS,
        TARGET_ADDRESS,
        0,
        "0x",
        SAFE_INTENT,
    )

    assert first["transaction_digest"] != next_nonce["transaction_digest"]


def test_clearance_requester_must_match_from_address(direct_vm, direct_deploy, direct_alice):
    contract = deploy_gate(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = as_address("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")

    with direct_vm.expect_revert("FROM_ADDRESS_REQUESTER"):
        request(contract, "mismatched-requester-1", evidence=[])
    assert contract.get_clearance_count() == 0


def test_deterministic_block_is_recorded_without_sources_or_llm(direct_vm, direct_deploy, direct_alice):
    contract = deploy_gate(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = as_address(FROM_ADDRESS)

    clearance_id = request(
        contract,
        "blocked-approval-1",
        calldata=approval_calldata(2**256 - 1),
        intent="Approve only the amount required for a token swap.",
        evidence=[],
    )
    record = contract.get_clearance(clearance_id)

    assert record["decision"] == "BLOCK"
    assert record["transaction_nonce"] == TRANSACTION_NONCE
    assert json.loads(record["reason_codes_json"]) == ["UNLIMITED_TOKEN_APPROVAL"]
    assert record["action_kind"] == "ERC20_APPROVE"
    assert "unlimited token allowance" in record["summary"]


def test_operator_approval_is_blocked(direct_vm, direct_deploy, direct_alice):
    contract = deploy_gate(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = as_address(FROM_ADDRESS)

    clearance_id = request(
        contract,
        "blocked-operator-1",
        calldata=operator_approval_calldata(),
        intent="List one NFT without granting collection-wide permissions.",
        evidence=[],
    )

    record = contract.get_clearance(clearance_id)
    assert record["decision"] == "BLOCK"
    assert "OPERATOR_APPROVAL" in json.loads(record["reason_codes_json"])


def test_policy_value_limit_is_enforced(direct_vm, direct_deploy, direct_alice):
    contract = deploy_gate(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = as_address(FROM_ADDRESS)

    clearance_id = request(
        contract,
        "blocked-value-1",
        policy_id="conservative-v1",
        value_wei=2 * 10**18,
        intent="Send two native tokens to the official destination.",
        evidence=[],
    )

    assert contract.get_clearance(clearance_id)["decision"] == "BLOCK"
    assert json.loads(contract.get_clearance(clearance_id)["reason_codes_json"]) == ["VALUE_LIMIT_EXCEEDED"]


def test_no_evidence_fails_closed_to_review(direct_vm, direct_deploy, direct_alice):
    contract = deploy_gate(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = as_address(FROM_ADDRESS)

    clearance_id = request(contract, "review-no-evidence-1", evidence=[])
    record = contract.get_clearance(clearance_id)

    assert record["decision"] == "REVIEW"
    assert json.loads(record["reason_codes_json"]) == ["NO_EVIDENCE"]


def test_consensus_evidence_can_allow_transaction(direct_vm, direct_deploy, direct_alice):
    contract = deploy_gate(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = as_address(FROM_ADDRESS)
    mock_source(direct_vm)
    mock_facts(direct_vm, safe_facts())

    clearance_id = request(contract, "allow-safe-1")
    record = contract.get_clearance(clearance_id)

    assert record["decision"] == "ALLOW"
    assert json.loads(record["reason_codes_json"]) == []
    assert json.loads(record["facts_json"])[0]["status"] == "SUPPORTED"
    assert json.loads(record["source_results_json"])[0]["status"] == "AVAILABLE"
    assert record["expires_at"] > record["created_at"]
    by_reference = contract.get_clearance_by_reference(FROM_ADDRESS, "allow-safe-1")
    assert by_reference["clearance_digest"] == record["clearance_digest"]


def test_validator_accepts_independently_reproduced_clearance(direct_vm, direct_deploy, direct_alice):
    contract = deploy_gate(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = as_address(FROM_ADDRESS)
    mock_source(direct_vm)
    mock_facts(direct_vm, safe_facts())
    request(contract, "validator-agrees-1")

    direct_vm.clear_mocks()
    mock_source(direct_vm)
    mock_facts(direct_vm, safe_facts())

    assert direct_vm.run_validator() is True


def test_validator_rejects_divergence_that_changes_the_enforced_outcome(direct_vm, direct_deploy, direct_alice):
    contract = deploy_gate(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = as_address(FROM_ADDRESS)
    mock_source(direct_vm)
    mock_facts(direct_vm, safe_facts())
    request(contract, "validator-disagrees-1")

    divergent_facts = safe_facts()
    divergent_facts[5] = source_fact("ACTION_MATCHES_STATED_INTENT", "UNCLEAR")
    direct_vm.clear_mocks()
    mock_source(direct_vm)
    mock_facts(direct_vm, divergent_facts)

    assert direct_vm.run_validator() is False


def test_validator_accepts_non_material_fact_variance(direct_vm, direct_deploy, direct_alice):
    contract = deploy_gate(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = as_address(FROM_ADDRESS)
    mock_source(direct_vm)
    mock_facts(direct_vm, safe_facts())
    request(contract, "validator-material-key-1")

    divergent_facts = safe_facts()
    divergent_facts[2] = source_fact("PRIVILEGED_CONTROL_DISCLOSED", "UNCLEAR")
    divergent_facts[3] = source_fact("SECURITY_CLAIMS_SUPPORTED", "UNCLEAR")
    divergent_facts[4] = source_fact("CREDIBLE_ABUSE_REPORTS_PRESENT", "UNCLEAR")
    direct_vm.clear_mocks()
    mock_source(direct_vm)
    mock_facts(direct_vm, divergent_facts)

    assert direct_vm.run_validator() is True


def test_credible_abuse_report_blocks(direct_vm, direct_deploy, direct_alice):
    body = SAFE_SOURCE + " Credible phishing and wallet-drainer reports identify this exact target address."
    facts = safe_facts()
    facts[4] = source_fact(
        "CREDIBLE_ABUSE_REPORTS_PRESENT",
        "SUPPORTED",
        "Credible phishing and wallet-drainer reports identify this exact target address.",
    )
    contract = deploy_gate(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = as_address(FROM_ADDRESS)
    mock_source(direct_vm, body)
    mock_facts(direct_vm, facts)

    clearance_id = request(contract, "block-abuse-1")
    record = contract.get_clearance(clearance_id)

    assert record["decision"] == "BLOCK"
    assert "CREDIBLE_ABUSE_REPORTS" in json.loads(record["reason_codes_json"])


def test_unknown_intent_fails_closed_to_review(direct_vm, direct_deploy, direct_alice):
    facts = safe_facts()
    facts[5] = source_fact("ACTION_MATCHES_STATED_INTENT", "UNCLEAR")
    contract = deploy_gate(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = as_address(FROM_ADDRESS)
    mock_source(direct_vm)
    mock_facts(direct_vm, facts)

    clearance_id = request(contract, "review-intent-1")
    record = contract.get_clearance(clearance_id)

    assert record["decision"] == "REVIEW"
    assert "TRANSACTION_INTENT_UNCLEAR" in json.loads(record["reason_codes_json"])


def test_unavailable_evidence_fails_closed_without_llm(direct_vm, direct_deploy, direct_alice):
    contract = deploy_gate(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = as_address(FROM_ADDRESS)
    mock_source(direct_vm, "not found", status=404)

    clearance_id = request(contract, "review-unavailable-1")
    record = contract.get_clearance(clearance_id)

    assert record["decision"] == "REVIEW"
    assert json.loads(record["reason_codes_json"]) == ["EVIDENCE_UNAVAILABLE"]


@pytest.mark.parametrize("status", [408, 429, 500, 503])
def test_transient_source_failure_does_not_write_state(direct_vm, direct_deploy, direct_alice, status):
    contract = deploy_gate(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = as_address(FROM_ADDRESS)
    mock_source(direct_vm, "temporary", status=status)

    with direct_vm.expect_revert("[TRANSIENT]"):
        request(contract, f"transient-{status}")
    assert contract.get_clearance_count() == 0


def test_llm_citation_must_exist_in_source(direct_vm, direct_deploy, direct_alice):
    facts = safe_facts()
    facts[0] = source_fact("TARGET_IDENTITY_MATCHES", "SUPPORTED", "This quotation does not exist in the source.")
    contract = deploy_gate(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = as_address(FROM_ADDRESS)
    mock_source(direct_vm)
    mock_facts(direct_vm, facts)

    with direct_vm.expect_revert("[LLM_ERROR]"):
        request(contract, "bad-citation-1")
    assert contract.get_clearance_count() == 0


def test_request_reference_cannot_be_reused(direct_vm, direct_deploy, direct_alice):
    contract = deploy_gate(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = as_address(FROM_ADDRESS)
    request(contract, "unique-reference-1", evidence=[])

    with direct_vm.expect_revert("REQUEST_REFERENCE_EXISTS"):
        request(contract, "unique-reference-1", evidence=[])


@pytest.mark.parametrize(
    "bad_url",
    [
        "http://evidence.example.com/report.txt",
        "https://localhost/report.txt",
        "https://127.0.0.1/report.txt",
        "https://evidence.example.com/report.txt?dynamic=1",
    ],
)
def test_evidence_urls_must_be_public_stable_https(direct_vm, direct_deploy, direct_alice, bad_url):
    contract = deploy_gate(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = as_address(FROM_ADDRESS)

    with direct_vm.expect_revert("EVIDENCE_URL"):
        request(contract, "bad-url-1", evidence=[bad_url])
    assert contract.get_clearance_count() == 0
