// #1583 R18/R19/R20 post-v0.14 representation research; not semantic authority.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  ByteCarrierError,
  materializeCanonicalByteSequence,
  readCanonicalByteSequence,
  textToUtf8Bytes,
  utf8BytesToText,
} from "../src/byte-carrier.js";
import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  materializeV013HierarchicalCarrier,
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

type Capability =
  | "TOTAL_ON_DECLARED_DOMAIN"
  | "INJECTIVE_IDENTITY"
  | "CANONICAL_FORM"
  | "SELF_DELIMITING"
  | "STREAMABLE"
  | "PREFIX_DECODABLE"
  | "EXACT_POSITION_IDENTITY"
  | "SELF_INCIDENCE_COVERAGE"
  | "SHARED_SUBSTRUCTURE_REUSE"
  | "GENERAL_CYCLE_COVERAGE"
  | "SELF_CONTAINED_TRANSPORT"
  | "CONTEXT_DEPENDENCE";

type CapabilityState =
  | "YES"
  | "NO"
  | "DOMAIN_RESTRICTED"
  | "NOT_APPLICABLE"
  | "OPEN";

type EvidenceGrade =
  | "EXECUTABLE"
  | "STRUCTURAL"
  | "DOCUMENTED"
  | "NONE";

interface CapabilityFact {
  readonly state: CapabilityState;
  readonly grade: EvidenceGrade;
  readonly note: string;
  readonly evidence: readonly string[];
}

interface RepresentationRecord {
  readonly id: string;
  readonly layer: string;
  readonly domain: string;
  readonly identityTarget: string;
  readonly alphabetOrCarrier: string;
  readonly context: string;
  readonly capabilities: Readonly<Record<Capability, CapabilityFact>>;
}

const CAPS = Object.freeze([
  "TOTAL_ON_DECLARED_DOMAIN",
  "INJECTIVE_IDENTITY",
  "CANONICAL_FORM",
  "SELF_DELIMITING",
  "STREAMABLE",
  "PREFIX_DECODABLE",
  "EXACT_POSITION_IDENTITY",
  "SELF_INCIDENCE_COVERAGE",
  "SHARED_SUBSTRUCTURE_REUSE",
  "GENERAL_CYCLE_COVERAGE",
  "SELF_CONTAINED_TRANSPORT",
  "CONTEXT_DEPENDENCE",
] as const satisfies readonly Capability[]);

const here = "ts/test/codec-capability-model.test.ts";

function fact(
  state: CapabilityState,
  grade: EvidenceGrade,
  note: string,
  ...evidence: string[]
): CapabilityFact {
  return Object.freeze({
    state,
    grade,
    note,
    evidence: Object.freeze(evidence),
  });
}

const recursiveEvidence = Object.freeze([
  here,
  "ts/test/v013-quaternary-canonicality.test.ts",
  "ts/test/v013-hierarchical-carrier-two-memory.test.ts",
] as const);

