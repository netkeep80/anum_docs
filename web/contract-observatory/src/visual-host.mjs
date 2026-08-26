import { normalizeVisualLinkNetwork } from '@mts/visual';

/**
 * Browser-neutral Contract Observatory boundary for standalone @mts/visual.
 *
 * The caller owns the domain-to-presentation projection. This host only accepts
 * renderer-neutral VisualLinkNetwork data and returns the package-normalized
 * immutable presentation snapshot. It intentionally has no @mts/core, Three,
 * historical in-repo visual package, or deep-source dependency.
 */
export function createObservatoryVisualHost(network) {
  return normalizeVisualLinkNetwork(network);
}
