import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { exportCanonicalTopology } from "../src/canonical-topology.js";
import {
  defineDictionaryEffect,
  defineDictionaryScope,
  lookupScopedDictionary,
} from "../src/dictionary.js";
import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type EnumerableReadMemory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  restoreTopology,
  type StorageTopologyImage,
} from "../src/persistence-topology.js";
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
  valuesEqual,
  type BundleValue,
  type ResolvedOccurrence,
} from "../src/value-bundle.js";
import { materializeV012SourceContent } from "../src/v012-source.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 FORMAL F2 integration: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function exactJson(actual: unknown, expected: unknown, message: string): void {
  same(JSON.stringify(actual), JSON.stringify(expected), message);
}
function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
function setSame(
  actual: ReadonlySet<LinkHandle>,
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.size, new Set(expected).size, `${message}: size`);
  for (const link of expected) assert(actual.has(link), `${message}: missing Link`);
}

class SupportView implements EnumerableReadMemory {
  readonly root: LinkHandle;
  private readonly support: ReadonlySet<LinkHandle>;
  private readonly ordered: readonly LinkHandle[];

  constructor(
    private readonly source: ReadMemory,
    support: ReadonlySet<LinkHandle>,
  ) {
    this.root = source.root;
    this.support = support;
    this.ordered = Object.freeze([...support]);
  }
  get linkCount(): number { return this.ordered.length; }
  private require(link: LinkHandle): void {
    assert(this.support.has(link), "integrated authority access stays inside support");
  }
  poles(link: LinkHandle): LinkPoles {
    this.require(link);
    const poles = this.source.poles(link);
    assert(this.support.has(poles.start) && this.support.has(poles.end),
      "integrated authority support is pole-closed");
    return poles;
  }
  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    this.require(start); this.require(end);
    const found = this.source.find(start, end);
    return found !== undefined && this.support.has(found) ? found : undefined;
  }
  outgoing(start: LinkHandle): readonly LinkHandle[] {
    this.require(start);
    return Object.freeze(this.source.outgoing(start).filter((link) => this.support.has(link)));
  }
  incoming(end: LinkHandle): readonly LinkHandle[] {
    this.require(end);
    return Object.freeze(this.source.incoming(end).filter((link) => this.support.has(link)));
  }
  allLinks(): readonly LinkHandle[] { return this.ordered; }
}

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("integrated generic matching must not call find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("integrated generic matching must not scan outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("integrated generic matching must not scan incoming"); }
}

function poleClosure(memory: ReadMemory, roots: readonly LinkHandle[]): ReadonlySet<LinkHandle> {
  const support = new Set<LinkHandle>();
  const pending = [memory.root, ...roots];
  while (pending.length > 0) {
    const link = pending.pop();
    if (link === undefined || support.has(link)) continue;
    const poles = memory.poles(link);
    support.add(link);
    pending.push(poles.start, poles.end);
  }
  return support;
}

interface PortableIntegratedAuthority {
  readonly schema: "mts-v013-formal-f2-integrated-authority/research-v0.1";
  readonly topology: StorageTopologyImage;
  readonly dictionaryCoordinate: number;
  readonly theoryCoordinate: number;
  readonly admissionCoordinate: number;
}

function exportIntegratedAuthority(
  memory: Memory,
  dictionary: LinkHandle,
  theory: LinkHandle,
  admission: LinkHandle,
): PortableIntegratedAuthority {
  const support = poleClosure(memory, [dictionary, theory, admission]);
  const canonical = exportCanonicalTopology(new SupportView(memory, support));
  const dictionaryCoordinate = canonical.coordinates.get(dictionary);
  const theoryCoordinate = canonical.coordinates.get(theory);
  const admissionCoordinate = canonical.coordinates.get(admission);
  assert(dictionaryCoordinate !== undefined, "Dictionary coordinate");
  assert(theoryCoordinate !== undefined, "Theory coordinate");
  assert(admissionCoordinate !== undefined, "admission coordinate");
  return Object.freeze({
    schema: "mts-v013-formal-f2-integrated-authority/research-v0.1" as const,
    topology: canonical.topology,
    dictionaryCoordinate,
    theoryCoordinate,
    admissionCoordinate,
  });
}

