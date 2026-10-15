/** Temporary independent T09-G4 typed A9 delta probe. No normative or runtime authority. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";

const root = resolve(process.cwd(), "..");
const relative = "ts/src/v016-functional-formal.ts";
const path = resolve(root, relative);
const historical = JSON.parse(readFileSync(resolve(root, "traceability/mts-v0.13-semantic-dependency-projection.json"), "utf8"));
const expected = [
  { owner: "denoteV016FunctionalDefinitions", category: "authority-evidence-producer", capability: "candidate.v016.functional-definition", phase: "S0" },
  { owner: "materializeBranches", category: "authority-evidence-producer", capability: "candidate.v016.bounded-rule-elaboration", phase: "S0" },
  { owner: "emit", category: "authority-evidence-producer", capability: "candidate.v016.selected-theory-admission", phase: "S0" },
  { owner: "denoteV016FunctionalCall", category: "representation-materialization", capability: "candidate.v016.physical-query", phase: "pre-S1" },
] as const;
const writeNames = new Set(["ensureRoot", "ensureStartSelfClosed", "ensureEndSelfClosed", "ensure"]);
const assert = (ok: boolean, reason: string): void => { if (!ok) throw Error("T09_G4_A9_AUTHORITY: " + reason); };
const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort());
const ownerOf = (node: ts.Node): string => {
  let cursor: ts.Node | undefined = node;
  while (cursor) {
    if (ts.isFunctionDeclaration(cursor) && cursor.name) return cursor.name.text;
    if ((ts.isArrowFunction(cursor) || ts.isFunctionExpression(cursor)) &&
        ts.isVariableDeclaration(cursor.parent) && ts.isIdentifier(cursor.parent.name)) return cursor.parent.name.text;
    cursor = cursor.parent;
  }
  return "<module>";
};

interface WriteSite { owner: string; method: string; typed: boolean; receiver: string; }
function inspect(): WriteSite[] {
  const program = ts.createProgram({
    rootNames: [path],
    options: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext, skipLibCheck: true, strict: true },
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(path);
  assert(source !== undefined, "source type graph exists");
  const sites: WriteSite[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        writeNames.has(node.expression.name.text)) {
      const member = node.expression.name;
      const symbol = checker.getSymbolAtLocation(member);
      const typed = (symbol?.getDeclarations() ?? []).some((decl) =>
        decl.getSourceFile().fileName.replaceAll("\\", "/").endsWith("/ts/src/memory.ts"));
      sites.push({ owner: ownerOf(node), method: member.text, typed,
        receiver: checker.typeToString(checker.getTypeAtLocation(node.expression.expression)) });
    }
    ts.forEachChild(node, visit);
  };
  visit(source!);
  return sites;
}

assert(historical.packageDirectSemanticWriteAudit.owners.length === 53, "historical 53 owners retained");
assert(historical.packageDirectSemanticWriteAudit.physicalMutationBoundaryProven === false,
  "global physical mutation completeness remains false");
assert(historical.metrics.unclassifiedDirectSemanticWriteOwnerCount === 0,
  "historical classified count remains frozen");
assert(expected.every((e) => e.category !== "tooling"), "semantic/compiler candidates never declared tooling");
const original = readFileSync(path, "utf8");
const sites = inspect();
const owners = sites.map((s) => s.owner);
assert(sites.length > 4, "inspect all write call sites, not merely four names");
assert(sameSet(owners, expected.map((e) => e.owner)), "exact four post-v0.13 T09 owner identities");
assert(sites.every((s) => s.typed), "all syntactic writes resolve to actual typed Memory members");
assert(sites.every((s) => /^(WriteMemory|Memory)$/.test(s.receiver)),
  "each writer receiver has typed Memory or WriteMemory");
assert(sameSet(sites.map((s) => s.method), ["ensure", "ensureStartSelfClosed", "ensureEndSelfClosed"]),
  "exact direct write method set");
const unique = [...new Set(owners)];
const category = Object.fromEntries(expected.map((e) => [e.owner, {
  category: e.category, capability: e.capability, phase: e.phase,
}]));
console.log("T09_G4_A9_HISTORICAL=53_IMMUTABLE");
console.log("T09_G4_A9_POST_V013_TYPED=4_EXACT");
console.log("T09_G4_A9_TYPED_SITES=" + sites.length);
console.log("T09_G4_A9_CLASSIFICATION=" + JSON.stringify(category));
console.log("T09_G4_A9_COUNTS=" + JSON.stringify(unique.map((owner) =>
  ({ owner, sites: sites.filter((s) => s.owner === owner).length,
     methods: [...new Set(sites.filter((s) => s.owner === owner).map((s) => s.method))].sort() }))));

// True negative mutation: generate an additional direct write owner with a typed WriteMemory
// receiver in an isolated runner checkout. Do not modify the PR, main, or evidence source.
try {
  writeFileSync(path, original + "\nfunction t09FifthUnknownOwner(memory: WriteMemory, basis: RootBasis): void {" +
    " memory.ensure(basis.R, basis.C); }\n");
  const mutated = inspect();
  assert(mutated.length === sites.length + 1, "mutation introduces one direct new call site");
  assert(mutated.some((s) => s.owner === "t09FifthUnknownOwner" && s.typed &&
    s.receiver === "WriteMemory"), "mutated 5th owner is actually typed");
  assert(!sameSet(mutated.map((s) => s.owner), expected.map((e) => e.owner)),
    "fifth typed write fails exact closed inventory");
  console.log("T09_G4_A9_TYPED_FIFTH_NEGATIVE=REJECTED");
} finally {
  writeFileSync(path, original);
}
assert(readFileSync(path, "utf8") === original, "exact source restored after negative mutation");
console.log("T09_G4_A9_PROBE=PASS_NOT_PR_GATE");
