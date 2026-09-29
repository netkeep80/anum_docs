import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`explicit proof model: ${message}`);
}

const root = resolve(process.cwd(), "..");
const read = (path: string): string => readFileSync(join(root, path), "utf8");

const lean = read("proofs/lean4/MtsExplicitModel.lean");
const rocq = read("proofs/coq/MtsExplicitModel.v");
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
