import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(value: unknown, message: string): asserts value {
  if (!value) {
    throw new Error("v0.15 P2l proof-source authority injection: " + message);
  }
}

const path = resolve(process.cwd(), "src/v015-proof-source.ts");
const own = readFileSync(path, "utf8");

function slice(start: string, end: string): string {
  const i = own.indexOf(start);
  const j = own.indexOf(end, i + start.length);
  assert(i >= 0 && j > i, "source slice " + start);
  return own.slice(i, j);
}

// This is the exact builder used by materializeV015ProofDenotation.
const builders = slice(
  "function createV015ProofDenotationBuilders(",
  "\nexport function materializeV015OpenProofDenotation(",
);

const genericStart = builders.indexOf("  const generic = (");
const bindingStart = builders.indexOf("  const binding = (", genericStart);
assert(genericStart >= 0 && bindingStart > genericStart, "generic builder slice");
const generic = builders.slice(genericStart, bindingStart);

const primitiveStart = builders.indexOf("  const primitive = (");
const coordinateStart = builders.indexOf(
  "  const coordinate = (",
  primitiveStart,
);
assert(
  primitiveStart >= 0 && coordinateStart > primitiveStart,
  "primitive builder slice",
);
const primitive = builders.slice(primitiveStart, coordinateStart);

const publicStart = own.indexOf(
  "export function materializeV015ProofDenotation(",
);
assert(publicStart >= 0, "public proof denotation entry");
const publicEntry = own.slice(publicStart);

// Generic proof source chooses its own Theory coordinate and then mutates that
// Theory with local Rule/DR admissions.
assert(
  generic.includes(
    'const theory = values[1] ?? fail("invalid-source");',
  ),
  "generic Theory comes from proof-source payload",
);
assert(
  generic.includes("admitStructuralRule(memory, theory, localSchema.structuralRule)"),
  "generic source admits local StructuralRule",
);
assert(
  generic.includes("admitStructuralDerivationRule(memory, theory, localDR)"),
  "generic source admits local DR",
);

// Primitive proof source is even stronger: from source-selected Theory + Claim
// it synthesizes a fresh zero-premise Rule/DR and admits both.
assert(
  primitive.includes(
    'const theory = values[0] ?? fail("invalid-source");',
  ),
  "primitive Theory comes from proof-source payload",
);
assert(
  primitive.includes(
    'const claim = values[1] ?? fail("invalid-source");',
  ),
  "primitive Claim comes from proof-source payload",
);
assert(
  primitive.includes("defineStructuralRule(memory, dictionary, claim)"),
  "primitive source synthesizes Rule from candidate Claim",
);
assert(
  primitive.includes("defineStructuralDerivationRule("),
  "primitive source synthesizes zero-premise DR",
);
assert(
  primitive.includes("admitStructuralRule(memory, theory, structuralRule)"),
  "primitive source admits synthesized Rule",
);
assert(
  primitive.includes("admitStructuralDerivationRule(memory, theory, dr)"),
  "primitive source admits synthesized DR",
);

// The public denotation boundary has no independently supplied selected
// ObjectTheory/authority parameter. Therefore these admissions cannot be
// interpreted as validation against an external closed authority plane.
const signatureEnd = publicEntry.indexOf("): V015ProofFormMaterializeResult");
assert(signatureEnd > 0, "public materializer signature");
const signature = publicEntry.slice(0, signatureEnd);
for (const forbidden of [
  "objectTheory",
  "selectedTheory",
  "authority",
  "pinnedTheory",
]) {
  assert(
    !signature.includes(forbidden),
    "public materializer has no independent authority input: " + forbidden,
  );
}

// Classification: this behavior is retained historical construction semantics,
// but it is UNSAFE as the trust boundary for an untrusted v0.15 proof candidate.
// Do not "fix" it by trusting the candidate-carried admissions; native aprover
// must instead receive an independently pinned ObjectTheory and candidate
// materialization must not be able to extend protected authority anchors.
console.log([
  "MTS_V015_P2L_PROOF_SOURCE_AUTHORITY_INJECTION=FALSIFIER_GREEN",
  "CURRENT_MATERIALIZER=HISTORICAL_TRUSTED_CONSTRUCTION",
  "GENERIC_THEORY_FROM_PROOF_SOURCE=TRUE",
  "GENERIC_ADMITS_LOCAL_RULE=TRUE",
  "GENERIC_ADMITS_LOCAL_DR=TRUE",
  "PRIMITIVE_THEORY_FROM_PROOF_SOURCE=TRUE",
  "PRIMITIVE_CLAIM_FROM_PROOF_SOURCE=TRUE",
  "PRIMITIVE_SYNTHESIZES_RULE_DR=TRUE",
  "PRIMITIVE_ADMITS_RULE_DR=TRUE",
  "INDEPENDENT_OBJECT_THEORY_INPUT=ABSENT",
  "SAFE_FOR_UNTRUSTED_V015_CANDIDATE=FALSE",
  "P1Y_RECURSIVE_AUTHORITY_FIREWALL_REQUIRED=TRUE",
  "FND07_END_TO_END_NATIVE_APROVER_BLOCKER=TRUE",
  "PRODUCTION_SEMANTICS_CHANGED=FALSE",
  "CANONICAL_APROVER_FORMAL_JSON=NOT_YET_PROPOSED",
].join(" "));
