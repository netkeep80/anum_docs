import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  defineStructuralRoleDictionary,
  defineStructuralRule,
  readStructuralRoleDictionary,
  readStructuralRule,
} from "../src/structural-rule.js";
import {
  defineStructuralDerivationRule,
  readStructuralDerivationRule,
} from "../src/derivation.js";
import {
  replayStructuralRootedProofAset,
} from "../src/rooted-proof-aset.js";
import {
  replayRecursiveLinkIdentityProofAset,
} from "../src/recursive-link-identity-proof.js";
import {
  exportPortableStructuralTheory,
  replayPortableStructuralTheory,
} from "../src/portable-theory.js";
import {
  computePortableStructuralTheoryRevision,
} from "../src/portable-theory-digest.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 bounded self-proof: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`);
}

const repoRoot = resolve(process.cwd(), "..");
const profile = JSON.parse(
  readFileSync(
    join(repoRoot, "traceability/mts-v0.13-self-proof-authority-profile.json"),
    "utf8",
  ),
) as any;

same(profile.status, "frozen-verifier-profile", "frozen verifier profile");
same(profile.normativeFoundation, false, "profile is external to MTS foundation");
same(profile.mtsExecutionDependency, false, "profile is not an MTS runtime dependency");
same(profile.theory.policy, "GENERIC_IDENTITY_LIFT_ONLY", "exact verifier policy");
same(profile.theory.targetSpecificAdmissionsAllowed, false, "target-specific Theory admissions are forbidden");

function exactJson(left: unknown, right: unknown, message: string): void {
  assert(JSON.stringify(left) === JSON.stringify(right), message);
}

function identityProof(
  memory: Memory,
  left: LinkHandle,
  right: LinkHandle,
  children: readonly LinkHandle[],
): LinkHandle {
  const claim = memory.ensure(left, right);
  const childSequence = materializeExactSequence(memory, children);
  return memory.ensure(claim, childSequence);
}

function findFrozenGenericDerivationRule(
  memory: Memory,
  theory: LinkHandle,
): {
  readonly role: LinkHandle;
  readonly rule: LinkHandle;
  readonly derivationRule: LinkHandle;
} {
  let selected:
    | { readonly role: LinkHandle; readonly rule: LinkHandle; readonly derivationRule: LinkHandle }
    | undefined;

  for (const admission of memory.outgoing(theory)) {
    const admitted = memory.poles(admission).end;
    try {
      const dr = readStructuralDerivationRule(memory, admitted);
      const rule = readStructuralRule(memory, dr.structuralRule);
      const dictionary = readStructuralRoleDictionary(memory, rule.roleDictionary);

      if (
        dictionary.roles.length !== 1 ||
        dr.premiseTemplates.length !== 1 ||
        rule.body !== dictionary.roles[0] ||
        dr.premiseTemplates[0] !== dictionary.roles[0]
      ) {
        continue;
      }

      assert(selected === undefined, "frozen Theory contains exactly one generic identity-lift derivation");
      selected = Object.freeze({
        role: dictionary.roles[0]!,
        rule: dr.structuralRule,
        derivationRule: admitted,
      });
    } catch {
      // The other outgoing admission is the StructuralRule admission itself.
    }
  }

  assert(selected !== undefined, "generic identity-lift derivation is structurally discoverable");
  return selected;
}

function proofOccurrence(
  memory: Memory,
  claim: LinkHandle,
  derivationRule: LinkHandle,
  dependencies: readonly LinkHandle[],
): LinkHandle {
  const application = memory.ensure(
    derivationRule,
    materializeExactSequence(memory, dependencies),
  );
  return memory.ensure(claim, application);
}

function closedTargetRoot(
  memory: Memory,
  theory: LinkHandle,
  primitiveDerivationRule: LinkHandle,
  identityOccurrence: LinkHandle,
): {
  readonly root: LinkHandle;
  readonly claim: LinkHandle;
  readonly targetRule: LinkHandle;
  readonly targetDerivationRule: LinkHandle;
} {
  const claim = memory.poles(identityOccurrence).start;

  // The target schema is a statement to be proved, not a primitive Theory
  // admission. Empty target premises make this a closed proof.
  const targetDictionary = defineStructuralRoleDictionary(memory, []);
  const targetRule = defineStructuralRule(memory, targetDictionary, claim);
  const targetDerivationRule = defineStructuralDerivationRule(
    memory,
    targetRule,
    [],
  );
  const targetIdentity = memory.ensure(targetDerivationRule, theory);
  const occurrence = proofOccurrence(
    memory,
    claim,
    primitiveDerivationRule,
    [identityOccurrence],
  );

  assert(memory.find(theory, targetRule) === undefined, "target Rule is not self-admitted");
  assert(
    memory.find(theory, targetDerivationRule) === undefined,
    "target DerivationRule is not self-admitted",
  );

  return Object.freeze({
    root: memory.ensure(targetIdentity, occurrence),
    claim,
    targetRule,
    targetDerivationRule,
  });
}

