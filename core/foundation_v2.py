"""One public Python entry surface for the Foundation-v2 production candidate.

This module is deliberately a thin facade over the tested Foundation-v2
implementation modules. It adds no semantic dispatch and no compatibility mode.
Python handles exposed here are implementation coordinates, not additional MTS
ontological identity. In particular, ``LinkRef`` is a network-local technical
access handle and never a third component of semantic Link identity. No legacy
naming aliases are exported by this facade.
"""
from __future__ import annotations

from .rooted_link_network import Link, LinkNetwork, LinkNetworkBuilder, LinkRef
from .foundation_v2_checker import (
    IntegratedProofEvidence,
    ProofGoalEvidence,
    ProofJudgmentEvidence,
    replay_integrated_proof,
)
from .foundation_v2_direct_deixis import (
    DeicticOccurrence,
    DeicticPole,
    DirectDeixisReplayError,
    DirectDeixisSkeletonBuilder,
    DirectDeixisVocabulary,
    analyze_direct_deixis_carrier,
    build_direct_deixis_vocabulary,
)
from .foundation_v2_interpreter import (
    ColonEffectEvidence,
    EqualityEvaluationEvidence,
    RelationStepEvidence,
    replay_colon_effect,
    replay_equality_evaluation,
    replay_relation_step,
)
from .foundation_v2_materialization import (
    SequenceAtom,
    SequenceDescription,
    SequenceGroup,
    SequenceMaterialization,
    find_links,
    materialize_sequence,
    replay_resolved_sequence_grouping,
    replay_root_opening_restoration,
    replay_sequence_materialization,
)
from .foundation_v2_persistent import (
    JsonLinkStore,
    PersistentLinkId,
    PersistentSequenceAtom,
    PersistentSequenceDescription,
    PersistentSequenceGroup,
    PersistentSequenceMaterialization,
    materialize_persistent_sequence,
    replay_persistent_sequence_materialization,
)
from .foundation_v2_proof import (
    DecomposeEqualityEvidence,
    replay_decompose_equal_relations,
)
from .foundation_v2_root import (
    FoundationRootKernel,
    FoundationRootRefs,
    build_root_kernel,
    root_role_refs,
    root_vocabulary,
    validate_root_kernel,
)
from .foundation_v2_run import RunEvidence, replay_run
from .foundation_v2_source import (
    SourceFrontEndBuilder,
    SourceFrontEndEvidence,
    replay_source_front_end,
)


__all__ = [
    "ColonEffectEvidence",
    "DecomposeEqualityEvidence",
    "DeicticOccurrence",
    "DeicticPole",
    "DirectDeixisReplayError",
    "DirectDeixisSkeletonBuilder",
    "DirectDeixisVocabulary",
    "EqualityEvaluationEvidence",
    "FoundationRootKernel",
    "FoundationRootRefs",
    "IntegratedProofEvidence",
    "JsonLinkStore",
    "Link",
    "LinkNetwork",
    "LinkNetworkBuilder",
    "LinkRef",
    "PersistentLinkId",
    "PersistentSequenceAtom",
    "PersistentSequenceDescription",
    "PersistentSequenceGroup",
    "PersistentSequenceMaterialization",
    "ProofGoalEvidence",
    "ProofJudgmentEvidence",
    "RelationStepEvidence",
    "RunEvidence",
    "SequenceAtom",
    "SequenceDescription",
    "SequenceGroup",
    "SequenceMaterialization",
    "SourceFrontEndBuilder",
    "SourceFrontEndEvidence",
    "analyze_direct_deixis_carrier",
    "build_direct_deixis_vocabulary",
    "build_root_kernel",
    "find_links",
    "materialize_persistent_sequence",
    "materialize_sequence",
    "replay_colon_effect",
    "replay_decompose_equal_relations",
    "replay_equality_evaluation",
    "replay_integrated_proof",
    "replay_persistent_sequence_materialization",
    "replay_relation_step",
    "replay_resolved_sequence_grouping",
    "replay_root_opening_restoration",
    "replay_run",
    "replay_sequence_materialization",
    "replay_source_front_end",
    "root_role_refs",
    "root_vocabulary",
    "validate_root_kernel",
]
