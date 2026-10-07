import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  materializeNativeSyntaxGrammar,
  type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
import {
  compileV015DirectFormalSourceAnet,
} from "../src/v015-direct-formal-source.js";
import {
  compileV015DirectJsonSourceAnet,
} from "../src/v015-direct-json-source.js";
import {
  materializeV015ContextualNamePath,
} from "../src/v015-link-definition.js";
import {
  denoteV015ResolvedSourceAnet,
  materializeV015SourceAnetProfile,
  type V015SourceAnetProfile,
} from "../src/v015-source-anet.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 grounded approved recursive: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    message + ": " + String(actual) + " !== " + String(expected),
  );
}

function bytesSame(
  actual: Uint8Array,
  expected: Uint8Array,
  message: string,
): void {
  same(actual.length, expected.length, message + " length");
  for (let index = 0; index < actual.length; index += 1) {
    same(actual[index], expected[index], message + " byte " + index);
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function repositoryRoot(): string {
  for (const candidate of [resolve(process.cwd(), ".."), process.cwd()]) {
    if (
      existsSync(
        resolve(
          candidate,
          "formal/v0.15/regression/grounded-zero-role.formal",
        ),
      )
    ) {
      return candidate;
    }
  }
  throw new Error("v0.15 grounded approved recursive: repository root");
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly grammarRoot: LinkHandle;
  readonly sourceAnetProfileRoot: LinkHandle;
}

function fixture(noise = 0): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);

  for (let index = 0; index < noise; index += 1) {
    cursor = memory.ensure(
      cursor,
      index % 2 === 0 ? basis.O : basis.C,
    );
  }

  const fresh = (): LinkHandle => {
    cursor = memory.ensureStartSelfClosed(cursor);
    return cursor;
  };

  const profile: V015SourceAnetProfile = Object.freeze({
    blockForm: fresh(),
    bareForm: fresh(),
    bindingForm: fresh(),
    bundleForm: fresh(),
    itemRole: fresh(),
    bareValueRole: fresh(),
    bindingNameRole: fresh(),
    bindingValueRole: fresh(),
    bundleAnchorRole: fresh(),
    bundleBodyRole: fresh(),
  });

  const syntaxTag = fresh();
  const markerSeed = fresh();
  const rules: readonly NativeSyntaxGrammarRuleSpec[] = [
    {
      form: profile.blockForm,
      fields: [
        { role: profile.itemRole, target: "child", min: 0, max: null },
      ],
    },
    {
      form: profile.bareForm,
      fields: [
        { role: profile.bareValueRole, target: "carrier", min: 1, max: 1 },
      ],
    },
    {
      form: profile.bindingForm,
      fields: [
        {
          role: profile.bindingNameRole,
          target: "carrier",
          min: 1,
          max: 1,
        },
        {
          role: profile.bindingValueRole,
          target: "carrier",
          min: 1,
          max: 1,
        },
      ],
    },
    {
      form: profile.bundleForm,
      fields: [
        {
          role: profile.bundleAnchorRole,
          target: "carrier",
          min: 1,
          max: 1,
        },
        {
          role: profile.bundleBodyRole,
          target: "child",
          min: 1,
          max: 1,
        },
      ],
    },
  ];

  const grammarRoot = materializeNativeSyntaxGrammar(
    memory,
    basis,
    { syntaxTag, markerSeed, rules },
  );
  const sourceAnetProfileRoot = materializeV015SourceAnetProfile(
    memory,
    profile,
  );

  return Object.freeze({
    memory,
    basis,
    grammarRoot,
    sourceAnetProfileRoot,
  });
}

const root = repositoryRoot();
const formalBytes = Uint8Array.from(
  readFileSync(
    resolve(root, "formal/v0.15/regression/grounded-zero-role.formal"),
  ),
);
const jsonBytes = Uint8Array.from(
  readFileSync(
    resolve(root, "formal/v0.15/regression/grounded-zero-role.json"),
  ),
);
const expectedRecursiveBytes = Uint8Array.from(
  readFileSync(
    resolve(root, "formal/v0.15/regression/grounded-zero-role.recursive"),
  ),
);

const EXPECTED_FORMAL_SHA256 =
  "b0e5760786c900ab125f775f9f30d897336220ee2393f3c0e3fd5cff2296d51a";
