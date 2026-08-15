from __future__ import annotations

from dataclasses import replace
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.foundation_v2_checker import (
    IntegratedCheckerError,
    IntegratedProofEvidence,
    ProofGoalEvidence,
    ProofJudgmentEvidence,
    replay_integrated_proof,
)
from core.foundation_v2_interpreter import EqualityEvaluationEvidence, EqualityRoleRefs
from core.foundation_v2_proof import DecomposeEqualityEvidence, DecomposeEqualityRoleRefs
from core.foundation_v2_run import RunEvidence, RunStepEvidence, define_run_chain
from core.foundation_v2_source import SegmentSpec, SourceFrontEndBuilder
from core.foundation_v2_state import (
    define_act_field,
    define_act_header,
    define_context,
    define_dictionary_effect,
    define_dictionary_scope,
    define_local_representative_binding,
    define_membership,
)
from core.rooted_link_network import LinkNetworkBuilder, LinkNetworkError
from python_oracle import git_blob_sha, verify_freeze


CHECKER_BLOB = "e7aec66c79807d52b88d99782bb9b631acb5e197"


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


def byte_refs(builder):
    return {value: anchor(builder) for value in range(256)}


def source_evidence(builder, root, refs, rule, theory):
    front = SourceFrontEndBuilder(builder, root, refs)
    raw = b"\x07"
    source = front.source_occurrence(raw)
    before = define_dictionary_scope(builder, root, root)
    definition = define_dictionary_effect(
        builder,
        before,
        root,
        root,
        front.content_ref(raw),
        rule,
    )
    return front.build_selected_evidence(
        source,
        (SegmentSpec(0, 1, rule, definition.occurrence),),
        dictionary=definition.after_scope,
        grammar=anchor(builder),
        theory=theory,
    )


def equality_roles(builder):
    return EqualityRoleRefs(*[anchor(builder) for _ in range(5)])


def proof_roles(builder):
    return DecomposeEqualityRoleRefs(*[anchor(builder) for _ in range(10)])


def fixture(*, premise_true=True):
    builder = LinkNetworkBuilder()
    root = anchor(builder)
    refs = byte_refs(builder)
    context = define_context(builder, anchor(builder), anchor(builder))
    theory = anchor(builder)
    rule = anchor(builder)
    source = source_evidence(builder, root, refs, rule, theory)

    ls, le, rs, re = (anchor(builder) for _ in range(4))
    left = builder.ensure(ls, le)
    right = builder.ensure(rs, re)
    left_rep = anchor(builder)
    right_rep = left_rep if premise_true else anchor(builder)
    define_local_representative_binding(builder, context, left, left_rep)
    define_local_representative_binding(builder, context, right, right_rep)

    eq_roles = equality_roles(builder)
    eq_i = anchor(builder)
    eq_dict = define_dictionary_scope(builder, root, root)
    eq_act = define_act_header(builder, eq_i, eq_dict, context)
    for role, value in (
        (eq_roles.context, context),
        (eq_roles.left, left),
        (eq_roles.right, right),
        (eq_roles.left_representative, left_rep),
        (eq_roles.right_representative, right_rep),
    ):
        define_act_field(builder, eq_act, role, value)
    premise = EqualityEvaluationEvidence(
        interpreter=eq_i,
        context=context,
        left=left,
        right=right,
        left_representative=left_rep,
        right_representative=right_rep,
        act=eq_act,
        role_dictionary=eq_dict,
        roles=eq_roles,
    )

    membership = define_membership(builder, theory, rule)
    start_claim = builder.ensure(ls, rs)
    end_claim = builder.ensure(le, re)
    p_roles = proof_roles(builder)
    proof_i = anchor(builder)
    proof_dict = define_dictionary_scope(builder, root, root)
    proof_act = define_act_header(builder, proof_i, proof_dict, context)
    for role, value in (
        (p_roles.premise_equality_act, eq_act),
        (p_roles.theory, theory),
        (p_roles.rule, rule),
        (p_roles.rule_membership, membership),
        (p_roles.left_relation, left),
        (p_roles.right_relation, right),
        (p_roles.start_claim, start_claim),
        (p_roles.end_claim, end_claim),
        (p_roles.before_context, context),
        (p_roles.after_context, context),
    ):
        define_act_field(builder, proof_act, role, value)
    proof = DecomposeEqualityEvidence(
        premise=premise,
        interpreter=proof_i,
        theory=theory,
        rule=rule,
        rule_membership=membership,
        left_relation=left,
        right_relation=right,
        start_claim=start_claim,
        end_claim=end_claim,
        before_context=context,
        after_context=context,
        act=proof_act,
        role_dictionary=proof_dict,
        roles=p_roles,
    )

    eq_step = RunStepEvidence(eq_act, context, context, eq_roles.context, eq_roles.context)
    proof_step = RunStepEvidence(
        proof_act,
        context,
        context,
        p_roles.before_context,
        p_roles.after_context,
    )
    run = RunEvidence(
        run_root=define_run_chain(builder, root, (eq_act, proof_act)),
        initial_context=context,
        terminal_context=context,
        steps=(eq_step, proof_step),
    )
    evidence = IntegratedProofEvidence(
        source=source,
        rule_application=proof,
        run=run,
        judgment=ProofJudgmentEvidence(
            theory=theory,
            context=context,
            goal=ProofGoalEvidence(start_claim, end_claim),
        ),
    )
    return builder, root, refs, evidence, rule, theory, context


