import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext, defineLocalRepresentativeBinding } from "../src/state.js";
import { defineActField, defineActHeader, readRequiredSingle } from "../src/structural-readers.js";
import { type EqualityReplayEvidence, type EqualityRoles } from "../src/interpreter.js";
import {
  ProofRuleReplayError,
  replayDecomposeEqualRelations,
  type DecomposeEqualityEvidence,
  type DecomposeEqualityRoles,
} from "../src/proof.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface ProofCase { readonly id: string; readonly operation: string; }
interface Corpus {
  readonly schema: string;
  readonly contract: string;
  readonly pythonOracleSha: string;
  readonly cases: readonly ProofCase[];
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
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}
function sameJson(left: Json, right: Json): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function fixture() {
  const memory = new Memory();
  const { R, U } = ensureRootBasis(memory);
  let cursor = U;
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, R);
    return cursor;
  };
  return { memory, R, fresh };
}
type Fixture = ReturnType<typeof fixture>;

function equalityRoles(fx: Fixture): EqualityRoles {
  return {
    context: fx.fresh(), left: fx.fresh(), right: fx.fresh(),
    leftRepresentative: fx.fresh(), rightRepresentative: fx.fresh(),
  };
}
function proofRoles(fx: Fixture): DecomposeEqualityRoles {
  return {
    premiseEqualityAct: fx.fresh(), theory: fx.fresh(), rule: fx.fresh(),
    ruleMembership: fx.fresh(), leftRelation: fx.fresh(), rightRelation: fx.fresh(),
    startClaim: fx.fresh(), endClaim: fx.fresh(), beforeContext: fx.fresh(), afterContext: fx.fresh(),
  };
}
function equalityPremise(
  fx: Fixture,
  context: LinkHandle,
  left: LinkHandle,
  right: LinkHandle,
  leftRepresentative: LinkHandle,
  rightRepresentative: LinkHandle,
): EqualityReplayEvidence {
  const interpreter = fx.fresh();
  const roleDictionary = fx.fresh();
  const roles = equalityRoles(fx);
  const act = defineActHeader(fx.memory, interpreter, roleDictionary, context);
  for (const [role, value] of [
    [roles.context, context], [roles.left, left], [roles.right, right],
    [roles.leftRepresentative, leftRepresentative], [roles.rightRepresentative, rightRepresentative],
  ] as const) defineActField(fx.memory, act, role, value);
  return { act, roles, interpreter, roleDictionary };
}

interface ProofOptions {
  readonly theory?: LinkHandle;
  readonly rule?: LinkHandle;
  readonly ruleMembership?: LinkHandle;
  readonly left?: LinkHandle;
  readonly right?: LinkHandle;
  readonly startClaim?: LinkHandle;
  readonly endClaim?: LinkHandle;
  readonly beforeContext?: LinkHandle;
  readonly afterContext?: LinkHandle;
  readonly headerAfter?: LinkHandle;
  readonly premiseActField?: LinkHandle;
  readonly conflictingField?: boolean;
}
function proofEvidence(
  fx: Fixture,
  premise: EqualityReplayEvidence,
  options: ProofOptions = {},
): DecomposeEqualityEvidence {
  const premiseContext = readRequiredSingle(fx.memory, premise.act, premise.roles.context);
  const premiseLeft = readRequiredSingle(fx.memory, premise.act, premise.roles.left);
  const premiseRight = readRequiredSingle(fx.memory, premise.act, premise.roles.right);
  const theory = options.theory ?? fx.fresh();
  const rule = options.rule ?? fx.fresh();
  const ruleMembership = options.ruleMembership ?? fx.memory.ensure(theory, rule);
  const left = options.left ?? premiseLeft;
  const right = options.right ?? premiseRight;
  const leftPoles = fx.memory.poles(left);
  const rightPoles = fx.memory.poles(right);
  const startClaim = options.startClaim ?? fx.memory.ensure(leftPoles.start, rightPoles.start);
  const endClaim = options.endClaim ?? fx.memory.ensure(leftPoles.end, rightPoles.end);
  const beforeContext = options.beforeContext ?? premiseContext;
  const afterContext = options.afterContext ?? beforeContext;
  const interpreter = fx.fresh();
  const roleDictionary = fx.fresh();
  const roles = proofRoles(fx);
  const act = defineActHeader(fx.memory, interpreter, roleDictionary, options.headerAfter ?? afterContext);
  for (const [role, value] of [
    [roles.premiseEqualityAct, options.premiseActField ?? premise.act],
    [roles.theory, theory], [roles.rule, rule], [roles.ruleMembership, ruleMembership],
    [roles.leftRelation, left], [roles.rightRelation, right], [roles.startClaim, startClaim],
    [roles.endClaim, endClaim], [roles.beforeContext, beforeContext], [roles.afterContext, afterContext],
  ] as const) defineActField(fx.memory, act, role, value);
  if (options.conflictingField === true) defineActField(fx.memory, act, roles.startClaim, fx.fresh());
  return { premise, act, roles, interpreter, roleDictionary };
}

