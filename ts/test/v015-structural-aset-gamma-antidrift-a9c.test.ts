import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Integration split provenance: source-level anti-drift guard extracted from GREEN #1989 A9 and retargeted to the clean-main A9a core file.

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.15 A9 anti-drift: ${message}`);
}

function staticGuards(): void {
  const own = readFileSync(
    resolve(
      process.cwd(),
      "test/v015-structural-aset-gamma-core-a9a.test.ts",
    ),
    "utf8",
  );

  const snapshotStart = own.indexOf("function structuralTheorySnapshot(");
  const snapshotEnd = own.indexOf("\ninterface PlannedMatch", snapshotStart);
  assert(snapshotStart >= 0 && snapshotEnd > snapshotStart, "snapshot source slice");
  const snapshot = own.slice(snapshotStart, snapshotEnd);
  assert(snapshot.includes("for (const admission of state.members)"),
    "Theory authority derives from Aset membership");
  assert(!snapshot.includes("memory.outgoing(theory)"),
    "ambient physical Theory outgoing Links are not authority");

  const planStart = own.indexOf("function planStructuralAset(");
  const planEnd = own.indexOf("\ninterface StructuralAsetReaction", planStart);
  assert(planStart >= 0 && planEnd > planStart, "S1 plan source slice");
  const planner = own.slice(planStart, planEnd);

  assert(planner.includes("unifyStructuralRuleTemplate("),
    "S1 structural match/bind occurs inside one reaction plan");
  for (const forbidden of [
    "instantiateV013StructuralTemplate(",
    ".ensure(",
    "defineContext(",
    "currentScope",
    "selectedTheory",
    "programCounter",
  ]) {
    assert(!planner.includes(forbidden),
      `S1 plan is read-only and pointer-free: ${forbidden}`);
  }

  const gammaStart = own.indexOf("function gammaStructuralAset(");
  const gammaEnd = own.indexOf("\nfunction currentTruths(", gammaStart);
  assert(gammaStart >= 0 && gammaEnd > gammaStart, "Gamma source slice");
  const gamma = own.slice(gammaStart, gammaEnd);

  assert(
    gamma.indexOf("const planned = planStructuralAset(memory, before)") <
      gamma.indexOf("instantiateV013StructuralTemplate("),
    "complete S1 plan exists before any S2 instantiation",
  );
  assert(gamma.includes("next.delete(item.active.edge)"),
    "publication replaces positive currentness witness");
  assert(!gamma.includes("next.delete(item.active.context)"),
    "publication preserves Context Link membership roles");
  assert(!gamma.includes("next.delete(item.active.truth)"),
    "publication preserves truth/authority Link membership roles");

  for (const forbidden of [
    "V013GroundedScopeCursor",
    "V013CurrentScopeCursor",
    "switchAtomically",
    "defineV013GroundedExecutionScope",
    "selectedScope",
    "triggerKey",
    "RuleKind",
    "opcode",
  ]) {
    assert(!gamma.includes(forbidden),
      `one-command candidate excludes legacy runtime authority: ${forbidden}`);
  }
}

staticGuards();
console.log([
  "MTS_V015_A9_ANTIDRIFT=GREEN",
  "THEORY_AUTHORITY=ASET_MEMBERSHIP_ONLY",
  "S1_PLAN=READ_ONLY_POINTER_FREE",
  "S2_AFTER_COMPLETE_PLAN=TRUE",
  "LEGACY_RUNTIME_AUTHORITY=0",
  "OPCODE_DISPATCH=0",
].join(" "));