/**
 * Unit tests for Services API.
 */

import {
  listServices,
  getService,
  createService,
  updateService,
  patchService,
  deleteService,
  reportService,
  toggleServiceVisibility,
  addServiceInterest,
  completeEvent,
} from "../services";
import { mockFetchResolve, getLastFetchCall, getLastFetchBody } from "./helpers";

describe("services", () => {
  beforeEach(() => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  it("listServices GETs /services/ with optional params", async () => {
    const data = { count: 0, next: null, previous: null, results: [] };
    mockFetchResolve(data);
    const result = await listServices({ page: 1, page_size: 10, type: "Offer", search: "x", tags: "t", location_type: "In-Person" });
    expect(result).toEqual(data);
    const { url } = getLastFetchCall();
    expect(url).toContain("/services/");
    expect(url).toContain("page=1");
    expect(url).toContain("page_size=10");
    expect(url).toContain("type=Offer");
    expect(url).toContain("search=x");
    expect(url).toContain("tags=t");
    expect(url).toContain("location_type=In-Person");
  });

  it("getService GETs /services/:id/", async () => {
    const service = { id: "s1", title: "Test" };
    mockFetchResolve(service);
    expect(await getService("s1")).toEqual(service);
    expect(getLastFetchCall().url).toContain("/services/s1/");
  });

  it("createService POSTs to /services/ with body", async () => {
    const body = {
      title: "T",
      description: "D",
      type: "Offer" as const,
      duration: 60,
      max_participants: 5,
      tags: ["tag1"],
      location_type: "Online",
    };
    mockFetchResolve({ id: "s1", ...body });
    await createService(body);
    expect(getLastFetchCall().init?.method).toBe("POST");
    expect(getLastFetchBody()).toEqual(body);
  });

  it("createService accepts FormData payloads", async () => {
    const body = new FormData();
    body.append("title", "Wizard form");
    mockFetchResolve({ id: "s1" });
    await createService(body);
    expect(getLastFetchCall().init?.method).toBe("POST");
    expect(getLastFetchCall().init?.body).toBe(body);
  });

  it("updateService PUTs to /services/:id/", async () => {
    mockFetchResolve({ id: "s1" });
    await updateService("s1", { title: "Updated" });
    expect(getLastFetchCall().url).toContain("/services/s1/");
    expect(getLastFetchCall().init?.method).toBe("PUT");
    expect(getLastFetchBody()).toEqual({ title: "Updated" });
  });

  it("patchService PATCHes /services/:id/", async () => {
    mockFetchResolve({ id: "s1" });
    await patchService("s1", { description: "New desc" });
    expect(getLastFetchCall().init?.method).toBe("PATCH");
    expect(getLastFetchBody()).toEqual({ description: "New desc" });
  });

  it("deleteService DELETEs /services/:id/", async () => {
    mockFetchResolve(undefined);
    await deleteService("s1");
    expect(getLastFetchCall().url).toContain("/services/s1/");
    expect(getLastFetchCall().init?.method).toBe("DELETE");
  });

  it("reportService POSTs to /services/:id/report/", async () => {
    mockFetchResolve({});
    await reportService("s1", { issue_type: "spam", description: "Looks like spam" });
    expect(getLastFetchCall().url).toContain("/services/s1/report/");
    expect(getLastFetchBody()).toEqual({ issue_type: "spam", description: "Looks like spam" });
  });

  it("toggleServiceVisibility POSTs to /services/:id/toggle-visibility/", async () => {
    mockFetchResolve({ id: "s1", is_visible: true });
    await toggleServiceVisibility("s1");
    expect(getLastFetchCall().url).toContain("/services/s1/toggle-visibility/");
    expect(getLastFetchCall().init?.method).toBe("POST");
  });

  it("addServiceInterest POSTs to /services/:id/interest/", async () => {
    mockFetchResolve({});
    await addServiceInterest("s1", { message: "Hi" });
    expect(getLastFetchCall().url).toContain("/services/s1/interest/");
    expect(getLastFetchBody()).toEqual({ message: "Hi" });
  });

  it("completeEvent POSTs to /services/:id/complete-event/", async () => {
    mockFetchResolve(undefined);
    await completeEvent("svc-1");
    expect(getLastFetchCall().url).toContain("/services/svc-1/complete-event/");
    expect(getLastFetchCall().init?.method).toBe("POST");
  });
});
