from __future__ import annotations

from dataclasses import replace
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.foundation_v2_interpreter import EqualityEvaluationEvidence, EqualityRoleRefs
from core.foundation_v2_proof import (
    DecomposeEqualityEvidence,
    DecomposeEqualityRoleRefs,
    ProofRuleReplayError,
    replay_decompose_equal_relations,
)
from core.foundation_v2_state import (
    define_act_field,
    define_act_header,
    define_context,
    define_dictionary_scope,
    define_local_representative_binding,
    define_membership,
)
from core.rooted_link_network import LinkNetworkBuilder
from python_oracle import git_blob_sha, verify_freeze


PROOF_BLOB = "7aadf362e9cbd8f13f3bebe3ff4cd005aefbc218"


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


def equality_roles(builder):
    return EqualityRoleRefs(
        context=anchor(builder),
        left=anchor(builder),
        right=anchor(builder),
        left_representative=anchor(builder),
        right_representative=anchor(builder),
    )


def proof_roles(builder):
    return DecomposeEqualityRoleRefs(
        premise_equality_act=anchor(builder),
        theory=anchor(builder),
        rule=anchor(builder),
        rule_membership=anchor(builder),
        left_relation=anchor(builder),
        right_relation=anchor(builder),
        start_claim=anchor(builder),
        end_claim=anchor(builder),
        before_context=anchor(builder),
        after_context=anchor(builder),
    )


def equality_premise(builder, root, context, left, right, left_rep, right_rep):
    interpreter = anchor(builder)
    role_dictionary = define_dictionary_scope(builder, root, root)
    roles = equality_roles(builder)
    act = define_act_header(builder, interpreter, role_dictionary, context)
    for role, value in (
        (roles.context, context),
        (roles.left, left),
        (roles.right, right),
        (roles.left_representative, left_rep),
        (roles.right_representative, right_rep),
    ):
        define_act_field(builder, act, role, value)
    return EqualityEvaluationEvidence(
        interpreter=interpreter,
        context=context,
        left=left,
        right=right,
        left_representative=left_rep,
        right_representative=right_rep,
        act=act,
        role_dictionary=role_dictionary,
        roles=roles,
    )


def proof_evidence(
    builder,
    root,
    premise,
    *,
    left=None,
    right=None,
    theory=None,
    rule=None,
    rule_membership=None,
    start_claim=None,
    end_claim=None,
    before_context=None,
    after_context=None,
    header_after=None,
    premise_act_field=None,
    conflicting_field=False,
):
    left = premise.left if left is None else left
    right = premise.right if right is None else right
    theory = anchor(builder) if theory is None else theory
    rule = anchor(builder) if rule is None else rule
    rule_membership = (
        define_membership(builder, theory, rule)
        if rule_membership is None
        else rule_membership
    )
    left_link = builder._links[left.slot]
    right_link = builder._links[right.slot]
    if start_claim is None:
        start_claim = builder.ensure(left_link.start, right_link.start)
    if end_claim is None:
        end_claim = builder.ensure(left_link.end, right_link.end)
    before_context = premise.context if before_context is None else before_context
    after_context = before_context if after_context is None else after_context
    interpreter = anchor(builder)
    role_dictionary = define_dictionary_scope(builder, root, root)
    roles = proof_roles(builder)
    act = define_act_header(
        builder,
        interpreter,
        role_dictionary,
        after_context if header_after is None else header_after,
    )
    fields = (
        (roles.premise_equality_act, premise.act if premise_act_field is None else premise_act_field),
        (roles.theory, theory),
        (roles.rule, rule),
        (roles.rule_membership, rule_membership),
        (roles.left_relation, left),
        (roles.right_relation, right),
        (roles.start_claim, start_claim),
        (roles.end_claim, end_claim),
        (roles.before_context, before_context),
        (roles.after_context, after_context),
    )
    for role_ref, value in fields:
        define_act_field(builder, act, role_ref, value)
    if conflicting_field:
        define_act_field(builder, act, roles.start_claim, anchor(builder))
    return DecomposeEqualityEvidence(
        premise=premise,
        interpreter=interpreter,
        theory=theory,
        rule=rule,
        rule_membership=rule_membership,
        left_relation=left,
        right_relation=right,
        start_claim=start_claim,
        end_claim=end_claim,
        before_context=before_context,
        after_context=after_context,
        act=act,
        role_dictionary=role_dictionary,
        roles=roles,
    )


def true_fixture(*, nested=False):
    builder = LinkNetworkBuilder()
    root = anchor(builder)
    context = define_context(builder, anchor(builder), anchor(builder))
    if nested:
        left_start = builder.ensure(anchor(builder), anchor(builder))
        left_end = builder.ensure(anchor(builder), anchor(builder))
        right_start = builder.ensure(anchor(builder), anchor(builder))
        right_end = builder.ensure(anchor(builder), anchor(builder))
    else:
        left_start = anchor(builder)
        left_end = anchor(builder)
        right_start = anchor(builder)
        right_end = anchor(builder)
    left = builder.ensure(left_start, left_end)
    right = builder.ensure(right_start, right_end)
    representative = anchor(builder)
    define_local_representative_binding(builder, context, left, representative)
    define_local_representative_binding(builder, context, right, representative)
    premise = equality_premise(
        builder, root, context, left, right, representative, representative
    )
    return builder, root, context, left, right, premise


