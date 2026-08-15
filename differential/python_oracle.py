from __future__ import annotations

from dataclasses import replace
import hashlib
import json
from pathlib import Path
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.anum_protocol import StreamError, deserialize_stream
from core.foundation_v2_persistent import JsonLinkStore, PERSISTENT_SCHEMA, PersistentStoreError
from core.foundation_v2_source import (
    SegmentSpec,
    SourceFrontEndBuilder,
    SourceReplayError,
    replay_source_front_end,
)
from core.foundation_v2_state import (
    DictionaryConflictError,
    DictionaryLookupError,
    RepresentativeConflictError,
    current_of_context,
    define_context,
    define_dictionary_effect,
    define_dictionary_scope,
    define_local_representative_binding,
    local_representative_resolution,
    lookup_scoped_dictionary,
    parent_of_context,
    read_dictionary_scope,
    verify_visible_dictionary_occurrence,
)
from core.rooted_link_network import (
    LinkNetwork,
    LinkNetworkBuilder,
    LinkNetworkError,
    NetworkSnapshot,
    read_rooted_sequence,
)


FROZEN_ORACLE_SHA = "ef42d91a868bbc5b7004acc325006ad27db3bb68"
FROZEN_BLOBS = {
    "core/rooted_link_network.py": "e914e6f70628f82484bcde43fabdf29a93300a6b",
    "core/anum_protocol.py": "5360933e282cd52981e935efc5e8796d7f9fc096",
    "core/anum_model.py": "b87b76e65a0aadb5873cc30c5d04f648cb235da9",
    "core/anum_parser.py": "a92d32f39032b841b8bbbec72ddd0bb81326610c",
    "core/foundation_v2_persistent.py": "af7e97eaea9e01cb313dc264f44f040f0f00997c",
    "core/foundation_v2_materialization.py": "ff894030ec06f15acb8530cda8fe2143ecabbed3",
    "core/foundation_v2_source.py": "12c764f2ab0d7b2b98078cccb6325d0663be5996",
    "core/foundation_v2_state.py": "70e7ae5eece7f347d0879ba73edc3477cf91f8b7",
}


def git_blob_sha(path: Path) -> str:
    data = path.read_bytes()
    header = f"blob {len(data)}\0".encode()
    return hashlib.sha1(header + data).hexdigest()


def verify_freeze(corpus: dict) -> None:
    if corpus.get("pythonOracleSha") != FROZEN_ORACLE_SHA:
        raise RuntimeError("differential corpus does not select the frozen Python oracle")
    changed = [relative for relative, expected in FROZEN_BLOBS.items() if git_blob_sha(ROOT / relative) != expected]
    if changed:
        raise RuntimeError("frozen Python oracle drift: " + ", ".join(changed))


def topology_basis_loop() -> dict:
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    opening = builder.ensure_start_self_closed(root)
    closing = builder.ensure_end_self_closed(root)
    linked = builder.ensure(opening, closing)
    builder.ensure(closing, opening)
    builder.ensure(linked, linked)
    snapshot = builder.freeze(root).snapshot()
    return {"root": snapshot.root, "links": [list(pair) for pair in snapshot.links]}


def topology_same_pair() -> dict:
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    opening = builder.ensure_start_self_closed(root)
    closing = builder.ensure_end_self_closed(root)
    linked = builder.ensure(opening, closing)
    builder.ensure(closing, opening)
    reused = builder.ensure(opening, closing)
    network = builder.freeze(root)
    count = len(network.refs)
    snapshot = network.snapshot()
    return {"root": snapshot.root, "links": [list(pair) for pair in snapshot.links], "countBefore": count, "countAfter": count, "reused": reused is linked}


def run_topology(case: dict) -> dict:
    operation = case["input"]["operation"]
    try:
        if operation == "basis-loop": observable = topology_basis_loop()
        elif operation == "same-pair": observable = topology_same_pair()
        elif operation == "restore":
            raw = case["input"]
            network = LinkNetwork.from_snapshot(NetworkSnapshot(links=tuple(tuple(pair) for pair in raw["links"]), root=raw["root"]))
            snapshot = network.snapshot()
            observable = {"root": snapshot.root, "links": [list(pair) for pair in snapshot.links]}
        else: raise RuntimeError(f"unknown topology operation: {operation}")
    except LinkNetworkError:
        return {"id": case["id"], "accepted": False, "error": "invalid-topology"}
    return {"id": case["id"], "accepted": True, "observable": observable}