def analyze(case):
    operation = case["operation"]
    builder, root, refs, evidence, rule, theory, context = fixture(
        premise_true=operation != "false-premise"
    )

    if operation == "same-goal-pair":
        goal = evidence.judgment.goal
        link = builder._links[goal.start_claim.slot]
        same = builder.ensure(link.start, link.end)
        evidence = replace(
            evidence,
            judgment=replace(
                evidence.judgment,
                goal=replace(goal, start_claim=same),
            ),
        )
    elif operation == "swapped-goal":
        goal = evidence.judgment.goal
        evidence = replace(
            evidence,
            judgment=replace(
                evidence.judgment,
                goal=ProofGoalEvidence(goal.end_claim, goal.start_claim),
            ),
        )
    elif operation == "different-goal":
        goal = evidence.judgment.goal
        link = builder._links[goal.start_claim.slot]
        different = builder.ensure(link.start, anchor(builder))
        evidence = replace(
            evidence,
            judgment=replace(
                evidence.judgment,
                goal=replace(goal, start_claim=different),
            ),
        )
    elif operation == "judgment-theory":
        evidence = replace(
            evidence,
            judgment=replace(evidence.judgment, theory=anchor(builder)),
        )
    elif operation == "judgment-context":
        other = define_context(builder, anchor(builder), anchor(builder))
        evidence = replace(
            evidence,
            judgment=replace(evidence.judgment, context=other),
        )
    elif operation == "source-rule":
        evidence = replace(
            evidence,
            source=source_evidence(builder, root, refs, anchor(builder), theory),
        )
    elif operation == "source-theory":
        evidence = replace(
            evidence,
            source=source_evidence(builder, root, refs, rule, anchor(builder)),
        )
    elif operation == "invalid-premise":
        premise = evidence.rule_application.premise
        forged = replace(premise, left_representative=anchor(builder))
        evidence = replace(
            evidence,
            rule_application=replace(evidence.rule_application, premise=forged),
        )
    elif operation == "invalid-rule":
        proof = evidence.rule_application
        define_act_field(builder, proof.act, proof.roles.rule_membership, anchor(builder))
    elif operation == "proof-context":
        proof = evidence.rule_application
        other = define_context(builder, anchor(builder), anchor(builder))
        evidence = replace(
            evidence,
            rule_application=replace(proof, after_context=other),
        )
    elif operation == "swapped-run":
        evidence = replace(
            evidence,
            run=replace(evidence.run, steps=tuple(reversed(evidence.run.steps))),
        )
    elif operation == "extra-run-act":
        first, second = evidence.run.steps
        evidence = replace(
            evidence,
            run=RunEvidence(
                run_root=define_run_chain(builder, root, (first.act, second.act, second.act)),
                initial_context=context,
                terminal_context=context,
                steps=(first, second, second),
            ),
        )
    elif operation == "run-context":
        other = define_context(builder, anchor(builder), anchor(builder))
        evidence = replace(
            evidence,
            run=replace(evidence.run, initial_context=other),
        )
    elif operation == "foreign-proof-act":
        other = LinkNetworkBuilder()
        foreign = other.ensure_root()
        evidence = replace(
            evidence,
            rule_application=replace(evidence.rule_application, act=foreign),
        )

    network = builder.freeze(root)
    before = network.snapshot()
    try:
        claims = replay_integrated_proof(network, evidence, refs)
    except (IntegratedCheckerError, LinkNetworkError):
        return {"id": case["id"], "accepted": False, "error": "invalid-integrated-proof"}

    labels = {
        evidence.judgment.goal.start_claim: "start",
        evidence.judgment.goal.end_claim: "end",
    }
    return {
        "id": case["id"],
        "accepted": True,
        "observable": {
            "claims": [labels[claim] for claim in claims],
            "readOnlyCountStable": before == network.snapshot(),
        },
    }


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: checker_python_oracle.py FIXTURES.json")
    corpus = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    if corpus.get("schema") != "mts-checker-differential-fixtures/v0.1":
        raise RuntimeError("unexpected checker differential fixture schema")
    if corpus.get("contract") != "mts-contract/v0.7":
        raise RuntimeError("checker differential corpus must select accepted v0.7 contract")
    verify_freeze(corpus)
    if git_blob_sha(ROOT / "core/foundation_v2_checker.py") != CHECKER_BLOB:
        raise RuntimeError("frozen Python checker owner drift")
    results = [analyze(case) for case in corpus["cases"]]
    json.dump(results, sys.stdout, sort_keys=True, separators=(",", ":"))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
