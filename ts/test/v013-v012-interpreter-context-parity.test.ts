import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13/v0.12 interpreter parity: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function sameJson(actual: unknown, expected: unknown, message: string): void {
  same(JSON.stringify(actual), JSON.stringify(expected), message);
}

const repoRoot = resolve(process.cwd(), "..");
const contract12 = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-contract-v0.12.json"), "utf8"),
);
const conformance12 = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-conformance-v0.12.json"), "utf8"),
);
const contract13 = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-contract-v0.13.json"), "utf8"),
);
const conformance13 = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-conformance-v0.13.json"), "utf8"),
);

const retained = contract13.retainedAcceptedCapabilities?.interpreterLayerV012;
assert(retained, "retained v0.12 interpreter layer is declared");

same(
  retained.role,
  "retained higher-level semantic compatibility layer over the v0.13 Link foundation",
  "retained layer role",
);
same(retained.definesV013FoundationAlphabet, false, "legacy interpreters do not define v0.13 foundation alphabet");

sameJson(retained.interpreterModel, contract12.interpreterModel, "interpreter model preserved exactly");
sameJson(retained.stringInterpreter, contract12.stringInterpreter, "STRING interpreter capability preserved");
sameJson(retained.formalInterpreter, contract12.formalInterpreter, "FORMAL interpreter capability preserved");
sameJson(retained.quaternaryInterpreter, contract12.quaternaryInterpreter, "legacy Q interpreter capability preserved");
sameJson(retained.contextAuthority, contract12.contextAuthority, "explicit K/host-authority boundary preserved");
sameJson(retained.formalElaboration, contract12.formalElaboration, "association/formal elaboration boundary preserved");

sameJson(
  retained.compatibilityBoundary.qAlphabet,
  ["[", "]", "1", "0"],
  "legacy Q alphabet remains available for accepted compatibility behavior",
);
same(retained.compatibilityBoundary.qAlphabetIsV013FoundationAlphabet, false, "legacy Q alphabet is not re-promoted to foundation");
sameJson(
  retained.compatibilityBoundary.v013FoundationAlphabet,
  ["1", "6", "8", "9"],
  "v0.13 aspect foundation alphabet remains distinct",
);
same(
  retained.compatibilityBoundary.reimplementationMayWeakenAcceptedObservableCapability,
  false,
  "future implementation simplification may not weaken accepted behavior",
);

const expectedLaws = [
  "interpreterSeparation",
  "stringNestedAnum",
  "formalSquareBracketStringChild",
  "quaternaryNestedContext",
  "stringOneVsQOne",
  "formalParentheses",
  "explicitKContext",
  "associationBoundary",
];

const baselineGates = new Set<string>(conformance12.requiredExecutableGates);
const compatibilityGates = new Set<string>(
  conformance13.functionalParityAudit.retainedCompatibilityGates,
);

for (const law of expectedLaws) {
  const entry = conformance13.functionalParityAudit.entries[law];
  assert(entry, `${law}: parity entry exists`);
  same(entry.classification, "PRESERVED", `${law}: classification`);
  assert(entry.candidateEvidence.length > 0, `${law}: executable evidence is bound`);

  for (const gate of entry.candidateEvidence) {
    assert(baselineGates.has(gate), `${law}: ${gate} is accepted v0.12 mandatory evidence`);
    assert(compatibilityGates.has(gate), `${law}: ${gate} is retained by v0.13 compatibility layer`);
  }
}

// The retained semantic roles are intentionally different for the same glyph.
// This guards against collapsing the legacy interpreters into host glyph magic.
same(
  retained.stringInterpreter.glyphOneRole,
  "UTF-8 character/sign `1`",
  "STRING glyph 1 role",
);
same(retained.quaternaryInterpreter.glyphOneRole, "Q abit 1", "legacy Q glyph 1 role");
assert(
  retained.stringInterpreter.glyphOneRole !== retained.quaternaryInterpreter.glyphOneRole,
  "same printed glyph 1 keeps interpreter-relative roles",
);

same(
  retained.formalInterpreter.squareBracketChildInterpreter,
  "I_STRING",
  "FORMAL [] still selects I_STRING",
);
same(
  retained.formalInterpreter.squareBracketChildIsQ,
  false,
  "FORMAL [] does not collapse to legacy I_Q",
);
same(
  retained.quaternaryInterpreter.squareBracketChildInterpreter,
  "I_Q",
  "legacy Q [] remains Q-native recursion",
);
same(
  retained.formalInterpreter.parenthesesChildInterpreter,
  "I_FORMAL",
  "FORMAL () remains formal recursion",
);
same(retained.formalInterpreter.emptyParenthesesAllowed, false, "FORMAL () remains invalid when empty");

same(
  retained.contextAuthority.contextualDotUsesExplicitStructuralK,
  true,
  "contextual dot keeps explicit K authority",
);
same(retained.contextAuthority.hostParserStackIsSemanticAuthority, false, "host parser stack remains non-authoritative");
same(retained.contextAuthority.ambientMutableCurrentIsSemanticAuthority, false, "ambient current remains non-authoritative");

same(retained.formalElaboration.linkTopologyEqualsFormalGrammar, false, "Link topology is not FORMAL grammar");
same(retained.formalElaboration.genericFlatReaderEqualsFormalGrammar, false, "flat reader is not FORMAL grammar");

// This parity slice is still not acceptance.
same(contract13.accepted, false, "v0.13 remains unaccepted");
same(contract13.acceptanceReady, false, "v0.13 remains not ready");
same(contract13.candidateState.explicitAuthorAcceptanceRecorded, false, "author acceptance remains absent");

console.log(
  "MTS v0.13/v0.12 interpreter/context parity: I_STRING/I_FORMAL/I_Q, nested STRING/Q/FORMAL roles, glyph-role separation, explicit K and association boundaries are preserved as a higher-level compatibility layer without redefining the 1/6/8/9 foundation: GREEN.",
);
