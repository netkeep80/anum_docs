import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  readStructuralInterpreter,
  readStructuralRoleDictionary,
  readStructuralRule,
  StructuralRuleError,
  verifyStructuralRuleAdmission,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import { unifyStructuralTemplate } from "../src/structural-unification.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A72y explicit zero-image: " + m);
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

interface WorkingScopeAuthority {
  readonly interpreter: LinkHandle;
  readonly theory: LinkHandle;
}

function defineWorkingScope(
  memory: Memory,
  seed: LinkHandle,
  interpreter: LinkHandle,
  members: readonly LinkHandle[],
): LinkHandle {
  const descriptor = memory.ensure(seed, interpreter);
  const scope = memory.ensureStartSelfClosed(descriptor);
  for (const member of members) memory.ensure(scope, member);
  return scope;
}

function readWorkingScopeAuthority(
  memory: Memory,
  scope: LinkHandle,
): WorkingScopeAuthority {
  const header = memory.poles(scope);
  assert(
    header.start === scope && header.end !== scope,
    "working scope must have START shape",
  );
  const descriptor = memory.poles(header.end);
  const interpreter = descriptor.end;
  const structure = readStructuralInterpreter(memory, interpreter);
  return Object.freeze({
    interpreter,
    theory: structure.theory,
  });
}

function readWorkingScope(
  memory: Memory,
  scope: LinkHandle,
): readonly LinkHandle[] {
  readWorkingScopeAuthority(memory, scope);

  const members: LinkHandle[] = [];
  for (const attachment of memory.outgoing(scope)) {
    if (attachment === scope) continue;
    const p = memory.poles(attachment);
    if (p.start !== scope) continue;
    if (!members.includes(p.end)) members.push(p.end);
  }
  return Object.freeze(members);
}

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
    same(this.scope, expectedOld, "scope handoff old root");
    this.scope = next;
  }
}

interface GroundedRuleImage {
  readonly outputBundleTemplate: LinkHandle;
  readonly bindings: readonly StructuralRoleBinding[];
}

function defineRelationalRule(
  memory: Memory,
  theory: LinkHandle,
  b: RootBasis,
  seed: LinkHandle,
  from: LinkHandle,
  to: readonly LinkHandle[],
): LinkHandle {
  const kRole = memory.ensure(seed, b.O);
  const dictionary = defineStructuralRoleDictionary(memory, [kRole]);
  const before = memory.ensure(kRole, from);
  const outputs = to.map((target) => memory.ensure(kRole, target));
  const outputBundle = materializeExactSequence(memory, outputs);
  const rule = defineStructuralRule(
    memory,
    dictionary,
    memory.ensure(before, outputBundle),
  );
  const admission = admitStructuralRule(memory, theory, rule);
  memory.ensure(from, admission);
  return rule;
}

