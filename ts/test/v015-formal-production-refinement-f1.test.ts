import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  materializeNativeSyntaxGrammar,
  type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
import {
  compileV015DirectFormalSourceAnet,
} from "../src/v015-direct-formal-source.js";
import {
  compileV015DirectJsonSourceAnet,
} from "../src/v015-direct-json-source.js";
import {
  denoteV015ResolvedSourceAnet,
  materializeV015SourceAnetProfile,
  type V015SourceAnetProfile,
} from "../src/v015-source-anet.js";
import {
  materializeV013HierarchicalCarrier,
  materializeV013HierarchicalCarrierFromSemanticLink,
  materializeV013SemanticLinkFromHierarchicalCarrier,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 FORMAL production refinement: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": " + String(actual) + " !== " + String(expected));
}

function sameBytes(actual: Uint8Array, expected: Uint8Array, message: string): void {
  same(actual.length, expected.length, message + " length");
  for (let i = 0; i < expected.length; i += 1) {
    same(actual[i], expected[i], message + " byte " + i);
  }
}

function repositoryRoot(): string {
  for (const candidate of [resolve(process.cwd(), ".."), process.cwd()]) {
    if (existsSync(resolve(candidate, "formal/v0.15/regression/grounded-zero-role.formal"))) {
      return candidate;
    }
  }
  throw new Error("v0.15 FORMAL production refinement: repository root");
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly grammarRoot: LinkHandle;
  readonly sourceAnetProfileRoot: LinkHandle;
}

function fixture(noise = 0): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);

  for (let i = 0; i < noise; i += 1) {
    cursor = memory.ensure(cursor, i % 2 === 0 ? basis.O : basis.C);
  }

  const fresh = (): LinkHandle => {
    cursor = memory.ensureStartSelfClosed(cursor);
    return cursor;
  };

  const profile: V015SourceAnetProfile = Object.freeze({
    blockForm: fresh(),
    bareForm: fresh(),
    bindingForm: fresh(),
    bundleForm: fresh(),
    itemRole: fresh(),
    bareValueRole: fresh(),
    bindingNameRole: fresh(),
    bindingValueRole: fresh(),
    bundleAnchorRole: fresh(),
    bundleBodyRole: fresh(),
  });

  const rules: readonly NativeSyntaxGrammarRuleSpec[] = [
    { form: profile.blockForm, fields: [
      { role: profile.itemRole, target: "child", min: 0, max: null },
    ] },
    { form: profile.bareForm, fields: [
      { role: profile.bareValueRole, target: "carrier", min: 1, max: 1 },
    ] },
    { form: profile.bindingForm, fields: [
      { role: profile.bindingNameRole, target: "carrier", min: 1, max: 1 },
      { role: profile.bindingValueRole, target: "carrier", min: 1, max: 1 },
    ] },
    { form: profile.bundleForm, fields: [
      { role: profile.bundleAnchorRole, target: "carrier", min: 1, max: 1 },
      { role: profile.bundleBodyRole, target: "child", min: 1, max: 1 },
    ] },
  ];

  const grammarRoot = materializeNativeSyntaxGrammar(memory, basis, {
    syntaxTag: fresh(),
    markerSeed: fresh(),
    rules,
  });

  return Object.freeze({
    memory,
    basis,
    grammarRoot,
    sourceAnetProfileRoot: materializeV015SourceAnetProfile(memory, profile),
  });
}

function wire(
  memory: Memory,
  basis: RootBasis,
  semantic: LinkHandle,
): Uint8Array {
  return serializeV013HierarchicalCarrier(
    memory,
    basis,
    materializeV013HierarchicalCarrierFromSemanticLink(memory, basis, semantic),
  );
}

const root = repositoryRoot();

const artifacts = [
  {
    id: "grounded-zero-role",
    formal: "formal/v0.15/regression/grounded-zero-role.formal",
    json: "formal/v0.15/regression/grounded-zero-role.json",
    recursive: "formal/v0.15/regression/grounded-zero-role.recursive",
    memberCount: 1,
  },
  {
    id: "two-role-meta-rule",
    formal: "formal/v0.15/regression/two-role-meta-rule.formal",
    json: "formal/v0.15/regression/two-role-meta-rule.json",
    recursive: "formal/v0.15/regression/two-role-meta-rule.recursive",
    memberCount: 3,
  },
] as const;

// ---------------------------------------------------------------------------
// FRM-04 production premise:
// read(materialize(values)) = values on the declared canonical domain.
//
// Exhaust a useful finite basis corpus (all sequences of length 0..3 over the
// five RootBasis Links). Lean/Rocq FRM-07 proves that the general left-inverse
// law implies injectivity; this executable test is a production witness, not a
// substitute for the external theorem.
// ---------------------------------------------------------------------------