interface ReplayedAuthority {
  readonly memory: Memory;
  readonly dictionary: LinkHandle;
  readonly theory: LinkHandle;
  readonly admission: LinkHandle;
  readonly rule: LinkHandle;
}

function replayIntegratedAuthority(artifact: PortableIntegratedAuthority): ReplayedAuthority {
  same(
    artifact.schema,
    "mts-v013-formal-f2-integrated-authority/research-v0.1",
    "integrated authority schema",
  );
  const memory = restoreTopology(artifact.topology);
  const links = memory.allLinks();
  const dictionary = links[artifact.dictionaryCoordinate];
  const theory = links[artifact.theoryCoordinate];
  const admission = links[artifact.admissionCoordinate];
  assert(dictionary !== undefined && theory !== undefined && admission !== undefined,
    "integrated authority coordinates resolve");

  const admissionPoles = memory.poles(admission);
  same(admissionPoles.start, theory, "selected admission starts at exact Theory");
  const rule = admissionPoles.end;
  readStructuralRule(memory, rule);

  const canonical = exportCanonicalTopology(memory);
  exactJson(canonical.topology, artifact.topology, "integrated authority canonical replay");
  same(canonical.coordinates.get(dictionary), artifact.dictionaryCoordinate, "Dictionary coordinate stable");
  same(canonical.coordinates.get(theory), artifact.theoryCoordinate, "Theory coordinate stable");
  same(canonical.coordinates.get(admission), artifact.admissionCoordinate, "admission coordinate stable");

  return Object.freeze({ memory, dictionary, theory, admission, rule });
}

interface AuthorityFixture {
  readonly artifact: PortableIntegratedAuthority;
}

type AuthorityMode = "exact" | "use-mismatch";

function buildAuthority(noise: boolean, mode: AuthorityMode = "exact"): AuthorityFixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  if (noise) {
    const n0 = memory.ensure(basis.C, basis.U);
    const n1 = memory.ensureStartSelfClosed(n0);
    memory.ensure(n1, basis.L);
  }

  const dictionaryUse = memory.ensure(basis.U, basis.L);
  const ruleUse = mode === "exact"
    ? dictionaryUse
    : memory.ensure(basis.L, basis.U);

  const initial = defineDictionaryScope(memory, memory.root, memory.root);
  const shortContent = materializeV012SourceContent(memory, basis, bytes("r"));
  const short = defineDictionaryEffect(
    memory, initial, memory.root, memory.root, shortContent, dictionaryUse,
  );
  const longContent = materializeV012SourceContent(memory, basis, bytes("relation"));
  const long = defineDictionaryEffect(
    memory, short.afterScope, memory.root, short.historyAfter, longContent, dictionaryUse,
  );
  const dictionary = long.afterScope;

  const roleSeed = memory.ensure(dictionaryUse, memory.ensure(ruleUse, basis.C));
  const leftRole = memory.ensureStartSelfClosed(roleSeed);
  const rightRole = memory.ensureEndSelfClosed(roleSeed);
  assert(leftRole !== rightRole, "integrated roles are distinct");

  const theory = memory.ensure(basis.O, roleSeed);
  const payloadTemplate = memory.ensure(leftRole, rightRole);
  const applicationTemplate = memory.ensure(ruleUse, payloadTemplate);
  const reversedTemplate = memory.ensure(rightRole, leftRole);
  const diagonalTemplate = memory.ensure(leftRole, leftRole);
  const resultCarrier = materializeExactSequence(
    memory,
    [reversedTemplate, diagonalTemplate],
  );
  const body = memory.ensure(applicationTemplate, resultCarrier);
  const roleDictionary = defineStructuralRoleDictionary(memory, [leftRole, rightRole]);
  const rule = defineStructuralRule(memory, roleDictionary, body);
  const admission = admitStructuralRule(memory, theory, rule);

  return Object.freeze({
    artifact: exportIntegratedAuthority(memory, dictionary, theory, admission),
  });
}

function resolvePhysicalName(
  memory: Memory,
  dictionary: LinkHandle,
  physicalName: string,
): LinkHandle | undefined {
  const basis = ensureRootBasis(memory);
  const content = materializeV012SourceContent(memory, basis, bytes(physicalName));
  return lookupScopedDictionary(memory, dictionary, content)?.form;
}