async function runIndependentSelfProof() {
  const replayedTheory = replayPortableStructuralTheory(
    JSON.parse(JSON.stringify(profile.theory.artifact)),
  );
  const memory = replayedTheory.memory;
  const theory = replayedTheory.theory;

  const initialArtifact = exportPortableStructuralTheory(memory, theory);
  exactJson(initialArtifact, profile.theory.artifact, "replayed Theory equals frozen artifact");
  const initialRevision = await computePortableStructuralTheoryRevision(initialArtifact);
  same(initialRevision.value, profile.theory.revision.value, "exact frozen Theory revision");

  const basis = ensureRootBasis(memory);
  const generic = findFrozenGenericDerivationRule(memory, theory);

  // Independently rebuild the recursive identity support of the v0.13
  // ROOT/START/END/PAIR basis. No proof-step opcode or basis name is admitted
  // into the frozen Theory.
  const rootProof = identityProof(memory, basis.R, basis.R, []);
  const oProof = identityProof(memory, basis.O, basis.O, [rootProof]);
  const cProof = identityProof(memory, basis.C, basis.C, [rootProof]);
  const lProof = identityProof(memory, basis.L, basis.L, [oProof, cProof]);
  const uProof = identityProof(memory, basis.U, basis.U, [cProof, oProof]);

  // First replay the recursive identity evidence itself.
  const lIdentity = replayRecursiveLinkIdentityProofAset(memory, lProof);
  const uIdentity = replayRecursiveLinkIdentityProofAset(memory, uProof);
  same(lIdentity.left, basis.L, "L identity proof left");
  same(lIdentity.right, basis.L, "L identity proof right");
  same(uIdentity.left, basis.U, "U identity proof left");
  same(uIdentity.right, basis.U, "U identity proof right");

  const lTarget = closedTargetRoot(
    memory,
    theory,
    generic.derivationRule,
    lProof,
  );
  const uTarget = closedTargetRoot(
    memory,
    theory,
    generic.derivationRule,
    uProof,
  );

  const beforeL = memory.linkCount;
  const lReplay = replayStructuralRootedProofAset(memory, lTarget.root);
  same(memory.linkCount, beforeL, "L self-proof replay is read-only");
  same(lReplay.conclusion, lTarget.claim, "L self-proof exact conclusion");
  same(lReplay.declaredAssumptionCount, 0, "L self-proof is closed");
  same(lReplay.usedAssumptionCount, 0, "L self-proof uses no outer assumption");

  const beforeU = memory.linkCount;
  const uReplay = replayStructuralRootedProofAset(memory, uTarget.root);
  same(memory.linkCount, beforeU, "U self-proof replay is read-only");
  same(uReplay.conclusion, uTarget.claim, "U self-proof exact conclusion");
  same(uReplay.declaredAssumptionCount, 0, "U self-proof is closed");
  same(uReplay.usedAssumptionCount, 0, "U self-proof uses no outer assumption");

  // Candidate proof materialization must not alter the independently frozen
  // Theory. Ambient proof Links are allowed; new Theory admissions are not.
  const finalArtifact = exportPortableStructuralTheory(memory, theory);
  exactJson(finalArtifact, profile.theory.artifact, "self-proof leaves frozen Theory artifact unchanged");
  const finalRevision = await computePortableStructuralTheoryRevision(finalArtifact);
  same(finalRevision.value, profile.theory.revision.value, "self-proof leaves Theory revision unchanged");

  return Object.freeze({
    memory,
    basis,
    theory,
    generic,
    lClaim: lTarget.claim,
    uClaim: uTarget.claim,
    lRoot: lTarget.root,
    uRoot: uTarget.root,
    lOccurrenceCount: lReplay.occurrenceCount,
    uOccurrenceCount: uReplay.occurrenceCount,
    revision: finalRevision.value,
  });
}

const left = await runIndependentSelfProof();
const right = await runIndependentSelfProof();

assert(left.basis.R !== right.basis.R, "independent Memories do not share root handles");
assert(left.theory !== right.theory, "independent Memories do not share Theory handles");
assert(left.lClaim !== right.lClaim, "independent Memories do not share L-claim handles");
assert(left.uClaim !== right.uClaim, "independent Memories do not share U-claim handles");

same(left.revision, right.revision, "both Memories use the same frozen Theory revision");
same(left.lOccurrenceCount, right.lOccurrenceCount, "L proof shape is allocation-independent");
same(left.uOccurrenceCount, right.uOccurrenceCount, "U proof shape is allocation-independent");

console.log(
  `MTS v0.13 SP1-SP3: BOUNDED_SELF_PROOF_GREEN claims=L_IDENTITY,U_IDENTITY theoryRevision=${left.revision} targetSpecificAdmissions=0 assumptions=0 independentMemories=2`,
);
