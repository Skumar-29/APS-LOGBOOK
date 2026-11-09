import { editRange } from "../../src/domain/diary";
import { emptyState, ensureDay } from "../../src/domain/model";

export const restartDay = "2026-11-09";
export const assessmentTime = Date.parse("2026-11-09T03:58:00Z"); // 1:58 pm QLD

export function overlappingRestart() {
  const workspace = emptyState();
  workspace.onboarded = true;
  workspace.settings.autoPages = false;
  Object.assign(workspace.profile, {
    name: "Restart Regression", licence: "TEST", base: "QLD",
    zone: "Australia/Brisbane", scheme: "BFM", twoUp: false,
    certificate: "BFM-TEST", certificateExpiry: "2027-12-31",
  });
  ensureDay(workspace, "2026-11-08").restDefault = "stationary";
  ensureDay(workspace, restartDay).restDefault = "stationary";
  editRange(workspace, "2026-11-08", 80, 96, "work");
  for (const [start, end] of [[0, 8], [9, 18], [19, 30], [32, 40]]) {
    editRange(workspace, restartDay, start, end, "work");
  }
  return workspace;
}
