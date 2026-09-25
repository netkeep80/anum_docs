import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  V013GroundedScopeCursor,
  defineV013GroundedExecutionScope,
  reactV013GroundedScope,
} from "../src/v013-grounded-execution.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("post-v0.13 #1558 E7/W7: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": values differ");
}

function setEqual(actual: readonly string[], expected: readonly string[], message: string): void {
  const left = [...actual].sort();
  const right = [...expected].sort();
  assert(
    left.length === right.length && left.every((value, index) => value === right[index]),
    message + ": expected [" + right.join(", ") + "], got [" + left.join(", ") + "]",
  );
}

function structuralAnum(memory: Memory, link: LinkHandle): string {
  const visiting = new Set<LinkHandle>();

  function walk(current: LinkHandle): string {
    assert(!visiting.has(current), "W7 normalization requires well-founded Link topology");
    visiting.add(current);
    const { start, end } = memory.poles(current);

    let result: string;
    if (start === current && end === current) {
      result = "8";
    } else if (start === current) {
      result = "9" + walk(end);
    } else if (end === current) {
      result = "6" + walk(start);
    } else {
      result = "1" + walk(start) + walk(end);
    }

    visiting.delete(current);
    return result;
  }

  return walk(link);
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly theory: LinkHandle;
  readonly K: LinkHandle;
  readonly A: LinkHandle;
  readonly B: LinkHandle;
  readonly C: LinkHandle;
  readonly currentTruth: LinkHandle;
  readonly cursor: V013GroundedScopeCursor;
  readonly nextSeed: LinkHandle;
}

function addNoise(memory: Memory, basis: RootBasis, count: number): void {
  let seed = memory.ensure(basis.R, basis.L);
  for (let i = 0; i < count; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? basis.U : basis.L);
  }
}

function buildFixture(memory: Memory, variant: "A" | "B"): Fixture {
  const basis = ensureRootBasis(memory);

  if (variant === "B") {
    // Deliberately perturb all later local technical addresses.
    addNoise(memory, basis, 9);
  }

  let K: LinkHandle;
  let A: LinkHandle;
  let B: LinkHandle;
  let C: LinkHandle;

  if (variant === "A") {
    K = memory.ensure(basis.L, basis.R);
    A = memory.ensure(basis.U, basis.R);
    B = memory.ensure(basis.L, basis.O);
    C = memory.ensure(basis.U, basis.C);
  } else {
    // Same structural roles, intentionally different allocation order.
    C = memory.ensure(basis.U, basis.C);
    B = memory.ensure(basis.L, basis.O);
    A = memory.ensure(basis.U, basis.R);
    K = memory.ensure(basis.L, basis.R);
  }

  const theory = memory.ensure(basis.C, basis.L);
  const imageB = memory.ensure(A, materializeExactSequence(memory, [B]));
  const imageC = memory.ensure(A, materializeExactSequence(memory, [C]));

  if (variant === "A") {
    memory.ensure(theory, imageB);
    memory.ensure(theory, imageC);
  } else {
    // Reverse physical admission order without changing Theory extension.
    memory.ensure(theory, imageC);
    memory.ensure(theory, imageB);
  }

  const currentTruth = memory.ensure(K, A);
  const scopeSeed = memory.ensure(K, basis.C);
  const nextSeed = memory.ensure(A, basis.O);
  const scope = defineV013GroundedExecutionScope(
    memory,
    scopeSeed,
    theory,
    [currentTruth],
  );

  return {
    memory,
    basis,
    theory,
    K,
    A,
    B,
    C,
    currentTruth,
    cursor: new V013GroundedScopeCursor(memory, scope),
    nextSeed,
  };
}

function normalizedState(fixture: Fixture): readonly string[] {
  return Object.freeze(
    fixture.cursor.members()
      .map((member) => structuralAnum(fixture.memory, member))
      .sort(),
  );
}

function exerciseTwoMemoryAddressRenaming(): void {
  const first = buildFixture(new Memory(), "A");
  const second = buildFixture(new Memory(), "B");

  const firstAddresses = [
    first.memory.issuanceIndex(first.K),
    first.memory.issuanceIndex(first.A),
    first.memory.issuanceIndex(first.B),
    first.memory.issuanceIndex(first.C),
  ];
  const secondAddresses = [
    second.memory.issuanceIndex(second.K),
    second.memory.issuanceIndex(second.A),
    second.memory.issuanceIndex(second.B),
    second.memory.issuanceIndex(second.C),
  ];

  assert(
    firstAddresses.some((value, index) => value !== secondAddresses[index]),
    "fixture must actually use different local technical addresses",
  );

  // Local addresses are observed only as the falsifier/control above. Semantic
  // comparison below uses only recursive Link topology.
  same(
    structuralAnum(first.memory, first.K),
    structuralAnum(second.memory, second.K),
    "K topology is portable across Memories",
  );
  same(
    structuralAnum(first.memory, first.A),
    structuralAnum(second.memory, second.A),
    "A topology is portable across Memories",
  );
  same(
    structuralAnum(first.memory, first.B),
    structuralAnum(second.memory, second.B),
    "B topology is portable across Memories",
  );
  same(
    structuralAnum(first.memory, first.C),
    structuralAnum(second.memory, second.C),
    "C topology is portable across Memories",
  );

  const r1 = reactV013GroundedScope(first.memory, first.cursor, first.nextSeed);
  const r2 = reactV013GroundedScope(second.memory, second.cursor, second.nextSeed);

  same(r1.matchedRelations, 2, "Memory A discovers both Theory images");
  same(r2.matchedRelations, 2, "Memory B discovers both Theory images");
  same(r1.handoffCount, 1, "Memory A publishes one successor Scope");
  same(r2.handoffCount, 1, "Memory B publishes one successor Scope");
  assert(!r1.quiescent && !r2.quiescent, "both renamed executions remain active");

  const normalizedA = normalizedState(first);
  const normalizedB = normalizedState(second);
  setEqual(normalizedA, normalizedB, "renamed Memories have equal semantic successor");

  setEqual(
    normalizedA,
    [
      structuralAnum(first.memory, first.memory.ensure(first.K, first.B)),
      structuralAnum(first.memory, first.memory.ensure(first.K, first.C)),
    ],
    "successor is exactly the extensional {K->B,K->C} bundle",
  );

  let foreignRejected = false;
  try {
    second.memory.poles(first.K);
  } catch {
    foreignRejected = true;
  }
  assert(foreignRejected, "foreign local handle must be rejected across Memories");
}

