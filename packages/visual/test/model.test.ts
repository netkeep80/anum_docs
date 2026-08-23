import "./blueprint-geometry.test.js";
import "./blueprint-svg.test.js";
import "./blueprint-interaction.test.js";
import "./geometry3d.test.js";
import "./physics3d.test.js";
import "./live-physics3d.test.js";
import "./three-scene.test.js";
import "./three-renderer.test.js";
import "./three-controls.test.js";
import "./presentation.test.js";

import {
  VisualNetworkError,
  normalizeVisualLinkNetwork,
  validateVisualLinkNetwork,
  type VisualLink,
  type VisualLinkNetwork,
  type VisualNetworkErrorCode,
} from "../src/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`@mts/visual V0: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectCode(effect: () => unknown, code: VisualNetworkErrorCode, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof VisualNetworkError, `${message}: wrong error type`);
    same(error.code, code, `${message}: wrong error code`);
    return;
  }
  throw new Error(`@mts/visual V0: ${message}: expected rejection`);
}

function basisLinks(): VisualLink[] {
  return [
    { key: "R", startKey: "R", endKey: "R", label: "∞", tags: ["root"] },
    { key: "O", startKey: "O", endKey: "R" },
    { key: "C", startKey: "R", endKey: "C" },
    { key: "L", startKey: "O", endKey: "C" },
    { key: "U", startKey: "C", endKey: "O" },
  ];
}

const input: VisualLinkNetwork = {
  links: [
    { key: "U", startKey: "C", endKey: "O", tags: ["upper"] },
    { key: "R", startKey: "R", endKey: "R", label: "∞", tags: ["root"] },
    { key: "L", startKey: "O", endKey: "C" },
    { key: "C", startKey: "R", endKey: "C" },
    { key: "O", startKey: "O", endKey: "R" },
  ],
};
const normalized = normalizeVisualLinkNetwork(input);
same(normalized.links.map((link) => link.key).join(","), "C,L,O,R,U", "stable key order");
assert(Object.isFrozen(normalized), "network is frozen");
assert(Object.isFrozen(normalized.links), "links are frozen");
for (const link of normalized.links) {
  assert(Object.isFrozen(link), `link ${link.key} is frozen`);
  if (link.tags !== undefined) assert(Object.isFrozen(link.tags), `tags ${link.key} are frozen`);
}

same(input.links[0]?.key, "U", "input order is unchanged");
same(input.links[0]?.tags?.[0], "upper", "input metadata is unchanged");

const root = normalized.links.find((link) => link.key === "R");
assert(root !== undefined, "root retained");
same(root.startKey, "R", "root self start retained");
same(root.endKey, "R", "root self end retained");
same(root.label, "∞", "presentation label retained");
same(root.tags?.[0], "root", "presentation tag retained");

validateVisualLinkNetwork({ links: basisLinks() });
validateVisualLinkNetwork({
  links: [
    ...basisLinks(),
    { key: "X", startKey: "L", endKey: "U" },
    { key: "Y", startKey: "X", endKey: "R" },
  ],
});

expectCode(
  () => validateVisualLinkNetwork({ links: [{ key: "", startKey: "R", endKey: "R" }] }),
  "empty-key",
  "blank link key",
);
expectCode(
  () =>
    validateVisualLinkNetwork({
      links: [
        { key: "R", startKey: "R", endKey: "R" },
        { key: "R", startKey: "R", endKey: "R" },
      ],
    }),
  "duplicate-key",
  "duplicate key",
);
expectCode(
  () =>
    validateVisualLinkNetwork({
      links: [
        { key: "R", startKey: "R", endKey: "R" },
        { key: "X", startKey: "missing", endKey: "R" },
      ],
    }),
  "dangling-start",
  "dangling start",
);
expectCode(
  () =>
    validateVisualLinkNetwork({
      links: [
        { key: "R", startKey: "R", endKey: "R" },
        { key: "X", startKey: "R", endKey: "missing" },
      ],
    }),
  "dangling-end",
  "dangling end",
);