export const CODEC_CAPABILITY_MODEL = Object.freeze([
  Object.freeze({
    id: "recursive-link-prefix-8-9-6-1",
    layer: "recursive-link-structure",
    domain: "finite recursively decomposable Link structures under the verified root basis; arbitrary graph cycles excluded",
    identityTarget: "canonical Link structure",
    alphabetOrCarrier: "8=ROOT, 9=START, 6=END, 1=PAIR; S ::= 8 | 9 S | 6 S | 1 S S",
    context: "verified root basis plus the selected v0.14 Context orientation for START/END meaning",
    capabilities: Object.freeze({
      TOTAL_ON_DECLARED_DOMAIN: fact(
        "YES",
        "EXECUTABLE",
        "projection and wire materialization cover the declared finite recursive domain",
        ...recursiveEvidence,
      ),
      INJECTIVE_IDENTITY: fact(
        "YES",
        "EXECUTABLE",
        "canonical prefix spelling distinguishes canonical recursive Link structure on the declared domain",
        here,
        "ts/test/v013-quaternary-canonicality.test.ts",
      ),
      CANONICAL_FORM: fact(
        "YES",
        "EXECUTABLE",
        "the same semantic Link projects to the same canonical local carrier and canonical prefix wire",
        here,
        "ts/test/v013-quaternary-canonicality.test.ts",
      ),
      SELF_DELIMITING: fact(
        "YES",
        "STRUCTURAL",
        "ranked prefix arity determines one complete term without separators",
        "ts/src/v013-hierarchical-carrier.ts",
        "ts/test/research-v013-static-fixity-a7.test.ts",
      ),
      STREAMABLE: fact(
        "DOMAIN_RESTRICTED",
        "STRUCTURAL",
        "the grammar is single-pass streamable, but the current materializer intentionally validates the full Uint8Array before any representation write",
        "ts/src/v013-hierarchical-carrier.ts",
      ),
      PREFIX_DECODABLE: fact(
        "YES",
        "STRUCTURAL",
        "ROOT has arity 0, START/END arity 1 and PAIR arity 2, so prefix decoding has an intrinsic completion boundary",
        "ts/src/v013-hierarchical-carrier.ts",
      ),
      EXACT_POSITION_IDENTITY: fact(
        "NOT_APPLICABLE",
        "NONE",
        "this codec identifies one recursive Link structure, not an ordered sequence carrier",
      ),
      SELF_INCIDENCE_COVERAGE: fact(
        "YES",
        "EXECUTABLE",
        "ROOT/START/END/PAIR directly cover the four accepted local self-incidence cases",
        "ts/test/v013-aspect-foundation-theorem.test.ts",
      ),
      SHARED_SUBSTRUCTURE_REUSE: fact(
        "DOMAIN_RESTRICTED",
        "EXECUTABLE",
        "local materialization reuses canonical subcarrier Links, while the flat prefix wire has no explicit back-reference token",
        "ts/test/v013-generic-semantic-carrier-shared-dag.test.ts",
        "ts/src/v013-hierarchical-carrier.ts",
      ),
      GENERAL_CYCLE_COVERAGE: fact(
        "NO",
        "EXECUTABLE",
        "general recursive cycles are rejected; accepted self-incidence forms are handled separately",
        "ts/test/v013-memory-cycle-boundary.test.ts",
        "ts/src/v013-hierarchical-carrier.ts",
      ),
      SELF_CONTAINED_TRANSPORT: fact(
        "DOMAIN_RESTRICTED",
        "EXECUTABLE",
        "canonical prefix bytes reconstruct the recursive carrier across Memories under the shared root-basis interpretation, but do not carry arbitrary graph back-references",
        "ts/test/v013-hierarchical-carrier-two-memory.test.ts",
      ),
      CONTEXT_DEPENDENCE: fact(
        "YES",
        "DOCUMENTED",
        "v0.14 interprets START/END relative to the selected Context orientation; the physical 9/6 spelling is not an absolute pole ontology",
        "contracts/mts-contract-v0.14.json",
        "ts/test/v014-post-n20c-independent-readiness-audit.test.ts",
      ),
    }),
  }),
  Object.freeze({
    id: "exact-sequence",
    layer: "sequence-carrier",
    domain: "finite ordered sequences of Link identities in one Memory",
    identityTarget: "exact ordered positional sequence",
    alphabetOrCarrier: "Cell(prev,value)=START(prev->value), terminated by R",
    context: "Memory-local Link identities; no semantic interpreter required for sequence identity",
    capabilities: Object.freeze({
      TOTAL_ON_DECLARED_DOMAIN: fact(
        "YES",
        "EXECUTABLE",
        "every finite local Link sequence can be materialized and read back",
        here,
        "ts/src/exact-sequence.ts",
      ),
      INJECTIVE_IDENTITY: fact(
        "YES",
        "EXECUTABLE",
        "different positional sequences remain different carrier identities even when another fold could share a denotation",
        here,
        "ts/test/v013-root-origin-law.test.ts",
      ),
      CANONICAL_FORM: fact(
        "YES",
        "EXECUTABLE",
        "repeated materialization of the same local value sequence converges through canonical Link construction",
        here,
        "ts/src/exact-sequence.ts",
      ),
      SELF_DELIMITING: fact(
        "YES",
        "STRUCTURAL",
        "the predecessor chain terminates structurally at R; no host length participates in identity",
        "ts/src/exact-sequence.ts",
      ),
      STREAMABLE: fact(
        "DOMAIN_RESTRICTED",
        "STRUCTURAL",
        "the topology supports append by one Cell, while the current public helper accepts a complete host sequence",
        "ts/src/exact-sequence.ts",
      ),
      PREFIX_DECODABLE: fact(
        "NOT_APPLICABLE",
        "NONE",
        "ExactSequence currently defines a Link carrier rather than an external prefix wire format",
      ),
      EXACT_POSITION_IDENTITY: fact(
        "YES",
        "EXECUTABLE",
        "position is carried by distinct recursive Cells, including repeated equal values",
        here,
        "ts/test/v09-byte-carrier.test.ts",
      ),
      SELF_INCIDENCE_COVERAGE: fact(
        "DOMAIN_RESTRICTED",
        "STRUCTURAL",
        "arbitrary local Links may occur as values, but their recursive topology is referenced rather than serialized inside the sequence carrier",
        "ts/src/exact-sequence.ts",
      ),
      SHARED_SUBSTRUCTURE_REUSE: fact(
        "YES",
        "STRUCTURAL",
        "repeated values reuse their Link identities while positional Cell identities remain distinct",
        "ts/src/exact-sequence.ts",
      ),
      GENERAL_CYCLE_COVERAGE: fact(
        "DOMAIN_RESTRICTED",
        "STRUCTURAL",
        "the carrier spine itself is an acyclic R-terminated chain; value Links may have richer local topology outside the carrier",
        "ts/src/exact-sequence.ts",
      ),
      SELF_CONTAINED_TRANSPORT: fact(
        "NO",
        "STRUCTURAL",
        "a raw final handle plus local value handles is not a self-contained cross-Memory wire representation",
        "ts/src/exact-sequence.ts",
      ),
      CONTEXT_DEPENDENCE: fact(
        "NO",
        "STRUCTURAL",
        "exact sequence identity is structural and does not require Dictionary/Grammar/Theory interpretation",
        "ts/src/exact-sequence.ts",
      ),
    }),
  }),
  Object.freeze({
    id: "q14-source-interpreter",
    layer: "sequence-codec-interpreter",
    domain: "well-formed Q14 source over [ ] T F under the versioned rooted stack interpreter",
    identityTarget: "Q14 sequence denotation under the selected StackAlgebra",
    alphabetOrCarrier: "[, ], T, F",
    context: "Q14 version plus selected StackAlgebra/interpreter",
    capabilities: Object.freeze({
      TOTAL_ON_DECLARED_DOMAIN: fact(
        "YES",
        "EXECUTABLE",
        "all well-formed Q14 signs have deterministic versioned execution",
        "ts/test/v014-q14-versioned-interpreter.test.ts",
      ),
      INJECTIVE_IDENTITY: fact(
        "NO",
        "EXECUTABLE",
        "distinct normalized Q14 forms can share the same denotation; empty source and [] both denote R",
        here,
        "ts/test/v014-q14-versioned-interpreter.test.ts",
      ),
      CANONICAL_FORM: fact(
        "DOMAIN_RESTRICTED",
        "EXECUTABLE",
        "raw whitespace/comments normalize to one token spelling, but that spelling is not a canonical one-to-one semantic denotation code",
        "ts/test/v014-q14-versioned-interpreter.test.ts",
      ),
      SELF_DELIMITING: fact(
        "DOMAIN_RESTRICTED",
        "STRUCTURAL",
        "nested bracket groups are delimited; the top-level sequence still uses source termination as its outer boundary",
        "ts/test/v014-q14-versioned-interpreter.test.ts",
      ),
      STREAMABLE: fact(
        "YES",
        "EXECUTABLE",
        "IncrementalV014QDecoder commits valid chunks transactionally",
        here,
        "ts/test/v014-q14-versioned-interpreter.test.ts",
      ),
      PREFIX_DECODABLE: fact(
        "DOMAIN_RESTRICTED",
        "EXECUTABLE",
        "tokens decode incrementally, while semantic completion of an open nested frame requires its closing sign or final source validation",
        "ts/test/v014-q14-versioned-interpreter.test.ts",
      ),
      EXACT_POSITION_IDENTITY: fact(
        "NO",
        "EXECUTABLE",
        "Q14 is an interpreter/codec for denotation, not the exact positional identity carrier guaranteed by ExactSequence",
        "docs/specs/Ачисла и сериализация.md",
        "ts/test/v014-q14-versioned-interpreter.test.ts",
      ),
      SELF_INCIDENCE_COVERAGE: fact(
        "NO",
        "EXECUTABLE",
        "the current Q14 value alphabet selects L/U and rooted nesting; it is not the recursive ROOT/START/END/PAIR codec",
        "contracts/mts-contract-v0.14.json",
        "ts/test/v014-release-cutover-a75.test.ts",
      ),
      SHARED_SUBSTRUCTURE_REUSE: fact(
        "NO",
        "STRUCTURAL",
        "Q14 source has no graph reference/back-reference construct",
        "ts/test/v014-q14-versioned-interpreter.test.ts",
      ),
      GENERAL_CYCLE_COVERAGE: fact(
        "NO",
        "STRUCTURAL",
        "stack execution constructs rooted finite sequence denotations and exposes no recursive graph-cycle syntax",
        "ts/test/v014-q14-versioned-interpreter.test.ts",
      ),
      SELF_CONTAINED_TRANSPORT: fact(
        "NO",
        "DOCUMENTED",
        "source tokens require the selected versioned interpreter/StackAlgebra to acquire denotation",
        "docs/specs/Ачисла и сериализация.md",
        "ts/test/v014-q14-versioned-interpreter.test.ts",
      ),
      CONTEXT_DEPENDENCE: fact(
        "YES",
        "EXECUTABLE",
        "the same source alphabet has meaning only through the selected Q14 interpreter algebra",
        "ts/test/v014-q14-versioned-interpreter.test.ts",
      ),
    }),
  }),
  Object.freeze({
    id: "canonical-string-exact-bytes",
    layer: "byte-text-carrier",
    domain: "finite exact byte sequences; UTF-8 is a separate optional interpretation above byte identity",
    identityTarget: "exact ordered bytes",
    alphabetOrCarrier: "ExactSequence of canonical Byte(p) Links",
    context: "byte identity is interpretation-independent; UTF-8 decoding is an explicit upper layer",
    capabilities: Object.freeze({
      TOTAL_ON_DECLARED_DOMAIN: fact(
        "YES",
        "EXECUTABLE",
        "every Uint8Array has a canonical byte-sequence carrier",
        here,
        "ts/test/v09-byte-carrier.test.ts",
      ),
      INJECTIVE_IDENTITY: fact(
        "YES",
        "EXECUTABLE",
        "exact byte sequences round-trip without Unicode normalization",
        here,
        "ts/test/v013-v012-utf8-carrier-parity.test.ts",
      ),
      CANONICAL_FORM: fact(
        "YES",
        "EXECUTABLE",
        "Byte(p) and the enclosing exact sequence converge through canonical structural materialization",
        here,
        "ts/test/v09-byte-carrier.test.ts",
      ),
      SELF_DELIMITING: fact(
        "NOT_APPLICABLE",
        "NONE",
        "this record classifies the Link carrier; no standalone byte-wire framing is claimed here",
      ),
      STREAMABLE: fact(
        "DOMAIN_RESTRICTED",
        "STRUCTURAL",
        "byte values are independently canonical, but the current helper materializes the complete exact sequence from a Uint8Array",
        "ts/src/byte-carrier.ts",
      ),
      PREFIX_DECODABLE: fact(
        "NOT_APPLICABLE",
        "NONE",
        "no external prefix framing is claimed for the canonical STRING Link carrier",
      ),
      EXACT_POSITION_IDENTITY: fact(
        "YES",
        "EXECUTABLE",
        "repeated equal bytes remain distinct occurrences through ExactSequence Cells",
        here,
        "ts/test/v09-byte-carrier.test.ts",
      ),
      SELF_INCIDENCE_COVERAGE: fact(
        "NOT_APPLICABLE",
        "NONE",
        "STRING owns exact byte identity, not arbitrary recursive Link topology",
      ),
      SHARED_SUBSTRUCTURE_REUSE: fact(
        "YES",
        "EXECUTABLE",
        "equal bytes reuse canonical Byte(p) Links while sequence positions stay distinct",
        here,
        "ts/test/v09-byte-carrier.test.ts",
      ),
      GENERAL_CYCLE_COVERAGE: fact(
        "NOT_APPLICABLE",
        "NONE",
        "byte sequence identity has no graph-cycle requirement",
      ),
      SELF_CONTAINED_TRANSPORT: fact(
        "DOMAIN_RESTRICTED",
        "STRUCTURAL",
        "external exact bytes are portable, while the Link carrier reconstruction still assumes the canonical byte/root-basis definition",
        "ts/src/byte-carrier.ts",
      ),
      CONTEXT_DEPENDENCE: fact(
        "NO",
        "EXECUTABLE",
        "exact bytes define STRING identity before UTF-8 or other textual interpretation",
        "ts/test/v013-v012-utf8-carrier-parity.test.ts",
        "ts/src/byte-carrier.ts",
      ),
    }),
  }),
] as const satisfies readonly RepresentationRecord[]);

