"""Minimal trusted proof replay kernel for MTS v0.2.

The kernel deliberately trusts only one rule: replay of the already accepted
read-only contextual ``interpret`` semantics.  It does not implement proof
search and does not promote legacy equality/congruence/Modus-Ponens rules to
trusted MTS semantics.
"""

from dataclasses import dataclass

from core.mtc_interpreter import ContextFrame, MemoryView, interpret_constraints
from core.mtc_parser import parse_formula

CONTRACT_VERSION = "mts-contract/v0.2"
PROOF_SCHEMA = "mts-proof/v0.2"


@dataclass(frozen=True)
class ProofContext:
    start: int
    end: int
    parent: "ProofContext | None" = None

    def to_runtime(self) -> ContextFrame:
        return ContextFrame(
            start=self.start,
            end=self.end,
            parent=self.parent.to_runtime() if self.parent is not None else None,
        )


@dataclass(frozen=True)
class DistinguishedLink:
    id: int
    start: int
    end: int


@dataclass(frozen=True, order=True)
class ExpectedSubstitution:
    path: tuple[int, ...]
    link: int


@dataclass(frozen=True, order=True)
class ExpectedAlias:
    path: tuple[int, ...]
    target_path: tuple[int, ...]


@dataclass(frozen=True)
class InterpretProofStep:
    expression: str
    context: ProofContext
    distinguished_memory: tuple[DistinguishedLink, ...] = ()
    symbols: tuple[tuple[str, int], ...] = ()
    expected_success: bool = True
    expected_substitutions: tuple[ExpectedSubstitution, ...] = ()
    expected_aliases: tuple[ExpectedAlias, ...] = ()
    rule: str = "interpret"


@dataclass(frozen=True)
class ProofObject:
    steps: tuple[InterpretProofStep, ...]
    contract_version: str = CONTRACT_VERSION
    schema: str = PROOF_SCHEMA


class ProofMemory(MemoryView):
    """Immutable memory snapshot reconstructed from a proof object."""

    def __init__(self, links: tuple[DistinguishedLink, ...]):
        by_id: dict[int, tuple[int, int]] = {}
        by_poles: dict[tuple[int, int], int] = {}
        for item in links:
            poles = (item.start, item.end)
            if item.id in by_id:
                raise ValueError(f"Duplicate LinkRef in proof memory: {item.id}")
            previous = by_poles.get(poles)
            if previous is not None and previous != item.id:
                raise ValueError(
                    "Ambiguous distinguished Link identity for poles "
                    f"{poles}: {previous} and {item.id}"
                )
            by_id[item.id] = poles
            by_poles[poles] = item.id
        self._by_id = by_id
        self._by_poles = by_poles

    def poles(self, link: int) -> tuple[int, int]:
        return self._by_id[link]

    def find_link(self, start: int, end: int) -> int | None:
        return self._by_poles.get((start, end))

    def find_start_projection(self, form: int) -> int | None:
        for link, poles in self._by_id.items():
            if poles == (link, form):
                return link
        return None

    def find_end_projection(self, form: int) -> int | None:
        for link, poles in self._by_id.items():
            if poles == (form, link):
                return link
        return None


def check_interpret_step(step: InterpretProofStep) -> bool:
    """Replay one claimed interpretation step against an immutable snapshot."""

    if step.rule != "interpret":
        return False

    try:
        expression = parse_formula(step.expression)
        memory = ProofMemory(step.distinguished_memory)
        result = interpret_constraints(
            expression,
            step.context.to_runtime(),
            memory,
            symbols=dict(step.symbols),
        )
    except (KeyError, TypeError, ValueError):
        return False

    substitutions = tuple(
        ExpectedSubstitution(path=hole.path, link=link) for hole, link in result.holes
    )
    aliases = tuple(
        ExpectedAlias(path=hole.path, target_path=target.path)
        for hole, target in result.aliases
    )

    return (
        result.success == step.expected_success
        and substitutions == tuple(sorted(step.expected_substitutions))
        and aliases == tuple(sorted(step.expected_aliases))
    )


def check_proof(proof: ProofObject) -> bool:
    """Independently replay every trusted step in a proof object."""

    if proof.schema != PROOF_SCHEMA or proof.contract_version != CONTRACT_VERSION:
        return False
    return all(check_interpret_step(step) for step in proof.steps)
