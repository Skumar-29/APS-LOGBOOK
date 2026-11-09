import { audit, type Workspace } from "./model";

/** Call through a checkpointed mutation so clearing and recovery are atomic. */
export function clearTestDiary(s: Workspace, confirmation: string) {
  if (confirmation !== "CLEAR") throw Error("Type CLEAR to confirm.");
  if (s.timer) throw Error("Finish the active timer before clearing the diary.");
  const removed = { days: Object.keys(s.days).length, activities: s.activities.length, pages: s.pages.length };
  s.days = {};
  s.activities = [];
  s.pages = [];
  audit(s, "Clear test diary", s.profile.id, removed, { days: 0, activities: 0, pages: 0 });
}
