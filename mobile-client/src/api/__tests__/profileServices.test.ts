import { isOngoingProfileService } from "../../utils/profileServices";

describe("profileServices", () => {
  it("keeps agreed services visible on profile activity tabs", () => {
    expect(isOngoingProfileService({ status: "Active" })).toBe(true);
    expect(isOngoingProfileService({ status: "Agreed" })).toBe(true);
    expect(isOngoingProfileService({ status: "Completed" })).toBe(false);
    expect(isOngoingProfileService({ status: "Cancelled" })).toBe(false);
  });
});
