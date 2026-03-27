import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ForumTopic } from "../../api/forum";
import { formatTimeAgo } from "../../utils/formatTimeAgo";
import { colors } from "../../constants/colors";

export interface TopicCardProps {
  topic: ForumTopic;
  onPress: () => void;
}

export default function TopicCard({ topic, onPress }: TopicCardProps) {
  const initials = (topic.author_name || "?")
    .trim()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <View style={styles.badgesRow}>
          {topic.is_pinned && (
            <View style={styles.pinnedBadge}>
              <Ionicons name="pin" size={11} color={colors.AMBER} />
              <Text style={styles.pinnedText}>Pinned</Text>
            </View>
          )}
          {topic.is_locked && (
            <View style={styles.lockedBadge}>
              <Ionicons name="lock-closed" size={11} color={colors.GRAY500} />
              <Text style={styles.lockedText}>Locked</Text>
            </View>
          )}
        </View>

        <View style={styles.categoryChip}>
          <Text style={styles.categoryText} numberOfLines={1}>
            {topic.category_name}
          </Text>
        </View>
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {topic.title}
      </Text>

      <View style={styles.metaRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials || "?"}</Text>
        </View>
        <Text style={styles.authorName} numberOfLines={1}>
          {topic.author_name}
        </Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.timeAgo}>{formatTimeAgo(topic.last_activity)}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Ionicons name="chatbubble-outline" size={13} color={colors.GRAY500} />
          <Text style={styles.statText}>{topic.reply_count}</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="eye-outline" size={13} color={colors.GRAY500} />
          <Text style={styles.statText}>{topic.view_count}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.WHITE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    shadowColor: colors.GRAY900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  badgesRow: {
    flexDirection: "row",
    gap: 6,
  },
  pinnedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.AMBER_LT,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    gap: 3,
  },
  pinnedText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.AMBER,
  },
  lockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.GRAY100,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    gap: 3,
  },
  lockedText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.GRAY500,
  },
  categoryChip: {
    backgroundColor: colors.GREEN_MD,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    maxWidth: 140,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.GREEN,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.GRAY900,
    lineHeight: 21,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  avatarText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.WHITE,
  },
  authorName: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GRAY700,
    flexShrink: 1,
  },
  dot: {
    fontSize: 13,
    color: colors.GRAY400,
    marginHorizontal: 4,
  },
  timeAgo: {
    fontSize: 12,
    color: colors.GRAY500,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: colors.GRAY500,
  },
});
