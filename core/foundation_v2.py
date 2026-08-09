"""One public Python entry surface for the Foundation-v2 production candidate.

This module is deliberately a thin facade over the already-tested Foundation-v2
implementation modules.  It adds no semantic dispatch and no compatibility mode.
In particular there is no legacy parser, AST, ContextFrame or pair-interning path
behind this API.

The facade is implementation API only; Python classes/functions are not new MTS
ontological types.
"""
from __future__ import annotations

from .exact_link_network import Link, LinkNetwork, LinkNetworkBuilder, OccurrenceRef
from .foundation_v2_checker import (
    IntegratedProofEvidence,
    replay_integrated_proof,
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
    replay_sequence_materialization,
)
from .foundation_v2_persistent import (
    JsonExactLinkStore,
    PersistentOccurrenceId,
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
    "EqualityEvaluationEvidence",
    "FoundationRootKernel",
    "FoundationRootRefs",
    "IntegratedProofEvidence",
    "JsonExactLinkStore",
    "Link",
    "LinkNetwork",
    "LinkNetworkBuilder",
    "OccurrenceRef",
    "PersistentOccurrenceId",
    "PersistentSequenceAtom",
    "PersistentSequenceDescription",
    "PersistentSequenceGroup",
    "PersistentSequenceMaterialization",
    "RelationStepEvidence",
    "RunEvidence",
    "SequenceAtom",
    "SequenceDescription",
    "SequenceGroup",
    "SequenceMaterialization",
    "SourceFrontEndBuilder",
    "SourceFrontEndEvidence",
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
    "replay_run",
    "replay_sequence_materialization",
    "replay_source_front_end",
    "root_role_refs",
    "root_vocabulary",
    "validate_root_kernel",
]
