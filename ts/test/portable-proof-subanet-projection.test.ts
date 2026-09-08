import {
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import { defineStructuralDerivationRule } from "../src/derivation.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import { replayProofSubAnetProjection } from "../src/proof-subanet-projection.js";
import {
  PORTABLE_PROOF_SUBANET_PROJECTION_SCHEMA,
  canonicalPortableProofSubAnetProjectionV01Json,
  exportPortableProofSubAnetProjection,
  replayPortableProofSubAnetProjection,
} from "../src/portable-proof-subanet-projection.js";
import {
  PORTABLE_PROOF_SUBANET_PROJECTION_CONTENT_DIGEST_SCHEME,
  computePortableProofSubAnetProjectionContentDigest,
} from "../src/portable-proof-anet-digest.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function identityProof(
  memory: Memory,
  left: LinkHandle,
  right: LinkHandle,
  children: readonly LinkHandle[],
): LinkHandle {
  const claim = memory.ensure(left, right);
  return memory.ensure(claim, materializeExactSequence(memory, children));
}

function coordinateOf(
  artifact: ReturnType<typeof exportPortableProofSubAnetProjection>,
  coordinate: number,
): readonly [number, number] {
  const link = artifact.topology.links[coordinate];
  assert(link !== undefined, `coordinate ${coordinate} exists`);
  return link;
}

async function main(): Promise<void> {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  const theory = memory.ensure(C, U);

  // Generic non-Nat identity proof Anet. The projected occurrence already exists
  // in the K1-validated recursive identity closure before portability is involved.
  const rootProof = identityProof(memory, R, R, []);
  const oProof = identityProof(memory, O, O, [rootProof]);
  const cProof = identityProof(memory, C, C, [rootProof]);
  const lProof = identityProof(memory, L, L, [oProof, cProof]);
  const uProof = identityProof(memory, U, U, [cProof, oProof]);

  const left = memory.ensure(O, U);
  const right = memory.ensure(C, L);
  const leftProof = identityProof(memory, left, left, [oProof, uProof]);
  const rightProof = identityProof(memory, right, right, [cProof, lProof]);
  const relation = memory.ensure(left, right);
  const relationProof = identityProof(memory, relation, relation, [leftProof, rightProof]);

  // One-premise ProjectionSchema remains data only and is deliberately unadmitted.
  const A = memory.ensure(L, R);
  const B = memory.ensure(R, L);
  const dictionary = defineStructuralRoleDictionary(memory, [A, B]);
  const relationTemplate = memory.ensure(A, B);
  const premiseTemplate = memory.ensure(relationTemplate, relationTemplate);
  const conclusionTemplate = memory.ensure(A, A);
  const rule = defineStructuralRule(memory, dictionary, conclusionTemplate);
  const dr = defineStructuralDerivationRule(memory, rule, [premiseTemplate]);

  assert(memory.find(theory, rule) === undefined, "ProjectionSchema Rule stays unadmitted");
  assert(memory.find(theory, dr) === undefined, "ProjectionSchema DR stays unadmitted");

  const evidence = Object.freeze({
    theory,
    schemaDerivationRule: dr,
    premiseProofOccurrence: relationProof,
  });

  const before = memory.linkCount;
  const sourceReplay = replayProofSubAnetProjection(memory, evidence);
  same(sourceReplay.projectedOccurrence, leftProof, "source K1e selects existing left proof");
  same(memory.linkCount, before, "source K1e remains read-only");

  const artifact = exportPortableProofSubAnetProjection(memory, evidence);
  same(artifact.schema, PORTABLE_PROOF_SUBANET_PROJECTION_SCHEMA, "exact portable schema");
  assert(!("projectedOccurrence" in artifact), "projected occurrence is not serialized");
  assert(!("bindings" in artifact), "bindings are not serialized");
  assert(!("rho" in artifact), "rho is not serialized");
  same(memory.linkCount, before, "portable export remains read-only");
  same(
    canonicalPortableProofSubAnetProjectionV01Json(artifact),
    JSON.stringify(artifact),
    "export is already canonical JSON",
  );

  // Artifact identity follows the existing portable law: canonical JSON plus a
  // domain-separated SHA-256 scheme. The digest is integrity identity only.
  const digest = await computePortableProofSubAnetProjectionContentDigest(artifact);
  same(
    digest.scheme,
    PORTABLE_PROOF_SUBANET_PROJECTION_CONTENT_DIGEST_SCHEME,
    "exact portable projection digest scheme",
  );
  assert(/^[0-9a-f]{64}$/.test(digest.value), "digest is lowercase SHA-256 hex");
  const digestAfterWire = await computePortableProofSubAnetProjectionContentDigest(
    JSON.parse(JSON.stringify(artifact)),
  );
  same(digestAfterWire.value, digest.value, "wire round-trip preserves content digest");

  const mutatedCoordinate = artifact.theoryCoordinate === artifact.schemaDerivationRuleCoordinate
    ? artifact.premiseProofOccurrenceCoordinate
    : artifact.schemaDerivationRuleCoordinate;
  const coordinateMutation = {
    ...artifact,
    theoryCoordinate: mutatedCoordinate,
  };
  const mutatedDigest = await computePortableProofSubAnetProjectionContentDigest(coordinateMutation);
  assert(mutatedDigest.value !== digest.value, "coordinate mutation changes content digest");

  // The three explicit coordinates are transport references into canonical MTS
  // topology, not host LinkHandles or semantic proof fields.
  coordinateOf(artifact, artifact.theoryCoordinate);
  coordinateOf(artifact, artifact.schemaDerivationRuleCoordinate);
  coordinateOf(artifact, artifact.premiseProofOccurrenceCoordinate);

  const wire = JSON.parse(JSON.stringify(artifact)) as unknown;
  const restored = replayPortableProofSubAnetProjection(wire);
  same(
    restored.artifact.schema,
    PORTABLE_PROOF_SUBANET_PROJECTION_SCHEMA,
    "fresh replay preserves exact schema",
  );
  same(
    restored.memory.linkCount,
    artifact.topology.links.length,
    "fresh Memory is exactly the transported canonical support",
  );
  assert(
    restored.replay.projectedOccurrence !== restored.evidence.premiseProofOccurrence,
    "trusted replay recomputes a descendant projected occurrence",
  );

  console.log("PORTABLE_GENERIC_PROOF_SUBANET_PROJECTION = SUPPORTED");
  console.log("PORTABLE_PROOF_SUBANET_PROJECTION_CONTENT_DIGEST = SUPPORTED");
  console.log("PORTABLE_PROJECTED_OCCURRENCE_AUTHORITY = NONE");
  console.log("accepted semantic delta = NONE");
}

void main();
