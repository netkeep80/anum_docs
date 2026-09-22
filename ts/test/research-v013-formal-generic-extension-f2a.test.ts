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
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  exportPortableStructuralTheory,
  replayPortableStructuralTheory,
  type PortableStructuralTheoryArtifact,
} from "../src/portable-theory.js";
import {
  computePortableStructuralTheoryRevision,
} from "../src/portable-theory-digest.js";
import {
  defineStructuralRoleDictionary,
  defineStructuralRule,
  admitStructuralRule,
  readStructuralRoleDictionary,
  readStructuralRule,
  StructuralRuleError,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import { unifyStructuralTemplate } from "../src/structural-unification.js";
import {
  resolveFlatBundle,
  type BundleValue,
  type ResolvedOccurrence,
} from "../src/value-bundle.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 FORMAL F2a: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function exactJson(actual: unknown, expected: unknown, message: string): void {
  same(JSON.stringify(actual), JSON.stringify(expected), message);
}

function setSame(
  actual: ReadonlySet<LinkHandle>,
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.size, new Set(expected).size, `${message}: size`);
  for (const link of expected) assert(actual.has(link), `${message}: missing expected Link`);
}

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined {
    throw new Error("F2a generic matching must not call find");
  }
  outgoing(): readonly LinkHandle[] {
    throw new Error("F2a generic matching must not scan ambient outgoing");
  }
  incoming(): readonly LinkHandle[] {
    throw new Error("F2a generic matching must not scan incoming");
  }
}

interface AuthorityFixture {
  readonly memory: Memory;
  readonly theory: LinkHandle;
  readonly artifact: PortableStructuralTheoryArtifact;
}

type AuthorityMode = "exact" | "ambiguous-one";

function defineExtensionRule(
  memory: Memory,
  theory: LinkHandle,
  roles: readonly LinkHandle[],
  applicationTemplate: LinkHandle,
  resultTemplates: readonly LinkHandle[],
): LinkHandle {
  const resultTemplateCarrier = materializeExactSequence(memory, resultTemplates);
  const body = memory.ensure(applicationTemplate, resultTemplateCarrier);
  const roleDictionary = defineStructuralRoleDictionary(memory, roles);
  const rule = defineStructuralRule(memory, roleDictionary, body);
  admitStructuralRule(memory, theory, rule);
  return rule;
}

function buildAuthority(noise: boolean, mode: AuthorityMode = "exact"): AuthorityFixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  if (noise) {
    const n0 = memory.ensure(basis.U, basis.U);
    const n1 = memory.ensureStartSelfClosed(n0);
    memory.ensure(n1, basis.O);
  }

  // Grounded Uses are created before role placeholders.
  const zeroUse = memory.ensure(basis.U, basis.L);
  const oneUse = memory.ensure(basis.L, zeroUse);
  const manyUse = memory.ensure(basis.C, oneUse);
  const roleSeed = memory.ensure(zeroUse, memory.ensure(oneUse, manyUse));
  const xRole = memory.ensureStartSelfClosed(roleSeed);
  const yRole = memory.ensureEndSelfClosed(roleSeed);
  assert(xRole !== yRole, "F2a roles are distinct");

  // Theory is structurally independent from application Uses/roles.
  const theory = memory.ensure(basis.O, roleSeed);

  // ZERO: UseZero -> X => empty ValueBundle.
  defineExtensionRule(
    memory,
    theory,
    [xRole],
    memory.ensure(zeroUse, xRole),
    [],
  );

  // ONE: UseOne -> X => { X -> X }.
  defineExtensionRule(
    memory,
    theory,
    [xRole],
    memory.ensure(oneUse, xRole),
    [memory.ensure(xRole, xRole)],
  );

  // MANY: UseMany -> (A -> B) => { B -> A, A -> A }.
  const payload = memory.ensure(xRole, yRole);
  const manyInput = memory.ensure(manyUse, payload);
  const reversed = memory.ensure(yRole, xRole);
  const diagonal = memory.ensure(xRole, xRole);
  defineExtensionRule(
    memory,
    theory,
    [xRole, yRole],
    manyInput,
    [reversed, diagonal],
  );

  if (mode === "ambiguous-one") {
    // This is authority ambiguity, not result multiplicity: a second Rule
    // competes for the same application template. Multiple values must instead
    // live inside one selected Rule's result-template carrier.
    defineExtensionRule(
      memory,
      theory,
      [xRole],
      memory.ensure(oneUse, xRole),
      [memory.ensure(xRole, basis.R)],
    );
  }

  return Object.freeze({
    memory,
    theory,
    artifact: exportPortableStructuralTheory(memory, theory),
  });
}

