// mts-version-evidence: candidate-from=0.14
// research-owner: #1673
//
// N20b: context-relative A4' gauge witness.
//
// This test intentionally depends only on the live Link kernel. It does not
// use ExactSequence, Anum, Q or FORMAL as orientation authority.

import { Memory, type LinkHandle } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.14 N20b context gauge: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": values differ");
}

type Gauge = "ID" | "J";
type Frame = "DIRECT" | "MIRROR";

function rawInvert(
  memory: Memory,
  root: LinkHandle,
  source: LinkHandle,
  memo = new Map<LinkHandle, LinkHandle>(),
): LinkHandle {
  const cached = memo.get(source);
  if (cached !== undefined) return cached;

  const p = memory.poles(source);
  let result: LinkHandle;

  if (p.start === source && p.end === source) {
    same(source, root, "only root is self-self in the bootstrap witness");
    result = root;
  } else if (p.start === source) {
    result = memory.ensureEndSelfClosed(rawInvert(memory, root, p.end, memo));
  } else if (p.end === source) {
    result = memory.ensureStartSelfClosed(rawInvert(memory, root, p.start, memo));
  } else {
    result = memory.ensure(
      rawInvert(memory, root, p.end, memo),
      rawInvert(memory, root, p.start, memo),
    );
  }

  memo.set(source, result);
  return result;
}

function selfIncidenceCase(
  memory: Memory,
  link: LinkHandle,
): "11" | "10" | "01" | "00" {
  const p = memory.poles(link);
  return ((p.start === link ? "1" : "0") + (p.end === link ? "1" : "0")) as
    "11" | "10" | "01" | "00";
}

/**
 * Materialization uses the current Memory convenience helpers only as
 * technical constructors for the two raw self-incidence shapes. The semantic
 * claim is the structural 10/01 split itself; these helper names are not four
 * primitive A-memory opcodes.
 */
function discoverOneSidedOrbit(
  memory: Memory,
  body: LinkHandle,
): readonly [LinkHandle, LinkHandle] {
  const a = memory.ensureStartSelfClosed(body);
  const b = memory.ensureEndSelfClosed(body);
  assert(a !== b, "one-sided self-incidence forms are distinct");
  return Object.freeze([a, b]);
}

function properOneSidedMarker(
  memory: Memory,
  marker: LinkHandle,
  body: LinkHandle,
): boolean {
  const p = memory.poles(marker);
  const first = p.start === marker && p.end === body && marker !== body;
  const second = p.start === body && p.end === marker && marker !== body;
  return first !== second;
}

function sameChiralClass(
  memory: Memory,
  left: LinkHandle,
  right: LinkHandle,
): boolean {
  const a = memory.poles(left);
  const b = memory.poles(right);

  const aFirst = a.start === left && a.end !== left;
  const aSecond = a.end === left && a.start !== left;
  const bFirst = b.start === right && b.end !== right;
  const bSecond = b.end === right && b.start !== right;

  assert(aFirst !== aSecond, "left marker must be proper one-sided self-incidence");
  assert(bFirst !== bSecond, "right marker must be proper one-sided self-incidence");

  return (aFirst && bFirst) || (aSecond && bSecond);
}

function selectRelativeMarker(
  memory: Memory,
  reference: LinkHandle,
  candidates: readonly LinkHandle[],
  sameClass: boolean,
): LinkHandle {
  const found = candidates.filter(
    (candidate) => sameChiralClass(memory, reference, candidate) === sameClass,
  );
  same(found.length, 1, "relative chirality selects exactly one marker");
  return found[0]!;
}

function witnessForRootMarker(
  memory: Memory,
  root: LinkHandle,
  marker: LinkHandle,
): LinkHandle {
  const p = memory.poles(marker);

  // Technical pole coordinates implement J, but are not semantic START/END.
  if (p.start === marker && p.end === root) {
    return memory.ensure(root, marker);
  }
  if (p.start === root && p.end === marker) {
    return memory.ensure(marker, root);
  }
  throw new Error("v0.14 N20b context gauge: invalid root chiral marker");
}

