import {
  isCurrentAuthSession,
  nextAuthSessionGeneration,
} from "../../utils/authRefresh";

describe("auth session generation", () => {
  it("marks in-flight work stale after the session generation advances", () => {
    const startedAt = 0;
    const afterLogout = nextAuthSessionGeneration(startedAt);

    expect(isCurrentAuthSession(startedAt, startedAt)).toBe(true);
    expect(isCurrentAuthSession(startedAt, afterLogout)).toBe(false);
  });
});
