import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
} from "react-native";
import { colors } from "../../../constants/colors";
import {
  getChatParticipantInitial,
  getChatParticipantLabel,
} from "../../../utils/chatParticipant";

export type ChatTopMetaProps = {
  otherUserName?: string | null;
  otherUserAvatarUrl?: string | null;
  serviceTitle?: string;
  handshakeStatus?: string;
  formatStatusLabel: (status: string) => string;
  connected: boolean;
  reconnectAttempts: number;
  isParticipantLoading?: boolean;
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
  isParticipantLoading = false,
  onViewProfile,
  onOpenService,
}: ChatTopMetaProps) {
  const participantName = getChatParticipantLabel(otherUserName);
  const participantInitial = getChatParticipantInitial(otherUserName);

  return (
    <View style={styles.topMeta}>
      {/* Avatar — tappable to view profile */}
      <TouchableOpacity
        onPress={onViewProfile}
        disabled={!onViewProfile}
        style={styles.avatarWrap}
        activeOpacity={onViewProfile ? 0.7 : 1}
      >
        {isParticipantLoading ? (
          <View style={styles.avatarFallback}>
            <ActivityIndicator size="small" color={colors.GREEN} />
          </View>
        ) : otherUserAvatarUrl ? (
          <Image source={{ uri: otherUserAvatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarFallbackText}>{participantInitial}</Text>
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.topMetaTextWrap}>
        <View style={styles.titleRow}>
          <TouchableOpacity
            style={styles.titleCell}
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
              {isParticipantLoading
                ? "Loading conversation..."
                : participantName}
            </Text>
          </TouchableOpacity>
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
        {serviceTitle ? (
          <View style={styles.serviceLinkWrapRow}>
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
            {!!handshakeStatus && (
              <View style={[styles.metaBadge, styles.statusBadge]}>
                <Text
                  style={[styles.metaBadgeText, styles.statusBadgeText]}
                  numberOfLines={1}
                >
                  {formatStatusLabel(handshakeStatus)}
                </Text>
              </View>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  topMeta: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.GRAY200,
    backgroundColor: colors.WHITE,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
    }),
  },
  avatarWrap: {
    flexShrink: 0,
    marginTop: 2,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.GRAY200,
    borderWidth: 2,
    borderColor: colors.WHITE,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
      },
      android: { elevation: 1 },
    }),
  },
  avatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.GREEN_MD,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.WHITE,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
      },
      android: { elevation: 1 },
    }),
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
    justifyContent: "space-between",
    gap: 8,
    minHeight: 28,
  },
  titleCell: {
    flex: 1,
    minWidth: 0,
  },
  topMetaTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.GRAY900 ?? "#111827",
    letterSpacing: -0.2,
  },
  titleTappable: {
    color: colors.GREEN,
    fontWeight: "700",
  },
  serviceLinkWrapRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 2,
  },
  serviceLinkWrap: {
    flex: 1,
    minWidth: 0,
  },
  serviceLinkText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.GRAY600,
    marginTop: 4,
    lineHeight: 16,
  },
  serviceLinkTextActive: {
    color: colors.BLUE,
    textDecorationLine: "underline",
  },
  metaBadge: {
    flexShrink: 0,
    minHeight: 24,
    paddingHorizontal: 9,
    paddingVertical: 4,
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
    alignItems: "center",
    justifyContent: "center",
  },
  statusBadgeText: {
    color: colors.AMBER,
    fontSize: 12,
    fontWeight: "700",
  },
  statusWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    backgroundColor: colors.GRAY50,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.GRAY200,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.GRAY600,
    letterSpacing: 0.2,
  },
});
