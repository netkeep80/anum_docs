"""Production conformance for accepted mts-direct-deixis/v0.5."""

import inspect
import json
from pathlib import Path

from core.mtc_context_analysis import DeicticOccurrence, analyze_direct_deixis
from core.mtc_interpreter import ContextFrame, MemoryView, interpret_constraints
from core.mtc_parser import parse_formula


ROOT = Path(__file__).parents[1]
CONTRACT = ROOT / "contracts" / "mts-direct-deixis-v0.5.json"
CONFORMANCE = ROOT / "contracts" / "mts-direct-deixis-conformance-v0.5.json"
CHALLENGE_CORPUS = ROOT / "contracts" / "mts-direct-deixis-conformance-candidate-v0.5.json"
MTS_V04 = ROOT / "contracts" / "mts-contract-v0.4.json"
PROOF_V03 = ROOT / "contracts" / "mts-proof-v0.3.json"
CORE = ROOT / "core" / "mtc_context_analysis.py"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def portable(occurrences: tuple[DeicticOccurrence, ...]) -> list[dict]:
    return [
        {"path": list(item.path), "up": item.up, "pole": item.pole.value}
        for item in occurrences
    ]


class NoReadMemory(MemoryView):
    def poles(self, link: int) -> tuple[int, int]:
        raise AssertionError(f"unexpected poles({link})")

    def find_link(self, start: int, end: int) -> int | None:
        raise AssertionError(f"unexpected find_link({start}, {end})")

    def find_start_projection(self, form: int) -> int | None:
        raise AssertionError(f"unexpected find_start_projection({form})")

    def find_end_projection(self, form: int) -> int | None:
        raise AssertionError(f"unexpected find_end_projection({form})")


def root_sources() -> tuple[str, ...]:
    return tuple(
        line.strip()
        for line in ROOT_PROGRAM.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    )


def test_contract_is_accepted_but_not_retroactively_added_to_v04_umbrella():
    contract = read(CONTRACT)
    conformance = read(CONFORMANCE)

    assert contract["schema"] == "mts-direct-deixis/v0.5"
    assert contract["status"] == "accepted"
    assert contract["accepted"] is True
    assert conformance["schema"] == "mts-direct-deixis-conformance/v0.5"
    assert conformance["accepted"] is True
    assert conformance["contract"] == contract["schema"]
    assert contract["versioning"]["mtsContractV04Modified"] is False
    assert contract["versioning"]["publishedThroughUmbrella"] is False
    assert contract["schema"] not in MTS_V04.read_text(encoding="utf-8")


def test_accepted_conformance_selects_challenge_corpus_without_copying_vectors():
    conformance = read(CONFORMANCE)
    corpus = read(CHALLENGE_CORPUS)

    assert conformance["sourceCorpus"] == (
        "contracts/mts-direct-deixis-conformance-candidate-v0.5.json"
    )
    assert conformance["selection"] == {
        "vectors": "all",
        "equivalentSpellings": "all",
        "negativeClaims": "all",
    }
    assert conformance["promotion"]["copiesVectors"] is False
    assert "vectors" not in conformance
    assert corpus["status"] == "candidate-challenge-corpus"


def test_every_challenged_portable_vector_replays_exactly_in_production_core():
    for vector in read(CHALLENGE_CORPUS)["vectors"]:
        result = analyze_direct_deixis(parse_formula(vector["source"]))
        assert portable(result) == vector["expected"], vector["id"]


def test_every_equivalent_spelling_has_same_production_result():
    for vector in read(CHALLENGE_CORPUS)["equivalentSpellings"]:
        observed = [
            portable(analyze_direct_deixis(parse_formula(source)))
            for source in vector["sources"]
        ]
        assert all(result == vector["expected"] for result in observed), vector["id"]


def test_production_result_is_typed_ordered_and_structural():
    result = analyze_direct_deixis(parse_formula("{◁ = a, ↑▷ = b, ▷ = c}"))

    assert result == tuple(sorted(result))
    assert all(isinstance(item, DeicticOccurrence) for item in result)
    assert [item.path for item in result] == [(0, 0), (1, 0), (2, 0)]
    assert [item.up for item in result] == [0, 1, 0]
    assert [item.pole.value for item in result] == ["◁", "▷", "▷"]


def test_grouping_and_definition_target_body_paths_match_normative_contract():
    grouped = analyze_direct_deixis(parse_formula("((↑↑◁)) = a"))
    definition = analyze_direct_deixis(parse_formula("◁ : {▷ = a, ↑◁ = b}"))

    assert portable(grouped) == [{"path": [0, 0, 0], "up": 2, "pole": "◁"}]
    assert portable(definition) == [
        {"path": [0], "up": 0, "pole": "◁"},
        {"path": [1, 0, 0], "up": 0, "pole": "▷"},
        {"path": [1, 1, 0], "up": 1, "pole": "◁"},
    ]
    assert read(CONTRACT)["pathSemantics"]["groupingTransparent"] is False


def test_operation_has_no_runtime_definition_memory_or_interpreter_dependency():
    signature = inspect.signature(analyze_direct_deixis)
    core_source = CORE.read_text(encoding="utf-8")

    assert list(signature.parameters) == ["expression"]
    for forbidden in (
        "MemoryView",
        "DefinitionEnvironment",
        "open_definition",
        "interpret_constraints",
        "ContextFrame",
        "interpreter",
        "security",
        "policy",
    ):
        assert forbidden not in core_source

    operation = read(CONTRACT)["operation"]
    assert operation["readsMemory"] is False
    assert operation["readsDefinitionEnvironment"] is False
    assert operation["readsContextFrame"] is False
    assert operation["readsInterpreterIdentity"] is False
    assert operation["readsSecurityPolicy"] is False


def test_positive_direct_deixis_does_not_imply_semantic_context_sensitivity():
    source = "◁ = ◁"
    assert len(analyze_direct_deixis(parse_formula(source))) == 2

    first = interpret_constraints(
        parse_formula(source),
        ContextFrame(start=1, end=2),
        NoReadMemory(),
    )
    second = interpret_constraints(
        parse_formula(source),
        ContextFrame(start=999, end=1000),
        NoReadMemory(),
    )

    assert (first.success, first.holes, first.aliases) == (
        second.success,
        second.holes,
        second.aliases,
    )
    assert first.success is True
    assert read(CONTRACT)["meaningBoundary"]["positiveResultImpliesContextSensitivity"] is False


def test_empty_direct_deixis_result_does_not_claim_context_invariance():
    assert analyze_direct_deixis(parse_formula("[] = []")) == ()
    assert read(CONTRACT)["meaningBoundary"]["emptyResultImpliesContextInvariance"] is False


def test_proof_surface_is_unchanged_and_no_new_trusted_relation_exists():
    contract = read(CONTRACT)
    proof = read(PROOF_V03)

    assert "DirectDeictic" not in proof["trustedRelations"]
    assert "ContextInvariant" not in proof["trustedRelations"]
    assert contract["proofBoundary"]["trustedProofRelationAdded"] is False
    assert contract["proofBoundary"]["mtsProofV03Modified"] is False


def test_root_program_is_still_exactly_ten_and_analysis_is_repeatable():
    before = root_sources()
    first = tuple(analyze_direct_deixis(parse_formula(source)) for source in before)
    second = tuple(analyze_direct_deixis(parse_formula(source)) for source in before)
    after = root_sources()

    assert len(before) == 10
    assert before == after
    assert first == second
    assert any(result for result in first)
