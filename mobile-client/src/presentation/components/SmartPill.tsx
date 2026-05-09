import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ForYouSignals, Service } from "../../api/types";
import { colors } from "../../constants/colors";

const FOR_YOU_WEIGHTS = { tag: 0.5, follow: 0.3, cooccur: 0.2 } as const;

interface PillFlavour {
  label: string;
  bg: string;
  fg: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const POOL_FLAVOUR: Record<NonNullable<Service["explore_pool"]>, PillFlavour> = {
  cold_start: {
    label: "Fresh provider",
    bg: "rgba(20, 184, 166, 0.92)",
    fg: colors.WHITE,
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

function chipForSignals(signals?: ForYouSignals | null): PillFlavour | null {
  if (!signals) return null;
  const entries: Array<["tag" | "follow" | "cooccur", number]> = [
    ["tag", signals.tag * FOR_YOU_WEIGHTS.tag],
    ["follow", signals.follow * FOR_YOU_WEIGHTS.follow],
    ["cooccur", signals.cooccur * FOR_YOU_WEIGHTS.cooccur],
  ];
  const [topName, topValue] = entries.reduce(
    (best, current) => (current[1] > best[1] ? current : best),
    ["tag" as "tag" | "follow" | "cooccur", 0],
  );
  if (topValue <= 0) return null;
  if (topName === "tag") {
    return {
      label: "Matches your interests",
      bg: "rgba(168, 85, 247, 0.95)",
      fg: colors.WHITE,
      icon: "star-outline",
    };
  }
  if (topName === "follow") {
    return {
      label: "From your network",
      bg: "rgba(245, 158, 11, 0.95)",
      fg: colors.WHITE,
      icon: "people-outline",
    };
  }
  return {
    label: "Popular with people like you",
    bg: "rgba(59, 130, 246, 0.95)",
    fg: colors.WHITE,
    icon: "trending-up-outline",
  };
}

interface SmartPillProps {
  service: Service;
}

export default function SmartPill({ service }: SmartPillProps) {
  const poolFlavour = service.explore_pool ? POOL_FLAVOUR[service.explore_pool] : null;
  const flavour = poolFlavour ?? chipForSignals(service.for_you_signals);
  if (!flavour) return null;
  return (
    <View style={[styles.pill, { backgroundColor: flavour.bg }]}>
      <Ionicons name={flavour.icon} size={10} color={flavour.fg} />
      <Text style={[styles.pillText, { color: flavour.fg }]}>{flavour.label}</Text>
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
