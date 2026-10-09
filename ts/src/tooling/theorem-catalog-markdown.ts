// Clean-main corrective generated projection slice / #2007.
import type {
  TheoremProjectionEvidence,
  TheoremProjectionEvidenceLane,
  TheoremProjectionModel,
  TheoremProjectionTheorem,
} from "./theorem-projection-model.js";
import type {
  V015CandidateProofProjection,
} from "./v015-candidate-proof-projection.js";

export const THEOREM_CATALOG_PATH = "docs/theory/Теоремы МТС.md";

export type TheoremPresentationProfile = "academic" | "reference" | "evidence-first";
export const THEOREM_PRESENTATION_PROFILES: readonly TheoremPresentationProfile[] =
  Object.freeze(["academic", "reference", "evidence-first"]);

export type TheoremPresentationSurfaceRole =
  | "theory-foundations"
  | "catalog-glossary"
  | "observatory-audit";

export const THEOREM_PRESENTATION_PROFILE_BY_SURFACE: Readonly<
  Record<TheoremPresentationSurfaceRole, TheoremPresentationProfile>
> = Object.freeze({
  "theory-foundations": "academic",
  "catalog-glossary": "reference",
  "observatory-audit": "evidence-first",
});

export function theoremPresentationProfileForSurface(
  surface: TheoremPresentationSurfaceRole,
): TheoremPresentationProfile {
  return THEOREM_PRESENTATION_PROFILE_BY_SURFACE[surface];
}


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
  const lines = ["#### Доказательная база"];
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
    "#### Подтверждение",
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
      "#### Формальная запись FORMAL v0.15",
      "- **Статус миграции:** `NOT_MIGRATED`.",
    ];
  }
  return [
    "#### Формальная запись FORMAL v0.15",
    `- **Статус миграции:** ${inlineCode(formal.migrationStatus)}.`,
    `- **Замкнутость доказательного артефакта:** ${inlineCode(formal.proofClosure ?? "UNKNOWN")}.`,
    ...(formal.formalArtifactKind === null
      ? []
      : [`- **Тип FORMAL-артефакта:** ${inlineCode(formal.formalArtifactKind)}.`]),
    ...(formal.proofClosure === "NO_PROOF_ARTIFACT"
      ? ["- **Нативный доказательный артефакт:** отсутствует."]
      : []),
    `- **Статус aprover:** ${inlineCode(formal.aproverStatus ?? "UNKNOWN")}.`,
    "- **Каноническая FORMAL-формулировка:**",
    "~~~text",
    formal.formalStatement ?? "",
    "~~~",
    "- **FORMAL-предпосылки исходного доказательства:**",
    ...list(formal.formalPremises).map((line) => `  ${line}`),
    ...(formal.formalDependencies.length === 0
      ? []
      : [
          "- **FORMAL-зависимости теоремы:**",
          ...list(formal.formalDependencies).map((line) => `  ${line}`),
        ]),
    ...(formal.formalDomain.length === 0
      ? []
      : [
          "- **FORMAL-область связывания:**",
          ...list(formal.formalDomain).map((line) => `  ${line}`),
        ]),
    ...(formal.formalExistentialDomain.length === 0
      ? []
      : [
          "- **FORMAL-область экзистенциальных свидетелей:**",
          ...list(formal.formalExistentialDomain).map((line) => `  ${line}`),
        ]),
    ...(formal.formalNonPremises.length === 0
      ? []
      : [
          "- **Не являются внешними FORMAL-предпосылками:**",
          ...list(formal.formalNonPremises).map((line) => `  ${line}`),
        ]),
    ...(formal.nativeClassification === null
      ? []
      : [
          `- **Нативная классификация, сверенная с реестром подтверждений:** ${inlineCode(formal.nativeClassification)}.`,
          ...(formal.kernelLaw === null
            ? []
            : [`- **Доверенный закон ядра:** ${inlineCode(formal.kernelLaw)}.`]),
          ...(formal.nativeIndependent === null
            ? []
            : [`- **Независимое нативное доказательство:** ${formal.nativeIndependent ? "да" : "нет"}.`]),
        ]),
    ...(formal.formalSourcePath === null
      ? []
      : [`- **Источник FORMAL:** ${repositoryLink(formal.formalSourcePath)}.`]),
  ];
}

