from __future__ import annotations

from dataclasses import replace
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.foundation_v2_run import (
    RunEvidence,
    RunReplayError,
    RunStepEvidence,
    define_run_chain,
    replay_run,
)
from core.foundation_v2_state import (
    define_act_field,
    define_act_header,
    define_context,
    define_dictionary_scope,
)
from core.rooted_link_network import LinkNetworkBuilder
from python_oracle import git_blob_sha, verify_freeze


RUN_BLOB = "5c68972c52d355609e63b332fa0d5004f44052fc"


def anchor(builder: LinkNetworkBuilder):
    if not builder._refs:
        return builder.ensure_root()
    current = next(
        ref
        for ref, link in reversed(list(zip(builder._refs, builder._links)))
        if link is not None
    )
    count = len(builder._refs)
    while len(builder._refs) == count:
        current = builder.ensure_start_self_closed(current)
    return current


def fixture():
    builder = LinkNetworkBuilder()
    root = anchor(builder)
    interpreter = anchor(builder)
    role_dictionary = define_dictionary_scope(builder, root, root)
    before_role = anchor(builder)
    after_role = anchor(builder)
    return builder, root, interpreter, role_dictionary, before_role, after_role


def context(builder, root, seed):
    parent = builder.ensure(seed, root)
    current = builder.ensure(root, seed)
    return define_context(builder, parent, current)


def step(
    builder,
    interpreter,
    role_dictionary,
    before_role,
    after_role,
    before,
    after,
    *,
    header_after=None,
):
    act = define_act_header(
        builder,
        interpreter,
        role_dictionary,
        after if header_after is None else header_after,
    )
    define_act_field(builder, act, before_role, before)
    define_act_field(builder, act, after_role, after)
    return RunStepEvidence(
        act=act,
        before_context=before,
        after_context=after,
        before_role=before_role,
        after_role=after_role,
    )


def run_evidence(builder, root, steps, initial, terminal):
    return RunEvidence(
        run_root=define_run_chain(builder, root, tuple(item.act for item in steps)),
        initial_context=initial,
        terminal_context=terminal,
        steps=tuple(steps),
    )


def analyze(case: dict) -> dict:
    builder, root, interpreter, role_dictionary, before_role, after_role = fixture()
    k0 = context(builder, root, before_role)
    k1 = context(builder, root, after_role)
    k2 = context(builder, root, interpreter)

    def make(before, after, *, header_after=None):
        return step(
            builder,
            interpreter,
            role_dictionary,
            before_role,
            after_role,
            before,
            after,
            header_after=header_after,
        )

    operation = case["operation"]
    labels = {}

    if operation == "linear":
        s0 = make(k0, k1)
        s1 = make(k1, k2)
        evidence = run_evidence(builder, root, (s0, s1), k0, k2)
        labels = {s0.act: "a0", s1.act: "a1"}
    elif operation == "repeated-act":
        s0 = make(k0, k0)
        evidence = run_evidence(builder, root, (s0, s0), k0, k0)
        labels = {s0.act: "a0"}
    elif operation == "context-return":
        s0 = make(k0, k1)
        s1 = make(k1, k0)
        evidence = run_evidence(builder, root, (s0, s1), k0, k0)
        labels = {s0.act: "a0", s1.act: "a1"}
    elif operation == "unselected-branch":
        s0 = make(k0, k1)
        make(k0, k2)
        evidence = run_evidence(builder, root, (s0,), k0, k1)
        labels = {s0.act: "a0"}
    elif operation == "empty-identity":
        evidence = run_evidence(builder, root, (), k0, k0)
    elif operation == "reordered":
        s0 = make(k0, k1)
        s1 = make(k1, k2)
        good = run_evidence(builder, root, (s0, s1), k0, k2)
        evidence = replace(good, steps=(s1, s0))
    elif operation == "discontinuity":
        s0 = make(k0, k1)
        s1 = make(k2, k0)
        evidence = run_evidence(builder, root, (s0, s1), k0, k0)
    elif operation == "initial-mismatch":
        s0 = make(k0, k1)
        evidence = run_evidence(builder, root, (s0,), k2, k1)
    elif operation == "terminal-mismatch":
        s0 = make(k0, k1)
        evidence = run_evidence(builder, root, (s0,), k0, k2)
    elif operation == "forged-before":
        s0 = make(k0, k1)
        define_act_field(builder, s0.act, before_role, k2)
        evidence = run_evidence(builder, root, (s0,), k0, k1)
    elif operation == "forged-after":
        s0 = make(k0, k1)
        define_act_field(builder, s0.act, after_role, k2)
        evidence = run_evidence(builder, root, (s0,), k0, k1)
    elif operation == "header-mismatch":
        s0 = make(k0, k1, header_after=k2)
        evidence = run_evidence(builder, root, (s0,), k0, k1)
    elif operation == "invalid-before-context":
        invalid = builder.ensure(before_role, after_role)
        s0 = make(invalid, k0)
        evidence = run_evidence(builder, root, (s0,), invalid, k0)
    elif operation == "invalid-after-context":
        invalid = builder.ensure(before_role, after_role)
        s0 = make(k0, invalid)
        evidence = run_evidence(builder, root, (s0,), k0, invalid)
    elif operation == "empty-context-change":
        evidence = run_evidence(builder, root, (), k0, k1)
    elif operation == "empty-invalid-context":
        invalid = builder.ensure(before_role, after_role)
        evidence = run_evidence(builder, root, (), invalid, invalid)
    elif operation == "empty-root-mismatch":
        evidence = RunEvidence(
            run_root=before_role,
            initial_context=k0,
            terminal_context=k0,
            steps=(),
        )
    elif operation == "chain-extra-prefix":
        s0 = make(k0, k0)
        good = run_evidence(builder, root, (s0,), k0, k0)
        extra = builder.ensure(root, after_role)
        forged = builder.ensure(extra, s0.act)
        evidence = replace(good, run_root=forged)
    elif operation == "chain-ended-early":
        s0 = make(k0, k0)
        good = run_evidence(builder, root, (s0,), k0, k0)
        evidence = replace(good, run_root=root)
    elif operation == "foreign-root":
        other = LinkNetworkBuilder()
        foreign = other.ensure_root()
        evidence = RunEvidence(
            run_root=foreign,
            initial_context=k0,
            terminal_context=k0,
            steps=(),
        )
    else:
        raise RuntimeError(f"unknown Run differential operation: {operation}")

    network = builder.freeze(root)
    before = network.snapshot()
    try:
        acts = replay_run(network, evidence)
    except RunReplayError:
        return {"id": case["id"], "accepted": False, "error": "invalid-run-evidence"}
    observable = {
        "acts": [labels[act] for act in acts],
        "readOnlyCountStable": before == network.snapshot(),
    }
    if operation == "linear":
        observable["shortcutAbsent"] = network.find(k0, k2) is None
    return {"id": case["id"], "accepted": True, "observable": observable}


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: run_python_oracle.py FIXTURES.json")
    corpus = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    if corpus.get("schema") != "mts-run-differential-fixtures/v0.1":
        raise RuntimeError("unexpected Run differential fixture schema")
    if corpus.get("contract") != "mts-contract/v0.7":
        raise RuntimeError("Run differential corpus must select accepted v0.7 contract")
    verify_freeze(corpus)
    if git_blob_sha(ROOT / "core/foundation_v2_run.py") != RUN_BLOB:
        raise RuntimeError("frozen Python Run owner drift")
    results = [analyze(case) for case in corpus["cases"]]
    json.dump(results, sys.stdout, sort_keys=True, separators=(",", ":"))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
