import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ForYouSignals, Service } from "../../api/types";
import { colors } from "../../constants/colors";
import { isNearlyFull, spotsLeft } from "../../utils/eventUtils";

// Same blend as web `FOR_YOU_WEIGHTS` (frontend/src/utils/forYouChips.ts).
// The dominant axis becomes the chip identity so the pill the user sees
// reflects which signal actually moved the rank score.
const FOR_YOU_WEIGHTS = {
  tag: 0.5,
  follow: 0.3,
  cooccur: 0.2,
  engagement: 0.15,
} as const;

type ForYouChipName = "tag" | "follow" | "cooccur" | "engagement";

interface PillFlavour {
  label: string;
  bg: string;
  fg: string;
  border?: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const FOR_YOU_FLAVOUR: Record<ForYouChipName, PillFlavour> = {
  tag: {
    label: "Matches your interests",
    bg: "rgba(168, 85, 247, 0.95)",
    fg: colors.WHITE,
    icon: "star-outline",
  },
  follow: {
    label: "From your network",
    bg: "rgba(245, 158, 11, 0.95)",
    fg: colors.WHITE,
    icon: "people-outline",
  },
  cooccur: {
    label: "Popular with people like you",
    bg: "rgba(59, 130, 246, 0.95)",
    fg: colors.WHITE,
    icon: "trending-up-outline",
  },
  engagement: {
    label: "Saved by others",
    bg: "rgba(20, 184, 166, 0.95)",
    fg: colors.WHITE,
    icon: "bookmark-outline",
  },
};

// Phase-3 fallback for owners who joined recently. Distinct from the
// `cold_start` explore-pool flavour ("Fresh provider"): newcomer-owner is a
// recency signal on the user, cold_start is an activity-history signal on
// the listing.
const NEWCOMER_FLAVOUR: PillFlavour = {
  label: "Rising newcomer",
  bg: "rgba(244, 114, 182, 0.92)",
  fg: colors.WHITE,
  icon: "sunny-outline",
};

function buildCapacityFlavour(remaining: number): PillFlavour {
  return {
    label: remaining === 1 ? "1 spot left" : `${remaining} spots left`,
    bg: "rgba(217, 119, 6, 0.95)",
    fg: colors.WHITE,
    icon: "trending-up-outline",
  };
}

// cold_start uses an outline style (transparent fill, coloured border) so it
// never dominates over a saturated for_you pill. Demo data flags every card
// as cold_start, which would otherwise drown out the real recommendation
// signals.
const POOL_FLAVOUR: Record<NonNullable<Service["explore_pool"]>, PillFlavour> = {
  cold_start: {
    label: "Fresh provider",
    bg: "rgba(255,255,255,0.6)",
    fg: "#0F766E",
    border: "#5EEAD4",
    icon: "compass-outline",
  },
  undershown_quality: {
    label: "Hidden gem",
    bg: "rgba(168, 85, 247, 0.92)",
    fg: colors.WHITE,
    icon: "star-outline",
  },
  stale_recurring: {
    label: "Rediscovered",
    bg: "rgba(99, 102, 241, 0.92)",
    fg: colors.WHITE,
    icon: "time-outline",
  },
};

function dominantForYou(signals?: ForYouSignals | null): ForYouChipName | null {
  if (!signals) return null;
  const entries: Array<[ForYouChipName, number]> = [
    ["tag", signals.tag * FOR_YOU_WEIGHTS.tag],
    ["follow", signals.follow * FOR_YOU_WEIGHTS.follow],
    ["cooccur", signals.cooccur * FOR_YOU_WEIGHTS.cooccur],
    ["engagement", (signals.engagement ?? 0) * FOR_YOU_WEIGHTS.engagement],
  ];
  let topName: ForYouChipName | null = null;
  let topValue = 0;
  for (const [name, value] of entries) {
    if (value > topValue) {
      topName = name;
      topValue = value;
    }
  }
  return topName;
}

interface SmartPillProps {
  service: Service;
}

/**
 * Small "why this card?" pill that renders only when the recommendation
 * engine elevated the card by some signal. Mirrors the priority chain in
 * `frontend/src/components/SmartPill.tsx` so the two clients show the same
 * chip identity for any given service:
 *
 *   1. strongest for_you signal (tag / follow / cooccur / engagement)
 *   2. is_newcomer_owner — "Rising newcomer" pink pill
 *   3. capacity scarcity (`isNearlyFull` 75-99%) — "X spots left" amber pill
 *   4. explore-pool flavour as the final fallback
 *
 * Newcomer-over-follow promotion: when the for_you chip resolves to `follow`,
 * the owner is a newcomer, AND the follow signal is indirect (raw value < 1),
 * the newcomer story is louder than the network story — same as web.
 */
export default function SmartPill({ service }: SmartPillProps) {
  const top = dominantForYou(service.for_you_signals);
  const followSignal = service.for_you_signals?.follow ?? 0;
  if (
    top === "follow" &&
    service.is_newcomer_owner &&
    followSignal < 1
  ) {
    return <Pill flavour={NEWCOMER_FLAVOUR} />;
  }
  if (top) {
    return <Pill flavour={FOR_YOU_FLAVOUR[top]} />;
  }
  if (service.is_newcomer_owner) {
    return <Pill flavour={NEWCOMER_FLAVOUR} />;
  }
  const max = service.max_participants ?? 0;
  const count = service.participant_count ?? 0;
  if (isNearlyFull(max, count)) {
    return <Pill flavour={buildCapacityFlavour(spotsLeft(max, count))} />;
  }
  if (service.explore_pool && POOL_FLAVOUR[service.explore_pool]) {
    return <Pill flavour={POOL_FLAVOUR[service.explore_pool]} />;
  }
  return null;
}

function Pill({ flavour }: { flavour: PillFlavour }) {
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: flavour.bg,
          borderColor: flavour.border ?? "transparent",
          borderWidth: flavour.border ? 1 : 0,
        },
      ]}
    >
      <Ionicons name={flavour.icon} size={10} color={flavour.fg} />
      <Text style={[styles.pillText, { color: flavour.fg }]}>
        {flavour.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    marginLeft: 4,
  },
  pillText: {
    fontSize: 10,
    fontWeight: "800" as const,
    letterSpacing: 0.2,
  },
});
