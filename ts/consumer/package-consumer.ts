import {
  Memory,
  PORTABLE_MTS_SEMANTIC_BASE,
  ensureRootBasis,
  replayPortableStructuralDerivation,
  replayPortableStructuralDerivationWithAssumptions,
  replayStructuralDerivation,
  replayStructuralDerivationWithAssumptions,
  replayStructuralScopedDerivation,
  type LinkHandle,
  type PortableStructuralDerivationReplayResult,
  type PortableStructuralDerivationWithAssumptionsReplayResult,
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

// Downstream approvers only need the public verification boundary to accept
// untrusted portable evidence; producer/search construction may remain outside
// the trusted package facade.
const semanticBase: "mts-contract/v0.11" = PORTABLE_MTS_SEMANTIC_BASE;
const portableReplay: (input: unknown) => PortableStructuralDerivationReplayResult =
  replayPortableStructuralDerivation;
const portableAssumptionReplay: (
  input: unknown,
) => PortableStructuralDerivationWithAssumptionsReplayResult =
  replayPortableStructuralDerivationWithAssumptions;
void [
  read,
  link,
  encoded,
  semanticBase,
  portableReplay,
  portableAssumptionReplay,
  replayStructuralDerivation,
  replayStructuralDerivationWithAssumptions,
  replayStructuralScopedDerivation,
];

// Internal source modules are intentionally not package subpaths.
// @ts-expect-error @mts/core/memory is not exported by package.json.
import type { AppendOnlyReadMemory } from "@mts/core/memory";
void (undefined as unknown as AppendOnlyReadMemory);
