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

function getAchievementVisual(id: string, index: number) {
  if (id.includes("kind") || id.includes("helper")) {
    return {
      icon: "heart-outline" as const,
      color: colors.GREEN,
      bg: colors.GREEN_LT,
    };
  }

  if (id.includes("punctual") || id.includes("perfect")) {
    return {
      icon: "time-outline" as const,
      color: colors.BLUE,
      bg: colors.BLUE_LT,
    };
  }

  if (id.includes("rated") || id.includes("trusted") || id.includes("voice")) {
    return {
      icon: "ribbon-outline" as const,
      color: colors.PURPLE,
      bg: colors.PURPLE_LT,
    };
  }

  if (id.includes("registered") || id.includes("seniority")) {
    return {
      icon: "calendar-outline" as const,
      color: colors.AMBER,
      bg: colors.AMBER_LT,
    };
  }

  return index % 2 === 0
    ? {
        icon: "sparkles-outline" as const,
        color: colors.GREEN,
        bg: colors.GREEN_LT,
      }
    : {
        icon: "trophy-outline" as const,
        color: colors.PURPLE,
        bg: colors.PURPLE_LT,
      };
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
        <View style={styles.headerLeft}>
          <View style={styles.headerIconWrap}>
            <Ionicons name="ribbon-outline" size={18} color={colors.PURPLE} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Achievements</Text>
            <Text style={styles.subtitle}>Milestones unlocked in the community</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{completedIds.length}</Text>
          </View>
          <TouchableOpacity
            onPress={onViewAll}
            disabled={!onViewAll}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text
              style={[styles.viewAll, !onViewAll && styles.viewAllDisabled]}
            >
              View all
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.list}>
        {list.map((id, index) => {
          const name = getDisplayName(id);
          const visual = getAchievementVisual(id, index);
          return (
            <View key={id} style={[styles.row, styles.rowCompleted]}>
              <View style={[styles.badgeIconWrap, { backgroundColor: visual.bg }]}>
                <Ionicons name={visual.icon} size={17} color={visual.color} />
              </View>
              <View style={styles.labelWrap}>
                <Text
                  style={[styles.label, styles.labelCompleted]}
                  numberOfLines={2}
                >
                  {name}
                </Text>
                <Text style={styles.rowHint}>Unlocked</Text>
              </View>
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    padding: 14,
    shadowColor: colors.GRAY900,
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  headerIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.PURPLE_LT,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
  },
  headerRight: {
    alignItems: "flex-end",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.GRAY800,
    marginBottom: 1,
  },
  subtitle: {
    fontSize: 12,
    color: colors.GRAY500,
  },
  countPill: {
    minWidth: 32,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.PURPLE_LT,
    alignItems: "center",
  },
  countPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.PURPLE,
  },
  viewAll: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GREEN,
  },
  viewAllDisabled: {
    color: colors.GRAY400,
    opacity: 0.7,
  },
  list: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.GRAY200,
  },
  rowCompleted: {
    backgroundColor: colors.WHITE,
  },
  badgeIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  labelWrap: {
    flex: 1,
  },
  label: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  labelCompleted: {
    color: colors.GRAY800,
  },
  rowHint: {
    marginTop: 2,
    fontSize: 11,
    color: colors.GRAY500,
  },
  checkWrap: {
    marginLeft: 4,
  },
});
