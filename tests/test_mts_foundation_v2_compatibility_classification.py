from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "mts-foundation-v2-compatibility-classification-v0.7.json"
ROOT_FIXTURE = ROOT / "tests" / "mtc_formulas.mtc"
ALLOWED = {
    "PRESERVE",
    "INTENTIONAL_DELTA",
    "HISTORICAL_REPLAY_ONLY",
    "REMOVE_AS_SUPERSEDED",
}
ROOT_FORMULAS_SHA256 = "1ccfb6fa0ae3c744dffcdefefcf2d5d96108573f4b04fdd8ac45a2e15a98ee3a"


def load() -> dict:
    return json.loads(CONTRACT.read_text(encoding="utf-8"))


def rows() -> dict[str, dict]:
    return {row["id"]: row for row in load()["rows"]}


def root_formula_text() -> str:
    lines = (
        line.strip()
        for line in ROOT_FIXTURE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    )
    return "\n".join(lines) + "\n"


def test_contract_is_nonaccepting_gate_p_classification() -> None:
    contract = load()
    assert contract["schema"] == "mts-foundation-v2-compatibility-classification/v0.7"
    assert contract["status"] == "gate-p-compatibility-classification"
    assert contract["accepted"] is False
    assert contract["issue"] == 269
    assert contract["parent"] == 237
    assert set(contract["classifications"]) == ALLOWED
    assert contract["rules"]["dualSemanticRuntimeAllowed"] is False
    assert contract["rules"]["downstreamRepinAllowed"] is False
    assert contract["rules"]["foundationV2AcceptedByThisContract"] is False


def test_all_required_behavior_rows_are_explicit() -> None:
    by_id = rows()
    required = {
        "root-ten-formula-program",
        "root-five-link-bootstrap",
        "anum-recursive-root-domain",
        "anum-root-opening-collapse",
        "anum-quote-relative-boundary",
        "anum-sequence-materialization",
        "contextframe-deixis",
        "legacy-contextframe-runtime",
        "historical-projection-glyphs",
        "ostensive-self-closure",
        "occurrence-local-identity",
        "equality-semantics",
        "definition-opening-history",
        "colon-definition-effect",
        "proof-trust-boundary",
        "historical-proof-relations",
        "source-formatting-diagnostics",
        "ast-token-semantic-authority",
        "l4-pair-interning",
        "l4-exact-occurrence-persistence",
        "read-effect-separation",
        "backend-address-semantic-identity",
        "historical-reference-model-runtime",
    }
    assert required == set(by_id)

    required_fields = {
        "id",
        "historicalSurface",
        "historicalObservable",
        "classification",
        "foundationV2Observable",
        "rationale",
        "historicalReplayOwner",
        "liveOwner",
        "replacementEvidence",
        "cutoverAction",
        "cutoverPrecondition",
    }
    for row in by_id.values():
        assert required_fields <= set(row), row["id"]
        assert row["classification"] in ALLOWED, row["id"]
        assert row["historicalObservable"], row["id"]
        assert row["foundationV2Observable"], row["id"]
        assert row["cutoverAction"], row["id"]
        assert row["cutoverPrecondition"], row["id"]


def test_all_four_classifications_are_used_deliberately() -> None:
    values = {row["classification"] for row in rows().values()}
    assert values == ALLOWED


def test_intentional_deltas_have_executable_replacement_evidence() -> None:
    for row in rows().values():
        if row["classification"] != "INTENTIONAL_DELTA":
            continue
        assert row["liveOwner"], row["id"]
        assert row["replacementEvidence"], row["id"]
        assert any("#" in item or "contracts/" in item for item in row["replacementEvidence"]), row["id"]


def test_superseded_live_surfaces_have_real_deletion_actions() -> None:
    removed = [row for row in rows().values() if row["classification"] == "REMOVE_AS_SUPERSEDED"]
    assert {row["id"] for row in removed} == {
        "legacy-contextframe-runtime",
        "ast-token-semantic-authority",
        "historical-reference-model-runtime",
    }
    for row in removed:
        action = row["cutoverAction"].lower()
        assert "delete" in action or "remove" in action, row["id"]
        assert row["cutoverPrecondition"], row["id"]


