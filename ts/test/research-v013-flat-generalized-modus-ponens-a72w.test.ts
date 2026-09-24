import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  readStructuralRoleDictionary,
  readStructuralRule,
  StructuralRuleError,
  verifyStructuralRuleAdmission,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import { unifyStructuralTemplate } from "../src/structural-unification.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A72w flat generalized modus ponens: " + m);
}

function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), m + ": values differ");
}

function sameMembers(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.length, expected.length, message + " cardinality");
  for (const member of expected) {
    assert(actual.includes(member), message + " missing member");
  }
}

/**
 * Current working A-memory is represented as ordinary Link topology:
 *
 *   Scope -> activeLink
 *
 * No separate Set object exists. Scope is START(seed) only so its header Link
 * is distinguishable from ordinary membership attachments.
 */
function defineWorkingScope(
  memory: Memory,
  seed: LinkHandle,
  members: readonly LinkHandle[],
): LinkHandle {
  const scope = memory.ensureStartSelfClosed(seed);
  for (const member of members) memory.ensure(scope, member);
  return scope;
}

function readWorkingScope(
  memory: Memory,
  scope: LinkHandle,
): readonly LinkHandle[] {
  const header = memory.poles(scope);
  assert(
    header.start === scope && header.end !== scope,
    "working scope must have START shape",
  );

  const members: LinkHandle[] = [];
  for (const attachment of memory.outgoing(scope)) {
    if (attachment === scope) continue;
    const poles = memory.poles(attachment);
    if (poles.start !== scope) continue;
    if (!members.includes(poles.end)) members.push(poles.end);
  }
  return Object.freeze(members);
}

/**
 * A-memory substrate current-root.
 *
 * This scalar does not inspect function identity, Rule identity, arity, truth
 * values, Contexts or result kinds. It only publishes one opaque Scope root.
 */
class CurrentScopeCursor {
  constructor(
    private readonly memory: Memory,
    private scope: LinkHandle,
  ) {}

  currentScope(): LinkHandle {
    return this.scope;
  }

  members(): readonly LinkHandle[] {
    return readWorkingScope(this.memory, this.scope);
  }

  switchAtomically(expectedOld: LinkHandle, next: LinkHandle): void {
    same(this.scope, expectedOld, "current scope must match expected old scope");
    this.scope = next;
  }
}

interface GroundedRuleImage {
  readonly outputTemplate: LinkHandle;
  readonly bindings: readonly StructuralRoleBinding[];
}

interface ScopeReaction {
  readonly oldScope: LinkHandle;
  readonly nextScope: LinkHandle;
  readonly oldMembers: readonly LinkHandle[];
  readonly produced: readonly LinkHandle[];
  readonly rawRuleMatches: number;
}

/**
 * Structural continuation:
 *
 *   K -> A
 *   -------- Rule
 *   K -> B
 *
 * K is a declared structural role. The continuation is ordinary Rule topology,
 * not a host relation table and not an opcode.
 */
function defineTransitionRule(
  memory: Memory,
  theory: LinkHandle,
  b: RootBasis,
  seed: LinkHandle,
  from: LinkHandle,
  to: LinkHandle,
): void {
  const kRole = memory.ensure(seed, b.O);
  const dictionary = defineStructuralRoleDictionary(memory, [kRole]);
  const before = memory.ensure(kRole, from);
  const after = memory.ensure(kRole, to);
  const rule = defineStructuralRule(
    memory,
    dictionary,
    memory.ensure(before, after),
  );
  const admission = admitStructuralRule(memory, theory, rule);

  // Local trigger: only outgoing topology of the active endpoint is examined.
  memory.ensure(from, admission);
}

