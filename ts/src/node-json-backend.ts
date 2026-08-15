import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import type { PersistentTopologyBackend, StoredDataset } from "./persistent-store.js";

export class NodeJsonBackendError extends Error {
  override readonly name = "NodeJsonBackendError";
}

function backendError(message: string, cause?: unknown): NodeJsonBackendError {
  return new NodeJsonBackendError(message, cause === undefined ? undefined : { cause });
}

function isErrno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}

function serialize(dataset: StoredDataset): string {
  const envelope = {
    schema: dataset.schema,
    lineage: dataset.lineage,
    topology: {
      schema: dataset.topology.schema,
      root: dataset.topology.root,
      links: dataset.topology.links.map(([start, end]) => [start, end]),
    },
  };
  return `${JSON.stringify(envelope)}\n`;
}

export class NodeJsonFileBackend implements PersistentTopologyBackend {
  private serial = 0;

  constructor(readonly path: string) {
    if (typeof path !== "string" || path.length === 0) throw backendError("invalid Node JSON backend path");
  }

  load(): StoredDataset | undefined {
    let text: string;
    try {
      text = readFileSync(this.path, "utf8");
    } catch (error) {
      if (isErrno(error, "ENOENT")) return undefined;
      throw backendError("cannot read persistent JSON dataset", error);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw backendError("invalid persistent JSON dataset", error);
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw backendError("persistent JSON dataset must be an object");
    }
    return parsed as StoredDataset;
  }

  commit(dataset: StoredDataset): void {
    const directory = dirname(this.path);
    try {
      mkdirSync(directory, { recursive: true });
    } catch (error) {
      throw backendError("cannot create persistent JSON directory", error);
    }

    const temporary = this.nextTemporaryPath(directory);
    let descriptor: number | undefined;
    try {
      descriptor = openSync(temporary, "wx");
      writeFileSync(descriptor, serialize(dataset), "utf8");
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      this.replaceTemporary(temporary);
    } catch (error) {
      if (descriptor !== undefined) {
        try { closeSync(descriptor); } catch { /* preserve primary failure */ }
      }
      try {
        if (existsSync(temporary)) unlinkSync(temporary);
      } catch { /* preserve primary failure */ }
      if (error instanceof NodeJsonBackendError) throw error;
      throw backendError("cannot commit persistent JSON dataset", error);
    }
  }

  protected replaceTemporary(temporary: string): void {
    renameSync(temporary, this.path);
  }

  private nextTemporaryPath(directory: string): string {
    this.serial += 1;
    return join(directory, `.${basename(this.path)}.${process.pid}.${this.serial}.tmp`);
  }
}
