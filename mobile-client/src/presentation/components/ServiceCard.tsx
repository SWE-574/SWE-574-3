import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  Image,
  ImageBackground,
} from "react-native";
import type { Service } from "../../api/types";
import { formatTimeAgo } from "../../utils/formatTimeAgo";
import { colors } from "../../constants/colors";
import Ionicons from "@expo/vector-icons/Ionicons";

function getInitials(firstName: string, lastName: string): string {
  const f = (firstName || "").trim().charAt(0) || "";
  const l = (lastName || "").trim().charAt(0) || "";
  return (f + l).toUpperCase() || "?";
}

export interface ServiceCardProps {
  service: Service;
  style?: ViewStyle;
  index?: number;
}

export default function ServiceCard({
  service,
  style,
  index,
}: ServiceCardProps) {
  const headerColor =
    service.type === "Offer"
      ? colors.GREEN
      : service.type === "Need"
        ? colors.BLUE
        : colors.AMBER;
  const isOffer = service.type === "Offer";
  const isGroupListing =
    service.type === "Event" ||
    (service.type === "Offer" && service.max_participants > 1);
  const participantCount = service.participant_count ?? 0;
  const maxParticipants = service.max_participants ?? 0;
  const capacityRatio = maxParticipants > 0 ? participantCount / maxParticipants : 0;
  const isNearlyFull = isGroupListing && capacityRatio >= 0.75 && capacityRatio < 1.0;
  const initials = getInitials(service.user.first_name, service.user.last_name);
  const displayName =
    [service.user.first_name, service.user.last_name]
      .filter(Boolean)
      .join(" ") || "Unknown";
  const isRecurring = service.schedule_type === "Recurrent";

  return (
    <View style={[styles.card, style]}>
      {service.media && service.media.length > 0 ? (
        <ImageBackground
          source={{ uri: service.media[0]?.file_url }}
          style={styles.headerImage}
        >
          <Text
            style={[
              styles.headerTitle,
              {
                backgroundColor:
                  service.type === "Offer"
                    ? colors.GREEN_TR
                    : service.type === "Need"
                      ? colors.BLUE_TR
                      : colors.AMBER_TR,
                padding: 8,
                width: "100%",
                textAlign: "left",
                lineHeight: 30,
              },
            ]}
            numberOfLines={2}
          >
            {service.title}
          </Text>
        </ImageBackground>
      ) : (
        <View style={[styles.header, { backgroundColor: headerColor }]}>
          <View style={styles.headerOverlay} />
          <View style={[styles.headerOverlay, styles.headerOverlayRight]} />
          <Text style={styles.headerTitle} numberOfLines={2}>
            {service.title}
          </Text>
        </View>
      )}

      <View style={styles.body}>
        <View style={styles.userRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.userMeta}>
            <Text style={styles.userName}>{displayName}</Text>
            <Text style={styles.timeAgo}>
              • {formatTimeAgo(service.created_at)}
            </Text>
          </View>
          <View
            style={[
              styles.typeBadge,
              isOffer || service.type === "Offer"
                ? styles.typeOffer
                : service.type === "Need"
                  ? styles.typeWant
                  : styles.typeEvent,
            ]}
          >
            <Text
              style={
                isOffer
                  ? styles.typeOfferBadgeText
                  : service.type === "Need"
                    ? styles.typeWantBadgeText
                    : styles.typeEventBadgeText
              }
            >
              {service.type === "Offer"
                ? "Offer"
                : service.type === "Need"
                  ? "Want"
                  : "Event"}
            </Text>
          </View>
          {isNearlyFull && (
            <View style={styles.nearlyFullBadge}>
              <Text style={styles.nearlyFullBadgeText}>Nearly Full</Text>
            </View>
          )}
        </View>

        <Text style={styles.description} numberOfLines={3}>
          {service.description || "—"}
        </Text>

        <View style={styles.tagsRow}>
          {service.duration ? (
            <View style={styles.tag}>
              <Ionicons name="time-outline" size={14} color={colors.GRAY500} />
              <Text style={styles.tagText}>{service.duration}</Text>
            </View>
          ) : null}
          {(service.location_area || service.location_type) && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>
                <Ionicons
                  name="location-outline"
                  size={14}
                  color={colors.GRAY500}
                />
                {service.location_area || service.location_type}
              </Text>
            </View>
          )}
          {service.schedule_details && (
            <View style={styles.tag}>
              <Ionicons
                name="calendar-outline"
                size={14}
                color={colors.GRAY500}
              />
              <Text style={styles.tagText}>{service.schedule_details}</Text>
            </View>
          )}
          {isRecurring && (
            <View style={[styles.tag, styles.tagRecurring]}>
              <Ionicons name="repeat-outline" size={18} color={colors.PURPLE} />
              <Text style={[styles.tagText, styles.tagTextRecurring]}>
                Recurring
              </Text>
            </View>
          )}
        </View>

        {service.tags?.length > 0 && (
          <View style={styles.hashtagsRow}>
            {service.tags.slice(0, 5).map((tag) => (
              <View key={tag.id} style={styles.hashtag}>
                <Text style={styles.hashtagText}>#{tag.name}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.footer}>
          <Ionicons name="people-outline" size={16} color={colors.GRAY500} />

          <Text style={styles.participantCount}>
            {service.participant_count
              ? service.participant_count + "/" + service.max_participants
              : "0/" + service.max_participants}
          </Text>
        </View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    backgroundColor: colors.WHITE,
    shadowColor: colors.GRAY900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    overflow: "hidden",
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.GRAY200,
  },
  header: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    height: 100,
    justifyContent: "flex-end",
    alignItems: "flex-start",
  },
  headerImage: {
    width: "100%",
    height: 200,
    resizeMode: "cover",
    justifyContent: "flex-end",
    alignItems: "flex-start",
  },
  headerOverlay: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.15)",
    top: -24,
    left: -20,
  },
  headerOverlayRight: {
    left: undefined,
    right: -24,
    top: -20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.WHITE,
    textAlign: "center",
  },
  body: {
    backgroundColor: colors.WHITE,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  typeBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginLeft: 6,
  },
  typeOffer: {
    backgroundColor: "rgb(240, 253, 244)",
  },
  typeWant: {
    backgroundColor: "rgb(239, 246, 255)",
  },
  typeEvent: {
    backgroundColor: "rgb(255, 245, 238)",
  },
  nearlyFullBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.RED_LT,
    marginLeft: 4,
  },
  nearlyFullBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.RED,
  },
  typeOfferBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.GREEN,
  },
  typeWantBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.BLUE,
  },
  typeEventBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.AMBER,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  avatarText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.WHITE,
  },
  userMeta: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
  },
  userName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.GRAY900,
    marginRight: 4,
  },
  timeAgo: {
    fontSize: 12,
    color: colors.GRAY500,
  },
  description: {
    fontSize: 14,
    color: colors.GRAY900,
    lineHeight: 20,
    marginBottom: 12,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: colors.GRAY100,
    marginRight: 6,
    marginBottom: 6,
  },
  tagRecurring: {
    backgroundColor: colors.PURPLE_LT,
  },
  tagText: {
    fontSize: 12,
    color: colors.GRAY500,
    marginLeft: 4,
  },
  tagTextRecurring: {
    color: colors.PURPLE,
  },
  hashtagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  hashtag: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.GRAY200,
    marginRight: 6,
    marginBottom: 4,
  },
  hashtagText: {
    fontSize: 12,
    color: colors.GRAY900,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  participantCount: {
    fontSize: 14,
    color: colors.GRAY500,
    marginLeft: 8,
  },
});
