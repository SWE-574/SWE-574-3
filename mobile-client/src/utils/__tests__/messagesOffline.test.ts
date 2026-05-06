import { ApiNetworkError } from "../../api/client";
import { shouldSuppressChatLoadError } from "../messagesOffline";

describe("messages offline error handling", () => {
  it("suppresses expected network failures so dev overlay does not interrupt offline fallback", () => {
    expect(
      shouldSuppressChatLoadError(new ApiNetworkError("Network request failed")),
    ).toBe(true);
  });

  it("does not suppress unexpected errors", () => {
    expect(shouldSuppressChatLoadError(new Error("bad payload"))).toBe(false);
  });
});
