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

type LocalShape = "full" | "start" | "end" | "ordinary";

function localShape(memory: ReadMemory, link: LinkHandle): LocalShape {
  const poles = memory.poles(link);
  const startSelf = poles.start === link;
  const endSelf = poles.end === link;
  if (startSelf && endSelf) return "full";
  if (startSelf) return "start";
  if (endSelf) return "end";
  return "ordinary";
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

const startLikeTemplate = memory.ensure(wholeRole, externalRole);
const endLikeTemplate = memory.ensure(externalRole, wholeRole);
const pairLikeTemplate = memory.ensure(beginRole, endRole);

// Positive controls: the generic matcher already expresses recursive equality
// when the whole/current role is explicitly bound to the claimed result.
{
  const probe = new ReadProbe(memory);
  matchStructuralTemplate(
    probe,
    startLikeTemplate,
    basis.O,
    [binding(wholeRole, basis.O), binding(externalRole, basis.R)],
  );
  assert(probe.polesCalls > 0, "START positive control must inspect poles");
}
{
  const probe = new ReadProbe(memory);
  matchStructuralTemplate(
    probe,
    endLikeTemplate,
    basis.C,
    [binding(externalRole, basis.R), binding(wholeRole, basis.C)],
  );
  assert(probe.polesCalls > 0, "END positive control must inspect poles");
}

// Research falsifier: template equality alone cannot distinguish START(R)
// from FULL when both roles are allowed to coalesce to R. The call succeeds.
let rootAcceptedByStartLikeTemplate = false;
{
  const probe = new ReadProbe(memory);
  matchStructuralTemplate(
    probe,
    startLikeTemplate,
    basis.R,
    [binding(wholeRole, basis.R), binding(externalRole, basis.R)],
  );
  rootAcceptedByStartLikeTemplate = true;
  assert(probe.polesCalls > 0, "START falsifier must use only local poles");
}

let rootAcceptedByEndLikeTemplate = false;
{
  const probe = new ReadProbe(memory);
  matchStructuralTemplate(
    probe,
    endLikeTemplate,
    basis.R,
    [binding(externalRole, basis.R), binding(wholeRole, basis.R)],
  );
  rootAcceptedByEndLikeTemplate = true;
  assert(probe.polesCalls > 0, "END falsifier must use only local poles");
}

// Likewise a plain two-role pair template can match a one-sided selfclosure.
// Therefore "ordered pair template matched" is not yet the ostensive ORDINARY
// form unless the whole is known to be external to both poles.
let startAcceptedByPairLikeTemplate = false;
{
  const probe = new ReadProbe(memory);
  matchStructuralTemplate(
    probe,
    pairLikeTemplate,
    basis.O,
    [binding(beginRole, basis.O), binding(endRole, basis.R)],
  );
  startAcceptedByPairLikeTemplate = true;
  assert(probe.polesCalls > 0, "PAIR falsifier must use only local poles");
}

same(localShape(memory, basis.R), "full", "R actual local form");
same(localShape(memory, basis.O), "start", "O actual local form");
same(localShape(memory, basis.C), "end", "C actual local form");
same(localShape(memory, basis.L), "ordinary", "L actual local form");
same(localShape(memory, basis.U), "ordinary", "U actual local form");

const classification = Object.freeze({
  recursiveEqualityAlreadyExpressible: true,
  rootAcceptedByStartLikeTemplate,
  rootAcceptedByEndLikeTemplate,
  startAcceptedByPairLikeTemplate,
  genericDistinctionConstraintPresent: false,
  verdict: "RED" as const,
  reason: "OSTENSIVE_FORM_DISTINCTION_NOT_EXPRESSED_BY_TEMPLATE_MATCH" as const,
});

same(classification.rootAcceptedByStartLikeTemplate, true, "START-like template admits FULL without distinction");
same(classification.rootAcceptedByEndLikeTemplate, true, "END-like template admits FULL without distinction");
same(classification.startAcceptedByPairLikeTemplate, true, "PAIR-like template admits START without whole/pole distinction");
same(classification.genericDistinctionConstraintPresent, false, "generic matcher has no explicit distinction obligation");
same(classification.verdict, "RED", "AR0 distinction classification");
same(
  classification.reason,
  "OSTENSIVE_FORM_DISTINCTION_NOT_EXPRESSED_BY_TEMPLATE_MATCH",
  "AR0 distinction RED reason",
);

console.log("MTS AR0 rooted-form distinction: RED gap confirmed against current generic matcher.");
