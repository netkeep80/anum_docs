import {
  defineDictionaryEffect,
  defineDictionaryScope,
} from "../src/dictionary.js";
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
  type WriteMemory,
} from "../src/memory.js";
import {
  buildSelectedSourceEvidence,
  defineSourceForm,
  materializeSourceContent,
  replaySelectedSourceEvidence,
  type SourceFrontEndEvidence,
} from "../src/source.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

type PoleDirection = "start" | "end";

type WitnessErrorCode =
  | "invalid-query"
  | "invalid-path-step"
  | "query-mismatch"
  | "underdetermined"
  | "invalid-support"
  | "source-authority-mismatch"
  | "front-end-authority-mismatch"
  | "use-not-admitted"
  | "ambiguous-use"
  | "replay-wrote";

class WitnessError extends Error {
  override readonly name = "WitnessError";

  constructor(readonly code: WitnessErrorCode) {
    super(code);
  }
}

interface IncidenceSignature {
  readonly startSelf: boolean;
  readonly endSelf: boolean;
}

interface ConstraintNode {
  readonly values: LinkHandle[];
  preserve?: IncidenceSignature;
  start?: ConstraintNode;
  end?: ConstraintNode;
}

interface SelectedSupport {
  readonly source: LinkHandle;
  readonly dictionary: LinkHandle;
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
  readonly grammarMembership: LinkHandle;
  readonly theoryMembership: LinkHandle;
  readonly admittedUses: readonly LinkHandle[];
}

function incidence(memory: ReadMemory, link: LinkHandle): IncidenceSignature {
  const poles = memory.poles(link);
  return Object.freeze({
    startSelf: poles.start === link,
    endSelf: poles.end === link,
  });
}

function sameIncidence(left: IncidenceSignature, right: IncidenceSignature): boolean {
  return left.startSelf === right.startSelf && left.endSelf === right.endSelf;
}

function readPath(memory: ReadMemory, path: LinkHandle): readonly PoleDirection[] {
  let values: readonly LinkHandle[];
  try {
    values = readExactSequence(memory, path).values;
  } catch {
    throw new WitnessError("invalid-query");
  }

  const directions: PoleDirection[] = [];
  for (const step of values) {
    const shape = incidence(memory, step);
    if (shape.startSelf === shape.endSelf) {
      throw new WitnessError("invalid-path-step");
    }
    directions.push(shape.startSelf ? "start" : "end");
  }
  return Object.freeze(directions);
}

function navigate(
  memory: ReadMemory,
  root: LinkHandle,
  directions: readonly PoleDirection[],
): LinkHandle {
  let current = root;
  for (const direction of directions) {
    const poles = memory.poles(current);
    current = direction === "start" ? poles.start : poles.end;
  }
  return current;
}

function nodeAt(root: ConstraintNode, directions: readonly PoleDirection[]): ConstraintNode {
  let current = root;
  for (const direction of directions) {
    if (direction === "start") {
      current.start ??= { values: [] };
      current = current.start;
    } else {
      current.end ??= { values: [] };
      current = current.end;
    }
  }
  return current;
}

function uniquelyGrounded(node: ConstraintNode): boolean {
  if (node.values.length > 0) {
    const first = node.values[0];
    return first !== undefined && node.values.every((value) => value === first);
  }

  const shape = node.preserve;
  if (shape !== undefined) {
    if (shape.startSelf && shape.endSelf) return true;
    if (shape.startSelf && !shape.endSelf) {
      return node.end !== undefined && uniquelyGrounded(node.end);
    }
    if (!shape.startSelf && shape.endSelf) {
      return node.start !== undefined && uniquelyGrounded(node.start);
    }
  }

  return (
    node.start !== undefined &&
    node.end !== undefined &&
    uniquelyGrounded(node.start) &&
    uniquelyGrounded(node.end)
  );
}

/**
 * Same bounded simultaneous satisfaction law used by the AR7 Q1/Q2/Q3 slice.
 * Query semantics comes entirely from Links: selected root, exact pole paths,
 * path->value correspondences and explicitly selected preserve-form paths.
 */
