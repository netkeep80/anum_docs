import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`explicit proof model: ${message}`);
}

const root = resolve(process.cwd(), "..");
const read = (path: string): string => readFileSync(join(root, path), "utf8");

const lean = read("proofs/lean4/MtsExplicitModel.lean");
const rocq = read("proofs/coq/MtsExplicitModel.v");
const leanFoundation = read("proofs/lean4/MtsFoundation.lean");
const rocqFoundation = read("proofs/coq/MtsFoundation.v");
const ci = read(".github/workflows/ci.yml");

for (const [lane, source] of [["Lean", lean], ["Rocq", rocq]] as const) {
  assert(
    /ModelLink\s*(?::=|:=)\s*(?:List Bool|list bool)/.test(source),
    `${lane} model uses one List Bool ambient Link carrier`,
  );
  assert(
    !/inductive\s+Aspect|Inductive\s+Aspect|enum\s+Aspect/.test(source),
    `${lane} model must not encode the MTS foundation as a four-case Aspect ontology`,
  );
  assert(
    /ExplicitFoundation/.test(source),
    `${lane} model instantiates the exact external Foundation interface`,
  );
  assert(
    /ExplicitOneSided/.test(source),
    `${lane} model supplies F2F3 one-sided witnesses`,
  );
  assert(
    /ExplicitInversionDomain/.test(source),
    `${lane} model supplies recursive inversion-domain witnesses`,
  );
  assert(
    /explicit_grounded_slice/.test(source),
    `${lane} model exposes finite Grounded replay witnesses`,
  );
  assert(
    /nat[_A-Za-z]*Link|nat_link/.test(source) && /injective/i.test(source),
    `${lane} model exposes an infinite-carrier injection witness`,
  );
  assert(
    lane === "Lean"
      ? /if x = form poles\.1 poles\.2 then/.test(source)
      : /link_eq_dec x \(model_form \(fst poles\) \(snd poles\)\)/.test(source),
    `${lane} projections reject decoded values that are not canonical form images`,
  );
  assert(
    /external model|model\/proof machinery|external model machinery/i.test(source),
    `${lane} source states the no-backflow external-model boundary`,
  );
  assert(
    /CanonicalImage/.test(source),
    `${lane} model exposes external canonical-image evidence`,
  );
  assert(
    /fallback_cycle_not_grounded/.test(source),
    `${lane} model proves fallback cycle is outside Grounded`,
  );
  assert(
    /grounded_is_canonical/.test(source),
    `${lane} model proves Grounded implies exact form image`,
  );
  assert(
    /ExplicitGroundedNormalization/.test(source),
    `${lane} model instantiates Grounded normalization`,
  );
  assert(
    /explicit_fnd13_replay/.test(source),
    `${lane} model replays FND-13 on concrete Grounded links`,
  );
}

assert(
  /theorem explicit_a1\s*:\s*A1RecursiveSeparation ExplicitFoundation/.test(lean),
  "Lean explicit model discharges A1RecursiveSeparation",
);
assert(
  /Theorem explicit_a1\s*:\s*A1RecursiveSeparation ExplicitFoundation/.test(rocq),
  "Rocq explicit model discharges A1RecursiveSeparation",
);

for (const [lane, source] of [["Lean", lean], ["Rocq", rocq]] as const) {
  for (const symbol of [
    "HasNatInjection",
    "left_root_embed_injective",
    "finish_root_not_left_root_image",
    lane === "Lean" ? "leftRootOrbit_injective" : "left_root_orbit_injective",
    "one_sided_existence_implies_nat_injection",
  ]) {
    assert(
      source.includes(symbol),
      `${lane} explicit proof boundary exposes constructive infinitude witness ${symbol}`,
    );
  }
}

const replaySymbols = [
  "explicit_fnd02_replay",
  "explicit_fnd01_replay",
  "explicit_fnd05_replay",
  "explicit_inv01_replay",
  "explicit_inv02_replay",
  "explicit_inv03_replay",
  "explicit_inv04_start_replay",
  "explicit_inv04_finish_replay",
  "explicit_inv05_replay",
  "explicit_inv06_replay",
  "explicit_inv07_replay",
  "explicit_ctx03_replay",
  "explicit_ctx03_semantic_replay",
];

for (const symbol of replaySymbols) {
  assert(
    lean.includes(symbol),
    `Lean explicit model exposes concrete replay symbol ${symbol}`,
  );
  assert(
    rocq.includes(symbol),
    `Rocq explicit model exposes concrete replay symbol ${symbol}`,
  );
}

const cycleEvidence = [
  ["recursive_description_source_grounded", "recursive_description_source_grounded"],
  ["badStart_no_recursive_description", "model_bad_start_no_recursive_description"],
  ["badFinish_no_recursive_description", "model_bad_finish_no_recursive_description"],
  ["recursive_inversion_source_grounded", "recursive_inversion_source_grounded"],
  ["badStart_no_recursive_inverse", "model_bad_start_no_recursive_inverse"],
  ["badFinish_no_recursive_inverse", "model_bad_finish_no_recursive_inverse"],
  ["sharedGroundedParent_grounded", "shared_grounded_parent_grounded"],
  ["sharedGroundedParent_ne_child", "shared_grounded_parent_ne_child"],
] as const;

for (const [leanSymbol, rocqSymbol] of cycleEvidence) {
  assert(lean.includes(leanSymbol), `Lean cycle boundary missing ${leanSymbol}`);
  assert(rocq.includes(rocqSymbol), `Rocq cycle boundary missing ${rocqSymbol}`);
}

function declarationHeader(source: string, symbol: string, terminator: string): string {
  const start = source.indexOf(symbol);
  assert(start >= 0, `missing declaration ${symbol}`);
  const end = source.indexOf(terminator, start);
  assert(end > start, `missing declaration terminator for ${symbol}`);
  return source.slice(start, end);
}

for (const symbol of ["recursive_description_functional", "recursive_inversion_functional"]) {
  assert(
    !declarationHeader(leanFoundation, symbol, ":= by").includes("Grounded"),
    `Lean ${symbol} remains functionality/uniqueness without Grounded totality premise`,
  );
  assert(
    !declarationHeader(rocqFoundation, symbol, "Proof.").includes("Grounded"),
    `Rocq ${symbol} remains functionality/uniqueness without Grounded totality premise`,
  );
}

assert(
  ci.includes(
    "cat proofs/lean4/MtsFoundation.lean proofs/lean4/MtsExplicitModel.lean > /tmp/MtsFoundationWithExplicitModel.lean",
  ),
  "CI composes Lean model with the exact current Foundation source",
);
assert(
  ci.includes("/tmp/mts-lean/bin/lean /tmp/MtsFoundationWithExplicitModel.lean"),
  "CI kernel-checks the composed Lean model",
);
assert(
  ci.includes(
    "cat /input/MtsFoundation.v /input/MtsExplicitModel.v > /tmp/MtsFoundationWithExplicitModel.v",
  ),
  "CI composes Rocq model with the exact current Foundation source",
);
assert(
  ci.includes("rocq compile MtsFoundationWithExplicitModel.v"),
  "CI kernel-checks the composed Rocq model",
);

console.log("explicit proof model: single infinite carrier + paired kernel-check wiring guarded");
