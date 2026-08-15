import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext, defineLocalRepresentativeBinding } from "../src/state.js";
import { defineDictionaryEffect, defineDictionaryScope } from "../src/dictionary.js";
import {
  buildSelectedSourceEvidence,
  defineSourceForm,
  materializeSourceContent,
  type SourceFrontEndEvidence,
} from "../src/source.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import { type EqualityReplayEvidence, type EqualityRoles } from "../src/interpreter.js";
import { type DecomposeEqualityEvidence, type DecomposeEqualityRoles } from "../src/proof.js";
import { type RunEvidence, type RunStepSelection } from "../src/run.js";
import {
  IntegratedCheckerError,
  replayIntegratedProof,
  type IntegratedProofEvidence,
} from "../src/checker.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface CheckerCase { readonly id: string; readonly operation: string; }
interface Corpus {
  readonly schema: string;
  readonly contract: string;
  readonly pythonOracleSha: string;
  readonly cases: readonly CheckerCase[];
}
interface Result {
  readonly id: string;
  readonly accepted: boolean;
  readonly observable?: Json;
  readonly error?: string;
}

function canonical(value: Json): Json {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}
function sameJson(left: Json, right: Json): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

interface Fixture {
  readonly memory: Memory;
  readonly R: LinkHandle;
  readonly byteRefs: readonly LinkHandle[];
  readonly evidence: IntegratedProofEvidence;
  readonly rule: LinkHandle;
  readonly theory: LinkHandle;
  readonly context: LinkHandle;
  readonly fresh: () => LinkHandle;
}

function equalityRoles(fresh: () => LinkHandle): EqualityRoles {
  return {
    context: fresh(), left: fresh(), right: fresh(),
    leftRepresentative: fresh(), rightRepresentative: fresh(),
  };
}
function proofRoles(fresh: () => LinkHandle): DecomposeEqualityRoles {
  return {
    premiseEqualityAct: fresh(), theory: fresh(), rule: fresh(), ruleMembership: fresh(),
    leftRelation: fresh(), rightRelation: fresh(), startClaim: fresh(), endClaim: fresh(),
    beforeContext: fresh(), afterContext: fresh(),
  };
}
function sourceEvidence(
  memory: Memory,
  byteRefs: readonly LinkHandle[],
  rule: LinkHandle,
  theory: LinkHandle,
  fresh: () => LinkHandle,
): SourceFrontEndEvidence {
  const content = materializeSourceContent(memory, byteRefs, new Uint8Array([7]));
  const source = defineSourceForm(memory, content);
  const before = defineDictionaryScope(memory, memory.root, memory.root);
  const definition = defineDictionaryEffect(
    memory, before, memory.root, memory.root, content, rule,
  );
  return buildSelectedSourceEvidence(
    memory,
    byteRefs,
    source,
    [{ start: 0, end: 1, form: rule, dictionaryOccurrence: definition.occurrence }],
    { dictionary: definition.afterScope, grammar: fresh(), theory },
  );
}