function discoverLocallyTriggeredRuleImages(
  memory: Memory,
  theory: LinkHandle,
  active: LinkHandle,
): readonly GroundedRuleImage[] {
  const endpoint = memory.poles(active).end;
  const matches: GroundedRuleImage[] = [];

  for (const trigger of memory.outgoing(endpoint)) {
    if (trigger === endpoint) continue;
    const tp = memory.poles(trigger);
    if (tp.start !== endpoint) continue;

    const admission = tp.end;
    const ap = memory.poles(admission);
    if (ap.start !== theory || ap.end === admission) continue;

    try {
      const rule = ap.end;
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
        outputBundleTemplate: body.end,
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
    const p = memory.poles(source);

    let value: LinkHandle;
    if (p.start === source && p.end === source) {
      value = memory.ensureRoot();
    } else if (p.start === source) {
      value = memory.ensureStartSelfClosed(clone(p.end));
    } else if (p.end === source) {
      value = memory.ensureEndSelfClosed(clone(p.start));
    } else {
      visiting.add(source);
      const start = clone(p.start);
      const end = clone(p.end);
      visiting.delete(source);
      value = memory.ensure(start, end);
    }

    mapping.set(source, value);
    return value;
  };

  return clone(template);
}

interface ScopeReaction {
  readonly oldScope: LinkHandle;
  readonly nextScope: LinkHandle;
  readonly oldMembers: readonly LinkHandle[];
  readonly nextMembers: readonly LinkHandle[];
  readonly rawRuleMatches: number;
  readonly transitionedMembers: number;
  readonly quiescent: boolean;
  readonly handoffCount: 0 | 1;
}

function reactRelationalScope(
  memory: Memory,
  cursor: CurrentScopeCursor,
  nextScopeSeed: LinkHandle,
): ScopeReaction {
  const oldScope = cursor.currentScope();
  const authority = readWorkingScopeAuthority(memory, oldScope);
  const before = cursor.members();
  assert(before.length > 0, "reaction requires non-empty current scope");

  const nextMembers: LinkHandle[] = [];
  const addNext = (link: LinkHandle): void => {
    if (!nextMembers.includes(link)) nextMembers.push(link);
  };

  let rawRuleMatches = 0;
  let transitionedMembers = 0;

  for (const active of before) {
    const images = discoverLocallyTriggeredRuleImages(
      memory,
      authority.theory,
      active,
    );

    if (images.length === 0) {
      addNext(active);
      continue;
    }

    transitionedMembers += 1;

    for (const image of images) {
      rawRuleMatches += 1;
      const groundedBundle = instantiateTemplate(
        memory,
        image.outputBundleTemplate,
        image.bindings,
      );
      const outputs = readExactSequence(memory, groundedBundle).values;
      for (const successor of outputs) addNext(successor);

      same(
        cursor.currentScope(),
        oldScope,
        "old Scope remains current during image derivation",
      );
      sameMembers(
        cursor.members(),
        before,
        "partial image never becomes current",
      );
    }
  }

  if (rawRuleMatches === 0) {
    sameMembers(nextMembers, before, "quiescent state is preserved exactly");
    return Object.freeze({
      oldScope,
      nextScope: oldScope,
      oldMembers: before,
      nextMembers: Object.freeze(nextMembers),
      rawRuleMatches,
      transitionedMembers,
      quiescent: true,
      handoffCount: 0,
    });
  }

  const nextScope = defineWorkingScope(
    memory,
    nextScopeSeed,
    authority.interpreter,
    nextMembers,
  );
  cursor.switchAtomically(oldScope, nextScope);

  return Object.freeze({
    oldScope,
    nextScope,
    oldMembers: before,
    nextMembers: Object.freeze(nextMembers),
    rawRuleMatches,
    transitionedMembers,
    quiescent: false,
    handoffCount: 1,
  });
}

interface Fixture {
  readonly memory: Memory;
  readonly b: RootBasis;
  readonly theory: LinkHandle;
  readonly interpreter: LinkHandle;
  readonly K: LinkHandle;
  readonly A0: LinkHandle;
  readonly A11: LinkHandle;
  readonly B11: LinkHandle;
  readonly A1N: LinkHandle;
  readonly B1: LinkHandle;
  readonly B2: LinkHandle;
  readonly B3: LinkHandle;
  readonly AN1a: LinkHandle;
  readonly AN1b: LinkHandle;
  readonly BN1: LinkHandle;
  readonly ANMa: LinkHandle;
  readonly ANMb: LinkHandle;
  readonly Stable: LinkHandle;
  readonly fresh: readonly LinkHandle[];
}

function buildFixture(): Fixture {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 220; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }
  const at = (i: number): LinkHandle => {
    const value = fresh[i];
    assert(value !== undefined, "fresh anchor " + i);
    return value;
  };

  const theory = memory.ensure(at(0), at(1));
  const dictionary = defineStructuralRoleDictionary(memory, []);
  const grammar = memory.ensure(at(2), at(3));
  const interpreter =
    defineStructuralInterpreter(memory, dictionary, grammar, theory);
  const K = memory.ensure(at(4), at(5));

  const A0 = memory.ensure(at(6), at(7));

  const A11 = memory.ensure(at(8), at(9));
  const B11 = memory.ensure(at(10), at(11));

  const A1N = memory.ensure(at(12), at(13));
  const B1 = memory.ensure(at(14), at(15));
  const B2 = memory.ensure(at(16), at(17));
  const B3 = memory.ensure(at(18), at(19));

  const AN1a = memory.ensure(at(20), at(21));
  const AN1b = memory.ensure(at(22), at(23));
  const BN1 = memory.ensure(at(24), at(25));

  const ANMa = memory.ensure(at(26), at(27));
  const ANMb = memory.ensure(at(28), at(29));

  const Stable = memory.ensure(at(30), at(31));

  defineRelationalRule(memory, theory, b, at(40), A0, []);
  defineRelationalRule(memory, theory, b, at(41), A11, [B11]);

  defineRelationalRule(memory, theory, b, at(42), A1N, [B1, B2]);
  defineRelationalRule(memory, theory, b, at(43), A1N, [B2, B3]);

  defineRelationalRule(memory, theory, b, at(44), AN1a, [BN1]);
  defineRelationalRule(memory, theory, b, at(45), AN1b, [BN1]);

  defineRelationalRule(memory, theory, b, at(46), ANMa, [B1, B2]);
  defineRelationalRule(memory, theory, b, at(47), ANMb, [B2, B3]);

  return Object.freeze({
    memory,
    b,
    theory,
    interpreter,
    K,
    A0,
    A11,
    B11,
    A1N,
    B1,
    B2,
    B3,
    AN1a,
    AN1b,
    BN1,
    ANMa,
    ANMb,
    Stable,
    fresh: Object.freeze(fresh),
  });
}

