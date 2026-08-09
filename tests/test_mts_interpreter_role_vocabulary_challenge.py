"""Non-normative interpreter role-vocabulary challenge for issue #223.

The test compares a circular role-addressed bootstrap with a finite structural
act header that exposes interpreter, role dictionary and after-context before
any role-name lookup is attempted.
"""

from __future__ import annotations

from dataclasses import dataclass, fields
import json
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT / "contracts/mts-interpreter-role-vocabulary-challenge-v0.7.json"
STRING_PROTOCOL = ROOT / "contracts/string-anum-byte-protocol-challenge-v0.7.json"

ROOT_REF = 0
OPEN_REF = 1
CLOSE_REF = 2
LINK_REF = 3
UNLINK_REF = 4


@dataclass(frozen=True)
class Link:
    start: int
    end: int


@dataclass(frozen=True)
class CoreHeader:
    interpreter_ref: int
    role_dictionary_ref: int
    after_context_ref: int


class UnknownRole(ValueError):
    pass


class RoleConflict(ValueError):
    pass


class LinkGraph:
    def __init__(self) -> None:
        self.links: dict[int, Link] = {
            ROOT_REF: Link(ROOT_REF, ROOT_REF),
            OPEN_REF: Link(OPEN_REF, ROOT_REF),
            CLOSE_REF: Link(ROOT_REF, CLOSE_REF),
            LINK_REF: Link(OPEN_REF, CLOSE_REF),
            UNLINK_REF: Link(CLOSE_REF, OPEN_REF),
        }
        self._pairs = {link: ref for ref, link in self.links.items()}
        self._next_ref = 5

    def intern(self, start: int, end: int) -> int:
        pair = Link(start, end)
        existing = self._pairs.get(pair)
        if existing is not None:
            return existing
        ref = self._next_ref
        self._next_ref += 1
        self.links[ref] = pair
        self._pairs[pair] = ref
        return ref

    def find_pair(self, start: int, end: int) -> int | None:
        return self._pairs.get(Link(start, end))

    def self_closed_start(self, end: int) -> int:
        ref = self._next_ref
        self._next_ref += 1
        pair = Link(ref, end)
        assert pair not in self._pairs
        self.links[ref] = pair
        self._pairs[pair] = ref
        return ref

    def self_closed_end(self, start: int) -> int:
        ref = self._next_ref
        self._next_ref += 1
        pair = Link(start, ref)
        assert pair not in self._pairs
        self.links[ref] = pair
        self._pairs[pair] = ref
        return ref

    def validate(self) -> None:
        refs = set(self.links)
        assert len(self.links) == len(self._pairs)
        for ref, link in self.links.items():
            assert link.start in refs
            assert link.end in refs
            assert self._pairs[link] == ref


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def encode_text(text: str) -> str:
    return "".join(f"[{value:08b}]" for value in text.encode("utf-8"))


def abit_meaning(token: str) -> int:
    if token == "[":
        return OPEN_REF
    if token == "]":
        return CLOSE_REF
    if token == "1":
        return LINK_REF
    if token == "0":
        return UNLINK_REF
    raise ValueError(token)


def add_source(graph: LinkGraph, carrier: str) -> int:
    current = ROOT_REF
    for token in carrier:
        current = graph.intern(current, abit_meaning(token))
    return current


def find_source(graph: LinkGraph, carrier: str) -> int:
    current = ROOT_REF
    for token in carrier:
        next_ref = graph.find_pair(current, abit_meaning(token))
        if next_ref is None:
            raise UnknownRole(carrier)
        current = next_ref
    return current


def new_scoped_identity(graph: LinkGraph) -> int:
    seed = graph.self_closed_end(ROOT_REF)
    return graph.intern(seed, LINK_REF)


def add_dictionary_entry(
    graph: LinkGraph,
    dictionary_ref: int,
    source_ref: int,
    role_ref: int,
) -> tuple[int, int]:
    entry_ref = graph.intern(source_ref, role_ref)
    membership_ref = graph.intern(dictionary_ref, entry_ref)
    return entry_ref, membership_ref


def resolve_role(graph: LinkGraph, dictionary_ref: int, role_name: str) -> int:
    source_ref = find_source(graph, encode_text(role_name))
    matches: list[int] = []
    for membership in graph.links.values():
        if membership.start != dictionary_ref:
            continue
        entry = graph.links.get(membership.end)
        if entry is not None and entry.start == source_ref:
            matches.append(entry.end)
    distinct = set(matches)
    if not distinct:
        raise UnknownRole(role_name)
    if len(distinct) != 1:
        raise RoleConflict(role_name)
    return next(iter(distinct))


