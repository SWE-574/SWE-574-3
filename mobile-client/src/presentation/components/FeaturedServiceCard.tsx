import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Service } from "../../api/types";
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
  service: Service;
  contextBadge?: {
    text: string;
    icon: keyof typeof Ionicons.glyphMap;
    tone: "purple" | "green" | "red";
  };
  onPress: () => void;
}

export default function FeaturedServiceCard({
  service,
  contextBadge,
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
            {service.type === "Need" ? "WANT" : service.type.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {service.title}
        </Text>

        <View style={styles.metaRow}>
          {service.duration ? (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={12} color={colors.GRAY500} />
              <Text style={styles.metaText}>{service.duration}</Text>
            </View>
          ) : null}
          {(service.location_area || service.location_type) && (
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={12} color={colors.GRAY500} />
              <Text style={styles.metaText} numberOfLines={1}>
                {service.location_area || service.location_type}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.userRow}>
          <View style={[styles.avatar, { backgroundColor: typeColor }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.userName} numberOfLines={1}>
            {displayName}
          </Text>
        </View>

        {contextBadge ? (
          <View
            style={[
              styles.contextBadge,
              contextBadge.tone === "green" && styles.contextBadgeGreen,
              contextBadge.tone === "red" && styles.contextBadgeRed,
            ]}
          >
            <Ionicons
              name={contextBadge.icon}
              size={10}
              color={
                contextBadge.tone === "green"
                  ? colors.GREEN
                  : contextBadge.tone === "red"
                    ? colors.RED
                    : colors.PURPLE
              }
            />
            <Text
              style={[
                styles.contextBadgeText,
                contextBadge.tone === "green" && styles.contextBadgeTextGreen,
                contextBadge.tone === "red" && styles.contextBadgeTextRed,
              ]}
              numberOfLines={1}
            >
              {contextBadge.text}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 214,
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
    minHeight: 120,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GRAY800,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 6,
    gap: 8,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  metaText: {
    fontSize: 11,
    color: colors.GRAY500,
    maxWidth: 92,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
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
  contextBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.PURPLE_LT,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 6,
    gap: 3,
    maxWidth: "100%",
  },
  contextBadgeGreen: {
    backgroundColor: colors.GREEN_LT,
  },
  contextBadgeRed: {
    backgroundColor: colors.RED_LT,
  },
  contextBadgeText: {
    fontSize: 10,
    color: colors.PURPLE,
    fontWeight: "500",
    flexShrink: 1,
  },
  contextBadgeTextGreen: {
    color: colors.GREEN,
  },
  contextBadgeTextRed: {
    color: colors.RED,
  },
});
