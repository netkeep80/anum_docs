from __future__ import annotations

import ast
import hashlib
import json
from pathlib import Path

import pytest

from core.exact_link_network import LinkNetworkBuilder, LinkNetworkError
from core.foundation_v2 import build_root_kernel as public_build_root_kernel
from core.foundation_v2_root import (
    FoundationRootKernel,
    FoundationRootRefs,
    build_root_kernel,
    root_role_refs,
    root_vocabulary,
    validate_root_kernel,
)


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "mts-foundation-v2-root-v0.7.json"
ROOT_FIXTURE = ROOT / "tests" / "mtc_formulas.mtc"
ROOT_FORMULAS_SHA256 = "1ccfb6fa0ae3c744dffcdefefcf2d5d96108573f4b04fdd8ac45a2e15a98ee3a"
OLD_MODULE_NAMES = {
    "core.mtc_parser",
    "core.mtc_ast",
    "core.mtc_interpreter",
    "core.mtc_definitions",
    "core.mtc_opening_path",
    "core.proof_checker",
    "core.root_library",
    "core.validate_root",
    "core.reference_model",
    "core.anum_memory",
}


def read_contract() -> dict:
    return json.loads(CONTRACT.read_text(encoding="utf-8"))


def core_imports(path: Path) -> set[str]:
    rel = path.relative_to(ROOT).as_posix()
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=rel)
    imports: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "core" or alias.name.startswith("core."):
                    imports.add(alias.name)
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if node.level == 0 and (module == "core" or module.startswith("core.")):
                imports.add(module)
            elif node.level == 1 and rel.startswith("core/") and module:
                imports.add(f"core.{module}")
    return imports


def root_formula_text() -> str:
    return "\n".join(
        line.strip()
        for line in ROOT_FIXTURE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ) + "\n"


def test_contract_is_candidate_not_release_permission() -> None:
    contract = read_contract()
    assert contract["schema"] == "mts-foundation-v2-root/v0.7"
    assert contract["status"] == "gate-p-production-root-candidate"
    assert contract["accepted"] is False
    assert contract["issue"] == 274
    assert contract["parent"] == 271
    assert contract["umbrella"] == 237
    assert contract["releaseBoundary"]["cutoverComplete"] is False
    assert contract["releaseBoundary"]["foundationV2Accepted"] is False
    assert contract["releaseBoundary"]["aproverRepinAllowed"] is False


def test_exact_five_link_root_topology() -> None:
    kernel = build_root_kernel()
    network = kernel.network
    refs = kernel.refs

    assert len(network.refs) == 5
    assert len(set(refs.as_tuple())) == 5
    assert network.root is refs.root

    root = network.link(refs.root)
    opening = network.link(refs.opening)
    closing = network.link(refs.closing)
    linked = network.link(refs.linked)
    unlinked = network.link(refs.unlinked)

    assert (root.start, root.end) == (refs.root, refs.root)
    assert (opening.start, opening.end) == (refs.opening, refs.root)
    assert (closing.start, closing.end) == (refs.root, refs.closing)
    assert (linked.start, linked.end) == (refs.opening, refs.closing)
    assert (unlinked.start, unlinked.end) == (refs.closing, refs.opening)
    assert network.find(refs.opening, refs.closing) is refs.linked
    assert [
        ref
        for ref in network.refs
        if network.link(ref).start is ref and network.link(ref).end is ref
    ] == [refs.root]
    validate_root_kernel(kernel)


def test_root_vocabulary_maps_only_root_abits_after_kernel_exists() -> None:
    kernel = build_root_kernel()
    refs = kernel.refs
    vocabulary = root_vocabulary(kernel)

    assert dict(vocabulary) == {
        "∞": refs.root,
        "[": refs.opening,
        "]": refs.closing,
        "1": refs.linked,
        "0": refs.unlinked,
    }
    assert "♂" not in vocabulary
    assert "♀" not in vocabulary
    with pytest.raises(TypeError):
        vocabulary["∞"] = refs.opening  # type: ignore[index]

    roles = root_role_refs(kernel)
    assert dict(roles) == {
        "R": refs.root,
        "O": refs.opening,
        "C": refs.closing,
        "L": refs.linked,
        "U": refs.unlinked,
    }


