import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import HistoryCard, { type HistoryEntry } from "../HistoryCard";

const baseEntry: HistoryEntry = {
  key: "entry-1",
  serviceId: "service-42",
  serviceTitle: "Bread baking workshop",
  partnerName: "Aylin Yıldız",
  partnerId: "user-77",
  completedDate: "2026-03-04T12:00:00Z",
  duration: 2,
  useCount: 3,
  items: [],
  isMultiUse: false,
};

describe("HistoryCard", () => {
  it("renders title, partner name and hours", () => {
    const { getByText } = render(
      <HistoryCard entry={baseEntry} onPress={() => undefined} />,
    );
    expect(getByText("Bread baking workshop")).toBeTruthy();
    expect(getByText(/^With Aylin Yıldız/)).toBeTruthy();
    expect(getByText("2h")).toBeTruthy();
  });

  it("pluralizes participants correctly", () => {
    const { getByText, rerender } = render(
      <HistoryCard entry={baseEntry} onPress={() => undefined} />,
    );
    expect(getByText("3 participants")).toBeTruthy();

    rerender(
      <HistoryCard
        entry={{ ...baseEntry, useCount: 1 }}
        onPress={() => undefined}
      />,
    );
    expect(getByText("1 participant")).toBeTruthy();
  });

  it("invokes onPress when the card surface is pressed", () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <HistoryCard entry={baseEntry} onPress={onPress} />,
    );
    fireEvent.press(getByLabelText("Open history item Bread baking workshop"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("invokes onPressParticipants when the footer is tapped", () => {
    const onPress = jest.fn();
    const onPressParticipants = jest.fn();
    const { getByLabelText } = render(
      <HistoryCard
        entry={baseEntry}
        onPress={onPress}
        onPressParticipants={onPressParticipants}
      />,
    );
    fireEvent.press(
      getByLabelText("View participants for Bread baking workshop"),
    );
    expect(onPressParticipants).toHaveBeenCalledTimes(1);
  });
});
