import React from "react";
import { Text } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import HorizontalCardCarousel from "../HorizontalCardCarousel";

type Item = { id: string; label: string };

const items: Item[] = Array.from({ length: 7 }, (_, i) => ({
  id: `item-${i + 1}`,
  label: `Item ${i + 1}`,
}));

describe("HorizontalCardCarousel", () => {
  it("renders the empty content when items is empty", () => {
    const { getByText } = render(
      <HorizontalCardCarousel
        items={[]}
        renderItem={(item: Item) => <Text>{item.label}</Text>}
        keyExtractor={(item) => item.id}
        emptyContent={<Text>Nothing yet</Text>}
      />,
    );
    expect(getByText("Nothing yet")).toBeTruthy();
  });

  it("renders all items when no maxItems is set", () => {
    const { getAllByText } = render(
      <HorizontalCardCarousel
        items={items}
        renderItem={(item: Item) => <Text>{item.label}</Text>}
        keyExtractor={(item) => item.id}
      />,
    );
    items.forEach((item) => {
      expect(getAllByText(item.label).length).toBeGreaterThan(0);
    });
  });

  it("renders only the first maxItems items", () => {
    const { queryByText, getByText } = render(
      <HorizontalCardCarousel
        items={items}
        maxItems={3}
        renderItem={(item: Item) => <Text>{item.label}</Text>}
        keyExtractor={(item) => item.id}
        onViewMore={() => undefined}
      />,
    );
    expect(getByText("Item 1")).toBeTruthy();
    expect(getByText("Item 3")).toBeTruthy();
    expect(queryByText("Item 4")).toBeNull();
    expect(queryByText("Item 7")).toBeNull();
  });

  it("shows the View more tile with the hidden count when over the limit", () => {
    const onViewMore = jest.fn();
    const { getByText, getByLabelText } = render(
      <HorizontalCardCarousel
        items={items}
        maxItems={5}
        renderItem={(item: Item) => <Text>{item.label}</Text>}
        keyExtractor={(item) => item.id}
        onViewMore={onViewMore}
      />,
    );
    expect(getByText("View more")).toBeTruthy();
    expect(getByText("+2 more")).toBeTruthy();

    fireEvent.press(getByLabelText("View more, 2 more"));
    expect(onViewMore).toHaveBeenCalledTimes(1);
  });

  it("hides the View more tile when items fit under the limit", () => {
    const { queryByText } = render(
      <HorizontalCardCarousel
        items={items.slice(0, 3)}
        maxItems={5}
        renderItem={(item: Item) => <Text>{item.label}</Text>}
        keyExtractor={(item) => item.id}
        onViewMore={() => undefined}
      />,
    );
    expect(queryByText("View more")).toBeNull();
  });

  it("hides the View more tile when onViewMore is not provided", () => {
    const { queryByText } = render(
      <HorizontalCardCarousel
        items={items}
        maxItems={3}
        renderItem={(item: Item) => <Text>{item.label}</Text>}
        keyExtractor={(item) => item.id}
      />,
    );
    expect(queryByText("View more")).toBeNull();
  });
});
