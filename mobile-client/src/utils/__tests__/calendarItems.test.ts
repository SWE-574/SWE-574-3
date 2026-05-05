/**
 * Unit tests for calendarItems utility helpers.
 */

import {
  groupItemsByAgenda,
  nextNItems,
  formatItemRange,
  accentColorFor,
  buildMonthGrid,
  addDays,
  startOfDay,
  isSameDay,
} from "../calendarItems";
import type { CalendarItem } from "../../api/calendar";

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeItem(
  id: string,
  startOffset: number, // hours from now
  durationHours = 1,
  accent: "GREEN" | "BLUE" | "TEAL" = "GREEN",
): CalendarItem {
  const start = new Date(Date.now() + startOffset * 60 * 60 * 1000);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  return {
    id,
    kind: "service_session",
    title: `Item ${id}`,
    start: start.toISOString(),
    end: end.toISOString(),
    duration_hours: durationHours,
    location_type: "Online",
    location_label: null,
    service_type: "Offer",
    service_id: null,
    handshake_id: null,
    chat_id: null,
    counterpart: null,
    is_owner: true,
    status: "accepted",
    accent_token: accent,
    link: { type: "service", id },
  };
}

// ── groupItemsByAgenda ─────────────────────────────────────────────────────

describe("groupItemsByAgenda", () => {
  it("puts a same-day item in today bucket", () => {
    const item = makeItem("t1", 2); // 2h from now, still today
    const groups = groupItemsByAgenda([item]);
    expect(groups.today).toHaveLength(1);
    expect(groups.today[0].id).toBe("t1");
    expect(groups.tomorrow).toHaveLength(0);
    expect(groups.thisWeek).toHaveLength(0);
    expect(groups.later).toHaveLength(0);
  });

  it("puts a tomorrow item in tomorrow bucket", () => {
    const tomorrowHours = 26; // ~tomorrow
    const item = makeItem("t2", tomorrowHours);
    const groups = groupItemsByAgenda([item]);
    expect(groups.tomorrow).toHaveLength(1);
    expect(groups.tomorrow[0].id).toBe("t2");
  });

  it("puts a 3-day-ahead item in thisWeek bucket", () => {
    const item = makeItem("t3", 3 * 24); // 3 days ahead
    const groups = groupItemsByAgenda([item]);
    expect(groups.thisWeek).toHaveLength(1);
    expect(groups.thisWeek[0].id).toBe("t3");
  });

  it("puts an 8-day-ahead item in later bucket", () => {
    const item = makeItem("t4", 8 * 24); // 8 days ahead
    const groups = groupItemsByAgenda([item]);
    expect(groups.later).toHaveLength(1);
    expect(groups.later[0].id).toBe("t4");
  });

  it("handles empty input", () => {
    const groups = groupItemsByAgenda([]);
    expect(groups.today).toHaveLength(0);
    expect(groups.tomorrow).toHaveLength(0);
    expect(groups.thisWeek).toHaveLength(0);
    expect(groups.later).toHaveLength(0);
  });

  it("correctly buckets a mix of items", () => {
    const items = [
      makeItem("today", 1),
      makeItem("tomorrow", 26),
      makeItem("week", 3 * 24),
      makeItem("later", 8 * 24),
    ];
    const groups = groupItemsByAgenda(items);
    expect(groups.today.map((i) => i.id)).toContain("today");
    expect(groups.tomorrow.map((i) => i.id)).toContain("tomorrow");
    expect(groups.thisWeek.map((i) => i.id)).toContain("week");
    expect(groups.later.map((i) => i.id)).toContain("later");
  });
});

// ── nextNItems ────────────────────────────────────────────────────────────

describe("nextNItems", () => {
  it("returns up to N items in chronological order", () => {
    const items = [
      makeItem("c", 3),
      makeItem("a", 1),
      makeItem("b", 2),
      makeItem("d", 4),
    ];
    const result = nextNItems(items, 3);
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("a");
    expect(result[1].id).toBe("b");
    expect(result[2].id).toBe("c");
  });

  it("returns all items when count < N", () => {
    const items = [makeItem("x", 1), makeItem("y", 2)];
    const result = nextNItems(items, 5);
    expect(result).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(nextNItems([], 3)).toHaveLength(0);
  });

  it("excludes items whose end time is before fromDate", () => {
    const past = makeItem("past", -5); // started 5h ago, ends 4h ago (1h duration)
    const future = makeItem("future", 2);
    // Use 'now' so past item's end is in the past
    const result = nextNItems([past, future], 5, new Date());
    expect(result.some((i) => i.id === "past")).toBe(false);
    expect(result.some((i) => i.id === "future")).toBe(true);
  });
});