def false_fixture():
    builder = LinkNetworkBuilder()
    root = anchor(builder)
    context = define_context(builder, anchor(builder), anchor(builder))
    left = builder.ensure(anchor(builder), anchor(builder))
    right = builder.ensure(anchor(builder), anchor(builder))
    premise = equality_premise(builder, root, context, left, right, left, right)
    return builder, root, context, left, right, premise


def analyze(case: dict) -> dict:
    operation = case["operation"]
    nested = operation == "nested-first-level"
    if operation == "false-premise":
        builder, root, context, left, right, premise = false_fixture()
    elif operation == "partial-relation":
        builder = LinkNetworkBuilder()
        root = anchor(builder)
        context = define_context(builder, anchor(builder), anchor(builder))
        fixed = anchor(builder)
        left = builder.ensure_start_self_closed(fixed)
        right = builder.ensure(anchor(builder), anchor(builder))
        representative = anchor(builder)
        define_local_representative_binding(builder, context, left, representative)
        define_local_representative_binding(builder, context, right, representative)
        premise = equality_premise(
            builder, root, context, left, right, representative, representative
        )
    else:
        builder, root, context, left, right, premise = true_fixture(nested=nested)

    evidence = proof_evidence(builder, root, premise)

    if operation == "same-relation":
        left_link = builder._links[left.slot]
        same = builder.ensure(left_link.start, left_link.end)
        evidence = proof_evidence(builder, root, premise, left=same)
    elif operation == "premise-act-mismatch":
        other = equality_premise(builder, root, context, left, right, premise.left_representative, premise.right_representative)
        evidence = proof_evidence(builder, root, premise, premise_act_field=other.act)
    elif operation == "premise-relation-mismatch":
        other_left = builder.ensure(anchor(builder), anchor(builder))
        evidence = proof_evidence(builder, root, premise, left=other_left)
    elif operation == "premise-context-mismatch":
        other_context = define_context(builder, anchor(builder), anchor(builder))
        evidence = proof_evidence(
            builder,
            root,
            premise,
            before_context=other_context,
            after_context=other_context,
        )
    elif operation == "rule-not-admitted":
        theory = anchor(builder)
        other_theory = anchor(builder)
        rule = anchor(builder)
        wrong = define_membership(builder, other_theory, rule)
        evidence = proof_evidence(
            builder, root, premise, theory=theory, rule=rule, rule_membership=wrong
        )
    elif operation == "forged-start-claim":
        forged = builder.ensure(anchor(builder), anchor(builder))
        evidence = proof_evidence(builder, root, premise, start_claim=forged)
    elif operation == "forged-end-claim":
        forged = builder.ensure(anchor(builder), anchor(builder))
        evidence = proof_evidence(builder, root, premise, end_claim=forged)
    elif operation == "context-change":
        other_context = define_context(builder, anchor(builder), anchor(builder))
        evidence = proof_evidence(
            builder,
            root,
            premise,
            before_context=context,
            after_context=other_context,
        )
    elif operation == "conflicting-field":
        evidence = proof_evidence(builder, root, premise, conflicting_field=True)
    elif operation == "header-mismatch":
        other_context = define_context(builder, anchor(builder), anchor(builder))
        evidence = proof_evidence(builder, root, premise, header_after=other_context)
    elif operation == "foreign-act":
        other = LinkNetworkBuilder()
        foreign = other.ensure_root()
        evidence = replace(evidence, act=foreign)

    network = builder.freeze(root)
    before = network.snapshot()
    try:
        claims = replay_decompose_equal_relations(network, evidence)
    except ProofRuleReplayError:
        return {"id": case["id"], "accepted": False, "error": "invalid-proof-evidence"}

    labels = {evidence.start_claim: "start", evidence.end_claim: "end"}
    observable = {
        "claims": [labels[claim] for claim in claims],
        "readOnlyCountStable": before == network.snapshot(),
    }
    if operation == "nested-first-level":
        left_start = network.link(left).start
        right_start = network.link(right).start
        nested_left = network.link(left_start)
        nested_right = network.link(right_start)
        observable["nestedClaimAbsent"] = (
            network.find(nested_left.start, nested_right.start) is None
        )
    return {"id": case["id"], "accepted": True, "observable": observable}


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: proof_python_oracle.py FIXTURES.json")
    corpus = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    if corpus.get("schema") != "mts-proof-differential-fixtures/v0.1":
        raise RuntimeError("unexpected proof differential fixture schema")
    if corpus.get("contract") != "mts-contract/v0.7":
        raise RuntimeError("proof differential corpus must select accepted v0.7 contract")
    verify_freeze(corpus)
    if git_blob_sha(ROOT / "core/foundation_v2_proof.py") != PROOF_BLOB:
        raise RuntimeError("frozen Python proof owner drift")
    results = [analyze(case) for case in corpus["cases"]]
    json.dump(results, sys.stdout, sort_keys=True, separators=(",", ":"))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