def make_role_dictionary(
    graph: LinkGraph,
    mapping: dict[str, int] | None = None,
) -> tuple[int, dict[str, int]]:
    dictionary_ref = new_scoped_identity(graph)
    role_refs: dict[str, int] = {}
    desired = mapping or {}
    for role_name in (
        "source",
        "dictionary",
        "theory",
        "form",
        "before-context",
        "binding",
        "result",
    ):
        source_ref = add_source(graph, encode_text(role_name))
        role_ref = desired.get(role_name)
        if role_ref is None:
            role_ref = graph.self_closed_end(source_ref)
        add_dictionary_entry(graph, dictionary_ref, source_ref, role_ref)
        role_refs[role_name] = role_ref
    return dictionary_ref, role_refs


def make_structural_header_act(
    graph: LinkGraph,
    interpreter_ref: int,
    role_dictionary_ref: int,
    after_context_ref: int,
) -> int:
    protocol_and_after = graph.intern(role_dictionary_ref, after_context_ref)
    header = graph.intern(interpreter_ref, protocol_and_after)
    return graph.self_closed_start(header)


def read_structural_header(graph: LinkGraph, act_ref: int) -> CoreHeader:
    act = graph.links[act_ref]
    if act.start != act_ref:
        raise ValueError("act must be start-self-closed")
    header = graph.links[act.end]
    protocol_and_after = graph.links[header.end]
    return CoreHeader(
        interpreter_ref=header.start,
        role_dictionary_ref=protocol_and_after.start,
        after_context_ref=protocol_and_after.end,
    )


def attach_field(
    graph: LinkGraph,
    act_ref: int,
    role_ref: int,
    value_ref: int,
) -> int:
    field_ref = graph.intern(role_ref, value_ref)
    return graph.intern(act_ref, field_ref)


def read_field(
    graph: LinkGraph,
    act_ref: int,
    role_dictionary_ref: int,
    role_name: str,
) -> int:
    role_ref = resolve_role(graph, role_dictionary_ref, role_name)
    matches: list[int] = []
    for attachment_ref, attachment in graph.links.items():
        if attachment_ref == act_ref or attachment.start != act_ref:
            continue
        field = graph.links.get(attachment.end)
        if field is not None and field.start == role_ref:
            matches.append(field.end)
    if len(set(matches)) != 1:
        raise ValueError("missing or conflicting act field")
    return matches[0]


def theory_admit_role_form(
    graph: LinkGraph,
    theory_ref: int,
    role_ref: int,
) -> int:
    role_form = graph.intern(role_ref, LINK_REF)
    return graph.intern(theory_ref, role_form)


def test_contract_is_non_normative_and_keeps_roles_out_of_root_kernel():
    challenge = read(CHALLENGE)
    string_protocol = read(STRING_PROTOCOL)

    assert challenge["schema"] == "mts-interpreter-role-vocabulary-challenge/v0.7"
    assert challenge["status"] == "candidate-challenge"
    assert challenge["accepted"] is False
    assert challenge["issue"] == 223
    assert string_protocol["schema"] in challenge["dependsOn"]
    assert challenge["veto"]["hostRoleEnumAcceptedAsOntology"] is False
    assert challenge["veto"]["roleRefsPromotedToRootKernel"] is False
    assert challenge["veto"]["productionChangeAllowed"] is False


def test_role_and_act_links_have_only_binary_structure():
    assert [field.name for field in fields(Link)] == ["start", "end"]


def test_role_sources_use_exact_string_anum_transport():
    assert encode_text("source").startswith("[")
    assert encode_text("source").endswith("]")
    assert encode_text("∞") == "[11100010][10001000][10011110]"
    assert read(STRING_PROTOCOL)["candidateA"]["unicodeNormalization"] == "none"


def test_candidate_c_role_dictionary_field_is_bootstrap_circular():
    challenge = read(CHALLENGE)
    graph = LinkGraph()
    act_ref = graph.self_closed_start(ROOT_REF)
    role_dictionary_ref, role_refs = make_role_dictionary(graph)
    role_vocab_ref = graph.self_closed_end(add_source(graph, encode_text("role-vocabulary")))
    role_vocab_source_ref = add_source(graph, encode_text("role-vocabulary"))
    add_dictionary_entry(
        graph,
        role_dictionary_ref,
        role_vocab_source_ref,
        role_vocab_ref,
    )
    attach_field(graph, act_ref, role_vocab_ref, role_dictionary_ref)

    unknown_attachments = [
        graph.links[ref].end
        for ref, link in graph.links.items()
        if ref != act_ref and link.start == act_ref
    ]
    assert unknown_attachments
    assert role_refs["source"] != role_vocab_ref
    assert challenge["candidateC"]["circular"] is True
    assert challenge["candidateC"]["reason"].startswith("roleVocabulary cannot be resolved")