function makeFixture(premiseTrue = true): Fixture {
  const memory = new Memory();
  const { R, U } = ensureRootBasis(memory);
  let cursor = U;
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, R);
    return cursor;
  };
  const byteRefs = Object.freeze(Array.from({ length: 256 }, () => fresh()));
  const context = defineContext(memory, fresh(), fresh());
  const theory = fresh();
  const rule = fresh();
  const source = sourceEvidence(memory, byteRefs, rule, theory, fresh);

  const ls = fresh(); const le = fresh(); const rs = fresh(); const re = fresh();
  const left = memory.ensure(ls, le);
  const right = memory.ensure(rs, re);
  const leftRep = fresh();
  const rightRep = premiseTrue ? leftRep : fresh();
  defineLocalRepresentativeBinding(memory, context, left, leftRep);
  defineLocalRepresentativeBinding(memory, context, right, rightRep);

  const eqRoles = equalityRoles(fresh);
  const eqInterpreter = fresh();
  const eqRoleDictionary = fresh();
  const eqAct = defineActHeader(memory, eqInterpreter, eqRoleDictionary, context);
  for (const [role, value] of [
    [eqRoles.context, context], [eqRoles.left, left], [eqRoles.right, right],
    [eqRoles.leftRepresentative, leftRep], [eqRoles.rightRepresentative, rightRep],
  ] as const) defineActField(memory, eqAct, role, value);
  const premise: EqualityReplayEvidence = {
    act: eqAct, roles: eqRoles, interpreter: eqInterpreter, roleDictionary: eqRoleDictionary,
  };

  const membership = memory.ensure(theory, rule);
  const startClaim = memory.ensure(ls, rs);
  const endClaim = memory.ensure(le, re);
  const pRoles = proofRoles(fresh);
  const proofInterpreter = fresh();
  const proofRoleDictionary = fresh();
  const proofAct = defineActHeader(memory, proofInterpreter, proofRoleDictionary, context);
  for (const [role, value] of [
    [pRoles.premiseEqualityAct, eqAct], [pRoles.theory, theory], [pRoles.rule, rule],
    [pRoles.ruleMembership, membership], [pRoles.leftRelation, left], [pRoles.rightRelation, right],
    [pRoles.startClaim, startClaim], [pRoles.endClaim, endClaim],
    [pRoles.beforeContext, context], [pRoles.afterContext, context],
  ] as const) defineActField(memory, proofAct, role, value);
  const ruleApplication: DecomposeEqualityEvidence = {
    premise, act: proofAct, roles: pRoles,
    interpreter: proofInterpreter, roleDictionary: proofRoleDictionary,
  };

  const eqStep: RunStepSelection = {
    act: eqAct, beforeRole: eqRoles.context, afterRole: eqRoles.context,
  };
  const proofStep: RunStepSelection = {
    act: proofAct, beforeRole: pRoles.beforeContext, afterRole: pRoles.afterContext,
  };
  let runRoot = memory.ensure(R, eqAct);
  runRoot = memory.ensure(runRoot, proofAct);
  const run: RunEvidence = {
    runRoot, initialContext: context, terminalContext: context,
    steps: Object.freeze([eqStep, proofStep]),
  };
  const evidence: IntegratedProofEvidence = {
    source,
    ruleApplication,
    run,
    judgment: { theory, context, goal: { startClaim, endClaim } },
  };
  return { memory, R, byteRefs, evidence, rule, theory, context, fresh };
}