type TransformationClass =
  | "EXACT_ISOMORPHISM"
  | "EXACT_ON_SUBDOMAIN"
  | "CANONICAL_QUOTIENT"
  | "LOSSY_WITH_EXPLICIT_CONTEXT"
  | "PARTIAL_OVERLAP"
  | "INCOMPARABLE"
  | "OPEN";

type InverseAvailability =
  | "AVAILABLE"
  | "AUTHORITY_GATED"
  | "PARTIAL"
  | "NONE"
  | "OPEN";

interface TransformationRelation {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly relation: TransformationClass;
  readonly preservedIdentity: string;
  readonly lostOrRestricted: string;
  readonly requiredContext: string;
  readonly inverse: InverseAvailability;
  readonly evidence: readonly string[];
}

export const TRANSFORMATION_RELATIONS = Object.freeze([
  Object.freeze({
    id: "recursive-carrier-prefix-wire",
    from: "quoted recursive Link carrier",
    to: "8/9/6/1 prefix wire",
    relation: "EXACT_ISOMORPHISM",
    preservedIdentity: "canonical recursive carrier topology on the declared finite domain",
    lostOrRestricted: "general graph cycles remain outside the declared domain",
    requiredContext: "verified root basis",
    inverse: "AVAILABLE",
    evidence: Object.freeze([
      here,
      "ts/src/v013-hierarchical-carrier.ts",
      "ts/test/v013-file-wire-conformance.test.ts",
    ]),
  }),
  Object.freeze({
    id: "semantic-link-recursive-wire",
    from: "finite semantic Link topology",
    to: "recursive quoted carrier / prefix wire",
    relation: "EXACT_ON_SUBDOMAIN",
    preservedIdentity: "recursive ROOT/START/END/PAIR topology",
    lostOrRestricted: "the representation parser is not authorized to materialize the semantic target",
    requiredContext: "verified root basis and semantic materialization authority for the inverse",
    inverse: "AUTHORITY_GATED",
    evidence: Object.freeze([
      here,
      "ts/src/v013-hierarchical-carrier.ts",
      "ts/test/v013-hierarchical-carrier-two-memory.test.ts",
    ]),
  }),
  Object.freeze({
    id: "exact-sequence-rooted-fold",
    from: "ExactSequence positional identity",
    to: "rooted left-fold Link denotation",
    relation: "CANONICAL_QUOTIENT",
    preservedIdentity: "fold denotation only",
    lostOrRestricted: "different exact position sequences may collapse to the same Link",
    requiredContext: "chosen fold operation; witness uses ordinary Link formation from R",
    inverse: "NONE",
    evidence: Object.freeze([
      here,
      "ts/test/v013-dual-encoding-boundary.test.ts",
    ]),
  }),
  Object.freeze({
    id: "q14-raw-normalized-source",
    from: "raw Q14 source",
    to: "normalized Q14 token source",
    relation: "CANONICAL_QUOTIENT",
    preservedIdentity: "ordered Q14 signs",
    lostOrRestricted: "whitespace, comments and exact textual source spelling",
    requiredContext: "Q14 lexical version",
    inverse: "NONE",
    evidence: Object.freeze([
      here,
      "ts/test/v014-q14-versioned-interpreter.test.ts",
    ]),
  }),
  Object.freeze({
    id: "q14-normalized-source-denotation",
    from: "normalized Q14 token source",
    to: "Q14 StackAlgebra denotation",
    relation: "CANONICAL_QUOTIENT",
    preservedIdentity: "selected sequence denotation",
    lostOrRestricted: "source distinctions such as epsilon versus [] may collapse",
    requiredContext: "selected Q14 StackAlgebra/interpreter",
    inverse: "NONE",
    evidence: Object.freeze([
      here,
      "ts/test/v014-q14-versioned-interpreter.test.ts",
    ]),
  }),
  Object.freeze({
    id: "exact-bytes-canonical-string-carrier",
    from: "finite exact byte sequence",
    to: "canonical STRING Link carrier",
    relation: "EXACT_ISOMORPHISM",
    preservedIdentity: "ordered exact bytes including repeated occurrences",
    lostOrRestricted: "none inside the declared byte-carrier domain",
    requiredContext: "canonical Byte(p) and ExactSequence structural definitions",
    inverse: "AVAILABLE",
    evidence: Object.freeze([
      here,
      "ts/src/byte-carrier.ts",
      "ts/test/v09-byte-carrier.test.ts",
    ]),
  }),
  Object.freeze({
    id: "exact-bytes-utf8-text",
    from: "finite exact byte sequence",
    to: "UTF-8 text interpretation",
    relation: "EXACT_ON_SUBDOMAIN",
    preservedIdentity: "exact bytes for valid UTF-8 text",
    lostOrRestricted: "malformed UTF-8 bytes have no text image",
    requiredContext: "strict UTF-8 interpreter; no normalization",
    inverse: "PARTIAL",
    evidence: Object.freeze([
      here,
      "ts/src/byte-carrier.ts",
      "ts/test/v013-v012-utf8-carrier-parity.test.ts",
    ]),
  }),
] as const satisfies readonly TransformationRelation[]);

