import { exportCanonicalTopology } from "../src/canonical-topology.js";
import {
  defineDictionaryEffect,
  defineDictionaryScope,
  lookupScopedDictionary,
} from "../src/dictionary.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type EnumerableReadMemory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
  type RootBasis,
} from "../src/memory.js";
import {
  restoreTopology,
  type StorageTopologyImage,
} from "../src/persistence-topology.js";
import { defineSourceForm } from "../src/source.js";
import type {
  SelectedSegmentEvidence,
  SourceFrontEndEvidence,
} from "../src/source.js";
import {
  buildV012SelectedSourceEvidence,
  materializeV012SourceContent,
  replayV012SelectedSourceEvidence,
  type V012SourceAuthority,
} from "../src/v012-source.js";
import {
  resolveFlatBundle,
  type BundleValue,
  type ResolvedOccurrence,
} from "../src/value-bundle.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 FORMAL F3 grouping: ${message}`);
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

class SupportView implements EnumerableReadMemory {
  readonly root: LinkHandle;
  private readonly ordered: readonly LinkHandle[];
  constructor(
    private readonly source: ReadMemory,
    private readonly support: ReadonlySet<LinkHandle>,
  ) {
    this.root = source.root;
    this.ordered = Object.freeze([...support]);
  }
  get linkCount(): number { return this.ordered.length; }
  private require(link: LinkHandle): void {
    assert(this.support.has(link), "F3 selected export support");
  }
  poles(link: LinkHandle): LinkPoles {
    this.require(link);
    const poles = this.source.poles(link);
    assert(
      this.support.has(poles.start) && this.support.has(poles.end),
      "F3 support is pole-closed",
    );
    return poles;
  }
  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    this.require(start);
    this.require(end);
    const found = this.source.find(start, end);
    return found !== undefined && this.support.has(found) ? found : undefined;
  }
  outgoing(start: LinkHandle): readonly LinkHandle[] {
    this.require(start);
    return Object.freeze(this.source.outgoing(start).filter((x) => this.support.has(x)));
  }
  incoming(end: LinkHandle): readonly LinkHandle[] {
    this.require(end);
    return Object.freeze(this.source.incoming(end).filter((x) => this.support.has(x)));
  }
  allLinks(): readonly LinkHandle[] { return this.ordered; }
}

