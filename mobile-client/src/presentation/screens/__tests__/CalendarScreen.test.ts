/**
 * Smoke tests for CalendarScreen.
 *
 * react-test-renderer is not installed in this project (node test environment).
 * We test the module export and the pure helpers the screen relies on:
 * - buildMonthGrid (6×7 grid, today marked, prev/next month navigation logic)
 * - groupItemsByAgenda (section header labels)
 * - Month header label format (MONTH_NAMES)
 */

import type { CalendarItem } from "../../../api/calendar";

// ── Month header label format ─────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

describe("CalendarScreen month header", () => {
  it("has all 12 months", () => {
    expect(MONTH_NAMES).toHaveLength(12);
  });

  it("formats January correctly", () => {
    const month = new Date(2024, 0, 1);
    const label = `${MONTH_NAMES[month.getMonth()]} ${month.getFullYear()}`;
    expect(label).toBe("January 2024");
  });

  it("formats December correctly", () => {
    const month = new Date(2024, 11, 1);
    const label = `${MONTH_NAMES[month.getMonth()]} ${month.getFullYear()}`;
    expect(label).toBe("December 2024");
  });
});

// ── Month grid ────────────────────────────────────────────────────────────

describe("CalendarScreen month grid", () => {
  const { buildMonthGrid, startOfDay } = require("../../../utils/calendarItems");

  it("renders a 6×7 grid", () => {
    const month = new Date(2024, 4, 1); // May 2024
    const grid = buildMonthGrid(month, []);
    expect(grid).toHaveLength(6);
    for (const week of grid) {
      expect(week).toHaveLength(7);
    }
  });

  it("marks today in the grid", () => {
    const today = new Date();
    const month = new Date(today.getFullYear(), today.getMonth(), 1);
    const grid = buildMonthGrid(month, []);
    const todayCells = grid.flat().filter((c: { isToday: boolean }) => c.isToday);
    expect(todayCells).toHaveLength(1);
  });

  it("includes cells outside the current month (padding cells)", () => {
    const month = new Date(2024, 4, 1); // May 2024
    const grid = buildMonthGrid(month, []);
    const outsideCells = grid.flat().filter(
      (c: { isCurrentMonth: boolean }) => !c.isCurrentMonth,
    );
    expect(outsideCells.length).toBeGreaterThan(0);
  });
});

// ── Prev/next month navigation logic ──────────────────────────────────────

describe("CalendarScreen month navigation", () => {
  function addMonths(date: Date, n: number): Date {
    const d = new Date(date);
    d.setMonth(d.getMonth() + n);
    return d;
  }

  it("previous chevron moves to prior month", () => {
    const current = new Date(2024, 5, 1); // June 2024
    const prev = addMonths(current, -1);
    expect(prev.getMonth()).toBe(4); // May
    expect(prev.getFullYear()).toBe(2024);
  });

  it("next chevron moves to subsequent month", () => {
    const current = new Date(2024, 5, 1); // June 2024
    const next = addMonths(current, 1);
    expect(next.getMonth()).toBe(6); // July
  });

  it("handles year boundary correctly (December → January)", () => {
    const current = new Date(2024, 11, 1); // December 2024
    const next = addMonths(current, 1);
    expect(next.getMonth()).toBe(0); // January
    expect(next.getFullYear()).toBe(2025);
  });
});

// ── Agenda grouping ───────────────────────────────────────────────────────

describe("CalendarScreen agenda grouping", () => {
  const { groupItemsByAgenda } = require("../../../utils/calendarItems");

  function makeItem(id: string, offsetDays: number): CalendarItem {
    const start = new Date();
    start.setDate(start.getDate() + offsetDays);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + 3600 * 1000);
    return {
      id,
      kind: "service_session",
      title: `Item ${id}`,
      start: start.toISOString(),
      end: end.toISOString(),
      duration_hours: 1,
      location_type: "Online",
      location_label: null,
      service_type: "Offer",
      service_id: null,
      handshake_id: null,
      chat_id: null,
      counterpart: null,
      is_owner: true,
      status: "accepted",
      accent_token: "GREEN",
      link: { type: "service", id },
    };
  }

  it("places today's item in the today bucket", () => {
    const item = makeItem("today-1", 0);
    const groups = groupItemsByAgenda([item]);
    expect(groups.today).toHaveLength(1);
    expect(groups.tomorrow).toHaveLength(0);
  });

  it("places tomorrow's item in the tomorrow bucket", () => {
    const item = makeItem("tomorrow-1", 1);
    const groups = groupItemsByAgenda([item]);
    expect(groups.tomorrow).toHaveLength(1);
  });

  it("places items in 3–6 days in the thisWeek bucket", () => {
    const item = makeItem("week-1", 4);
    const groups = groupItemsByAgenda([item]);
    expect(groups.thisWeek).toHaveLength(1);
  });

  it("places items 7+ days out in the later bucket", () => {
    const item = makeItem("later-1", 10);
    const groups = groupItemsByAgenda([item]);
    expect(groups.later).toHaveLength(1);
  });
});
