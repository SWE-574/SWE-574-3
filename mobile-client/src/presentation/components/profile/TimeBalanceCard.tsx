/**
 * TimeBalanceCard - liquid-glass time bank balance summary card.
 *
 * Sits directly under the hero card on ProfileScreen. Shows the user's current
 * time balance, total earned/spent, and a primary "View Time Activity" CTA.
 *
 * The visual identity is a frosted-glass surface with a subtle green wash on
 * the left so it feels related to the hero card without being another flat
 * green slab.
 */

import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../../constants/colors";

export type TimeBalanceCardProps = {
  balance: number;
  earned: number;
  spent: number;
  loading?: boolean;
  onViewActivity: () => void;
};

function formatHours(value: number): string {
  const abs = Math.abs(value);
  const formatted = Number.isInteger(abs)
    ? abs.toString()
    : abs.toFixed(1).replace(/\.0$/, "");
  return `${formatted}h`;
}

export default function TimeBalanceCard({
  balance,
  earned,
  spent,
  loading = false,
  onViewActivity,
}: TimeBalanceCardProps) {
  return (
    <View style={styles.wrap}>
      {/* Liquid glass layers */}
      <View style={styles.glassBase} />
      <View style={styles.glassTint} />
      <View style={styles.glassHighlight} />
      <View style={styles.glassBlobLg} />
      <View style={styles.glassBlobSm} />

      <View style={styles.content}>
        <View style={styles.leftCol}>
          <View style={styles.iconRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="time-outline" size={16} color={colors.GREEN} />
            </View>
            <Text style={styles.eyebrow}>TIME AVAILABLE</Text>
          </View>
          <View style={styles.valueRow}>
            {loading ? (
              <ActivityIndicator size="small" color={colors.GREEN} />
            ) : (
              <Text style={styles.value}>{formatHours(balance)}</Text>
            )}
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statBlock}>
              <View style={[styles.statDot, { backgroundColor: colors.GREEN }]} />
              <View>
                <Text style={styles.statLabel}>EARNED</Text>
                <Text style={styles.statValue}>{formatHours(earned)}</Text>
              </View>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBlock}>
              <View
                style={[styles.statDot, { backgroundColor: colors.AMBER }]}
              />
              <View>
                <Text style={styles.statLabel}>USED</Text>
                <Text style={styles.statValue}>{formatHours(spent)}</Text>
              </View>
            </View>
          </View>
        </View>

        <Pressable
          onPress={onViewActivity}
          accessibilityRole="button"
          accessibilityLabel="View time activity"
          style={({ pressed }) => [
            styles.cta,
            pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
          ]}
        >
          <Ionicons name="bar-chart-outline" size={16} color={colors.WHITE} />
          <Text style={styles.ctaText}>View activity</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(45,92,78,0.14)",
    shadowColor: colors.GREEN,
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  glassBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.96)",
  },
  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(240,253,244,0.55)",
  },
  glassHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  glassBlobLg: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(45,92,78,0.08)",
    top: -60,
    right: -50,
  },
  glassBlobSm: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(248,200,74,0.12)",
    bottom: -32,
    left: -18,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  leftCol: {
    flex: 1,
    gap: 8,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(45,92,78,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: colors.GREEN,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  value: {
    fontSize: 30,
    fontWeight: "900",
    color: colors.GRAY900,
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
  },
  statBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.GRAY500,
    letterSpacing: 0.4,
  },
  statValue: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.GRAY800,
  },
  statDivider: {
    width: 1,
    height: 22,
    backgroundColor: "rgba(45,92,78,0.16)",
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: colors.GREEN,
    shadowColor: colors.GREEN,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  ctaText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.WHITE,
    letterSpacing: 0.2,
  },
});