function discoverLocallyTriggeredRuleImages(
  memory: Memory,
  theory: LinkHandle,
  endpoint: LinkHandle,
  active: LinkHandle,
): readonly GroundedRuleImage[] {
  const matches: GroundedRuleImage[] = [];

  for (const trigger of memory.outgoing(endpoint)) {
    if (trigger === endpoint) continue;

    const triggerPoles = memory.poles(trigger);
    if (triggerPoles.start !== endpoint) continue;

    const admission = triggerPoles.end;
    const admissionPoles = memory.poles(admission);
    if (
      admissionPoles.start !== theory ||
      admissionPoles.end === admission
    ) {
      continue;
    }

    try {
      const rule = admissionPoles.end;
      verifyStructuralRuleAdmission(memory, theory, rule, admission);
      const structuralRule = readStructuralRule(memory, rule);
      const dictionary =
        readStructuralRoleDictionary(memory, structuralRule.roleDictionary);
      const body = memory.poles(structuralRule.body);
      const bindings = unifyStructuralTemplate(
        memory,
        body.start,
        active,
        dictionary.roles,
      );
      matches.push(Object.freeze({
        outputTemplate: body.end,
        bindings,
      }));
    } catch (error) {
      if (error instanceof StructuralRuleError) continue;
      throw error;
    }
  }

  return Object.freeze(matches);
}

function instantiateTemplate(
  memory: Memory,
  template: LinkHandle,
  bindings: readonly StructuralRoleBinding[],
): LinkHandle {
  const mapping = new Map<LinkHandle, LinkHandle>();
  for (const binding of bindings) mapping.set(binding.role, binding.value);

  const visiting = new Set<LinkHandle>();
  const clone = (source: LinkHandle): LinkHandle => {
    const bound = mapping.get(source);
    if (bound !== undefined) return bound;

    assert(!visiting.has(source), "unsupported non-self template cycle");
    const poles = memory.poles(source);

    let value: LinkHandle;
    if (poles.start === source && poles.end === source) {
      value = memory.ensureRoot();
    } else if (poles.start === source) {
      value = memory.ensureStartSelfClosed(clone(poles.end));
    } else if (poles.end === source) {
      value = memory.ensureEndSelfClosed(clone(poles.start));
    } else {
      visiting.add(source);
      const start = clone(poles.start);
      const end = clone(poles.end);
      visiting.delete(source);
      value = memory.ensure(start, end);
    }

    mapping.set(source, value);
    return value;
  };

  return clone(template);
}

/**
 * Flat generalized modus-ponens reaction:
 *
 *   K -> {Ai}
 *   {Rule: K -> Ai  =>  K -> Bj}
 *   --------------------------------
 *   K -> {Bj}
 *
 * The braces are only mathematical shorthand for ordinary Link bundles.
 *
 * One and the same kernel handles 1->0, 1->1, 1->N, N->1 and N->M.
 * All matching Rules fire. Duplicate successors collapse by canonical Link
 * identity. No Context lifecycle exists in this witness.
 */
function reactFlatScope(
  memory: Memory,
  theory: LinkHandle,
  cursor: CurrentScopeCursor,
  nextScopeSeed: LinkHandle,
): ScopeReaction {
  const oldScope = cursor.currentScope();
  const before = cursor.members();
  assert(before.length > 0, "reaction requires non-empty current scope");

  const produced: LinkHandle[] = [];
  let rawRuleMatches = 0;

  for (const active of before) {
    const endpoint = memory.poles(active).end;

    for (
      const image of discoverLocallyTriggeredRuleImages(
        memory,
        theory,
        endpoint,
        active,
      )
    ) {
      rawRuleMatches += 1;
      const successor =
        instantiateTemplate(memory, image.outputTemplate, image.bindings);
      if (!produced.includes(successor)) produced.push(successor);

      same(
        cursor.currentScope(),
        oldScope,
        "old scope remains current throughout derivation",
      );
      sameMembers(
        cursor.members(),
        before,
        "partial successor image never becomes current",
      );
    }
  }

  const nextScope = defineWorkingScope(memory, nextScopeSeed, produced);

  same(
    cursor.currentScope(),
    oldScope,
    "complete successor scope is non-current before handoff",
  );
  sameMembers(
    cursor.members(),
    before,
    "allocating successor topology does not expose partial state",
  );

  cursor.switchAtomically(oldScope, nextScope);

  return Object.freeze({
    oldScope,
    nextScope,
    oldMembers: before,
    produced: Object.freeze(produced),
    rawRuleMatches,
  });
}

interface CaseSpec {
  readonly label: string;
  readonly inputs: readonly LinkHandle[];
  readonly expected: readonly LinkHandle[];
  readonly rawRuleMatches: number;
  readonly oldScopeSeed: LinkHandle;
  readonly nextScopeSeed: LinkHandle;
}

