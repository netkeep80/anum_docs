import {
  existsSync,
  readFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import {
  THEOREM_CATALOG_INTEGRATION_CONTRACT,
  collectCurrentTheoremEvidenceRecordPaths,
} from "./theorem-projection-contract.js";
export type TheoremProjectionEvidenceLane =
  | "typescript"
  | "lean4"
  | "coq"
  | "mtsNative"
  | "aprover";
export interface TheoremProjectionLaneAuthority {
  role: string;
  proofAuthority: string;
}
export interface TheoremProjectionEvidenceArtifact {
  path: string;
  sha256: string;
}
export interface TheoremProjectionEvidenceRecord {
  schema: string;
  theoremId: string;
  lane: string;
  result: string;
  authority: string;
  mts: {
    acceptedVersion: string;
    sourceCommitSha: string;
    contractBlobSha?: string;
    theoryRevision?: string;
  };
  proofSource: {
    repository: string;
    commitSha: string;
    toolchain?: {
      name: string;
      pin: string;
    };
  };
  assumptions: string[];
  dependencies: string[];
  artifacts: TheoremProjectionEvidenceArtifact[];
  notes?: string;
}
export interface TheoremProjectionEvidence {
  kind: "executable-witness" | "evidence-record";
  lane: TheoremProjectionEvidenceLane;
  path: string;
  role: string;
  proofAuthority: string;
  record?: TheoremProjectionEvidenceRecord;
}
export interface TheoremProjectionNativeAssurance {
  id: string;
  classification: string;
  independent: boolean;
  kernelLaw?: string;
  evidenceRecord?: string;
  components?: unknown[];
  evidence: unknown[];
  overclaimVeto: string[];
}
export interface TheoremProjectionFormalV015 {
  migrationStatus: string;
  proofClosure: string | null;
  formalStatement: string | null;
  formalPremises: string[];
  formalSourcePath: string | null;
  aproverStatus: string | null;
}
export interface TheoremProjectionTheorem {
  id: string;
  statement: string;
  origin: string | null;
  wave: string | null;
  lawRefs: string[];
  assumptions: string[];
  formalPremises: string[];
  formalV015: TheoremProjectionFormalV015;
  dependsOn: string[];
  scope: unknown;
  exclusions: unknown;
  evidence: Record<TheoremProjectionEvidenceLane, TheoremProjectionEvidence[]>;
  externalAssurance: {
    id: string;
    lean4: string[];
    rocq: string[];
  };
  nativeAssurance: TheoremProjectionNativeAssurance | null;
  provenance: {
    currentIndex: string;
    formalOverlay: string;
    laneAuthority: string;
    externalAssurance: string;
    nativeAssurance: string;
    semanticLawInventory: string;
    evidenceRecords: string[];
  };
}
export interface TheoremProjectionModel {
  schema: "mts-theorem-projection-model/v0.2";
  mtsVersion: string;
  formalCandidateVersion: string;
  sourceInventory: "theorems/current-v0.14.json";
  formalOverlay: "theorems/formal-v0.15.json";
  authority: {
    theoremInventory: string;
    formalOverlay: string;
    laneRoles: string;
    externalAssurance: string;
    nativeAssurance: string;
    semanticLawInventory: string;
    markdown: "derived-projection-only";
  };
  lanes: Record<TheoremProjectionEvidenceLane, TheoremProjectionLaneAuthority>;
  theorems: TheoremProjectionTheorem[];
}
export interface TheoremProjectionSources {
  currentIndex: any;
  formalOverlay: any;
  provers: any;
  externalAssurance: any;
  nativeAssurance: any;
  semanticLawInventory: any;
  evidenceRecords: Record<string, any>;
  availablePaths: string[];
}
const LANES: readonly TheoremProjectionEvidenceLane[] =
  THEOREM_CATALOG_INTEGRATION_CONTRACT.readModel
    .evidenceLanes as readonly TheoremProjectionEvidenceLane[];
function fail(message: string): never {
  throw new Error(`theorem-projection-model: ${message}`);
}
function object(value: unknown, label: string): Record<string, any> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail(`${label} must be an object`);
  }
  return value as Record<string, any>;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    return fail(`${label} must be a non-empty string`);
  }
  return value;
}
function optionalText(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  return text(value, label);
}
function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) return fail(`${label} must be an array`);
  return value.map((item, index) => text(item, `${label}[${index}]`));
}
function jsonClone<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}
function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
function findRepositoryRoot(start = process.cwd()): string {
  let current = resolve(start);
  while (true) {
    if (existsSync(resolve(current, "theorems", "current-v0.14.json"))) return current;
    const parent = dirname(current);
    if (parent === current) return fail(`cannot locate repository root from ${start}`);
    current = parent;
  }
}
function readJson(root: string, path: string): any {
  try {
    return JSON.parse(readFileSync(resolve(root, path), "utf8"));
  } catch (error) {
    return fail(
      `cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
function laneAuthorities(proversValue: unknown): Record<
  TheoremProjectionEvidenceLane,
  TheoremProjectionLaneAuthority
> {
  const provers = object(proversValue, "proofs/provers.json");
  const lanesSource = object(provers.lanes, "proofs/provers.json.lanes");
  const result = {} as Record<
    TheoremProjectionEvidenceLane,
    TheoremProjectionLaneAuthority
  >;
  for (const lane of LANES) {
    const source = object(lanesSource[lane], `proofs/provers.json.lanes.${lane}`);
    result[lane] = Object.freeze({
      role: text(source.role, `proofs/provers.json.lanes.${lane}.role`),
      proofAuthority: text(
        source.proofAuthority,
        `proofs/provers.json.lanes.${lane}.proofAuthority`,
      ),
    });
  }
  return Object.freeze(result);
}
function normalizeEvidenceRecord(
  value: unknown,
  path: string,
  theoremId: string,
  lane: Exclude<TheoremProjectionEvidenceLane, "typescript">,
  available: ReadonlySet<string>,
): TheoremProjectionEvidenceRecord {
  const record = object(value, path);
  const recordTheoremId = text(record.theoremId, `${path}.theoremId`);
  if (recordTheoremId !== theoremId) {
    fail(`evidence theorem mismatch for ${theoremId}: ${recordTheoremId} at ${path}`);
  }
  const recordLane = text(record.lane, `${path}.lane`);
  if (recordLane !== lane) {
    fail(`evidence lane mismatch for ${theoremId}: expected ${lane}, found ${recordLane} at ${path}`);
  }
  const mtsSource = object(record.mts, `${path}.mts`);
  const proofSource = object(record.proofSource, `${path}.proofSource`);
  const artifactsSource = Array.isArray(record.artifacts)
    ? record.artifacts
    : fail(`${path}.artifacts must be an array`);
  const artifacts = artifactsSource.map((value: unknown, index: number) => {
    const artifact = object(value, `${path}.artifacts[${index}]`);
    const artifactPath = text(artifact.path, `${path}.artifacts[${index}].path`);
    if (!available.has(artifactPath)) {
      fail(`registered artifact path does not exist: ${artifactPath}`);
    }
    return Object.freeze({
      path: artifactPath,
      sha256: text(artifact.sha256, `${path}.artifacts[${index}].sha256`),
    });
  });
  let toolchain: { name: string; pin: string } | undefined;
  if (proofSource.toolchain !== undefined) {
    const source = object(proofSource.toolchain, `${path}.proofSource.toolchain`);
    toolchain = Object.freeze({
      name: text(source.name, `${path}.proofSource.toolchain.name`),
      pin: text(source.pin, `${path}.proofSource.toolchain.pin`),
    });
  }
  const result: TheoremProjectionEvidenceRecord = {
    schema: text(record.schema, `${path}.schema`),
    theoremId: recordTheoremId,
    lane: recordLane,
    result: text(record.result, `${path}.result`),
    authority: text(record.authority, `${path}.authority`),
    mts: Object.freeze({
      acceptedVersion: text(mtsSource.acceptedVersion, `${path}.mts.acceptedVersion`),
      sourceCommitSha: text(mtsSource.sourceCommitSha, `${path}.mts.sourceCommitSha`),
      ...(mtsSource.contractBlobSha === undefined
        ? {}
        : { contractBlobSha: text(mtsSource.contractBlobSha, `${path}.mts.contractBlobSha`) }),
      ...(mtsSource.theoryRevision === undefined
        ? {}
        : { theoryRevision: text(mtsSource.theoryRevision, `${path}.mts.theoryRevision`) }),
    }),
    proofSource: Object.freeze({
      repository: text(proofSource.repository, `${path}.proofSource.repository`),
      commitSha: text(proofSource.commitSha, `${path}.proofSource.commitSha`),
      ...(toolchain === undefined ? {} : { toolchain }),
    }),
    assumptions: Object.freeze(strings(record.assumptions, `${path}.assumptions`)) as string[],
    dependencies: Object.freeze(strings(record.dependencies, `${path}.dependencies`)) as string[],
    artifacts: Object.freeze(artifacts) as TheoremProjectionEvidenceArtifact[],
    ...(record.notes === undefined ? {} : { notes: text(record.notes, `${path}.notes`) }),
  };
  return Object.freeze(result);
}
function normalizeNativeAssurance(value: unknown): TheoremProjectionNativeAssurance {
  const source = object(value, "native assurance target");
  const result: TheoremProjectionNativeAssurance = {
    id: text(source.id, "native assurance target.id"),
    classification: text(source.classification, "native assurance target.classification"),
    independent:
      typeof source.independent === "boolean"
        ? source.independent
        : fail("native assurance target.independent must be boolean"),
    ...(source.kernelLaw === undefined
      ? {}
      : { kernelLaw: text(source.kernelLaw, "native assurance target.kernelLaw") }),
    ...(source.evidenceRecord === undefined
      ? {}
      : { evidenceRecord: text(source.evidenceRecord, "native assurance target.evidenceRecord") }),
    ...(source.components === undefined
      ? {}
      : {
          components: Array.isArray(source.components)
            ? jsonClone(source.components)
            : fail("native assurance target.components must be an array"),
        }),
    evidence: Array.isArray(source.evidence)
      ? jsonClone(source.evidence)
      : fail("native assurance target.evidence must be an array"),
    overclaimVeto: strings(source.overclaimVeto, "native assurance target.overclaimVeto"),
  };
  return Object.freeze(result);
}
function pathSet(sources: TheoremProjectionSources): Set<string> {
  return new Set(strings(sources.availablePaths, "availablePaths"));
}
function indexTargets(value: unknown, label: string): Map<string, Record<string, any>> {
  const source = object(value, label);
  if (!Array.isArray(source.targets)) return fail(`${label}.targets must be an array`);
  const result = new Map<string, Record<string, any>>();
  for (const [index, raw] of source.targets.entries()) {
    const target = object(raw, `${label}.targets[${index}]`);
    const id = text(target.id, `${label}.targets[${index}].id`);
    if (result.has(id)) fail(`${label} has duplicate target ${id}`);
    result.set(id, target);
  }
  return result;
}
function theoremEvidence(
  theorem: Record<string, any>,
  theoremId: string,
  authorities: Record<TheoremProjectionEvidenceLane, TheoremProjectionLaneAuthority>,
  records: Record<string, any>,
  available: ReadonlySet<string>,
): Record<TheoremProjectionEvidenceLane, TheoremProjectionEvidence[]> {
  const source = object(theorem.evidence, `${theoremId}.evidence`);
  const result = {} as Record<
    TheoremProjectionEvidenceLane,
    TheoremProjectionEvidence[]
  >;
  for (const lane of LANES) {
    const paths = strings(source[lane], `${theoremId}.evidence.${lane}`);
    result[lane] = paths.map((path) => {
      if (!available.has(path)) {
        fail(`registered path does not exist for ${theoremId}/${lane}: ${path}`);
      }
      const authority = authorities[lane];
      if (lane === "typescript") {
        return Object.freeze({
          kind: "executable-witness" as const,
          lane,
          path,
          role: authority.role,
          proofAuthority: authority.proofAuthority,
        });
      }
      const record = records[path];
      if (record === undefined) fail(`missing evidence record ${path} for ${theoremId}/${lane}`);
      return Object.freeze({
        kind: "evidence-record" as const,
        lane,
        path,
        role: authority.role,
        proofAuthority: authority.proofAuthority,
        record: normalizeEvidenceRecord(record, path, theoremId, lane, available),
      });
    });
    Object.freeze(result[lane]);
  }
  return Object.freeze(result);
}
function collectRepositoryPaths(
  root: string,
  currentIndex: any,
  formalOverlay: any,
  nativeAssurance: any,
  evidenceRecords: Record<string, any>,
): string[] {
  const paths = new Set<string>(THEOREM_CATALOG_INTEGRATION_CONTRACT.fixedSources);
  const theorems = Array.isArray(currentIndex.theorems)
    ? currentIndex.theorems
    : fail("current theorem index must contain theorems[]");
  for (const theoremValue of theorems) {
    const theorem = object(theoremValue, "current theorem");
    const evidence = object(theorem.evidence, "current theorem.evidence");
    for (const lane of LANES) {
      for (const path of strings(evidence[lane], `current theorem.evidence.${lane}`)) {
        paths.add(path);
      }
    }
  }
  const overlay = object(formalOverlay, "theorems/formal-v0.15.json");
  if (!Array.isArray(overlay.entries)) {
    fail("formal theorem overlay must contain entries[]");
  }
  for (const [index, entryValue] of overlay.entries.entries()) {
    const entry = object(entryValue, `formal theorem overlay.entries[${index}]`);
    paths.add(text(entry.formalSourcePath, `formal theorem overlay.entries[${index}].formalSourcePath`));
  }
  for (const [path, recordValue] of Object.entries(evidenceRecords)) {
    paths.add(path);
    const record = object(recordValue, path);
    if (!Array.isArray(record.artifacts)) continue;
    for (const [index, artifactValue] of record.artifacts.entries()) {
      const artifact = object(artifactValue, `${path}.artifacts[${index}]`);
      paths.add(text(artifact.path, `${path}.artifacts[${index}].path`));
    }
  }
  const native = object(nativeAssurance, "proofs/native-proof-assurance.json");
  if (Array.isArray(native.targets)) {
    for (const targetValue of native.targets) {
      const target = object(targetValue, "native assurance target");
      if (typeof target.evidenceRecord === "string") paths.add(target.evidenceRecord);
      if (!Array.isArray(target.evidence)) continue;
      for (const evidenceValue of target.evidence) {
        const evidence = object(evidenceValue, "native assurance evidence");
        paths.add(text(evidence.path, "native assurance evidence.path"));
      }
    }
  }
  const sorted = [...paths].sort();
  for (const path of sorted) {
    if (!existsSync(resolve(root, path))) fail(`registered path does not exist: ${path}`);
  }
  return sorted;
}
export function loadRepositoryTheoremProjectionSources(
  root = findRepositoryRoot(),
): TheoremProjectionSources {
  const currentIndex = readJson(root, "theorems/current-v0.14.json");
  const formalOverlay = readJson(root, "theorems/formal-v0.15.json");
  const provers = readJson(root, "proofs/provers.json");
  const externalAssurance = readJson(root, "proofs/external-proof-assurance.json");
  const nativeAssurance = readJson(root, "proofs/native-proof-assurance.json");
  const semanticLawInventory = readJson(root, "contracts/mts-contract-v0.14.json");
  const evidenceRecords: Record<string, any> = {};
  for (const path of collectCurrentTheoremEvidenceRecordPaths(currentIndex)) {
    evidenceRecords[path] = readJson(root, path);
  }
  return {
    currentIndex,
    formalOverlay,
    provers,
    externalAssurance,
    nativeAssurance,
    semanticLawInventory,
    evidenceRecords,
    availablePaths: collectRepositoryPaths(
      root,
      currentIndex,
      formalOverlay,
      nativeAssurance,
      evidenceRecords,
    ),
  };
}
export function buildTheoremProjectionModel(
  sources: TheoremProjectionSources,
): TheoremProjectionModel {
  const current = object(sources.currentIndex, "theorems/current-v0.14.json");
  if (current.schema !== "mts-current-theorem-index/v0.1") {
    fail("unexpected current theorem index schema");
  }
  const mtsVersion = text(current.mtsVersion, "current theorem index.mtsVersion");
  const theoremSources = Array.isArray(current.theorems)
    ? current.theorems.map((value: unknown, index: number) =>
        object(value, `current theorem index.theorems[${index}]`),
      )
    : fail("current theorem index.theorems must be an array");
  const theoremIds = theoremSources.map((theorem) => text(theorem.id, "theorem.id"));
  if (new Set(theoremIds).size !== theoremIds.length) fail("duplicate current theorem id");
  const theoremIdSet = new Set(theoremIds);

  const overlay = object(sources.formalOverlay, "theorems/formal-v0.15.json");
  if (overlay.schema !== "mts-formal-theorem-overlay/v0.1") {
    fail("unexpected FORMAL theorem overlay schema");
  }
  if (overlay.baseInventory !== "theorems/current-v0.14.json") {
    fail("FORMAL theorem overlay base inventory mismatch");
  }
  if (overlay.authority !== "formal-migration-descriptor-only") {
    fail("FORMAL theorem overlay must not claim proof authority");
  }
  const formalCandidateVersion = text(
    overlay.mtsVersion,
    "FORMAL theorem overlay.mtsVersion",
  );
  if (!Array.isArray(overlay.entries)) {
    fail("FORMAL theorem overlay must contain entries[]");
  }
  const formalById = new Map<string, TheoremProjectionFormalV015>();
  for (const [index, raw] of overlay.entries.entries()) {
    const entry = object(raw, `FORMAL theorem overlay.entries[${index}]`);
    const id = text(entry.id, `FORMAL theorem overlay.entries[${index}].id`);
    if (!theoremIdSet.has(id)) fail(`FORMAL theorem overlay has non-current theorem ${id}`);
    if (formalById.has(id)) fail(`FORMAL theorem overlay has duplicate theorem ${id}`);
    const migrationStatus = text(entry.migrationStatus, `${id}.migrationStatus`);
    if (migrationStatus !== "FORMAL_MIGRATED") {
      fail(`${id}.migrationStatus must be FORMAL_MIGRATED`);
    }
    const proofClosure = text(entry.proofClosure, `${id}.proofClosure`);
    if (proofClosure !== "CLOSED" && proofClosure !== "OPEN_CONDITIONAL") {
      fail(`${id}.proofClosure must be CLOSED or OPEN_CONDITIONAL`);
    }
    const formalStatement = text(entry.formalStatement, `${id}.formalStatement`);
    const formalPremises = strings(entry.formalPremises, `${id}.formalPremises`);
    const formalSourcePath = text(entry.formalSourcePath, `${id}.formalSourcePath`);
    const aproverStatus = text(entry.aproverStatus, `${id}.aproverStatus`);
    if (!sources.availablePaths.includes(formalSourcePath)) {
      fail(`${id}.formalSourcePath does not exist: ${formalSourcePath}`);
    }
    formalById.set(id, Object.freeze({
      migrationStatus,
      proofClosure,
      formalStatement,
      formalPremises: Object.freeze(formalPremises) as string[],
      formalSourcePath,
      aproverStatus,
    }));
  }

  const lawInventory = object(
    object(sources.semanticLawInventory, "contracts/mts-contract-v0.14.json")
      .requiredSemanticLaws,
    "contracts/mts-contract-v0.14.json.requiredSemanticLaws",
  );
  const acceptedLawIds = new Set(Object.keys(lawInventory));
  if (acceptedLawIds.size === 0) fail("accepted semantic law inventory is empty");
  const authorities = laneAuthorities(sources.provers);
  const externalTargets = indexTargets(
    sources.externalAssurance,
    "proofs/external-proof-assurance.json",
  );
  const nativeTargets = indexTargets(
    sources.nativeAssurance,
    "proofs/native-proof-assurance.json",
  );
  const available = pathSet(sources);
  if (externalTargets.size !== theoremIdSet.size) {
    fail("external assurance target set differs from current theorem inventory");
  }
  for (const id of externalTargets.keys()) {
    if (!theoremIdSet.has(id)) fail(`external assurance has non-current theorem ${id}`);
  }
  for (const id of nativeTargets.keys()) {
    if (!theoremIdSet.has(id)) fail(`native assurance has non-current theorem ${id}`);
  }
  const theorems = theoremSources.map((source): TheoremProjectionTheorem => {
    const id = text(source.id, "theorem.id");
    const lawRefs = strings(source.lawRefs, `${id}.lawRefs`);
    for (const lawRef of lawRefs) {
      if (!acceptedLawIds.has(lawRef)) {
        fail(`unresolved accepted law for ${id}: ${lawRef}`);
      }
    }
    const dependsOn = strings(source.dependsOn, `${id}.dependsOn`);
    for (const dependency of dependsOn) {
      if (!theoremIdSet.has(dependency)) {
        fail(`unresolved theorem dependency for ${id}: ${dependency}`);
      }
    }
    const assumptions = strings(source.assumptions, `${id}.assumptions`);
    const formalPremises = strings(source.formalPremises, `${id}.formalPremises`);
    const formalV015 = formalById.get(id) ?? Object.freeze({
      migrationStatus: "NOT_MIGRATED",
      proofClosure: null,
      formalStatement: null,
      formalPremises: Object.freeze([]) as string[],
      formalSourcePath: null,
      aproverStatus: null,
    });
    const evidence = theoremEvidence(
      source,
      id,
      authorities,
      sources.evidenceRecords,
      available,
    );
    for (const lane of LANES) {
      for (const item of evidence[lane]) {
        if (item.record === undefined) continue;
        if (!sameStrings(item.record.assumptions, assumptions)) {
          fail(`evidence assumptions mismatch for ${id}/${lane}: ${item.path}`);
        }
        if (!sameStrings(item.record.dependencies, dependsOn)) {
          fail(`evidence dependencies mismatch for ${id}/${lane}: ${item.path}`);
        }
      }
    }
    const external = externalTargets.get(id);
    if (external === undefined) fail(`external assurance missing theorem ${id}`);
    const externalProjection = Object.freeze({
      id,
      lean4: Object.freeze(strings(external.lean4, `external assurance ${id}.lean4`)) as string[],
      rocq: Object.freeze(strings(external.rocq, `external assurance ${id}.rocq`)) as string[],
    });
    const currentExternal = object(source.externalAssurance, `${id}.externalAssurance`);
    if (
      !sameStrings(strings(currentExternal.lean4, `${id}.externalAssurance.lean4`), externalProjection.lean4) ||
      !sameStrings(strings(currentExternal.rocq, `${id}.externalAssurance.rocq`), externalProjection.rocq)
    ) {
      fail(`external assurance mismatch for ${id}`);
    }
    const nativeSource = nativeTargets.get(id);
    const nativeAssurance =
      nativeSource === undefined ? null : normalizeNativeAssurance(nativeSource);
    if (evidence.mtsNative.length > 0 && nativeAssurance === null) {
      fail(`mtsNative evidence for ${id} has no native assurance authority`);
    }
    if (
      nativeAssurance?.classification === "DERIVED_CLOSED_PROOF_ANET" &&
      evidence.mtsNative.length === 0
    ) {
      fail(`derived native assurance for ${id} has no mtsNative evidence record`);
    }
    if (
      nativeAssurance?.evidenceRecord !== undefined &&
      !evidence.mtsNative.some((item) => item.path === nativeAssurance.evidenceRecord)
    ) {
      fail(`native assurance evidenceRecord mismatch for ${id}: ${nativeAssurance.evidenceRecord}`);
    }
    if (nativeAssurance !== null) {
      for (const raw of nativeAssurance.evidence) {
        const item = object(raw, `native assurance ${id}.evidence`);
        const path = text(item.path, `native assurance ${id}.evidence.path`);
        if (!available.has(path)) fail(`registered native assurance path does not exist: ${path}`);
      }
    }
    const evidenceRecordPaths = LANES.flatMap((lane) =>
      evidence[lane]
        .filter((item) => item.kind === "evidence-record")
        .map((item) => item.path),
    );
    return Object.freeze({
      id,
      statement: text(source.statement, `${id}.statement`),
      origin: optionalText(source.origin, `${id}.origin`),
      wave: optionalText(source.wave, `${id}.wave`),
      lawRefs: Object.freeze(lawRefs) as string[],
      assumptions: Object.freeze(assumptions) as string[],
      formalPremises: Object.freeze(formalPremises) as string[],
      formalV015,
      dependsOn: Object.freeze(dependsOn) as string[],
      scope: jsonClone(source.scope),
      exclusions: jsonClone(source.exclusions),
      evidence,
      externalAssurance: externalProjection,
      nativeAssurance,
      provenance: Object.freeze({
        currentIndex: "theorems/current-v0.14.json",
        formalOverlay: "theorems/formal-v0.15.json",
        laneAuthority: "proofs/provers.json",
        externalAssurance: "proofs/external-proof-assurance.json",
        nativeAssurance: "proofs/native-proof-assurance.json",
        semanticLawInventory: "contracts/mts-contract-v0.14.json",
        evidenceRecords: Object.freeze(evidenceRecordPaths) as string[],
      }),
    });
  });
  return Object.freeze({
    schema: "mts-theorem-projection-model/v0.2" as const,
    mtsVersion,
    formalCandidateVersion,
    sourceInventory: "theorems/current-v0.14.json" as const,
    formalOverlay: "theorems/formal-v0.15.json" as const,
    authority: Object.freeze({
      ...THEOREM_CATALOG_INTEGRATION_CONTRACT.authority,
    }),
    lanes: authorities,
    theorems: Object.freeze(theorems) as TheoremProjectionTheorem[],
  });
}
export function loadRepositoryTheoremProjectionModel(
  root = findRepositoryRoot(),
): TheoremProjectionModel {
  return buildTheoremProjectionModel(loadRepositoryTheoremProjectionSources(root));
}
