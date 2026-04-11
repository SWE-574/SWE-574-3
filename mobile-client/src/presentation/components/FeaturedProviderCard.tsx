import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import type { FeaturedProvider } from "../../api/featured";
import { colors } from "../../constants/colors";
import Ionicons from "@expo/vector-icons/Ionicons";

function getInitials(first: string, last: string): string {
  const f = (first || "").trim().charAt(0) || "";
  const l = (last || "").trim().charAt(0) || "";
  return (f + l).toUpperCase() || "?";
}

interface FeaturedProviderCardProps {
  provider: FeaturedProvider;
  onPress: () => void;
}

export default function FeaturedProviderCard({
  provider,
  onPress,
}: FeaturedProviderCardProps) {
  const initials = getInitials(provider.first_name, provider.last_name);
  const displayName =
    [provider.first_name, provider.last_name].filter(Boolean).join(" ") ||
    "Unknown";

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>

      <Text style={styles.name} numberOfLines={2}>
        {displayName}
      </Text>

      <View style={styles.repRow}>
        <Ionicons name="star" size={12} color={colors.AMBER} />
        <Text style={styles.repText}>
          {provider.positive_rep_count} positive review
          {provider.positive_rep_count !== 1 ? "s" : ""}
        </Text>
      </View>

      <Text style={styles.completedText}>
        {provider.completed_count} completed
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 160,
    borderRadius: 12,
    backgroundColor: colors.WHITE,
    shadowColor: colors.GRAY900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    padding: 14,
    alignItems: "center",
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.WHITE,
  },
  name: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GRAY800,
    marginTop: 8,
    textAlign: "center",
  },
  repRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  repText: {
    fontSize: 11,
    color: colors.AMBER,
    marginLeft: 3,
  },
  completedText: {
    fontSize: 10,
    color: colors.GRAY500,
    marginTop: 2,
  },
});
