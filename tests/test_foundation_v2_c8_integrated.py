from __future__ import annotations

import json
from pathlib import Path

import pytest

from core.anum_protocol import ROOT as ANUM_ROOT, StreamError, deserialize_stream
from core.foundation_v2_checker import (
    IntegratedProofEvidence,
    ProofGoalEvidence,
    ProofJudgmentEvidence,
    replay_integrated_proof,
)
from core.foundation_v2_interpreter import EqualityEvaluationEvidence, EqualityRoleRefs
from core.foundation_v2_materialization import (
    SequenceAtom,
    SequenceDescription,
    materialize_sequence,
    replay_sequence_materialization,
)
from core.foundation_v2_persistent import JsonLinkStore
from core.foundation_v2_proof import DecomposeEqualityEvidence, DecomposeEqualityRoleRefs
from core.foundation_v2_run import RunEvidence, RunStepEvidence, define_run_chain
from core.foundation_v2_source import SegmentSpec, SourceFrontEndBuilder
from core.foundation_v2_state import (
    define_act_field,
    define_act_header,
    define_context,
    define_dictionary_effect,
    define_dictionary_scope,
    define_local_representative_binding,
    define_membership,
)
from core.rooted_link_network import LinkNetwork, LinkNetworkBuilder, LinkNetworkError


ROOT = Path(__file__).resolve().parents[1]
CANDIDATE = ROOT / "cutover/foundation-v2-cutover-candidate-v0.1.json"
CONFORMANCE = ROOT / "cutover/foundation-v2-cutover-conformance-v0.1.json"

EXPECTED_PATH = [
    "root",
    "source",
    "D/G/T",
    "K/A",
    ":/=",
    "Run/proof",
    "Anum materialization",
    "persistent close/reopen",
]
EXPECTED_NEGATIVE_VECTORS = [
    "second-fully-self-closed-by-physical-id",
    "duplicate-same-pair",
    "same-form-distinguished-only-by-runtime-handle",
    "id-only-mutual-cycle",
    "read-or-replay-materializes",
    "historical-female-F-or-F-male-projection-meaning",
    "root-as-fifth-abit",
    "empty-group-rejected",
]


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _anchor(builder: LinkNetworkBuilder):
    if not builder._refs:
        return builder.ensure_root()
    current = next(
        ref
        for ref, link in reversed(list(zip(builder._refs, builder._links)))
        if link is not None
    )
    count = len(builder._refs)
    while len(builder._refs) == count:
        current = builder.ensure_start_self_closed(current)
    return current


def _byte_refs(builder: LinkNetworkBuilder):
    return {value: _anchor(builder) for value in range(256)}


def _source_evidence(builder, root, byte_refs, rule, theory):
    grammar = _anchor(builder)
    front = SourceFrontEndBuilder(builder, root, byte_refs)
    source = front.source_occurrence(b"decompose")
    dictionary = define_dictionary_scope(builder, root, root)
    definition = define_dictionary_effect(
        builder,
        dictionary,
        root,
        root,
        front.content_ref(b"decompose"),
        rule,
    )
    evidence = front.build_selected_evidence(
        source,
        (SegmentSpec(0, len(b"decompose"), rule, definition.occurrence),),
        dictionary=definition.after_scope,
        grammar=grammar,
        theory=theory,
    )
    return evidence


