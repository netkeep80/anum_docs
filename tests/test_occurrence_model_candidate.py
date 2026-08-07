"""Challenge tests for experimental issue #79 Candidate C1."""

from core.occurrence_model_candidate import (
    PatternSlot,
    template,
    validate_candidate,
)


def slot_ids(name: str) -> tuple[int, ...]:
    return tuple(item.slot.index for item in template(name).elaborate())


def test_candidate_annotations_are_internally_consistent():
    assert validate_candidate() == ()


def test_root_self_closure_reuses_one_local_slot():
    assert slot_ids("associative-root") == (1, 1, 1)
    assert template("associative-root").arity == 1


def test_pair_sequence_has_two_positions_and_reuses_them_on_rhs():
    assert slot_ids("pair-sequence") == (1, 2, 1, 2)
    assert template("pair-sequence").arity == 2


def test_triple_sequence_preserves_left_associative_three_positions():
    assert slot_ids("triple-sequence") == (1, 2, 3, 1, 2, 3)
    assert template("triple-sequence").arity == 3


def test_grouped_triple_preserves_three_positions_across_grouping():
    assert slot_ids("grouped-triple") == (1, 2, 3, 1, 2, 3)


def test_equality_meaning_has_two_operand_columns():
    assert slot_ids("equality-meaning") == (1, 2, 1, 2)
    assert template("equality-meaning").arity == 2


def test_same_slot_index_in_different_templates_is_not_global_binding():
    root_slot = template("associative-root").elaborate()[0].slot
    pair_slot = template("pair-sequence").elaborate()[0].slot

    assert root_slot == PatternSlot("associative-root", 1)
    assert pair_slot == PatternSlot("pair-sequence", 1)
    assert root_slot != pair_slot


def test_each_bound_occurrence_keeps_real_source_span():
    candidate = template("equality-meaning")
    occurrences = candidate.elaborate()

    for occurrence in occurrences:
        assert candidate.source[
            occurrence.span.start : occurrence.span.end
        ] == "[]"