interface CaseSpec {
  readonly label: string;
  readonly inputs: readonly LinkHandle[];
  readonly expected: readonly LinkHandle[];
  readonly rawRuleMatches: number;
  readonly transitionedMembers: number;
  readonly oldSeed: LinkHandle;
  readonly nextSeed: LinkHandle;
}

function runCase(f: Fixture, spec: CaseSpec): void {
  const { memory, interpreter, K } = f;
  const oldMembers = spec.inputs.map((x) => memory.ensure(K, x));
  const expectedMembers = spec.expected.map((x) => memory.ensure(K, x));
  const oldScope =
    defineWorkingScope(memory, spec.oldSeed, interpreter, oldMembers);
  const cursor = new CurrentScopeCursor(memory, oldScope);

  const reaction =
    reactRelationalScope(memory, cursor, spec.nextSeed);

  same(reaction.rawRuleMatches, spec.rawRuleMatches,
    spec.label + " raw Rule matches");
  same(reaction.transitionedMembers, spec.transitionedMembers,
    spec.label + " transitioned member count");
  sameMembers(reaction.nextMembers, expectedMembers,
    spec.label + " exact successor bundle");
  sameMembers(cursor.members(), expectedMembers,
    spec.label + " current successor bundle");

  if (spec.rawRuleMatches === 0) {
    assert(reaction.quiescent, spec.label + " is quiescent");
    same(reaction.handoffCount, 0, spec.label + " has no handoff");
    same(cursor.currentScope(), oldScope,
      spec.label + " preserves exact current Scope root");
  } else {
    assert(!reaction.quiescent, spec.label + " performed a reaction");
    same(reaction.handoffCount, 1, spec.label + " one atomic handoff");
    assert(cursor.currentScope() !== oldScope,
      spec.label + " current Scope advances");
  }
}