def _integrated_fixture():
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    byte_refs = _byte_refs(builder)

    context = define_context(builder, _anchor(builder), _anchor(builder))
    theory = _anchor(builder)
    rule = _anchor(builder)
    source = _source_evidence(builder, root, byte_refs, rule, theory)

    left_start, left_end, right_start, right_end = (
        _anchor(builder) for _ in range(4)
    )
    left = builder.ensure(left_start, left_end)
    right = builder.ensure(right_start, right_end)
    representative = _anchor(builder)
    define_local_representative_binding(builder, context, left, representative)
    define_local_representative_binding(builder, context, right, representative)

    equality_roles = EqualityRoleRefs(*(_anchor(builder) for _ in range(5)))
    equality_interpreter = _anchor(builder)
    equality_role_dictionary = define_dictionary_scope(builder, root, root)
    equality_act = define_act_header(
        builder,
        equality_interpreter,
        equality_role_dictionary,
        context,
    )
    for role, value in (
        (equality_roles.context, context),
        (equality_roles.left, left),
        (equality_roles.right, right),
        (equality_roles.left_representative, representative),
        (equality_roles.right_representative, representative),
    ):
        define_act_field(builder, equality_act, role, value)

    premise = EqualityEvaluationEvidence(
        interpreter=equality_interpreter,
        context=context,
        left=left,
        right=right,
        left_representative=representative,
        right_representative=representative,
        act=equality_act,
        role_dictionary=equality_role_dictionary,
        roles=equality_roles,
    )

    membership = define_membership(builder, theory, rule)
    start_claim = builder.ensure(left_start, right_start)
    end_claim = builder.ensure(left_end, right_end)
    proof_roles = DecomposeEqualityRoleRefs(*(_anchor(builder) for _ in range(10)))
    proof_interpreter = _anchor(builder)
    proof_role_dictionary = define_dictionary_scope(builder, root, root)
    proof_act = define_act_header(
        builder,
        proof_interpreter,
        proof_role_dictionary,
        context,
    )
    for role, value in (
        (proof_roles.premise_equality_act, equality_act),
        (proof_roles.theory, theory),
        (proof_roles.rule, rule),
        (proof_roles.rule_membership, membership),
        (proof_roles.left_relation, left),
        (proof_roles.right_relation, right),
        (proof_roles.start_claim, start_claim),
        (proof_roles.end_claim, end_claim),
        (proof_roles.before_context, context),
        (proof_roles.after_context, context),
    ):
        define_act_field(builder, proof_act, role, value)

    proof = DecomposeEqualityEvidence(
        premise=premise,
        interpreter=proof_interpreter,
        theory=theory,
        rule=rule,
        rule_membership=membership,
        left_relation=left,
        right_relation=right,
        start_claim=start_claim,
        end_claim=end_claim,
        before_context=context,
        after_context=context,
        act=proof_act,
        role_dictionary=proof_role_dictionary,
        roles=proof_roles,
    )

    run = RunEvidence(
        run_root=define_run_chain(builder, root, (equality_act, proof_act)),
        initial_context=context,
        terminal_context=context,
        steps=(
            RunStepEvidence(
                equality_act,
                context,
                context,
                equality_roles.context,
                equality_roles.context,
            ),
            RunStepEvidence(
                proof_act,
                context,
                context,
                proof_roles.before_context,
                proof_roles.after_context,
            ),
        ),
    )
    goal = ProofGoalEvidence(start_claim=start_claim, end_claim=end_claim)
    evidence = IntegratedProofEvidence(
        source=source,
        rule_application=proof,
        run=run,
        judgment=ProofJudgmentEvidence(theory=theory, context=context, goal=goal),
    )
    return builder, root, byte_refs, evidence


def _persist_runtime_topology(path: Path, network: LinkNetwork) -> None:
    """Persist canonical topology without turning storage ids into MTS identity."""

    assert network.root.slot == 0
    store = JsonLinkStore.create(path)
    by_slot = {0: store.root}

    for ref in network.refs[1:]:
        link = network.link(ref)
        if link.start is ref:
            persisted = store.materialize_start_self_closed(by_slot[link.end.slot])
        elif link.end is ref:
            persisted = store.materialize_end_self_closed(by_slot[link.start.slot])
        else:
            persisted = store.materialize(
                by_slot[link.start.slot],
                by_slot[link.end.slot],
            )
        assert persisted.local == ref.slot
        by_slot[ref.slot] = persisted

    assert store.count == len(network.refs)
    before_close = store.snapshot()
    lineage = store.lineage_id
    store.close()

    reopened = JsonLinkStore.open(path)
    assert reopened.lineage_id == lineage
    assert reopened.snapshot() == before_close
    restored, persistent_to_runtime = reopened.runtime_network()
    assert restored.snapshot() == network.snapshot()
    assert restored.root != network.root
    assert len(persistent_to_runtime) == len(network.refs)
    reopened.close()


