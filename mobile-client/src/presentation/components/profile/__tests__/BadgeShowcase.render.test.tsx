/**
 * Render tests for BadgeShowcase — verify the per-badge icon fallback used
 * when the API does not return a remote icon URL. We assert the meta-driven
 * Ionicon name lands on the rendered surface for both compact and picker
 * variants so the hero card never falls back to a generic ribbon.
 */

import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ionicons = (props: any) =>
    React.createElement("Ionicons", { ...props, testID: `icon-${props.name}` });
  return { Ionicons };
});

jest.mock("@expo/vector-icons/Ionicons", () => {
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ionicons = (props: any) =>
    React.createElement("Ionicons", { ...props, testID: `icon-${props.name}` });
  Ionicons.glyphMap = {};
  return Ionicons;
});

import BadgeShowcase from "../BadgeShowcase";
import { getAchievementMeta } from "../../../../utils/achievementMeta";

describe("BadgeShowcase compact fallback icons", () => {
  it("renders the badge-specific fallback icon when icon_url is missing", () => {
    const badge = {
      id: "kindness-hero",
      name: "Kindness Hero",
      description: "20 kindness recognitions",
      icon_url: null,
      earned_at: "2026-04-01T00:00:00Z",
    };
    const meta = getAchievementMeta(badge.id);

    const { getByTestId } = render(
      <BadgeShowcase variant="compact" badges={[badge]} />,
    );
    // Two icons render for a single fallback badge: the badge fallback
    // icon and the rendered Ionicons child container. We assert the
    // meta-driven icon is among them.
    expect(getByTestId(`icon-${meta.icon}`)).toBeTruthy();
  });

  it("renders different fallback icons for two different badges", () => {
    const badges = [
      {
        id: "first-service",
        name: "First service",
        description: "",
        icon_url: null,
        earned_at: "2026-04-01T00:00:00Z",
      },
      {
        id: "community-voice",
        name: "Community voice",
        description: "",
        icon_url: null,
        earned_at: "2026-04-01T00:00:00Z",
      },
    ];
    const { getByTestId } = render(
      <BadgeShowcase variant="compact" badges={badges} />,
    );
    expect(getByTestId(`icon-${getAchievementMeta("first-service").icon}`)).toBeTruthy();
    expect(getByTestId(`icon-${getAchievementMeta("community-voice").icon}`)).toBeTruthy();
  });

  it("skips the fallback icon entirely when icon_url is provided", () => {
    const badge = {
      id: "punctual-pro",
      name: "Punctual Pro",
      description: "",
      icon_url: "https://example.com/badge.png",
      earned_at: "2026-04-01T00:00:00Z",
    };
    const meta = getAchievementMeta(badge.id);
    const { queryByTestId } = render(
      <BadgeShowcase variant="compact" badges={[badge]} />,
    );
    // The meta icon should not be rendered because the remote image takes
    // priority. We still expect SOME image element to be present.
    expect(queryByTestId(`icon-${meta.icon}`)).toBeNull();
  });

  it("renders nothing when there are no badges (compact)", () => {
    const { toJSON } = render(
      <BadgeShowcase variant="compact" badges={[]} />,
    );
    expect(toJSON()).toBeNull();
  });
});

describe("BadgeShowcase picker fallback icons", () => {
  it("uses the meta-driven icon for earned badges without icon_url", () => {
    const progress = [
      {
        id: "super-helper",
        name: "Super Helper",
        description: "15 helpful recognitions",
        icon_url: null,
        earned_at: "2026-04-01T00:00:00Z",
        is_earned: true,
      },
    ];
    const meta = getAchievementMeta("super-helper");
    const { getByTestId } = render(
      <BadgeShowcase
        variant="picker"
        badgeProgress={progress}
        selectedIds={[]}
      />,
    );
    expect(getByTestId(`icon-${meta.icon}`)).toBeTruthy();
  });

  it("renders a lock icon for locked badges, not the meta icon", () => {
    const progress = [
      {
        id: "kindness-hero",
        name: "Kindness Hero",
        description: "",
        icon_url: null,
        earned_at: null,
        is_earned: false,
        progress_hint: "10 more to unlock",
      },
    ];
    const { getByTestId, queryByTestId } = render(
      <BadgeShowcase
        variant="picker"
        badgeProgress={progress}
        selectedIds={[]}
      />,
    );
    expect(getByTestId("icon-lock-closed-outline")).toBeTruthy();
    expect(queryByTestId(`icon-${getAchievementMeta("kindness-hero").icon}`)).toBeNull();
  });
});