function exerciseCase(
  memory: Memory,
  theory: LinkHandle,
  K: LinkHandle,
  spec: CaseSpec,
): void {
  const oldMembers = spec.inputs.map((value) => memory.ensure(K, value));
  const expectedMembers = spec.expected.map((value) => memory.ensure(K, value));

  const oldScope =
    defineWorkingScope(memory, spec.oldScopeSeed, oldMembers);
  const cursor = new CurrentScopeCursor(memory, oldScope);

  sameMembers(
    cursor.members(),
    oldMembers,
    spec.label + " initial current bundle",
  );

  const reaction =
    reactFlatScope(memory, theory, cursor, spec.nextScopeSeed);

  same(
    reaction.rawRuleMatches,
    spec.rawRuleMatches,
    spec.label + " raw causal Rule matches",
  );
  sameMembers(
    reaction.produced,
    expectedMembers,
    spec.label + " canonical successor image",
  );
  sameMembers(
    cursor.members(),
    expectedMembers,
    spec.label + " complete successor is current",
  );

  assert(
    cursor.currentScope() === reaction.nextScope,
    spec.label + " current root is successor Scope",
  );
  assert(
    cursor.currentScope() !== reaction.oldScope,
    spec.label + " old Scope is no longer current",
  );

  sameMembers(
    readWorkingScope(memory, reaction.oldScope),
    oldMembers,
    spec.label + " old topology remains physically readable",
  );

  for (const member of oldMembers) {
    assert(
      !cursor.members().includes(member),
      spec.label + " old working member is not current",
    );
  }
}

