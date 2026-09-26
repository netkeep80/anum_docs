import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface ObservatoryRequirement {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly classificationPath: string;
  readonly order: number;
  readonly dependsOn: readonly string[];
  readonly statement: string;
  readonly statementDigest: string;
  readonly authorityDocument: string;
  readonly authorityPointer: string;
  readonly traceabilityPath: string;
  readonly positiveVectorCount: number;
  readonly negativeVectorCount: number;
  readonly executableGateCount: number;
  readonly docPath: string;
  readonly docAnchor: string;
}

export interface ObservatorySemanticIr {
  readonly schema: string;
  readonly contract: string;
  readonly contractPath: string;
  readonly requirements: readonly ObservatoryRequirement[];
}

type JsonRecord = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(`Contract Observatory semantic IR bridge: ${message}`);
}

function record(value: unknown, source: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${source} must be an object`);
  return value as JsonRecord;
}

function string(value: unknown, source: string): string {
  if (typeof value !== "string" || value.length === 0) fail(`${source} must be a non-empty string`);
  return value;
}

function number(value: unknown, source: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${source} must be a finite number`);
  return value;
}

function strings(value: unknown, source: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    fail(`${source} must be a string array`);
  }
  return Object.freeze([...(value as string[])]);
}

export function loadCompiledMtsSemanticIr(repositoryRoot: string): ObservatorySemanticIr {
  const root = resolve(repositoryRoot);
  const compilerPath = resolve(root, "ts", "dist", "src", "tooling", "mts-compiler.js");
  const compilerUrl = pathToFileURL(compilerPath).href;
  const program = [
    `import { loadMtsSemanticIr } from ${JSON.stringify(compilerUrl)};`,
    `process.stdout.write(JSON.stringify(loadMtsSemanticIr(${JSON.stringify(root)})));`,
  ].join("\n");

  let output: string;
  try {
    output = execFileSync(process.execPath, ["--input-type=module", "--eval", program], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`MTS Compiler invocation failed: ${detail}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    fail("MTS Compiler returned malformed JSON");
  }
  return validateSemanticIr(parsed);
}

export function validateSemanticIr(value: unknown): ObservatorySemanticIr {
  const root = record(value, "IR");
  const requirementsRaw = root.requirements;
  if (!Array.isArray(requirementsRaw)) fail("IR.requirements must be an array");

  const ids = new Set<string>();
  const requirements = requirementsRaw.map((raw, index) => {
    const item = record(raw, `IR.requirements[${index}]`);
    const id = string(item.id, `IR.requirements[${index}].id`);
    if (ids.has(id)) fail(`duplicate requirement id ${id}`);
    ids.add(id);

    const result: ObservatoryRequirement = Object.freeze({
      id,
      kind: string(item.kind, `${id}.kind`),
      status: string(item.status, `${id}.status`),
      classificationPath: string(item.classificationPath, `${id}.classificationPath`),
      order: number(item.order, `${id}.order`),
      dependsOn: strings(item.dependsOn, `${id}.dependsOn`),
      statement: string(item.statement, `${id}.statement`),
      statementDigest: string(item.statementDigest, `${id}.statementDigest`),
      authorityDocument: string(item.authorityDocument, `${id}.authorityDocument`),
      authorityPointer: string(item.authorityPointer, `${id}.authorityPointer`),
      traceabilityPath: string(item.traceabilityPath, `${id}.traceabilityPath`),
      positiveVectorCount: number(item.positiveVectorCount, `${id}.positiveVectorCount`),
      negativeVectorCount: number(item.negativeVectorCount, `${id}.negativeVectorCount`),
      executableGateCount: number(item.executableGateCount, `${id}.executableGateCount`),
      docPath: string(item.docPath, `${id}.docPath`),
      docAnchor: string(item.docAnchor, `${id}.docAnchor`),
    });
    return result;
  });

  for (const item of requirements) {
    for (const dependency of item.dependsOn) {
      if (!ids.has(dependency)) fail(`${item.id} depends on unknown requirement ${dependency}`);
    }
  }

  return Object.freeze({
    schema: string(root.schema, "IR.schema"),
    contract: string(root.contract, "IR.contract"),
    contractPath: string(root.contractPath, "IR.contractPath"),
    requirements: Object.freeze(requirements),
  });
}
