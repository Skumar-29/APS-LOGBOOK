import { describe, it, expect } from "vitest";
import { displayClock, displaySlot, hhmm } from "../src/domain/time";
import { emptyState, upgradeWorkspace } from "../src/domain/model";

describe("diary time display preference", () => {
  it("uses 12-hour AM/PM labels across midday and midnight", () => {
    expect(displaySlot(0)).toBe("12:00 AM");
    expect(displaySlot(48, "12h", false)).toBe("12 PM");
    expect(displaySlot(52, "12h", false)).toBe("1 PM");
    expect(displaySlot(56, "12h", false)).toBe("2 PM");
    expect(displaySlot(92, "12h", false)).toBe("11 PM");
    expect(displaySlot(96, "12h")).toBe("12:00 AM");
    expect(displayClock("13:15", "12h")).toBe("1:15 PM");
    expect(displayClock("00:45", "12h")).toBe("12:45 AM");
  });
  it("preserves 24-hour display when selected and 24-hour internal time", () => {
    expect(displaySlot(52, "24h", false)).toBe("13");
    expect(displaySlot(56, "24h")).toBe("14:00");
    expect(displaySlot(96, "24h")).toBe("24:00");
    expect(displayClock("13:15", "24h")).toBe("13:15");
    expect(hhmm(52)).toBe("13:00");
  });
  it("defaults migrated settings to 12-hour without altering existing diary entries", () => {
    const state = emptyState();
    state.settings.timeFormat = undefined;
    const dayBefore = structuredClone(state.days);
    upgradeWorkspace(state);
    expect(state.settings.timeFormat).toBe("12h");
    expect(state.days).toEqual(dayBefore);
    state.settings.timeFormat = "24h";
    upgradeWorkspace(state);
    expect(state.settings.timeFormat).toBe("24h");
  });
});
