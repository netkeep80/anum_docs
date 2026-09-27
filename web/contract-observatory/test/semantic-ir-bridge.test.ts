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
same(ir.contract, "mts-contract/v0.14", "current compiler contract");
same(ir.contractPath, "contracts/mts-contract-v0.14.json", "current compiler contract path");
same(ir.requirements.length, 14, "accepted v0.14 requirement count");

const ids = ir.requirements.map((item) => item.id);
same(new Set(ids).size, 14, "stable requirement IDs are unique");
const a4 = ir.requirements.find((item) => item.id === "V14-L12");
assert(a4 !== undefined, "V14-L12 is projected");
same(a4.classificationPath, "theory/foundation/context-relative-chiral-gauge", "V14-L12 hierarchy");
assert(/^[0-9a-f]{16}$/.test(a4.statementDigest), "V14-L12 statement digest is stable-shape");
same(a4.docPath, "docs/theory/Система аксиом МТС.md", "V14-L12 Markdown owner");
same(a4.docAnchor, "mts-v014-v14-l12", "V14-L12 future Markdown anchor");

const contract = JSON.parse(
  readFileSync(resolve(repositoryRoot, ir.contractPath), "utf8"),
) as { requiredSemanticLaws: Record<string, string> };
same(a4.statement, contract.requiredSemanticLaws["V14-L12"], "statement comes through compiler from contract authority");

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

console.log("Contract Observatory P3a semantic IR bridge: GREEN requirements=14 source=MTS_COMPILER");