function verifyResolvedQuery(
  memory: ReadMemory,
  query: LinkHandle,
  candidate: LinkHandle,
): void {
  const before = memory.linkCount;
  try {
    const top = readExactSequence(memory, query).values;
    if (top.length !== 3) throw new WitnessError("invalid-query");

    const selectedRoot = top[0];
    const correspondenceCarrier = top[1];
    const preserveCarrier = top[2];
    if (
      selectedRoot === undefined ||
      correspondenceCarrier === undefined ||
      preserveCarrier === undefined
    ) {
      throw new WitnessError("invalid-query");
    }

    const constraints: ConstraintNode = { values: [] };
    for (const relation of readExactSequence(memory, correspondenceCarrier).values) {
      const pair = memory.poles(relation);
      const directions = readPath(memory, pair.start);
      if (navigate(memory, candidate, directions) !== pair.end) {
        throw new WitnessError("query-mismatch");
      }
      nodeAt(constraints, directions).values.push(pair.end);
    }

    for (const path of readExactSequence(memory, preserveCarrier).values) {
      const directions = readPath(memory, path);
      const sourceNode = navigate(memory, selectedRoot, directions);
      const resultNode = navigate(memory, candidate, directions);
      const required = incidence(memory, sourceNode);
      if (!sameIncidence(required, incidence(memory, resultNode))) {
        throw new WitnessError("query-mismatch");
      }
      const constrained = nodeAt(constraints, directions);
      if (constrained.preserve !== undefined && !sameIncidence(constrained.preserve, required)) {
        throw new WitnessError("query-mismatch");
      }
      constrained.preserve = required;
    }

    if (!uniquelyGrounded(constraints)) {
      throw new WitnessError("underdetermined");
    }
  } catch (error) {
    if (error instanceof WitnessError) throw error;
    throw new WitnessError("invalid-query");
  } finally {
    if (memory.linkCount !== before) {
      throw new WitnessError("replay-wrote");
    }
  }
}

function path(memory: WriteMemory, steps: readonly LinkHandle[]): LinkHandle {
  return materializeExactSequence(memory, steps);
}

function query(
  memory: WriteMemory,
  selectedRoot: LinkHandle,
  correspondences: readonly (readonly [LinkHandle, LinkHandle])[],
  preserveForms: readonly LinkHandle[],
): LinkHandle {
  const relations = correspondences.map(([place, value]) => memory.ensure(place, value));
  return materializeExactSequence(memory, [
    selectedRoot,
    materializeExactSequence(memory, relations),
    materializeExactSequence(memory, preserveForms),
  ]);
}

/**
 * One selected support root. Its seven exact positions are a bounded research
 * carrier, not seven new ontology kinds. The point is that all authority needed
 * by this witness is inside one selected Link structure rather than ambient
 * mutable Memory neighbourhoods.
 */
function support(
  memory: WriteMemory,
  evidence: SourceFrontEndEvidence,
  admittedUses: readonly LinkHandle[],
): LinkHandle {
  return materializeExactSequence(memory, [
    evidence.source,
    evidence.dictionary,
    evidence.grammar,
    evidence.theory,
    evidence.grammarMembership,
    evidence.theoryMembership,
    materializeExactSequence(memory, admittedUses),
  ]);
}

function readSupport(memory: ReadMemory, selected: LinkHandle): SelectedSupport {
  let values: readonly LinkHandle[];
  try {
    values = readExactSequence(memory, selected).values;
  } catch {
    throw new WitnessError("invalid-support");
  }
  if (values.length !== 7) throw new WitnessError("invalid-support");

  const [source, dictionary, grammar, theory, grammarMembership, theoryMembership, uses] = values;
  if (
    source === undefined ||
    dictionary === undefined ||
    grammar === undefined ||
    theory === undefined ||
    grammarMembership === undefined ||
    theoryMembership === undefined ||
    uses === undefined
  ) {
    throw new WitnessError("invalid-support");
  }

  try {
    return Object.freeze({
      source,
      dictionary,
      grammar,
      theory,
      grammarMembership,
      theoryMembership,
      admittedUses: Object.freeze([...readExactSequence(memory, uses).values]),
    });
  } catch {
    throw new WitnessError("invalid-support");
  }
}