function exercise(): void {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 180; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }
  const at = (i: number): LinkHandle => {
    const value = fresh[i];
    assert(value !== undefined, "fresh anchor " + i);
    return value;
  };

  const theory = memory.ensure(at(0), at(1));
  const K = memory.ensure(at(2), at(3));

  // 1 -> 0
  const A10 = memory.ensure(at(4), at(5));

  // 1 -> 1
  const A11 = memory.ensure(at(6), at(7));
  const B11 = memory.ensure(at(8), at(9));
  defineTransitionRule(memory, theory, b, at(50), A11, B11);

  // 1 -> N
  const A1N = memory.ensure(at(10), at(11));
  const B1N1 = memory.ensure(at(12), at(13));
  const B1N2 = memory.ensure(at(14), at(15));
  defineTransitionRule(memory, theory, b, at(51), A1N, B1N1);
  defineTransitionRule(memory, theory, b, at(52), A1N, B1N2);

  // N -> 1 canonical convergence. Either source alone is sufficient.
  const AN1a = memory.ensure(at(16), at(17));
  const AN1b = memory.ensure(at(18), at(19));
  const BN1 = memory.ensure(at(20), at(21));
  defineTransitionRule(memory, theory, b, at(53), AN1a, BN1);
  defineTransitionRule(memory, theory, b, at(54), AN1b, BN1);

  // N -> M exact author-shaped overlap.
  const ANMa = memory.ensure(at(22), at(23));
  const ANMb = memory.ensure(at(24), at(25));
  const BNM1 = memory.ensure(at(26), at(27));
  const BNM2 = memory.ensure(at(28), at(29));
  const BNM3 = memory.ensure(at(30), at(31));
  defineTransitionRule(memory, theory, b, at(55), ANMa, BNM1);
  defineTransitionRule(memory, theory, b, at(56), ANMa, BNM2);
  defineTransitionRule(memory, theory, b, at(57), ANMb, BNM2);
  defineTransitionRule(memory, theory, b, at(58), ANMb, BNM3);

  exerciseCase(memory, theory, K, {
    label: "1->0",
    inputs: [A10],
    expected: [],
    rawRuleMatches: 0,
    oldScopeSeed: at(70),
    nextScopeSeed: at(71),
  });

  exerciseCase(memory, theory, K, {
    label: "1->1",
    inputs: [A11],
    expected: [B11],
    rawRuleMatches: 1,
    oldScopeSeed: at(72),
    nextScopeSeed: at(73),
  });

  exerciseCase(memory, theory, K, {
    label: "1->N",
    inputs: [A1N],
    expected: [B1N1, B1N2],
    rawRuleMatches: 2,
    oldScopeSeed: at(74),
    nextScopeSeed: at(75),
  });

  exerciseCase(memory, theory, K, {
    label: "N->1",
    inputs: [AN1a, AN1b],
    expected: [BN1],
    rawRuleMatches: 2,
    oldScopeSeed: at(76),
    nextScopeSeed: at(77),
  });

  exerciseCase(memory, theory, K, {
    label: "N->M",
    inputs: [ANMa, ANMb],
    expected: [BNM1, BNM2, BNM3],
    rawRuleMatches: 4,
    oldScopeSeed: at(78),
    nextScopeSeed: at(79),
  });
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(
      root,
      "ts/test/research-v013-flat-generalized-modus-ponens-a72w.test.ts",
    ),
    "utf8",
  );

  const kernelStart = own.indexOf("function reactFlatScope(");
  const kernelEnd = own.indexOf("\ninterface CaseSpec", kernelStart);
  assert(
    kernelStart >= 0 && kernelEnd > kernelStart,
    "flat reaction source slice",
  );
  const kernel = own.slice(kernelStart, kernelEnd);

  same(
    kernel.split("cursor.switchAtomically(").length - 1,
    1,
    "one opaque current-root handoff publishes the whole successor image",
  );
  assert(
    kernel.includes("discoverLocallyTriggeredRuleImages"),
    "Rule authority is discovered from endpoint-local Link topology",
  );
  assert(
    kernel.includes("instantiateTemplate"),
    "Rule output is structurally instantiated from bindings",
  );

  for (const forbidden of [
    "readContext",
    "StateError",
    "openNested",
    "resume",
    "collapse",
    "publishTerminal",
    "relationScope",
    "continuationTargets",
    "memory.outgoing(theory)",
    "RuleKind",
    "opcode",
    "selectedRule",
    "switch(",
    "inputs.length ===",
    "before.length === 1",
    "before.length > 1",
  ]) {
    assert(
      !kernel.includes(forbidden),
      "flat kernel excludes semantic/cardinality dispatch: " + forbidden,
    );
  }

  assert(
    !own.includes('from "../src/state.js"'),
    "flat witness imports no Context/state interpreter",
  );

  const a72m = readFileSync(
    join(root, "ts/test/research-v013-working-scope-reachability-a72m.test.ts"),
    "utf8",
  );
  assert(
    a72m.includes("WORKING_STATE_AS_SCOPE_REACHABILITY=GREEN_SCOPED_RESEARCH"),
    "A72m Scope-reachability baseline remains retained",
  );

  const a72n = readFileSync(
    join(root, "ts/test/research-v013-append-only-currentness-falsifier-a72n.test.ts"),
    "utf8",
  );
  assert(
    a72n.includes("PLAIN_APPEND_ONLY_CURRENT_BINDING_IS_INSUFFICIENT"),
    "A72n append-only currentness falsifier remains retained",
  );
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A72w: FLAT_GENERALIZED_MODUS_PONENS=GREEN_SCOPED_RESEARCH",
    "LAW=K_TO_AI_PLUS_STRUCTURAL_RULES_GIVES_K_TO_BJ",
    "ONE_TO_ZERO=GREEN",
    "ONE_TO_ONE=GREEN",
    "ONE_TO_N=GREEN",
    "N_TO_ONE=GREEN",
    "N_TO_M=GREEN",
    "ALL_MATCHING_RULES_FIRE=TRUE",
    "CANONICAL_DUPLICATE_OUTPUT_COLLAPSE=TRUE",
    "INTERMEDIATE_SUCCESSOR_EXPOSURE=0",
    "CONTEXT_RUNTIME=ABSENT",
    "HOST_NESTED_OPEN=0",
    "HOST_PARENT_RESUME=0",
    "HOST_COMPLETION_CLASSIFIER=0",
    "HOST_RESULT_PUBLICATION=0",
    "HOST_FUNCTION_OPCODE_DISPATCH=0",
    "HOST_CARDINALITY_DISPATCH=0",
    "CURRENT_SCOPE_ROOT=OPAQUE_AMEMORY_SUBSTRATE_HANDLE",
    "ATOMIC_SCOPE_HANDOFF=AMEMORY_SUBSTRATE_COMMIT",
    "FLAT_EXECUTION_SEMANTIC_AUTHORITY=LINKS_AND_RULES",
    "NESTED_LIFECYCLE=OUTSIDE_THIS_WITNESS",
    "FULL_V013_SELF_HOSTED=NOT_YET_CLAIMED",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
