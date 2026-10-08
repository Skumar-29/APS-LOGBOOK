import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect } from "vitest";
import {
  closeDatabase,
  loadWorkspace,
  saveWorkspace,
  recoveryWorkspace,
} from "../src/storage";
import { emptyState, clone } from "../src/domain/model";
beforeEach(async () => {
  closeDatabase();
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.deleteDatabase("aps-truck-workspace-v2");
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
});
describe("atomic device storage", () => {
  it("initializes empty and reloads saved records", async () => {
    const s = await loadWorkspace();
    expect(s.revision).toBe(0);
    s.profile.name = "TEST";
    const saved = await saveWorkspace(s, 0);
    expect(saved.revision).toBe(1);
    expect((await loadWorkspace()).profile.name).toBe("TEST");
  });
  it("rejects stale concurrent writes without losing the winner", async () => {
    const s = await saveWorkspace(emptyState(), 0),
      a = clone(s),
      b = clone(s);
    a.profile.name = "Tab A";
    b.profile.name = "Tab B";
    await saveWorkspace(a, 1);
    await expect(saveWorkspace(b, 1)).rejects.toThrow("Another tab");
    expect((await loadWorkspace()).profile.name).toBe("Tab A");
  });
  it("keeps a pre-import recovery checkpoint in the same transaction", async () => {
    const s = emptyState();
    s.profile.name = "Before";
    const first = await saveWorkspace(s, 0),
      next = clone(first);
    next.profile.name = "After";
    await saveWorkspace(next, 1, true);
    expect((await recoveryWorkspace())?.profile.name).toBe("Before");
    expect((await loadWorkspace()).profile.name).toBe("After");
  });
});

import { makeDocument } from "../src/domain/documents";
import { readDocumentData } from "../src/storage";
import { exportBackup, inspectBackup, applyImport } from "../src/domain/backup";
const pdf = () =>
  new File(["%PDF-1.4\nSynthetic test document\n%%EOF"], "BFM-test.pdf", {
    type: "application/pdf",
  });
describe("offline documents and existing installations", () => {
  it("upgrades version-one storage without replacing the saved workspace", async () => {
    const old: any = emptyState();
    old.profile.name = "Existing driver";
    old.notes = [{ id: "keep", title: "Existing note" }];
    delete old.documents;
    delete old.settings.diaryLayoutVersion;
    old.settings.fullDay = false;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("aps-truck-workspace-v2", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("workspace");
        request.result.createObjectStore("recovery");
      };
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction("workspace", "readwrite");
        tx.objectStore("workspace").put(old, "current");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
      request.onerror = () => reject(request.error);
    });
    const loaded = await loadWorkspace();
    expect(loaded.profile.name).toBe("Existing driver");
    expect(loaded.notes[0].id).toBe("keep");
    expect(loaded.documents).toEqual([]);
    expect(loaded.settings.fullDay).toBe(true);
  });
  it("stores file bytes separately, exports them and restores them on a clean device", async () => {
    const state = emptyState(),
      d = await makeDocument(pdf());
    state.documents = [d];
    const saved = await saveWorkspace(state, 0);
    expect(saved.documents[0].data).toBeUndefined();
    expect(await readDocumentData(d.hash)).toBe(d.data);
    const backup = await exportBackup(saved),
      plan = await inspectBackup(backup, emptyState());
    expect(plan.state.documents[0].data).toBe(d.data);
    closeDatabase();
    await new Promise<void>((resolve) => {
      const r = indexedDB.deleteDatabase("aps-truck-workspace-v2");
      r.onsuccess = () => resolve();
    });
    const restored = await saveWorkspace(
      applyImport(emptyState(), plan, "replace"),
      0,
    );
    expect(restored.documents[0].title).toBe("BFM-test");
    expect(await readDocumentData(d.hash)).toBe(d.data);
  });
  it("keeps checkpoint files, then removes bytes only when neither state references them", async () => {
    const state = emptyState(),
      d = await makeDocument(pdf());
    state.documents = [d];
    const first = await saveWorkspace(state, 0),
      next = clone(first);
    next.documents = [];
    const saved = await saveWorkspace(next, 1, true);
    expect((await recoveryWorkspace())?.documents[0].hash).toBe(d.hash);
    expect(await readDocumentData(d.hash)).toBe(d.data);
    await saveWorkspace(saved, 2, true);
    await expect(readDocumentData(d.hash)).rejects.toThrow("unavailable");
  });
  it("rejects a missing or changed file without committing other edits", async () => {
    const first = await saveWorkspace(emptyState(), 0),
      d = await makeDocument(pdf()),
      next = clone(first);
    next.profile.name = "Should not save";
    next.documents = [{ ...d, data: undefined }];
    await expect(saveWorkspace(next, 1)).rejects.toThrow("missing");
    expect((await loadWorkspace()).profile.name).toBe(first.profile.name);
    next.documents = [{ ...d, hash: "0".repeat(64) }];
    await expect(saveWorkspace(next, 1)).rejects.toThrow("checksum");
    expect((await loadWorkspace()).revision).toBe(1);
  });
  it("does not duplicate files when the same backup is merged twice", async () => {
    const state = emptyState();
    state.documents = [await makeDocument(pdf())];
    const plan = await inspectBackup(await exportBackup(state), emptyState());
    const once = applyImport(emptyState(), plan, "merge");
    expect(() => applyImport(once, plan, "merge")).toThrow(
      "already been imported",
    );
    const twice = applyImport(
      once,
      { ...plan, hash: "different-backup" },
      "merge",
    );
    expect(twice.documents).toHaveLength(1);
  });
});
