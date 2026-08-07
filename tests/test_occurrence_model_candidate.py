"""Challenge tests for experimental issue #79 Candidates C1/C1a."""

from core.occurrence_model_candidate import (
    PatternSlot,
    elaborate_cyclic_positions,
    template,
    validate_candidate,
)


def expected_slot_ids(name: str) -> tuple[int, ...]:
    return tuple(
        item.slot.index for item in template(name).elaborate_expected()
    )


def automatic_slot_ids(name: str) -> tuple[int, ...]:
    return tuple(
        item.slot.index for item in template(name).elaborate_automatic()
    )


def test_candidate_annotations_are_internally_consistent():
    assert validate_candidate() == ()


def test_automatic_elaborator_matches_all_five_manual_challenge_templates():
    for name in (
        "associative-root",
        "pair-sequence",
        "triple-sequence",
        "grouped-triple",
        "equality-meaning",
    ):
        assert automatic_slot_ids(name) == expected_slot_ids(name)


def test_root_self_closure_reuses_one_local_slot():
    assert automatic_slot_ids("associative-root") == (1, 1, 1)
    assert template("associative-root").arity == 1


def test_pair_sequence_has_two_positions_and_reuses_them_on_rhs():
    assert automatic_slot_ids("pair-sequence") == (1, 2, 1, 2)
    assert template("pair-sequence").arity == 2


def test_triple_sequence_preserves_left_associative_three_positions():
    assert automatic_slot_ids("triple-sequence") == (1, 2, 3, 1, 2, 3)
    assert template("triple-sequence").arity == 3


def test_grouped_triple_preserves_three_positions_across_grouping():
    assert automatic_slot_ids("grouped-triple") == (1, 2, 3, 1, 2, 3)


def test_equality_meaning_has_two_operand_columns():
    assert automatic_slot_ids("equality-meaning") == (1, 2, 1, 2)
    assert template("equality-meaning").arity == 2


def test_same_slot_index_in_different_templates_is_not_global_binding():
    root_slot = template("associative-root").elaborate_automatic()[0].slot
    pair_slot = template("pair-sequence").elaborate_automatic()[0].slot

    assert root_slot == PatternSlot("associative-root", 1)
    assert pair_slot == PatternSlot("pair-sequence", 1)
    assert root_slot != pair_slot


def test_each_bound_occurrence_keeps_real_source_span():
    candidate = template("equality-meaning")
    occurrences = candidate.elaborate_automatic()

    for occurrence in occurrences:
        assert candidate.source[
            occurrence.span.start : occurrence.span.end
        ] == "[]"


def test_grouping_does_not_reset_cyclic_position_stream():
    occurrences = elaborate_cyclic_positions(
        "synthetic-grouping",
        "[][][] : [] ⟼ ([][])",
    )

    assert tuple(item.slot.index for item in occurrences) == (1, 2, 3, 1, 2, 3)


def test_candidate_exposes_expressivity_limit_of_implicit_cyclic_slots():
    """With arity 2, three RHS placeholders necessarily read 1,2,1.

    This is not declared correct MTS semantics. The test documents a challenge:
    if theory ever needs the order 1,1,2, the current unindexed notation needs
    an additional binding mechanism because C1a cannot express it.
    """

    occurrences = elaborate_cyclic_positions(
        "synthetic-limit",
        "[][] : [] ⟼ [] ⟼ []",
    )

    assert tuple(item.slot.index for item in occurrences) == (1, 2, 1, 2, 1)
