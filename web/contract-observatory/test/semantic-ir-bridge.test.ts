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
same(ir.contract, "mts-contract/v0.15", "current compiler contract");
same(ir.contractPath, "contracts/mts-contract-v0.15.json", "current compiler contract path");
same(ir.requirements.length, 48, "accepted v0.15 requirement count");

const ids = ir.requirements.map((item) => item.id);
same(new Set(ids).size, 48, "stable requirement IDs are unique");
const authority = ir.requirements.find((item) => item.id === "V15-AUTH-01");
assert(authority !== undefined, "V15-AUTH-01 is projected");
same(authority.classificationPath, "v015/auth", "V15-AUTH-01 hierarchy");
assert(/^[0-9a-f]{16}$/.test(authority.statementDigest), "V15-AUTH-01 statement digest is stable-shape");
same(authority.docPath, "docs/specs/Формальная нотация МТС.md", "V15-AUTH-01 Markdown owner");
same(authority.docAnchor, "mts-v015-v15-auth-01", "V15-AUTH-01 Markdown anchor");

const contract = JSON.parse(
  readFileSync(resolve(repositoryRoot, ir.contractPath), "utf8"),
) as { requiredSemanticLaws: Record<string, string> };
same(authority.statement, contract.requiredSemanticLaws["V15-AUTH-01"], "statement comes through compiler from contract authority");

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

console.log("Contract Observatory P3a semantic IR bridge: GREEN requirements=48 source=MTS_COMPILER current=v0.15");