function renderCardHeader(theorem: TheoremProjectionTheorem): string[] {
  return [
    `<a id="theorem-${theorem.id.toLowerCase()}"></a> <!-- якорь теоремы -->`,
    `### Теорема ${theorem.id}`,
    "",
    `**Статус:** текущая теорема; нативная классификация: ${theorem.nativeAssurance === null ? "нет" : inlineCode(theorem.nativeAssurance.classification)}.`,
    `**Происхождение:** ${theorem.origin === null ? "—" : inlineCode(theorem.origin)}.  `,
    `**Волна:** ${theorem.wave === null ? "—" : inlineCode(theorem.wave)}.`,
    "",
  ];
}

function renderStatementSection(theorem: TheoremProjectionTheorem): string[] {
  return [
    "**Исходная формулировка (историческое свидетельство `v0.14`, не `FORMAL v0.15`):**",
    "~~~text",
    theorem.statement,
    "~~~",
    "",
  ];
}

function renderScopeSection(theorem: TheoremProjectionTheorem): string[] {
  return [
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
  ];
}

function renderRelationsSection(theorem: TheoremProjectionTheorem): string[] {
  return [
    "#### Связи и предпосылки",
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
  ];
}

function renderProvenanceSection(theorem: TheoremProjectionTheorem): string[] {
  const lines = [
    "#### Происхождение данных",
    `- Исходный индекс теорем v0.14: ${repositoryLink(theorem.provenance.currentIndex)}.`,
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
  return lines;
}

function orderedCardSections(
  theorem: TheoremProjectionTheorem,
  profile: TheoremPresentationProfile,
): readonly string[][] {
  const statement = renderStatementSection(theorem);
  const formal = [...renderFormalV015(theorem), ""];
  const scope = renderScopeSection(theorem);
  const relations = renderRelationsSection(theorem);
  const evidence = [...renderEvidence(theorem), ""];
  const assurance = [...renderAssurance(theorem), ""];
  const provenance = renderProvenanceSection(theorem);
  if (profile === "academic") {
    return [statement, scope, formal, relations, evidence, assurance, provenance];
  }
  if (profile === "evidence-first") {
    return [statement, evidence, assurance, formal, scope, relations, provenance];
  }
  return [statement, formal, scope, relations, evidence, assurance, provenance];
}

export function renderTheoremCardMarkdown(
  theorem: TheoremProjectionTheorem,
  profile: TheoremPresentationProfile = "reference",
): string {
  const lines = [...renderCardHeader(theorem)];
  for (const section of orderedCardSections(theorem, profile)) lines.push(...section);
  return lines.join("\n");
}

function renderCard(theorem: TheoremProjectionTheorem): string {
  return renderTheoremCardMarkdown(theorem, "reference");
}

function renderCandidateProofCard(proof: V015CandidateProofProjection): string {
  const lines = [
    '<a id="candidate-proof-' + proof.id.toLowerCase() + '"></a> <!-- якорь кандидатного доказательства -->',
    "### Кандидатное доказательство " + proof.id,
    "",
    "- **Статус проекции:** " + inlineCode(proof.projectionStatus) + ".",
    "- **Классификация внешнего доказательства:** " + inlineCode(proof.classification) + ".",
    "- **Доказательный авторитет:** " + inlineCode(proof.authority) + ".",
    "- **Владелец:** " + inlineCode(proof.ownerIssue) + ".",
    "- **Манифест внешней проверки:** " + repositoryLink(proof.assurancePath) + ".",
    "- **Машинное свидетельство:** " + repositoryLink(proof.evidencePath) + ".",
    "- **Статус пакета свидетельств:** " + inlineCode(proof.evidenceStatus) + ".",
    "- **Зафиксированный head доказательства:** " +
      (proof.exactHead === null ? "не указан" : inlineCode(proof.exactHead)) + ".",
    "- **CI прогон:** " +
      (proof.ciRun === null ? "не указан" : inlineCode(String(proof.ciRun))) + ".",
    "",
    "**Явные предпосылки:**",
    ...list(proof.premises),
    "",
    "**Исключения / границы вывода:**",
    ...list(proof.exclusions),
    "",
    "**Цели Lean4:**",
    ...list(proof.lean4),
    "",
    "**Цели Rocq:**",
    ...list(proof.rocq),
    "",
    "**Связанные файлы исходного доказательства:**",
    ...(proof.sourcePaths.length
      ? proof.sourcePaths.map((path) => "- " + repositoryLink(path))
      : ["- нет"]),
  ];
  return lines.join("\n");
}

function renderCandidateProofSection(model: TheoremProjectionModel): string {
  const lines = [
    "## Кандидатные доказательства MTS v0.15",
    "",
    "> Этот раздел является генерируемой проекцией кандидатных внешних доказательств.",
    "> Он не изменяет исходный реестр 21 теорем " + inlineCode("MTS v0.14") + ", не повышает доказательную authority принятой " + inlineCode("MTS v0.15") + " и не является " + inlineCode("MTS-native/aprover") + " доказательством.",
    "> Источник статусов — отдельные манифесты Lean4/Rocq и машинные свидетельства; доказательный авторитет этого слоя — только " +
      inlineCode("external-cross-check-only") + ".",
    "",
    "| ID | Семейство | Статус проекции | Внешняя классификация | Lean4 | Rocq |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const proof of model.candidateProofs) {
    lines.push(
      "| [" + proof.id + "](#candidate-proof-" + proof.id.toLowerCase() + ")" +
      " | кандидат " + inlineCode(proof.family) +
      " | " + inlineCode(proof.projectionStatus) +
      " | " + inlineCode(tableCell(proof.classification)) +
      " | " + proof.lean4.length + " целей" +
      " | " + proof.rocq.length + " целей |",
    );
  }
  lines.push("");
  for (const proof of model.candidateProofs) {
    lines.push(renderCandidateProofCard(proof), "");
  }
  return lines.join("\n").trimEnd();
}

export function renderTheoremCatalogMarkdown(model: TheoremProjectionModel): string {
  const lines = [
    "# Теоремы МТС",
    "",
    "> **Генерируемая человекочитаемая проекция текущего реестра теорем МТС.**",
    "> Не является самостоятельным источником нормативной или доказательной истины.",
    "> Семантический нормативный источник текущего выпуска — [принятый контракт v0.15](../../contracts/mts-contract-v0.15.json); исходный доказательный источник теорем остаётся версионным. Этот файл — только производная проекция.",
    "",
    `Исходный принятый реестр теорем: ${repositoryLink(model.sourceInventory)}. Версия доказательного реестра: ${inlineCode(model.mtsVersion)}.`,
    "Доказательная проекция в принятой `FORMAL v0.15`: " + repositoryLink(model.formalOverlay) + ". Статус миграции доказательств: " + inlineCode(model.formalCandidateVersion) + "; не статус выпуска МТС.",
    "",
    "## Сводка",
    "",
    "`FORMAL v0.15`: " + inlineCode(String(model.theorems.filter((item) => item.formalV015.migrationStatus === "FORMAL_MIGRATED").length)) +
      " / " + inlineCode(String(model.theorems.length)) + " исходных теоремных утверждений имеют зарегистрированную `FORMAL`-формулировку; утверждения без зарегистрированной `FORMAL`-формулировки, если они есть, имеют статус " +
      inlineCode("NOT_MIGRATED") + ". Это не меняет принятый выпуск v0.15 и не повышает доказательный статус.",
    "",
    "В сводке показаны только навигация и измеримые состояния. Полные формулировки, границы, доказательные записи и provenance находятся в карточках ниже.",
    "",
    "`Lean4 / Rocq` — число внешних перекрёстных проверок; `MTS-native` — число нативных записей доказательств; `aprover` — число независимых повторных прогонов; `TypeScript` — число исполняемых свидетелей, а не доказательств.",
    "",
    "| ID | `FORMAL v0.15` | `proofClosure` | `Lean4 / Rocq` | `MTS-native` | `aprover` | `TypeScript` |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: |",
  ];
  for (const theorem of model.theorems) {
    lines.push(
      `| [${inlineCode(theorem.id)}](#theorem-${theorem.id.toLowerCase()}) | ${inlineCode(theorem.formalV015.migrationStatus)} | ${inlineCode(theorem.formalV015.proofClosure ?? "UNKNOWN")} | ${theorem.evidence.lean4.length} / ${theorem.evidence.coq.length} | ${theorem.evidence.mtsNative.length} | ${theorem.evidence.aprover.length} | ${theorem.evidence.typescript.length} |`,
    );
  }
  lines.push("", "## Теоремы", "");
  for (const theorem of model.theorems) {
    lines.push(renderCard(theorem), "");
  }
  lines.push(renderCandidateProofSection(model), "");
  return `${lines.join("\n").trimEnd()}\n`;
}
