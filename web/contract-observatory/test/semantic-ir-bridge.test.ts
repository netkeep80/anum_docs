import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadCompiledMtsSemanticIr, validateSemanticIr } from "../src/semantic-ir-bridge.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Contract Observatory P3a: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

const repositoryRoot = process.cwd();
const ir = loadCompiledMtsSemanticIr(repositoryRoot);
same(ir.contract, "mts-contract/v0.13", "current compiler contract");
same(ir.contractPath, "contracts/mts-contract-v0.13.json", "current compiler contract path");
same(ir.requirements.length, 13, "accepted v0.13 requirement count");

const ids = ir.requirements.map((item) => item.id);
same(new Set(ids).size, 13, "stable requirement IDs are unique");
const l4 = ir.requirements.find((item) => item.id === "L4");
assert(l4 !== undefined, "L4 is projected");
same(l4.classificationPath, "representation/recursive-alphabet/prefix-codec", "L4 hierarchy");
same(l4.statementDigest, "f740e98eade6204d", "L4 statement digest");
same(l4.docPath, "docs/specs/Ачисла и сериализация.md", "L4 Markdown owner");
same(l4.docAnchor, "mts-law-L4", "L4 Markdown anchor");

const contract = JSON.parse(
  readFileSync(resolve(repositoryRoot, ir.contractPath), "utf8"),
) as { requiredSemanticLaws: Record<string, string> };
same(l4.statement, contract.requiredSemanticLaws.L4, "statement comes through compiler from contract authority");

const clone = JSON.parse(JSON.stringify(ir)) as any;
clone.requirements.push({ ...clone.requirements[0] });
let rejected = false;
try { validateSemanticIr(clone); } catch { rejected = true; }
assert(rejected, "duplicate requirement IDs fail closed");

const badDependency = JSON.parse(JSON.stringify(ir)) as any;
badDependency.requirements[0].dependsOn = ["NO_SUCH_REQUIREMENT"];
rejected = false;
try { validateSemanticIr(badDependency); } catch { rejected = true; }
assert(rejected, "unknown dependencies fail closed");

rejected = false;
try { validateSemanticIr({ schema: ir.schema, contract: ir.contract, contractPath: ir.contractPath }); } catch { rejected = true; }
assert(rejected, "missing requirement array fails closed");

console.log("Contract Observatory P3a semantic IR bridge: GREEN requirements=13 source=MTS_COMPILER");
