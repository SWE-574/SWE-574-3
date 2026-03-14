import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/colors";
import {
  ACHIEVEMENT_DISPLAY_NAMES,
  ACHIEVEMENT_ORDER,
  type AchievementId,
} from "../../constants/achievements";

export type AchievementsSectionProps = {
  completedIds: string[];
  maxItems?: number;
  onViewAll?: () => void;
};

function getDisplayName(id: string): string {
  return ACHIEVEMENT_DISPLAY_NAMES[id as AchievementId] ?? id;
}

export default function AchievementsSection({
  completedIds,
  maxItems = 8,
  onViewAll,
}: AchievementsSectionProps) {
  const list = ACHIEVEMENT_ORDER.filter((id) =>
    completedIds.includes(id),
  ).slice(0, maxItems);

  return (
    <View style={styles.sectionCard}>
      <View style={styles.header}>
        <Text style={styles.title}>Achievements</Text>
        <TouchableOpacity
          onPress={onViewAll}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.viewAll}>View all</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.list}>
        {list.map((id) => {
          const name = getDisplayName(id);
          return (
            <View key={id} style={[styles.row, styles.rowCompleted]}>
              <Ionicons name="star-outline" size={20} color={colors.GREEN} />
              <Text
                style={[styles.label, styles.labelCompleted]}
                numberOfLines={1}
              >
                {name}
              </Text>
              <View style={styles.checkWrap}>
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color={colors.GREEN}
                />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    backgroundColor: colors.WHITE,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 24,
    padding: 18,
    shadowColor: colors.GRAY900,
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.GRAY900,
  },
  viewAll: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.GREEN,
  },
  list: {
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  rowCompleted: {
    backgroundColor: colors.GREEN_LT,
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  labelCompleted: {
    color: colors.GREEN,
  },
  checkWrap: {
    marginLeft: 4,
  },
});
