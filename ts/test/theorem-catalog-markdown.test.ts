import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  THEOREM_CATALOG_PATH,
  renderTheoremCatalogMarkdown,
} from "../src/tooling/theorem-catalog-markdown.js";
import {
  loadRepositoryTheoremProjectionModel,
} from "../src/tooling/theorem-projection-model.js";
import { checkRepositoryDocs } from "../src/tooling/docs-sync.js";

// T2 RED: renderer and generated target intentionally land after this consumer.
// T2 final gate uses the measured bounded generated-theorem-catalog profile; synchronize event must observe the final ChangeIntent.
function repositoryRoot(): string {
  const candidates = [resolve(process.cwd(), ".."), process.cwd()];
  const root = candidates.find((candidate) =>
    existsSync(resolve(candidate, "theorems", "current-v0.14.json")),
  );
  if (root === undefined) throw new Error("theorem catalog repository root not found");
  return root;
}

function section(markdown: string, id: string): string {
  const anchor = `<a id="theorem-${id.toLowerCase()}"></a>`;
  const start = markdown.indexOf(anchor);
  assert(start >= 0, `missing theorem anchor ${id}`);
  const next = markdown.indexOf("\n<a id=\"theorem-", start + anchor.length);
  return markdown.slice(start, next < 0 ? markdown.length : next);
}

