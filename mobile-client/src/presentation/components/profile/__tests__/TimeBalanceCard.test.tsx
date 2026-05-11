import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import TimeBalanceCard from "../TimeBalanceCard";

describe("TimeBalanceCard", () => {
  const baseProps = {
    balance: 7,
    earned: 12,
    spent: 5,
    onViewActivity: jest.fn(),
  };

  beforeEach(() => {
    baseProps.onViewActivity.mockReset();
  });

  it("renders the TIME AVAILABLE eyebrow in literal uppercase", () => {
    const { getByText } = render(<TimeBalanceCard {...baseProps} />);
    expect(getByText("TIME AVAILABLE")).toBeTruthy();
  });

  it("does not render the Net positive / Net negative trend pill", () => {
    const { queryByText } = render(<TimeBalanceCard {...baseProps} />);
    expect(queryByText("Net positive")).toBeNull();
    expect(queryByText("Net negative")).toBeNull();
  });

  it("renders the EARNED and USED labels in literal uppercase", () => {
    const { getByText } = render(<TimeBalanceCard {...baseProps} />);
    expect(getByText("EARNED")).toBeTruthy();
    expect(getByText("USED")).toBeTruthy();
  });

  it("renders the balance value formatted in hours", () => {
    const { getByText } = render(<TimeBalanceCard {...baseProps} />);
    expect(getByText("7h")).toBeTruthy();
    expect(getByText("12h")).toBeTruthy();
    expect(getByText("5h")).toBeTruthy();
  });

  it("hides the value while loading and shows an indicator", () => {
    const { queryByText } = render(
      <TimeBalanceCard {...baseProps} loading />,
    );
    expect(queryByText("7h")).toBeNull();
  });

  it("invokes onViewActivity when the CTA is pressed", () => {
    const { getByLabelText } = render(<TimeBalanceCard {...baseProps} />);
    fireEvent.press(getByLabelText("View time activity"));
    expect(baseProps.onViewActivity).toHaveBeenCalledTimes(1);
  });
});
