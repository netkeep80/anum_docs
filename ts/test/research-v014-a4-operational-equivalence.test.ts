// mts-version-evidence: candidate-from=0.14
// research-owner: #1664
// decision-owner: #1662

import {
  decomposeV013SemanticLink,
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type RootBasis,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.14 N17 A4 equivalence: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

type Frame = "DIRECT" | "MIRROR";

class OrientationView {
  constructor(
    readonly memory: Memory,
    readonly frame: Frame,
  ) {}

  get root(): LinkHandle {
    return this.memory.root;
  }

  poles(link: LinkHandle): LinkPoles {
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

  ensureStartSelfClosed(end: LinkHandle): LinkHandle {
    return this.frame === "DIRECT"
      ? this.memory.ensureStartSelfClosed(end)
      : this.memory.ensureEndSelfClosed(end);
  }

  ensureEndSelfClosed(start: LinkHandle): LinkHandle {
    return this.frame === "DIRECT"
      ? this.memory.ensureEndSelfClosed(start)
      : this.memory.ensureStartSelfClosed(start);
  }
}

function invert(
  memory: Memory,
  basis: RootBasis,
  source: LinkHandle,
  memo = new Map<LinkHandle, LinkHandle>(),
): LinkHandle {
  const cached = memo.get(source);
  if (cached !== undefined) return cached;

  const d = decomposeV013SemanticLink(memory, basis, source);
  let result: LinkHandle;
  if (d.aspect === "ROOT") {
    result = basis.R;
  } else if (d.aspect === "START") {
    result = memory.ensureEndSelfClosed(invert(memory, basis, d.children[0]!, memo));
  } else if (d.aspect === "END") {
    result = memory.ensureStartSelfClosed(invert(memory, basis, d.children[0]!, memo));
  } else {
    result = memory.ensure(
      invert(memory, basis, d.children[1]!, memo),
      invert(memory, basis, d.children[0]!, memo),
    );
  }
  memo.set(source, result);
  return result;
}

function wire(memory: Memory, basis: RootBasis, link: LinkHandle): string {
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    memory,
    basis,
    link,
  );
  return String.fromCharCode(
    ...serializeV013HierarchicalCarrier(memory, basis, carrier),
  );
}

function deriveFrame(
  selected: readonly LinkHandle[],
  inR: LinkHandle,
  outR: LinkHandle,
): Frame | "UNRESOLVED" {
  const unique = [...new Set(selected)];
  if (unique.length !== 1) return "UNRESOLVED";
  if (unique[0] === inR) return "DIRECT";
  if (unique[0] === outR) return "MIRROR";
  return "UNRESOLVED";
}

function main(): void {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const { R, O, C, L, U } = basis;
  const direct = new OrientationView(memory, "DIRECT");
  const mirror = new OrientationView(memory, "MIRROR");

  const inR = memory.ensure(C, R);
  const outR = memory.ensure(R, O);

  // ---------------------------------------------------------------------
  // N17.1 — DIRECT gauge is exactly the currently accepted operational API.
  // ---------------------------------------------------------------------

  same(direct.root, memory.root, "DIRECT root");
  for (const link of [R, O, C, L, U, inR, outR]) {
    const actual = direct.poles(link);
    const expected = memory.poles(link);
    same(actual.start, expected.start, "DIRECT start pole");
    same(actual.end, expected.end, "DIRECT end pole");
  }

  const A = memory.ensure(L, U);
  const B = memory.ensure(O, A);
  const Cx = memory.ensure(B, C);
  const samples = [R, O, C, L, U, A, B, Cx];

  for (const left of samples) {
    for (const right of samples) {
      same(
        direct.ensure(left, right),
        memory.ensure(left, right),
        "DIRECT ensure equals production Memory.ensure",
      );
    }
    same(
      direct.ensureStartSelfClosed(left),
      memory.ensureStartSelfClosed(left),
      "DIRECT START self-closure equals production API",
    );
    same(
      direct.ensureEndSelfClosed(left),
      memory.ensureEndSelfClosed(left),
      "DIRECT END self-closure equals production API",
    );
  }

  same(wire(memory, basis, R), "8", "accepted ROOT wire");
  same(wire(memory, basis, O), "98", "accepted START wire");
  same(wire(memory, basis, C), "68", "accepted END wire");
  same(wire(memory, basis, L), "19868", "accepted PAIR wire L");
  same(wire(memory, basis, U), "16898", "accepted PAIR wire U");

  // ---------------------------------------------------------------------
  // N17.2 — MIRROR is not a third semantics: it is exactly J(DIRECT).
  // ---------------------------------------------------------------------

  same(invert(memory, basis, inR), outR, "J(InR)=OutR");
  same(invert(memory, basis, outR), inR, "J(OutR)=InR");
  for (const link of samples) {
    same(
      invert(memory, basis, invert(memory, basis, link)),
      link,
      "J is involutive",
    );
  }

  for (const left of samples) {
    for (const right of samples) {
      const directPair = direct.ensure(left, right);
      const mirrorPair = mirror.ensure(
        invert(memory, basis, left),
        invert(memory, basis, right),
      );
      same(
        invert(memory, basis, directPair),
        mirrorPair,
        "J(ensure_D(a,b)) = ensure_M(J(a),J(b))",
      );
    }

    same(
      invert(memory, basis, direct.ensureStartSelfClosed(left)),
      mirror.ensureStartSelfClosed(invert(memory, basis, left)),
      "J commutes with semantic START",
    );
    same(
      invert(memory, basis, direct.ensureEndSelfClosed(left)),
      mirror.ensureEndSelfClosed(invert(memory, basis, left)),
      "J commutes with semantic END",
    );
  }

  for (const link of samples) {
    const directPoles = direct.poles(link);
    const mirrored = invert(memory, basis, link);
    const mirrorPoles = mirror.poles(mirrored);
    same(
      mirrorPoles.start,
      invert(memory, basis, directPoles.start),
      "MIRROR semantic start = J(DIRECT start)",
    );
    same(
      mirrorPoles.end,
      invert(memory, basis, directPoles.end),
      "MIRROR semantic end = J(DIRECT end)",
    );
  }

  // ---------------------------------------------------------------------
  // N17.3 — frame authority is explicit foundation selection only.
  // ---------------------------------------------------------------------

  // Both links exist physically, but raw Memory presence selects nothing.
  same(memory.find(C, R), inR, "physical InR exists");
  same(memory.find(R, O), outR, "physical OutR exists");
  same(deriveFrame([], inR, outR), "UNRESOLVED", "zero witnesses unresolved");
  same(
    deriveFrame([inR, outR], inR, outR),
    "UNRESOLVED",
    "two mirror witnesses unresolved",
  );
  same(
    deriveFrame([inR], inR, outR),
    "DIRECT",
    "selected InR yields DIRECT",
  );
  same(
    deriveFrame([outR], inR, outR),
    "MIRROR",
    "selected OutR yields MIRROR",
  );
  same(
    deriveFrame([inR, inR], inR, outR),
    "DIRECT",
    "duplicate same semantic witness stays DIRECT",
  );
  same(
    deriveFrame([memory.ensure(L, R)], inR, outR),
    "UNRESOLVED",
    "unrelated Link cannot define orientation",
  );

  const resolved = new Set<Frame>();
  for (const selected of [
    [inR],
    [outR],
    [],
    [inR, outR],
    [memory.ensure(L, R)],
  ] as readonly LinkHandle[][]) {
    const frame = deriveFrame(selected, inR, outR);
    if (frame !== "UNRESOLVED") resolved.add(frame);
  }
  same(resolved.size, 2, "exactly two resolved gauges exist in selected orbit");
  assert(resolved.has("DIRECT") && resolved.has("MIRROR"), "resolved gauges are DIRECT/MIRROR only");

  // ---------------------------------------------------------------------
  // N17.4 — operational audit changes no production semantics.
  // ---------------------------------------------------------------------

  console.log([
    "MTS v0.14 N17: A4_OPERATIONAL_EQUIVALENCE=GREEN_RESEARCH",
    "DIRECT_GAUGE_EQUALS_CURRENT_MEMORY_API=TRUE",
    "ACCEPTED_V013_WIRES_PRESERVED=TRUE",
    "MIRROR_GAUGE_EQUALS_J_IMAGE=TRUE",
    "J_INVOLUTIVE=TRUE",
    "RESOLVED_GAUGE_COUNT=2",
    "ZERO_WITNESS=UNRESOLVED",
    "TWO_WITNESSES=UNRESOLVED",
    "RAW_MEMORY_PRESENCE_AUTHORITY=FALSE",
    "UNRELATED_WITNESS_AUTHORITY=FALSE",
    "FINAL_NORMATIVE_A4_CHOICE=PENDING_AUTHOR_SEMANTIC_FREEZE",
    "PRODUCTION_DELTA=NONE",
    "MTS_V014_ACCEPTED=FALSE",
  ].join(" "));
}

main();
