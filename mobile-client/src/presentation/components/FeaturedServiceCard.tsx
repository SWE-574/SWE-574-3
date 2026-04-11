import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import type { FeaturedService } from "../../api/featured";
import { colors } from "../../constants/colors";

function getInitials(first: string, last: string): string {
  const f = (first || "").trim().charAt(0) || "";
  const l = (last || "").trim().charAt(0) || "";
  return (f + l).toUpperCase() || "?";
}

function getTypeColor(type: "Offer" | "Need" | "Event"): string {
  switch (type) {
    case "Offer":
      return colors.GREEN;
    case "Need":
      return colors.BLUE;
    case "Event":
      return colors.AMBER;
  }
}

interface FeaturedServiceCardProps {
  service: FeaturedService;
  showFriendInfo?: boolean;
  onPress: () => void;
}

export default function FeaturedServiceCard({
  service,
  showFriendInfo,
  onPress,
}: FeaturedServiceCardProps) {
  const typeColor = getTypeColor(service.type);
  const initials = getInitials(service.user.first_name, service.user.last_name);
  const displayName =
    [service.user.first_name, service.user.last_name]
      .filter(Boolean)
      .join(" ") || "Unknown";

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[styles.headerStrip, { backgroundColor: typeColor }]}>
        <View style={styles.typeBadge}>
          <Text style={[styles.typeBadgeText, { color: typeColor }]}>
            {service.type.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {service.title}
        </Text>

        <View style={styles.userRow}>
          <View style={[styles.avatar, { backgroundColor: typeColor }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.userName} numberOfLines={1}>
            {displayName}
          </Text>
        </View>

        {service.tags?.length > 0 && (
          <View style={styles.tagPill}>
            <Text style={styles.tagText}>#{service.tags[0].name}</Text>
          </View>
        )}

        {showFriendInfo &&
          service.friend_count != null &&
          service.friend_count > 0 && (
            <Text style={styles.friendText}>
              {service.friend_count} friend{service.friend_count > 1 ? "s" : ""}{" "}
              joined
            </Text>
          )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 200,
    borderRadius: 12,
    backgroundColor: colors.WHITE,
    shadowColor: colors.GRAY900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    overflow: "hidden",
    marginRight: 12,
  },
  headerStrip: {
    height: 44,
    justifyContent: "center",
    alignItems: "flex-start",
    paddingHorizontal: 10,
  },
  typeBadge: {
    backgroundColor: colors.WHITE,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  body: {
    padding: 10,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GRAY800,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  avatarText: {
    fontSize: 9,
    fontWeight: "600",
    color: colors.WHITE,
  },
  userName: {
    fontSize: 11,
    color: colors.GRAY500,
    flex: 1,
  },
  tagPill: {
    alignSelf: "flex-start",
    backgroundColor: colors.GRAY100,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 6,
  },
  tagText: {
    fontSize: 10,
    color: colors.GRAY600,
  },
  friendText: {
    fontSize: 10,
    color: colors.PURPLE,
    fontStyle: "italic",
    marginTop: 4,
  },
});
