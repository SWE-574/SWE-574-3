import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import ActivityServiceCard from "../ActivityServiceCard";
import type { Service } from "../../../../api/types";

const baseService = {
  id: "service-1",
  user: {
    id: "user-1",
    first_name: "Selin",
    last_name: "Kaya",
    email: "",
  },
  title: "Weekend cycling tour",
  description: "Group ride along the Bosphorus with coffee stops.",
  type: "Offer",
  duration: "2",
  location_type: "in_person",
  location_area: "Beşiktaş",
  status: "open",
  max_participants: 6,
  participant_count: 2,
  created_at: "2026-04-30T10:00:00Z",
  tags: [],
  is_visible: true,
} as unknown as Service;

describe("ActivityServiceCard", () => {
  it("renders title, description and the type accent label", () => {
    const { getByText } = render(
      <ActivityServiceCard service={baseService} onPress={() => undefined} />,
    );
    expect(getByText(baseService.title)).toBeTruthy();
    expect(getByText(baseService.description)).toBeTruthy();
    expect(getByText("Offer")).toBeTruthy();
  });

  it("renders the participant ratio for multi-seat offers", () => {
    const { getByText } = render(
      <ActivityServiceCard service={baseService} onPress={() => undefined} />,
    );
    expect(getByText("2/6")).toBeTruthy();
  });

  it("renders '1:1' for solo exchanges", () => {
    const service = { ...baseService, max_participants: 1 } as Service;
    const { getByText } = render(
      <ActivityServiceCard service={service} onPress={() => undefined} />,
    );
    expect(getByText("1:1")).toBeTruthy();
  });

  it("falls back to a description placeholder when missing", () => {
    const service = { ...baseService, description: "" } as Service;
    const { getByText } = render(
      <ActivityServiceCard service={service} onPress={() => undefined} />,
    );
    expect(getByText("No description yet.")).toBeTruthy();
  });

  it("invokes onPress when tapped", () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <ActivityServiceCard service={baseService} onPress={onPress} />,
    );
    fireEvent.press(getByLabelText(`Open service ${baseService.title}`));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