def test_rejected_old_semantics_can_never_be_preserve() -> None:
    by_id = rows()
    forbidden_preserve = {
        "contextframe-deixis",
        "legacy-contextframe-runtime",
        "historical-projection-glyphs",
        "ast-token-semantic-authority",
        "l4-pair-interning",
        "historical-reference-model-runtime",
    }
    for item in forbidden_preserve:
        assert by_id[item]["classification"] != "PRESERVE", item


def test_foundational_boundaries_cannot_accidentally_be_removed() -> None:
    by_id = rows()
    must_survive = {
        "anum-recursive-root-domain",
        "anum-root-opening-collapse",
        "anum-quote-relative-boundary",
        "occurrence-local-identity",
        "proof-trust-boundary",
        "source-formatting-diagnostics",
        "read-effect-separation",
    }
    for item in must_survive:
        assert by_id[item]["classification"] == "PRESERVE", item


def test_ostensive_forms_and_historical_projections_are_separate_rows() -> None:
    by_id = rows()
    historical = by_id["historical-projection-glyphs"]
    ostensive = by_id["ostensive-self-closure"]

    assert historical["classification"] == "HISTORICAL_REPLAY_ONLY"
    assert "♀F / F♂" in historical["historicalSurface"][0]
    assert "♂e = S=S⟼e" in historical["foundationV2Observable"]
    assert "b♀ = E=b⟼E" in historical["foundationV2Observable"]

    assert ostensive["classification"] == "INTENTIONAL_DELTA"
    assert "∞ / ♂e / b♀ / b⟼e" in ostensive["foundationV2Observable"]

    primary = load()["rules"]["ostensiveFoundationPrimary"]
    assert primary == ["∞", "♂e = S = S ⟼ e", "b♀ = E = b ⟼ E", "b ⟼ e"]


def test_anum_preservation_is_bounded_not_overclaimed() -> None:
    by_id = rows()
    assert by_id["anum-recursive-root-domain"]["classification"] == "PRESERVE"
    assert "accepted root domain" in by_id["anum-recursive-root-domain"]["foundationV2Observable"]
    assert by_id["anum-sequence-materialization"]["classification"] == "INTENTIONAL_DELTA"
    assert "fresh exact occurrence" in by_id["anum-sequence-materialization"]["foundationV2Observable"]


def test_l4_pair_interning_is_historical_only_and_persistence_is_delta() -> None:
    by_id = rows()
    assert by_id["l4-pair-interning"]["classification"] == "HISTORICAL_REPLAY_ONLY"
    assert "fresh occurrence" in by_id["l4-pair-interning"]["foundationV2Observable"]
    assert by_id["l4-exact-occurrence-persistence"]["classification"] == "INTENTIONAL_DELTA"
    assert "(lineage, local)" in by_id["l4-exact-occurrence-persistence"]["foundationV2Observable"]


def test_historical_accepted_umbrella_and_root_fixture_stay_immutable() -> None:
    assert hashlib.sha256(root_formula_text().encode("utf-8")).hexdigest() == ROOT_FORMULAS_SHA256
    assert len(root_formula_text().splitlines()) == 10

    for version in ("0.2", "0.3", "0.4", "0.5"):
        path = ROOT / "contracts" / f"mts-contract-v{version}.json"
        contract = json.loads(path.read_text(encoding="utf-8"))
        assert contract["schema"] == f"mts-contract/v{version}"
        assert contract["status"] == "accepted"

    recursive = json.loads(
        (ROOT / "contracts" / "anum-recursive-denotation-v0.2.json").read_text(encoding="utf-8")
    )
    assert recursive["schema"] == "anum-recursive-denotation/v0.2"
    assert recursive["status"] == "accepted"


def test_classification_is_not_cutover_or_acceptance_permission() -> None:
    policy = load()["cutoverPolicy"]
    assert policy["classificationDoesNotDeleteAnything"] is True
    assert policy["historicalAcceptedArtifactsRemainReplayable"] is True
    assert policy["liveCompatibilityFlagForbidden"] is True
    assert policy["implementationHistoryLivesInGit"] is True
    assert "no downstream repin" in policy["nextGateAfterDecision"]