def test_validation_is_independent_of_allocation_slot_order() -> None:
    builder = LinkNetworkBuilder()
    unlinked = builder.reserve()  # slot 0
    closing = builder.reserve()   # slot 1
    root = builder.reserve()      # slot 2
    linked = builder.reserve()    # slot 3
    opening = builder.reserve()   # slot 4

    builder.define(root, root, root)
    builder.define(opening, opening, root)
    builder.define(closing, root, closing)
    builder.define(linked, opening, closing)
    builder.define(unlinked, closing, opening)

    kernel = FoundationRootKernel(
        network=builder.freeze(root),
        refs=FoundationRootRefs(
            root=root,
            opening=opening,
            closing=closing,
            linked=linked,
            unlinked=unlinked,
        ),
    )
    assert kernel.refs.root.slot == 2
    assert kernel.refs.opening.slot == 4
    validate_root_kernel(kernel)
    assert root_vocabulary(kernel)["∞"] is root
    assert root_role_refs(kernel)["O"] is opening


def test_equal_topology_in_two_builds_has_fresh_runtime_access_handles() -> None:
    first = build_root_kernel()
    second = build_root_kernel()

    assert first.network.snapshot().links == second.network.snapshot().links
    assert first.refs.root != second.refs.root
    assert first.refs.opening != second.refs.opening
    assert first.refs.linked != second.refs.linked


def test_second_completely_self_closed_link_is_forbidden() -> None:
    kernel = build_root_kernel()
    evolution = kernel.network.evolve()
    other = evolution.reserve()

    with pytest.raises(LinkNetworkError, match="fully self-closed link is unique"):
        evolution.define(other, other, other)


def test_duplicate_same_pole_link_is_forbidden_and_ensure_reuses_linked() -> None:
    kernel = build_root_kernel()
    evolution = kernel.network.evolve()
    duplicate = evolution.reserve()

    with pytest.raises(LinkNetworkError, match="duplicate semantic link pair"):
        evolution.define(duplicate, kernel.refs.opening, kernel.refs.closing)

    fresh = kernel.network.evolve()
    assert fresh.ensure(kernel.refs.opening, kernel.refs.closing) is kernel.refs.linked


def test_public_facade_uses_the_same_root_builder() -> None:
    kernel = public_build_root_kernel()
    validate_root_kernel(kernel)
    assert root_vocabulary(kernel)["∞"] is kernel.network.root


def test_root_and_public_modules_have_no_historical_semantic_imports() -> None:
    for name in ("foundation_v2_root.py", "foundation_v2.py"):
        imports = core_imports(ROOT / "core" / name)
        assert not (imports & OLD_MODULE_NAMES), (name, sorted(imports & OLD_MODULE_NAMES))

    root_source = (ROOT / "core" / "foundation_v2_root.py").read_text(encoding="utf-8")
    for forbidden in (
        "parse_formula",
        "ContextFrame",
        "DefinitionEnvironment",
        "TokenKind",
        "carrier_isomorphic",
        "intern_link",
    ):
        assert f"{forbidden}(" not in root_source


def test_contract_preserves_ostensive_orientation_and_vocabulary_distinction() -> None:
    contract = read_contract()
    assert contract["ostensivePrimary"] == {
        "root": "∞",
        "startSelfClosed": "♂e = S = S ⟼ e",
        "endSelfClosed": "b♀ = E = b ⟼ E",
        "complete": "b ⟼ e",
    }
    assert contract["rootVocabulary"]["glyphSpellingRecognizesKernelRole"] is False
    assert contract["rootVocabulary"]["mappingAppliesAfterExactKernelConstruction"] is True
    assert contract["rootVocabulary"]["rootAbitsIdenticalToFormalMaleFemaleGlyphOccurrences"] is False


def test_historical_ten_formula_root_fixture_is_unchanged() -> None:
    text = root_formula_text()
    assert len(text.splitlines()) == 10
    assert hashlib.sha256(text.encode("utf-8")).hexdigest() == ROOT_FORMULAS_SHA256