const EXPECTED_JSON_SHA256 =
  "d3304cee2d4037c8b144ac4c112b40591c8c1bf3bbd939f2e01393fa723a9f61";
const EXPECTED_RECURSIVE_SHA256 =
  "570950556cc0703a915c39e4e6f181ed55103f13544f8f8a1a5e25a099f76b11";

function compileOne(noise = 0): Readonly<{
  sourceAset: LinkHandle;
  member: LinkHandle;
  wire: Uint8Array;
}> {
  const f = fixture(noise);

  const fromFormal = compileV015DirectFormalSourceAnet(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.sourceAnetProfileRoot,
    formalBytes,
  );
  const fromJson = compileV015DirectJsonSourceAnet(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.sourceAnetProfileRoot,
    jsonBytes,
  );

  same(
    fromFormal.sourceAset,
    fromJson.sourceAset,
    "FORMAL and JSON reconstruct exact same native source ANet",
  );

  const formalDenotation = denoteV015ResolvedSourceAnet(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.sourceAnetProfileRoot,
    fromFormal.sourceAset,
  );
  const jsonDenotation = denoteV015ResolvedSourceAnet(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.sourceAnetProfileRoot,
    fromJson.sourceAset,
  );

  same(formalDenotation.members.size, 1, "FORMAL member count");
  same(jsonDenotation.members.size, 1, "JSON member count");

  const member = [...formalDenotation.members][0]!;
  assert(jsonDenotation.members.has(member), "FORMAL/JSON semantic member parity");

  const enc = new TextEncoder();
  const carrier = (name: string): LinkHandle =>
    materializeV012StringAnum(
      f.memory,
      f.basis,
      enc.encode(name),
    ).anumLink;
  const absolute = (name: string): LinkHandle =>
    materializeV015ContextualNamePath(
      f.memory,
      f.basis,
      f.basis.R,
      [carrier(name)],
      true,
    );

  const theory = absolute("Theory");
  const groundRuleName = absolute("GroundRule");
  const groundRuleBinding = formalDenotation.bindings.find(
    (binding) =>
      binding.coordinate === null &&
      binding.name === groundRuleName
  );
  assert(
    groundRuleBinding !== undefined,
    "GroundRule root binding is present in the metamodel projection",
  );
  same(
    member,
    f.memory.ensure(theory, groundRuleBinding.value),
    "sole semantic member is Theory->GroundRule",
  );

  const recursiveCarrier =
    materializeV013HierarchicalCarrierFromSemanticLink(
      f.memory,
      f.basis,
      member,
    );
  const wire = serializeV013HierarchicalCarrier(
    f.memory,
    f.basis,
    recursiveCarrier,
  );
  assert(
    /^[8961]+$/u.test(new TextDecoder().decode(wire)),
    "recursive output uses only canonical 8/9/6/1 alphabet",
  );

  return Object.freeze({
    sourceAset: fromFormal.sourceAset,
    member,
    wire,
  });
}

const first = compileOne();
const noisy = compileOne(11);
bytesSame(
  first.wire,
  noisy.wire,
  "recursive wire is portable across independent Memory handle layouts",
);

const formalDigest = sha256(formalBytes);
const jsonDigest = sha256(jsonBytes);
const recursiveDigest = sha256(first.wire);
const recursiveWire = new TextDecoder().decode(first.wire);

same(formalDigest, EXPECTED_FORMAL_SHA256, "approved FORMAL digest");
same(jsonDigest, EXPECTED_JSON_SHA256, "approved JSON digest");
same(recursiveDigest, EXPECTED_RECURSIVE_SHA256, "recursive digest");
bytesSame(
  first.wire,
  expectedRecursiveBytes,
  "persisted recursive artifact matches computed canonical wire",
);

console.log([
  "MTS_V015_GROUNDED_APPROVED_RECURSIVE=GREEN",
  "FORMAL_SHA256=" + formalDigest,
  "JSON_SHA256=" + jsonDigest,
  "RECURSIVE_SHA256=" + recursiveDigest,
  "RECURSIVE_WIRE=" + recursiveWire,
  "FORMAL_JSON_NATIVE_SOURCE_ANET=EXACT_SAME",
  "SEMANTIC_MEMBER=THEORY_TO_GROUND_RULE_ONLY",
  "TWO_MEMORY_RECURSIVE_PARITY=GREEN",
  "REAL_AMEMORY_REPLAY=PENDING",
].join(" "));
