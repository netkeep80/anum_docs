import type {
  TheoremProjectionEvidence,
  TheoremProjectionEvidenceLane,
  TheoremProjectionModel,
  TheoremProjectionTheorem,
} from "./theorem-projection-model.js";

export const THEOREM_CATALOG_PATH = "docs/theory/Теоремы МТС.md";

const LANE_ORDER: readonly TheoremProjectionEvidenceLane[] = [
  "typescript",
  "lean4",
  "coq",
  "mtsNative",
  "aprover",
];

const LANE_LABEL: Readonly<Record<TheoremProjectionEvidenceLane, string>> = Object.freeze({
  typescript: "TypeScript",
  lean4: "Lean4",
  coq: "Rocq",
  mtsNative: "MTS-native",
  aprover: "aprover",
});

function tableCell(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

function repositoryLink(path: string): string {
  return `[\`${path}\`](../../${path})`;
}

function inlineCode(value: string): string {
  return `\`${value.replace(/\`/g, "\\`")}\``;
}

function list(values: readonly string[], empty = "нет"): string[] {
  return values.length ? values.map((value) => `- ${inlineCode(value)}`) : [`- ${empty}`];
}

function evidenceSummary(theorem: TheoremProjectionTheorem, lane: TheoremProjectionEvidenceLane): string {
  const count = theorem.evidence[lane].length;
  if (lane === "typescript") return count ? `${count} исполняемых свидетельств` : "—";
  if (lane === "lean4" || lane === "coq") return count ? `${count} внешних проверок` : "—";
  if (lane === "mtsNative") return count ? `${count} нативных записей доказательств` : "—";
  return count ? `${count} независимых повторных прогонов` : "—";
}

function nativeStatus(theorem: TheoremProjectionTheorem): string {
  return theorem.nativeAssurance === null
    ? "текущая; нативная классификация — отсутствует"
    : `текущая; нативная классификация ${theorem.nativeAssurance.classification}`;
}

function renderEvidenceItem(item: TheoremProjectionEvidence): string[] {
  const lines = [
    `  - ${repositoryLink(item.path)} — роль ${inlineCode(item.role)}; доказательный авторитет ${inlineCode(item.proofAuthority)}.`,
  ];
  if (item.record === undefined) return lines;
  lines.push(
    `    - запись: результат ${inlineCode(item.record.result)}; авторитет ${inlineCode(item.record.authority)}; источник доказательства ${inlineCode(`${item.record.proofSource.repository}@${item.record.proofSource.commitSha}`)}.`,
  );
  if (item.record.proofSource.toolchain !== undefined) {
    lines.push(
      `    - инструментарий: ${inlineCode(item.record.proofSource.toolchain.name)} — ${inlineCode(item.record.proofSource.toolchain.pin)}.`,
    );
  }
  for (const artifact of item.record.artifacts) {
    lines.push(
      `    - артефакт: ${repositoryLink(artifact.path)} — хеш ${inlineCode(artifact.sha256)}.`,
    );
  }
  return lines;
}

function renderEvidence(theorem: TheoremProjectionTheorem): string[] {
  const lines = ["### Доказательная база"];
  for (const lane of LANE_ORDER) {
    const authority = theorem.evidence[lane][0];
    const role = authority?.role ?? "";
    const proofAuthority = authority?.proofAuthority ?? "";
    if (lane === "typescript") {
      lines.push(
        `- **TypeScript** — исполняемый свидетель; доказательный авторитет ${inlineCode(proofAuthority || "none")}.`,
      );
    } else if (lane === "lean4" || lane === "coq") {
      lines.push(
        `- **${LANE_LABEL[lane]}** — внешняя перекрёстная проверка; доказательный авторитет ${inlineCode(proofAuthority || "external-only")}.`,
      );
    } else if (lane === "mtsNative") {
      lines.push(
        `- **MTS-native** — нативное доказательство; доказательный авторитет ${inlineCode(proofAuthority || "native-replay-under-exact-theory")}.`,
        `  - зарегистрированных нативных записей доказательств: ${theorem.evidence.mtsNative.length}.`,
      );
    } else {
      lines.push(
        `- **aprover** — независимый повторный прогон потребителем; доказательный авторитет ${inlineCode(proofAuthority || "independent-replay")}.`,
      );
    }
    const items = theorem.evidence[lane];
    if (!items.length) {
      lines.push("  - нет зарегистрированного свидетельства.");
      continue;
    }
    for (const item of items) lines.push(...renderEvidenceItem(item));
    if (role && items.length) {
      // role is rendered from the model and intentionally never inferred from file names.
    }
  }
  return lines;
}

function renderAssurance(theorem: TheoremProjectionTheorem): string[] {
  const lines = [
    "### Подтверждение",
    "- **Внешнее подтверждение Lean4:**",
    ...list(theorem.externalAssurance.lean4).map((line) => `  ${line}`),
    "- **Внешнее подтверждение Rocq:**",
    ...list(theorem.externalAssurance.rocq).map((line) => `  ${line}`),
  ];
  if (theorem.nativeAssurance === null) {
    lines.push("- **Нативное подтверждение:** нет.");
    return lines;
  }
  lines.push(
    `- **Классификация нативного подтверждения:** ${inlineCode(theorem.nativeAssurance.classification)}.`,
    `- **Независимость нативного доказательства:** ${theorem.nativeAssurance.independent ? "да" : "нет"}.`,
  );
  if (theorem.nativeAssurance.kernelLaw !== undefined) {
    lines.push(`- **Доверенный закон ядра:** ${inlineCode(theorem.nativeAssurance.kernelLaw)}.`);
  }
  if (theorem.nativeAssurance.evidenceRecord !== undefined) {
    lines.push(
      `- **Запись нативного доказательства:** ${repositoryLink(theorem.nativeAssurance.evidenceRecord)}.`,
    );
  }
  if (theorem.nativeAssurance.overclaimVeto.length) {
    lines.push("- **Ограничения на усиление вывода:**");
    for (const value of theorem.nativeAssurance.overclaimVeto) lines.push(`  - ${inlineCode(value)}`);
  }
  return lines;
}

function renderFormalV015(theorem: TheoremProjectionTheorem): string[] {
  const formal = theorem.formalV015;
  if (formal.migrationStatus === "NOT_MIGRATED") {
    return [
      "### Формальная запись FORMAL v0.15",
      "- **Статус миграции:** `NOT_MIGRATED`.",
    ];
  }
  return [
    "### Формальная запись FORMAL v0.15",
    `- **Статус миграции:** ${inlineCode(formal.migrationStatus)}.`,
    `- **Замкнутость доказательного артефакта:** ${inlineCode(formal.proofClosure ?? "UNKNOWN")}.`,
    `- **Статус aprover:** ${inlineCode(formal.aproverStatus ?? "UNKNOWN")}.`,
    "- **Каноническая FORMAL-формулировка:**",
    "~~~text",
    formal.formalStatement ?? "",
    "~~~",
    "- **FORMAL-предпосылки исходного доказательства:**",
    ...list(formal.formalPremises).map((line) => `  ${line}`),
    ...(formal.formalSourcePath === null
      ? []
      : [`- **Источник FORMAL:** ${repositoryLink(formal.formalSourcePath)}.`]),
  ];
}

function renderCard(theorem: TheoremProjectionTheorem): string {
  const lines = [
    `<a id="theorem-${theorem.id.toLowerCase()}"></a> <!-- якорь теоремы -->`,
    `## Теорема ${theorem.id}`,
    "",
    `**Статус:** текущая теорема; нативная классификация: ${theorem.nativeAssurance === null ? "нет" : inlineCode(theorem.nativeAssurance.classification)}.`,
    `**Происхождение:** ${theorem.origin === null ? "—" : inlineCode(theorem.origin)}.  `,
    `**Волна:** ${theorem.wave === null ? "—" : inlineCode(theorem.wave)}.`,
    "",
    "**Исходная формулировка:**",
    "~~~text",
    theorem.statement,
    "~~~",
    "",
    ...renderFormalV015(theorem),
    "",
    "**Область действия:**",
    "~~~text",
    String(theorem.scope),
    "~~~",
    "",
    "**Исключения:**",
    "~~~text",
    String(theorem.exclusions),
    "~~~",
    "",
    "### Связи и предпосылки",
    "",
    "**Ссылки на принятые законы:**",
    ...list(theorem.lawRefs),
    "",
    "**Допущения:**",
    ...list(theorem.assumptions),
    "",
    "**Формальные предпосылки:**",
    ...list(theorem.formalPremises),
    "",
    "**Зависит от:**",
    ...(theorem.dependsOn.length
      ? theorem.dependsOn.map(
          (id) => `- [${inlineCode(id)}](#theorem-${id.toLowerCase()})`,
        )
      : ["- нет"]),
    "",
    ...renderEvidence(theorem),
    "",
    ...renderAssurance(theorem),
    "",
    "### Происхождение данных",
    `- Текущий индекс теорем: ${repositoryLink(theorem.provenance.currentIndex)}.`,
    `- Проекция FORMAL v0.15: ${repositoryLink(theorem.provenance.formalOverlay)}.`,
    `- Авторитет ролей доказательных каналов: ${repositoryLink(theorem.provenance.laneAuthority)}.`,
    `- Внешнее подтверждение: ${repositoryLink(theorem.provenance.externalAssurance)}.`,
    `- Нативное подтверждение: ${repositoryLink(theorem.provenance.nativeAssurance)}.`,
    `- Реестр принятых семантических законов: ${repositoryLink(theorem.provenance.semanticLawInventory)}.`,
  ];
  if (theorem.provenance.evidenceRecords.length) {
    lines.push("- Записи доказательств:");
    for (const path of theorem.provenance.evidenceRecords) {
      lines.push(`  - ${repositoryLink(path)}.`);
    }
  }
  return lines.join("\n");
}

export function renderTheoremCatalogMarkdown(model: TheoremProjectionModel): string {
  const lines = [
    "# Теоремы МТС",
    "",
    "> **Генерируемая человекочитаемая проекция текущего реестра теорем МТС.**",
    "> Не является самостоятельным источником нормативной или доказательной истины.",
    "> Семантический авторитет остаётся в принятых контрактах; доказательный авторитет определяется зарегистрированными каналами и подтверждениями. Этот Markdown — только производная проекция.",
    "",
    `Источник принятого реестра: ${repositoryLink(model.sourceInventory)}. Версия: ${inlineCode(model.mtsVersion)}.`,
    `Кандидатная проекция FORMAL: ${repositoryLink(model.formalOverlay)}. Версия: ${inlineCode(model.formalCandidateVersion)}.`,
    "",
    "## Сводка",
    "",
    "| ID | Исходная формулировка | Статус | `Lean4` | `Rocq` | `MTS-native` | `TypeScript` |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const theorem of model.theorems) {
    lines.push(
      `| [${theorem.id}](#theorem-${theorem.id.toLowerCase()}) | ${inlineCode(tableCell(theorem.statement))} | ${tableCell(nativeStatus(theorem))} | ${evidenceSummary(theorem, "lean4")} | ${evidenceSummary(theorem, "coq")} | ${evidenceSummary(theorem, "mtsNative")} | ${evidenceSummary(theorem, "typescript")} |`,
    );
  }
  lines.push("", "## Теоремы", "");
  for (const theorem of model.theorems) {
    lines.push(renderCard(theorem), "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
