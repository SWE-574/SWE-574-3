/**
 * SmartPill priority-chain regression tests.
 *
 * The mobile pill mirrors `frontend/src/components/SmartPill.tsx` so a
 * card shows the same single chip identity on both clients (#627 review:
 * "mobile dashboard chips also does not follow the frontends scheme").
 *
 * Order under test:
 *   1. strongest for_you signal (tag / follow / cooccur / engagement)
 *   2. is_newcomer_owner → "Rising newcomer"
 *   3. capacity scarcity (75-99%) → "X spots left"
 *   4. explore_pool fallback
 *
 * Newcomer-over-follow promotion: when the for-you chip resolves to
 * `follow`, the owner is a newcomer, and the follow signal is < 1
 * (indirect / friend-of-friend), render the newcomer pill instead.
 */
import React from "react";
import { render } from "@testing-library/react-native";
import type { Service } from "../../../api/types";
import SmartPill from "../SmartPill";

jest.mock("@expo/vector-icons/Ionicons", () => {
  const React = require("react");
  const Ionicons = (props: { name: string }) =>
    React.createElement("Ionicons", { ...props, testID: `icon-${props.name}` });
  Ionicons.glyphMap = {};
  return Ionicons;
});

const baseService = (overrides: Partial<Service> = {}): Service =>
  ({
    id: "svc",
    user: { id: "u-1", first_name: "A", last_name: "B", email: "" },
    title: "t",
    description: "d",
    type: "Offer",
    duration: "1",
    location_type: "online",
    location_area: null,
    status: "Active",
    max_participants: 1,
    participant_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    tags: [],
    is_visible: true,
    ...overrides,
  }) as Service;

describe("SmartPill priority chain", () => {
  it("renders nothing when no signal applies", () => {
    const { queryByText } = render(<SmartPill service={baseService()} />);
    expect(queryByText("Rising newcomer")).toBeNull();
    expect(queryByText(/spots left/)).toBeNull();
  });

  it("renders 'Matches your interests' for a dominant tag signal", () => {
    const { getByText } = render(
      <SmartPill
        service={baseService({
          for_you_signals: { tag: 0.9, follow: 0, cooccur: 0, recency_penalty: 0 },
        })}
      />,
    );
    expect(getByText("Matches your interests")).toBeTruthy();
  });

  it("renders 'Saved by others' for the engagement axis", () => {
    const { getByText } = render(
      <SmartPill
        service={baseService({
          for_you_signals: {
            tag: 0,
            follow: 0,
            cooccur: 0,
            recency_penalty: 0,
            engagement: 0.9,
          },
        })}
      />,
    );
    expect(getByText("Saved by others")).toBeTruthy();
  });

  it("promotes newcomer over an indirect follow signal", () => {
    const { getByText, queryByText } = render(
      <SmartPill
        service={baseService({
          is_newcomer_owner: true,
          for_you_signals: {
            tag: 0,
            follow: 0.5,
            cooccur: 0,
            recency_penalty: 0,
          },
        })}
      />,
    );
    expect(getByText("Rising newcomer")).toBeTruthy();
    expect(queryByText("From your network")).toBeNull();
  });

  it("keeps 'From your network' for direct follows (signal >= 1)", () => {
    const { getByText, queryByText } = render(
      <SmartPill
        service={baseService({
          is_newcomer_owner: true,
          for_you_signals: {
            tag: 0,
            follow: 1,
            cooccur: 0,
            recency_penalty: 0,
          },
        })}
      />,
    );
    expect(getByText("From your network")).toBeTruthy();
    expect(queryByText("Rising newcomer")).toBeNull();
  });

  it("renders 'Rising newcomer' when no for_you signal exists", () => {
    const { getByText } = render(
      <SmartPill service={baseService({ is_newcomer_owner: true })} />,
    );
    expect(getByText("Rising newcomer")).toBeTruthy();
  });

  it("renders capacity scarcity ('X spots left') for 75-99% fill", () => {
    const { getByText } = render(
      <SmartPill
        service={baseService({ max_participants: 10, participant_count: 8 })}
      />,
    );
    expect(getByText("2 spots left")).toBeTruthy();
  });

  it("uses singular '1 spot left' when exactly one seat remains", () => {
    const { getByText } = render(
      <SmartPill
        service={baseService({ max_participants: 4, participant_count: 3 })}
      />,
    );
    expect(getByText("1 spot left")).toBeTruthy();
  });

  it("falls back to explore_pool flavour ('Fresh provider') last", () => {
    const { getByText } = render(
      <SmartPill service={baseService({ explore_pool: "cold_start" })} />,
    );
    expect(getByText("Fresh provider")).toBeTruthy();
  });
});
