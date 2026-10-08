import { emptyState, upgradeWorkspace, type Workspace } from "./domain/model";
import {
  decodeDocument,
  fileHash,
  validateDocument,
  MAX_DOCUMENT_TOTAL,
} from "./domain/documents";
const DB = "aps-truck-workspace-v2";
let connection: Promise<IDBDatabase> | null = null;
export function openDatabase() {
  return (connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      for (const name of ["workspace", "recovery", "documents"])
        if (!r.result.objectStoreNames.contains(name))
          r.result.createObjectStore(name);
    };
    r.onsuccess = () => {
      r.result.onversionchange = () => {
        r.result.close();
        connection = null;
      };
      resolve(r.result);
    };
    r.onerror = () => {
      connection = null;
      reject(r.error);
    };
    r.onblocked = () =>
      reject(Error("Close the other Work Diary tab to update storage."));
  }));
}
export async function loadWorkspace(): Promise<Workspace> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const r = db
      .transaction("workspace")
      .objectStore("workspace")
      .get("current");
    r.onsuccess = () => {
      if (r.result && r.result.schema !== 2)
        reject(Error("This backup needs a newer app version."));
      else resolve(upgradeWorkspace(r.result || emptyState()));
    };
    r.onerror = () => reject(r.error);
  });
}
export async function readDocumentData(hash: string): Promise<string> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const r = db.transaction("documents").objectStore("documents").get(hash);
    r.onsuccess = () =>
      typeof r.result === "string"
        ? resolve(r.result)
        : reject(
            Error(
              "Document file is unavailable. Restore it from your full backup.",
            ),
          );
    r.onerror = () => reject(r.error);
  });
}
export async function saveWorkspace(
  next: Workspace,
  expected: number,
  checkpoint = false,
) {
  upgradeWorkspace(next);
  if (next.documents.reduce((n, d) => n + d.size, 0) > MAX_DOCUMENT_TOTAL)
    throw Error(
      "Document storage limit is 24 MB. Remove an unused document before adding another.",
    );
  for (const d of next.documents) {
    validateDocument(d);
    if (d.data && (await fileHash(decodeDocument(d.data))) !== d.hash)
      throw Error("Document checksum failed. No records changed.");
  }
  const saved: Workspace = {
    ...next,
    revision: expected + 1,
    documents: next.documents.map(({ data, ...metadata }) => metadata),
  };
  const db = await openDatabase();
  return new Promise<Workspace>((resolve, reject) => {
    const tx = db.transaction(
      ["workspace", "recovery", "documents"],
      "readwrite",
    );
    let failure = "";
    const store = tx.objectStore("workspace"),
      assets = tx.objectStore("documents"),
      recovery = tx.objectStore("recovery");
    const get = store.get("current");
    get.onsuccess = () => {
      try {
        const old = get.result as Workspace | undefined;
        if ((old?.revision || 0) !== expected) {
          failure =
            "Another tab saved changes. Reload before editing to avoid overwriting records.";
          tx.abort();
          return;
        }
        if (checkpoint && old) recovery.put(old, "previous");
        for (const d of next.documents) {
          if (d.data) assets.put(d.data, d.hash);
          else {
            const check = assets.getKey(d.hash);
            check.onsuccess = () => {
              if (check.result === undefined) {
                failure =
                  "A document file is missing. Restore it from your backup.";
                tx.abort();
              }
            };
          }
        }
        store.put(saved, "current");
        // Keep files referenced by either current records or the recovery checkpoint.
        const prior = recovery.get("previous");
        prior.onsuccess = () => {
          const keep = new Set(
            [...saved.documents, ...(prior.result?.documents || [])].map(
              (d) => d.hash,
            ),
          );
          const keys = assets.getAllKeys();
          keys.onsuccess = () => {
            for (const key of keys.result)
              if (!keep.has(String(key))) assets.delete(key);
          };
        };
      } catch (error) {
        failure = error instanceof Error ? error.message : "Save failed.";
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      if (typeof BroadcastChannel !== "undefined") {
        const c = new BroadcastChannel("truck-workspace");
        c.postMessage(saved.revision);
        c.close();
      }
      resolve(saved);
    };
    tx.onerror = () =>
      reject(
        Error(
          failure ||
            tx.error?.message ||
            "Storage failed. Your previous saved records are unchanged.",
        ),
      );
    tx.onabort = () =>
      reject(Error(failure || tx.error?.message || "Save did not complete."));
  });
}
export async function recoveryWorkspace(): Promise<Workspace | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const r = db
      .transaction("recovery")
      .objectStore("recovery")
      .get("previous");
    r.onsuccess = () =>
      resolve(r.result ? upgradeWorkspace(r.result) : undefined);
    r.onerror = () => reject(r.error);
  });
}
export function closeDatabase() {
  connection?.then((d) => d.close());
  connection = null;
}