function poleClosure(
  memory: ReadMemory,
  roots: readonly LinkHandle[],
): ReadonlySet<LinkHandle> {
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

interface Frame {
  readonly startRole: LinkHandle;
  readonly endRole: LinkHandle;
  readonly directMethod: LinkHandle;
}

function frame(memory: Memory): Frame {
  const basis = ensureRootBasis(memory);
  return Object.freeze({
    startRole: basis.O,
    endRole: basis.C,
    directMethod: basis.L,
  });
}

function defineName(
  memory: Memory,
  basis: RootBasis,
  dictionary: LinkHandle,
  history: LinkHandle,
  physicalName: string,
  value: LinkHandle,
): Readonly<{
  dictionary: LinkHandle;
  history: LinkHandle;
  occurrence: LinkHandle;
}> {
  const content = materializeV012SourceContent(memory, basis, bytes(physicalName));
  const effect = defineDictionaryEffect(
    memory,
    dictionary,
    basis.R,
    history,
    content,
    value,
  );
  return Object.freeze({
    dictionary: effect.afterScope,
    history: effect.historyAfter,
    occurrence: effect.occurrence,
  });
}

interface PortableSegment {
  readonly start: number;
  readonly end: number;
  readonly form: number;
  readonly dictionaryOccurrence: number;
  readonly sliceContent: number;
  readonly span: number;
  readonly sliceEvidence: number;
  readonly lexeme: number;
  readonly resolution: number;
  readonly selection: number;
}

interface PortableSourceEvidence {
  readonly content: number;
  readonly source: number;
  readonly dictionary: number;
  readonly grammar: number;
  readonly theory: number;
  readonly segments: readonly PortableSegment[];
  readonly selectionSequence: number;
  readonly formSequence: number;
  readonly grammarMembership: number;
  readonly theoryMembership: number;
}

interface PortableAuthority {
  readonly schema: "mts-v013-formal-source-grouping/research-v0.1";
  readonly topology: StorageTopologyImage;
  readonly sourceEvidence: PortableSourceEvidence;
  readonly groupingCoordinate: number;
  readonly directMethodCoordinate: number;
  readonly proofWitnessCoordinates: readonly number[];
}

function coordinate(
  coordinates: ReadonlyMap<LinkHandle, number>,
  link: LinkHandle,
  message: string,
): number {
  const value = coordinates.get(link);
  assert(value !== undefined, message);
  return value;
}

function portableSegment(
  coordinates: ReadonlyMap<LinkHandle, number>,
  segment: SelectedSegmentEvidence,
): PortableSegment {
  return Object.freeze({
    start: segment.start,
    end: segment.end,
    form: coordinate(coordinates, segment.form, "F3 segment form coordinate"),
    dictionaryOccurrence: coordinate(
      coordinates,
      segment.dictionaryOccurrence,
      "F3 segment Dictionary occurrence coordinate",
    ),
    sliceContent: coordinate(coordinates, segment.sliceContent, "F3 slice content coordinate"),
    span: coordinate(coordinates, segment.span, "F3 span coordinate"),
    sliceEvidence: coordinate(coordinates, segment.sliceEvidence, "F3 slice evidence coordinate"),
    lexeme: coordinate(coordinates, segment.lexeme, "F3 lexeme coordinate"),
    resolution: coordinate(coordinates, segment.resolution, "F3 resolution coordinate"),
    selection: coordinate(coordinates, segment.selection, "F3 selection coordinate"),
  });
}

function defineProofWitness(
  memory: Memory,
  f: Frame,
  target: LinkHandle,
): LinkHandle {
  const poles = memory.poles(target);
  const first = memory.ensure(f.startRole, poles.start);
  const second = memory.ensure(f.endRole, poles.end);
  return memory.ensure(memory.ensure(first, second), target);
}

function buildAuthority(noise: boolean): PortableAuthority {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  if (noise) {
    const n0 = memory.ensure(basis.U, basis.C);
    const n1 = memory.ensure(n0, basis.O);
    memory.ensure(basis.L, n1);
  }

  const f = frame(memory);
  const fn = memory.ensure(basis.U, basis.L);
  const arg = memory.ensure(basis.L, basis.U);
  const openUse = memory.ensure(basis.O, basis.U);
  const closeUse = memory.ensure(basis.C, basis.L);
  const b1 = memory.ensure(basis.O, fn);
  const b2 = memory.ensure(basis.C, arg);

  const application = memory.ensure(fn, arg);
  const result1 = memory.ensure(application, b1);
  const result2 = memory.ensure(application, b2);

  let history = basis.R;
  let dictionary = defineDictionaryScope(memory, basis.R, history);
  const occurrences = new Map<string, LinkHandle>();
  for (const [name, value] of [
    ["f", fn],
    ["(", openUse],
    ["a", arg],
    [")", closeUse],
    ["b1", b1],
    ["b2", b2],
  ] as const) {
    const next = defineName(memory, basis, dictionary, history, name, value);
    dictionary = next.dictionary;
    history = next.history;
    occurrences.set(name, next.occurrence);
  }

  const grammar = memory.ensure(openUse, closeUse);
  const theory = memory.ensure(closeUse, openUse);
  const admittedForms = materializeExactSequence(
    memory,
    [fn, openUse, arg, closeUse],
  );
  const authority: V012SourceAuthority = Object.freeze({
    dictionary,
    grammar,
    theory,
    grammarMembership: memory.ensure(grammar, admittedForms),
    theoryMembership: memory.ensure(theory, admittedForms),
  });

  const content = materializeV012SourceContent(memory, basis, bytes("f(a)"));
  const source = defineSourceForm(memory, content);
  const sourceEvidence = buildV012SelectedSourceEvidence(
    memory,
    basis,
    source,
    [
      { start: 0, end: 1, form: fn, dictionaryOccurrence: occurrences.get("f")! },
      { start: 1, end: 2, form: openUse, dictionaryOccurrence: occurrences.get("(")! },
      { start: 2, end: 3, form: arg, dictionaryOccurrence: occurrences.get("a")! },
      { start: 3, end: 4, form: closeUse, dictionaryOccurrence: occurrences.get(")")! },
    ],
    authority,
  );

  // Grouping binds structural roles to verified source-resolution Links.
  const functionResolution = sourceEvidence.segments[0]!.resolution;
  const argumentResolution = sourceEvidence.segments[2]!.resolution;
  const sourceStartBinding = memory.ensure(f.startRole, functionResolution);
  const sourceEndBinding = memory.ensure(f.endRole, argumentResolution);
  const sourceBindingPair = memory.ensure(sourceStartBinding, sourceEndBinding);
  const descriptor = memory.ensure(sourceEvidence.formSequence, sourceBindingPair);
  const grouping = memory.ensure(descriptor, application);

  const proofTargets = [f.directMethod, application, result1, result2] as const;
  const proofWitnesses = proofTargets.map((target) =>
    defineProofWitness(memory, f, target)
  );

  const evidenceRoots: LinkHandle[] = [
    sourceEvidence.content,
    sourceEvidence.source,
    sourceEvidence.dictionary,
    sourceEvidence.grammar,
    sourceEvidence.theory,
    sourceEvidence.selectionSequence,
    sourceEvidence.formSequence,
    sourceEvidence.grammarMembership,
    sourceEvidence.theoryMembership,
    ...sourceEvidence.segments.flatMap((segment) => [
      segment.form,
      segment.dictionaryOccurrence,
      segment.sliceContent,
      segment.span,
      segment.sliceEvidence,
      segment.lexeme,
      segment.resolution,
      segment.selection,
    ]),
    grouping,
    f.directMethod,
    ...proofWitnesses,
  ];

  const support = poleClosure(memory, evidenceRoots);
  const canonical = exportCanonicalTopology(new SupportView(memory, support));
  const c = canonical.coordinates;

  return Object.freeze({
    schema: "mts-v013-formal-source-grouping/research-v0.1" as const,
    topology: canonical.topology,
    sourceEvidence: Object.freeze({
      content: coordinate(c, sourceEvidence.content, "F3 source content coordinate"),
      source: coordinate(c, sourceEvidence.source, "F3 source coordinate"),
      dictionary: coordinate(c, sourceEvidence.dictionary, "F3 Dictionary coordinate"),
      grammar: coordinate(c, sourceEvidence.grammar, "F3 Grammar coordinate"),
      theory: coordinate(c, sourceEvidence.theory, "F3 Theory coordinate"),
      segments: Object.freeze(
        sourceEvidence.segments.map((segment) => portableSegment(c, segment)),
      ),
      selectionSequence: coordinate(
        c,
        sourceEvidence.selectionSequence,
        "F3 selection sequence coordinate",
      ),
      formSequence: coordinate(c, sourceEvidence.formSequence, "F3 form sequence coordinate"),
      grammarMembership: coordinate(
        c,
        sourceEvidence.grammarMembership,
        "F3 Grammar membership coordinate",
      ),
      theoryMembership: coordinate(
        c,
        sourceEvidence.theoryMembership,
        "F3 Theory membership coordinate",
      ),
    }),
    groupingCoordinate: coordinate(c, grouping, "F3 grouping coordinate"),
    directMethodCoordinate: coordinate(c, f.directMethod, "F3 direct method coordinate"),
    proofWitnessCoordinates: Object.freeze(
      proofWitnesses.map((witness) =>
        coordinate(c, witness, "F3 proof witness coordinate")
      ),
    ),
  });
}

function at(all: readonly LinkHandle[], coordinateValue: number): LinkHandle {
  const link = all[coordinateValue];
  assert(link !== undefined, "F3 portable coordinate resolves");
  return link;
}

function restoreSegment(
  all: readonly LinkHandle[],
  segment: PortableSegment,
): SelectedSegmentEvidence {
  return Object.freeze({
    start: segment.start,
    end: segment.end,
    form: at(all, segment.form),
    dictionaryOccurrence: at(all, segment.dictionaryOccurrence),
    sliceContent: at(all, segment.sliceContent),
    span: at(all, segment.span),
    sliceEvidence: at(all, segment.sliceEvidence),
    lexeme: at(all, segment.lexeme),
    resolution: at(all, segment.resolution),
    selection: at(all, segment.selection),
  });
}

function restoreSourceEvidence(
  memory: Memory,
  portable: PortableSourceEvidence,
): SourceFrontEndEvidence {
  const all = memory.allLinks();
  return Object.freeze({
    basis: ensureRootBasis(memory),
    content: at(all, portable.content),
    source: at(all, portable.source),
    dictionary: at(all, portable.dictionary),
    grammar: at(all, portable.grammar),
    theory: at(all, portable.theory),
    segments: Object.freeze(
      portable.segments.map((segment) => restoreSegment(all, segment)),
    ),
    selectionSequence: at(all, portable.selectionSequence),
    formSequence: at(all, portable.formSequence),
    grammarMembership: at(all, portable.grammarMembership),
    theoryMembership: at(all, portable.theoryMembership),
  });
}

interface VerifiedBinding {
  readonly target: LinkHandle;
  readonly values: ReadonlyMap<LinkHandle, LinkHandle>;
}

function verifyProofWitness(
  memory: ReadMemory,
  f: Frame,
  witness: LinkHandle,
): VerifiedBinding {
  const witnessPoles = memory.poles(witness);
  const pairPoles = memory.poles(witnessPoles.start);
  const values = new Map<LinkHandle, LinkHandle>();

  for (const bindingHandle of [pairPoles.start, pairPoles.end]) {
    const binding = memory.poles(bindingHandle);
    assert(
      binding.start === f.startRole || binding.start === f.endRole,
      "F3 proof witness uses selected roles",
    );
    assert(!values.has(binding.start), "F3 proof witness role occurs once");
    values.set(binding.start, binding.end);
  }

  same(values.size, 2, "F3 proof witness exact role coverage");
  const startValue = values.get(f.startRole);
  const endValue = values.get(f.endRole);
  assert(startValue !== undefined && endValue !== undefined, "F3 proof values exist");
  same(
    memory.find(startValue, endValue),
    witnessPoles.end,
    "F3 proof witness reconstructs exact target",
  );

  return Object.freeze({ target: witnessPoles.end, values });
}

function bindingFor(
  bindings: readonly VerifiedBinding[],
  target: LinkHandle,
): VerifiedBinding {
  const found = bindings.filter((binding) => binding.target === target);
  same(found.length, 1, "F3 exact proof binding per target");
  return found[0]!;
}

function semanticValueOfResolution(
  memory: ReadMemory,
  sourceEvidence: SourceFrontEndEvidence,
  resolution: LinkHandle,
): LinkHandle {
  const segment = sourceEvidence.segments.find(
    (candidate) => candidate.resolution === resolution,
  );
  assert(segment !== undefined, "F3 grouping role points to verified source resolution");
  const poles = memory.poles(resolution);
  same(poles.end, segment.form, "F3 resolution end equals source-selected semantic form");
  return segment.form;
}

function groupedApplication(
  memory: ReadMemory,
  sourceEvidence: SourceFrontEndEvidence,
  selectedUses: readonly LinkHandle[],
  f: Frame,
  grouping: LinkHandle,
  bindings: readonly VerifiedBinding[],
): LinkHandle {
  same(selectedUses.length, 4, "F3 one source replays four exact Uses");

  const groupingPoles = memory.poles(grouping);
  const descriptorPoles = memory.poles(groupingPoles.start);
  same(
    descriptorPoles.start,
    sourceEvidence.formSequence,
    "F3 grouping is bound to exact replayed source formSequence",
  );

  const pairPoles = memory.poles(descriptorPoles.end);
  const sourceRoleBindings = new Map<LinkHandle, LinkHandle>();
  for (const bindingHandle of [pairPoles.start, pairPoles.end]) {
    const binding = memory.poles(bindingHandle);
    assert(
      binding.start === f.startRole || binding.start === f.endRole,
      "F3 grouping uses only selected structural roles",
    );
    assert(!sourceRoleBindings.has(binding.start), "F3 grouping role occurs once");
    sourceRoleBindings.set(binding.start, binding.end);
  }
  same(sourceRoleBindings.size, 2, "F3 grouping covers two roles");

  const functionResolution = sourceRoleBindings.get(f.startRole);
  const argumentResolution = sourceRoleBindings.get(f.endRole);
  assert(
    functionResolution !== undefined && argumentResolution !== undefined,
    "F3 grouping provides function and argument source resolutions",
  );

  const functionValue = semanticValueOfResolution(
    memory,
    sourceEvidence,
    functionResolution,
  );
  const argumentValue = semanticValueOfResolution(
    memory,
    sourceEvidence,
    argumentResolution,
  );

  const application = groupingPoles.end;
  const applicationBinding = bindingFor(bindings, application);
  same(
    applicationBinding.values.get(f.startRole),
    functionValue,
    "F3 grouped source function value matches proof-bound application start",
  );
  same(
    applicationBinding.values.get(f.endRole),
    argumentValue,
    "F3 grouped source argument value matches proof-bound application end",
  );

  return application;
}

function evaluateApplication(
  memory: Memory,
  f: Frame,
  directMethod: LinkHandle,
  application: LinkHandle,
  bindings: readonly VerifiedBinding[],
): BundleValue {
  const method = bindingFor(bindings, directMethod);
  const fromRole = method.values.get(f.startRole);
  const toRole = method.values.get(f.endRole);
  assert(fromRole !== undefined && toRole !== undefined, "F3 method roles resolve");
  assert(fromRole === f.startRole && toRole === f.endRole, "F3 selected Direct method");

  const occurrences: ResolvedOccurrence[] = [];
  let index = 0;
  for (const candidate of bindings) {
    if (candidate.target === directMethod) continue;
    const from = candidate.values.get(fromRole);
    const to = candidate.values.get(toRole);
    assert(from !== undefined && to !== undefined, "F3 candidate proof roles resolve");
    if (from !== application) continue;
    occurrences.push(Object.freeze({
      path: Object.freeze([index]),
      link: to,
    }));
    index += 1;
  }
  return resolveFlatBundle(memory, Object.freeze(occurrences));
}

function resolveName(
  memory: Memory,
  dictionary: LinkHandle,
  physicalName: string,
): LinkHandle | undefined {
  const basis = ensureRootBasis(memory);
  const content = materializeV012SourceContent(memory, basis, bytes(physicalName));
  return lookupScopedDictionary(memory, dictionary, content)?.form;
}

function setSame(
  actual: ReadonlySet<LinkHandle>,
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.size, new Set(expected).size, `${message}: cardinality`);
  for (const link of expected) assert(actual.has(link), `${message}: missing result`);
}