function run(test: CheckerCase): Result {
  const fx = makeFixture(test.operation !== "false-premise");
  let evidence = fx.evidence;

  if (test.operation === "same-goal-pair") {
    const goal = evidence.judgment.goal;
    const poles = fx.memory.poles(goal.startClaim);
    const same = fx.memory.ensure(poles.start, poles.end);
    evidence = { ...evidence, judgment: { ...evidence.judgment, goal: { ...goal, startClaim: same } } };
  } else if (test.operation === "swapped-goal") {
    const goal = evidence.judgment.goal;
    evidence = { ...evidence, judgment: { ...evidence.judgment, goal: {
      startClaim: goal.endClaim, endClaim: goal.startClaim,
    } } };
  } else if (test.operation === "different-goal") {
    const goal = evidence.judgment.goal;
    const poles = fx.memory.poles(goal.startClaim);
    const different = fx.memory.ensure(poles.start, fx.fresh());
    evidence = { ...evidence, judgment: { ...evidence.judgment, goal: { ...goal, startClaim: different } } };
  } else if (test.operation === "judgment-theory") {
    evidence = { ...evidence, judgment: { ...evidence.judgment, theory: fx.fresh() } };
  } else if (test.operation === "judgment-context") {
    const other = defineContext(fx.memory, fx.fresh(), fx.fresh());
    evidence = { ...evidence, judgment: { ...evidence.judgment, context: other } };
  } else if (test.operation === "source-rule") {
    evidence = { ...evidence, source: sourceEvidence(fx.memory, fx.byteRefs, fx.fresh(), fx.theory, fx.fresh) };
  } else if (test.operation === "source-theory") {
    evidence = { ...evidence, source: sourceEvidence(fx.memory, fx.byteRefs, fx.rule, fx.fresh(), fx.fresh) };
  } else if (test.operation === "invalid-premise") {
    const premise = evidence.ruleApplication.premise;
    defineActField(fx.memory, premise.act, premise.roles.leftRepresentative, fx.fresh());
  } else if (test.operation === "invalid-rule") {
    const proof = evidence.ruleApplication;
    defineActField(fx.memory, proof.act, proof.roles.ruleMembership, fx.fresh());
  } else if (test.operation === "proof-context") {
    const proof = evidence.ruleApplication;
    const other = defineContext(fx.memory, fx.fresh(), fx.fresh());
    defineActField(fx.memory, proof.act, proof.roles.afterContext, other);
  } else if (test.operation === "swapped-run") {
    evidence = { ...evidence, run: { ...evidence.run, steps: Object.freeze([...evidence.run.steps].reverse()) } };
  } else if (test.operation === "extra-run-act") {
    const [first, second] = evidence.run.steps;
    assert(first !== undefined && second !== undefined, "integrated fixture requires two run steps");
    let runRoot = evidence.run.runRoot;
    runRoot = fx.memory.ensure(runRoot, second.act);
    evidence = { ...evidence, run: {
      ...evidence.run, runRoot, steps: Object.freeze([first, second, second]),
    } };
  } else if (test.operation === "run-context") {
    const other = defineContext(fx.memory, fx.fresh(), fx.fresh());
    evidence = { ...evidence, run: { ...evidence.run, initialContext: other } };
  } else if (test.operation === "foreign-proof-act") {
    evidence = { ...evidence, ruleApplication: { ...evidence.ruleApplication, act: new Memory().root } };
  }

  const before = fx.memory.linkCount;
  try {
    const claims = replayIntegratedProof(fx.memory, fx.byteRefs, evidence);
    const labels = new Map<LinkHandle, string>([
      [evidence.judgment.goal.startClaim, "start"],
      [evidence.judgment.goal.endClaim, "end"],
    ]);
    return {
      id: test.id,
      accepted: true,
      observable: {
        claims: claims.map((claim) => {
          const label = labels.get(claim);
          assert(label !== undefined, "missing portable checker claim label");
          return label;
        }),
        readOnlyCountStable: before === fx.memory.linkCount,
      },
    };
  } catch (error) {
    if (error instanceof IntegratedCheckerError) {
      return { id: test.id, accepted: false, error: "invalid-integrated-proof" };
    }
    throw error;
  }
}

const repoRoot = resolve(process.cwd(), "..");
const fixturePath = resolve(repoRoot, "differential/checker-fixtures-v0.7.json");
const corpus = JSON.parse(readFileSync(fixturePath, "utf8")) as Corpus;
assert(corpus.schema === "mts-checker-differential-fixtures/v0.1", "unexpected checker differential fixture schema");
assert(corpus.contract === "mts-contract/v0.7", "checker differential fixtures must select accepted v0.7 contract");
assert(corpus.pythonOracleSha === "ef42d91a868bbc5b7004acc325006ad27db3bb68", "checker fixtures must select frozen Python oracle");
const python = spawnSync(
  "python3",
  ["differential/checker_python_oracle.py", "differential/checker-fixtures-v0.7.json"],
  { cwd: repoRoot, encoding: "utf8" },
);
assert(python.status === 0, `frozen Python checker oracle failed: ${python.stderr || python.stdout}`);
const expected = JSON.parse(python.stdout) as Result[];
const actual = corpus.cases.map(run);
assert(expected.length === actual.length, "checker differential result cardinality mismatch");
expected.forEach((pythonResult, index) => {
  const tsResult = actual[index];
  assert(tsResult !== undefined, `missing TS checker result at ${index}`);
  assert(
    sameJson(pythonResult as unknown as Json, tsResult as unknown as Json),
    `checker differential mismatch for ${pythonResult.id}: Python=${JSON.stringify(pythonResult)} TS=${JSON.stringify(tsResult)}`,
  );
});