{
  const f = fixture(5);
  const alphabet = [f.basis.R, f.basis.O, f.basis.C, f.basis.L, f.basis.U] as const;
  const samples: LinkHandle[][] = [[]];

  for (let length = 1; length <= 3; length += 1) {
    const expand = (prefix: LinkHandle[]): void => {
      if (prefix.length === length) {
        samples.push(prefix);
        return;
      }
      for (const value of alphabet) expand([...prefix, value]);
    };
    expand([]);
  }

  const finals: LinkHandle[] = [];
  for (const values of samples) {
    const encoded = materializeExactSequence(f.memory, values);
    const decoded = readExactSequence(f.memory, encoded).values;
    same(decoded.length, values.length, "ExactSequence left-inverse length");
    for (let i = 0; i < values.length; i += 1) {
      same(decoded[i], values[i], "ExactSequence left-inverse value " + i);
    }
    finals.push(encoded);
  }

  same(new Set(finals).size, samples.length, "sampled ExactSequence encoding is injective");
  same(materializeExactSequence(f.memory, []), f.basis.R, "ExactSequence([])=R");
}

// ---------------------------------------------------------------------------
// FRM-05/06/07 production premises on Author-approved artifacts:
//   FORMAL == JSON native source ANet
//   semantic member -> recursive 8/9/6/1 -> fresh Memory -> semantic member
//   preserves exact recursive identity
// ---------------------------------------------------------------------------

for (const artifact of artifacts) {
  const source = fixture(3);
  const formalBytes = Uint8Array.from(readFileSync(resolve(root, artifact.formal)));
  const jsonBytes = Uint8Array.from(readFileSync(resolve(root, artifact.json)));

  const formal = compileV015DirectFormalSourceAnet(
    source.memory,
    source.basis,
    source.grammarRoot,
    source.sourceAnetProfileRoot,
    formalBytes,
  );
  const json = compileV015DirectJsonSourceAnet(
    source.memory,
    source.basis,
    source.grammarRoot,
    source.sourceAnetProfileRoot,
    jsonBytes,
  );

  same(
    formal.sourceAset,
    json.sourceAset,
    artifact.id + " FORMAL/JSON reconstruct same native source ANet",
  );

  const denotation = denoteV015ResolvedSourceAnet(
    source.memory,
    source.basis,
    source.grammarRoot,
    source.sourceAnetProfileRoot,
    formal.sourceAset,
  );
  same(denotation.members.size, artifact.memberCount, artifact.id + " semantic member count");

  const produced = [...denotation.members]
    .map((member) => new TextDecoder().decode(wire(source.memory, source.basis, member)))
    .sort();

  const persisted = readFileSync(resolve(root, artifact.recursive), "utf8")
    .trimEnd()
    .split("\n")
    .filter(Boolean)
    .sort();

  same(produced.length, persisted.length, artifact.id + " persisted recursive member count");
  for (let i = 0; i < persisted.length; i += 1) {
    same(produced[i], persisted[i], artifact.id + " persisted recursive member " + i);
    assert(/^[8961]+$/u.test(produced[i]!), artifact.id + " recursive alphabet");
  }

  const receiver = fixture(17);
  for (const recursive of produced) {
    const bytes = new TextEncoder().encode(recursive);
    const carrier = materializeV013HierarchicalCarrier(
      receiver.memory,
      receiver.basis,
      bytes,
    );
    const rebuilt = materializeV013SemanticLinkFromHierarchicalCarrier(
      receiver.memory,
      receiver.basis,
      carrier,
    );
    const rebuiltWire = wire(receiver.memory, receiver.basis, rebuilt);
    sameBytes(
      rebuiltWire,
      bytes,
      artifact.id + " semantic->recursive->fresh semantic left-inverse",
    );
  }
}

console.log([
  "MTS_V015_FORMAL_PRODUCTION_REFINEMENT=GREEN",
  "EXACT_SEQUENCE_LEFT_INVERSE_SAMPLED=156",
  "EXACT_SEQUENCE_SAMPLE_INJECTIVITY=GREEN",
  "APPROVED_ARTIFACTS=2",
  "FORMAL_JSON_NATIVE_SOURCE_PARITY=GREEN",
  "RECURSIVE_SEMANTIC_LEFT_INVERSE=GREEN",
  "FRESH_MEMORY_RECONSTRUCTION=GREEN",
  "FRM07_PRODUCTION_PREMISES=EXECUTABLE_WITNESS_GREEN",
  "GENERAL_TYPESCRIPT_CORRECTNESS_PROOF=NOT_CLAIMED",
].join(" "));