function main(): void {
  const root = repositoryRoot();
  const model = loadRepositoryTheoremProjectionModel(root);
  const first = renderTheoremCatalogMarkdown(model);
  const second = renderTheoremCatalogMarkdown(model);

  assert.equal(first, second, "theorem Markdown renderer must be byte-deterministic");
  assert.equal(THEOREM_CATALOG_PATH, "docs/theory/Теоремы МТС.md");
  assert.match(first, /^# Теоремы МТС\n/);
  assert.match(
    first,
    /генерируемая человекочитаемая проекция.*не является.*источником.*доказательной.*истины/is,
    "catalog must disclose derived/no-proof-authority status",
  );
  assert.match(first, /кандидатная проекция FORMAL/i);
  assert.match(first, /theorems\/formal-v0\.15\.json/);
  assert.match(first, /## Кандидатные доказательства MTS v0\.15/);
  assert.match(first, /генерируемой проекцией кандидатных внешних доказательств/);
  assert.match(first, /не изменяет принятый реестр из 21 теорем .*MTS v0\.14/i);
  assert.match(first, /external-cross-check-only/);
  const candidateAnchors = [
    ...first.matchAll(/<a id="candidate-proof-([^"]+)"><\/a>/g),
  ].map((match) => match[1]);
  assert.deepEqual(
    candidateAnchors,
    model.candidateProofs.map((proof) => proof.id.toLowerCase()),
    "candidate proof cards are generated separately from accepted theorem cards",
  );
  assert.match(first, /Кандидатное доказательство GPR-09/);
  assert.match(first, /C\s*=\s*END\(R\)/);
  assert.match(first, /Кандидатное доказательство FRM-07/);
  assert.match(
    first,
    /PROVED_UNDER_EXPLICIT_PRODUCTION_REFINEMENT_PREMISES/,
  );

  const anchors = [...first.matchAll(/<a id="theorem-([^"]+)"><\/a>/g)].map((match) => match[1]);
  assert.deepEqual(
    anchors,
    model.theorems.map((theorem) => theorem.id.toLowerCase()),
    "every current theorem appears exactly once and in current inventory order",
  );

  for (const theorem of model.theorems) {
    const card = section(first, theorem.id);
    assert(card.includes(theorem.statement), `${theorem.id}: full statement preserved`);
    assert(card.includes(String(theorem.scope)), `${theorem.id}: scope preserved`);
    assert(card.includes(String(theorem.exclusions)), `${theorem.id}: exclusions preserved`);
    for (const value of [
      ...theorem.lawRefs,
      ...theorem.assumptions,
      ...theorem.formalPremises,
      ...theorem.dependsOn,
    ]) {
      assert(card.includes(value), `${theorem.id}: card preserves ${value}`);
    }
    for (const lane of ["typescript", "lean4", "coq", "mtsNative", "aprover"] as const) {
      for (const evidence of theorem.evidence[lane]) {
        assert(
          card.includes(`../../${evidence.path}`),
          `${theorem.id}/${lane}: concrete evidence path is navigable`,
        );
      }
    }
  }

  const fnd07 = section(first, "FND-07");
  assert.match(fnd07, /### Формальная запись FORMAL v0\.15/);
  assert.match(fnd07, /FORMAL_MIGRATED/);
  assert.match(fnd07, /CLOSED/);
  assert.match(fnd07, /FND07_STATEMENT : TARGET_PREMISES->TARGET_CONCLUSION/);
  assert.match(fnd07, /v015-fnd07-ordinary-formal-proof-p2\.test\.ts/);
  assert.match(fnd07, /Lean4.*внешняя перекрёстная проверка/is);
  assert.match(fnd07, /Rocq.*внешняя перекрёстная проверка/is);
  assert.match(fnd07, /TypeScript.*исполняемый свидетель.*доказательный авторитет.*none/is);
  assert.match(fnd07, /DERIVED_CLOSED_PROOF_ANET/);
  assert.match(fnd07, /MTS-native.*нативное доказательство/is);

  const fnd08 = section(first, "FND-08");
  assert.match(fnd08, /OPEN_CONDITIONAL/);
  assert.match(fnd08, /FND08_STATEMENT : TARGET_PREMISES->G_RESULT/);
  assert.match(fnd08, /G_SEM/);
  assert.match(fnd08, /G_BOUNDARY/);
  assert.match(fnd08, /NOT_RECORDED/);

  const fnd09 = section(first, "FND-09");
  assert.match(fnd09, /OPEN_CONDITIONAL/);
  assert.match(fnd09, /FND09_STATEMENT : TARGET_PREMISES->G_RESULT/);
  assert.match(fnd09, /G_SEM/);
  assert.match(fnd09, /NOT_RECORDED/);

  const fnd01 = section(first, "FND-01");
  assert.match(fnd01, /FORMAL_MIGRATED/);
  assert.match(fnd01, /NO_PROOF_ARTIFACT/);
  assert.match(fnd01, /STATEMENT_ONLY/);
  assert.match(fnd01, /Нативный доказательный артефакт:\*\* отсутствует/i);
  assert.match(fnd01, /FND01_STATEMENT : FND01_PREMISES->FND01_CONCLUSION/);
  assert.match(fnd01, /A1RecursiveSeparation/);
  assert.match(fnd01, /F2F3OneSidedExistence/);
  assert.match(fnd01, /LocalSelfDecision:x/);
  assert.match(fnd01, /FORMAL-зависимости теоремы/);
  assert.match(fnd01, /FND-02/);
  assert.match(fnd01, /x : Link/);
  assert.match(fnd01, /FORMAL-область экзистенциальных свидетелей/);
  assert.match(fnd01, /startWitness : Link/);
  assert.match(fnd01, /finishWitness : Link/);
  assert.match(fnd01, /pairWitness : Link/);
  assert.match(fnd01, /FND-02 as premise/);
  assert.match(fnd01, /FND-13/);
  assert.match(fnd01, /Grounded:x/);
  assert.match(fnd01, /NOT_RECORDED/);
  assert.match(fnd01, /v015-fnd01-formal-statement-b18\.test\.ts/);
  assert.match(
    fnd01,
    /зарегистрированных нативных записей доказательств:\s*0/i,
    "FND-01 statement migration must not fabricate native evidence",
  );
  assert.match(fnd01, /Нативное подтверждение:\*\* нет/i);

  const fnd02 = section(first, "FND-02");
  assert.match(fnd02, /FORMAL_MIGRATED/);
  assert.match(fnd02, /N_A_FOR_KERNEL_REALIZATION/);
  assert.match(fnd02, /KERNEL_REALIZATION/);
  assert.match(fnd02, /FND02_STATEMENT : FND02_PREMISES->FND02_RULE/);
  assert.match(fnd02, /A1RecursiveSeparation/);
  assert.match(fnd02, /X : Link/);
  assert.match(fnd02, /Grounded\(X\)/);
  assert.match(fnd02, /F2\/F3 normalization/);
  assert.match(fnd02, /FND-13/);
  assert.match(fnd02, /KERNEL_REALIZED_NOT_INDEPENDENT/);
  assert.match(fnd02, /recursive-link-identity\/full-full-canonical-root-base/);
  assert.match(fnd02, /Независимое нативное доказательство:\*\* нет/i);
  assert.match(fnd02, /NOT_RECORDED/);
  assert.match(fnd02, /v015-formal-bound-link-role-b12\.test\.ts/);
  assert.match(
    fnd02,
    /зарегистрированных нативных записей доказательств:\s*0/i,
    "kernel realization must not be displayed as a fabricated native evidence record",
  );

  const fnd13 = section(first, "FND-13");
  assert.match(fnd13, /FORMAL_MIGRATED/);
  assert.match(fnd13, /N_A_FOR_KERNEL_REALIZATION/);
  assert.match(fnd13, /FND13_STATEMENT : FND13_PREMISES->FND13_RULES/);
  assert.match(fnd13, /F2F3GroundedNormalization/);
  assert.match(fnd13, /Grounded:x/);
  assert.match(fnd13, /Grounded:y/);
  assert.match(fnd13, /x : Link/);
  assert.match(fnd13, /y : Link/);
  assert.match(fnd13, /FND-02/);
  assert.match(fnd13, /F2F3Normalization/);
  assert.match(fnd13, /arbitrary non-grounded Link extensionality/);
  assert.match(fnd13, /KERNEL_REALIZED_NOT_INDEPENDENT/);
  assert.match(fnd13, /recursive-link-identity\/ordered-pole-grounded-closure/);
  assert.match(fnd13, /Независимое нативное доказательство:\*\* нет/i);
  assert.match(fnd13, /NOT_RECORDED/);
  assert.match(fnd13, /v015-formal-bound-link-role-b12\.test\.ts/);
  assert.match(
    fnd13,
    /зарегистрированных нативных записей доказательств:\s*0/i,
    "FND-13 kernel realization must not be displayed as fabricated native evidence",
  );

  const exe02 = section(first, "EXE-02");
  assert.match(exe02, /FORMAL_MIGRATED/);
  assert.match(exe02, /NO_PROOF_ARTIFACT/);
  assert.match(exe02, /STATEMENT_ONLY/);
  assert.match(exe02, /Нативный доказательный артефакт:\*\* отсутствует/i);
  assert.match(exe02, /EXE02_STATEMENT : EXE02_PREMISES->EXE02_CLAUSES/);
  assert.match(exe02, /a : Link/);
  assert.match(exe02, /a' : Link/);
  assert.match(exe02, /b : Link/);
  assert.match(exe02, /b' : Link/);
  assert.match(exe02, /x : Link/);
  assert.match(exe02, /y : Link/);
  assert.match(exe02, /c : Link/);
  assert.match(exe02, /d : Link/);
  assert.match(exe02, /FND-13/);
  assert.match(exe02, /Grounded/);
  assert.match(exe02, /Memory handle\/object identity/);
  assert.match(exe02, /NOT_RECORDED/);
  assert.match(exe02, /v015-exe02-formal-statement-b17\.test\.ts/);
  assert.match(
    exe02,
    /зарегистрированных нативных записей доказательств:\s*0/i,
    "EXE-02 statement migration must not fabricate native evidence",
  );
  assert.match(exe02, /Нативное подтверждение:\*\* нет/i);

  const tracked = readFileSync(resolve(root, THEOREM_CATALOG_PATH), "utf8");
  assert.equal(tracked, first, "tracked theorem catalog must equal deterministic renderer output");
  assert.equal(
    checkRepositoryDocs(root).includes(THEOREM_CATALOG_PATH),
    false,
    "docs:check integration must consider synchronized theorem catalog current",
  );

  console.log("THEOREM_CATALOG_MARKDOWN = DETERMINISTIC_GENERATED_PROJECTION");
  console.log("THEOREM_CARDS = 21/21");
  console.log("V015_CANDIDATE_PROOFS = 17");
  console.log("LEAN_ROCQ = EXTERNAL_CROSS_CHECK");
  console.log("MTS_NATIVE = ASSURANCE_SOURCED");
  console.log("TYPESCRIPT = EXECUTABLE_WITNESS_ONLY");
  console.log("MARKDOWN_PROOF_AUTHORITY = NONE");
  console.log("accepted semantic delta = NONE");
}

main();
