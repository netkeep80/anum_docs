import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type ReadMemory,
} from "@mts/core";
import { textToAnum } from "@mts/core/tooling/payload";

// Package-boundary smoke: this file must resolve through package exports and
// generated declarations, not through source-relative imports.
const memory = new Memory();
const basis = ensureRootBasis(memory);
const read: ReadMemory = memory;
const link: LinkHandle = basis.L;
const encoded: string = textToAnum("A");
void [read, link, encoded];

// Internal source modules are intentionally not package subpaths.
// @ts-expect-error @mts/core/memory is not exported by package.json.
import type { AppendOnlyReadMemory } from "@mts/core/memory";
void (undefined as unknown as AppendOnlyReadMemory);