function execute(artifact: PortableAuthority): void {
  same(
    artifact.schema,
    "mts-v013-formal-source-grouping/research-v0.1",
    "F3 schema",
  );
  const memory = restoreTopology(artifact.topology);
  const all = memory.allLinks();
  const sourceEvidence = restoreSourceEvidence(memory, artifact.sourceEvidence);
  const selectedUses = replayV012SelectedSourceEvidence(
    memory,
    ensureRootBasis(memory),
    sourceEvidence,
  );
  const f = frame(memory);
  const grouping = at(all, artifact.groupingCoordinate);
  const directMethod = at(all, artifact.directMethodCoordinate);
  const bindings = artifact.proofWitnessCoordinates.map((coordinateValue) =>
    verifyProofWitness(memory, f, at(all, coordinateValue))
  );

  const application = groupedApplication(
    memory,
    sourceEvidence,
    selectedUses,
    f,
    grouping,
    bindings,
  );
  const result = evaluateApplication(
    memory,
    f,
    directMethod,
    application,
    bindings,
  );

  const b1 = resolveName(memory, sourceEvidence.dictionary, "b1");
  const b2 = resolveName(memory, sourceEvidence.dictionary, "b2");
  assert(b1 !== undefined && b2 !== undefined, "F3 output names resolve");
  same(result.kind, "bundle", "F3 grouped source result is BundleValue");
  setSame(result.links, [b1, b2], "F3 exact grouped source results");

  const sourceContent = memory.poles(sourceEvidence.source).end;
  same(sourceContent, sourceEvidence.content, "F3 exact SourceForm content");
}

