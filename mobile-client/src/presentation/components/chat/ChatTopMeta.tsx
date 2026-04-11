import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { colors } from "../../../constants/colors";

export type ChatTopMetaProps = {
  otherUserName: string;
  otherUserAvatarUrl?: string | null;
  serviceTitle?: string;
  handshakeStatus?: string;
  formatStatusLabel: (status: string) => string;
  connected: boolean;
  reconnectAttempts: number;
  onViewProfile?: () => void;
  onOpenService?: () => void;
};

export function ChatTopMeta({
  otherUserName,
  otherUserAvatarUrl,
  serviceTitle,
  handshakeStatus,
  formatStatusLabel,
  connected,
  reconnectAttempts,
  onViewProfile,
  onOpenService,
}: ChatTopMetaProps) {
  return (
    <View style={styles.topMeta}>
      {/* Avatar — tappable to view profile */}
      <TouchableOpacity
        onPress={onViewProfile}
        disabled={!onViewProfile}
        style={styles.avatarWrap}
        activeOpacity={onViewProfile ? 0.7 : 1}
      >
        {otherUserAvatarUrl ? (
          <Image source={{ uri: otherUserAvatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarFallbackText}>
              {otherUserName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.topMetaTextWrap}>
        <View style={styles.titleRow}>
          <TouchableOpacity
            onPress={onViewProfile}
            disabled={!onViewProfile}
            hitSlop={{ top: 6, bottom: 6, left: 0, right: 6 }}
          >
            <Text
              style={[
                styles.topMetaTitle,
                onViewProfile && styles.titleTappable,
              ]}
              numberOfLines={1}
            >
              {otherUserName}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.badgesRow}>
          {!!handshakeStatus && (
            <View style={[styles.metaBadge, styles.statusBadge]}>
              <Text style={[styles.metaBadgeText, styles.statusBadgeText]}>
                {formatStatusLabel(handshakeStatus)}
              </Text>
            </View>
          )}
        </View>
        {serviceTitle ? (
          <TouchableOpacity
            onPress={onOpenService}
            disabled={!onOpenService}
            activeOpacity={onOpenService ? 0.7 : 1}
            style={styles.serviceLinkWrap}
          >
            <Text
              style={[
                styles.serviceLinkText,
                onOpenService && styles.serviceLinkTextActive,
              ]}
              numberOfLines={1}
            >
              {serviceTitle}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.statusWrap}>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: connected ? "#10B981" : colors.GRAY400 },
          ]}
        />
        <Text style={styles.statusText}>
          {connected
            ? "Live"
            : reconnectAttempts > 0
              ? "Reconnecting"
              : "Connecting"}
        </Text>
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  topMeta: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY200,
    backgroundColor: colors.WHITE,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarWrap: {
    flexShrink: 0,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.GRAY200,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.GREEN_MD,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.GREEN,
  },
  topMetaTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  topMetaTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.GRAY900 ?? "#111827",
  },
  titleTappable: {
    color: colors.GREEN,
    textDecorationLine: "underline",
  },
  badgesRow: {
    marginTop: 5,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  serviceLinkWrap: {
    marginTop: 6,
    alignSelf: "flex-start",
  },
  serviceLinkText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.GRAY500,
  },
  serviceLinkTextActive: {
    color: colors.BLUE,
    textDecorationLine: "underline",
  },
  metaBadge: {
    minHeight: 22,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  metaBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  statusBadge: {
    backgroundColor: colors.AMBER_LT,
    borderColor: "#FDE68A",
  },
  statusBadgeText: {
    color: colors.AMBER,
  },
  statusWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    color: colors.GRAY500,
  },
});
