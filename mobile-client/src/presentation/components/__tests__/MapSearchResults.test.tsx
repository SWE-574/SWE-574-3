import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import MapSearchResults, {
  type MapSearchResult,
} from "../MapSearchResults";
import type { Service } from "../../../api/types";

function makeService(over: Partial<Service> = {}): Service {
  return {
    id: "svc-1",
    title: "Yoga in the park",
    description: "",
    type: "Offer",
    duration: "1",
    location_type: "In-Person",
    location_area: null,
    status: "Active",
    max_participants: 1,
    created_at: "",
    tags: [
      { id: "t1", name: "yoga" },
      { id: "t2", name: "wellness" },
    ],
    user: { id: "u1", first_name: "A", last_name: "B" },
    ...over,
  } as Service;
}

describe("MapSearchResults", () => {
  it("renders the empty state when there are no results", () => {
    const { getByTestId, getByText } = render(
      <MapSearchResults results={[]} onSelect={() => undefined} />,
    );
    expect(getByTestId("map-search-results-empty")).toBeTruthy();
    expect(getByText("No matches")).toBeTruthy();
  });

  it("renders one row per result with the service title", () => {
    const results: MapSearchResult[] = [
      { service: makeService({ id: "a", title: "Alpha" }), distanceKm: 0.4 },
      { service: makeService({ id: "b", title: "Beta" }), distanceKm: 12.3 },
    ];
    const { getByText } = render(
      <MapSearchResults results={results} onSelect={() => undefined} />,
    );
    expect(getByText("Alpha")).toBeTruthy();
    expect(getByText("Beta")).toBeTruthy();
  });

  it("formats distance copy when coordinates are known", () => {
    const results: MapSearchResult[] = [
      { service: makeService({ id: "a", title: "Alpha" }), distanceKm: 0.4 },
    ];
    const { getByText } = render(
      <MapSearchResults results={results} onSelect={() => undefined} />,
    );
    // 0.4km -> 400 m away (formatDistanceKm)
    expect(getByText(/m away|km away/)).toBeTruthy();
  });

  it("fires onSelect with the tapped service", () => {
    const onSelect = jest.fn();
    const svc = makeService({ id: "tap-me", title: "Tap me" });
    const results: MapSearchResult[] = [{ service: svc, distanceKm: null }];
    const { getByTestId } = render(
      <MapSearchResults results={results} onSelect={onSelect} />,
    );
    fireEvent.press(getByTestId("map-search-row-tap-me"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe("tap-me");
  });
});
