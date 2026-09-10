import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  matchStructuralTemplate,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`AR0 distinction probe: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

class ReadProbe implements ReadMemory {
  polesCalls = 0;

  constructor(private readonly source: ReadMemory) {}

  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }

  poles(link: LinkHandle): LinkPoles {
    this.polesCalls += 1;
    return this.source.poles(link);
  }

  find(): LinkHandle | undefined {
    throw new Error("AR0 local form verification must not call find");
  }

  outgoing(): readonly LinkHandle[] {
    throw new Error("AR0 local form verification must not scan outgoing");
  }

  incoming(): readonly LinkHandle[] {
    throw new Error("AR0 local form verification must not scan incoming");
  }
}

function anchors(memory: Memory, count: number): readonly LinkHandle[] {
  const result: LinkHandle[] = [];
  const seed = memory.ensureEndSelfClosed(memory.root);
  let tag = memory.ensureStartSelfClosed(memory.root);
  for (let index = 0; index < count; index += 1) {
    tag = memory.ensureStartSelfClosed(tag);
    result.push(memory.ensure(seed, tag));
  }
  return Object.freeze(result);
}

function binding(role: LinkHandle, value: LinkHandle): StructuralRoleBinding {
  return Object.freeze({ role, value });
}

type LocalShape = "∞" | "♂e" | "b♀" | "b⟼e";

function localShape(memory: ReadMemory, link: LinkHandle): LocalShape {
  const poles = memory.poles(link);
  const startSelf = poles.start === link;
  const endSelf = poles.end === link;
  if (startSelf && endSelf) return "∞";
  if (startSelf) return "♂e";
  if (endSelf) return "b♀";
  return "b⟼e";
}

// Test/meta encoding only. These two observations are not proposed as MTS
// symbols, public opcodes or a second ontology. They are the machine-side
// observation of the four ostensive forms on an already canonical support.
type SelfIncidence = readonly [startIsWhole: boolean, endIsWhole: boolean];

const INFINITY: SelfIncidence = Object.freeze([true, true]);
const MALE: SelfIncidence = Object.freeze([true, false]);
const FEMALE: SelfIncidence = Object.freeze([false, true]);
const ORDINARY: SelfIncidence = Object.freeze([false, false]);

class OstensiveFormMismatch extends Error {
  override readonly name = "OstensiveFormMismatch";
}

function verifySelfIncidence(
  memory: ReadMemory,
  claimed: LinkHandle,
  expected: SelfIncidence,
): void {
  const poles = memory.poles(claimed);
  const actualStart = poles.start === claimed;
  const actualEnd = poles.end === claimed;
  if (actualStart !== expected[0] || actualEnd !== expected[1]) {
    throw new OstensiveFormMismatch("ostensive self-incidence mismatch");
  }
}

function matchCanonicalOstensiveTemplate(
  memory: ReadMemory,
  expected: SelfIncidence,
  template: LinkHandle,
  claimed: LinkHandle,
  bindings: readonly StructuralRoleBinding[],
): void {
  // Preconditions established elsewhere by the selected support/backend:
  // semantic Links are canonical and finitely grounded. Under that boundary,
  // self-incidence distinguishes ∞ / ♂e / b♀ / b⟼e without a generic `!=`.
  verifySelfIncidence(memory, claimed, expected);
  matchStructuralTemplate(memory, template, claimed, bindings);
}

function rejectOstensive(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof OstensiveFormMismatch, `${message}: wrong error ${String(error)}`);
    return;
  }
  throw new Error(`AR0 distinction probe: ${message}: expected ostensive rejection`);
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const [wholeRole, externalRole, beginRole, endRole] = anchors(memory, 4);
assert(
  wholeRole !== undefined &&
    externalRole !== undefined &&
    beginRole !== undefined &&
    endRole !== undefined,
  "fixture roles exist",
);

const maleLikeTemplate = memory.ensure(wholeRole, externalRole);
const femaleLikeTemplate = memory.ensure(externalRole, wholeRole);
const ordinaryTemplate = memory.ensure(beginRole, endRole);

// The generic matcher already expresses recursive equality/current binding.
{
  const probe = new ReadProbe(memory);
  matchStructuralTemplate(
    probe,
    maleLikeTemplate,
    basis.O,
    [binding(wholeRole, basis.O), binding(externalRole, basis.R)],
  );
  assert(probe.polesCalls > 0, "♂e positive control must inspect poles");
}
{
  const probe = new ReadProbe(memory);
  matchStructuralTemplate(
    probe,
    femaleLikeTemplate,
    basis.C,
    [binding(externalRole, basis.R), binding(wholeRole, basis.C)],
  );
  assert(probe.polesCalls > 0, "b♀ positive control must inspect poles");
}

// Bare-template RED: substitution alone allows roles to coalesce, therefore
// ∞ can satisfy the same pole substitution used for ♂e and b♀.
let rootAcceptedByMaleLikeTemplate = false;
{
  const probe = new ReadProbe(memory);
  matchStructuralTemplate(
    probe,
    maleLikeTemplate,
    basis.R,
    [binding(wholeRole, basis.R), binding(externalRole, basis.R)],
  );
  rootAcceptedByMaleLikeTemplate = true;
}

let rootAcceptedByFemaleLikeTemplate = false;
{
  const probe = new ReadProbe(memory);
  matchStructuralTemplate(
    probe,
    femaleLikeTemplate,
    basis.R,
    [binding(externalRole, basis.R), binding(wholeRole, basis.R)],
  );
  rootAcceptedByFemaleLikeTemplate = true;
}

let maleAcceptedByOrdinaryTemplate = false;
{
  const probe = new ReadProbe(memory);
  matchStructuralTemplate(
    probe,
    ordinaryTemplate,
    basis.O,
    [binding(beginRole, basis.O), binding(endRole, basis.R)],
  );
  maleAcceptedByOrdinaryTemplate = true;
}

same(localShape(memory, basis.R), "∞", "R actual ostensive form");
same(localShape(memory, basis.O), "♂e", "O actual ostensive form");
same(localShape(memory, basis.C), "b♀", "C actual ostensive form");
same(localShape(memory, basis.L), "b⟼e", "L actual ostensive form");
same(localShape(memory, basis.U), "b⟼e", "U actual ostensive form");

same(rootAcceptedByMaleLikeTemplate, true, "bare matcher admits ∞ under ♂e-like substitution");
same(rootAcceptedByFemaleLikeTemplate, true, "bare matcher admits ∞ under b♀-like substitution");
same(maleAcceptedByOrdinaryTemplate, true, "bare matcher admits ♂e under b⟼e-like substitution");

// Bounded GREEN: on canonical support, exact self-incidence supplies precisely
// the distinction already shown by the ostensive form itself.
{
  const probe = new ReadProbe(memory);
  matchCanonicalOstensiveTemplate(
    probe,
    MALE,
    maleLikeTemplate,
    basis.O,
    [binding(wholeRole, basis.O), binding(externalRole, basis.R)],
  );
  matchCanonicalOstensiveTemplate(
    probe,
    FEMALE,
    femaleLikeTemplate,
    basis.C,
    [binding(externalRole, basis.R), binding(wholeRole, basis.C)],
  );
  matchCanonicalOstensiveTemplate(
    probe,
    ORDINARY,
    ordinaryTemplate,
    basis.L,
    [binding(beginRole, basis.O), binding(endRole, basis.C)],
  );
  matchCanonicalOstensiveTemplate(probe, INFINITY, basis.R, basis.R, []);
  assert(probe.polesCalls > 0, "bounded ostensive matching uses only pole evidence");
}

rejectOstensive(
  () => matchCanonicalOstensiveTemplate(
    memory,
    MALE,
    maleLikeTemplate,
    basis.R,
    [binding(wholeRole, basis.R), binding(externalRole, basis.R)],
  ),
  "∞ must not satisfy ♂e",
);
rejectOstensive(
  () => matchCanonicalOstensiveTemplate(
    memory,
    FEMALE,
    femaleLikeTemplate,
    basis.R,
    [binding(externalRole, basis.R), binding(wholeRole, basis.R)],
  ),
  "∞ must not satisfy b♀",
);
rejectOstensive(
  () => matchCanonicalOstensiveTemplate(
    memory,
    ORDINARY,
    ordinaryTemplate,
    basis.O,
    [binding(beginRole, basis.O), binding(endRole, basis.R)],
  ),
  "♂e must not satisfy b⟼e",
);

// Critical counter-control: distinct role names are allowed to resolve to one
// semantic Link when the ostensive form does not require whole/pole separation.
// For A != R, A⟼A is an ordinary Link and both pole roles legitimately coalesce.
{
  const A = basis.O;
  const loop = memory.ensure(A, A);
  same(localShape(memory, loop), "b⟼e", "A⟼A is ordinary for non-root A");
  matchCanonicalOstensiveTemplate(
    memory,
    ORDINARY,
    ordinaryTemplate,
    loop,
    [binding(beginRole, A), binding(endRole, A)],
  );
}

const classification = Object.freeze({
  recursiveEqualityAlreadyExpressible: true,
  bareTemplateGapConfirmed: true,
  canonicalSupportRequired: true,
  ostensiveSelfIncidenceBoundarySufficient: true,
  genericRoleInequalityRequired: false,
  secondNormalFormRuntimeRequired: false,
  bareMatcherVerdict: "RED" as const,
  boundedJudgmentVerdict: "GREEN" as const,
});

same(classification.bareMatcherVerdict, "RED", "bare template matcher remains intentionally weaker");
same(classification.boundedJudgmentVerdict, "GREEN", "canonical ostensive boundary closes tested gap");
same(classification.genericRoleInequalityRequired, false, "no blanket role inequality is required");
same(classification.secondNormalFormRuntimeRequired, false, "research oracle is not promoted to runtime");

console.log("MTS AR0 rooted-form distinction: bare matcher RED; canonical ostensive boundary GREEN.");
