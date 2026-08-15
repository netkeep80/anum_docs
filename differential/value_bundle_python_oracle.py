from __future__ import annotations

import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.foundation_v2_value_bundle import (
    BundleElaborationError,
    BundleNodeKind,
    BundleRoleSkeletonBuilder,
    BundleValue,
    ExpectedRole,
    LinkValue,
    ResolvedOccurrence,
    ValueBundleReplayError,
    build_value_bundle_vocabulary,
    elaborate_bundle_roles,
    expand_resolved_bundle_query,
    resolve_flat_bundle,
    values_equal,
)
from core.rooted_link_network import LinkNetworkBuilder
from python_oracle import git_blob_sha, verify_freeze


VALUE_BUNDLE_BLOB = "5ca02bf27e71960e714dca995fa09f32fada065b"


def static_fixture():
    builder = LinkNetworkBuilder()
    vocabulary = build_value_bundle_vocabulary(builder)
    skeleton = BundleRoleSkeletonBuilder(builder, vocabulary)

    def scalar():
        return skeleton.node(BundleNodeKind.SCALAR)

    def bundle(*children):
        return skeleton.node(BundleNodeKind.BUNDLE, children)

    def comparison(left, right):
        return skeleton.node(BundleNodeKind.COMPARISON, (left, right))

    return builder, vocabulary, skeleton, scalar, bundle, comparison


def role_result(case_id: str, builder, vocabulary, carrier, entry=ExpectedRole.NONE) -> dict:
    network = builder.freeze()
    before = network.snapshot()
    try:
        result = elaborate_bundle_roles(network, carrier, vocabulary, entry=entry)
    except BundleElaborationError as exc:
        return {
            "id": case_id,
            "accepted": False,
            "error": exc.code,
            "path": list(exc.path),
        }
    except ValueBundleReplayError:
        return {"id": case_id, "accepted": False, "error": "invalid-value-bundle-evidence"}
    return {
        "id": case_id,
        "accepted": True,
        "observable": {
            "roles": [
                {"path": list(item.path), "role": item.role.value}
                for item in result.roles
            ],
            "readOnlyCountStable": before == network.snapshot(),
        },
    }


def expansion_fixture():
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    one = builder.ensure_end_self_closed(root)
    two = builder.ensure(one, root)
    three = builder.ensure(one, one)
    network = builder.freeze(root)
    labels = {root: "root", one: "one", two: "two", three: "three"}
    return network, root, one, two, three, labels


def foreign_network():
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    return builder.freeze(root)


def occurrence(path, link):
    return ResolvedOccurrence(path=tuple(path), link=link)


def scalar_value(link):
    return LinkValue(link=link)


def bundle_value(network, *links):
    return resolve_flat_bundle(
        network,
        tuple(occurrence((index,), link) for index, link in enumerate(links)),
    )


def link_labels(links, labels) -> list[str]:
    return sorted(labels[link] for link in links)