def test_c8_full_path_replays_materializes_and_survives_persistent_reopen(tmp_path: Path) -> None:
    builder, root, byte_refs, evidence = _integrated_fixture()
    network = builder.freeze(root)
    before = network.snapshot()

    claims = replay_integrated_proof(network, evidence, byte_refs)
    assert claims == (
        evidence.judgment.goal.start_claim,
        evidence.judgment.goal.end_claim,
    )
    assert network.snapshot() == before

    description = SequenceDescription(
        root=root,
        items=(SequenceAtom(claims[0]), SequenceAtom(claims[1])),
    )
    materialized = materialize_sequence(network, description)
    assert network.snapshot() == before
    assert materialized.after.snapshot() != before
    assert materialized.result is materialized.after.find(claims[0], claims[1])
    after_before_replay = materialized.after.snapshot()
    assert replay_sequence_materialization(network, materialized) is materialized.result
    assert network.snapshot() == before
    assert materialized.after.snapshot() == after_before_replay

    _persist_runtime_topology(tmp_path / "c8-links.json", materialized.after)


def test_c8_executes_all_frozen_negative_vectors_without_compatibility_runtime() -> None:
    candidate = read(CANDIDATE)
    assert candidate["requiredNegativeVectors"] == EXPECTED_NEGATIVE_VECTORS
    executed: set[str] = set()

    builder = LinkNetworkBuilder()
    builder.ensure_root()
    second_root = builder.reserve()
    with pytest.raises(LinkNetworkError, match="fully self-closed link is unique"):
        builder.define(second_root, second_root, second_root)
    executed.add("second-fully-self-closed-by-physical-id")

    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    left = builder.ensure_start_self_closed(root)
    right = builder.ensure_end_self_closed(root)
    builder.ensure(left, right)
    duplicate = builder.reserve()
    with pytest.raises(LinkNetworkError, match="duplicate semantic link pair"):
        builder.define(duplicate, left, right)
    executed.add("duplicate-same-pair")

    handle_builder = LinkNetworkBuilder()
    handle_root = handle_builder.ensure_root()
    handle_left = handle_builder.ensure_start_self_closed(handle_root)
    handle_right = handle_builder.ensure_end_self_closed(handle_root)
    handle_link = handle_builder.ensure(handle_left, handle_right)
    network = handle_builder.freeze(handle_root)
    restored = LinkNetwork.from_snapshot(network.snapshot())
    assert restored.snapshot() == network.snapshot()
    assert restored.root != network.root
    assert restored.refs[handle_link.slot] != handle_link
    executed.add("same-form-distinguished-only-by-runtime-handle")

    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    a = builder.reserve()
    b = builder.reserve()
    with pytest.raises(LinkNetworkError, match="already be structurally distinguished"):
        builder.define(a, b, root)
    executed.add("id-only-mutual-cycle")

    builder, root, byte_refs, evidence = _integrated_fixture()
    network = builder.freeze(root)
    before = network.snapshot()
    replay_integrated_proof(network, evidence, byte_refs)
    assert network.snapshot() == before
    executed.add("read-or-replay-materializes")

    assert not (ROOT / "core/mtc_parser.py").exists()
    source_core = (ROOT / "core/foundation_v2_source.py").read_text(encoding="utf-8")
    assert "♀F" not in source_core and "F♂" not in source_core
    executed.add("historical-female-F-or-F-male-projection-meaning")

    assert deserialize_stream("").denotation == ANUM_ROOT
    with pytest.raises(StreamError, match="non-abit"):
        deserialize_stream("R")
    executed.add("root-as-fifth-abit")

    assert deserialize_stream("[]").denotation == ANUM_ROOT
    executed.add("empty-group-rejected")

    assert executed == set(EXPECTED_NEGATIVE_VECTORS)


def test_c8_gate_is_bound_to_frozen_candidate_and_still_does_not_accept_c9() -> None:
    candidate = read(CANDIDATE)
    conformance = read(CONFORMANCE)

    assert candidate["c8IntegratedPath"] == EXPECTED_PATH
    assert conformance["integratedPath"] == EXPECTED_PATH
    assert conformance["requiredNegativeVectors"] == EXPECTED_NEGATIVE_VECTORS
    assert conformance["accepted"] is False
    assert conformance["acceptance"] == {
        "performedHere": False,
        "acceptedMtsVersionAssignedHere": False,
        "downstreamRepinAllowed": False,
        "requiresSeparateC9": True,
    }
