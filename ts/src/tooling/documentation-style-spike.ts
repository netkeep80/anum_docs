import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadRepositoryTheoremProjectionModel,
  type TheoremProjectionEvidenceLane,
  type TheoremProjectionModel,
  type TheoremProjectionTheorem,
} from "./theorem-projection-model.js";
import { findRepositoryRoot } from "./docs-sync.js";

/** Research-only presentation over the EXISTING theorem model (#2080).
 * Not a new authority, proof protocol or generated current document.
 */
export type MtsDocumentationStyle = "academic" | "reference" | "evidence-first";
export const MTS_DOCUMENTATION_STYLES: readonly MtsDocumentationStyle[] =
  Object.freeze(["academic", "reference", "evidence-first"]);
export interface MtsDocumentationPreviewRequest {
  readonly model: TheoremProjectionModel;
  readonly theoremId: string;
  readonly style: MtsDocumentationStyle;
  readonly sourceCommitSha: string;
}
const LANES: readonly TheoremProjectionEvidenceLane[] =
  ["typescript", "lean4", "coq", "mtsNative", "aprover"];
const LANE_NAMES: Readonly<Record<TheoremProjectionEvidenceLane, string>> = {
  typescript: "TypeScript",
  lean4: "Lean4",
  coq: "Rocq",
  mtsNative: "MTS-native",
  aprover: "aprover",
};
const marker = String.fromCharCode(96);
function fail(value: string): never {
  throw new Error("documentation-style-spike: " + value);
}
function quoted(value: string): string {
  if (value.includes(marker)) return "'" + value.replace(/'/g, "’") + "'";
  return marker + value + marker;
}
function sourceBlock(value: string): string {
  return ["~~~text", value, "~~~"].join("\n");
}
function pretty(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
}
function repoLink(path: string, sha: string): string {
  if (path.startsWith("/") || path.includes("..") || path.includes("\\") || !path)
    return fail("unsafe model source path");
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return "[" + quoted(path) + "](https://github.com/netkeep80/anum_docs/blob/" + sha + "/" + encoded + ")";
}
function status(theorem: TheoremProjectionTheorem): string {
  if (theorem.formalV015.migrationStatus === "NOT_MIGRATED")
    return "FORMAL v0.15: формулировка не мигрирована. Исторические свидетельства не повышаются до нативного доказательства.";
  return "FORMAL v0.15: " + quoted(theorem.formalV015.migrationStatus) +
    "; формулировка **не означает нового доказательства**.";
}
function evidenceCounts(theorem: TheoremProjectionTheorem): string {
  return LANES.map((lane) => LANE_NAMES[lane] + ": " + theorem.evidence[lane].length).join(" · ");
}
function facts(theorem: TheoremProjectionTheorem, sha: string): string[] {
  const result = [
    "**Исходная формулировка**",
    "",
    sourceBlock(theorem.statement),
    "",
    "**Область действия:** " + quoted(pretty(theorem.scope)),
    "",
    "**Ограничения:** " + quoted(pretty(theorem.exclusions)),
    "",
    "**Состояние FORMAL:** " + status(theorem),
  ];
  if (theorem.formalV015.migrationStatus !== "NOT_MIGRATED" &&
      theorem.formalV015.formalStatement !== null) {
    result.push("", "**FORMAL-формулировка (не доказательство)**", "",
      sourceBlock(theorem.formalV015.formalStatement));
  }
  return [
    ...result,
    "",
    "**Свидетельства:** " + evidenceCounts(theorem),
    "",
    "**Источники моделей:** " + repoLink(theorem.provenance.currentIndex, sha) +
      " · " + repoLink(theorem.provenance.formalOverlay, sha),
  ];
}
function provenance(theorem: TheoremProjectionTheorem, sha: string): string[] {
  const output = [
    "<details>",
    "<summary>Предпосылки, зависимости и исходные свидетельства</summary>",
    "",
    "- **Зависимости:** " +
      (theorem.dependsOn.length ? theorem.dependsOn.map(quoted).join(", ") : "нет"),
    "- **Формальные предпосылки:** " +
      (theorem.formalPremises.length ? theorem.formalPremises.map(quoted).join(", ") : "не зарегистрированы"),
  ];
  for (const lane of LANES) {
    for (const evidence of theorem.evidence[lane])
      output.push("- **" + LANE_NAMES[lane] + ":** " +
        repoLink(evidence.path, sha) + " — authority " + quoted(evidence.proofAuthority));
  }
  return [...output, "", "</details>"];
}
function academic(theorem: TheoremProjectionTheorem, sha: string): string[] {
  return [
    "## Теорема " + theorem.id,
    "",
    "> **Статус доказательства не выводится из вида документа.** " + status(theorem),
    "",
    "### Утверждение",
    "",
    ...facts(theorem, sha),
    "",
    "### Предпосылки и происхождение",
    "",
    ...provenance(theorem, sha),
  ];
}
function reference(theorem: TheoremProjectionTheorem, sha: string): string[] {
  return [
    "## " + theorem.id + " · справочная карточка",
    "",
    "| Поле | Значение |",
    "| :--- | :--- |",
    "| Идентификатор | " + quoted(theorem.id) + " |",
    "| Миграция FORMAL | " + quoted(theorem.formalV015.migrationStatus) + " |",
    "| Свидетельства | " + evidenceCounts(theorem) + " |",
    "",
    "<details>",
    "<summary>Раскрыть исходную формулировку</summary>",
    "",
    ...facts(theorem, sha),
    "",
    "</details>",
    "",
    ...provenance(theorem, sha),
    "",
    "> Внешнее историческое свидетельство не является нативным aprover-доказательством.",
  ];
}
function evidenceFirst(theorem: TheoremProjectionTheorem, sha: string): string[] {
  const rows = [
    "## " + theorem.id + " · свидетельства и границы",
    "",
    "> **Граница достоверности:** " + status(theorem),
    "",
    "### Проверяемые каналы",
    "",
    "| Канал | Записей | Тип авторитета |",
    "| :--- | ---: | :--- |",
  ];
  for (const lane of LANES)
    rows.push("| " + LANE_NAMES[lane] + " | " + theorem.evidence[lane].length + " | " +
      quoted(theorem.evidence[lane][0]?.proofAuthority ?? "нет свидетельства") + " |");
  return [...rows, "", "### Формулировка", "", ...facts(theorem, sha),
    "", "### Происхождение", "", ...provenance(theorem, sha)];
}
export function renderMtsDocumentationStylePreview(request: MtsDocumentationPreviewRequest): string {
  if (!/^[a-f0-9]{40}$/.test(request.sourceCommitSha))
    fail("sourceCommitSha must be a pinned 40-hex Git commit");
  if (!MTS_DOCUMENTATION_STYLES.includes(request.style)) fail("unsupported style");
  const theorem = request.model.theorems.find((item) => item.id === request.theoremId);
  if (theorem === undefined) fail("theorem not present in source model");
  const rendered = request.style === "academic" ? academic(theorem, request.sourceCommitSha)
    : request.style === "reference" ? reference(theorem, request.sourceCommitSha)
      : evidenceFirst(theorem, request.sourceCommitSha);
  return [
    "<!-- DESIGN SPIKE #2080: NON-NORMATIVE theorem-model projection -->",
    "# Вариант оформления документации МТС",
    "",
    "Профиль: " + quoted(request.style) +
      ". Этот макет **не является семантическим источником или доказательством**.",
    "",
    ...rendered,
    "",
  ].join("\n");
}
const invoked = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invoked === fileURLToPath(import.meta.url)) {
  const args = new Map(process.argv.slice(2).map((arg) => {
    const found = arg.match(/^--([a-z-]+)=(.+)$/);
    if (found === null) fail("expected --key=value");
    return [found[1]!, found[2]!] as const;
  }));
  const style = args.get("style") as MtsDocumentationStyle | undefined;
  if (style === undefined || !MTS_DOCUMENTATION_STYLES.includes(style))
    fail("style must be academic|reference|evidence-first");
  const model = loadRepositoryTheoremProjectionModel(findRepositoryRoot());
  const id = args.get("theorem") ?? model.theorems[0]?.id;
  if (id === undefined) fail("theorem model is empty");
  process.stdout.write(renderMtsDocumentationStylePreview({
    model, theoremId: id, style,
    sourceCommitSha: args.get("source-sha") ?? fail("source-sha required"),
  }));
}