type RandomAccessShape =
  | "TREE_TRAVERSAL"
  | "PREDECESSOR_CHAIN"
  | "SEQUENTIAL_TOKEN_STREAM"
  | "FLAT_BYTES_EXTERNAL_CHAIN_INTERNAL";

type CanonicalizationMode =
  | "STRUCTURAL_BY_CONSTRUCTION"
  | "POSITIONAL_BY_CONSTRUCTION"
  | "LEXICAL_NORMALIZATION"
  | "EXACT_BYTES_BY_CONSTRUCTION";

type SharingBehavior =
  | "WIRE_TREE_EXPANSION"
  | "VALUE_REUSE_POSITION_CELLS"
  | "NO_REFERENCE_SYNTAX"
  | "BYTE_VALUE_REUSE_POSITION_CELLS";

type TransportDependencies =
  | "ROOT_BASIS"
  | "VALUE_CODEC_REQUIRED"
  | "Q14_INTERPRETER_AND_ALGEBRA"
  | "BYTE_DEFINITION_FOR_LINK_CARRIER";

type GpuAccessShape =
  | "TREE_STACK"
  | "POINTER_CHAIN"
  | "STACK_SEQUENTIAL"
  | "FLAT_BYTE_STREAM_PLUS_POSITION_CHAIN";