function frozenRules(memory: Memory, theory: LinkHandle): readonly LinkHandle[] {
  const rules = memory.outgoing(theory).map((membership) => {
    const poles = memory.poles(membership);
    assert(poles.start === theory, "selected frozen authority membership starts at Theory");
    return poles.end;
  });
  return Object.freeze(rules);
}

function instantiateTemplate(
  memory: Memory,
  template: LinkHandle,
  bindings: readonly StructuralRoleBinding[],
): LinkHandle {
  const rho = new Map(bindings.map((binding) => [binding.role, binding.value]));
  const roleSet = new Set(rho.keys());
  const containsMemo = new Map<LinkHandle, boolean>();
  const containsActive = new Set<LinkHandle>();

  const containsRole = (node: LinkHandle): boolean => {
    if (roleSet.has(node)) return true;
    const cached = containsMemo.get(node);
    if (cached !== undefined) return cached;
    if (containsActive.has(node)) return false;
    containsActive.add(node);
    try {
      const poles = memory.poles(node);
      const result = containsRole(poles.start) || containsRole(poles.end);
      containsMemo.set(node, result);
      return result;
    } finally {
      containsActive.delete(node);
    }
  };

  const built = new Map<LinkHandle, LinkHandle>();
  const active = new Set<LinkHandle>();
  const build = (node: LinkHandle): LinkHandle => {
    const replacement = rho.get(node);
    if (replacement !== undefined) return replacement;
    if (!containsRole(node)) return node;
    const cached = built.get(node);
    if (cached !== undefined) return cached;
    assert(!active.has(node), "F2a acyclic result-template scope rejects cycles");
    active.add(node);
    try {
      const poles = memory.poles(node);
      const result = memory.ensure(build(poles.start), build(poles.end));
      built.set(node, result);
      return result;
    } finally {
      active.delete(node);
    }
  };

  return build(template);
}

interface Match {
  readonly rule: LinkHandle;
  readonly resultTemplates: readonly LinkHandle[];
  readonly bindings: readonly StructuralRoleBinding[];
}

/**
 * One generic extension kernel.
 *
 * The result-template ExactSequence is only an authority carrier. It is NOT the
 * semantic result and is NOT identified with a bundle. After substitution each
 * concrete result Link is projected through the already accepted derived
 * ValueBundle surface, preserving {} / {a} / {a,b,...} as distinct bundle
 * cardinalities with {a} != a.
 *
 * No extension name, arity tag, opcode, source glyph or expected result is
 * dispatched here.
 */
function applyFrozenExtension(
  memory: Memory,
  selectedRules: readonly LinkHandle[],
  application: LinkHandle,
): BundleValue {
  const matches: Match[] = [];
  const probe = new PoleOnlyProbe(memory);

  for (const ruleHandle of selectedRules) {
    const rule = readStructuralRule(memory, ruleHandle);
    const roles = readStructuralRoleDictionary(memory, rule.roleDictionary).roles;
    const relation = memory.poles(rule.body);
    const applicationTemplate = relation.start;
    const resultTemplates = readExactSequence(memory, relation.end).values;

    try {
      const bindings = unifyStructuralTemplate(
        probe,
        applicationTemplate,
        application,
        roles,
      );
      matches.push(Object.freeze({
        rule: ruleHandle,
        resultTemplates,
        bindings,
      }));
    } catch (error) {
      if (error instanceof StructuralRuleError) continue;
      throw error;
    }
  }

  assert(matches.length > 0, "unknown application has no admitted extension Rule");
  assert(matches.length === 1, "authority ambiguity: multiple admitted Rules match one application");

  const selected = matches[0]!;
  const occurrences: ResolvedOccurrence[] = selected.resultTemplates.map((template, index) =>
    Object.freeze({
      path: Object.freeze([index]),
      link: instantiateTemplate(memory, template, selected.bindings),
    })
  );
  return resolveFlatBundle(memory, Object.freeze(occurrences));
}

