import {
  buildSelectedSourceEvidence,
  defineSourceForm,
  materializeSourceContent,
  replaySelectedSourceEvidence,
  type SourceFrontEndEvidence,
} from "../src/source.js";
import {
  defineDictionaryEffect,
  defineDictionaryScope,
} from "../src/dictionary.js";
import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  deserializeStream,
  symbolicStackAlgebra,
} from "../src/anum.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`AR6 final authority: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

class FinalAuthorityError extends Error {
  override readonly name = "FinalAuthorityError";
}

interface FixedAuthority {
  readonly source: LinkHandle;
  readonly dictionary: LinkHandle;
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
  readonly supportRevision: LinkHandle;
  readonly context: LinkHandle;
}

interface Evidence {
  readonly source: SourceFrontEndEvidence;
  readonly entry: LinkHandle;
  readonly use: LinkHandle;
  readonly useFact: LinkHandle;
  readonly target: LinkHandle;
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function anchors(memory: Memory, count: number): readonly LinkHandle[] {
  const result: LinkHandle[] = [];
  let current = ensureRootBasis(memory).C;
  for (let index = 0; index < count; index += 1) {
    current = memory.ensureStartSelfClosed(current);
    result.push(current);
  }
  return Object.freeze(result);
}

function defineExactRevision(memory: Memory, values: readonly LinkHandle[]): LinkHandle {
  return memory.ensureStartSelfClosed(materializeExactSequence(memory, values));
}

function readExactRevision(memory: ReadMemory, revision: LinkHandle): readonly LinkHandle[] {
  const wrapper = memory.poles(revision);
  if (wrapper.start !== revision || wrapper.end === revision) {
    throw new FinalAuthorityError("invalid exact revision wrapper");
  }
  return readExactSequence(memory, wrapper.end).values;
}

function requireRevisionMember(
  memory: ReadMemory,
  revision: LinkHandle,
  value: LinkHandle,
  label: string,
): void {
  if (!readExactRevision(memory, revision).includes(value)) {
    throw new FinalAuthorityError(`${label} outside fixed revision`);
  }
}

function defineContext(memory: Memory, role: LinkHandle, value: LinkHandle): LinkHandle {
  return memory.ensureStartSelfClosed(memory.ensure(role, value));
}

function readBinding(memory: ReadMemory, context: LinkHandle, role: LinkHandle): LinkHandle {
  const wrapper = memory.poles(context);
  if (wrapper.start !== context || wrapper.end === context) {
    throw new FinalAuthorityError("invalid context wrapper");
  }
  const binding = memory.poles(wrapper.end);
  if (binding.start !== role) throw new FinalAuthorityError("context role mismatch");
  return binding.end;
}

/**
 * Final AR6 synthesis verifier.
 *
 * Authority is independently fixed as A=(source,D,G,T,S,K). The producer may
 * supply candidate evidence and a candidate result, but replay is read-only and
 * uses selected pole closure only. This intentionally remains a research
 * witness: it does not modify the production trusted kernel or accepted v0.11.
 */
function verify(
  memory: ReadMemory,
  authority: FixedAuthority,
  evidence: Evidence,
): LinkHandle {
  const before = memory.linkCount;

  if (
    evidence.source.source !== authority.source ||
    evidence.source.dictionary !== authority.dictionary ||
    evidence.source.grammar !== authority.grammar ||
    evidence.source.theory !== authority.theory
  ) {
    throw new FinalAuthorityError("source/D/G/T authority mismatch");
  }

  const entries = replaySelectedSourceEvidence(memory, evidence.source);
  if (entries.length !== 1 || entries[0] !== evidence.entry) {
    throw new FinalAuthorityError("faithful source resolves another Entry");
  }

  requireRevisionMember(
    memory,
    authority.supportRevision,
    evidence.source.grammarMembership,
    "source Grammar membership",
  );
  requireRevisionMember(
    memory,
    authority.supportRevision,
    evidence.source.theoryMembership,
    "source Theory membership",
  );

  const useFact = memory.poles(evidence.useFact);
  if (useFact.start !== evidence.entry || useFact.end !== evidence.use) {
    throw new FinalAuthorityError("invalid Entry->Use fact");
  }
  requireRevisionMember(memory, authority.grammar, evidence.useFact, "Use fact");
  requireRevisionMember(memory, authority.theory, evidence.use, "Use/Rule");
  requireRevisionMember(memory, authority.supportRevision, evidence.useFact, "Use fact support");
  requireRevisionMember(memory, authority.supportRevision, evidence.use, "Use support");

  const useShape = memory.poles(evidence.use);
  if (useShape.start !== evidence.use) {
    throw new FinalAuthorityError("Use does not preserve ostensive start-self-closure");
  }
  const boundEnd = readBinding(memory, authority.context, useShape.end);

  const target = memory.poles(evidence.target);
  if (target.start !== evidence.target || target.end !== boundEnd) {
    throw new FinalAuthorityError("candidate target violates selected ostensive Use under K");
  }

  if (memory.linkCount !== before) throw new FinalAuthorityError("trusted replay wrote to Memory");
  return evidence.target;
}

function expectRejected(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch {
    return;
  }
  throw new Error(`AR6 final authority: ${message}: expected rejection`);
}

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly sourceMemory: ReadMemory) {}
  get root(): LinkHandle { return this.sourceMemory.root; }
  get linkCount(): number { return this.sourceMemory.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.sourceMemory.poles(link); }
  find(): LinkHandle | undefined { throw new Error("AR6 final replay forbids find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("AR6 final replay forbids outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("AR6 final replay forbids incoming"); }
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const [entry, role, alternateRole, mismatchedTheory] = anchors(memory, 4);
assert(
  entry !== undefined && role !== undefined && alternateRole !== undefined && mismatchedTheory !== undefined,
  "fixture anchors",
);

// Printed '[' is a source lexeme here, not the semantic root abit by spelling.
assert(entry !== basis.O && entry !== basis.C && entry !== basis.L && entry !== basis.U, "F07 source Entry must not collapse to a root abit by glyph spelling");

// Use is the ordinary Link shape ♂E: its start is itself and its end is a role.
const use = memory.ensureStartSelfClosed(role);
const useFact = memory.ensure(entry, use);
const grammar = defineExactRevision(memory, [useFact]);
const theory = defineExactRevision(memory, [use]);
const context = defineContext(memory, role, basis.R);

// F04 collision pair: faithful sources differ while current balanced Q loses
// that distinction at denotation level.
const sourceAText: string = "[]1";
const sourceBText: string = "[1]";
const sourceABytes = bytes(sourceAText);
const sourceBBytes = bytes(sourceBText);
same(
  deserializeStream(sourceAText, symbolicStackAlgebra).denotation,
  deserializeStream(sourceBText, symbolicStackAlgebra).denotation,
  "F04 chosen faithful sources must collide after lossy Q denotation",
);

// One selected D revision admits both faithful byte strings to the same Entry.
// Therefore source identity cannot be reconstructed from Entry or downstream use.
let dictionary = defineDictionaryScope(memory, memory.root, memory.root);
const effectA = defineDictionaryEffect(
  memory,
  dictionary,
  memory.root,
  memory.root,
  materializeSourceContent(memory, sourceABytes),
  entry,
);
dictionary = effectA.afterScope;
const effectB = defineDictionaryEffect(
  memory,
  dictionary,
  memory.root,
  effectA.historyAfter,
  materializeSourceContent(memory, sourceBBytes),
  entry,
);
dictionary = effectB.afterScope;

const sourceA = defineSourceForm(memory, materializeSourceContent(memory, sourceABytes));
const sourceB = defineSourceForm(memory, materializeSourceContent(memory, sourceBBytes));
assert(sourceA !== sourceB, "faithful source roots must remain distinct");

const sourceEvidenceA = buildSelectedSourceEvidence(
  memory,
  sourceA,
  [{ start: 0, end: sourceABytes.length, form: entry, dictionaryOccurrence: effectA.occurrence }],
  { dictionary, grammar, theory },
);
const sourceEvidenceB = buildSelectedSourceEvidence(
  memory,
  sourceB,
  [{ start: 0, end: sourceBBytes.length, form: entry, dictionaryOccurrence: effectB.occurrence }],
  { dictionary, grammar, theory },
);

same(sourceEvidenceA.formSequence, sourceEvidenceB.formSequence, "same Entry gives same downstream form sequence");
same(sourceEvidenceA.grammarMembership, sourceEvidenceB.grammarMembership, "same G membership after Entry collision");
same(sourceEvidenceA.theoryMembership, sourceEvidenceB.theoryMembership, "same T membership after Entry collision");

const supportRevision = defineExactRevision(memory, [
  sourceEvidenceA.grammarMembership,
  sourceEvidenceA.theoryMembership,
  useFact,
  use,
]);
const authority: FixedAuthority = Object.freeze({
  source: sourceA,
  dictionary,
  grammar,
  theory,
  supportRevision,
  context,
});

const good: Evidence = Object.freeze({
  source: sourceEvidenceA,
  entry,
  use,
  useFact,
  target: basis.O,
});

same(verify(memory, authority, good), basis.O, "faithful source A -> Entry -> Use -> K -> O");

// F04: all downstream coordinates collide, but a different faithful source root
// cannot replace the independently selected source A.
expectRejected(
  () => verify(memory, authority, Object.freeze({ ...good, source: sourceEvidenceB })),
  "same lossy denotation/Entry/Use cannot replace selected faithful source",
);

// F01: same exact source and unchanged authority, wrong well-formed target R.
expectRejected(
  () => verify(memory, authority, Object.freeze({ ...good, target: basis.R })),
  "wrong well-formed target must fail under unchanged authority",
);

// F02/F05: producer can build and ambiently attach a new well-formed Use after
// A was frozen; it is absent from selected G/T/S and therefore cannot authorize.
const lateUse = memory.ensureStartSelfClosed(alternateRole);
const lateUseFact = memory.ensure(entry, lateUse);
memory.ensure(grammar, lateUseFact);
memory.ensure(theory, lateUse);
expectRejected(
  () => verify(memory, authority, Object.freeze({ ...good, use: lateUse, useFact: lateUseFact })),
  "late ambient Use/self-admission cannot extend fixed G/T/S",
);

// F03: a source evidence object cannot silently switch T without an admitted bridge.
const wrongTheoryEvidence: SourceFrontEndEvidence = Object.freeze({
  ...sourceEvidenceA,
  theory: mismatchedTheory,
});
expectRejected(
  () => verify(memory, authority, Object.freeze({ ...good, source: wrongTheoryEvidence })),
  "D/G/T authority substitution without bridge must fail",
);

// F06: ambient context attachment is not rebinding. The selected immutable K
// still binds role:=R, so the same O result remains authoritative.
const ambientRebinding = memory.ensure(role, basis.C);
memory.ensure(context, ambientRebinding);
same(verify(memory, authority, good), basis.O, "ambient grouping/rebinding attachment cannot mutate selected K");

// The same verdict must survive when every ambient discovery API is forbidden.
const poleOnly = new PoleOnlyProbe(memory);
same(verify(poleOnly, authority, good), basis.O, "pole-only positive replay");
expectRejected(
  () => verify(poleOnly, authority, Object.freeze({ ...good, source: sourceEvidenceB })),
  "pole-only F04 source substitution rejection",
);
expectRejected(
  () => verify(poleOnly, authority, Object.freeze({ ...good, target: basis.R })),
  "pole-only F01 wrong target rejection",
);

const classification = Object.freeze({
  authorityVector: "(source,D,G,T,S,K)" as const,
  sourceIsIndependentAuthorityCoordinate: true,
  sourceIdentityIsNotLossyQDenotation: true,
  sourceIdentityIsNotEntryIdentity: true,
  ostensiveUsePreservesSelfIncidence: true,
  fixedGrammarTheorySupportAndContextAreExplicit: true,
  ambientDiscoveryAuthority: "NONE" as const,
  trustedReplay: "POLE_ONLY_READ_ONLY" as const,
  productionDelta: "NONE" as const,
  acceptedSemanticDelta: "NONE" as const,
  verdict: "GREEN-CANDIDATE" as const,
});

same(classification.authorityVector, "(source,D,G,T,S,K)", "final authority vector");
same(classification.verdict, "GREEN-CANDIDATE", "final AR6 classification");
console.log("MTS AR6 final authority: source/D/G/T/S/K synthesis survives F01-F07 boundary probes.");