def test_candidate_d_discovers_core_before_any_role_lookup():
    graph = LinkGraph()
    interpreter_ref = new_scoped_identity(graph)
    role_dictionary_ref, _ = make_role_dictionary(graph)
    after_context_ref = graph.self_closed_start(ROOT_REF)
    act_ref = make_structural_header_act(
        graph,
        interpreter_ref,
        role_dictionary_ref,
        after_context_ref,
    )

    header = read_structural_header(graph, act_ref)
    assert header == CoreHeader(
        interpreter_ref=interpreter_ref,
        role_dictionary_ref=role_dictionary_ref,
        after_context_ref=after_context_ref,
    )
    assert resolve_role(graph, header.role_dictionary_ref, "source") > UNLINK_REF


def test_candidate_d_fields_resolve_by_string_role_name_under_discovered_dictionary():
    graph = LinkGraph()
    interpreter_ref = new_scoped_identity(graph)
    role_dictionary_ref, role_refs = make_role_dictionary(graph)
    after_context_ref = graph.self_closed_start(ROOT_REF)
    act_ref = make_structural_header_act(
        graph,
        interpreter_ref,
        role_dictionary_ref,
        after_context_ref,
    )
    source_value = add_source(graph, encode_text("end-open"))
    result_value = graph.intern(LINK_REF, UNLINK_REF)
    attach_field(graph, act_ref, role_refs["source"], source_value)
    attach_field(graph, act_ref, role_refs["result"], result_value)

    header = read_structural_header(graph, act_ref)
    assert read_field(graph, act_ref, header.role_dictionary_ref, "source") == source_value
    assert read_field(graph, act_ref, header.role_dictionary_ref, "result") == result_value


def test_unknown_role_source_rejects_field_lookup():
    graph = LinkGraph()
    interpreter_ref = new_scoped_identity(graph)
    role_dictionary_ref, _ = make_role_dictionary(graph)
    act_ref = make_structural_header_act(
        graph,
        interpreter_ref,
        role_dictionary_ref,
        graph.self_closed_start(ROOT_REF),
    )

    with pytest.raises(UnknownRole):
        read_field(graph, act_ref, role_dictionary_ref, "unknown-role")


def test_conflicted_role_source_rejects_field_lookup():
    graph = LinkGraph()
    interpreter_ref = new_scoped_identity(graph)
    role_dictionary_ref, role_refs = make_role_dictionary(graph)
    act_ref = make_structural_header_act(
        graph,
        interpreter_ref,
        role_dictionary_ref,
        graph.self_closed_start(ROOT_REF),
    )
    source_ref = find_source(graph, encode_text("source"))
    conflicting_role_ref = graph.self_closed_start(source_ref)
    add_dictionary_entry(
        graph,
        role_dictionary_ref,
        source_ref,
        conflicting_role_ref,
    )
    attach_field(graph, act_ref, role_refs["source"], ROOT_REF)

    with pytest.raises(RoleConflict):
        read_field(graph, act_ref, role_dictionary_ref, "source")


def test_same_role_source_can_resolve_differently_under_two_dictionaries():
    graph = LinkGraph()
    first_dictionary, first_roles = make_role_dictionary(graph)
    alternate_source_ref = add_source(graph, encode_text("source"))
    alternate_role_ref = graph.self_closed_start(alternate_source_ref)
    second_dictionary, second_roles = make_role_dictionary(
        graph, {"source": alternate_role_ref}
    )

    assert first_roles["source"] != second_roles["source"]
    assert resolve_role(graph, first_dictionary, "source") == first_roles["source"]
    assert resolve_role(graph, second_dictionary, "source") == second_roles["source"]


def test_forged_role_dictionary_changes_or_rejects_field_interpretation():
    graph = LinkGraph()
    interpreter_ref = new_scoped_identity(graph)
    first_dictionary, first_roles = make_role_dictionary(graph)
    source_ref = add_source(graph, encode_text("source"))
    alternate_role_ref = graph.self_closed_start(source_ref)
    second_dictionary, _ = make_role_dictionary(graph, {"source": alternate_role_ref})
    after_context_ref = graph.self_closed_start(ROOT_REF)
    act_ref = make_structural_header_act(
        graph, interpreter_ref, first_dictionary, after_context_ref
    )
    source_value = add_source(graph, encode_text("payload"))
    attach_field(graph, act_ref, first_roles["source"], source_value)

    assert read_field(graph, act_ref, first_dictionary, "source") == source_value
    with pytest.raises(ValueError, match="missing or conflicting"):
        read_field(graph, act_ref, second_dictionary, "source")


def test_forged_role_ref_does_not_satisfy_expected_role_source():
    graph = LinkGraph()
    interpreter_ref = new_scoped_identity(graph)
    role_dictionary_ref, _ = make_role_dictionary(graph)
    act_ref = make_structural_header_act(
        graph,
        interpreter_ref,
        role_dictionary_ref,
        graph.self_closed_start(ROOT_REF),
    )
    forged_role = graph.self_closed_end(ROOT_REF)
    attach_field(graph, act_ref, forged_role, LINK_REF)

    with pytest.raises(ValueError, match="missing or conflicting"):
        read_field(graph, act_ref, role_dictionary_ref, "source")


