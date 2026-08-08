"""Executable non-normative challenge for issue #175.

The goal is not to redefine `♀`, `♂`, context pronouns or equality.  It exposes
which identity/canonicality choices are hidden behind the tempting rewrite
`◁ = ♀↑`, `▷ = ↑♂`, especially at the associative root and Anum boundary.
"""

from __future__ import annotations

import json
from pathlib import Path

from core.anum_memory import AnumMemory
from core.reference_model import SEMANTIC_RULES
from core.semantic_carrier import (
    CarrierGraph,
    associative_root_carrier,
    carrier_isomorphic,
    end_carrier,
    link_carrier,
    reachable_indices,
    start_carrier,
)


ROOT = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT / "contracts/mts-pole-projection-foundation-challenge-v0.6.json"
CURRENT_LINK_CHALLENGE = ROOT / "contracts/mts-current-link-foundation-challenge-v0.6.json"
ACT_CHALLENGE = ROOT / "contracts/mts-interpretation-act-network-challenge-v0.6.json"
ANUM_BOUNDARY = ROOT / "contracts/anum-boundary-projection-v0.2.json"
MTS_V05 = ROOT / "contracts/mts-contract-v0.5.json"
ROOT_FIXTURE = ROOT / "tests/mtc_formulas.mtc"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def equations() -> dict[str, str]:
    return {item.name: item.equation for item in SEMANTIC_RULES}


def satisfies_projection_equations(
    links: dict[int, tuple[int, int]],
    *,
    form: int,
    start_form: int,
    end_form: int,
) -> bool:
    """Test-local exact-identity reading of the three accepted carrier equations."""

    return (
        links[start_form] == (start_form, form)
        and links[end_form] == (form, end_form)
    )


