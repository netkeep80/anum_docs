"""Challenge and conformance tests for recursive Anum denotation v0.2."""

from functools import lru_cache
import json
from pathlib import Path

import pytest

from core.anum_denotation import (
    AnumDenotation,
    DenotationNode,
    DenotationRef,
    StructuralDenotation,
    canonical_denotation_json,
    denotation_from_data,
)
from core.anum_model import ProjectionContext
from core.anum_parser import parse_raw_quaternary
from core.anum_recursive_denotation import (
    RecursiveAnumDecodeError,
    RecursiveAnumTree,
    canonical_recursive_anum,
    canonical_recursive_tree_raw,
    collapse_root_opens,
    decode_recursive_tree,
    denotate_recursive_anum,
    recursive_tree_denotation,
    restore_collapsed_root_opens,
)


ROOT = Path(__file__).parents[1]
CONTRACT = ROOT / "contracts/anum-recursive-denotation-v0.2.json"
CORPUS = ROOT / "contracts/anum-recursive-denotation-conformance-v0.2.json"
SOURCE = ROOT / "core/anum_recursive_denotation.py"


def _context(name: str) -> ProjectionContext:
    return ProjectionContext(name)


def test_recursive_contract_is_accepted_bounded_and_non_materializing():
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))

    assert contract["schema"] == "anum-recursive-denotation/v0.2"
    assert contract["status"] == "accepted"
    assert contract["context"] == "root"
    assert contract["challenge"]["exhaustiveBinaryTreeDepth"] == 3
    assert contract["semantics"]["nodePolicy"].startswith("occurrence-preserving")
    assert contract["inverse"]["explicitSharedNodeReferencesAccepted"] is False
    assert contract["contextIsolation"]["relative"].startswith("raw only")
    assert contract["effects"] == {
        "mayReadMemory": False,
        "mayMutateMemory": False,
        "mayRealize": False,
    }


def test_recursive_module_has_no_storage_or_realization_dependency():
    source = SOURCE.read_text(encoding="utf-8")

    for forbidden in (
        "LinkStore",
        "PersistentLinkStore",
        "database",
        "sqlite",
        "realize(",
        "find(",
        "LinkId",
    ):
        assert forbidden not in source


def test_language_neutral_recursive_vectors_match_reference_decoder():
    corpus = json.loads(CORPUS.read_text(encoding="utf-8"))

    assert corpus["schema"] == "anum-recursive-denotation-conformance/v0.2"
    assert corpus["contract"] == "anum-recursive-denotation/v0.2"
    assert corpus["status"] == "accepted"

    for case in corpus["cases"]:
        raw = case["raw"]
        result = denotate_recursive_anum(
            parse_raw_quaternary(raw),
            _context(case["context"]),
        )
        expected = denotation_from_data(case["expected"])
        assert canonical_denotation_json(result) == canonical_denotation_json(expected)

        if case["expandedRaw"] is not None:
            assert restore_collapsed_root_opens(raw) == case["expandedRaw"]

        canonical_raw = case["canonicalRaw"]
        if canonical_raw is None:
            if result.structural is None:
                with pytest.raises(ValueError, match="structural"):
                    canonical_recursive_anum(result)
        else:
            assert result.structural is not None
            assert canonical_recursive_anum(result) == canonical_raw
            round_trip = denotate_recursive_anum(
                parse_raw_quaternary(canonical_raw),
                ProjectionContext.ROOT,
            )
            assert canonical_denotation_json(round_trip) == canonical_denotation_json(result)


def test_root_opening_collapse_and_restoration_are_exact_for_deep_left_tree():
    tree = RecursiveAnumTree.link_tree(
        RecursiveAnumTree.link_tree(
            RecursiveAnumTree.link_tree(
                RecursiveAnumTree.atom_tree("0"),
                RecursiveAnumTree.atom_tree("1"),
            ),
            RecursiveAnumTree.atom_tree("1"),
        ),
        RecursiveAnumTree.atom_tree("0"),
    )

    assert collapse_root_opens("[[01]1]0") == "[01]1]0"
    assert restore_collapsed_root_opens("[01]1]0") == "[[01]1]0"
    assert canonical_recursive_tree_raw(tree) == "[01]1]0"
    assert decode_recursive_tree("[01]1]0") == tree


def test_nested_left_right_both_and_deeper_right_have_expected_canonical_raw():
    zero = RecursiveAnumTree.atom_tree("0")
    one = RecursiveAnumTree.atom_tree("1")
    pair_01 = RecursiveAnumTree.link_tree(zero, one)
    pair_10 = RecursiveAnumTree.link_tree(one, zero)

    assert canonical_recursive_tree_raw(RecursiveAnumTree.link_tree(pair_01, one)) == "[01]1"
    assert canonical_recursive_tree_raw(RecursiveAnumTree.link_tree(zero, pair_10)) == "0[10]"
    assert canonical_recursive_tree_raw(RecursiveAnumTree.link_tree(pair_01, pair_10)) == "[01][10]"
    assert (
        canonical_recursive_tree_raw(
            RecursiveAnumTree.link_tree(
                zero,
                RecursiveAnumTree.link_tree(one, pair_01),
            )
        )
        == "0[1[01]]"
    )