function exercise(): void {
  const f = buildFixture();
  const {
    memory,
    interpreter,
    K,
    A0,
    A11,
    B11,
    A1N,
    B1,
    B2,
    B3,
    AN1a,
    AN1b,
    BN1,
    ANMa,
    ANMb,
    Stable,
    fresh,
  } = f;
  const at = (i: number): LinkHandle => {
    const value = fresh[i];
    assert(value !== undefined, "case seed " + i);
    return value;
  };

  runCase(f, {
    label: "explicit 1->0",
    inputs: [A0],
    expected: [],
    rawRuleMatches: 1,
    transitionedMembers: 1,
    oldSeed: at(80),
    nextSeed: at(81),
  });

  runCase(f, {
    label: "1->1",
    inputs: [A11],
    expected: [B11],
    rawRuleMatches: 1,
    transitionedMembers: 1,
    oldSeed: at(82),
    nextSeed: at(83),
  });

  runCase(f, {
    label: "1->N all matching Rules",
    inputs: [A1N],
    expected: [B1, B2, B3],
    rawRuleMatches: 2,
    transitionedMembers: 1,
    oldSeed: at(84),
    nextSeed: at(85),
  });

  runCase(f, {
    label: "N->1 canonical convergence",
    inputs: [AN1a, AN1b],
    expected: [BN1],
    rawRuleMatches: 2,
    transitionedMembers: 2,
    oldSeed: at(86),
    nextSeed: at(87),
  });

  runCase(f, {
    label: "N->M",
    inputs: [ANMa, ANMb],
    expected: [B1, B2, B3],
    rawRuleMatches: 2,
    transitionedMembers: 2,
    oldSeed: at(88),
    nextSeed: at(89),
  });

  runCase(f, {
    label: "no Rule stable member",
    inputs: [Stable],
    expected: [Stable],
    rawRuleMatches: 0,
    transitionedMembers: 0,
    oldSeed: at(90),
    nextSeed: at(91),
  });

  const KA0 = memory.ensure(K, A0);
  const KA11 = memory.ensure(K, A11);
  const KStable = memory.ensure(K, Stable);
  const KB11 = memory.ensure(K, B11);
  const mixedScope =
    defineWorkingScope(memory, at(92), interpreter, [KA0, KA11, KStable]);
  const mixedCursor = new CurrentScopeCursor(memory, mixedScope);

  const mixed =
    reactRelationalScope(memory, mixedCursor, at(93));

  same(mixed.rawRuleMatches, 2, "mixed scope two explicit transitions");
  same(mixed.transitionedMembers, 2, "mixed scope transitions two members");
  sameMembers(mixedCursor.members(), [KB11, KStable],
    "zero-image disappears, transformed member advances, stable member survives");
  assert(!mixedCursor.members().includes(KA0),
    "explicit zero-image branch disappears");
  assert(!mixedCursor.members().includes(KA11),
    "1->1 predecessor disappears");
  assert(mixedCursor.members().includes(KStable),
    "no-match stable sibling survives");

  const stableScope = mixedCursor.currentScope();
  const quiescent =
    reactRelationalScope(memory, mixedCursor, at(94));
  same(quiescent.rawRuleMatches, 0, "mixed successor has no applicable Rules");
  assert(quiescent.quiescent, "mixed successor reaches quiescence");
  same(quiescent.handoffCount, 0, "quiescence creates no new Scope version");
  same(mixedCursor.currentScope(), stableScope,
    "quiescence preserves current root identity");
  sameMembers(mixedCursor.members(), [KB11, KStable],
    "quiescent stable bundle remains current");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(
      root,
      "ts/test/research-v013-explicit-zero-image-a72y.test.ts",
    ),
    "utf8",
  );

  const kernelStart = own.indexOf("function reactRelationalScope(");
  const kernelEnd = own.indexOf("\ninterface Fixture", kernelStart);
  assert(kernelStart >= 0 && kernelEnd > kernelStart, "reaction source slice");
  const kernel = own.slice(kernelStart, kernelEnd);

  assert(kernel.includes("if (images.length === 0)"),
    "no-match path is explicit");
  assert(kernel.includes("addNext(active)"),
    "no-match member is preserved");
  assert(kernel.includes("readExactSequence"),
    "matched Rule output is a structural bundle");
  assert(kernel.includes("if (rawRuleMatches === 0)"),
    "quiescence follows absence of transition authority");
  same(
    kernel.split("cursor.switchAtomically(").length - 1,
    1,
    "at most one atomic handoff exists in reaction source",
  );

  for (const forbidden of [
    "RuleKind",
    "opcode",
    "selectedRule",
    "switch(",
    "readContext",
    "StateError",
    "inputs.length ===",
  ]) {
    assert(!kernel.includes(forbidden),
      "kernel excludes semantic/cardinality dispatch: " + forbidden);
  }

  const a72g = readFileSync(
    join(root, "ts/test/research-v013-relational-bundle-1-to-0-a72g.test.ts"),
    "utf8",
  );
  assert(a72g.includes("NO_RULE_MEANS_DELETE=FALSE"),
    "A72g no-rule boundary remains retained");

  const a72t = readFileSync(
    join(root, "ts/test/research-v013-mixed-scope-early-collapse-a72t.test.ts"),
    "utf8",
  );
  assert(a72t.includes("MIXED_WORKING_SCOPE_EARLY_RESULT_COLLAPSE=GREEN_SCOPED_RESEARCH"),
    "A72t mixed stable/active witness remains retained");

  const a72w = readFileSync(
    join(root, "ts/test/research-v013-flat-generalized-modus-ponens-a72w.test.ts"),
    "utf8",
  );
  assert(a72w.includes("FLAT_GENERALIZED_MODUS_PONENS=GREEN_SCOPED_RESEARCH"),
    "A72w historical flat floor remains retained");
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A72y: EXPLICIT_ZERO_IMAGE_AND_QUIESCENCE=GREEN_SCOPED_RESEARCH",
    "A72W_ZERO_MATCH_DELETE=SUPERSEDED",
    "NO_MATCH=INERT_CURRENT_MEMBER",
    "NO_MATCH_ALL_MEMBERS=QUIESCENT_NO_HANDOFF",
    "EXPLICIT_ZERO_IMAGE=EMPTY_EXACT_SEQUENCE",
    "EMPTY_OUTPUT_BUNDLE=ROOT",
    "RULE_OUTPUT=EXACT_SEQUENCE_OF_LINK_TEMPLATES",
    "ONE_TO_ZERO=GREEN_EXPLICIT_RULE",
    "ONE_TO_ONE=GREEN",
    "ONE_TO_N=GREEN",
    "N_TO_ONE=GREEN",
    "N_TO_M=GREEN",
    "ALL_MATCHING_RULES_FIRE=TRUE",
    "CANONICAL_DUPLICATE_OUTPUT_COLLAPSE=TRUE",
    "MIXED_ACTIVE_AND_STABLE_SCOPE=GREEN",
    "STABLE_SIBLING_SURVIVES_REACTION=TRUE",
    "QUIESCENT_SCOPE_ROOT_REMAINS_IDENTICAL=TRUE",
    "HOST_RULE_KIND=0",
    "HOST_OPCODE=0",
    "HOST_SELECTED_RULE=0",
    "HOST_THEORY_ARGUMENT=0",
    "CURRENT_SCOPE_ROOT=OPAQUE_AMEMORY_SUBSTRATE_HANDLE",
    "ATOMIC_SCOPE_HANDOFF=AMEMORY_SUBSTRATE_COMMIT_WHEN_TRANSITION_EXISTS",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