function ruleView(memory: Memory, ruleHandle: LinkHandle): {
  readonly roles: readonly LinkHandle[];
  readonly use: LinkHandle;
  readonly resultTemplateCount: number;
} {
  const rule = readStructuralRule(memory, ruleHandle);
  const roles = readStructuralRoleDictionary(memory, rule.roleDictionary).roles;
  const relation = memory.poles(rule.body);
  const input = memory.poles(relation.start);
  return Object.freeze({
    roles,
    use: input.start,
    resultTemplateCount: readExactSequence(memory, relation.end).values.length,
  });
}

function executeCorpus(artifact: PortableStructuralTheoryArtifact): void {
  const replay = replayPortableStructuralTheory(artifact);
  const memory = replay.memory;
  const theory = replay.theory;

  // Freeze authority before constructing any candidate application.
  const rules = frozenRules(memory, theory);
  same(rules.length, 3, "exact F2a authority has three admitted extension Rules");

  const views = rules.map((rule) => Object.freeze({ rule, ...ruleView(memory, rule) }));
  const zero = views.find((view) => view.resultTemplateCount === 0);
  const one = views.find((view) => view.resultTemplateCount === 1);
  const many = views.find((view) => view.resultTemplateCount === 2);
  assert(zero !== undefined, "zero-value extension is present");
  assert(one !== undefined, "one-value extension is present");
  assert(many !== undefined, "many-value extension is present");

  const operand = memory.ensure(memory.root, many.use);

  // Zero values are a valid BundleValue, not "no execution".
  {
    const application = memory.ensure(zero.use, operand);
    const result = applyFrozenExtension(memory, rules, application);
    same(result.kind, "bundle", "zero result remains BundleValue");
    same(result.links.size, 0, "zero result cardinality");
    same(result.occurrences.length, 0, "zero result has no occurrences");
  }

  // One value remains a one-element BundleValue and must not collapse to Link.
  {
    const application = memory.ensure(one.use, operand);
    const result = applyFrozenExtension(memory, rules, application);
    const expected = memory.ensure(operand, operand);
    same(result.kind, "bundle", "one result remains BundleValue");
    setSame(result.links, [expected], "one result exact value");
    same(result.occurrences.length, 1, "one result occurrence count");
  }

  // Multiple values are returned by ONE selected Rule, not by choosing among
  // competing Rules.
  {
    const left = memory.ensure(operand, one.use);
    const right = memory.ensure(many.use, operand);
    assert(left !== right, "many-value operands are distinct");
    const payload = memory.ensure(left, right);
    const application = memory.ensure(many.use, payload);
    const result = applyFrozenExtension(memory, rules, application);
    const reversed = memory.ensure(right, left);
    const diagonal = memory.ensure(left, left);
    assert(reversed !== diagonal, "many-value outputs are distinct");
    same(result.kind, "bundle", "many result remains BundleValue");
    setSame(result.links, [reversed, diagonal], "many result exact values");
    same(result.occurrences.length, 2, "many result occurrence count");
  }

  // Unknown Use: no Rule matches.
  {
    const unknownUse = memory.ensure(operand, memory.root);
    const unknownApplication = memory.ensure(unknownUse, operand);
    let rejected = false;
    try {
      applyFrozenExtension(memory, rules, unknownApplication);
    } catch {
      rejected = true;
    }
    assert(rejected, "unknown Use fails closed");
  }

  // Post-freeze live Theory mutation cannot change the selected Rule set.
  {
    const before = rules.length;
    const bogusRole = memory.ensureStartSelfClosed(memory.ensure(operand, one.use));
    defineExtensionRule(
      memory,
      theory,
      [bogusRole],
      memory.ensure(one.use, bogusRole),
      [memory.ensure(bogusRole, memory.root)],
    );
    same(rules.length, before, "frozen selected Rule set is immutable after live Theory growth");

    const application = memory.ensure(one.use, operand);
    const still = applyFrozenExtension(memory, rules, application);
    setSame(still.links, [memory.ensure(operand, operand)],
      "frozen authority preserves one-value result after live mutation");
  }
}

