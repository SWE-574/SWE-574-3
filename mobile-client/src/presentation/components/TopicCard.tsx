import React from "react";
import { View, Text, Pressable, StyleSheet, Image } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ForumTopic } from "../../api/forum";
import { formatTimeAgo } from "../../utils/formatTimeAgo";
import { getInitials } from "../../utils/getInitials";
import { colors } from "../../constants/colors";

export interface TopicCardProps {
  topic: ForumTopic;
  onPress: () => void;
  categoryTone?: {
    bg: string;
    light: string;
  };
}

const DEFAULT_TONE = {
  bg: colors.GREEN,
  light: colors.GREEN_LT,
};

export default function TopicCard({
  topic,
  onPress,
  categoryTone = DEFAULT_TONE,
}: TopicCardProps) {
  const initials = getInitials(topic.author_name);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={[styles.accentBar, { backgroundColor: categoryTone.bg }]} />
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
          <Text
            style={[styles.categoryText, { color: categoryTone.bg }]}
            numberOfLines={1}
          >
            {topic.category_name}
          </Text>
        </View>
      </View>

      <View style={styles.contentWrap}>
        <Text style={styles.title} numberOfLines={2}>
          {topic.title}
        </Text>

        <Text style={styles.excerpt} numberOfLines={2}>
          {topic.body}
        </Text>
      </View>

      <View style={styles.footerGrid}>
        <View style={styles.authorBlock}>
          <View style={styles.avatar}>
            {topic.author_avatar_url ? (
              <Image
                source={{ uri: topic.author_avatar_url }}
                style={styles.avatarImage}
              />
            ) : (
              <Text style={styles.avatarText}>{initials || "?"}</Text>
            )}
          </View>
          <View style={styles.authorTextWrap}>
            <Text style={styles.authorName} numberOfLines={1}>
              {topic.author_name}
            </Text>
            <Text style={styles.timeAgo} numberOfLines={1}>
              {formatTimeAgo(topic.last_activity)}
            </Text>
          </View>
        </View>

        <View style={styles.statsBlock}>
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
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 16,
    shadowColor: colors.GRAY900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    overflow: "hidden",
    minHeight: 176,
  },
  accentBar: {
    height: 4,
    borderRadius: 999,
    marginBottom: 14,
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
    backgroundColor: colors.GRAY50,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 999,
    maxWidth: 150,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: "600",
  },
  contentWrap: {
    flex: 1,
    justifyContent: "flex-start",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.GRAY900,
    lineHeight: 23,
    marginBottom: 8,
  },
  excerpt: {
    fontSize: 13,
    color: colors.GRAY600,
    lineHeight: 20,
    marginBottom: 12,
  },
  footerGrid: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  authorBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.WHITE,
  },
  authorTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  authorName: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GRAY700,
    marginBottom: 2,
  },
  timeAgo: {
    fontSize: 12,
    color: colors.GRAY500,
  },
  statsBlock: {
    alignItems: "flex-end",
    justifyContent: "center",
    minWidth: 70,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
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