interface CostShapeProfile {
  readonly representation: string;
  readonly randomAccess: RandomAccessShape;
  readonly canonicalization: CanonicalizationMode;
  readonly sharing: SharingBehavior;
  readonly transportDependencies: TransportDependencies;
  readonly gpuAccessShape: GpuAccessShape;
}

export const COST_SHAPE_PROFILES = Object.freeze([
  Object.freeze({
    representation: "recursive-link-prefix-8-9-6-1",
    randomAccess: "TREE_TRAVERSAL",
    canonicalization: "STRUCTURAL_BY_CONSTRUCTION",
    sharing: "WIRE_TREE_EXPANSION",
    transportDependencies: "ROOT_BASIS",
    gpuAccessShape: "TREE_STACK",
  }),
  Object.freeze({
    representation: "exact-sequence",
    randomAccess: "PREDECESSOR_CHAIN",
    canonicalization: "POSITIONAL_BY_CONSTRUCTION",
    sharing: "VALUE_REUSE_POSITION_CELLS",
    transportDependencies: "VALUE_CODEC_REQUIRED",
    gpuAccessShape: "POINTER_CHAIN",
  }),
  Object.freeze({
    representation: "q14-source-interpreter",
    randomAccess: "SEQUENTIAL_TOKEN_STREAM",
    canonicalization: "LEXICAL_NORMALIZATION",
    sharing: "NO_REFERENCE_SYNTAX",
    transportDependencies: "Q14_INTERPRETER_AND_ALGEBRA",
    gpuAccessShape: "STACK_SEQUENTIAL",
  }),
  Object.freeze({
    representation: "canonical-string-exact-bytes",
    randomAccess: "FLAT_BYTES_EXTERNAL_CHAIN_INTERNAL",
    canonicalization: "EXACT_BYTES_BY_CONSTRUCTION",
    sharing: "BYTE_VALUE_REUSE_POSITION_CELLS",
    transportDependencies: "BYTE_DEFINITION_FOR_LINK_CARRIER",
    gpuAccessShape: "FLAT_BYTE_STREAM_PLUS_POSITION_CHAIN",
  }),
] as const satisfies readonly CostShapeProfile[]);

interface CostObservation {
  readonly id: string;
  readonly workload: string;
  readonly preservedIdentityContract: string;
  readonly sourceUnits: number;
  readonly decodeSteps: number;
  readonly materializedPositionCells: number;
  readonly structuralDepth: number;
  readonly uniqueSemanticNodes: number;
  readonly expandedWireNodes: number;
}