def current_root_lines() -> list[str]:
    return [
        line.strip()
        for line in ROOT_FIXTURE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def test_challenge_is_non_normative_and_composes_prior_foundation_evidence():
    challenge = read(CHALLENGE)
    current = read(CURRENT_LINK_CHALLENGE)
    act = read(ACT_CHALLENGE)

    assert challenge["schema"] == "mts-pole-projection-foundation-challenge/v0.6"
    assert challenge["status"] == "candidate-challenge"
    assert challenge["accepted"] is False
    assert current["schema"] in challenge["dependsOn"]
    assert act["schema"] in challenge["dependsOn"]
    assert challenge["schema"] not in MTS_V05.read_text(encoding="utf-8")
    assert challenge["releaseVeto"]["acceptedContractLinkAllowed"] is False
    assert challenge["releaseVeto"]["productionSemanticPromotionAllowed"] is False


def test_reference_model_explicitly_distinguishes_raw_root_and_projection_form_equations():
    current = equations()

    assert current["associative-root-carrier"] == "root.start = root; root.end = root"
    assert current["start-form-carrier"] == (
        "start(F).start = start(F); start(F).end = F"
    )
    assert current["end-form-carrier"] == (
        "end(F).start = F; end(F).end = end(F)"
    )


def test_current_semantic_carrier_selects_non_degenerate_root_projection_neighborhood():
    root = associative_root_carrier()
    start = start_carrier(root)
    end = end_carrier(root)

    assert len(reachable_indices(root)) == 1
    assert len(reachable_indices(start)) == 2
    assert len(reachable_indices(end)) == 2

    assert root.root_node.start == root.root
    assert root.root_node.end == root.root
    assert start.root_node.start == start.root
    assert start.root_node.end == root.root
    assert end.root_node.start == root.root
    assert end.root_node.end == end.root

    assert not carrier_isomorphic(root, start)
    assert not carrier_isomorphic(root, end)
    assert not carrier_isomorphic(start, end)


def test_bare_projection_equations_also_admit_degenerate_root_fixed_point():
    non_degenerate = {
        0: (0, 0),  # R
        1: (1, 0),  # S = start(R)
        2: (0, 2),  # E = end(R)
    }
    degenerate = {0: (0, 0)}

    assert satisfies_projection_equations(
        non_degenerate,
        form=0,
        start_form=1,
        end_form=2,
    )
    assert satisfies_projection_equations(
        degenerate,
        form=0,
        start_form=0,
        end_form=0,
    )

    challenge = read(CHALLENGE)["canonicalityProblem"]
    assert challenge["bareEquationsSelectUniqueRootProjectionIdentity"] is False
    assert challenge["referenceConstructorSelectsNonDegenerateModel"] is True
    assert challenge["decisionRequired"] is True


def test_non_degenerate_root_neighborhood_is_compatible_with_exact_pair_l4_memory():
    initial = {
        0: (0, 0),
        1: (1, 0),
        2: (0, 2),
    }
    memory = AnumMemory(initial)

    assert memory.poles(0) == (0, 0)
    assert memory.poles(1) == (1, 0)
    assert memory.poles(2) == (0, 2)
    assert memory.find_link(0, 0) == 0
    assert memory.find_link(1, 0) == 1
    assert memory.find_link(0, 2) == 2
    assert memory.intern_link(0, 0) == 0
    assert memory.intern_link(1, 0) == 1
    assert memory.intern_link(0, 2) == 2
    assert memory.link_count == 3

    correction = read(CHALLENGE)["l4Correction"]
    assert correction["nonDegenerateRootNeighborhoodHasUniqueExactPairs"] is True
    assert correction["representableByCurrentAnumMemoryClosedBootstrap"] is True
    assert correction["thereIsNoNecessaryL1L4ConflictHere"] is True


def test_raw_pole_projection_collapses_root_open_close_and_reversed_protocol_forms():
    root = associative_root_carrier()

    # P1 reads both start and end directly from the raw self-cycle root.
    raw_open: CarrierGraph = root
    raw_close: CarrierGraph = root
    raw_one = link_carrier(raw_open, raw_close)
    raw_zero = link_carrier(raw_close, raw_open)

    assert carrier_isomorphic(raw_open, raw_close)
    assert carrier_isomorphic(raw_one, raw_zero)

    model = next(
        item for item in read(CHALLENGE)["candidateModels"] if item["id"] == "P1-raw-pole-collapse"
    )
    assert model["status"] == "reject-if-preserving-current-anum-boundary"


def test_non_degenerate_semantic_projection_forms_preserve_root_orientation():
    root = associative_root_carrier()
    semantic_open = start_carrier(root)
    semantic_close = end_carrier(root)
    one = link_carrier(semantic_open, semantic_close)
    zero = link_carrier(semantic_close, semantic_open)

    assert not carrier_isomorphic(semantic_open, semantic_close)
    assert not carrier_isomorphic(one, zero)

    boundary = read(ANUM_BOUNDARY)
    assert boundary["orientation"] == {"open": "♀∞", "close": "∞♂"}
    projected = {item["protocolValue"]: item["form"] for item in boundary["projection"] if item["protocolValue"]}
    assert projected["1"] == "♀∞ ⟼ ∞♂"
    assert projected["0"] == "∞♂ ⟼ ♀∞"


def test_mechanical_deictic_rewrite_selects_projection_fixed_point_under_identity_reading():
    challenge = read(CHALLENGE)["deicticCandidate"]
    current = 0
    semantic_start = 1
    semantic_end = 2

    assert semantic_start != current
    assert semantic_end != current
    assert challenge["proposal"] == [
        "↑ := current relation X",
        "◁ := ♀↑",
        "▷ := ↑♂",
    ]
    assert challenge["ifCurrentIsRootAndEqualityIsIdentity"] == [
        "start(∞)=∞",
        "end(∞)=∞",
    ]

    # The current non-degenerate reference does not satisfy those *identity*
    # requirements.  This is structural evidence only; it is deliberately not
    # an assertion that L2 equality equals carrier_isomorphic.
    assert semantic_start != current or semantic_end != current
    assert challenge["accepted"] is False


def test_separate_context_link_does_not_escape_identity_fixed_point_by_itself():
    # Let R be the raw self-closed root. If the exact same R is required to be
    # both start(K)=(R,K) and end(K)=(K,R), its already fixed poles (R,R)
    # force K=R.  This does not prove anything about a future non-identity
    # equality relation; it only closes the naive identity workaround.
    links = {
        0: (0, 0),  # R
        1: (1, 0),  # one ordinary start-form candidate around R
        2: (0, 2),
    }
    root = 0
    candidates = [
        ref
        for ref in links
        if links[root] == (root, ref) and links[root] == (ref, root)
    ]

    assert candidates == [root]
    escape = read(CHALLENGE)["separateContextLinkEscape"]
    assert escape["underExactPoleIdentityAndRootSelfCycle"].startswith("K is forced to ∞")
    assert escape["accepted"] is False


def test_historical_root_and_anum_artifacts_remain_unchanged_by_challenge():
    lines = current_root_lines()
    boundary = read(ANUM_BOUNDARY)

    assert len(lines) == 10
    assert "∞ : {◁ = ∞, ▷ = ∞}" in lines
    assert "([) : (♀∞)" in lines
    assert "(]) : (∞♂)" in lines
    assert boundary["status"] == "accepted-subset"
    assert read(CHALLENGE)["effectsVeto"]["rootFixtureChanged"] is False
    assert read(CHALLENGE)["effectsVeto"]["anumProtocolChanged"] is False


def test_no_projection_or_deictic_candidate_is_promoted():
    candidates = read(CHALLENGE)["candidateModels"]

    assert {item["id"] for item in candidates} == {
        "P0-historical-split-context",
        "P1-raw-pole-collapse",
        "P2-semantic-neighbourhood-deixis",
        "P3-form-denotation-split",
        "P4-intensional-projection-identity",
    }
    assert all(item["accepted"] is False for item in candidates)
