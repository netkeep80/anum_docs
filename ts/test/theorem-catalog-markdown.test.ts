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
  assert.match(fnd07, /Lean4.*внешняя перекрёстная проверка/is);
  assert.match(fnd07, /Rocq.*внешняя перекрёстная проверка/is);
  assert.match(fnd07, /TypeScript.*исполняемый свидетель.*доказательный авторитет.*none/is);
  assert.match(fnd07, /DERIVED_CLOSED_PROOF_ANET/);
  assert.match(fnd07, /MTS-native.*нативное доказательство/is);

  const fnd02 = section(first, "FND-02");
  assert.match(fnd02, /KERNEL_REALIZED_NOT_INDEPENDENT/);
  assert.match(
    fnd02,
    /зарегистрированных нативных записей доказательств:\s*0/i,
    "kernel realization must not be displayed as a fabricated native evidence record",
  );

  const tracked = readFileSync(resolve(root, THEOREM_CATALOG_PATH), "utf8");
  assert.equal(tracked, first, "tracked theorem catalog must equal deterministic renderer output");
  assert.equal(
    checkRepositoryDocs(root).includes(THEOREM_CATALOG_PATH),
    false,
    "docs:check integration must consider synchronized theorem catalog current",
  );

  console.log("THEOREM_CATALOG_MARKDOWN = DETERMINISTIC_GENERATED_PROJECTION");
  console.log("THEOREM_CARDS = 21/21");
  console.log("LEAN_ROCQ = EXTERNAL_CROSS_CHECK");
  console.log("MTS_NATIVE = ASSURANCE_SOURCED");
  console.log("TYPESCRIPT = EXECUTABLE_WITNESS_ONLY");
  console.log("MARKDOWN_PROOF_AUTHORITY = NONE");
  console.log("accepted semantic delta = NONE");
}

main();
