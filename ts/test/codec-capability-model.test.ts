// #1583 post-v0.14 research/tooling classification; not semantic authority.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  materializeCanonicalByteSequence,
  readCanonicalByteSequence,
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

console.log(
  [
    "MTS #1583 R18:",
    `REPRESENTATIONS=${CODEC_CAPABILITY_MODEL.length}`,
    `CAPABILITIES=${CAPS.length}`,
    "MATRIX=TOTAL",
    "RECURSIVE_WIRE=GREEN",
    "EXACT_SEQUENCE=GREEN",
    "STRING_BYTES=GREEN",
    "Q14_EVIDENCE_REUSED=YES",
    "SEMANTIC_DELTA=NONE",
  ].join(" "),
);
