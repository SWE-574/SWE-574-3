/**
 * HistoryCard - presentational card for one entry in a user's exchange
 * history. Shared between the horizontal carousel on ProfileScreen and the
 * full paginated list on ActivityListScreen so the visual stays identical.
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../../constants/colors";
import { formatHours, formatShortDate } from "../../../utils/profileFormatters";
import type { groupHistoryItems } from "../../../utils/historyGrouping";

export type HistoryEntry = ReturnType<typeof groupHistoryItems>[number];

export type HistoryCardProps = {
  entry: HistoryEntry;
  layout?: "horizontal" | "vertical";
  onPress: () => void;
  onPressParticipants?: () => void;
};

export default function HistoryCard({
  entry,
  layout = "horizontal",
  onPress,
  onPressParticipants,
}: HistoryCardProps) {
  const isHorizontal = layout === "horizontal";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open history item ${entry.serviceTitle}`}
      style={({ pressed }) => [
        styles.card,
        isHorizontal ? styles.cardHorizontal : styles.cardVertical,
        pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={2}>
            {entry.serviceTitle}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            With {entry.partnerName} · {formatShortDate(entry.completedDate)}
          </Text>
        </View>
        <View style={styles.hoursPill}>
          <Ionicons name="time-outline" size={11} color={colors.GREEN} />
          <Text style={styles.hoursPillText}>{formatHours(entry.duration)}</Text>
        </View>
      </View>

      <Pressable
        onPress={(event) => {
          event.stopPropagation();
          onPressParticipants?.();
        }}
        accessibilityRole="button"
        accessibilityLabel={`View participants for ${entry.serviceTitle}`}
        style={({ pressed }) => [
          styles.footer,
          pressed && { opacity: 0.85 },
        ]}
      >
        <Ionicons name="people-outline" size={13} color={colors.GRAY500} />
        <Text style={styles.footerText}>
          {entry.useCount} participant{entry.useCount !== 1 ? "s" : ""}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={colors.GRAY400} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(45,92,78,0.10)",
    padding: 12,
    gap: 10,
    shadowColor: colors.GRAY900,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardHorizontal: {
    width: 260,
  },
  cardVertical: {
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.GRAY900,
    lineHeight: 19,
  },
  meta: {
    fontSize: 12,
    color: colors.GRAY500,
    lineHeight: 17,
  },
  hoursPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.GREEN_LT,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: `${colors.GREEN}33`,
  },
  hoursPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.GREEN,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.GRAY200,
  },
  footerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: colors.GRAY500,
  },
});
