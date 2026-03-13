/**
 * Unit tests for Transactions API.
 */

import { listTransactions, getTransaction } from "../transactions";
import { mockFetchResolve, getLastFetchCall } from "./helpers";

describe("transactions", () => {
  beforeEach(() => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  it("listTransactions GETs /transactions/ with params", async () => {
    mockFetchResolve({ count: 0, results: [], next: null, previous: null });
    await listTransactions({ page: 1, page_size: 10 });
    const { url } = getLastFetchCall();
    expect(url).toContain("/transactions/");
    expect(url).toContain("page=1");
  });

  it("getTransaction GETs /transactions/:id/", async () => {
    const t = { id: "tx1", amount: "10", type: "credit" };
    mockFetchResolve(t);
    expect(await getTransaction("tx1")).toEqual(t);
    expect(getLastFetchCall().url).toContain("/transactions/tx1/");
  });
});