def analyze(case: dict) -> dict:
    case_id = case["id"]
    operation = case["operation"]

    if operation.startswith("role-") or operation.startswith("error-"):
        builder, vocabulary, skeleton, scalar, bundle, comparison = static_fixture()
        entry = ExpectedRole.NONE
        if operation == "role-constraint":
            carrier = bundle(comparison(scalar(), scalar()), comparison(scalar(), scalar()))
        elif operation == "role-value":
            carrier = bundle(scalar(), scalar())
        elif operation == "role-empty-constraint":
            carrier = bundle()
            entry = ExpectedRole.CONSTRAINT
        elif operation == "role-shared-paths":
            shared = bundle()
            carrier = comparison(shared, shared)
        elif operation == "error-mixed":
            carrier = bundle(scalar(), comparison(scalar(), scalar()))
        elif operation == "error-ambiguous":
            carrier = bundle(bundle())
        elif operation == "error-nested-value":
            carrier = comparison(bundle(bundle(scalar(), scalar())), scalar())
        elif operation == "error-role-mismatch":
            carrier = bundle(scalar(), scalar())
            entry = ExpectedRole.CONSTRAINT
        elif operation == "error-definition-deferred":
            carrier = skeleton.node(BundleNodeKind.DEFINITION, (scalar(), bundle(scalar(), scalar())))
        elif operation == "error-scalar-operator":
            carrier = skeleton.node(BundleNodeKind.UNARY, (bundle(scalar(), scalar()),))
        elif operation == "error-malformed-arity":
            carrier = skeleton.node(BundleNodeKind.COMPARISON, (scalar(),))
        else:
            raise RuntimeError(f"unknown ValueBundle static operation: {operation}")
        return role_result(case_id, builder, vocabulary, carrier, entry)

    if operation == "resolved-provenance":
        network, _root, one, two, _three, labels = expansion_fixture()
        before = network.snapshot()
        result = resolve_flat_bundle(
            network,
            (occurrence((0,), one), occurrence((1,), two), occurrence((2,), one)),
        )
        return {
            "id": case_id,
            "accepted": True,
            "observable": {
                "links": link_labels(result.links, labels),
                "occurrences": [
                    {"path": list(item.path), "link": labels[item.link]}
                    for item in result.occurrences
                ],
                "readOnlyCountStable": before == network.snapshot(),
            },
        }

    if operation == "resolved-equality":
        network, _root, one, two, _three, _labels = expansion_fixture()
        value = resolve_flat_bundle(
            network,
            (occurrence((0,), one), occurrence((1,), two), occurrence((2,), one)),
        )
        reordered = resolve_flat_bundle(network, (occurrence((9,), two), occurrence((8,), one)))
        duplicate_only = resolve_flat_bundle(network, (occurrence((0,), one), occurrence((1,), one)))
        singleton = resolve_flat_bundle(network, (occurrence((0,), one),))
        return {
            "id": case_id,
            "accepted": True,
            "observable": {
                "reorderedEqual": values_equal(value, reordered),
                "duplicatesIdempotent": values_equal(duplicate_only, singleton),
                "differentSetsUnequal": not values_equal(value, singleton),
                "sameScalarEqual": values_equal(scalar_value(one), scalar_value(one)),
                "differentScalarUnequal": not values_equal(scalar_value(one), scalar_value(two)),
                "singletonNotScalar": not values_equal(singleton, scalar_value(one)),
            },
        }

    if operation == "resolved-foreign":
        network, _root, _one, _two, _three, _labels = expansion_fixture()
        other = foreign_network()
        try:
            resolve_flat_bundle(network, (occurrence((0,), other.root),))
        except ValueBundleReplayError:
            return {"id": case_id, "accepted": False, "error": "invalid-value-bundle-evidence"}
        raise RuntimeError("foreign resolved occurrence unexpectedly accepted")

    if operation == "expansion-matrix":
        network, root, one, two, _three, labels = expansion_fixture()
        before = network.snapshot()
        cases = (
            ("single-to-bundle", scalar_value(root), bundle_value(network, root, one)),
            ("bundle-to-single", bundle_value(network, root, one), scalar_value(one)),
            ("cartesian-existing", bundle_value(network, root, one), bundle_value(network, root, one)),
            ("outgoing-wildcard", scalar_value(root), bundle_value(network)),
            ("incoming-wildcard", bundle_value(network), scalar_value(one)),
            ("all-links-wildcard", bundle_value(network), bundle_value(network)),
            ("missing-pair-no-realize", scalar_value(root), bundle_value(network, two)),
        )
        outputs = []
        for name, left, right in cases:
            value = expand_resolved_bundle_query(network, left, right)
            outputs.append({"case": name, "links": link_labels(value.links, labels)})
        return {
            "id": case_id,
            "accepted": True,
            "observable": {
                "outputs": outputs,
                "readOnlyCountStable": before == network.snapshot(),
            },
        }

    if operation == "expansion-scalar-scalar":
        network, root, one, _two, _three, _labels = expansion_fixture()
        try:
            expand_resolved_bundle_query(network, scalar_value(root), scalar_value(one))
        except ValueBundleReplayError:
            return {"id": case_id, "accepted": False, "error": "invalid-value-bundle-evidence"}
        raise RuntimeError("scalar-to-scalar expansion unexpectedly accepted")

    if operation == "expansion-foreign":
        network, _root, one, _two, _three, _labels = expansion_fixture()
        other = foreign_network()
        forged = BundleValue(links=frozenset({other.root}))
        try:
            expand_resolved_bundle_query(network, forged, scalar_value(one))
        except ValueBundleReplayError:
            return {"id": case_id, "accepted": False, "error": "invalid-value-bundle-evidence"}
        raise RuntimeError("foreign expansion endpoint unexpectedly accepted")

    raise RuntimeError(f"unknown ValueBundle differential operation: {operation}")


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: value_bundle_python_oracle.py FIXTURES.json")
    corpus = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    if corpus.get("schema") != "mts-value-bundle-differential-fixtures/v0.1":
        raise RuntimeError("unexpected ValueBundle differential fixture schema")
    if corpus.get("contract") != "mts-contract/v0.7":
        raise RuntimeError("ValueBundle differential corpus must select accepted v0.7 contract")
    verify_freeze(corpus)
    if git_blob_sha(ROOT / "core/foundation_v2_value_bundle.py") != VALUE_BUNDLE_BLOB:
        raise RuntimeError("frozen Python ValueBundle owner drift")
    results = [analyze(case) for case in corpus["cases"]]
    json.dump(results, sys.stdout, sort_keys=True, separators=(",", ":"))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
