"""Tests for the temporary symbolic L4 memory model.

Quotation is tested through the real L3 protocol, not through a fake Python
wrapper.
"""

from core.anum_memory import AnumMemory, Link, SymbolicAnum, symbolic_denotation


def test_symbolic_denotation_maps_description_to_link():
    form = SymbolicAnum("a", "b")
    assert symbolic_denotation(form) == Link("a", "b")


def test_load_and_find_do_not_materialize_denoted_link():
    memory = AnumMemory()
    form = SymbolicAnum("a", "b")
    link = Link("a", "b")

    memory.load(form)
    assert link not in memory.links

    assert memory.find(form) is False
    assert link not in memory.links

    memory.realize(form)
    assert link in memory.links
    assert memory.find(form) is True


def test_decode_is_non_mutating_in_test_double():
    memory = AnumMemory()
    form = SymbolicAnum("a", "b")

    assert memory.decode(form) == form
    assert memory.raw_forms == set()
    assert memory.links == set()