function chiForContext(
  memory: Memory,
  root: LinkHandle,
  rootMarkers: readonly LinkHandle[],
  contextMarker: LinkHandle,
): LinkHandle {
  const aligned = rootMarkers.filter((rootMarker) =>
    sameChiralClass(memory, contextMarker, rootMarker)
  );
  same(aligned.length, 1, "Context marker aligns with exactly one root marker");
  return witnessForRootMarker(memory, root, aligned[0]!);
}

function gaugeBetween(
  memory: Memory,
  left: LinkHandle,
  right: LinkHandle,
): Gauge {
  return sameChiralClass(memory, left, right) ? "ID" : "J";
}

function compose(left: Gauge, right: Gauge): Gauge {
  return left === right ? "ID" : "J";
}

class OrientationView {
  constructor(
    readonly memory: Memory,
    readonly frame: Frame,
  ) {}

  poles(link: LinkHandle) {
    const p = this.memory.poles(link);
    return this.frame === "DIRECT"
      ? p
      : Object.freeze({ start: p.end, end: p.start });
  }

  ensure(start: LinkHandle, end: LinkHandle): LinkHandle {
    return this.frame === "DIRECT"
      ? this.memory.ensure(start, end)
      : this.memory.ensure(end, start);
  }

  ensureStartSelfClosed(body: LinkHandle): LinkHandle {
    return this.frame === "DIRECT"
      ? this.memory.ensureStartSelfClosed(body)
      : this.memory.ensureEndSelfClosed(body);
  }

  ensureEndSelfClosed(body: LinkHandle): LinkHandle {
    return this.frame === "DIRECT"
      ? this.memory.ensureEndSelfClosed(body)
      : this.memory.ensureStartSelfClosed(body);
  }
}

function frameFromContextMarker(
  memory: Memory,
  root: LinkHandle,
  rootMarkers: readonly LinkHandle[],
  marker: LinkHandle,
): Frame {
  const aligned = rootMarkers.find((rootMarker) =>
    sameChiralClass(memory, marker, rootMarker)
  );
  assert(aligned !== undefined, "Context marker aligns with root frame");

  const p = memory.poles(aligned);
  if (p.start === aligned && p.end === root) return "DIRECT";
  if (p.start === root && p.end === aligned) return "MIRROR";
  throw new Error("v0.14 N20b context gauge: invalid root marker");
}

function buildLocalFoundation(view: OrientationView, root: LinkHandle) {
  const O = view.ensureStartSelfClosed(root);
  const C = view.ensureEndSelfClosed(root);
  const L = view.ensure(O, C);
  const U = view.ensure(C, O);
  return Object.freeze({ R: root, O, C, L, U });
}

function semanticWire(
  view: OrientationView,
  link: LinkHandle,
  active = new Set<LinkHandle>(),
): string {
  assert(!active.has(link), "unexpected non-self semantic cycle");
  const p = view.poles(link);

  if (p.start === link && p.end === link) return "8";

  if (p.start === link) {
    active.add(link);
    try {
      return "9" + semanticWire(view, p.end, active);
    } finally {
      active.delete(link);
    }
  }

  if (p.end === link) {
    active.add(link);
    try {
      return "6" + semanticWire(view, p.start, active);
    } finally {
      active.delete(link);
    }
  }

  active.add(link);
  try {
    return "1" +
      semanticWire(view, p.start, active) +
      semanticWire(view, p.end, active);
  } finally {
    active.delete(link);
  }
}

