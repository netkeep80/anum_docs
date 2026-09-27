// mts-version-evidence: candidate-from=0.14
// research-owner: #1669

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.14 N20 sequence/layer boundary: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": values differ");
}
function fold(memory: Memory, values: readonly LinkHandle[]): LinkHandle {
  let current = memory.root;
  for (const value of values) current = memory.ensure(current, value);
  return current;
}

const memory = new Memory();
const basis = ensureRootBasis(memory);

const empty = materializeExactSequence(memory, []);
const oneRoot = materializeExactSequence(memory, [basis.R]);
same(empty, basis.R, "empty ExactSequence is R");
assert(oneRoot !== empty, "ExactSequence([R]) remains a distinct one-position carrier");
same(fold(memory, []), fold(memory, [basis.R]), "[] and [R] may share fold denotation R");
assert(
  materializeExactSequence(memory, [basis.L, basis.U]) !== memory.ensure(basis.L, basis.U),
  "sequence carrier is not the ordinary Pair/fold denotation",
);

const read = readExactSequence(memory, materializeExactSequence(memory, [basis.L, basis.U]));
same(read.values.length, 2, "ExactSequence preserves two positions");
same(read.values[0], basis.L, "position 0 preserved");
same(read.values[1], basis.U, "position 1 preserved");

const repoRoot = resolve(process.cwd(), "..");
const contract = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-contract-v0.14.json"), "utf8"),
);
const layers = contract.representationLayers;
same(layers.status, "GREEN_RESEARCH", "layer registry status");
same(layers.ontology.level, 0, "ontology level");
same(JSON.stringify(layers.ontology.members), JSON.stringify(["Link"]), "Link-only ontology");
same(layers.ontology.introducesOntologyEntity, true, "ontology layer introduces Link");
for (const key of ["recursiveAlphabet", "representationsAndCodecs", "byteText", "symbolicMetanotation"]) {
  same(layers[key].introducesOntologyEntity, false, key + " introduces no ontology entity");
}
same(
  JSON.stringify(layers.recursiveAlphabet.members),
  JSON.stringify(["8", "9", "6", "1"]),
  "recursive alphabet registry",
);
assert(layers.representationsAndCodecs.members.includes("Anum"), "Anum is a representation/codec-layer concept");
assert(layers.representationsAndCodecs.members.includes("ExactSequence"), "ExactSequence is representation-layer");
assert(layers.representationsAndCodecs.members.includes("Q"), "Q is representation-layer");
assert(layers.byteText.members.includes("STRING") && layers.byteText.members.includes("UTF-8"), "byte/text boundary explicit");
assert(layers.symbolicMetanotation.members.includes("FORMAL"), "FORMAL is metanotation, not ontology");

same(contract.sequenceSemantics.rootOrigin, "R", "Anum root origin");
same(contract.sequenceSemantics.exactSequenceDistinctFromFoldDenotation, true, "ExactSequence != fold denotation");
same(contract.sequenceSemantics.recursiveLinkCodecDistinct, true, "recursive Link codec != Anum");

console.log([
  "MTS v0.14 N20: SEQUENCE_LAYER_BOUNDARY=GREEN",
  "ANUM=ROOTED_SEQUENCE_REPRESENTATION",
  "EXACT_SEQUENCE_POSITIONAL_IDENTITY=TRUE",
  "EXACT_SEQUENCE_NE_FOLD_DENOTATION=TRUE",
  "RECURSIVE_LINK_CODEC_NE_ANUM=TRUE",
  "ONTOLOGY=LINK_ONLY",
  "REPRESENTATION_LAYERS_EXPLICIT=TRUE",
  "NON_ONTOLOGY_LAYERS_INTRODUCE_ENTITY=FALSE",
].join(" "));
