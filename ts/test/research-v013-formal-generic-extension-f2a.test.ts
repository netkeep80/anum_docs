import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 FORMAL F2a: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function exactJson(actual: unknown, expected: unknown, message: string): void {
  same(JSON.stringify(actual), JSON.stringify(expected), message);
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

type AuthorityMode = "exact" | "ambiguous-dup";

function buildAuthority(noise: boolean, mode: AuthorityMode = "exact"): AuthorityFixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  if (noise) {
    const n0 = memory.ensure(basis.U, basis.U);
    const n1 = memory.ensureStartSelfClosed(n0);
    memory.ensure(n1, basis.O);
  }

  // Grounded Uses are created before role placeholders.
  const dupUse = memory.ensure(basis.U, basis.L);
  const swapUse = memory.ensure(basis.L, dupUse);
  const roleSeed = memory.ensure(dupUse, swapUse);
  const xRole = memory.ensureStartSelfClosed(roleSeed);
  const yRole = memory.ensureEndSelfClosed(roleSeed);
  assert(xRole !== yRole, "F2a roles are distinct");

  // Theory is structurally independent from application Uses/roles. No
  // non-admission Link below intentionally starts at Theory.
  const theory = memory.ensure(basis.C, roleSeed);

  // Extension 1: UseDup -> X  ==>  X -> X
  const dupInput = memory.ensure(dupUse, xRole);
  const dupOutput = memory.ensure(xRole, xRole);
  const dupBody = memory.ensure(dupInput, dupOutput);
  const dupDictionary = defineStructuralRoleDictionary(memory, [xRole]);
  const dupRule = defineStructuralRule(memory, dupDictionary, dupBody);
  admitStructuralRule(memory, theory, dupRule);

  // Extension 2: UseSwap -> (A -> B)  ==>  B -> A
  const swapPayload = memory.ensure(xRole, yRole);
  const swapInput = memory.ensure(swapUse, swapPayload);
  const swapOutput = memory.ensure(yRole, xRole);
  const swapBody = memory.ensure(swapInput, swapOutput);
  const swapDictionary = defineStructuralRoleDictionary(memory, [xRole, yRole]);
  const swapRule = defineStructuralRule(memory, swapDictionary, swapBody);
  admitStructuralRule(memory, theory, swapRule);

  if (mode === "ambiguous-dup") {
    const alternateOutput = memory.ensure(xRole, basis.R);
    const alternateBody = memory.ensure(dupInput, alternateOutput);
    const alternateRule = defineStructuralRule(memory, dupDictionary, alternateBody);
    admitStructuralRule(memory, theory, alternateRule);
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
  readonly resultTemplate: LinkHandle;
  readonly bindings: readonly StructuralRoleBinding[];
}

/**
 * One generic extension kernel.
 *
 * No extension name, arity tag, opcode, source glyph or expected result is
 * dispatched here. Rule structure and RoleDictionary are read from Links.
 */
function applyFrozenExtension(
  memory: Memory,
  selectedRules: readonly LinkHandle[],
  application: LinkHandle,
): LinkHandle {
  const matches: Match[] = [];
  const probe = new PoleOnlyProbe(memory);

  for (const ruleHandle of selectedRules) {
    const rule = readStructuralRule(memory, ruleHandle);
    const roles = readStructuralRoleDictionary(memory, rule.roleDictionary).roles;
    const relation = memory.poles(rule.body);
    const applicationTemplate = relation.start;
    const resultTemplate = relation.end;

    try {
      const bindings = unifyStructuralTemplate(
        probe,
        applicationTemplate,
        application,
        roles,
      );
      matches.push(Object.freeze({
        rule: ruleHandle,
        resultTemplate,
        bindings,
      }));
    } catch (error) {
      if (error instanceof StructuralRuleError) continue;
      throw error;
    }
  }

  assert(matches.length > 0, "unknown application has no admitted extension Rule");
  assert(matches.length === 1, "ambiguous application has multiple admitted extension Rules");
  const selected = matches[0]!;
  return instantiateTemplate(memory, selected.resultTemplate, selected.bindings);
}

function ruleView(memory: Memory, ruleHandle: LinkHandle): {
  readonly roles: readonly LinkHandle[];
  readonly use: LinkHandle;
  readonly applicationTemplate: LinkHandle;
  readonly resultTemplate: LinkHandle;
} {
  const rule = readStructuralRule(memory, ruleHandle);
  const roles = readStructuralRoleDictionary(memory, rule.roleDictionary).roles;
  const relation = memory.poles(rule.body);
  const input = memory.poles(relation.start);
  return Object.freeze({
    roles,
    use: input.start,
    applicationTemplate: relation.start,
    resultTemplate: relation.end,
  });
}

function executeCorpus(artifact: PortableStructuralTheoryArtifact): void {
  const replay = replayPortableStructuralTheory(artifact);
  const memory = replay.memory;
  const theory = replay.theory;

  // Freeze authority before constructing any candidate application.
  const rules = frozenRules(memory, theory);
  same(rules.length, 2, "exact F2a authority has two admitted extension Rules");

  const views = rules.map((rule) => Object.freeze({ rule, ...ruleView(memory, rule) }));
  const unary = views.find((view) => view.roles.length === 1);
  const binary = views.find((view) => view.roles.length === 2);
  assert(unary !== undefined, "one-role extension is present");
  assert(binary !== undefined, "two-role extension is present");

  // One-role extension, semantically unknown to the generic kernel.
  const operand = memory.ensure(memory.root, binary.use);
  const unaryApplication = memory.ensure(unary.use, operand);
  const unaryResult = applyFrozenExtension(memory, rules, unaryApplication);
  const unaryPoles = memory.poles(unaryResult);
  same(unaryPoles.start, operand, "generic one-role result start");
  same(unaryPoles.end, operand, "generic one-role result end");

  // Two-role extension, same kernel, different RoleDictionary and topology.
  const left = memory.ensure(operand, unary.use);
  const right = memory.ensure(binary.use, operand);
  const payload = memory.ensure(left, right);
  const binaryApplication = memory.ensure(binary.use, payload);
  const binaryResult = applyFrozenExtension(memory, rules, binaryApplication);
  const binaryPoles = memory.poles(binaryResult);
  same(binaryPoles.start, right, "generic two-role result start is second operand");
  same(binaryPoles.end, left, "generic two-role result end is first operand");

  // Unknown Use: no Rule matches.
  {
    const unknownUse = memory.ensure(right, left);
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
    const bogusRole = memory.ensureStartSelfClosed(memory.ensure(left, right));
    const roleDictionary = defineStructuralRoleDictionary(memory, [bogusRole]);
    const input = memory.ensure(unary.use, bogusRole);
    const output = memory.ensure(bogusRole, memory.root);
    const body = memory.ensure(input, output);
    const lateRule = defineStructuralRule(memory, roleDictionary, body);
    admitStructuralRule(memory, theory, lateRule);
    same(rules.length, before, "frozen selected Rule set is immutable after live Theory growth");

    const still = applyFrozenExtension(memory, rules, unaryApplication);
    const poles = memory.poles(still);
    same(poles.start, operand, "frozen authority preserves unary result after live mutation");
    same(poles.end, operand, "frozen authority preserves unary result after live mutation");
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

  // Explicit ambiguous frozen authority: two Rules match the same one-role
  // application. Generic kernel must reject rather than choose by order.
  {
    const replay = replayPortableStructuralTheory(
      buildAuthority(false, "ambiguous-dup").artifact,
    );
    const rules = frozenRules(replay.memory, replay.theory);
    same(rules.length, 3, "ambiguous F2a authority has three Rules");
    const oneRoleViews = rules
      .map((rule) => Object.freeze({ rule, ...ruleView(replay.memory, rule) }))
      .filter((view) => view.roles.length === 1);
    assert(oneRoleViews.length === 2, "ambiguous authority has two one-role candidates");
    const use = oneRoleViews[0]!.use;
    const operand = replay.memory.ensure(replay.memory.root, use);
    const application = replay.memory.ensure(use, operand);
    let rejected = false;
    try {
      applyFrozenExtension(replay.memory, rules, application);
    } catch {
      rejected = true;
    }
    assert(rejected, "ambiguous frozen extension authority fails closed");
  }

  // Anti-special-case guard: the generic apply kernel itself contains no
  // extension-specific identifier. The test harness may name examples; the
  // kernel may not.
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
    for (const forbidden of ["dup", "swap", "\"x\"", "canonicalByte", "ROOT", "START", "END", "PAIR"]) {
      assert(!kernel.includes(forbidden), `generic kernel has no form-specific branch: ${forbidden}`);
    }
  }

  console.log([
    "MTS v0.13 FORMAL F2a:",
    "GENERIC_LINK_EXTENSION_APPLICATION=GREEN_SCOPED_RESEARCH",
    "PORTABLE_RULES=2",
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