@lru_cache(maxsize=None)
def _trees_through_depth(depth: int) -> frozenset[RecursiveAnumTree]:
    atoms = {
        RecursiveAnumTree.atom_tree("0"),
        RecursiveAnumTree.atom_tree("1"),
    }
    if depth == 0:
        return frozenset(atoms)

    previous = _trees_through_depth(depth - 1)
    result = set(previous)
    for start in previous:
        for end in previous:
            result.add(RecursiveAnumTree.link_tree(start, end))
    return frozenset(result)


def test_exhaustive_depth_three_has_no_collapsed_encoding_collisions():
    seen: dict[str, RecursiveAnumTree] = {}
    trees = _trees_through_depth(3)

    assert len(trees) == 1446
    for tree in trees:
        raw = canonical_recursive_tree_raw(tree)
        previous = seen.get(raw)
        assert previous is None or previous == tree
        seen[raw] = tree

    assert len(seen) == len(trees)


def test_exhaustive_depth_three_decode_encode_and_denotation_inverse():
    for tree in _trees_through_depth(3):
        raw = canonical_recursive_tree_raw(tree)
        decoded = decode_recursive_tree(raw)
        assert decoded == tree

        denotation = recursive_tree_denotation(tree)
        assert canonical_recursive_anum(denotation) == raw
        reparsed = denotate_recursive_anum(
            parse_raw_quaternary(raw), ProjectionContext.ROOT
        )
        assert canonical_denotation_json(reparsed) == canonical_denotation_json(denotation)


def test_boundary_forms_keep_precedence_over_recursive_grammar():
    expected = {
        "[]": "1",
        "][": "0",
    }
    for raw, canonical in expected.items():
        result = denotate_recursive_anum(
            parse_raw_quaternary(raw), ProjectionContext.ROOT
        )
        assert result.structural is not None
        assert canonical_recursive_anum(result) == canonical
        with pytest.raises(RecursiveAnumDecodeError, match="special boundary"):
            decode_recursive_tree(raw)

    for raw in ("[[", "]]"):
        result = denotate_recursive_anum(
            parse_raw_quaternary(raw), ProjectionContext.ROOT
        )
        assert result.structural is None
        assert result.raw == raw
        with pytest.raises(RecursiveAnumDecodeError, match="special boundary"):
            decode_recursive_tree(raw)


def test_noncanonical_or_malformed_recursive_carriers_are_not_guessed():
    malformed = (
        "",
        "010",
        "[0]1",
        "[01]",
        "0[1]",
        "[[01]1]0",
        "[01]]",
        "[01]1]",
    )

    for raw in malformed:
        if raw:
            with pytest.raises(RecursiveAnumDecodeError):
                decode_recursive_tree(raw)
        result = denotate_recursive_anum(
            parse_raw_quaternary(raw), ProjectionContext.ROOT
        )
        assert result.structural is None
        assert result.raw == raw


def test_quote_and_relative_contexts_never_run_recursive_root_grammar():
    quote = denotate_recursive_anum(
        parse_raw_quaternary("[[01]1]"), ProjectionContext.QUOTE
    )
    relative = denotate_recursive_anum(
        parse_raw_quaternary("[01]1"), ProjectionContext.RELATIVE
    )

    assert quote.structural is None and quote.raw == "[01]1"
    assert relative.structural is None and relative.raw == "[01]1"


def test_repeated_equal_subtrees_remain_occurrence_local_in_description():
    result = denotate_recursive_anum(
        parse_raw_quaternary("[01][01]"), ProjectionContext.ROOT
    )

    assert result.structural is not None
    assert len(result.structural.nodes) == 3
    left, right, root = result.structural.nodes
    assert left.start == right.start
    assert left.end == right.end
    assert left.id != right.id
    assert root.start == DenotationRef.node_ref(left.id)
    assert root.end == DenotationRef.node_ref(right.id)
    assert canonical_recursive_anum(result) == "[01][01]"


def test_inverse_rejects_explicit_shared_node_identity():
    shared = AnumDenotation.structural_result(
        StructuralDenotation(
            anchors=("protocol:0", "protocol:1"),
            nodes=(
                DenotationNode(
                    id=0,
                    start=DenotationRef.anchor_ref("protocol:0"),
                    end=DenotationRef.anchor_ref("protocol:1"),
                ),
                DenotationNode(
                    id=1,
                    start=DenotationRef.node_ref(0),
                    end=DenotationRef.node_ref(0),
                ),
            ),
            root=DenotationRef.node_ref(1),
        )
    )

    with pytest.raises(ValueError, match="shared node"):
        canonical_recursive_anum(shared)


def test_inverse_rejects_external_anchors_and_unused_nodes():
    external = AnumDenotation.structural_result(
        StructuralDenotation(
            anchors=("external:a",),
            nodes=(),
            root=DenotationRef.anchor_ref("external:a"),
        )
    )
    unused = AnumDenotation.structural_result(
        StructuralDenotation(
            anchors=("protocol:0", "protocol:1"),
            nodes=(
                DenotationNode(
                    id=0,
                    start=DenotationRef.anchor_ref("protocol:0"),
                    end=DenotationRef.anchor_ref("protocol:0"),
                ),
            ),
            root=DenotationRef.anchor_ref("protocol:1"),
        )
    )

    with pytest.raises(ValueError, match="protocol:0 or protocol:1"):
        canonical_recursive_anum(external)
    with pytest.raises(ValueError, match="unused structural nodes"):
        canonical_recursive_anum(unused)
