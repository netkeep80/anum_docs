"""Execute the versioned language-neutral MTS v0.2 conformance corpus."""

import json
from dataclasses import dataclass
from pathlib import Path

import pytest

from core.mtc_ast import format_expression
from core.mtc_interpreter import ContextFrame, MemoryView, interpret_constraints
from core.mtc_parser import TokenKind, parse_formula, tokenize


ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / "contracts/mts-conformance-v0.2.json"

TOKEN_NAMES = {
    TokenKind.CONTEXT_START: "context-start",
    TokenKind.CONTEXT_END: "context-end",
    TokenKind.CONTEXT_UP: "context-up",
    TokenKind.LBRACKET: "lbracket",
    TokenKind.RBRACKET: "rbracket",
}


@dataclass
class CorpusMemory(MemoryView):
    links: dict[int, tuple[int, int]]

    def poles(self, link: int) -> tuple[int, int]:
        return self.links[link]

    def find_link(self, start: int, end: int) -> int | None:
        for link, poles in self.links.items():
            if poles == (start, end):
                return link
        return None

    def find_start_projection(self, form: int) -> int | None:
        for link, poles in self.links.items():
            if poles == (link, form):
                return link
        return None

    def find_end_projection(self, form: int) -> int | None:
        for link, poles in self.links.items():
            if poles == (form, link):
                return link
        return None


def load_corpus() -> dict:
    return json.loads(CORPUS.read_text(encoding="utf-8"))


def _case_ids(section: str) -> list[str]:
    return [case["id"] for case in load_corpus()[section]]


def _case(section: str, case_id: str) -> dict:
    return next(case for case in load_corpus()[section] if case["id"] == case_id)


def _trace_kind(event: str) -> str:
    return event.split(":", 1)[0]


def _memory(case: dict) -> CorpusMemory:
    return CorpusMemory(
        {
            item["id"]: (item["start"], item["end"])
            for item in case["memory"]["links"]
        }
    )


def _context(spec: dict) -> ContextFrame:
    parent_spec = spec.get("parent")
    parent = _context(parent_spec) if parent_spec is not None else None
    return ContextFrame(start=spec["start"], end=spec["end"], parent=parent)


def _substitutions(result) -> list[dict]:
    return [
        {"path": list(hole.path), "link": link}
        for hole, link in result.holes
    ]


def _aliases(result) -> list[dict]:
    return [
        {"path": list(hole.path), "targetPath": list(target.path)}
        for hole, target in result.aliases
    ]


def test_corpus_identifies_exact_contract_version():
    corpus = load_corpus()
    assert corpus["schema"] == "mts-conformance/v0.2"
    assert corpus["contract"] == "mts-contract/v0.2"
    assert corpus["status"] == "accepted"


@pytest.mark.parametrize("case_id", _case_ids("lexing"))
def test_lexing_conformance(case_id: str):
    case = _case("lexing", case_id)
    tokens = tokenize(case["source"])
    actual = [TOKEN_NAMES[token.kind] for token in tokens[:-1]]
    assert actual == case["tokens"]


@pytest.mark.parametrize("case_id", _case_ids("canonicalization"))
def test_canonicalization_conformance(case_id: str):
    case = _case("canonicalization", case_id)
    assert format_expression(parse_formula(case["source"])) == case["canonical"]


@pytest.mark.parametrize("case_id", _case_ids("interpretation"))
def test_interpretation_conformance(case_id: str):
    case = _case("interpretation", case_id)
    memory = _memory(case)
    before = dict(memory.links)

    result = interpret_constraints(
        parse_formula(case["source"]),
        _context(case["context"]),
        memory,
        symbols={name: value for name, value in case["symbols"].items()},
    )

    expected = case["expected"]
    assert result.success is expected["success"]
    assert _substitutions(result) == expected["substitutions"]
    assert _aliases(result) == expected["aliases"]
    assert [_trace_kind(event) for event in result.trace] == expected["traceKinds"]
    assert memory.links == before, "interpret must not mutate the conformance memory fixture"