type CostOrder =
  | "LEFT_DOMINATES"
  | "RIGHT_DOMINATES"
  | "EQUAL"
  | "TRADEOFF"
  | "INCOMPARABLE_REQUIREMENTS";

function compareCost(left: CostObservation, right: CostObservation): CostOrder {
  if (
    left.workload !== right.workload ||
    left.preservedIdentityContract !== right.preservedIdentityContract
  ) {
    return "INCOMPARABLE_REQUIREMENTS";
  }

  const keys = Object.freeze([
    "sourceUnits",
    "decodeSteps",
    "materializedPositionCells",
    "structuralDepth",
    "uniqueSemanticNodes",
    "expandedWireNodes",
  ] as const);

  let leftBetter = false;
  let rightBetter = false;
  for (const key of keys) {
    if (left[key] < right[key]) leftBetter = true;
    if (right[key] < left[key]) rightBetter = true;
  }
  if (!leftBetter && !rightBetter) return "EQUAL";
  if (leftBetter && !rightBetter) return "LEFT_DOMINATES";
  if (rightBetter && !leftBetter) return "RIGHT_DOMINATES";
  return "TRADEOFF";
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`codec capability model: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} != ${String(expected)}`);
}

function sameHandles(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.length, expected.length, `${message} length`);
  for (let i = 0; i < actual.length; i += 1) {
    same(actual[i], expected[i], `${message}[${i}]`);
  }
}

const repositoryRoot = resolve(process.cwd(), "..");

// Matrix shape is total: every representation has one explicit state for every
// capability. Non-claims stay OPEN/NOT_APPLICABLE instead of becoming guesses.
{
  const ids = new Set<string>();
  for (const representation of CODEC_CAPABILITY_MODEL) {
    assert(!ids.has(representation.id), `duplicate representation id ${representation.id}`);
    ids.add(representation.id);

    same(
      Object.keys(representation.capabilities).length,
      CAPS.length,
      `${representation.id} capability count`,
    );

    for (const capability of CAPS) {
      const value = representation.capabilities[capability];
      assert(value !== undefined, `${representation.id} missing ${capability}`);

      if (value.state === "OPEN" || value.state === "NOT_APPLICABLE") {
        assert(
          value.grade === "NONE" || value.evidence.length > 0,
          `${representation.id}/${capability} unresolved cell has inconsistent evidence grade`,
        );
      } else {
        assert(
          value.grade !== "NONE",
          `${representation.id}/${capability} positive/negative claim needs evidence grade`,
        );
        assert(
          value.evidence.length > 0,
          `${representation.id}/${capability} positive/negative claim needs evidence path`,
        );
      }

      for (const path of value.evidence) {
        assert(existsSync(join(repositoryRoot, path)), `missing evidence path: ${path}`);
      }
    }
  }
}

// Minimal lattice invariant: full prefix decoding is a stronger streaming claim.
for (const representation of CODEC_CAPABILITY_MODEL) {
  const prefix = representation.capabilities.PREFIX_DECODABLE.state;
  const streaming = representation.capabilities.STREAMABLE.state;
  if (prefix === "YES") {
    assert(
      streaming === "YES" || streaming === "DOMAIN_RESTRICTED",
      `${representation.id}: PREFIX_DECODABLE requires STREAMABLE support`,
    );
  }
}

// Direct executable witness: accepted recursive structural representatives have
// the expected canonical wire and repeated projection is canonical.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const expected = Object.freeze([
    [basis.R, "8"],
    [basis.O, "98"],
    [basis.C, "68"],
    [basis.L, "19868"],
    [basis.U, "16898"],
  ] as const);

  for (const [semantic, wire] of expected) {
    const first = materializeV013HierarchicalCarrierFromSemanticLink(memory, basis, semantic);
    const second = materializeV013HierarchicalCarrierFromSemanticLink(memory, basis, semantic);
    same(first, second, `recursive carrier canonicality ${wire}`);
    same(
      new TextDecoder().decode(serializeV013HierarchicalCarrier(memory, basis, first)),
      wire,
      `recursive wire ${wire}`,
    );
  }
}

// Direct executable witness: ExactSequence identity is positional and canonical.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const values = Object.freeze([basis.R, basis.L, basis.R]);

  const first = materializeExactSequence(memory, values);
  const second = materializeExactSequence(memory, values);
  same(first, second, "ExactSequence canonical repeated materialization");
  sameHandles(readExactSequence(memory, first).values, values, "ExactSequence round-trip");

  const oneRoot = materializeExactSequence(memory, [basis.R]);
  const twoRoots = materializeExactSequence(memory, [basis.R, basis.R]);
  assert(oneRoot !== twoRoots, "ExactSequence preserves repeated-position identity");
}

