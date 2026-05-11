/**
 * ReviewCard - shared review card for both the horizontal carousel on
 * ProfileScreen and the paginated list on ActivityListScreen.
 */

import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../../constants/colors";
import { formatHours, formatShortDate } from "../../../utils/profileFormatters";
import type { ProfileReview } from "../../../api/users";

export type ReviewCardProps = {
  review: ProfileReview;
  layout?: "horizontal" | "vertical";
};

export default function ReviewCard({
  review,
  layout = "horizontal",
}: ReviewCardProps) {
  const isHorizontal = layout === "horizontal";

  return (
    <View
      style={[
        styles.card,
        isHorizontal ? styles.cardHorizontal : styles.cardVertical,
      ]}
    >
      <View style={styles.header}>
        {review.user_avatar_url ? (
          <Image
            source={{ uri: review.user_avatar_url }}
            style={styles.avatarImage}
          />
        ) : (
          <View style={[styles.avatarImage, styles.avatarFallback]}>
            <Text style={styles.avatarInitials}>
              {(review.user_name || "?").slice(0, 1).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.headerText}>
          <Text style={styles.author} numberOfLines={1}>
            {review.user_name || "Community member"}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {review.service_title || "Exchange review"} ·{" "}
            {formatShortDate(review.created_at)}
          </Text>
        </View>
        {review.is_verified_review ? (
          <View style={styles.verifiedPill}>
            <Text style={styles.verifiedText}>Verified</Text>
          </View>
        ) : null}
      </View>

      <Text
        style={styles.body}
        numberOfLines={isHorizontal ? 4 : undefined}
      >
        {review.body}
      </Text>

      <View style={styles.footer}>
        {review.handshake_hours ? (
          <View style={styles.chip}>
            <Ionicons name="time-outline" size={11} color={colors.GREEN} />
            <Text style={styles.chipText}>
              {formatHours(review.handshake_hours)}
            </Text>
          </View>
        ) : null}
        {review.reply_count ? (
          <View style={styles.chip}>
            <Ionicons name="chatbubble-outline" size={11} color={colors.PURPLE} />
            <Text style={styles.chipText}>{review.reply_count} replies</Text>
          </View>
        ) : null}
      </View>
    </View>
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
    width: 280,
  },
  cardVertical: {
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.GRAY200,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.GREEN_LT,
  },
  avatarInitials: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.GREEN,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  author: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.GRAY900,
    marginBottom: 2,
  },
  meta: {
    fontSize: 11,
    color: colors.GRAY500,
  },
  verifiedPill: {
    backgroundColor: colors.BLUE_LT,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  verifiedText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.BLUE,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.GRAY700,
  },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.GRAY50,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.GRAY200,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.GRAY600,
  },
});
