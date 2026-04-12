/**
 * Unit tests for Handshakes API.
 */

import {
  listHandshakes,
  getHandshake,
  createHandshake,
  updateHandshake,
  patchHandshake,
  deleteHandshake,
  acceptHandshake,
  approveHandshake,
  cancelHandshake,
  confirmHandshake,
  declineHandshake,
  denyHandshake,
  initiateHandshake,
  reportHandshake,
  requestHandshakeChanges,
  requestCancellationHandshake,
  approveCancellationHandshake,
  rejectCancellationHandshake,
  handshakeServiceInterest,
  joinEvent,
  leaveEvent,
  checkinEvent,
  markAttended,
} from "../handshakes";
import { mockFetchResolve, getLastFetchCall, getLastFetchBody } from "./helpers";

describe("handshakes", () => {
  beforeEach(() => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  it("listHandshakes GETs /handshakes/ with params", async () => {
    mockFetchResolve({ count: 0, results: [], next: null, previous: null });
    await listHandshakes({ page: 1, page_size: 10, status: "Pending" });
    const { url } = getLastFetchCall();
    expect(url).toContain("/handshakes/");
    expect(url).toContain("status=Pending");
  });

  it("getHandshake GETs /handshakes/:id/", async () => {
    const h = { id: "h1", status: "Active" };
    mockFetchResolve(h);
    expect(await getHandshake("h1")).toEqual(h);
    expect(getLastFetchCall().url).toContain("/handshakes/h1/");
  });

  it("createHandshake POSTs to /handshakes/", async () => {
    mockFetchResolve({ id: "h1", service: "s1" });
    await createHandshake({ service: "s1" });
    expect(getLastFetchBody()).toEqual({ service: "s1" });
    expect(getLastFetchCall().url).toContain("/handshakes/");
  });

  it("updateHandshake PUTs, patchHandshake PATCHes, deleteHandshake DELETEs", async () => {
    mockFetchResolve({});
    await updateHandshake("h1", { service: "s2" });
    expect(getLastFetchCall().init?.method).toBe("PUT");
    mockFetchResolve({});
    await patchHandshake("h1", {});
    expect(getLastFetchCall().init?.method).toBe("PATCH");
    mockFetchResolve(undefined);
    await deleteHandshake("h1");
    expect(getLastFetchCall().init?.method).toBe("DELETE");
  });

  it("acceptHandshake POSTs to /handshakes/:id/accept/", async () => {
    mockFetchResolve({ id: "h1", status: "Accepted" });
    await acceptHandshake("h1");
    expect(getLastFetchCall().url).toContain("/handshakes/h1/accept/");
    expect(getLastFetchCall().init?.method).toBe("POST");
  });

  it("approveHandshake POSTs to approve/", async () => {
    mockFetchResolve({});
    await approveHandshake("h1");
    expect(getLastFetchCall().url).toContain("/handshakes/h1/approve/");
  });

  it("cancelHandshake, confirmHandshake, declineHandshake, denyHandshake POST to action endpoints", async () => {
    mockFetchResolve({});
    await cancelHandshake("h1");
    expect(getLastFetchCall().url).toContain("/cancel/");
    mockFetchResolve({});
    await confirmHandshake("h1");
    expect(getLastFetchCall().url).toContain("/confirm/");
    mockFetchResolve({});
    await declineHandshake("h1");
    expect(getLastFetchCall().url).toContain("/decline/");
    mockFetchResolve({});
    await denyHandshake("h1");
    expect(getLastFetchCall().url).toContain("/deny/");
  });

  it("initiateHandshake POSTs to /handshakes/:id/initiate/", async () => {
    mockFetchResolve({ id: "h1" });
    await initiateHandshake("h1", { note: "Hi" });
    expect(getLastFetchCall().url).toContain("/handshakes/h1/initiate/");
    expect(getLastFetchBody()).toEqual({ note: "Hi" });
  });

  it("reportHandshake POSTs with issue type", async () => {
    mockFetchResolve({});
    await reportHandshake("h1", { issue_type: "no_show", description: "missing" });
    expect(getLastFetchCall().url).toContain("/handshakes/h1/report/");
    expect(getLastFetchBody()).toEqual({
      issue_type: "no_show",
      description: "missing",
    });
  });

  it("requestHandshakeChanges POSTs to request-changes/", async () => {
    mockFetchResolve({});
    await requestHandshakeChanges("h1");
    expect(getLastFetchCall().url).toContain("/handshakes/h1/request-changes/");
  });

  it("cancellation request actions POST to cancel-request endpoints", async () => {
    mockFetchResolve({});
    await requestCancellationHandshake("h1");
    expect(getLastFetchCall().url).toContain("/handshakes/h1/cancel-request/");
    mockFetchResolve({});
    await approveCancellationHandshake("h1");
    expect(getLastFetchCall().url).toContain("/handshakes/h1/cancel-request/approve/");
    mockFetchResolve({});
    await rejectCancellationHandshake("h1");
    expect(getLastFetchCall().url).toContain("/handshakes/h1/cancel-request/reject/");
  });

  it("handshakeServiceInterest POSTs to /handshakes/services/:id/interest/", async () => {
    mockFetchResolve({});
    await handshakeServiceInterest("s1");
    expect(getLastFetchCall().url).toContain("/handshakes/services/s1/interest/");
  });

  it("joinEvent POSTs to /handshakes/services/:id/join-event/", async () => {
    mockFetchResolve({ id: "h1", status: "accepted" });
    const result = await joinEvent("svc-1");
    expect(getLastFetchCall().url).toContain("/handshakes/services/svc-1/join-event/");
    expect(getLastFetchCall().init?.method).toBe("POST");
    expect(result.status).toBe("accepted");
  });

  it("leaveEvent POSTs to /handshakes/:id/leave-event/", async () => {
    mockFetchResolve({ id: "h1", status: "cancelled" });
    await leaveEvent("h1");
    expect(getLastFetchCall().url).toContain("/handshakes/h1/leave-event/");
    expect(getLastFetchCall().init?.method).toBe("POST");
  });

  it("checkinEvent POSTs to /handshakes/:id/checkin/", async () => {
    mockFetchResolve({ id: "h1", status: "checked_in" });
    const result = await checkinEvent("h1");
    expect(getLastFetchCall().url).toContain("/handshakes/h1/checkin/");
    expect(result.status).toBe("checked_in");
  });

  it("markAttended POSTs to /handshakes/:id/mark-attended/", async () => {
    mockFetchResolve({ id: "h1", status: "attended" });
    const result = await markAttended("h1");
    expect(getLastFetchCall().url).toContain("/handshakes/h1/mark-attended/");
    expect(result.status).toBe("attended");
  });
});