// Direct executable witness: canonical STRING carrier preserves exact bytes and
// reuses byte identities without collapsing occurrence positions.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const bytes = Uint8Array.from([0, 255, 65, 0]);

  const first = materializeCanonicalByteSequence(memory, basis, bytes);
  const second = materializeCanonicalByteSequence(memory, basis, bytes);
  same(first, second, "canonical STRING repeated materialization");

  const decoded = readCanonicalByteSequence(memory, basis, first);
  same(decoded.bytes.length, bytes.length, "STRING byte length");
  for (let i = 0; i < bytes.length; i += 1) {
    same(decoded.bytes[i], bytes[i], `STRING byte[${i}]`);
  }
  same(decoded.byteLinks[0], decoded.byteLinks[3], "equal bytes reuse Byte(p) identity");
  assert(decoded.cells[0] !== decoded.cells[3], "equal bytes keep distinct occurrence cells");
}

// Q14's existing executable witness is intentionally reused instead of copying
// another interpreter into this test. These source-level checks make two matrix
// facts explicit: incremental decoding exists, and denotation is non-injective.
{
  const q14 = readFileSync(
    join(repositoryRoot, "ts/test/v014-q14-versioned-interpreter.test.ts"),
    "utf8",
  );
  assert(q14.includes("export class IncrementalV014QDecoder"), "Q14 incremental decoder evidence");
  assert(q14.includes('["", "R"]'), "Q14 empty-source R vector");
  assert(q14.includes('["[]", "R"]'), "Q14 empty-nested R vector");
  assert(
    q14.includes("transcode preserves denotation, not exact source identity"),
    "Q14 source identity boundary",
  );
}

// R19 relation table is also total over its declared edges and every edge has
// preserved/lost identity stated explicitly instead of implied by a codec name.
{
  const ids = new Set<string>();
  for (const relation of TRANSFORMATION_RELATIONS) {
    assert(!ids.has(relation.id), `duplicate transformation relation ${relation.id}`);
    ids.add(relation.id);
    assert(relation.evidence.length > 0, `${relation.id}: evidence required`);
    for (const path of relation.evidence) {
      assert(existsSync(join(repositoryRoot, path)), `missing relation evidence: ${path}`);
    }
    if (relation.relation === "EXACT_ISOMORPHISM") {
      same(relation.inverse, "AVAILABLE", `${relation.id}: exact isomorphism inverse`);
    }
  }
}

// Recursive quoted carrier <-> prefix wire is an actual round-trip on the
// declared recursive domain. This does NOT grant semantic target authority.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const left = memory.ensureStartSelfClosed(basis.C);
  const right = memory.ensureEndSelfClosed(basis.O);
  const semantic = memory.ensure(left, right);

  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(memory, basis, semantic);
  const wire = serializeV013HierarchicalCarrier(memory, basis, carrier);
  const rebuilt = materializeV013HierarchicalCarrier(memory, basis, wire);
  same(rebuilt, carrier, "recursive carrier/wire exact round-trip");

  const source = readFileSync(
    join(repositoryRoot, "ts/src/v013-hierarchical-carrier.ts"),
    "utf8",
  );
  assert(
    source.includes("This parser has no authority to materialize the semantic Link described"),
    "recursive wire inverse remains semantic-authority gated",
  );
}

// ExactSequence -> rooted Link fold is a quotient, not an identity-preserving
// inverse. [] and [R] are distinct exact sequences but both fold to R.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  const empty = materializeExactSequence(memory, []);
  const oneRoot = materializeExactSequence(memory, [basis.R]);
  assert(empty !== oneRoot, "exact [] and [R] carrier identities differ");

  const fold = (values: readonly LinkHandle[]): LinkHandle => {
    let current = basis.R;
    for (const value of values) current = memory.ensure(current, value);
    return current;
  };

  same(fold([]), basis.R, "empty rooted fold");
  same(fold([basis.R]), basis.R, "[R] rooted fold collision");
}

// Exact bytes <-> canonical STRING carrier is exact on its declared byte domain.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const vectors = Object.freeze([
    Uint8Array.from([]),
    Uint8Array.from([0]),
    Uint8Array.from([0, 255, 0, 65]),
  ]);

  for (const bytes of vectors) {
    const carrier = materializeCanonicalByteSequence(memory, basis, bytes);
    const decoded = readCanonicalByteSequence(memory, basis, carrier).bytes;
    same(decoded.length, bytes.length, "STRING relation byte length");
    for (let i = 0; i < bytes.length; i += 1) {
      same(decoded[i], bytes[i], `STRING relation byte[${i}]`);
    }
  }
}

// UTF-8 is an exact inverse only on the valid UTF-8 subdomain. Malformed bytes
// remain legitimate exact bytes below the text interpretation boundary.
{
  const text = "A∞🙂";
  const bytes = textToUtf8Bytes(text);
  same(utf8BytesToText(bytes), text, "strict UTF-8 valid subdomain round-trip");

  try {
    utf8BytesToText(Uint8Array.from([0xff]));
    throw new Error("codec capability model: malformed UTF-8 must reject");
  } catch (error) {
    assert(error instanceof ByteCarrierError, "malformed UTF-8 rejection type");
    same(error.code, "invalid-utf8", "malformed UTF-8 rejection code");
  }
}

// Reuse Q14's existing executable witness rather than adding another parser.
// It proves both raw-source canonicalization and denotation collision.
{
  const q14 = readFileSync(
    join(repositoryRoot, "ts/test/v014-q14-versioned-interpreter.test.ts"),
    "utf8",
  );
  assert(q14.includes("Q14 raw normalization"), "Q14 raw->normalized quotient evidence");
  assert(q14.includes('["", "R"]'), "Q14 epsilon denotation evidence");
  assert(q14.includes('["[]", "R"]'), "Q14 [] denotation collision evidence");
}

