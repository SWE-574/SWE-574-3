import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../../constants/colors";
import type { EventEvaluationSummary } from "../../../api/types";

type TraitRow = {
  key: keyof EventEvaluationSummary;
  label: string;
  positive: boolean;
};

const TRAIT_ROWS: TraitRow[] = [
  { key: "well_organized_average", label: "Well Organized", positive: true },
  { key: "engaging_average", label: "Engaging", positive: true },
  { key: "welcoming_average", label: "Welcoming", positive: true },
  { key: "disorganized_average", label: "Disorganized", positive: false },
  { key: "boring_average", label: "Boring", positive: false },
  { key: "unwelcoming_average", label: "Unwelcoming", positive: false },
];

type Props = {
  summary: EventEvaluationSummary;
};

export function EventEvaluationSummaryCard({ summary }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Ionicons name="star" size={16} color={colors.AMBER} />
        <Text style={styles.title}>Event Ratings</Text>
        <Text style={styles.countLabel}>
          {summary.feedback_submission_count} review
          {summary.feedback_submission_count !== 1 ? "s" : ""}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{summary.total_attended}</Text>
          <Text style={styles.statLabel}>Attended</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.GREEN }]}>
            {summary.positive_feedback_count}
          </Text>
          <Text style={styles.statLabel}>Positive</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.RED }]}>
            {summary.negative_feedback_count}
          </Text>
          <Text style={styles.statLabel}>Negative</Text>
        </View>
      </View>

      {TRAIT_ROWS.map((row) => {
        const avg = (summary[row.key] as number) ?? 0;
        const pct = Math.round(avg * 100);
        const barColor = row.positive ? colors.GREEN : colors.RED;

        return (
          <View key={row.key} style={styles.traitRow}>
            <Text style={styles.traitLabel}>{row.label}</Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { width: `${pct}%`, backgroundColor: barColor },
                ]}
              />
            </View>
            <Text style={[styles.traitPct, { color: barColor }]}>{pct}%</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    padding: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.GRAY900,
    flex: 1,
  },
  countLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.GRAY500,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: colors.GRAY50,
    borderRadius: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.GRAY900,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.GRAY500,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.GRAY200,
  },
  traitRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  traitLabel: {
    width: 100,
    fontSize: 13,
    fontWeight: "600",
    color: colors.GRAY700,
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.GRAY100,
    marginHorizontal: 8,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
  },
  traitPct: {
    width: 36,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },
});
