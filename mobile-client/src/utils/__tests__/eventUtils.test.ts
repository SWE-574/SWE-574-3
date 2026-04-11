import {
  isWithinLockdownWindow,
  isFutureEvent,
  isPastEvent,
  spotsLeft,
  isEventFull,
  isEventBanned,
} from "../eventUtils";

describe("isWithinLockdownWindow", () => {
  it("returns false for null/undefined", () => {
    expect(isWithinLockdownWindow(null)).toBe(false);
    expect(isWithinLockdownWindow(undefined)).toBe(false);
  });

  it("returns true when within 24h before event", () => {
    const inTenHours = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString();
    expect(isWithinLockdownWindow(inTenHours)).toBe(true);
  });

  it("returns false when more than 24h before event", () => {
    const inTwoDays = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    expect(isWithinLockdownWindow(inTwoDays)).toBe(false);
  });

  it("returns false when event has already started", () => {
    const yesterday = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(isWithinLockdownWindow(yesterday)).toBe(false);
  });
});

describe("isFutureEvent", () => {
  it("returns false for null/undefined", () => {
    expect(isFutureEvent(null)).toBe(false);
    expect(isFutureEvent(undefined)).toBe(false);
  });

  it("returns true for future times", () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    expect(isFutureEvent(tomorrow)).toBe(true);
  });

  it("returns false for past times", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(isFutureEvent(yesterday)).toBe(false);
  });
});

describe("isPastEvent", () => {
  it("returns false for null/undefined", () => {
    expect(isPastEvent(null)).toBe(false);
    expect(isPastEvent(undefined)).toBe(false);
  });

  it("returns true for past times", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(isPastEvent(yesterday)).toBe(true);
  });

  it("returns false for future times", () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    expect(isPastEvent(tomorrow)).toBe(false);
  });
});

describe("spotsLeft", () => {
  it("returns remaining spots", () => {
    expect(spotsLeft(10, 7)).toBe(3);
  });

  it("clamps to 0 when over capacity", () => {
    expect(spotsLeft(5, 8)).toBe(0);
  });

  it("returns 0 when exactly full", () => {
    expect(spotsLeft(5, 5)).toBe(0);
  });
});

describe("isEventFull", () => {
  it("returns true when at capacity", () => {
    expect(isEventFull(10, 10)).toBe(true);
  });

  it("returns true when over capacity", () => {
    expect(isEventFull(10, 12)).toBe(true);
  });

  it("returns false when under capacity", () => {
    expect(isEventFull(10, 7)).toBe(false);
  });

  it("returns false when max is 0 (unlimited)", () => {
    expect(isEventFull(0, 5)).toBe(false);
  });
});

describe("isEventBanned", () => {
  it("returns false for null/undefined", () => {
    expect(isEventBanned(null)).toBe(false);
    expect(isEventBanned(undefined)).toBe(false);
  });

  it("returns true when ban is in the future", () => {
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(isEventBanned(nextWeek)).toBe(true);
  });

  it("returns false when ban has expired", () => {
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(isEventBanned(lastWeek)).toBe(false);
  });
});