function trueFixture(nested = false) {
  const fx = fixture();
  const context = defineContext(fx.memory, fx.fresh(), fx.fresh());
  const leftStart = nested ? fx.memory.ensure(fx.fresh(), fx.fresh()) : fx.fresh();
  const leftEnd = nested ? fx.memory.ensure(fx.fresh(), fx.fresh()) : fx.fresh();
  const rightStart = nested ? fx.memory.ensure(fx.fresh(), fx.fresh()) : fx.fresh();
  const rightEnd = nested ? fx.memory.ensure(fx.fresh(), fx.fresh()) : fx.fresh();
  const left = fx.memory.ensure(leftStart, leftEnd);
  const right = fx.memory.ensure(rightStart, rightEnd);
  const representative = fx.fresh();
  defineLocalRepresentativeBinding(fx.memory, context, left, representative);
  defineLocalRepresentativeBinding(fx.memory, context, right, representative);
  const premise = equalityPremise(fx, context, left, right, representative, representative);
  return { fx, context, left, right, premise };
}
function falseFixture() {
  const fx = fixture();
  const context = defineContext(fx.memory, fx.fresh(), fx.fresh());
  const left = fx.memory.ensure(fx.fresh(), fx.fresh());
  const right = fx.memory.ensure(fx.fresh(), fx.fresh());
  const premise = equalityPremise(fx, context, left, right, left, right);
  return { fx, context, left, right, premise };
}