async function main(): Promise<void> {
  const a = buildAuthority(false);
  const b = buildAuthority(true);
  assert(a.theory !== b.theory, "source Memories use different local Theory handles");
  exactJson(a.artifact, b.artifact, "portable extension authority ignores unrelated local-handle noise");

  const revisionA = await computePortableStructuralTheoryRevision(a.artifact);
  const revisionB = await computePortableStructuralTheoryRevision(b.artifact);
  same(revisionA.value, revisionB.value, "portable extension authority revision is stable");

  // Same portable authority, two independent replay Memories.
  executeCorpus(a.artifact);
  executeCorpus(b.artifact);

  // Explicit authority ambiguity: two Rules compete for the same application.
  // This is distinct from one Rule returning multiple bundle values.
  {
    const replay = replayPortableStructuralTheory(
      buildAuthority(false, "ambiguous-one").artifact,
    );
    const rules = frozenRules(replay.memory, replay.theory);
    same(rules.length, 4, "ambiguous F2a authority has four Rules");
    const oneViews = rules
      .map((rule) => Object.freeze({ rule, ...ruleView(replay.memory, rule) }))
      .filter((view) => view.roles.length === 1 && view.resultTemplateCount === 1);
    assert(oneViews.length >= 2, "ambiguous authority has competing one-value Rules");
    const useCounts = new Map<LinkHandle, number>();
    for (const view of oneViews) useCounts.set(view.use, (useCounts.get(view.use) ?? 0) + 1);
    const ambiguousUse = [...useCounts.entries()].find(([, count]) => count > 1)?.[0];
    assert(ambiguousUse !== undefined, "competing Rules share one application Use");
    const operand = replay.memory.ensure(replay.memory.root, ambiguousUse);
    const application = replay.memory.ensure(ambiguousUse, operand);
    let rejected = false;
    try {
      applyFrozenExtension(replay.memory, rules, application);
    } catch {
      rejected = true;
    }
    assert(rejected, "competing frozen semantic Rules fail closed as authority ambiguity");
  }

  // Anti-special-case guard: the generic apply kernel itself contains no
  // extension-specific identifier or cardinality branch.
  {
    const repoRoot = resolve(process.cwd(), "..");
    const source = readFileSync(
      join(repoRoot, "ts/test/research-v013-formal-generic-extension-f2a.test.ts"),
      "utf8",
    );
    const start = source.indexOf("function applyFrozenExtension(");
    const end = source.indexOf("\nfunction ruleView(", start);
    assert(start >= 0 && end > start, "generic kernel source slice exists");
    const kernel = source.slice(start, end);
    for (const forbidden of [
      "zeroUse", "oneUse", "manyUse", "DUP", "SWAP", "\"x\"",
      "canonicalByte", "ROOT", "START", "END", "PAIR",
      "resultTemplates.length ===",
    ]) {
      assert(!kernel.includes(forbidden), `generic kernel has no form/cardinality-specific branch: ${forbidden}`);
    }
  }

  console.log([
    "MTS v0.13 FORMAL F2a:",
    "GENERIC_LINK_EXTENSION_APPLICATION=GREEN_SCOPED_RESEARCH",
    "PORTABLE_RULES=3",
    "RESULT_CARDINALITY=ZERO_ONE_MANY",
    "RESULT_KIND=VALUE_BUNDLE",
    "SINGLETON_BUNDLE_NE_LINK=CONFIRMED",
    "INDEPENDENT_MEMORIES=2",
    "HOST_FORM_SPECIFIC_BRANCHES=0",
    "NEGATIVE_CONTROLS=3",
    "SOURCE_NAME_BINDING=OPEN",
    "SELF_INCIDENCE_RESULT_TEMPLATE=OPEN",
    "GENERIC_UNIFICATION_AND_INSTANTIATION=HOST_RESIDUAL",
    "PRODUCTION_UNCHANGED",
    "FULL_SELF_HOSTED=NOT_CLAIMED",
  ].join(" "));
}

await main();
