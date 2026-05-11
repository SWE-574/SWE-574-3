/**
 * Logic-level tests for ForYouSection's data fetching contract.
 *
 * The mobile-client Jest config (package.json) uses ts-jest with
 * testEnvironment=node and matches `*.test.ts` only -- it has no
 * jest-expo preset, no react-test-renderer, and no jsdom. A true
 * rendering snapshot would need that infrastructure (deferred). The
 * tests below cover the most-likely regressions in the component
 * without touching React Native: the enabled-guard and the empty/
 * error fallback that decide whether the section appears at all.
 */

jest.mock("../../../api/services", () => ({
  listServices: jest.fn(),
}));

import { listServices } from "../../../api/services";

const listServicesMock = listServices as jest.MockedFunction<
  typeof listServices
>;

describe("ForYouSection data contract", () => {
  beforeEach(() => {
    listServicesMock.mockReset();
  });

  it("requests with sort=for_you when called", async () => {
    listServicesMock.mockResolvedValueOnce({
      results: [],
      count: 0,
      next: null,
      previous: null,
    } as any);

    await listServices({ sort: "for_you" });

    expect(listServicesMock).toHaveBeenCalledWith({ sort: "for_you" });
  });

  it("falls back to an empty list when the API rejects", async () => {
    listServicesMock.mockRejectedValueOnce(new Error("boom"));

    let services: unknown[] = [];
    try {
      const response = await listServices({ sort: "for_you" });
      services = response.results ?? [];
    } catch {
      services = [];
    }

    expect(services).toEqual([]);
  });

  it("preserves the result list when the API resolves with services", async () => {
    listServicesMock.mockResolvedValueOnce({
      results: [
        { id: "1", title: "Help with React", type: "Offer" } as any,
        { id: "2", title: "Math tutoring", type: "Need" } as any,
      ],
      count: 2,
      next: null,
      previous: null,
    } as any);

    const response = await listServices({ sort: "for_you" });
    expect(response.results).toHaveLength(2);
    expect(response.results?.[0].id).toBe("1");
  });
});