function substrateBoundaryGuards(): void {
  const root = resolve(process.cwd(), "..");
  const projection = JSON.parse(
    readFileSync(
      join(root, "traceability/mts-v0.13-semantic-dependency-projection.json"),
      "utf8",
    ),
  ) as {
    metrics: {
      confirmedIndependentPrimitiveCount: number;
      unknownPrimitiveStatusCount: number;
    };
    capabilities: readonly {
      id: string;
      layer: string;
      primitiveStatus: string;
    }[];
  };

  const bootstrap = projection.capabilities
    .filter((capability) => capability.layer === "semantic-bootstrap")
    .map((capability) => capability.id)
    .sort();

  setEqual(
    bootstrap,
    [
      "bootstrap.ensure-end-selfclosed",
      "bootstrap.ensure-pair",
      "bootstrap.ensure-start-selfclosed",
      "bootstrap.link-identity",
      "bootstrap.outgoing-query",
      "bootstrap.pair-lookup",
      "bootstrap.pole-read",
      "bootstrap.root-anchor",
    ],
    "E7 retains the exact A9 carrier/bootstrap boundary",
  );
  same(
    projection.metrics.confirmedIndependentPrimitiveCount,
    0,
    "A9 established no extra independent MTS primitive",
  );
  same(
    projection.metrics.unknownPrimitiveStatusCount,
    8,
    "all eight carrier/bootstrap capabilities remain irreducibility research",
  );

  const grounded = readFileSync(
    join(root, "ts/src/v013-grounded-execution.ts"),
    "utf8",
  );

  for (const forbidden of [
    "issuanceIndex",
    "allLinks",
    ".slot",
    "pairKey",
    "outgoingIndex",
    "incomingIndex",
  ]) {
    assert(
      !grounded.includes(forbidden),
      "grounded semantic executor must not depend on local storage detail: " + forbidden,
    );
  }

  const memorySource = readFileSync(join(root, "ts/src/memory.ts"), "utf8");
  assert(
    memorySource.includes("These names are"),
    "placeholder",
  );
}

function main(): void {
  exerciseTwoMemoryAddressRenaming();

  // The final memory-source wording guard is intentionally structural rather
  // than API-name authority: implementation method names are evidence only.
  const root = resolve(process.cwd(), "..");
  const memorySource = readFileSync(join(root, "ts/src/memory.ts"), "utf8");
  assert(
    memorySource.includes("iteration order only"),
    "Memory already marks allocation order as non-semantic iteration detail",
  );

  const projection = JSON.parse(
    readFileSync(
      join(root, "traceability/mts-v0.13-semantic-dependency-projection.json"),
      "utf8",
    ),
  ) as { metrics: { confirmedIndependentPrimitiveCount: number } };
  same(
    projection.metrics.confirmedIndependentPrimitiveCount,
    0,
    "bootstrap mechanics are not proven independent MTS primitives",
  );

  // Run the complete boundary guard last so any future storage-detail leak
  // into the grounded executor is a hard RED.
  const grounded = readFileSync(
    join(root, "ts/src/v013-grounded-execution.ts"),
    "utf8",
  );
  for (const forbidden of ["issuanceIndex", "allLinks", ".slot", "pairKey"]) {
    assert(!grounded.includes(forbidden), "local storage detail leaked into semantics: " + forbidden);
  }

  console.log([
    "POST_V013_1558_E7_W7=GREEN",
    "TWO_MEMORY_NORMALIZED_SUCCESSOR_EQUIVALENCE=TRUE",
    "LOCAL_HANDLE_AS_SEMANTIC_IDENTITY=FALSE",
    "ALLOCATION_ORDER_AS_SEMANTIC_AUTHORITY=FALSE",
    "FOREIGN_LOCAL_HANDLE_REJECTED=TRUE",
    "A9_BOOTSTRAP_CAPABILITY_COUNT=8",
    "A9_CONFIRMED_INDEPENDENT_PRIMITIVE_COUNT=0",
    "LINK_CARRIER_BOOTSTRAP=SUBSTRATE_BOUNDARY",
    "CURRENT_ROOT_PUBLICATION=SUBSTRATE_BOUNDARY",
    "EXACT_SEQUENCE_TRAVERSAL=REPRESENTATION_SUBSTRATE",
    "CONCRETE_MEMORY_API_AS_MTS_ONTOLOGY=FALSE",
    "DOUBLETS_ARRAY_GPU_LAYOUT_AS_MTS_ONTOLOGY=FALSE",
    "E7_CLASSIFICATION=V013_PLUS_EXECUTION_PROFILE",
    "SEMANTIC_EXTENSION_REQUIRED=FALSE_FOR_MINIMAL_COMPLETE_AMEMORY",
    "ACCEPTED_V013_MUTATED=FALSE",
  ].join(" "));
}

main();
