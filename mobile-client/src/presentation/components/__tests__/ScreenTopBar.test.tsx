import React from "react";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

import ScreenTopBar from "../ScreenTopBar";

describe("ScreenTopBar", () => {
  it("renders the provided title", () => {
    const { getByText } = render(<ScreenTopBar title="Messages" />);
    expect(getByText("Messages")).toBeTruthy();
  });

  it("renders without a title when none is provided", () => {
    const { queryByText } = render(<ScreenTopBar />);
    expect(queryByText("Messages")).toBeNull();
  });

  it("renders right slot content", () => {
    const { getByText } = render(
      <ScreenTopBar title="Profile" right={<Text>ACTIONS</Text>} />,
    );
    expect(getByText("ACTIONS")).toBeTruthy();
  });
});