def run_anum(case: dict) -> dict:
    try: result = deserialize_stream(case["input"]["source"])
    except StreamError as exc: return {"id": case["id"], "accepted": False, "error": exc.code}
    return {"id": case["id"], "accepted": True, "observable": {"denotation": result.denotation, "resolvedValues": list(result.resolved_values), "operations": list(result.operations)}}


def persistent_basis(store: JsonLinkStore):
    root = store.root
    opening = store.materialize_start_self_closed(root)
    closing = store.materialize_end_self_closed(root)
    linked = store.materialize(opening, closing)
    store.materialize(closing, opening)
    return root, opening, closing, linked


def persistent_topology(store: JsonLinkStore) -> dict:
    snapshot = store.snapshot()
    return {"root": snapshot.root.local, "links": [[start.local, end.local] for _ref, start, end in snapshot.links]}


def run_persistence(case: dict) -> dict:
    operation = case["input"]["operation"]
    try:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "store.json"
            if operation == "open-topology":
                raw = case["input"]
                path.write_text(json.dumps({"schema": PERSISTENT_SCHEMA, "lineage": "differential-lineage", "root": raw["root"], "links": raw["links"]}, separators=(",", ":")) + "\n", encoding="utf-8")
                store = JsonLinkStore.open(path)
                observable = persistent_topology(store)
            else:
                store = JsonLinkStore.create(path)
                if operation == "root": observable = persistent_topology(store)
                elif operation == "basis-loop-reopen":
                    _root, _opening, _closing, linked = persistent_basis(store)
                    store.materialize(linked, linked); store.close()
                    observable = persistent_topology(JsonLinkStore.open(path))
                elif operation == "same-pair":
                    _root, opening, closing, linked = persistent_basis(store)
                    before = store.count; reused = store.materialize(opening, closing)
                    observable = {**persistent_topology(store), "countBefore": before, "countAfter": store.count, "reused": reused == linked}
                else: raise RuntimeError(f"unknown persistence operation: {operation}")
    except PersistentStoreError:
        return {"id": case["id"], "accepted": False, "error": "invalid-topology"}
    return {"id": case["id"], "accepted": True, "observable": observable}


def byte_vocabulary(builder: LinkNetworkBuilder, root):
    refs = {}; current = root
    for value in range(256):
        current = builder.ensure_start_self_closed(current); refs[value] = current
    return refs


def next_anchor(builder: LinkNetworkBuilder, current):
    return builder.ensure_start_self_closed(current)


def run_source(case: dict) -> dict:
    operation = case["input"]["operation"]
    builder = LinkNetworkBuilder(); root = builder.ensure_root()
    if operation == "invalid-vocabulary":
        try: SourceFrontEndBuilder(builder, root, {})
        except SourceReplayError: return {"id": case["id"], "accepted": False, "error": "invalid-source"}
        raise RuntimeError("invalid source vocabulary was unexpectedly accepted")
    refs = byte_vocabulary(builder, root); front_end = SourceFrontEndBuilder(builder, root, refs)
    data = bytes(case["input"]["bytes"]); content = front_end.content_ref(data); repeated_content = front_end.content_ref(data)
    source = front_end.source_occurrence(data); repeated_source = front_end.source_occurrence(data); network = builder.freeze(root)
    before = network.snapshot(); sequence = read_rooted_sequence(network, content); inverse = {ref: value for value, ref in refs.items()}
    decoded = [inverse[value] for value in sequence.values]; source_link = network.link(source.source); after = network.snapshot()
    return {"id": case["id"], "accepted": True, "observable": {"bytes": decoded, "contentIsRoot": content is root, "contentReused": repeated_content is content, "sourceReused": repeated_source.source is source.source, "sourceStartSelfClosed": source_link.start is source.source and source_link.end is content, "readOnlyCountStable": len(before.links) == len(after.links)}}


def state_basis(builder: LinkNetworkBuilder):
    root = builder.ensure_root(); opening = builder.ensure_start_self_closed(root); closing = builder.ensure_end_self_closed(root)
    linked = builder.ensure(opening, closing); unlinked = builder.ensure(closing, opening)
    return root, opening, closing, linked, unlinked