function exercise(reverseBootstrap: boolean): void {
  const memory = new Memory();
  const R = memory.root;

  // Only technical carrier construction order changes here.
  if (reverseBootstrap) {
    memory.ensureEndSelfClosed(R);
    memory.ensureStartSelfClosed(R);
  } else {
    memory.ensureStartSelfClosed(R);
    memory.ensureEndSelfClosed(R);
  }

  const rootMarkers = discoverOneSidedOrbit(memory, R);
  for (const marker of rootMarkers) {
    assert(properOneSidedMarker(memory, marker, R), "root marker is proper");
  }

  // Objective chirality exists before any observer/context frame selection.
  const W0 = witnessForRootMarker(memory, R, rootMarkers[0]!);
  const W1 = witnessForRootMarker(memory, R, rootMarkers[1]!);
  assert(W0 !== W1, "W differs from J(W)");
  same(rawInvert(memory, R, W0), W1, "J(W)=mirror witness");
  same(rawInvert(memory, R, W1), W0, "J(J(W))=W");

  // One Link ontology gives exactly four emergent self-incidence cases.
  const ordinaryPair = memory.ensure(rootMarkers[0]!, rootMarkers[1]!);
  const cases = new Set([
    selfIncidenceCase(memory, R),
    selfIncidenceCase(memory, rootMarkers[0]!),
    selfIncidenceCase(memory, rootMarkers[1]!),
    selfIncidenceCase(memory, ordinaryPair),
  ]);
  same(
    JSON.stringify([...cases].sort()),
    JSON.stringify(["00", "01", "10", "11"]),
    "all four self-incidence cases emerge",
  );

  // Two J-fixed Context bodies, with no frame yet.
  const bodyB = memory.ensure(rootMarkers[0]!, rootMarkers[1]!);
  const bodyC = memory.ensure(rootMarkers[1]!, rootMarkers[0]!);
  same(rawInvert(memory, R, bodyB), bodyB, "Context B body is J-fixed");
  same(rawInvert(memory, R, bodyC), bodyC, "Context C body is J-fixed");

  const markersA = rootMarkers;
  const markersB = discoverOneSidedOrbit(memory, bodyB);
  const markersC = discoverOneSidedOrbit(memory, bodyC);

  for (const [body, markers] of [
    [R, markersA],
    [bodyB, markersB],
    [bodyC, markersC],
  ] as const) {
    same(new Set(markers).size, 2, "each Context has exactly two frame markers");
    for (const marker of markers) {
      assert(properOneSidedMarker(memory, marker, body), "Context marker is proper");
    }
  }

  // Arbitrarily choose A's local frame for this witness. No global authority is
  // inferred from this test choice.
  const markerA = markersA[0]!;
  const markerB = selectRelativeMarker(memory, markerA, markersB, true);
  const markerC = selectRelativeMarker(memory, markerA, markersC, false);

  const mirrorA = rawInvert(memory, R, markerA);
  const mirrorB = rawInvert(memory, R, markerB);
  const mirrorC = rawInvert(memory, R, markerC);
  assert(markersA.includes(mirrorA) && mirrorA !== markerA, "J swaps A markers");
  assert(markersB.includes(mirrorB) && mirrorB !== markerB, "J swaps B markers");
  assert(markersC.includes(mirrorC) && mirrorC !== markerC, "J swaps C markers");

  // Relative chirality is objective under simultaneous inversion.
  same(
    sameChiralClass(memory, markerA, markerB),
    sameChiralClass(memory, mirrorA, mirrorB),
    "same-frame relation is J-invariant",
  );
  same(
    sameChiralClass(memory, markerA, markerC),
    sameChiralClass(memory, mirrorA, mirrorC),
    "mirror-frame relation is J-invariant",
  );

  const chiA = chiForContext(memory, R, rootMarkers, markerA);
  const chiB = chiForContext(memory, R, rootMarkers, markerB);
  const chiC = chiForContext(memory, R, rootMarkers, markerC);
  same(chiA, chiB, "same chirality yields same chi");
  same(rawInvert(memory, R, chiA), chiC, "opposite chirality yields J(chi)");

  const gAB = gaugeBetween(memory, markerA, markerB);
  const gBC = gaugeBetween(memory, markerB, markerC);
  const gAC = gaugeBetween(memory, markerA, markerC);
  same(gAB, "ID", "same orientation gives Id transport");
  same(gBC, "J", "opposite orientation gives J transport");
  same(gAC, "J", "A to C gives J transport");
  same(gaugeBetween(memory, markerA, markerA), "ID", "g_AA=Id");
  same(
    gaugeBetween(memory, markerA, markerC),
    gaugeBetween(memory, markerC, markerA),
    "g_AB=g_BA",
  );
  same(compose(gAB, gBC), gAC, "g_AB o g_BC = g_AC");
  same(compose("J", "J"), "ID", "J o J = Id");

  // START/END names appear only after a Context marker fixes a local frame.
  const viewA = new OrientationView(
    memory,
    frameFromContextMarker(memory, R, rootMarkers, markerA),
  );
  const viewB = new OrientationView(
    memory,
    frameFromContextMarker(memory, R, rootMarkers, markerB),
  );
  const viewC = new OrientationView(
    memory,
    frameFromContextMarker(memory, R, rootMarkers, markerC),
  );

  const probe = bodyB;
  const pA = viewA.poles(probe);
  const pB = viewB.poles(probe);
  const pC = viewC.poles(probe);
  same(pA.start, pB.start, "same frame START_A=START_B");
  same(pA.end, pB.end, "same frame END_A=END_B");
  same(pA.start, pC.end, "mirror frame START_A=END_C");
  same(pA.end, pC.start, "mirror frame END_A=START_C");

  const fA = buildLocalFoundation(viewA, R);
  const fB = buildLocalFoundation(viewB, R);
  const fC = buildLocalFoundation(viewC, R);
  const fingerprint = (
    view: OrientationView,
    f: ReturnType<typeof buildLocalFoundation>,
    chi: LinkHandle,
  ) => [
    semanticWire(view, f.R),
    semanticWire(view, f.O),
    semanticWire(view, f.C),
    semanticWire(view, f.L),
    semanticWire(view, f.U),
    semanticWire(view, chi),
  ].join("|");

  const fpA = fingerprint(viewA, fA, chiA);
  const fpB = fingerprint(viewB, fB, chiB);
  const fpC = fingerprint(viewC, fC, chiC);
  same(fpA, fpB, "same-frame semantic equations are identical");
  same(fpA, fpC, "mirror-frame semantic equations are covariant");
}

