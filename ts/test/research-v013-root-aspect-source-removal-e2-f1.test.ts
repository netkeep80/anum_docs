import {
  Memory,
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
  StructuralRuleError,
} from "../src/structural-rule.js";
import {
  unifyStructuralTemplate,
} from "../src/structural-unification.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 E2-F1 root-aspect source removal: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function exactJson(actual: unknown, expected: unknown, message: string): void {
  same(JSON.stringify(actual), JSON.stringify(expected), message);
}

type Mask = readonly [boolean, boolean];

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined {
    throw new Error("E2-F1 classifier must not call find");
  }
  outgoing(): readonly LinkHandle[] {
    throw new Error("E2-F1 classifier must not scan outgoing except the frozen authority root");
  }
  incoming(): readonly LinkHandle[] {
    throw new Error("E2-F1 classifier must not scan incoming");
  }
}

interface AuthorityFixture {
  readonly memory: Memory;
  readonly theory: LinkHandle;
  readonly root: LinkHandle;
  readonly firstUnary: LinkHandle;
  readonly secondUnary: LinkHandle;
  readonly binary: LinkHandle;
  readonly ordinaryReverse: LinkHandle;
  readonly artifact: PortableStructuralTheoryArtifact;
}

function buildAuthority(
  noise: boolean,
  mode: "exact" | "missing-binary" | "extra-ordinary" = "exact",
): AuthorityFixture {
  const memory = new Memory();
  const root = memory.root;
  const firstUnary = memory.ensureStartSelfClosed(root);
  const secondUnary = memory.ensureEndSelfClosed(root);
  const binary = memory.ensure(firstUnary, secondUnary);
  const ordinaryReverse = memory.ensure(secondUnary, firstUnary);

  if (noise) {
    const detached = memory.ensure(binary, ordinaryReverse);
    memory.ensure(detached, secondUnary);
  }

  const theory = memory.ensure(ordinaryReverse, binary);
  const admitted = mode === "missing-binary"
    ? [root, firstUnary, secondUnary]
    : [root, firstUnary, secondUnary, binary];

  for (const sign of admitted) memory.ensure(theory, sign);
  if (mode === "extra-ordinary") memory.ensure(theory, ordinaryReverse);

  return Object.freeze({
    memory,
    theory,
    root,
    firstUnary,
    secondUnary,
    binary,
    ordinaryReverse,
    artifact: exportPortableStructuralTheory(memory, theory),
  });
}

function mask(memory: ReadMemory, link: LinkHandle): Mask {
  const poles = memory.poles(link);
  return Object.freeze([
    poles.start === link,
    poles.end === link,
  ]);
}

function sameMask(left: Mask, right: Mask): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function externalRoles(memory: ReadMemory, operator: LinkHandle): readonly LinkHandle[] {
  const poles = memory.poles(operator);
  const roles: LinkHandle[] = [];
  if (poles.start !== operator) roles.push(poles.start);
  if (poles.end !== operator && poles.end !== poles.start) roles.push(poles.end);
  return Object.freeze(roles);
}

function admittedTemplates(memory: Memory, theory: LinkHandle): readonly LinkHandle[] {
  const templates = memory.outgoing(theory).map((membership) => {
    const poles = memory.poles(membership);
    assert(poles.start === theory, "authority membership starts at frozen authority root");
    return poles.end;
  });
  assert(new Set(templates).size === templates.length, "authority has no duplicate templates");
  return Object.freeze(templates);
}

function templateMatches(
  memory: Memory,
  probe: ReadMemory,
  template: LinkHandle,
  target: LinkHandle,
): boolean {
  if (!sameMask(mask(memory, template), mask(memory, target))) return false;
  try {
    unifyStructuralTemplate(probe, template, target, externalRoles(memory, template));
    return true;
  } catch (error) {
    if (error instanceof StructuralRuleError) return false;
    throw error;
  }
}

function classify(
  memory: Memory,
  theory: LinkHandle,
  target: LinkHandle,
): LinkHandle {
  const before = memory.linkCount;
  const probe = new PoleOnlyProbe(memory);
  const matches = admittedTemplates(memory, theory).filter(
    (template) => templateMatches(memory, probe, template, target),
  );
  same(memory.linkCount, before, "classification is read-only");
  assert(matches.length > 0, "frozen authority rejects target with no admitted template");
  assert(matches.length === 1, "frozen authority rejects ambiguous template classification");
  return matches[0]!;
}

