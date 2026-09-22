import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Memory, ensureRootBasis } from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
} from "../src/derivation.js";
import {
  PORTABLE_STRUCTURAL_THEORY_SCHEMA,
  exportPortableStructuralTheory,
  replayPortableStructuralTheory,
} from "../src/portable-theory.js";
import {
  PORTABLE_STRUCTURAL_THEORY_REVISION_SCHEME,
  computePortableStructuralTheoryRevision,
} from "../src/portable-theory-digest.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 self-proof authority: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function buildVerifierTheory(memory: Memory) {
  const basis = ensureRootBasis(memory);

  // Deterministic verifier-owned anchors. They are not MTS foundation signs and
  // carry no object-specific claim meaning.
  const roleSeed = memory.ensure(basis.L, basis.U);
  const role = memory.ensure(roleSeed, basis.C);
  const theorySeed = memory.ensure(basis.U, basis.L);
  const theory = memory.ensure(theorySeed, basis.O);

  // One generic identity-lift proof rule:
  //
  //     X
  //    ---
  //     X
  //
  // It contains no R/O/C/L/U-specific claim. The later proof candidate must
  // supply independently replayable support for the concrete X.
  const dictionary = defineStructuralRoleDictionary(memory, [role]);
  const rule = defineStructuralRule(memory, dictionary, role);
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const derivationRule = defineStructuralDerivationRule(memory, rule, [role]);
  const derivationRuleAdmission = admitStructuralDerivationRule(
    memory,
    theory,
    derivationRule,
  );

  return Object.freeze({
    basis,
    role,
    theory,
    dictionary,
    rule,
    ruleAdmission,
    derivationRule,
    derivationRuleAdmission,
  });
}

async function snapshot() {
  const memory = new Memory();
  const built = buildVerifierTheory(memory);
  const before = memory.linkCount;
  const artifact = exportPortableStructuralTheory(memory, built.theory);
  same(memory.linkCount, before, "Theory export is read-only");
  const revision = await computePortableStructuralTheoryRevision(artifact);
  same(revision.scheme, PORTABLE_STRUCTURAL_THEORY_REVISION_SCHEME, "revision scheme");
  const replay = replayPortableStructuralTheory(JSON.parse(JSON.stringify(artifact)));
  same(replay.artifact.schema, PORTABLE_STRUCTURAL_THEORY_SCHEMA, "portable Theory schema");
  return Object.freeze({ artifact, revision });
}

const a = await snapshot();
const b = await snapshot();

same(
  JSON.stringify(a.artifact),
  JSON.stringify(b.artifact),
  "independent Memories produce one canonical verifier Theory artifact",
);
same(
  a.revision.value,
  b.revision.value,
  "independent Memories produce one exact verifier Theory revision",
);

const repoRoot = resolve(process.cwd(), "..");
const profilePath = join(
  repoRoot,
  "traceability/mts-v0.13-self-proof-authority-profile.json",
);

if (!existsSync(profilePath)) {
  console.log("SP0 verifier Theory canonical artifact:");
  console.log(JSON.stringify(a.artifact, null, 2));
  console.log("SP0 verifier Theory revision:");
  console.log(JSON.stringify(a.revision, null, 2));
  throw new Error(
    "v0.13 SP0 RED: frozen self-proof authority profile is not yet present",
  );
}

const profile = JSON.parse(readFileSync(profilePath, "utf8")) as any;
same(profile.schema, "mts-v013-self-proof-authority-profile/v0.1", "profile schema");
same(profile.status, "frozen-verifier-profile", "profile status");
same(profile.ownerIssue, 1270, "profile owner issue");
same(profile.normativeFoundation, false, "profile is not MTS foundation");
same(profile.mtsExecutionDependency, false, "MTS execution does not depend on verifier profile");
same(profile.candidateMain, "c3626220f9475360108896892a599cc8c6326bdb", "exact candidate snapshot");
same(profile.theory.policy, "GENERIC_IDENTITY_LIFT_ONLY", "generic proof policy");
same(profile.theory.targetSpecificAdmissionsAllowed, false, "target-specific admissions forbidden");
same(profile.theory.admittedRuleCount, 1, "one generic StructuralRule admitted");
same(profile.theory.admittedDerivationRuleCount, 1, "one generic StructuralDerivationRule admitted");
same(
  JSON.stringify(profile.theory.artifact),
  JSON.stringify(a.artifact),
  "frozen exact portable Theory artifact",
);
same(profile.theory.revision.scheme, a.revision.scheme, "frozen revision scheme");
same(profile.theory.revision.value, a.revision.value, "frozen revision value");

console.log(
  `MTS v0.13 SP0: SELF_PROOF_AUTHORITY_FROZEN revision=${a.revision.value} targetSpecificAdmissions=false candidateMain=${profile.candidateMain}`,
);