function run(test: ProofCase): Result {
  let base = test.operation === "false-premise" ? falseFixture() : trueFixture(test.operation === "nested-first-level");
  if (test.operation === "partial-relation") {
    const fx = fixture();
    const context = defineContext(fx.memory, fx.fresh(), fx.fresh());
    const fixed = fx.fresh();
    const left = fx.memory.ensureStartSelfClosed(fixed);
    const right = fx.memory.ensure(fx.fresh(), fx.fresh());
    const representative = fx.fresh();
    defineLocalRepresentativeBinding(fx.memory, context, left, representative);
    defineLocalRepresentativeBinding(fx.memory, context, right, representative);
    const premise = equalityPremise(fx, context, left, right, representative, representative);
    base = { fx, context, left, right, premise };
  }
  const { fx, context, left, right, premise } = base;
  let evidence = proofEvidence(fx, premise);

  if (test.operation === "same-relation") {
    const poles = fx.memory.poles(left);
    evidence = proofEvidence(fx, premise, { left: fx.memory.ensure(poles.start, poles.end) });
  } else if (test.operation === "premise-act-mismatch") {
    const leftRep = readRequiredSingle(fx.memory, premise.act, premise.roles.leftRepresentative);
    const rightRep = readRequiredSingle(fx.memory, premise.act, premise.roles.rightRepresentative);
    const other = equalityPremise(fx, context, left, right, leftRep, rightRep);
    evidence = proofEvidence(fx, premise, { premiseActField: other.act });
  } else if (test.operation === "premise-relation-mismatch") {
    evidence = proofEvidence(fx, premise, { left: fx.memory.ensure(fx.fresh(), fx.fresh()) });
  } else if (test.operation === "premise-context-mismatch") {
    const otherContext = defineContext(fx.memory, fx.fresh(), fx.fresh());
    evidence = proofEvidence(fx, premise, { beforeContext: otherContext, afterContext: otherContext });
  } else if (test.operation === "rule-not-admitted") {
    const theory = fx.fresh();
    const otherTheory = fx.fresh();
    const rule = fx.fresh();
    evidence = proofEvidence(fx, premise, {
      theory, rule, ruleMembership: fx.memory.ensure(otherTheory, rule),
    });
  } else if (test.operation === "forged-start-claim") {
    evidence = proofEvidence(fx, premise, { startClaim: fx.memory.ensure(fx.fresh(), fx.fresh()) });
  } else if (test.operation === "forged-end-claim") {
    evidence = proofEvidence(fx, premise, { endClaim: fx.memory.ensure(fx.fresh(), fx.fresh()) });
  } else if (test.operation === "context-change") {
    const otherContext = defineContext(fx.memory, fx.fresh(), fx.fresh());
    evidence = proofEvidence(fx, premise, { beforeContext: context, afterContext: otherContext });
  } else if (test.operation === "conflicting-field") {
    evidence = proofEvidence(fx, premise, { conflictingField: true });
  } else if (test.operation === "header-mismatch") {
    const otherContext = defineContext(fx.memory, fx.fresh(), fx.fresh());
    evidence = proofEvidence(fx, premise, { headerAfter: otherContext });
  } else if (test.operation === "foreign-act") {
    evidence = Object.freeze({ ...evidence, act: new Memory().root });
  }

  const before = fx.memory.linkCount;
  try {
    const claims = replayDecomposeEqualRelations(fx.memory, evidence);
    const startClaim = readRequiredSingle(fx.memory, evidence.act, evidence.roles.startClaim);
    const endClaim = readRequiredSingle(fx.memory, evidence.act, evidence.roles.endClaim);
    const labels = new Map<LinkHandle, string>([[startClaim, "start"], [endClaim, "end"]]);
    const observable: { claims: string[]; readOnlyCountStable: boolean; nestedClaimAbsent?: boolean } = {
      claims: claims.map((claim) => {
        const label = labels.get(claim);
        assert(label !== undefined, "missing portable proof claim label");
        return label;
      }),
      readOnlyCountStable: before === fx.memory.linkCount,
    };
    if (test.operation === "nested-first-level") {
      const leftStart = fx.memory.poles(left).start;
      const rightStart = fx.memory.poles(right).start;
      const nestedLeft = fx.memory.poles(leftStart);
      const nestedRight = fx.memory.poles(rightStart);
      observable.nestedClaimAbsent = fx.memory.find(nestedLeft.start, nestedRight.start) === undefined;
    }
    return { id: test.id, accepted: true, observable };
  } catch (error) {
    if (error instanceof ProofRuleReplayError) {
      return { id: test.id, accepted: false, error: "invalid-proof-evidence" };
    }
    throw error;
  }
}

const repoRoot = resolve(process.cwd(), "..");
const fixturePath = resolve(repoRoot, "differential/proof-fixtures-v0.7.json");
const corpus = JSON.parse(readFileSync(fixturePath, "utf8")) as Corpus;
assert(corpus.schema === "mts-proof-differential-fixtures/v0.1", "unexpected proof differential fixture schema");
assert(corpus.contract === "mts-contract/v0.7", "proof differential fixtures must select accepted v0.7 contract");
assert(corpus.pythonOracleSha === "ef42d91a868bbc5b7004acc325006ad27db3bb68", "proof fixtures must select frozen Python oracle");
const python = spawnSync(
  "python3",
  ["differential/proof_python_oracle.py", "differential/proof-fixtures-v0.7.json"],
  { cwd: repoRoot, encoding: "utf8" },
);
assert(python.status === 0, `frozen Python proof oracle failed: ${python.stderr || python.stdout}`);
const expected = JSON.parse(python.stdout) as Result[];
const actual = corpus.cases.map(run);
assert(expected.length === actual.length, "proof differential result cardinality mismatch");
expected.forEach((pythonResult, index) => {
  const tsResult = actual[index];
  assert(tsResult !== undefined, `missing TS proof result at ${index}`);
  assert(
    sameJson(pythonResult as unknown as Json, tsResult as unknown as Json),
    `proof differential mismatch for ${pythonResult.id}: Python=${JSON.stringify(pythonResult)} TS=${JSON.stringify(tsResult)}`,
  );
});
