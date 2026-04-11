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
    const t = { id: "tx1", amount: "10", transaction_type: "transfer" };
    mockFetchResolve(t);
    expect(await getTransaction("tx1")).toEqual({
      id: "tx1",
      handshake_id: null,
      service_id: null,
      transaction_type: "transfer",
      transaction_type_display: undefined,
      service_type: null,
      schedule_type: null,
      max_participants: null,
      is_current_user_provider: false,
      counterpart: null,
      amount: 10,
      balance_after: 0,
      description: "",
      service_title: null,
      created_at: "",
    });
    expect(getLastFetchCall().url).toContain("/transactions/tx1/");
  });
});
