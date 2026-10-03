import {
  verifyRootBasis,
  type LinkHandle,
  type RootBasis,
  type WriteMemory,
} from "./memory.js";
import {
  decodeV015FormalDefinitions,
  type V015FormalDecodeResult,
} from "./v015-formal-decoder.js";
import {
  materializeV015LinkDefinitions,
  type V015LinkDefinitionRead,
} from "./v015-link-definition.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "./v013-hierarchical-carrier.js";

export type V015FormalRecursiveCompilerErrorCode =
  | "invalid-basis"
  | "definition-count-mismatch";

export class V015FormalRecursiveCompilerError extends Error {
  override readonly name = "V015FormalRecursiveCompilerError";
  constructor(readonly code: V015FormalRecursiveCompilerErrorCode) {
    super(code);
  }
}

export interface V015RecursiveCompiledDefinition {
  readonly nameCarrier: LinkHandle;
  readonly declarationOccurrence: LinkHandle;
  readonly semantic: LinkHandle;
  readonly recursiveCarrier: LinkHandle;
  readonly wire: Uint8Array;
}

export interface V015FormalRecursiveCompileResult {
  readonly source: V015FormalDecodeResult;
  readonly resolved: V015LinkDefinitionRead;
  readonly definitions: readonly V015RecursiveCompiledDefinition[];
}

function fail(code: V015FormalRecursiveCompilerErrorCode): never {
  throw new V015FormalRecursiveCompilerError(code);
}

/**
 * Thin v0.15 bootstrap compiler orchestration.
 *
 * Semantic authority remains in the independently callable stages:
 *   text -> SyntaxAset                 (B2)
 *   SyntaxAset -> semantic Links       (B1)
 *   semantic Link -> recursive carrier (v0.13 representation codec)
 *   carrier -> 8/9/6/1 bytes           (v0.13 serializer)
 *
 * This function intentionally introduces no compiler-only AST/IR or opcode
 * dispatch. Local Link handles are returned only as stage evidence; the wire is
 * the canonical cross-Memory representation output.
 */
export function compileV015FormalDefinitionsToRecursive(
  memory: WriteMemory,
  basis: RootBasis,
  grammarRoot: LinkHandle,
  sourceNamespaceProfileRoot: LinkHandle,
  definitionProfileRoot: LinkHandle,
  bytes: Uint8Array,
): V015FormalRecursiveCompileResult {
  try {
    verifyRootBasis(memory, basis);
  } catch {
    return fail("invalid-basis");
  }

  const source = decodeV015FormalDefinitions(
    memory,
    basis,
    grammarRoot,
    sourceNamespaceProfileRoot,
    definitionProfileRoot,
    bytes,
  );
  const resolved = materializeV015LinkDefinitions(
    memory,
    basis,
    grammarRoot,
    sourceNamespaceProfileRoot,
    definitionProfileRoot,
    source.sourceAset,
  );

  if (resolved.definitions.length !== source.definitionSpans.length) {
    return fail("definition-count-mismatch");
  }

  const definitions = resolved.definitions.map((definition) => {
    const recursiveCarrier = materializeV013HierarchicalCarrierFromSemanticLink(
      memory,
      basis,
      definition.value,
    );
    const wire = Uint8Array.from(
      serializeV013HierarchicalCarrier(
        memory,
        basis,
        recursiveCarrier,
      ),
    );
    return Object.freeze({
      nameCarrier: definition.nameCarrier,
      declarationOccurrence: definition.declarationOccurrence,
      semantic: definition.value,
      recursiveCarrier,
      wire,
    });
  });

  return Object.freeze({
    source,
    resolved,
    definitions: Object.freeze(definitions),
  });
}