// R20: cost is a vector under an explicit preservation contract, never a
// universal scalar score. A shorter source cannot dominate a stronger carrier.
{
  same(COST_SHAPE_PROFILES.length, CODEC_CAPABILITY_MODEL.length, "cost profile coverage");
  const profileIds = new Set(COST_SHAPE_PROFILES.map((profile) => profile.representation));
  for (const representation of CODEC_CAPABILITY_MODEL) {
    assert(profileIds.has(representation.id), `missing cost profile for ${representation.id}`);
  }

  const q14L: CostObservation = Object.freeze({
    id: "q14-L",
    workload: "represent-L",
    preservedIdentityContract: "Q14_DENOTATION",
    sourceUnits: 1,
    decodeSteps: 1,
    materializedPositionCells: 0,
    structuralDepth: 0,
    uniqueSemanticNodes: 1,
    expandedWireNodes: 1,
  });
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const recursiveLWire = serializeV013HierarchicalCarrier(
    memory,
    basis,
    materializeV013HierarchicalCarrierFromSemanticLink(memory, basis, basis.L),
  );
  const recursiveL: CostObservation = Object.freeze({
    id: "recursive-L",
    workload: "represent-L",
    preservedIdentityContract: "RECURSIVE_LINK_TOPOLOGY",
    sourceUnits: recursiveLWire.length,
    decodeSteps: recursiveLWire.length,
    materializedPositionCells: 0,
    structuralDepth: 2,
    uniqueSemanticNodes: 4,
    expandedWireNodes: recursiveLWire.length,
  });
  same(q14L.sourceUnits, 1, "Q14 L compact source");
  same(recursiveL.sourceUnits, 5, "recursive L topology source");
  same(
    compareCost(q14L, recursiveL),
    "INCOMPARABLE_REQUIREMENTS",
    "compact Q14 cannot globally dominate stronger recursive topology contract",
  );
}

// Reference-free recursive prefix transport expands shared DAGs. Semantic growth
// is one new canonical Link per level; the tree wire duplicates both branches.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let current = basis.U;
  const lengths: number[] = [];

  for (let depth = 0; depth <= 8; depth += 1) {
    const carrier = materializeV013HierarchicalCarrierFromSemanticLink(memory, basis, current);
    const wire = serializeV013HierarchicalCarrier(memory, basis, carrier);
    const expected = 6 * (2 ** depth) - 1;
    same(wire.length, expected, `shared-DAG recursive wire depth ${depth}`);
    lengths.push(wire.length);
    if (depth < 8) current = memory.ensure(current, current);
  }

  assert(lengths[8]! > 100 * 8, "shared-DAG wire expansion is decisively superlinear");
}

// ExactSequence scales one positional Cell per occurrence while equal values
// keep one canonical value identity.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  for (const length of [0, 1, 2, 4, 8]) {
    const values = Array.from({ length }, () => basis.L);
    const carrier = materializeExactSequence(memory, values);
    const read = readExactSequence(memory, carrier);
    same(read.values.length, length, `ExactSequence values n=${length}`);
    same(read.cells.length, length, `ExactSequence position cells n=${length}`);
    if (length > 0) {
      same(new Set(read.values).size, 1, `ExactSequence shared value identity n=${length}`);
    }
  }
}

// STRING external transport is linear in exact bytes. Internal positional Cells
// are also linear, while repeated equal bytes reuse canonical Byte(p) identity.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  for (const length of [0, 1, 2, 4, 8]) {
    const bytes = Uint8Array.from(Array.from({ length }, () => 0x41));
    const carrier = materializeCanonicalByteSequence(memory, basis, bytes);
    const read = readCanonicalByteSequence(memory, basis, carrier);
    same(read.bytes.length, length, `STRING external source units n=${length}`);
    same(read.cells.length, length, `STRING position cells n=${length}`);
    if (length > 0) {
      same(new Set(read.byteLinks).size, 1, `STRING shared Byte(p) identity n=${length}`);
    }
  }
}

// The old bounded comparison remains useful evidence that generic recursive wire
// cost and specialized transport cost must not be collapsed into one score.
{
  const comparison = readFileSync(
    join(repositoryRoot, "ts/test/v013-codec-comparison.test.ts"),
    "utf8",
  );
  assert(comparison.includes("shared-DAG"), "existing shared-DAG cost witness retained");
  assert(comparison.includes("v012PhysicalBytes"), "existing specialized STRING cost witness retained");
}

console.log(
  [
    "MTS #1583 R18/R19/R20:",
    `REPRESENTATIONS=${CODEC_CAPABILITY_MODEL.length}`,
    `CAPABILITIES=${CAPS.length}`,
    `RELATIONS=${TRANSFORMATION_RELATIONS.length}`,
    `COST_PROFILES=${COST_SHAPE_PROFILES.length}`,
    "COST_ORDER=PARTIAL",
    "GLOBAL_SCALAR_SCORE=FORBIDDEN",
    "SHARED_DAG_EXPANSION=GREEN",
    "POSITIONAL_LINEARITY=GREEN",
    "STRING_LINEARITY=GREEN",
    "SEMANTIC_DELTA=NONE",
  ].join(" "),
);