def run_state(case: dict) -> dict:
    operation = case["input"]["operation"]; builder = LinkNetworkBuilder(); root, opening, closing, linked, unlinked = state_basis(builder)
    context = define_context(builder, opening, closing)
    if operation == "context":
        repeated = define_context(builder, opening, closing); network = builder.freeze(root); before = network.snapshot()
        parent = parent_of_context(network, context); current = current_of_context(network, context); after = network.snapshot()
        observable = {"parentMatches": parent is opening, "currentMatches": current is closing, "contextReused": repeated is context, "readOnlyCountStable": len(before.links) == len(after.links)}
    elif operation == "representative-default":
        network = builder.freeze(root); before = network.snapshot(); resolution = local_representative_resolution(network, context, linked); after = network.snapshot()
        observable = {"representativeMatches": resolution.representative is linked, "bindingCount": len(resolution.bindings), "readOnlyCountStable": len(before.links) == len(after.links)}
    elif operation == "representative-binding":
        _pair, binding = define_local_representative_binding(builder, context, linked, unlinked); _pair2, repeated = define_local_representative_binding(builder, context, linked, unlinked)
        network = builder.freeze(root); before = network.snapshot(); resolution = local_representative_resolution(network, context, linked); after = network.snapshot()
        observable = {"representativeMatches": resolution.representative is unlinked, "bindingCount": len(resolution.bindings), "bindingReused": repeated is binding, "readOnlyCountStable": len(before.links) == len(after.links)}
    elif operation == "representative-conflict":
        define_local_representative_binding(builder, context, linked, opening); define_local_representative_binding(builder, context, linked, closing); network = builder.freeze(root)
        try: local_representative_resolution(network, context, linked)
        except RepresentativeConflictError: return {"id": case["id"], "accepted": False, "error": "representative-conflict"}
        raise RuntimeError("representative conflict was unexpectedly accepted")
    else: raise RuntimeError(f"unknown state operation: {operation}")
    return {"id": case["id"], "accepted": True, "observable": observable}


def dictionary_fixture():
    builder = LinkNetworkBuilder(); root, opening, _closing, linked, unlinked = state_basis(builder)
    content = builder.ensure(linked, linked); form_one = next_anchor(builder, unlinked); form_two = next_anchor(builder, form_one)
    return builder, root, content, form_one, form_two, opening


def run_dictionary(case: dict) -> dict:
    operation = case["input"]["operation"]; builder, root, content, form_one, form_two, forged = dictionary_fixture()
    if operation == "root-sentinel":
        network = builder.freeze(root)
        try: read_dictionary_scope(network, root)
        except DictionaryLookupError: return {"id": case["id"], "accepted": False, "error": "invalid-dictionary"}
        raise RuntimeError("root dictionary sentinel was unexpectedly accepted")

    scope = define_dictionary_scope(builder, root, root)
    first = define_dictionary_effect(builder, scope, root, root, content, form_one)
    repeated = define_dictionary_effect(builder, scope, root, root, content, form_one)
    selected = first.after_scope; expected_form = form_one; expected_occurrence = first.occurrence
    if operation == "parent-visible":
        selected = define_dictionary_scope(builder, first.after_scope, root)
    elif operation == "shadow":
        child = define_dictionary_scope(builder, first.after_scope, root)
        second = define_dictionary_effect(builder, child, first.after_scope, root, content, form_two)
        selected = second.after_scope; expected_form = form_two; expected_occurrence = second.occurrence
    elif operation == "conflict":
        second = define_dictionary_effect(builder, first.after_scope, root, first.history_after, content, form_two)
        network = builder.freeze(root)
        try: lookup_scoped_dictionary(network, second.after_scope, content)
        except DictionaryConflictError: return {"id": case["id"], "accepted": False, "error": "local-form-conflict"}
        raise RuntimeError("dictionary local conflict was unexpectedly accepted")
    elif operation not in ("single", "forged-occurrence"):
        raise RuntimeError(f"unknown dictionary operation: {operation}")

    network = builder.freeze(root); before = network.snapshot(); resolution = lookup_scoped_dictionary(network, selected, content)
    if resolution is None: raise RuntimeError("dictionary fixture did not resolve")
    if operation == "forged-occurrence":
        try: verify_visible_dictionary_occurrence(network, selected, forged, content, expected_form)
        except DictionaryLookupError: return {"id": case["id"], "accepted": False, "error": "invalid-dictionary-evidence"}
        raise RuntimeError("forged dictionary occurrence was unexpectedly accepted")
    verify_visible_dictionary_occurrence(network, selected, expected_occurrence, content, expected_form); after = network.snapshot()
    return {"id": case["id"], "accepted": True, "observable": {"formMatches": resolution.form is expected_form, "occurrenceVisible": expected_occurrence in resolution.occurrences, "occurrenceCount": len(resolution.occurrences), "effectReused": repeated == first, "readOnlyCountStable": len(before.links) == len(after.links)}}


