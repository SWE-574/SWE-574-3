/**
 * Smoke tests for UpcomingScheduleCard component.
 *
 * react-test-renderer is not installed in this project (node test environment).
 * We test the month-grid and selected-day logic exercised by the component.
 */

import { addDays, buildMonthGrid, startOfDay, toDateString } from "../../../../utils/calendarItems";
import type { CalendarItem } from "../../../../api/calendar";

function makeItemOnDate(id: string, date: Date): CalendarItem {
  const start = new Date(date);
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

describe("UpcomingScheduleCard month grid", () => {
  it("always produces a 6x7 month grid", () => {
    const grid = buildMonthGrid(new Date(), []);
    expect(grid).toHaveLength(6);
    expect(grid.every((week) => week.length === 7)).toBe(true);
  });

  it("marks scheduled days inside the month grid", () => {
    const today = startOfDay(new Date());
    const item = makeItemOnDate("a", today);
    const grid = buildMonthGrid(today, [item]);
    const matchingCell = grid.flat().find((cell) => toDateString(cell.date) === toDateString(today));
    expect(matchingCell?.items).toHaveLength(1);
  });
});

// ── Selected day filtering ────────────────────────────────────────────────
// Verifies the component's day-selection logic: when a day is selected,
// only items starting on that day should be visible.

describe("UpcomingScheduleCard selected-day filtering", () => {
  it("filters to only items matching the selected day key", () => {
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    const items: CalendarItem[] = [
      makeItemOnDate("a", today),
      makeItemOnDate("b", tomorrow),
    ];
    const selectedDayKey = toDateString(today);
    const filtered = items.filter((item) => {
      const itemDay = toDateString(startOfDay(new Date(item.start)));
      return itemDay === selectedDayKey;
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("a");
  });

  it("returns no items when selected day has none", () => {
    const items: CalendarItem[] = [];
    const day = toDateString(startOfDay(new Date()));
    const filtered = items.filter((item) => {
      const itemDay = toDateString(startOfDay(new Date(item.start)));
      return itemDay === day;
    });
    expect(filtered).toHaveLength(0);
  });
});