def test_additive_optional_role_does_not_change_existing_role_resolution():
    graph = LinkGraph()
    interpreter_ref = new_scoped_identity(graph)
    role_dictionary_ref, role_refs = make_role_dictionary(graph)
    act_ref = make_structural_header_act(
        graph,
        interpreter_ref,
        role_dictionary_ref,
        graph.self_closed_start(ROOT_REF),
    )
    source_value = add_source(graph, encode_text("payload"))
    attach_field(graph, act_ref, role_refs["source"], source_value)
    before = read_field(graph, act_ref, role_dictionary_ref, "source")

    trace_source = add_source(graph, encode_text("trace"))
    trace_role = graph.self_closed_end(trace_source)
    add_dictionary_entry(graph, role_dictionary_ref, trace_source, trace_role)
    trace_value = graph.self_closed_start(LINK_REF)
    attach_field(graph, act_ref, trace_role, trace_value)

    assert read_field(graph, act_ref, role_dictionary_ref, "source") == before
    assert read_field(graph, act_ref, role_dictionary_ref, "trace") == trace_value


def test_role_dictionary_is_ordinary_payload_outside_act_header():
    graph = LinkGraph()
    role_dictionary_ref, _ = make_role_dictionary(graph)
    outer = graph.intern(LINK_REF, role_dictionary_ref)

    assert graph.links[outer] == Link(LINK_REF, role_dictionary_ref)


def test_two_acts_can_use_different_role_dictionaries_with_same_header_shape():
    graph = LinkGraph()
    interpreter_ref = new_scoped_identity(graph)
    first_dictionary, first_roles = make_role_dictionary(graph)
    source_ref = add_source(graph, encode_text("source"))
    alternate_role_ref = graph.self_closed_start(source_ref)
    second_dictionary, second_roles = make_role_dictionary(
        graph, {"source": alternate_role_ref}
    )
    after_context = graph.self_closed_start(ROOT_REF)
    first_act = make_structural_header_act(
        graph, interpreter_ref, first_dictionary, after_context
    )
    second_act = make_structural_header_act(
        graph, interpreter_ref, second_dictionary, after_context
    )
    first_value = graph.self_closed_end(LINK_REF)
    second_value = graph.self_closed_end(UNLINK_REF)
    attach_field(graph, first_act, first_roles["source"], first_value)
    attach_field(graph, second_act, second_roles["source"], second_value)

    assert read_structural_header(graph, first_act).role_dictionary_ref == first_dictionary
    assert read_structural_header(graph, second_act).role_dictionary_ref == second_dictionary
    assert read_field(graph, first_act, first_dictionary, "source") == first_value
    assert read_field(graph, second_act, second_dictionary, "source") == second_value


def test_theory_defined_role_form_can_validate_role_after_dictionary_discovery_only():
    graph = LinkGraph()
    role_dictionary_ref, role_refs = make_role_dictionary(graph)
    role_theory_ref = new_scoped_identity(graph)
    membership_ref = theory_admit_role_form(
        graph, role_theory_ref, role_refs["source"]
    )

    resolved_role = resolve_role(graph, role_dictionary_ref, "source")
    role_form_ref = graph.links[membership_ref].end
    assert resolved_role == role_refs["source"]
    assert graph.links[role_form_ref] == Link(resolved_role, LINK_REF)
    assert read(CHALLENGE)["candidateB"]["solvesRoleDictionaryDiscovery"] is False


def test_candidate_d_remains_preferred_only_as_research_direction():
    challenge = read(CHALLENGE)

    assert challenge["candidateD"]["roleDictionaryDiscoverableBeforeRoleLookup"] is True
    assert challenge["candidateD"]["additiveRoleFieldsStable"] is True
    assert challenge["candidateD"]["preferredAfterChallenge"] is False
    assert challenge["selfDescriptionBoundary"][
        "fullyRoleAddressedHeaderWithoutAnyBootstrapSchemaProven"
    ] is False
    assert challenge["selfDescriptionBoundary"]["minimalStructuralBootstrapMayRemainNecessary"] is True


def test_remaining_role_bootstrap_questions_stay_open():
    challenge = read(CHALLENGE)

    assert challenge["notDecided"] == [
        "whether candidate D is the canonical interpreter-act header",
        "the exact canonical role-name vocabulary",
        "whether every role requires a theory-admitted structural definition beyond dictionary naming",
        "whether the minimal act header can later become fully self-describing without an infinite regress",
        "versioning of the bootstrap act schema",
        "production migration",
    ]