async function main(): Promise<void> {
  // Same Link authority rebuilt with different unrelated local handles must have
  // one canonical portable artifact and revision.
  const sourceA = buildAuthority(false);
  const sourceB = buildAuthority(true);
  assert(sourceA.theory !== sourceB.theory, "independent Memories use different local authority handles");

  exactJson(sourceA.artifact, sourceB.artifact, "portable authority ignores sender-local handles");
  const revisionA = await computePortableStructuralTheoryRevision(sourceA.artifact);
  const revisionB = await computePortableStructuralTheoryRevision(sourceB.artifact);
  same(revisionA.value, revisionB.value, "independent authority revisions are identical");

  const replay = replayPortableStructuralTheory(sourceA.artifact);
  const memory = replay.memory;
  const theory = replay.theory;
  const root = memory.root;

  // These constructions are E1 Memory operations only. The classifier itself
  // has no named aspect enum, opcode table or branch for the four cases.
  const firstUnary = memory.ensureStartSelfClosed(root);
  const secondUnary = memory.ensureEndSelfClosed(root);
  const binary = memory.ensure(firstUnary, secondUnary);
  const ordinaryReverse = memory.ensure(secondUnary, firstUnary);

  const pairSeed = memory.ensure(ordinaryReverse, binary);
  const genericFirstUnary = memory.ensureStartSelfClosed(pairSeed);
  const genericSecondUnary = memory.ensureEndSelfClosed(pairSeed);
  const genericBinary = memory.ensure(genericFirstUnary, genericSecondUnary);

  const rootClass = classify(memory, theory, root);
  const firstUnaryClass = classify(memory, theory, firstUnary);
  const secondUnaryClass = classify(memory, theory, secondUnary);
  const binaryClass = classify(memory, theory, binary);

  same(new Set([rootClass, firstUnaryClass, secondUnaryClass, binaryClass]).size, 4,
    "frozen Link authority reconstructs four distinct local classes");

  same(classify(memory, theory, ordinaryReverse), binaryClass,
    "ordinary reverse basis Link is reconstructed as the binary class");
  same(classify(memory, theory, genericFirstUnary), firstUnaryClass,
    "unknown first-unary target reconstructs from the ostensive template");
  same(classify(memory, theory, genericSecondUnary), secondUnaryClass,
    "unknown second-unary target reconstructs from the ostensive template");
  same(classify(memory, theory, genericBinary), binaryClass,
    "unknown binary target reconstructs from the ostensive template");

  for (const target of [
    root,
    firstUnary,
    secondUnary,
    binary,
    ordinaryReverse,
    genericFirstUnary,
    genericSecondUnary,
    genericBinary,
  ]) {
    const sign = classify(memory, theory, target);
    assert(sameMask(mask(memory, sign), mask(memory, target)),
      "reconstructed sign and target have the same self-incidence");
  }

  // Missing one admitted template fails closed for the corresponding target.
  {
    const missing = replayPortableStructuralTheory(
      buildAuthority(false, "missing-binary").artifact,
    );
    const r = missing.memory.root;
    const a = missing.memory.ensureStartSelfClosed(r);
    const b = missing.memory.ensureEndSelfClosed(r);
    const target = missing.memory.ensure(b, a);
    let rejected = false;
    try {
      classify(missing.memory, missing.theory, target);
    } catch {
      rejected = true;
    }
    assert(rejected, "missing binary template fails closed");
  }

  // Admitting an ordinary pair as a fifth operator makes ordinary-pair
  // classification ambiguous; the generic classifier rejects rather than
  // choosing by order or local handle.
  {
    const extra = replayPortableStructuralTheory(
      buildAuthority(false, "extra-ordinary").artifact,
    );
    const r = extra.memory.root;
    const a = extra.memory.ensureStartSelfClosed(r);
    const b = extra.memory.ensureEndSelfClosed(r);
    const target = extra.memory.ensure(b, a);
    let rejected = false;
    try {
      classify(extra.memory, extra.theory, target);
    } catch {
      rejected = true;
    }
    assert(rejected, "extra ordinary-pair admission fails closed as ambiguity");
  }

  // Candidate-side mutation after the authority snapshot cannot rewrite the
  // frozen artifact/revision. The mutated authority is observably different.
  {
    const frozenArtifact = sourceA.artifact;
    const frozenRevision = await computePortableStructuralTheoryRevision(frozenArtifact);
    sourceA.memory.ensure(sourceA.theory, sourceA.ordinaryReverse);
    const mutatedArtifact = exportPortableStructuralTheory(sourceA.memory, sourceA.theory);
    const mutatedRevision = await computePortableStructuralTheoryRevision(mutatedArtifact);
    assert(mutatedRevision.value !== frozenRevision.value,
      "post-freeze authority mutation changes revision");

    const frozenReplay = replayPortableStructuralTheory(frozenArtifact);
    const r = frozenReplay.memory.root;
    const a = frozenReplay.memory.ensureStartSelfClosed(r);
    const b = frozenReplay.memory.ensureEndSelfClosed(r);
    const ordinary = frozenReplay.memory.ensure(b, a);
    const selected = classify(frozenReplay.memory, frozenReplay.theory, ordinary);
    assert(selected !== ordinary,
      "frozen authority does not self-admit the later ordinary-pair candidate");
  }

  console.log([
    "MTS v0.13 E2-F1:",
    "ROOT_ASPECT_HOST_SOURCE_REMOVAL=GREEN_SCOPED_RESEARCH",
    "PORTABLE_LINK_TEMPLATE_AUTHORITY=BYTE_IDENTICAL_ACROSS_INDEPENDENT_MEMORIES",
    "POSITIVE_VECTORS=8",
    "NEGATIVE_CONTROLS=3",
    "PRODUCTION_DECOMPOSITION=UNCHANGED_HOST_DEFINED",
    "GLOBAL_E2=OPEN",
  ].join(" "));
}

await main();
