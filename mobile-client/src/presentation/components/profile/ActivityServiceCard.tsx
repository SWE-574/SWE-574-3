/**
 * ActivityServiceCard - shared compact service card used by both the
 * horizontal carousels on ProfileScreen and the paginated ActivityListScreen.
 *
 * Kept thin on purpose; layout decisions live with the caller so the same
 * card can sit in a 260px-wide horizontal slot or stretch to full width on a
 * list page.
 */

import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../../constants/colors";
import type { Service } from "../../../api/types";
import { activityCardAccent, formatHours } from "../../../utils/profileFormatters";
import { normalizeRuntimeUrl } from "../../../constants/env";

export type ActivityServiceCardProps = {
  service: Service;
  layout?: "horizontal" | "vertical";
  width?: number;
  onPress: () => void;
};

export default function ActivityServiceCard({
  service,
  layout = "horizontal",
  width,
  onPress,
}: ActivityServiceCardProps) {
  const isHorizontal = layout === "horizontal";
  const accent = activityCardAccent(service.type);
  const participantLabel =
    service.type === "Event"
      ? `${service.participant_count ?? 0}/${service.max_participants}`
      : service.max_participants > 1
        ? `${service.participant_count ?? 0}/${service.max_participants}`
        : "1:1";

  const providerAvatar = normalizeRuntimeUrl(service.user?.avatar_url ?? null);
  const providerName = service.user
    ? `${service.user.first_name ?? ""} ${service.user.last_name ?? ""}`.trim()
    : "";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open service ${service.title}`}
      style={({ pressed }) => [
        styles.card,
        isHorizontal
          ? [styles.cardHorizontal, width != null && { width }]
          : styles.cardVertical,
        pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
      ]}
    >
      <View style={[styles.accent, { backgroundColor: accent.bg }]}>
        <Ionicons name={accent.icon} size={12} color={accent.color} />
        <Text style={[styles.accentText, { color: accent.color }]}>
          {accent.label}
        </Text>
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {service.title}
      </Text>
      <Text style={styles.description} numberOfLines={2}>
        {service.description || "No description yet."}
      </Text>

      <View style={styles.metaRow}>
        <View style={styles.metaPill}>
          <Ionicons name="time-outline" size={11} color={colors.GRAY500} />
          <Text style={styles.metaText}>{formatHours(service.duration)}</Text>
        </View>
        <View style={styles.metaPill}>
          <Ionicons name="people-outline" size={11} color={colors.GRAY500} />
          <Text style={styles.metaText}>{participantLabel}</Text>
        </View>
        <View style={[styles.metaPill, styles.metaPillEllipsize]}>
          <Ionicons name="location-outline" size={11} color={colors.GRAY500} />
          <Text style={styles.metaText} numberOfLines={1}>
            {service.location_area || service.location_type || "Flexible"}
          </Text>
        </View>
      </View>

      {providerName ? (
        <View style={styles.providerRow}>
          {providerAvatar ? (
            <Image
              source={{ uri: providerAvatar }}
              style={styles.providerAvatar}
            />
          ) : (
            <View style={[styles.providerAvatar, styles.providerAvatarFallback]}>
              <Text style={styles.providerAvatarInitials}>
                {(providerName[0] || "?").toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.providerName} numberOfLines={1}>
            {providerName}
          </Text>
        </View>
      ) : null}
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
    gap: 8,
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
  accent: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  accentText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.GRAY900,
    lineHeight: 19,
  },
  description: {
    fontSize: 12,
    color: colors.GRAY500,
    lineHeight: 17,
    minHeight: 34,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.GRAY50,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metaPillEllipsize: {
    flexShrink: 1,
    maxWidth: "60%",
  },
  metaText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.GRAY600,
  },
  providerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.GRAY200,
  },
  providerAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.GRAY200,
  },
  providerAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.GREEN_LT,
  },
  providerAvatarInitials: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.GREEN,
  },
  providerName: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: colors.GRAY600,
  },
});