exercise(false);
exercise(true);

console.log([
  "MTS v0.14 N20b: CONTEXT_RELATIVE_A4_PRIME=GREEN_RESEARCH",
  "OBJECTIVE_CHIRAL_ORBIT_BEFORE_OBSERVER=TRUE",
  "OBSERVER_CREATES_CHIRALITY=FALSE",
  "ONTOLOGY_PRIMITIVE_LINK=ONE",
  "ABSTRACT_LINK_FORMING_PRIMITIVE=ONE",
  "EMERGENT_SELF_INCIDENCE_CASES=FOUR",
  "PREORIENTED_J_ORBIT_CLASSES=THREE",
  "CONTEXT_FRAME_STATES=2",
  "CONTEXT_ORIENTATION_CARRIER=ONE_SIDED_SELF_INCIDENCE_LINK",
  "EXACT_SEQUENCE_ORIENTATION_AUTHORITY=FALSE",
  "GLOBAL_SELECTED_W_REQUIRED=FALSE",
  "SAME_FRAME_CONTEXTS_SAME_SEMANTICS=TRUE",
  "MIRROR_FRAME_CONTEXTS_COVARIANT=TRUE",
  "RELATIVE_TRANSPORT_GROUP=Z2",
  "TRANSPORT_COMPOSITION=TRUE",
  "TECHNICAL_BOOTSTRAP_ORDER_AUTHORITY=FALSE",
  "FOUR_RECURSIVE_FORMS_ARE_PRIMITIVE_OPCODES=FALSE",
  "MTS_V014_ACCEPTED=FALSE",
].join(" "));
