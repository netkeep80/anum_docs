import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadMtsSemanticIr,
  renderRequirementProjectionBody,
} from "./mts-compiler.js";

type JsonObject = Record<string, unknown>;

// S18 clean-main generated projection owner: #2007 / #1914.
export const FORMAL_NOTATION_V015_MODEL_PATH =
  "profiles/mts-v015-formal-notation-projection.json";
export const FORMAL_NOTATION_V015_TARGET_PATH =
  "docs/specs/Формальная нотация МТС.md";

export const FORMAL_NOTATION_V015_SOURCE_PATHS = Object.freeze([
  FORMAL_NOTATION_V015_MODEL_PATH,
  "requirements/mts-v0.15.json",
  "traceability/mts-v0.15.json",
  "profiles/mts-v015-meta-interpreter-kernel.json",
  "profiles/mts-v015-generalized-reaction-candidate.json",
  "proofs/v015-external-proof-assurance.json",
  "proofs/v015-formal-proof-assurance.json",
  "requirements/mts-v0.14.json",
  "traceability/mts-v0.14.json",
  "contracts/mts-contract-v0.14.json",
  "contracts/mts-conformance-v0.14.json",
  "repo-policy.json",
] as const);

function fail(message: string): never {
  throw new Error("formal-notation-v015-markdown: " + message);
}

function object(value: unknown, name: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(name + " must be an object");
  }
  return value as JsonObject;
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(name + " must be a non-empty string");
  }
  return value;
}

function strings(value: unknown, name: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    fail(name + " must be an array of strings");
  }
  return value as string[];
}

function readJson(root: string, path: string): JsonObject {
  return object(
    JSON.parse(readFileSync(resolve(root, path), "utf8")) as unknown,
    path,
  );
}

function requirementMap(requirements: JsonObject): Map<string, JsonObject> {
  if (!Array.isArray(requirements.requirements)) {
    fail("requirements/mts-v0.15.json.requirements must be an array");
  }
  return new Map(
    (requirements.requirements as unknown[]).map((raw, index) => {
      const value = object(raw, "requirements[" + index + "]");
      return [string(value.id, "requirements[" + index + "].id"), value] as const;
    }),
  );
}

function stateCounts(values: readonly JsonObject[]): Readonly<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const value of values) {
    const state = string(value.state, "requirement state");
    result[state] = (result[state] ?? 0) + 1;
  }
  return Object.freeze(result);
}

function renderCorpus(traceability: JsonObject, q: string): string[] {
  const corpus = object(traceability.approvedJsonCorpus, "approvedJsonCorpus");
  if (!Array.isArray(corpus.entries)) fail("approvedJsonCorpus.entries must be an array");
  return (corpus.entries as unknown[]).map((raw) => {
    const entry = object(raw, "approved corpus entry");
    const id = string(entry.id, "approved corpus id");
    const formal = string(entry.formalSourceArtifact, id + " FORMAL artifact");
    const json = string(entry.canonicalJsonArtifact, id + " JSON artifact");
    const digest = string(entry.canonicalJsonDigest, id + " JSON digest");
    const review = object(entry.authorJsonReview, id + " author review");
    if (string(review.state, id + " author state") !== "APPROVED") {
      fail(id + " is not Author-approved");
    }
    return "| " + q + id + q + " | " + q + formal + q + " | " + q + json + q + " | " + q + digest + q + " |";
  });
}