def selection_fixture(builder, root, data, segments):
    refs = byte_vocabulary(builder, root); front_end = SourceFrontEndBuilder(builder, root, refs); source = front_end.source_occurrence(data)
    cursor = refs[255]; forms = []
    for _ in segments:
        cursor = next_anchor(builder, cursor); forms.append(cursor)
    grammar = next_anchor(builder, cursor); theory = next_anchor(builder, grammar)
    dictionary = define_dictionary_scope(builder, root, root); history = root; specs = []
    for start, end, form_index in segments:
        slice_content = front_end.content_ref(data[start:end]); form = forms[form_index]
        effect = define_dictionary_effect(builder, dictionary, root, history, slice_content, form)
        dictionary = effect.after_scope; history = effect.history_after
        specs.append(SegmentSpec(start, end, form, effect.occurrence))
    return refs, front_end, source, forms, dictionary, grammar, theory, specs


def run_selection(case: dict) -> dict:
    operation = case["input"]["operation"]; data = bytes(case["input"]["bytes"]); builder = LinkNetworkBuilder(); root = builder.ensure_root()
    if operation == "dictionary-choice":
        refs = byte_vocabulary(builder, root); front_end = SourceFrontEndBuilder(builder, root, refs); source = front_end.source_occurrence(data); content = front_end.content_ref(data)
        cursor = refs[255]; form_one = next_anchor(builder, cursor); form_two = next_anchor(builder, form_one); grammar = next_anchor(builder, form_two); theory = next_anchor(builder, grammar)
        d1 = define_dictionary_scope(builder, root, root); e1 = define_dictionary_effect(builder, d1, root, root, content, form_one)
        d2 = define_dictionary_scope(builder, root, root); e2 = define_dictionary_effect(builder, d2, root, root, content, form_two)
        ev1 = front_end.build_selected_evidence(source, (SegmentSpec(0, len(data), form_one, e1.occurrence),), dictionary=e1.after_scope, grammar=grammar, theory=theory)
        ev2 = front_end.build_selected_evidence(source, (SegmentSpec(0, len(data), form_two, e2.occurrence),), dictionary=e2.after_scope, grammar=grammar, theory=theory)
        network = builder.freeze(root); before = network.snapshot(); r1 = replay_source_front_end(network, ev1, refs); r2 = replay_source_front_end(network, ev2, refs); after = network.snapshot()
        return {"id": case["id"], "accepted": True, "observable": {"firstMatches": r1 == (form_one,), "secondMatches": r2 == (form_two,), "formsDistinct": form_one is not form_two, "sourceShared": ev1.source is ev2.source, "contentShared": ev1.content is ev2.content, "readOnlyCountStable": len(before.links) == len(after.links)}}

    segments = [tuple(item) for item in case["input"].get("segments", [[0, len(data), 0]])]
    refs, front_end, source, forms, dictionary, grammar, theory, specs = selection_fixture(builder, root, data, segments)
    if operation == "invalid-partition":
        try: front_end.build_selected_evidence(source, tuple(specs), dictionary=dictionary, grammar=grammar, theory=theory)
        except SourceReplayError: return {"id": case["id"], "accepted": False, "error": "invalid-selected-partition"}
        raise RuntimeError("invalid selected partition was unexpectedly accepted")
    evidence = front_end.build_selected_evidence(source, tuple(specs), dictionary=dictionary, grammar=grammar, theory=theory)
    if operation == "forged-resolution":
        evidence = replace(evidence, segments=(replace(evidence.segments[0], resolution=root),))
    network = builder.freeze(root); before = network.snapshot()
    try: resolved = replay_source_front_end(network, evidence, refs)
    except SourceReplayError:
        if operation == "forged-resolution": return {"id": case["id"], "accepted": False, "error": "invalid-source-evidence"}
        raise
    after = network.snapshot(); expected = tuple(forms[index] for _start, _end, index in segments)
    return {"id": case["id"], "accepted": True, "observable": {"formCount": len(resolved), "formsMatchExpected": resolved == expected, "readOnlyCountStable": len(before.links) == len(after.links)}}


def main() -> int:
    if len(sys.argv) != 2: raise SystemExit("usage: python_oracle.py FIXTURES.json")
    corpus = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")); verify_freeze(corpus); results = []
    runners = {"topology": run_topology, "anum": run_anum, "persistence": run_persistence, "source": run_source, "state": run_state, "dictionary": run_dictionary, "selection": run_selection}
    for case in corpus["cases"]:
        runner = runners.get(case["category"])
        if runner is None: raise RuntimeError(f"unknown differential category: {case['category']}")
        results.append(runner(case))
    json.dump(results, sys.stdout, sort_keys=True, separators=(",", ":")); sys.stdout.write("\n"); return 0


if __name__ == "__main__": raise SystemExit(main())
