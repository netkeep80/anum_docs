import assert from "node:assert/strict";
import { loadRepositoryTheoremProjectionModel } from "../src/tooling/theorem-projection-model.js";
import { findRepositoryRoot } from "../src/tooling/docs-sync.js";
import {
  MTS_DOCUMENTATION_STYLES,
  renderMtsDocumentationStylePreview,
} from "../src/tooling/documentation-style-spike.js";

const model = loadRepositoryTheoremProjectionModel(findRepositoryRoot());
const first = model.theorems[0];
assert.ok(first !== undefined, "theorem model must be populated");
assert.equal(model.theorems.length, 21, "historical corpus preserved");
const sourceSha = "813a1569300b241a3b70eb282eecd8231db15e4b";
const snapshots: string[] = [];
for (const style of MTS_DOCUMENTATION_STYLES) {
  const args = { model, theoremId: first.id, style, sourceCommitSha: sourceSha };
  const output = renderMtsDocumentationStylePreview(args);
  assert.equal(output, renderMtsDocumentationStylePreview(args), "deterministic");
  assert.ok(output.includes(first.statement), "theorem statement must not be changed or shortened");
  assert.ok(output.includes(first.id));
  assert.ok(output.includes(first.formalV015.migrationStatus), "FORMAL status remains visible");
  assert.ok(output.includes("DESIGN SPIKE #2080"));
  assert.ok(output.includes("не является семантическим источником"));
  assert.ok(output.includes(sourceSha), "immutable source link");
  assert.ok(output.includes(first.provenance.currentIndex), "theorem provenance remains");
  assert.ok(output.includes(first.provenance.formalOverlay), "FORMAL overlay provenance remains");
  assert.ok(output.includes("Исходные допущения"), "full theorem assumptions remain accessible");
  assert.ok(output.includes("Связи с принятыми законами"), "law references remain accessible");
  assert.ok(output.includes("FORMAL-зависимости"), "FORMAL metadata remains accessible");
  assert.ok(output.includes("Замкнутость доказательного артефакта"), "proof closure remains visible");
  assert.ok(output.includes("Статус aprover"), "native proof status must not disappear");
  for (const law of first.lawRefs)
    assert.ok(output.includes(law), "canonical theorem law references remain visible");
  if (first.assumptions.length)
    assert.ok(output.includes(first.assumptions[0]!), "source assumptions must be preserved");
  for (const lane of ["typescript", "lean4", "coq", "mtsNative", "aprover"] as const)
    for (const item of first.evidence[lane]) {
      assert.ok(output.includes(item.path), "registered evidence source retained");
      assert.ok(output.includes(item.proofAuthority), "authority type retained");
    }
  for (const lane of ["TypeScript", "Lean4", "Rocq", "MTS-native", "aprover"])
    assert.ok(output.includes(lane), "all proof/evidence lanes remain visible: " + lane);
  snapshots.push(output);
}
assert.equal(new Set(snapshots).size, 3, "three genuinely different layout profiles");
// A future theorem's own fenced source must not prematurely close its Markdown fence.

const missing = model.theorems.find((item) => item.formalV015.migrationStatus === "NOT_MIGRATED");
assert.ok(missing !== undefined);
for (const style of MTS_DOCUMENTATION_STYLES) {
  const text = renderMtsDocumentationStylePreview({
    model, theoremId: missing.id, style, sourceCommitSha: sourceSha,
  });
  assert.ok(text.includes("не мигрирована"), "never conceal a missing FORMAL overlay");
}
const base = { model, theoremId: first.id, style: "academic" as const, sourceCommitSha: sourceSha };
assert.throws(() => renderMtsDocumentationStylePreview({ ...base, theoremId: "UNKNOWN" }), /theorem not present/);
assert.throws(() => renderMtsDocumentationStylePreview({ ...base, sourceCommitSha: "main" }), /pinned 40-hex/);
assert.throws(() => renderMtsDocumentationStylePreview({ ...base, style: "invalid" as "academic" }), /unsupported style/);
console.log("MTS style spike: three deterministic model-derived theorem layouts, exact statements, version/proof boundary and pinned provenance PASS");
