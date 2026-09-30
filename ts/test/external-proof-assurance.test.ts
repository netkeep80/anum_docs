import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

interface AssuranceTarget {
  readonly id: string;
  readonly lean4: readonly string[];
  readonly rocq: readonly string[];
}

interface AssuranceManifest {
  readonly schema: string;
  readonly status: string;
  readonly ownerIssue: string;
  readonly premiseClosureOwnerIssue: string;
  readonly authority: string;
  readonly allowedGlobalAxioms: {
    readonly lean4: readonly string[];
    readonly rocq: readonly string[];
  };
  readonly targets: readonly AssuranceTarget[];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("external proof assurance: " + message);
}

function stripSource(
  source: string,
  lineComment: string | null,
  blockStart: string,
  blockEnd: string,
): string {
  let result = "";
  let index = 0;
  let blockDepth = 0;
  let inString = false;

  while (index < source.length) {
    const char = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (blockDepth > 0) {
      if (source.startsWith(blockStart, index)) {
        blockDepth += 1;
        result += " ".repeat(blockStart.length);
        index += blockStart.length;
        continue;
      }
      if (source.startsWith(blockEnd, index)) {
        blockDepth -= 1;
        result += " ".repeat(blockEnd.length);
        index += blockEnd.length;
        continue;
      }
      result += char === "\n" ? "\n" : " ";
      index += 1;
      continue;
    }

    if (inString) {
      if (char === "\\" && next !== "") {
        result += "  ";
        index += 2;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      result += char === "\n" ? "\n" : " ";
      index += 1;
      continue;
    }

    if (lineComment !== null && source.startsWith(lineComment, index)) {
      const newline = source.indexOf("\n", index + lineComment.length);
      if (newline < 0) {
        result += " ".repeat(source.length - index);
        break;
      }
      result += " ".repeat(newline - index) + "\n";
      index = newline + 1;
      continue;
    }

    if (source.startsWith(blockStart, index)) {
      blockDepth = 1;
      result += " ".repeat(blockStart.length);
      index += blockStart.length;
      continue;
    }

    if (char === "\"") {
      inString = true;
      result += " ";
      index += 1;
      continue;
    }

    result += char;
    index += 1;
  }

  assert(blockDepth === 0, "unterminated block comment in proof source");
  assert(!inString, "unterminated string in proof source");
  return result;
}

function assertLeanFailClosed(source: string): void {
  const code = stripSource(source, "--", "/-", "-/");
  const forbidden: readonly [RegExp, string][] = [
    [/\baxiom\b/u, "axiom declaration"],
    [/\bsorry\b/u, "sorry proof bypass"],
    [/\badmit\b/u, "admit proof bypass"],
  ];
  for (const [pattern, label] of forbidden) {
    assert(!pattern.test(code), "Lean contains forbidden " + label);
  }
}

function assertRocqFailClosed(source: string): void {
  const code = stripSource(source, null, "(*", "*)");
  const forbidden: readonly [RegExp, string][] = [
    [/\bAxioms?\b/u, "Axiom declaration"],
    [/\bParameters?\b/u, "Parameter declaration"],
    [/\bConjectures?\b/u, "Conjecture declaration"],
    [/\bAdmitted\b/u, "Admitted proof bypass"],
    [/\badmit\b/u, "admit proof bypass"],
  ];
  for (const [pattern, label] of forbidden) {
    assert(!pattern.test(code), "Rocq contains forbidden " + label);
  }
}

function expectRejected(label: string, action: () => void): void {
  let rejected = false;
  try {
    action();
  } catch {
    rejected = true;
  }
  assert(rejected, "mutation must be rejected: " + label);
}

const root = resolve(process.cwd(), "..");
const manifest = JSON.parse(
  readFileSync(join(root, "proofs/external-proof-assurance.json"), "utf8"),
) as AssuranceManifest;
const p0 = JSON.parse(
  readFileSync(join(root, "theorems/p0-v0.14.json"), "utf8"),
) as Record<string, any>;
const lean = readFileSync(join(root, "proofs/lean4/MtsFoundation.lean"), "utf8");
const rocq = readFileSync(join(root, "proofs/coq/MtsFoundation.v"), "utf8");

assert(manifest.schema === "mts-external-proof-assurance/v0.1", "assurance schema");
assert(manifest.status === "active", "assurance manifest active");
assert(manifest.ownerIssue === "#1791", "assurance owner is #1791");
assert(manifest.premiseClosureOwnerIssue === "#1789", "premise closure stays in #1789");
assert(p0.status === "p0-frozen", "assurance consumes frozen P0 boundary");
assert(
  p0.boundaryFreeze?.predecessorHardening === 1789,
  "frozen P0 records #1789 as completed predecessor hardening",
);
assert(
  p0.boundaryFreeze?.status === "STABILIZED",
  "frozen P0 records stabilized premise/domain closure",
);
assert(
  manifest.authority === "external-proof-assurance-only",
  "assurance does not become MTS semantic authority",
);
assert(manifest.allowedGlobalAxioms.lean4.length === 0, "Lean global axiom allowlist is empty");
assert(manifest.allowedGlobalAxioms.rocq.length === 0, "Rocq global axiom allowlist is empty");
assert(manifest.targets.length === 14, "14 completed external theorem IDs are assured");

assertLeanFailClosed(lean);
assertRocqFailClosed(rocq);

for (const target of manifest.targets) {
  assert(target.lean4.length > 0, target.id + " has Lean assurance symbol");
  assert(target.rocq.length > 0, target.id + " has Rocq assurance symbol");
  for (const symbol of target.lean4) {
    const local = symbol.replace("MTS.External.", "");
    assert(lean.includes(local), target.id + " Lean source contains " + symbol);
  }
  for (const symbol of target.rocq) {
    assert(rocq.includes(symbol), target.id + " Rocq source contains " + symbol);
  }
}

expectRejected("Lean injected False axiom", () =>
  assertLeanFailClosed(lean + "\naxiom injectedFalse : False\n"),
);
expectRejected("Lean sorry theorem", () =>
  assertLeanFailClosed(lean + "\ntheorem injectedSorry : False := by sorry\n"),
);
expectRejected("Lean bypass outside namespace", () =>
  assertLeanFailClosed(lean + "\naxiom injectedOutsideNamespace : False\n"),
);
expectRejected("Rocq injected False axiom", () =>
  assertRocqFailClosed(rocq + "\nAxiom injectedFalse : False.\n"),
);
expectRejected("Rocq Admitted theorem", () =>
  assertRocqFailClosed(rocq + "\nTheorem injectedAdmitted : False. Admitted.\n"),
);

const fnd07LeanStart = lean.indexOf("theorem FND_07_contextual_truth_boundary");
assert(fnd07LeanStart >= 0, "Lean FND-07 theorem exists for mutation test");
const fnd07LeanTail = lean.slice(fnd07LeanStart);
const leanBranchNeedle = "  · intro K A\n    rfl";
assert(fnd07LeanTail.includes(leanBranchNeedle), "Lean FND-07 has a concrete branch to mutate");
const leanFnd07Mutation =
  lean.slice(0, fnd07LeanStart) +
  fnd07LeanTail.replace(leanBranchNeedle, "  · intro K A\n    sorry");
expectRejected("real Lean FND-07 branch replaced by sorry", () =>
  assertLeanFailClosed(leanFnd07Mutation),
);

const fnd07RocqStart = rocq.indexOf("Theorem FND_07_contextual_truth_boundary");
assert(fnd07RocqStart >= 0, "Rocq FND-07 theorem exists for mutation test");
const fnd07RocqTail = rocq.slice(fnd07RocqStart);
const firstQed = fnd07RocqTail.indexOf("Qed.");
assert(firstQed >= 0, "Rocq FND-07 has Qed for mutation test");
const rocqFnd07Mutation =
  rocq.slice(0, fnd07RocqStart) +
  fnd07RocqTail.slice(0, firstQed) +
  "Admitted." +
  fnd07RocqTail.slice(firstQed + "Qed.".length);
expectRejected("real Rocq FND-07 proof replaced by Admitted", () =>
  assertRocqFailClosed(rocqFnd07Mutation),
);

console.log(
  [
    "external proof assurance: GREEN",
    "SOURCE_ASSURANCE_CHECKED=YES",
    "GLOBAL_AXIOM_ALLOWLIST=EMPTY",
    "MUTATION_FIXTURES=7_REJECTED",
    "KERNEL_ASSUMPTIONS=CHECKED_IN_PINNED_CI",
    "PREMISE_CLOSURE_STATUS=CLOSED:#1789",
  ].join(" "),
);
