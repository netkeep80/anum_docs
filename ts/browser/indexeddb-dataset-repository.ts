import type { StoredDataset } from "../src/persistent-store.js";

const DATABASE_VERSION = 1;
const DATASET_STORE = "datasets";
const CURRENT_DATASET_KEY = "current";

export class IndexedDbDatasetRepositoryError extends Error {
  override readonly name = "IndexedDbDatasetRepositoryError";
}

function failure(message: string, cause?: unknown): IndexedDbDatasetRepositoryError {
  return new IndexedDbDatasetRepositoryError(
    message,
    cause === undefined ? undefined : { cause },
  );
}

function requestResult<T>(request: IDBRequest<T>, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(failure(message, request.error));
  });
}

function transactionCompletion(transaction: IDBTransaction, message: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(failure(message, transaction.error));
    transaction.onerror = () => {
      // `abort` is the authoritative terminal event; assigning this handler also
      // prevents an IndexedDB implementation from surfacing an unhandled error.
    };
  });
}

/**
 * Browser-only durable repository for one complete persistent dataset checkpoint.
 *
 * It intentionally does not implement `PersistentTopologyBackend`: that interface
 * is synchronous, while IndexedDB durability is only known after a transaction's
 * asynchronous `complete` event. Browser orchestration must explicitly await
 * `load()` / `save()` and may then use the unchanged synchronous PersistentStore
 * against an in-memory backend for semantic operations.
 */
export class IndexedDbDatasetRepository {
  constructor(
    readonly databaseName: string,
    private readonly factory: IDBFactory = indexedDB,
  ) {
    if (typeof databaseName !== "string" || databaseName.length === 0) {
      throw failure("invalid IndexedDB database name");
    }
  }

  async load(): Promise<StoredDataset | undefined> {
    const database = await this.open();
    try {
      const transaction = database.transaction(DATASET_STORE, "readonly");
      const completed = transactionCompletion(
        transaction,
        "cannot complete IndexedDB dataset read",
      );
      const value = await requestResult<unknown>(
        transaction.objectStore(DATASET_STORE).get(CURRENT_DATASET_KEY),
        "cannot read IndexedDB dataset",
      );
      await completed;
      return value === undefined ? undefined : value as StoredDataset;
    } finally {
      database.close();
    }
  }

  async save(dataset: StoredDataset): Promise<void> {
    const database = await this.open();
    try {
      const transaction = database.transaction(DATASET_STORE, "readwrite");
      const completed = transactionCompletion(
        transaction,
        "cannot commit IndexedDB dataset",
      );
      const request = transaction.objectStore(DATASET_STORE).put(
        dataset,
        CURRENT_DATASET_KEY,
      );
      await requestResult(request, "cannot write IndexedDB dataset");
      // Request success is not durability. Only transaction completion publishes
      // a successful save to callers.
      await completed;
    } finally {
      database.close();
    }
  }

  private open(): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = this.factory.open(this.databaseName, DATABASE_VERSION);
      } catch (error) {
        reject(failure("cannot open IndexedDB dataset database", error));
        return;
      }

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DATASET_STORE)) {
          database.createObjectStore(DATASET_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(
        failure("cannot open IndexedDB dataset database", request.error),
      );
      request.onblocked = () => reject(
        failure("IndexedDB dataset database upgrade is blocked"),
      );
    });
  }
}