/**
 * Closing source->result verifier. It has no branch for "[", no RuleKind and no
 * callback-selected semantics. The selected support pins the faithful source
 * front-end authority and the admitted Entry->Query relation. A different
 * support may therefore select another meaning while this code stays unchanged.
 */
function verifySourceToResult(
  memory: ReadMemory,
  selectedSupport: LinkHandle,
  evidence: SourceFrontEndEvidence,
  candidate: LinkHandle,
): void {
  const before = memory.linkCount;
  try {
    const selected = readSupport(memory, selectedSupport);
    if (selected.source !== evidence.source) {
      throw new WitnessError("source-authority-mismatch");
    }
    if (
      selected.dictionary !== evidence.dictionary ||
      selected.grammar !== evidence.grammar ||
      selected.theory !== evidence.theory ||
      selected.grammarMembership !== evidence.grammarMembership ||
      selected.theoryMembership !== evidence.theoryMembership
    ) {
      throw new WitnessError("front-end-authority-mismatch");
    }

    const forms = replaySelectedSourceEvidence(memory, evidence);
    if (forms.length !== 1) throw new WitnessError("invalid-support");
    const entry = forms[0];
    if (entry === undefined) throw new WitnessError("invalid-support");

    const matchingUses = selected.admittedUses.filter((use) => {
      const poles = memory.poles(use);
      return poles.start === entry;
    });
    if (matchingUses.length === 0) throw new WitnessError("use-not-admitted");
    if (matchingUses.length !== 1) throw new WitnessError("ambiguous-use");

    const use = matchingUses[0];
    if (use === undefined) throw new WitnessError("use-not-admitted");
    const usePoles = memory.poles(use);
    verifyResolvedQuery(memory, usePoles.end, candidate);
  } catch (error) {
    if (error instanceof WitnessError) throw error;
    throw new WitnessError("invalid-support");
  } finally {
    if (memory.linkCount !== before) {
      throw new WitnessError("replay-wrote");
    }
  }
}

function expectRejected(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof WitnessError, `${message}: wrong error type`);
    return;
  }
  throw new Error(`${message}: expected rejection`);
}

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}

  get root(): LinkHandle {
    return this.source.root;
  }

  get linkCount(): number {
    return this.source.linkCount;
  }

  poles(link: LinkHandle): LinkPoles {
    return this.source.poles(link);
  }

  find(): LinkHandle | undefined {
    throw new Error("AR7 closing witness forbids find");
  }

  outgoing(): readonly LinkHandle[] {
    throw new Error("AR7 closing witness forbids outgoing");
  }

  incoming(): readonly LinkHandle[] {
    throw new Error("AR7 closing witness forbids incoming");
  }
}