function expectRejected(effect: () => unknown, message: string): void {
  let rejected = false;
  try { effect(); } catch { rejected = true; }
  assert(rejected, message);
}

function negativeControls(artifact: PortableAuthority): void {
  const memory = restoreTopology(artifact.topology);
  const all = memory.allLinks();
  const sourceEvidence = restoreSourceEvidence(memory, artifact.sourceEvidence);
  const selectedUses = replayV012SelectedSourceEvidence(
    memory,
    ensureRootBasis(memory),
    sourceEvidence,
  );
  const f = frame(memory);
  const selectedGrouping = at(all, artifact.groupingCoordinate);
  const directMethod = at(all, artifact.directMethodCoordinate);
  const bindings = artifact.proofWitnessCoordinates.map((coordinateValue) =>
    verifyProofWitness(memory, f, at(all, coordinateValue))
  );
  const application = memory.poles(selectedGrouping).end;

  {
    const selectedPoles = memory.poles(selectedGrouping);
    const descriptor = memory.poles(selectedPoles.start);
    const pair = memory.poles(descriptor.end);
    const first = memory.poles(pair.start);
    const second = memory.poles(pair.end);
    const swappedFirst = memory.ensure(first.start, second.end);
    const swappedSecond = memory.ensure(second.start, first.end);
    const swappedPair = memory.ensure(swappedFirst, swappedSecond);
    const swappedDescriptor = memory.ensure(sourceEvidence.formSequence, swappedPair);
    const forged = memory.ensure(swappedDescriptor, application);
    expectRejected(
      () => groupedApplication(
        memory, sourceEvidence, selectedUses, f, forged, bindings,
      ),
      "F3 swapped source-role grouping fails closed",
    );
  }

  {
    const foreignLexeme = memory.ensure(sourceEvidence.source, directMethod);
    const foreignResolution = memory.ensure(foreignLexeme, directMethod);
    const foreignStart = memory.ensure(f.startRole, foreignResolution);
    const selectedPoles = memory.poles(selectedGrouping);
    const descriptor = memory.poles(selectedPoles.start);
    const pair = memory.poles(descriptor.end);
    const forgedPair = memory.ensure(foreignStart, pair.end);
    const forgedDescriptor = memory.ensure(sourceEvidence.formSequence, forgedPair);
    const forged = memory.ensure(forgedDescriptor, application);
    expectRejected(
      () => groupedApplication(
        memory, sourceEvidence, selectedUses, f, forged, bindings,
      ),
      "F3 foreign source resolution fails closed",
    );
  }

  {
    const selectedPoles = memory.poles(selectedGrouping);
    const descriptor = memory.poles(selectedPoles.start);
    const wrongSequence = memory.ensure(sourceEvidence.formSequence, directMethod);
    const forgedDescriptor = memory.ensure(wrongSequence, descriptor.end);
    const forged = memory.ensure(forgedDescriptor, application);
    expectRejected(
      () => groupedApplication(
        memory, sourceEvidence, selectedUses, f, forged, bindings,
      ),
      "F3 wrong source formSequence fails closed",
    );
  }
}

function main(): void {
  const a = buildAuthority(false);
  const b = buildAuthority(true);
  exactJson(a, b, "F3 portable grouping authority ignores unrelated source noise");

  execute(a);
  execute(b);
  negativeControls(a);

  console.log([
    "MTS v0.13 FORMAL F3:",
    "SOURCE_GROUPED_APPLICATION=GREEN_SCOPED_RESEARCH",
    "PHYSICAL_SOURCE=f(a)",
    "SOURCE_SEGMENTS=4",
    "EXTERNAL_FUNCTION_ARGUMENT_LINK_PARAMETERS=0",
    "GROUPING_AUTHORITY=LINK_EVIDENCE",
    "PARENTHESES_SEMANTIC_AUTHORITY=0",
    "PROOF_BINDING_WITNESSES=4",
    "RESULT_CARDINALITY=2",
    "HOST_MATCHERS=0",
    "STRUCTURAL_UNIFICATION=NOT_USED",
    "INDEPENDENT_MEMORIES=2",
    "NEGATIVE_CONTROLS=3",
    "F_KERNEL_SELF_EXTENSION=NEXT_GATE",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
