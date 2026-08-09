"""Integrated non-normative MTS v0.6 foundation challenge for issue #190.

One finite semantic graph is reused across raw projection, current-link deixis,
local link comparison, Anum anchor binding and nested act/state vectors.  The
model is deliberately test-local: green evidence authorizes migration design,
not production semantics.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, fields
import json
from pathlib import Path

import pytest

from core.anum_denotation import canonical_denotation_json, denotation_from_data
from core.anum_memory import AnumMemory
from core.anum_model import ProjectionContext
from core.anum_parser import parse_raw_quaternary
from core.anum_recursive_denotation import canonical_recursive_anum, denotate_recursive_anum
from core.mtc_parser import MTCParseError, parse_formula


ROOT = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT / "contracts/mts-foundation-integrated-challenge-v0.6.json"
EQUALITY_DECISION = ROOT / "contracts/mts-current-link-equality-decision-v0.6.json"
ANUM_DECISION = ROOT / "contracts/mts-root-anum-foundation-decision-v0.6.json"
NESTING_DECISION = ROOT / "contracts/mts-nesting-continuation-foundation-decision-v0.6.json"
RECURSIVE_CORPUS = ROOT / "contracts/anum-recursive-denotation-conformance-v0.2.json"
MTS_V05 = ROOT / "contracts/mts-contract-v0.5.json"
ROOT_FIXTURE = ROOT / "tests/mtc_formulas.mtc"


@dataclass(frozen=True)
class Link:
    start: int
    end: int


@dataclass(frozen=True)
class IntegratedGraph:
    links: dict[int, Link]

    def validate_closed_unique_pairs(self) -> None:
        refs = set(self.links)
        pairs: set[tuple[int, int]] = set()
        for ref, link in self.links.items():
            assert link.start in refs, (ref, "start", link.start)
            assert link.end in refs, (ref, "end", link.end)
            pair = (link.start, link.end)
            assert pair not in pairs, (ref, "duplicate pair", pair)
            pairs.add(pair)

    def poles(self, ref: int) -> tuple[int, int]:
        link = self.links[ref]
        return link.start, link.end

    def closure(self, root: int) -> frozenset[int]:
        pending = deque([root])
        seen: set[int] = set()
        while pending:
            ref = pending.popleft()
            if ref in seen:
                continue
            seen.add(ref)
            link = self.links[ref]
            pending.extend((link.start, link.end))
        return frozenset(seen)

    def canonical_links(self) -> dict[str, list[int]]:
        return {
            str(ref): [self.links[ref].start, self.links[ref].end]
            for ref in sorted(self.links)
        }

    @classmethod
    def from_canonical_links(cls, data: dict[str, list[int]]) -> IntegratedGraph:
        graph = cls(
            {
                int(ref): Link(start=int(pair[0]), end=int(pair[1]))
                for ref, pair in data.items()
            }
        )
        graph.validate_closed_unique_pairs()
        return graph


@dataclass(frozen=True)
class ReplayPacket:
    links: dict[str, list[int]]
    current: int
    aliases: tuple[tuple[int, int], ...]
    raw_anum: str

    def canonical_json(self) -> str:
        return json.dumps(
            {
                "aliases": [list(item) for item in self.aliases],
                "current": self.current,
                "links": self.links,
                "rawAnum": self.raw_anum,
            },
            sort_keys=True,
            separators=(",", ":"),
        )

    @classmethod
    def from_json(cls, source: str) -> ReplayPacket:
        data = json.loads(source)
        return cls(
            links={str(key): [int(value[0]), int(value[1])] for key, value in data["links"].items()},
            current=int(data["current"]),
            aliases=tuple((int(left), int(right)) for left, right in data["aliases"]),
            raw_anum=str(data["rawAnum"]),
        )


@dataclass(frozen=True)
class LocalAliases:
    pairs: tuple[tuple[int, int], ...] = ()

    def representative(self, ref: int) -> int:
        parents = dict(self.pairs)
        seen: set[int] = set()
        current = ref
        while current in parents and parents[current] != current:
            if current in seen:
                raise ValueError("alias cycle")
            seen.add(current)
            current = parents[current]
        return current


def atom(ref: int) -> tuple[int, Link]:
    return ref, Link(ref, ref)


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def integrated_graph() -> tuple[IntegratedGraph, dict[str, int]]:
    ref = {
        "R": 0,
        "O": 1,
        "C": 2,
        "L": 3,
        "U": 4,
        "XEQ": 10,
        "XNEQ": 11,
        "XUNPASSED": 12,
        "XC": 13,
        "XG": 14,
        "XR": 15,
        "F_CHILD": 20,
        "F_GRAND": 21,
        "F_CONT": 22,
        "SC_BEFORE": 30,
        "SC_AFTER": 31,
        "AC": 32,
        "SG_BEFORE": 33,
        "SG_AFTER": 34,
        "AG": 35,
        "SP_BEFORE": 36,
        "SP_AFTER": 37,
        "AP": 38,
        "CALL_PC": 39,
        "CALL_CG": 40,
        "HISTORY": 41,
    }
    graph = IntegratedGraph(
        {
            ref["R"]: Link(ref["R"], ref["R"]),
            ref["O"]: Link(ref["O"], ref["R"]),
            ref["C"]: Link(ref["R"], ref["C"]),
            ref["L"]: Link(ref["O"], ref["C"]),
            ref["U"]: Link(ref["C"], ref["O"]),
            ref["XEQ"]: Link(ref["L"], ref["L"]),
            ref["XNEQ"]: Link(ref["L"], ref["U"]),
            ref["XUNPASSED"]: Link(ref["U"], ref["U"]),
            ref["XC"]: Link(ref["XEQ"], ref["U"]),
            ref["XG"]: Link(ref["XC"], ref["O"]),
            ref["XR"]: Link(ref["XEQ"], ref["L"]),
            **dict(atom(ref[name]) for name in ("F_CHILD", "F_GRAND", "F_CONT")),
            ref["SC_BEFORE"]: Link(ref["F_CHILD"], ref["XC"]),
            ref["SC_AFTER"]: Link(ref["F_CHILD"], ref["U"]),
            ref["AC"]: Link(ref["SC_BEFORE"], ref["SC_AFTER"]),
            ref["SG_BEFORE"]: Link(ref["F_GRAND"], ref["XG"]),
            ref["SG_AFTER"]: Link(ref["F_GRAND"], ref["O"]),
            ref["AG"]: Link(ref["SG_BEFORE"], ref["SG_AFTER"]),
            ref["SP_BEFORE"]: Link(ref["F_CONT"], ref["XEQ"]),
            ref["SP_AFTER"]: Link(ref["F_CONT"], ref["XR"]),
            ref["AP"]: Link(ref["SP_BEFORE"], ref["SP_AFTER"]),
            ref["CALL_PC"]: Link(ref["AP"], ref["AC"]),
            ref["CALL_CG"]: Link(ref["AC"], ref["AG"]),
            ref["HISTORY"]: Link(ref["AC"], ref["AP"]),
        }
    )
    graph.validate_closed_unique_pairs()
    return graph, ref


def raw_start(graph: IntegratedGraph, ref: int) -> int:
    return graph.poles(ref)[0]


def raw_end(graph: IntegratedGraph, ref: int) -> int:
    return graph.poles(ref)[1]


def atomic_equal(left: int, right: int, aliases: LocalAliases) -> bool:
    return aliases.representative(left) == aliases.representative(right)


def derived_link_comparison(
    graph: IntegratedGraph,
    current: int,
    aliases: LocalAliases = LocalAliases(),
) -> bool:
    left, right = graph.poles(current)
    left_start, left_end = graph.poles(left)
    right_start, right_end = graph.poles(right)
    return atomic_equal(left_start, right_start, aliases) and atomic_equal(
        left_end, right_end, aliases
    )


def materialize_with_fresh_refs(
    graph: IntegratedGraph,
) -> tuple[AnumMemory, dict[int, int]]:
    mapping = {ref: 1000 + index for index, ref in enumerate(sorted(graph.links))}
    pairs = {
        mapping[ref]: (mapping[link.start], mapping[link.end])
        for ref, link in graph.links.items()
    }
    return AnumMemory(pairs), mapping


def historical_root_lines() -> list[str]:
    return [
        line.strip()
        for line in ROOT_FIXTURE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def test_integrated_challenge_is_non_normative_and_depends_exactly_on_three_gate_decisions():
    challenge = read(CHALLENGE)

    assert challenge["schema"] == "mts-foundation-integrated-challenge/v0.6"
    assert challenge["status"] == "candidate-challenge"
    assert challenge["accepted"] is False
    assert challenge["issue"] == 190
    assert challenge["dependsOn"] == [
        read(EQUALITY_DECISION)["schema"],
        read(ANUM_DECISION)["schema"],
        read(NESTING_DECISION)["schema"],
    ]
    assert challenge["schema"] not in MTS_V05.read_text(encoding="utf-8")
    assert challenge["veto"]["acceptedContractLinkAllowed"] is False
    assert challenge["veto"]["productionInterpreterChangeAllowed"] is False


def test_one_shared_finite_graph_is_closed_exact_pair_unique_and_used_by_all_domains():
    graph, ref = integrated_graph()

    assert [field.name for field in fields(Link)] == ["start", "end"]
    graph.validate_closed_unique_pairs()
    assert graph.poles(ref["R"]) == (ref["R"], ref["R"])
    assert graph.poles(ref["O"]) == (ref["O"], ref["R"])
    assert graph.poles(ref["C"]) == (ref["R"], ref["C"])
    assert graph.poles(ref["L"]) == (ref["O"], ref["C"])
    assert graph.poles(ref["U"]) == (ref["C"], ref["O"])
    assert graph.poles(ref["XEQ"]) == (ref["L"], ref["L"])
    assert graph.poles(ref["XC"]) == (ref["XEQ"], ref["U"])


def test_current_link_and_raw_destructors_use_same_refs_as_root_and_nesting():
    graph, ref = integrated_graph()

    assert (raw_start(graph, ref["XEQ"]), raw_end(graph, ref["XEQ"])) == (
        ref["L"],
        ref["L"],
    )
    assert (raw_start(graph, ref["XNEQ"]), raw_end(graph, ref["XNEQ"])) == (
        ref["L"],
        ref["U"],
    )
    assert (raw_start(graph, ref["XC"]), raw_end(graph, ref["XC"])) == (
        ref["XEQ"],
        ref["U"],
    )
    assert (raw_start(graph, ref["XG"]), raw_end(graph, ref["XG"])) == (
        ref["XC"],
        ref["O"],
    )
    assert (raw_start(graph, ref["XR"]), raw_end(graph, ref["XR"])) == (
        ref["XEQ"],
        ref["L"],
    )


def test_local_derived_equality_succeeds_and_fails_inside_the_same_root_graph():
    graph, ref = integrated_graph()

    assert derived_link_comparison(graph, ref["XEQ"]) is True
    assert derived_link_comparison(graph, ref["XNEQ"]) is False

    integration = read(CHALLENGE)["currentEqualityIntegration"]
    assert integration["recursiveGraphEquality"] is False
    assert integration["globalRewrite"] is False
    assert integration["l4IdentityRequired"] is False


def test_anum_protocol_anchors_are_the_same_l_u_refs_used_by_current_equality_graph():
    graph, ref = integrated_graph()
    integration = read(CHALLENGE)["anumIntegration"]

    assert graph.poles(ref["L"]) == (ref["O"], ref["C"])
    assert graph.poles(ref["U"]) == (ref["C"], ref["O"])
    assert integration["protocol:1"] == "L"
    assert integration["protocol:0"] == "U"
    assert integration["sameLAndURefsAsEqualityAndCurrentGraph"] is True


def test_all_accepted_recursive_anum_v02_vectors_still_replay_over_opaque_protocol_anchors():
    accepted = read(RECURSIVE_CORPUS)

    for case in accepted["cases"]:
        result = denotate_recursive_anum(
            parse_raw_quaternary(case["raw"]),
            ProjectionContext(case["context"]),
        )
        expected = denotation_from_data(case["expected"])
        assert canonical_denotation_json(result) == canonical_denotation_json(expected)
        if case["canonicalRaw"] is not None:
            assert result.structural is not None
            assert canonical_recursive_anum(result) == case["canonicalRaw"]


def test_nested_child_grandchild_and_continuation_reuse_only_the_same_raw_destructors():
    graph, ref = integrated_graph()

    # XC=(XEQ,U): child receives explicit outer/current value and local U.
    assert graph.poles(ref["XC"]) == (ref["XEQ"], ref["U"])

    # XG=(XC,O): grandchild can inspect nested explicitly passed structure.
    assert raw_start(graph, ref["XG"]) == ref["XC"]
    assert raw_end(graph, ref["XG"]) == ref["O"]
    assert raw_start(graph, raw_start(graph, ref["XG"])) == ref["XEQ"]
    assert raw_end(graph, raw_start(graph, ref["XG"])) == ref["U"]

    # XR=(XEQ,L): continuation receives result/input explicitly.
    assert graph.poles(ref["XR"]) == (ref["XEQ"], ref["L"])
    assert ref["L"] in graph.closure(ref["SP_AFTER"])


def test_unpassed_current_does_not_gain_outer_values_by_ambient_or_incoming_magic():
    graph, ref = integrated_graph()
    closure = graph.closure(ref["XUNPASSED"])

    assert ref["XEQ"] not in closure
    assert ref["L"] not in closure
    assert ref["AP"] not in closure
    assert closure == frozenset({ref["XUNPASSED"], ref["U"], ref["C"], ref["O"], ref["R"]})


def test_act_state_links_and_results_are_explicit_in_the_same_carrier():
    graph, ref = integrated_graph()

    assert graph.poles(ref["AC"]) == (ref["SC_BEFORE"], ref["SC_AFTER"])
    assert graph.poles(ref["AG"]) == (ref["SG_BEFORE"], ref["SG_AFTER"])
    assert graph.poles(ref["AP"]) == (ref["SP_BEFORE"], ref["SP_AFTER"])
    assert graph.poles(ref["CALL_PC"]) == (ref["AP"], ref["AC"])
    assert graph.poles(ref["CALL_CG"]) == (ref["AC"], ref["AG"])
    assert graph.poles(ref["HISTORY"]) == (ref["AC"], ref["AP"])
    assert ref["U"] in graph.closure(ref["SC_AFTER"])
    assert ref["O"] in graph.closure(ref["SG_AFTER"])
    assert ref["L"] in graph.closure(ref["SP_AFTER"])


def test_canonical_packet_replays_graph_current_aliases_and_anum_deterministically():
    graph, ref = integrated_graph()
    packet = ReplayPacket(
        links=graph.canonical_links(),
        current=ref["XNEQ"],
        aliases=(),
        raw_anum="10[01]",
    )
    canonical = packet.canonical_json()
    replay_packet = ReplayPacket.from_json(canonical)
    replay_graph = IntegratedGraph.from_canonical_links(replay_packet.links)

    assert replay_packet.canonical_json() == canonical
    assert replay_graph.poles(replay_packet.current) == graph.poles(ref["XNEQ"])
    assert derived_link_comparison(replay_graph, replay_packet.current) is False

    result = denotate_recursive_anum(
        parse_raw_quaternary(replay_packet.raw_anum),
        ProjectionContext.ROOT,
    )
    assert result.structural is not None
    assert canonical_recursive_anum(result) == replay_packet.raw_anum


def test_optional_l4_materialization_preserves_observations_without_reusing_virtual_refs():
    graph, ref = integrated_graph()
    memory, mapping = materialize_with_fresh_refs(graph)

    assert all(mapping[virtual] != virtual for virtual in graph.links)
    for name in ("R", "O", "C", "L", "U", "XEQ", "XNEQ", "XC", "XG", "XR"):
        virtual_ref = ref[name]
        virtual_poles = graph.poles(virtual_ref)
        materialized_poles = memory.poles(mapping[virtual_ref])
        assert materialized_poles == tuple(mapping[pole] for pole in virtual_poles)

    boundary = read(CHALLENGE)["materializationBoundary"]
    assert boundary["virtualCarrierIsPrimarySemanticInput"] is True
    assert boundary["optionalExactPairMaterializationSupported"] is True
    assert boundary["materializationRequiredForInterpretation"] is False
    assert boundary["sameNumericRefsRequiredAcrossVirtualAndL4Representations"] is False
    assert boundary["implicitRealization"] is False


def test_integrated_candidate_has_no_hidden_old_semantic_bridge():
    challenge = read(CHALLENGE)
    algebra = challenge["integratedAlgebra"]

    assert algebra["primitiveLeftRightPronouns"] is False
    assert algebra["parentAscent"] is False
    assert algebra["constructiveProjectionWrapper"] is False
    assert "ContextFrame ontology" in challenge["forbiddenHiddenBridges"]
    assert "graph isomorphism as implicit =" in challenge["forbiddenHiddenBridges"]
    assert "parallel recursive Anum grammar" in challenge["forbiddenHiddenBridges"]

    # Current production grammar remains untouched by the challenge.
    with pytest.raises(MTCParseError, match="После `↑` ожидается"):
        parse_formula("↑")


def test_historical_contracts_and_root_fixture_remain_immutable():
    challenge = read(CHALLENGE)
    root_lines = historical_root_lines()

    assert len(root_lines) == 10
    assert root_lines[0] == "∞ : {◁ = ∞, ▷ = ∞}"
    assert challenge["veto"]["historicalContractsMutable"] is False
    assert challenge["veto"]["productionRootChangeAllowed"] is False
    assert challenge["veto"]["productionParserChangeAllowed"] is False
    assert challenge["veto"]["productionInterpreterChangeAllowed"] is False


def test_green_integrated_slice_would_authorize_migration_design_not_foundation_acceptance():
    exit_boundary = read(CHALLENGE)["exitBoundary"]

    assert exit_boundary["greenMeans"].startswith(
        "candidate foundation is cross-boundary coherent enough"
    )
    assert exit_boundary["greenMeansAcceptedFoundation"] is False
    assert exit_boundary["greenAllowsProductionMigrationDesign"] is True
    assert exit_boundary["greenAllowsProductionSemanticChangeImmediately"] is False
    assert exit_boundary["greenAllowsAproverRepin"] is False