function anchors(memory: Memory, count: number): readonly LinkHandle[] {
  const { R, U } = ensureRootBasis(memory);
  const values: LinkHandle[] = [];
  let current = U;
  for (let index = 0; index < count; index += 1) {
    current = memory.ensure(current, R);
    values.push(current);
  }
  return Object.freeze(values);
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const [entry, grammar, theory] = anchors(memory, 3);
assert(entry !== undefined && grammar !== undefined && theory !== undefined, "fixture anchors");

// Faithful physical source contains exactly one UTF-8 occurrence: "[" (0x5b).
// It is deliberately distinct from the semantic root abit O.
const bytes = new TextEncoder().encode("[");
same(bytes.length, 1, "single UTF-8 source byte");
same(bytes[0], 0x5b, "faithful '[' byte");
const sourceContent = materializeSourceContent(memory, bytes);
const source = defineSourceForm(memory, sourceContent);
assert(source !== basis.O, "source wrapper must not equal semantic '[' abit O");
assert(entry !== basis.O, "dictionary Entry must not equal semantic '[' abit O by spelling");

let dictionary = defineDictionaryScope(memory, memory.root, memory.root);
const effect = defineDictionaryEffect(
  memory,
  dictionary,
  memory.root,
  memory.root,
  sourceContent,
  entry,
);
dictionary = effect.afterScope;

const sourceEvidence = buildSelectedSourceEvidence(
  memory,
  source,
  [{
    start: 0,
    end: 1,
    form: entry,
    dictionaryOccurrence: effect.occurrence,
  }],
  { dictionary, grammar, theory },
);

// The one source occurrence is selected faithfully before any semantic Use.
const selectedForms = replaySelectedSourceEvidence(memory, sourceEvidence);
same(selectedForms.length, 1, "one selected source occurrence");
same(selectedForms[0], entry, "selected occurrence resolves to exact Entry");

// Common structural source root for both candidate Uses.
const b = memory.ensureStartSelfClosed(basis.U);
const epsilon = path(memory, []);
const end = path(memory, [basis.C]);

// Use A: preserve proper START form and set external end to R => O.
const properStartQuery = query(memory, b, [[end, basis.R]], [epsilon]);
const properStartUse = memory.ensure(entry, properStartQuery);

// Use B: open the whole result and correspond it to L => L.
const wholeQuery = query(memory, b, [[epsilon, basis.L]], []);
const wholeUse = memory.ensure(entry, wholeQuery);
assert(properStartUse !== wholeUse, "different Uses must be different presented Links");

const startSupport = support(memory, sourceEvidence, [properStartUse]);
verifySourceToResult(memory, startSupport, sourceEvidence, basis.O);
expectRejected(
  () => verifySourceToResult(memory, startSupport, sourceEvidence, basis.R),
  "unchanged support rejects well-formed FULL alternative",
);
expectRejected(
  () => verifySourceToResult(memory, startSupport, sourceEvidence, basis.L),
  "unchanged support rejects result belonging to another Use",
);

// Ambiently attaching the alternative Use to the old support does not admit it.
const ambientAlternative = memory.ensure(startSupport, wholeUse);
same(memory.poles(ambientAlternative).start, startSupport, "ambient alternative attachment exists");
verifySourceToResult(memory, startSupport, sourceEvidence, basis.O);
expectRejected(
  () => verifySourceToResult(memory, startSupport, sourceEvidence, basis.L),
  "ambient attachment cannot mutate selected support meaning",
);

// The same faithful source may mean something else only under an explicitly
// different support whose admitted-use place contains the different Use.
const wholeSupport = support(memory, sourceEvidence, [wholeUse]);
assert(wholeSupport !== startSupport, "different admission structure must change support root");
verifySourceToResult(memory, wholeSupport, sourceEvidence, basis.L);
expectRejected(
  () => verifySourceToResult(memory, wholeSupport, sourceEvidence, basis.O),
  "different support no longer admits proper-START result",
);

// If both competing Uses are selected simultaneously, the verifier fails closed
// rather than choosing by sequence order or latest attachment.
const ambiguousSupport = support(memory, sourceEvidence, [properStartUse, wholeUse]);
expectRejected(
  () => verifySourceToResult(memory, ambiguousSupport, sourceEvidence, basis.O),
  "two selected Uses for one Entry are ambiguous",
);
expectRejected(
  () => verifySourceToResult(memory, ambiguousSupport, sourceEvidence, basis.L),
  "ambiguous support has no traversal-order winner",
);

// Selected source identity is part of authority. Another source wrapper cannot
// replace it even if the rest of the evidence object is reused.
const otherSource = defineSourceForm(memory, materializeSourceContent(memory, new TextEncoder().encode("]")));
const forgedSourceEvidence: SourceFrontEndEvidence = Object.freeze({
  ...sourceEvidence,
  source: otherSource,
});
expectRejected(
  () => verifySourceToResult(memory, startSupport, forgedSourceEvidence, basis.O),
  "selected faithful source cannot be substituted",
);

// Entire accepted witness survives a ReadMemory that exposes only poles().
const poleOnly = new PoleOnlyProbe(memory);
verifySourceToResult(poleOnly, startSupport, sourceEvidence, basis.O);
verifySourceToResult(poleOnly, wholeSupport, sourceEvidence, basis.L);
expectRejected(
  () => verifySourceToResult(poleOnly, startSupport, sourceEvidence, basis.L),
  "pole-only unchanged support rejects alternative result",
);

console.log(
  "MTS AR7 closing witness: faithful '[' -> selected Entry -> support-selected Use -> structural query -> result; meaning changes only with different presented support.",
);
