import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "./exact-sequence.js";
import {
  MemoryError,
  type LinkHandle,
  type ReadMemory,
  type WriteMemory,
} from "./memory.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "./structural-rule.js";

export type V015FormalEvaluationErrorCode =
  | "invalid-evaluation-profile"
  | "role-seed-collision"
  | "replay-wrote";

export class V015FormalEvaluationError extends Error {
  override readonly name = "V015FormalEvaluationError";

  constructor(readonly code: V015FormalEvaluationErrorCode) {
    super(code);
  }
}

export interface V015EvaluationProfile {
  readonly root: LinkHandle;
  readonly callTag: LinkHandle;
  readonly doneTag: LinkHandle;
}

export interface V015UnaryLifecycleRules {
  readonly open: LinkHandle;
  readonly resume: LinkHandle;
  readonly publish: LinkHandle;
}

function fail(code: V015FormalEvaluationErrorCode): never {
  throw new V015FormalEvaluationError(code);
}

export function materializeV015EvaluationProfile(
  memory: WriteMemory,
  callTag: LinkHandle,
  doneTag: LinkHandle,
): LinkHandle {
  if (callTag === doneTag) fail("invalid-evaluation-profile");
  const root = materializeExactSequence(memory, [callTag, doneTag]);
  readV015EvaluationProfile(memory, root);
  return root;
}

export function readV015EvaluationProfile(
  memory: ReadMemory,
  root: LinkHandle,
): V015EvaluationProfile {
  const before = memory.linkCount;
  try {
    let values: readonly LinkHandle[];
    try {
      values = readExactSequence(memory, root).values;
    } catch (error) {
      if (error instanceof ExactSequenceError || error instanceof MemoryError) {
        return fail("invalid-evaluation-profile");
      }
      throw error;
    }
    if (values.length !== 2) fail("invalid-evaluation-profile");
    const callTag = values[0];
    const doneTag = values[1];
    if (
      callTag === undefined ||
      doneTag === undefined ||
      callTag === doneTag
    ) {
      return fail("invalid-evaluation-profile");
    }
    return Object.freeze({ root, callTag, doneTag });
  } finally {
    if (memory.linkCount !== before) fail("replay-wrote");
  }
}

export function materializeV015ApplicationTerm(
  memory: WriteMemory,
  fn: LinkHandle,
  arg: LinkHandle,
): LinkHandle {
  return memory.ensure(fn, arg);
}

export function materializeV015EvaluationRequest(
  memory: WriteMemory,
  profileRoot: LinkHandle,
  fn: LinkHandle,
  arg: LinkHandle,
): LinkHandle {
  const profile = readV015EvaluationProfile(memory, profileRoot);
  return memory.ensure(
    profile.callTag,
    materializeV015ApplicationTerm(memory, fn, arg),
  );
}

export function materializeV015CompletedValue(
  memory: WriteMemory,
  profileRoot: LinkHandle,
  value: LinkHandle,
): LinkHandle {
  const profile = readV015EvaluationProfile(memory, profileRoot);
  return memory.ensure(profile.doneTag, value);
}

export function materializeV015ContinuationFrame(
  memory: WriteMemory,
  parent: LinkHandle,
  fn: LinkHandle,
): LinkHandle {
  return memory.ensureStartSelfClosed(memory.ensure(parent, fn));
}

export function materializeV015RootEvaluationBoundary(
  memory: WriteMemory,
  caller: LinkHandle,
): LinkHandle {
  return memory.ensureEndSelfClosed(caller);
}

function materializeRoles(
  memory: WriteMemory,
  seed: LinkHandle,
  count: number,
): readonly LinkHandle[] {
  let cursor = seed;
  const roles: LinkHandle[] = [];
  for (let index = 0; index < count; index += 1) {
    cursor = memory.ensure(cursor, memory.root);
    roles.push(cursor);
  }
  if (new Set(roles).size !== count) fail("role-seed-collision");
  return Object.freeze(roles);
}

