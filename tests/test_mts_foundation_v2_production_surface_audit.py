"""Executable production-surface audit for Gate-P issue #238.

These tests do not accept or migrate production semantics.  They pin the current
legacy surface and the selected replacement boundary so later cutover work
cannot quietly hide old semantics behind renamed adapters.
"""
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / "contracts/mts-foundation-v2-production-surface-audit-v0.7.json"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_audit_is_nonaccepting_gate_p_inventory():
    audit = read(AUDIT)
    assert audit["schema"] == "mts-foundation-v2-production-surface-audit/v0.7"
    assert audit["status"] == "gate-p-audit"
    assert audit["accepted"] is False
    assert audit["issue"] == 238
    assert audit["parent"] == 237


def test_required_production_surfaces_are_classified():
    audit = read(AUDIT)
    by_path = {item["path"]: item for item in audit["surfaces"]}
    required = {
        "core/semantic_carrier.py",
        "core/mtc_ast.py",
        "core/mtc_parser.py",
        "core/mtc_interpreter.py",
        "core/reference_model.py",
        "core/mtc_definitions.py",
        "core/proof_checker.py",
        "core/anum_recursive_denotation.py",
        "core/anum_protocol.py",
        "converters/l4_backend_driver.py",
    }
    assert required <= set(by_path)
    assert {item["classification"] for item in by_path.values()} <= {
        "PRESERVE",
        "TOOLING_ONLY",
        "REPLACE",
        "HISTORICAL_REPLAY_ONLY",
    }


def test_current_main_debt_markers_really_exist():
    parser = (ROOT / "core/mtc_parser.py").read_text(encoding="utf-8")
    ast = (ROOT / "core/mtc_ast.py").read_text(encoding="utf-8")
    interpreter = (ROOT / "core/mtc_interpreter.py").read_text(encoding="utf-8")
    reference = (ROOT / "core/reference_model.py").read_text(encoding="utf-8")
    carrier = (ROOT / "core/semantic_carrier.py").read_text(encoding="utf-8")

    assert "class TokenKind(Enum)" in parser
    assert "_SINGLE_CHAR_TOKENS" in parser
    assert '"♀": TokenKind.START' in parser
    assert '"♂": TokenKind.END' in parser

    assert "class ContextPronoun(Form)" in ast
    assert "class StartProjection(Form)" in ast
    assert "class EndProjection(Form)" in ast

    assert "class ContextFrame:" in interpreter
    assert "parent: \"ContextFrame | None\"" in interpreter
    assert "find_start_projection" in interpreter
    assert "find_end_projection" in interpreter
    assert "isinstance(expression, Equality)" in interpreter

    assert "typed AST" in reference
    assert "ContextFrame" in reference
    assert "↑ поднимает к parent context" in reference

    assert "class LinkNode:" in carrier
    assert "start: int" in carrier and "end: int" in carrier
    assert "cycles and sharing are allowed" in carrier
    assert "is NOT the semantics of the L2 equality operator" in carrier


def test_selected_substrate_has_exact_occurrence_without_semantic_tags():
    selected = read(AUDIT)["selectedSubstrateDirection"]
    assert selected["name"] == "exact-occurrence-binary-link-network"
    assert selected["linkShape"] == "Link(startRef,endRef) only"
    assert selected["supportsCycles"] is True
    assert selected["supportsSharing"] is True
    assert selected["distinguishedRootByExactRef"] is True
    assert selected["semanticTagsOnLink"] is False
    assert selected["contextDictionaryTheoryActAreLinks"] is True
    assert selected["sourceOccurrenceAndCanonicalContentAreDistinctRefs"] is True
    assert selected["localRepresentativeEvidenceExplicit"] is True
    assert selected["physicalAddressIsSemanticIdentity"] is False


def test_rejected_alternatives_close_known_semantic_escape_hatches():
    rejected = {item["name"]: item["reason"] for item in read(AUDIT)["rejectedSubstrateAlternatives"]}
    assert set(rejected) == {
        "CarrierGraph-isomorphism-as-identity",
        "typed-AST-node-as-semantic-identity",
        "backend-LinkRef-as-portable-identity",
        "ContextFrame-adapter",
    }
    assert "exact occurrence" in rejected["CarrierGraph-isomorphism-as-identity"]
    assert "host classes" in rejected["typed-AST-node-as-semantic-identity"]
    assert "across backends/runs" in rejected["backend-LinkRef-as-portable-identity"]
    assert "hidden parent/current" in rejected["ContextFrame-adapter"]


def test_consumer_findings_identify_non_test_blast_radius():
    findings = read(AUDIT)["consumerFindings"]
    assert findings["parseFormulaDirectProductionConsumers"] == [
        "core/root_library.py",
        "core/proof_checker.py",
    ]
    assert findings["interpretConstraintsDirectProductionConsumers"] == [
        "core/proof_checker.py"
    ]
    assert findings["historicalAndResearchTestConsumersExist"] is True
    assert findings["testClassificationRequiredBeforeDeletion"] is True
    assert findings["historicalContractsImmutable"] is True


def test_audit_does_not_authorize_parser_or_interpreter_rewrite_yet():
    next_gate = read(AUDIT)["nextImplementationGate"]
    assert "exact-occurrence substrate" in next_gate["allowedAfterAuditDecision"]
    assert next_gate["productionParserRewriteAllowedYet"] is False
    assert next_gate["productionInterpreterRewriteAllowedYet"] is False
    assert next_gate["downstreamRepinAllowed"] is False