export function renderFormalNotationV015Markdown(root: string): string {
  const q = String.fromCharCode(96);
  const fence = q.repeat(3);
  const model = readJson(root, FORMAL_NOTATION_V015_MODEL_PATH);
  if (
    string(model.schema, "projection model schema") !==
    "mts-v015-formal-notation-projection-model/v0.1"
  ) {
    fail("unsupported projection model schema");
  }
  if (string(model.target, "projection target") !== FORMAL_NOTATION_V015_TARGET_PATH) {
    fail("projection target mismatch");
  }
  if (string(model.mode, "projection mode") !== "WHOLE_FILE_GENERATED") {
    fail("projection mode must be WHOLE_FILE_GENERATED");
  }

  const requirements = readJson(root, "requirements/mts-v0.15.json");
  if (string(requirements.mtsVersion, "MTS version") !== "v0.15-candidate") {
    fail("requirements version must be v0.15-candidate");
  }
  if (requirements.accepted !== false) fail("generated candidate spec cannot claim accepted v0.15");
  const currentAccepted = object(requirements.currentAccepted, "currentAccepted");
  if (string(currentAccepted.mtsVersion, "current accepted version") !== "v0.14") {
    fail("v0.14 must remain current before Author cutover");
  }

  const byId = requirementMap(requirements);
  for (const id of strings(model.sourceRequirementIds, "sourceRequirementIds")) {
    const requirement = byId.get(id);
    if (requirement === undefined) fail("missing source requirement " + id);
    if (string(requirement.state, id + " state") === "OPEN") {
      fail("projection source requirement is still OPEN: " + id);
    }
  }

  const traceability = readJson(root, "traceability/mts-v0.15.json");
  const kernel = readJson(root, "profiles/mts-v015-meta-interpreter-kernel.json");
  const gamma = readJson(root, "profiles/mts-v015-generalized-reaction-candidate.json");
  if (
    string(kernel.status, "kernel status") !==
    "PRE_ACCEPTANCE_EXECUTION_AUTHORITY_CANDIDATE"
  ) {
    fail("compact execution kernel must remain pre-acceptance candidate");
  }
  const semanticAuthority = object(kernel.semanticAuthority, "semanticAuthority");
  if (semanticAuthority.versionAccepted !== false) {
    fail("compact execution kernel cannot accept v0.15");
  }
  if (semanticAuthority.authorAcceptanceRequired !== true) {
    fail("compact execution kernel must require explicit Author acceptance");
  }
  if (!Array.isArray(kernel.unresolvedExcludedFromKernel)) fail("kernel unresolved exclusions missing");
  const sequenceCarrier = (kernel.unresolvedExcludedFromKernel as JsonObject[]).find(
    (item) => item.id === "SEQUENCE_CARRIER_SOURCE_PROVENANCE",
  );
  if (
    sequenceCarrier === undefined ||
    string(sequenceCarrier.status, "sequence-carrier status") !==
      "AUTHOR_REVIEW_REQUIRED"
  ) {
    fail("sequence-carrier/source-provenance must remain AUTHOR_REVIEW_REQUIRED");
  }
  if (string(gamma.status, "Gamma status") !== "AUTHOR_APPROVED_DESIGN_PROOF_GREEN") {
    fail("Gamma profile must be Author-approved/proof-green");
  }
  const gammaBoundary = object(gamma.integrationBoundary, "Gamma integrationBoundary");
  if (gammaBoundary.soleAcceptanceAuthority !== false) {
    fail("Gamma design profile cannot be sole acceptance authority");
  }

  const externalProof = readJson(root, "proofs/v015-external-proof-assurance.json");
  const formalProof = readJson(root, "proofs/v015-formal-proof-assurance.json");
  if (string(formalProof.status, "FORMAL proof status") !== "EXECUTION_CORE_PROOF_GREEN") {
    fail("FORMAL execution-core assurance must be green");
  }
  if (!Array.isArray(externalProof.targets) || externalProof.targets.length !== 9) {
    fail("GPR-01..09 proof manifest must contain nine targets");
  }
  if (!Array.isArray(formalProof.targets) || formalProof.targets.length !== 8) {
    fail("FRM-01..08 proof manifest must contain eight targets");
  }

  if (!Array.isArray(requirements.requirements)) fail("requirements array missing");
  const mandatory = (requirements.requirements as JsonObject[]).filter(
    (item) => item.mandatory !== false,
  );
  const counts = stateCounts(mandatory);

  const acceptedIr = loadMtsSemanticIr(root);
  const historical = acceptedIr.requirements.find((item) => item.id === "V14-L2");
  if (historical === undefined) fail("historical V14-L2 projection missing");

  const stableAnchors = strings(model.stableAnchors, "stableAnchors");
  const deferred = strings(model.deferredToV016, "deferredToV016");
  const corpusRows = renderCorpus(traceability, q);

  const lines = [
    "# Формальная нотация МТС",
    "<!-- проекция МТС; mts-generated-formal-notation: " + q + FORMAL_NOTATION_V015_MODEL_PATH + q + " -->",
    "<!-- версия документа МТС; mts-doc-version: v0.14 -->",
    "<!-- версия кандидата МТС; mts-formal-candidate-version: v0.15 -->",
    "> **Версия МТС: v0.14**",
    "> **Кандидат " + q + "FORMAL" + q + ": v0.15.** Ниже показана автоматически сгенерированная кандидатная проекция; она не меняет текущий принятый выпуск до отдельного решения Автора о переходе.",
    "> Этот файл полностью строится командой " + q + "npm --prefix ts run docs:sync" + q + ". Ручная правка семантики здесь не является authority.",
    "",
    "## 1. Назначение",
    "",
    "FORMAL — универсальная метанотация над одной асетью связей. Она описывает исходную асеть, имена, контексты, последовательности, правила и исполняемые структуры, не вводя второй онтологии поверх " + q + "Link" + q + ".",
    "",
    "Текст FORMAL и канонический JSON — две проекции **одной и той же исходной асети**. JSON является хранением и транспортом, а не отдельным семантическим языком.",
    "",
    "## 2. Основные формы",
    "",
    fence + "text",
    ":A ≡ R:A",
    "A->B->C = (A->B)->C",
    "Den([]) = ExactSequence([]) = R",
    "Den([e1,...,en]) = ExactSequence([Den(e1),...,Den(en)])",
    "∞      = ROOT",
    "♂S     = START(S)",
    "S♀     = END(S)",
    "A->B   = PAIR(A,B)",
    fence,
    "",
    "Двоеточие квалифицирует имя в явном контексте; стрелка создаёт связь над уже разрешёнными связями. Прямая последовательная ассоциация относится к разбору исходного текста и не является алгебраической ассоциативностью.",
    "",
    "## 3. Контексты, объявления и JSON",
    "",
    fence + "text",
    "{ A }        — объявление без локальной правой части",
    "A:{}         — явно пустой именованный пучок",
    "A:X          — связывание имени с выражением",
    "[A,B,...]    — только ExactSequence; порядок и кратность сохраняются",
    fence,
    "",
    "В канонической проекции JSON " + q + "null" + q + " у члена объекта означает " + q + "bare-entry" + q + ", а не особую сущность МТС. Дубли локальных имён отклоняются до потери информации обычным парсером JSON. Служебные поля, типовые теги и " + q + "host" + q + "-имена не получают семантического " + q + "authority" + q + ".",
    "",
    "## 4. От исходной асети к исполнению",
    "",
    fence + "text",
    "FORMAL text ----\\",
    "                  -> native source ANet",
    "canonical JSON --/          |",
    "                             v",
    "                       common denotation",
    "                             |",
    "                             v",
    "                       semantic ANet",
    fence,
    "",
    "Физическое существование связи и наличие имени сами по себе не делают её текущей или допущенной. Исполнительные роли возникают из структуры и семантического членства выбранной асети.",
    "",
    "## 5. Правило и универсальная реакция",
    "",
    fence + "text",
    "Rule = V -> (Antecedent -> ExactSequence(Image...))",
    "Theory -> Rule ∈ M_t",
    "|roles(V,M_t)| = 0  -> grounded exact refinement",
    "",
    "M_t -> Γ(M_t) -> M_(t+1)",
    "snapshot -> S1 match/bind -> S2 construct -> 0/1/N image -> atomic publication",
    "J0 = selected",
    "J1 = NOT_REQUIRED",
    fence,
    "",
    "Одна и та же " + q + "Γ" + q + " используется для обычных исполняемых асетей и мета-интерпретационных асетей. " + q + "S1" + q + " является фазой чтения и связывания, " + q + "S2" + q + " — подстановкой и каноническим построением. Отдельная " + q + "host" + q + "-команда " + q + "grounder" + q + ", логический " + q + "opcode" + q + " и второй исполнитель запрещены.",
    "",
    "## 6. Метакомпилятор и границы репозиториев",
    "",
    "На текущем этапе начальный метакомпилятор находится в " + q + "anum_docs" + q + ". Он преобразует " + q + "FORMAL/JSON" + q + " через общую денотацию в семантическую асеть и детерминированное представление " + q + "8/9/6/1" + q + ".",
    "",
    fence + "text",
    "anum_docs = MTS + FORMAL/JSON + bootstrap metacompiler",
    "amemory   = generic execution / Γ",
    "aprover   = proofs over the same FORMAL/ANet model",
    fence,
    "",
    "Перенос самого метакомпилятора в " + q + "FORMAL" + q + " и его исполнение внутри " + q + "A-memory" + q + " является более поздней миграцией и не входит в текущую границу v0.15.",
    "",
    "## 7. Утверждённый исполняемый корпус",
    "",
    "| Артефакт | " + q + "FORMAL" + q + " | JSON | " + q + "SHA-256" + q + " JSON |",
    "|---|---|---|---|",
    ...corpusRows,
    "",
    "Каждая запись корпуса имеет отдельное явное решение Автора, рекурсивное представление, пакет совместимости и сохранённое свидетельство исполнения на замороженной " + q + "A-memory" + q + " 0.175.0.",
    "",
    "## 8. Внешняя формальная проверка",
    "",
    "Для ядра v0.15 поддерживаются две независимые внешние линии:",
    "",
    "- " + q + "GPR-01..09" + q + ": законы универсальной реакции — парные проверки " + q + "Lean4/Rocq" + q + ";",
    "- " + q + "FRM-01..08" + q + ": " + q + "FORMAL" + q + ", денотация и граница метакомпиляции — парные проверки " + q + "Lean4/Rocq" + q + ".",
    "",
    "Глобальные списки разрешённых аксиом для этих линий пусты. Эти доказательства являются внешней проверкой, а не отдельным исполнителем МТС.",
    "",
    "## 9. Машинный статус кандидата",
    "",
    fence + "text",
    "mandatory requirements = " + mandatory.length,
    "COMPONENT_GREEN        = " + String(counts.COMPONENT_GREEN ?? 0),
    "VERTICAL_GREEN         = " + String(counts.VERTICAL_GREEN ?? 0),
    "OPEN                   = " + String(counts.OPEN ?? 0),
    "accepted               = false",
    "current accepted       = v0.14",
    fence,
    "",
    "Текущий документ описывает кандидат v0.15 и не заменяет отдельное финальное решение Автора о принятии версии.",
    "",
    "## 10. Отложено в v0.16",
    "",
    ...deferred.map((item) => "- " + q + item + q + ";"),
    "",
    "Это расширения той же " + q + "FORMAL/ANet" + q + "-модели, а не основание для второго " + q + "proof" + q + "-языка или второго исполнителя.",
    "",
    "## 11. Историческая совместимость v0.14",
    "",
    "Следующие якоря сохраняются для существующих ссылок на принятую документацию v0.14; они не являются текущим источником семантики кандидата v0.15.",
    "",
    ...stableAnchors.map((anchor) => '<a id="' + anchor + '"></a> <!-- исторический стабильный якорь -->'),
    "",
    '<a id="' + historical.docAnchor + '"></a> <!-- исторический якорь -->',
    "<!-- мтс:требование:V14-L2:начало -->",
    renderRequirementProjectionBody(historical),
    "<!-- мтс:требование:V14-L2:конец -->",
    "",
    "## 12. Происхождение",
    "",
    "Проекция строится из:",
    ...strings(model.authorityInputs, "authorityInputs").map((path) => "- " + q + path + q + ";"),
    "",
    "Модель проекции: " + q + FORMAL_NOTATION_V015_MODEL_PATH + q + ".",
    "",
  ];

  return lines.join("\n");
}