function admitTriggeredRule(
  memory: WriteMemory,
  theory: LinkHandle,
  triggerKey: LinkHandle,
  roles: readonly LinkHandle[],
  before: LinkHandle,
  after: readonly LinkHandle[],
): LinkHandle {
  const dictionary = defineStructuralRoleDictionary(memory, roles);
  const output = materializeExactSequence(memory, after);
  const rule = defineStructuralRule(
    memory,
    dictionary,
    memory.ensure(before, output),
  );
  const admission = admitStructuralRule(memory, theory, rule);
  memory.ensure(triggerKey, admission);
  return rule;
}

export function defineV015UnaryEvaluationLifecycle(
  memory: WriteMemory,
  theory: LinkHandle,
  profileRoot: LinkHandle,
  roleSeed: LinkHandle,
): V015UnaryLifecycleRules {
  const profile = readV015EvaluationProfile(memory, profileRoot);
  const roles = materializeRoles(memory, roleSeed, 9);
  const [
    kOpen, fOpen, gOpen, xOpen,
    kResume, fResume, vResume,
    kPublish, vPublish,
  ] = roles;
  if (
    kOpen === undefined || fOpen === undefined ||
    gOpen === undefined || xOpen === undefined ||
    kResume === undefined || fResume === undefined ||
    vResume === undefined || kPublish === undefined ||
    vPublish === undefined
  ) {
    return fail("role-seed-collision");
  }

  const inner = memory.ensure(
    profile.callTag,
    memory.ensure(gOpen, xOpen),
  );
  const outer = memory.ensure(
    profile.callTag,
    memory.ensure(fOpen, inner),
  );
  const openBefore = memory.ensure(kOpen, outer);
  const openAfter = memory.ensure(
    materializeV015ContinuationFrame(memory, kOpen, fOpen),
    inner,
  );
  const open = admitTriggeredRule(
    memory,
    theory,
    profile.callTag,
    [kOpen, fOpen, gOpen, xOpen],
    openBefore,
    [openAfter],
  );

  const resumeBefore = memory.ensure(
    materializeV015ContinuationFrame(memory, kResume, fResume),
    memory.ensure(profile.doneTag, vResume),
  );
  const resumeAfter = memory.ensure(
    kResume,
    memory.ensure(profile.callTag, memory.ensure(fResume, vResume)),
  );
  const resume = admitTriggeredRule(
    memory,
    theory,
    profile.doneTag,
    [kResume, fResume, vResume],
    resumeBefore,
    [resumeAfter],
  );

  const publishBefore = memory.ensure(
    materializeV015RootEvaluationBoundary(memory, kPublish),
    memory.ensure(profile.doneTag, vPublish),
  );
  const publishAfter = memory.ensure(kPublish, vPublish);
  const publish = admitTriggeredRule(
    memory,
    theory,
    profile.doneTag,
    [kPublish, vPublish],
    publishBefore,
    [publishAfter],
  );

  return Object.freeze({ open, resume, publish });
}

export function defineV015GroundedUnaryEvaluationRule(
  memory: WriteMemory,
  theory: LinkHandle,
  profileRoot: LinkHandle,
  roleSeed: LinkHandle,
  fn: LinkHandle,
  input: LinkHandle,
  output: LinkHandle,
): LinkHandle {
  const profile = readV015EvaluationProfile(memory, profileRoot);
  const caller = materializeRoles(memory, roleSeed, 1)[0];
  if (caller === undefined) return fail("role-seed-collision");
  const before = memory.ensure(
    caller,
    memory.ensure(profile.callTag, memory.ensure(fn, input)),
  );
  const after = memory.ensure(
    caller,
    memory.ensure(profile.doneTag, output),
  );
  return admitTriggeredRule(
    memory,
    theory,
    profile.callTag,
    [caller],
    before,
    [after],
  );
}
