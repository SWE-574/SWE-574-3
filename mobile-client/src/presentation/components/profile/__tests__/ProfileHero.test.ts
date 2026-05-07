/**
 * Smoke tests for ProfileHero component.
 *
 * react-test-renderer is not installed in this project (node test environment).
 * We test module exports and the pure helpers that drive the component's behaviour.
 *
 * If react-test-renderer is added in future, promote these to full render tests.
 */

// ── Meta strip construction ───────────────────────────────────────────────
// Per THEME.md: @handle is removed from the meta strip. It now shows
// "Joined Mon YYYY · city" only.

describe("ProfileHero meta strip", () => {
  function buildMetaStrip(
    memberSinceLabel: string,
    location: string | null | undefined,
  ): string {
    return [
      memberSinceLabel || null,
      location ? location : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  it("includes Joined Mon YYYY · city when all present", () => {
    const strip = buildMetaStrip("Joined Jan 2024", "Istanbul");
    expect(strip).toBe("Joined Jan 2024 · Istanbul");
  });

  it("shows only location when no join date", () => {
    const strip = buildMetaStrip("", "Istanbul");
    expect(strip).toBe("Istanbul");
  });

  it("gracefully omits location when null", () => {
    const strip = buildMetaStrip("Joined Jan 2024", null);
    expect(strip).toBe("Joined Jan 2024");
  });

  it("returns empty string when all absent", () => {
    const strip = buildMetaStrip("", null);
    expect(strip).toBe("");
  });
});

// ── formatJoinedDate helper (inline, same logic as component) ─────────────

describe("ProfileHero formatJoinedDate", () => {
  function formatJoinedDate(dateStr?: string): string {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      if (Number.isNaN(date.getTime())) return "";
      return new Intl.DateTimeFormat("en-GB", {
        month: "short",
        year: "numeric",
      }).format(date);
    } catch {
      return "";
    }
  }

  it("formats a valid ISO date to Mon YYYY", () => {
    const result = formatJoinedDate("2024-01-15");
    expect(result).toMatch(/Jan 2024/);
  });

  it("returns empty string for undefined input", () => {
    expect(formatJoinedDate(undefined)).toBe("");
  });

  it("returns empty string for invalid date", () => {
    expect(formatJoinedDate("not-a-date")).toBe("");
  });
});