function instantiateTemplate(
  memory: Memory,
  template: LinkHandle,
  bindings: readonly StructuralRoleBinding[],
): LinkHandle {
  const rho = new Map(bindings.map((binding) => [binding.role, binding.value]));
  const roles = new Set(rho.keys());
  const containsMemo = new Map<LinkHandle, boolean>();
  const containsActive = new Set<LinkHandle>();

  const containsRole = (node: LinkHandle): boolean => {
    if (roles.has(node)) return true;
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
    assert(!active.has(node), "integrated F2 acyclic template scope");
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

function applySelectedRules(
  memory: Memory,
  selectedRules: readonly LinkHandle[],
  application: LinkHandle,
): BundleValue {
  const probe = new PoleOnlyProbe(memory);
  const matches: Array<{
    readonly resultTemplates: readonly LinkHandle[];
    readonly bindings: readonly StructuralRoleBinding[];
  }> = [];

  for (const ruleHandle of selectedRules) {
    const rule = readStructuralRule(memory, ruleHandle);
    const roles = readStructuralRoleDictionary(memory, rule.roleDictionary).roles;
    const relation = memory.poles(rule.body);
    const resultTemplates = readExactSequence(memory, relation.end).values;
    try {
      const bindings = unifyStructuralTemplate(probe, relation.start, application, roles);
      matches.push(Object.freeze({ resultTemplates, bindings }));
    } catch (error) {
      if (error instanceof StructuralRuleError) continue;
      throw error;
    }
  }

  assert(matches.length > 0, "integrated application has one matching semantic Rule");
  assert(matches.length === 1, "integrated application has no authority ambiguity");
  const selected = matches[0]!;
  const occurrences: ResolvedOccurrence[] = selected.resultTemplates.map((template, index) =>
    Object.freeze({
      path: Object.freeze([index]),
      link: instantiateTemplate(memory, template, selected.bindings),
    })
  );
  return resolveFlatBundle(memory, Object.freeze(occurrences));
}

function executeNamedApplication(
  memory: Memory,
  dictionary: LinkHandle,
  selectedRules: readonly LinkHandle[],
  physicalName: string,
  payload: LinkHandle,
): BundleValue | undefined {
  const use = resolvePhysicalName(memory, dictionary, physicalName);
  if (use === undefined) return undefined;
  const application = memory.ensure(use, payload);
  return applySelectedRules(memory, selectedRules, application);
}

function executeCorpus(artifact: PortableIntegratedAuthority): void {
  const replay = replayIntegratedAuthority(artifact);
  const { memory, dictionary, theory, rule } = replay;

  // Freeze exact selected semantic Rule from the transported admission before
  // candidate application construction. No outgoing(theory) scan is used.
  const selectedRules = Object.freeze([rule]);

  const basis = ensureRootBasis(memory);
  const left = memory.ensure(basis.U, dictionary);
  const right = memory.ensure(theory, basis.L);
  assert(left !== right, "integrated concrete operands are distinct");
  const payload = memory.ensure(left, right);

  const short = executeNamedApplication(memory, dictionary, selectedRules, "r", payload);
  const long = executeNamedApplication(memory, dictionary, selectedRules, "relation", payload);
  assert(short !== undefined && long !== undefined, "both aliases execute");
  assert(valuesEqual(short, long), "aliases produce extensionally equal BundleValue");

  const reversed = memory.ensure(right, left);
  const diagonal = memory.ensure(left, left);
  assert(reversed !== diagonal, "integrated bundle results are distinct");
  setSame(short.links, [reversed, diagonal], "integrated two-value result");
  same(short.occurrences.length, 2, "integrated result occurrence count");

  // Unknown physical name grants no Use and therefore no execution.
  const unknown = executeNamedApplication(
    memory, dictionary, selectedRules, "unknown", payload,
  );
  same(unknown, undefined, "unknown name cannot execute semantic Rule");

  // Late child Dictionary scope can shadow locally but selected parent remains.
  const originalUse = resolvePhysicalName(memory, dictionary, "r");
  assert(originalUse !== undefined, "selected parent r Use");
  const alternativeUse = memory.ensure(basis.C, basis.L);
  const childInitial = defineDictionaryScope(memory, dictionary, memory.root);
  const rContent = materializeV012SourceContent(memory, basis, bytes("r"));
  const child = defineDictionaryEffect(
    memory, childInitial, dictionary, memory.root, rContent, alternativeUse,
  );
  same(resolvePhysicalName(memory, dictionary, "r"), originalUse,
    "late child scope does not mutate frozen parent name authority");
  same(resolvePhysicalName(memory, child.afterScope, "r"), alternativeUse,
    "late child scope owns only its local name authority");

  // Late Theory admission cannot alter exact selectedRules.
  const lateRole = memory.ensureStartSelfClosed(memory.ensure(left, right));
  const lateDictionary = defineStructuralRoleDictionary(memory, [lateRole]);
  const lateApplication = memory.ensure(originalUse, lateRole);
  const lateResults = materializeExactSequence(memory, [memory.ensure(lateRole, memory.root)]);
  const lateRule = defineStructuralRule(
    memory,
    lateDictionary,
    memory.ensure(lateApplication, lateResults),
  );
  admitStructuralRule(memory, theory, lateRule);
  same(selectedRules.length, 1, "late Theory admission cannot alter frozen selected Rule list");
  const afterLate = executeNamedApplication(memory, dictionary, selectedRules, "r", payload);
  assert(afterLate !== undefined && valuesEqual(afterLate, short),
    "frozen semantic authority survives late Theory growth");
}

function main(): void {
  const a = buildAuthority(false);
  const b = buildAuthority(true);
  exactJson(a.artifact, b.artifact, "integrated portable authority ignores unrelated noise");

  executeCorpus(a.artifact);
  executeCorpus(b.artifact);

  // Dictionary and Rule may each be valid in isolation but must share the exact
  // semantic Use. A mismatched combined authority therefore has no Rule match.
  {
    const replay = replayIntegratedAuthority(buildAuthority(false, "use-mismatch").artifact);
    const basis = ensureRootBasis(replay.memory);
    const left = replay.memory.ensure(basis.U, replay.dictionary);
    const right = replay.memory.ensure(replay.theory, basis.L);
    const payload = replay.memory.ensure(left, right);
    let rejected = false;
    try {
      executeNamedApplication(
        replay.memory,
        replay.dictionary,
        Object.freeze([replay.rule]),
        "r",
        payload,
      );
    } catch {
      rejected = true;
    }
    assert(rejected, "Dictionary Use / semantic Rule Use mismatch fails closed");
  }

  // Anti-special-case guard for the integrated consumer path.
  {
    const repoRoot = resolve(process.cwd(), "..");
    const source = readFileSync(
      join(repoRoot, "ts/test/research-v013-formal-f2-name-application-integration.test.ts"),
      "utf8",
    );
    for (const [startToken, endToken] of [
      ["function resolvePhysicalName(", "\nfunction instantiateTemplate("],
      ["function applySelectedRules(", "\nfunction executeNamedApplication("],
      ["function executeNamedApplication(", "\nfunction executeCorpus("],
    ] as const) {
      const start = source.indexOf(startToken);
      const end = source.indexOf(endToken, start);
      assert(start >= 0 && end > start, `consumer slice ${startToken}`);
      const slice = source.slice(start, end);
      for (const forbidden of [
        "\"r\"",
        "\"relation\"",
        "canonicalByte",
        "ROOT",
        "START",
        "END",
        "PAIR",
        "ZERO",
        "ONE",
        "MANY",
      ]) {
        assert(!slice.includes(forbidden),
          `integrated consumer has no name/form-specific branch: ${forbidden}`);
      }
    }
  }

  console.log([
    "MTS v0.13 FORMAL F2 integration:",
    "NAME_TO_USE_TO_BUNDLE_RESULT=GREEN_SCOPED_RESEARCH",
    "ALIASES=2_TO_1_USE",
    "RESULT_VALUES=2",
    "RESULT_KIND=VALUE_BUNDLE",
    "INDEPENDENT_MEMORIES=2",
    "HOST_NAME_FORM_SPECIFIC_BRANCHES=0",
    "CONTROLS=4",
    "AUTHORITY_SELF_PRODUCTION=OPEN",
    "SELF_INCIDENCE_RESULT_TEMPLATE=OPEN",
    "GENERIC_HOST_LAWS_RESIDUAL=OPEN",
    "PRODUCTION_UNCHANGED",
    "F_KERNEL_SELF_EXTENSION=STILL_RED_OVERALL",
    "FULL_SELF_HOSTED=NOT_CLAIMED",
  ].join(" "));
}

main();
