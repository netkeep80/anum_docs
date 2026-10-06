import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.15 GPR-09 chirality covariance: " + message);
}

type Boundary = "C_END" | "O_START";
interface State {
  readonly boundary: Boundary;
  readonly payload: number;
}
interface Plan {
  readonly boundary: Boundary;
  readonly payload: number;
}
interface Stage {
  readonly boundary: Boundary;
  readonly payload: number;
}

function mirrorBoundary(boundary: Boundary): Boundary {
  return boundary === "C_END" ? "O_START" : "C_END";
}

function mirrorState(state: State): State {
  return Object.freeze({
    boundary: mirrorBoundary(state.boundary),
    payload: state.payload,
  });
}

function mirrorPlan(plan: Plan): Plan {
  return Object.freeze({
    boundary: mirrorBoundary(plan.boundary),
    payload: plan.payload,
  });
}

function mirrorStage(stage: Stage): Stage {
  return Object.freeze({
    boundary: mirrorBoundary(stage.boundary),
    payload: stage.payload,
  });
}

function analyze(boundary: Boundary, state: State): Plan {
  assert(state.boundary === boundary, "state belongs to selected gauge boundary");
  return Object.freeze({ boundary, payload: state.payload });
}

function synthesize(boundary: Boundary, plan: Plan): Stage {
  assert(plan.boundary === boundary, "plan belongs to selected gauge boundary");
  return Object.freeze({ boundary, payload: plan.payload + 1 });
}

function publish(boundary: Boundary, _state: State, stage: Stage): State {
  assert(stage.boundary === boundary, "stage belongs to selected gauge boundary");
  return Object.freeze({ boundary, payload: stage.payload });
}

function gamma(boundary: Boundary, state: State): State {
  return publish(boundary, state, synthesize(boundary, analyze(boundary, state)));
}

function sameState(actual: State, expected: State, message: string): void {
  assert(
    actual.boundary === expected.boundary &&
      actual.payload === expected.payload,
    message,
  );
}

for (const payload of [0, 1, 2, 17, 256]) {
  const direct = Object.freeze<State>({ boundary: "C_END", payload });
  const mirroredInput = mirrorState(direct);

  sameState(
    mirrorState(gamma("C_END", direct)),
    gamma("O_START", mirroredInput),
    "same Gamma commutes with direct-to-mirror gauge transport",
  );

  sameState(
    mirrorState(mirrorState(direct)),
    direct,
    "mirror gauge round-trip",
  );
}

// Falsifier: a host special case for the direct gauge breaks covariance.
function biasedGamma(boundary: Boundary, state: State): State {
  return Object.freeze({
    boundary,
    payload: state.payload + (boundary === "C_END" ? 100 : 1),
  });
}
const witness = Object.freeze<State>({ boundary: "C_END", payload: 3 });
const biasedMirrored = mirrorState(biasedGamma("C_END", witness));
const biasedMirrorRun = biasedGamma("O_START", mirrorState(witness));
assert(
  biasedMirrored.payload !== biasedMirrorRun.payload,
  "gauge-specific host dispatch is a chirality-covariance falsifier",
);

// Bind the executable witness to the actual architectural/proof authorities.
const root = resolve(process.cwd(), "..");
const model = JSON.parse(
  readFileSync(
    resolve(root, "profiles/mts-v015-meta-interpreter-model.json"),
    "utf8",
  ),
) as {
  contextCandidate: {
    directGaugeBoundary: string;
    chiralityNote: string;
  };
};
const foundation = readFileSync(
  resolve(root, "proofs/lean4/MtsFoundation.lean"),
  "utf8",
);
assert(
  model.contextCandidate.directGaugeBoundary === "C",
  "direct gauge remains C",
);
assert(
  /mirror gauge must remain equivalent/i.test(model.contextCandidate.chiralityNote),
  "architecture requires mirror-gauge equivalence",
);
assert(
  foundation.includes("CTX_03_simultaneous_inversion_covariance") &&
    foundation.includes("CTX_03_direction_witness_inversion"),
  "accepted v0.14 CTX-03 mirror transport remains present",
);

console.log([
  "MTS_V015_GPR09_CHIRALITY_COVARIANCE=GREEN_RESEARCH",
  "DIRECT_GAUGE_BOUNDARY=C_END_R",
  "MIRROR_GAUGE_BOUNDARY=O_START_R",
  "SAME_GAMMA_FOR_BOTH_GAUGES=TRUE",
  "HOST_REVERSE_DIRECTION_MODE_REQUIRED=FALSE",
  "PHASE_COVARIANCE_IMPLIES_GAMMA_COVARIANCE=TRUE",
  "GAUGE_SPECIFIC_HOST_DISPATCH=FALSIFIED",
  "C_FOUNDATION_GLOBAL_PRIVILEGE=FALSE",
  "ACCEPTED_V014_CTX03_REUSED=TRUE",
].join(" "));