// ── formatItemRange ───────────────────────────────────────────────────────

describe("formatItemRange", () => {
  it("returns a non-empty string for a valid item", () => {
    const item = makeItem("f1", 2, 1.5);
    const result = formatItemRange(item);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes the duration label", () => {
    const item = makeItem("f2", 2, 2);
    const result = formatItemRange(item);
    expect(result).toContain("2h");
  });

  it("includes an em-dash separator", () => {
    const item = makeItem("f3", 2, 1);
    const result = formatItemRange(item);
    expect(result).toContain("–");
  });
});

// ── accentColorFor ────────────────────────────────────────────────────────

describe("accentColorFor", () => {
  it("maps GREEN to a non-empty color string", () => {
    const color = accentColorFor("GREEN");
    expect(typeof color).toBe("string");
    expect(color.length).toBeGreaterThan(0);
  });

  it("maps BLUE to a different color than GREEN", () => {
    expect(accentColorFor("BLUE")).not.toBe(accentColorFor("GREEN"));
  });

  it("maps TEAL to a color string (scheduled_commitment accent)", () => {
    const color = accentColorFor("TEAL");
    expect(typeof color).toBe("string");
    expect(color.length).toBeGreaterThan(0);
  });

  it("maps TEAL to a different color than GREEN and BLUE", () => {
    expect(accentColorFor("TEAL")).not.toBe(accentColorFor("GREEN"));
    expect(accentColorFor("TEAL")).not.toBe(accentColorFor("BLUE"));
  });
});

// ── buildMonthGrid ────────────────────────────────────────────────────────

describe("buildMonthGrid", () => {
  it("always returns 6 rows of 7 cells", () => {
    const month = new Date(2024, 0, 1); // January 2024
    const grid = buildMonthGrid(month, []);
    expect(grid).toHaveLength(6);
    for (const week of grid) {
      expect(week).toHaveLength(7);
    }
  });

  it("marks today correctly", () => {
    const today = new Date();
    const month = new Date(today.getFullYear(), today.getMonth(), 1);
    const grid = buildMonthGrid(month, []);
    const todayCells = grid.flat().filter((c) => c.isToday);
    expect(todayCells).toHaveLength(1);
    expect(todayCells[0].date.getDate()).toBe(today.getDate());
  });

  it("marks cells outside current month as isCurrentMonth=false", () => {
    const month = new Date(2024, 0, 1); // January 2024
    const grid = buildMonthGrid(month, []);
    const outsideCells = grid.flat().filter((c) => !c.isCurrentMonth);
    expect(outsideCells.length).toBeGreaterThan(0);
  });
});

// ── Date helpers ──────────────────────────────────────────────────────────

describe("addDays", () => {
  it("adds positive days correctly", () => {
    const date = new Date(2024, 0, 1);
    const result = addDays(date, 5);
    expect(result.getDate()).toBe(6);
    expect(result.getMonth()).toBe(0);
  });

  it("handles month boundary", () => {
    const date = new Date(2024, 0, 30); // Jan 30
    const result = addDays(date, 5); // Feb 4
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(4);
  });
});

describe("startOfDay", () => {
  it("zeroes out time components", () => {
    const date = new Date(2024, 5, 15, 14, 30, 45, 123);
    const result = startOfDay(date);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });
});

describe("isSameDay", () => {
  it("returns true for same date at different times", () => {
    const a = new Date(2024, 5, 15, 8, 0);
    const b = new Date(2024, 5, 15, 23, 59);
    expect(isSameDay(a, b)).toBe(true);
  });

  it("returns false for different dates", () => {
    const a = new Date(2024, 5, 15);
    const b = new Date(2024, 5, 16);
    expect(isSameDay(a, b)).toBe(false);
  });
});
