import React, { useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../../constants/colors";
import type { ActionType } from "../../../types/chatTypes";

export type HandshakeBannerData = {
  tone: "neutral" | "success" | "warning" | "danger" | "info";
  title: string;
  description: string;
};

export type ChatHandshakeBannerProps = {
  banner: HandshakeBannerData;
  canApprovePending: boolean;
  canDeclinePending: boolean;
  canCancelPending: boolean;
  canConfirmCompletion: boolean;
  isAwaitingSecondConfirmationLike: boolean;
  actionLoading: ActionType | null;
  onApprove: () => void;
  onDecline: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ChatHandshakeBanner({
  banner,
  canApprovePending,
  canDeclinePending,
  canCancelPending,
  canConfirmCompletion,
  isAwaitingSecondConfirmationLike,
  actionLoading,
  onApprove,
  onDecline,
  onCancel,
  onConfirm,
}: ChatHandshakeBannerProps) {
  const bannerStyle = useMemo(() => {
    switch (banner.tone) {
      case "success":
        return {
          container: styles.bannerSuccess,
          icon: "checkmark-circle" as const,
          iconColor: "#15803D",
        };
      case "warning":
        return {
          container: styles.bannerWarning,
          icon: "time" as const,
          iconColor: "#B45309",
        };
      case "danger":
        return {
          container: styles.bannerDanger,
          icon: "close-circle" as const,
          iconColor: "#B91C1C",
        };
      case "info":
        return {
          container: styles.bannerInfo,
          icon: "information-circle" as const,
          iconColor: colors.BLUE,
        };
      default:
        return {
          container: styles.bannerNeutral,
          icon: "ellipse" as const,
          iconColor: colors.GRAY500,
        };
    }
  }, [banner.tone]);

  return (
    <View style={[styles.bannerBase, bannerStyle.container]}>
      <View style={styles.bannerHeader}>
        <Ionicons
          name={bannerStyle.icon}
          size={18}
          color={bannerStyle.iconColor}
        />
        <Text style={styles.bannerTitle}>{banner.title}</Text>
      </View>
      <Text style={styles.bannerDescription}>{banner.description}</Text>

      <View style={styles.bannerActions}>
        {canApprovePending ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.primaryActionBtn]}
            onPress={onApprove}
            disabled={actionLoading !== null}
          >
            {actionLoading === "approve" ? (
              <ActivityIndicator size="small" color={colors.WHITE} />
            ) : (
              <>
                <Ionicons name="checkmark" size={16} color={colors.WHITE} />
                <Text style={styles.primaryActionBtnText}>Approve</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        {canDeclinePending ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.secondaryDangerBtn]}
            onPress={onDecline}
            disabled={actionLoading !== null}
          >
            {actionLoading === "decline" ? (
              <ActivityIndicator size="small" color="#B91C1C" />
            ) : (
              <>
                <Ionicons name="close" size={16} color="#B91C1C" />
                <Text style={styles.secondaryDangerBtnText}>Decline</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        {canCancelPending ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.secondaryBtn]}
            onPress={onCancel}
            disabled={actionLoading !== null}
          >
            {actionLoading === "cancel" ? (
              <ActivityIndicator
                size="small"
                color={colors.GRAY700 ?? "#374151"}
              />
            ) : (
              <>
                <Ionicons
                  name="ban-outline"
                  size={16}
                  color={colors.GRAY700 ?? "#374151"}
                />
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        {canConfirmCompletion ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.primaryActionBtn]}
            onPress={onConfirm}
            disabled={actionLoading !== null}
          >
            {actionLoading === "confirm" ? (
              <ActivityIndicator size="small" color={colors.WHITE} />
            ) : (
              <>
                <Ionicons
                  name="checkmark-done"
                  size={16}
                  color={colors.WHITE}
                />
                <Text style={styles.primaryActionBtnText}>
                  {isAwaitingSecondConfirmationLike
                    ? "Confirm final completion"
                    : "Mark as complete"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  bannerBase: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
  },
  bannerNeutral: {
    backgroundColor: "#F8FAFC",
    borderColor: colors.GRAY200,
  },
  bannerInfo: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  bannerSuccess: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  bannerWarning: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  bannerDanger: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  bannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bannerTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: colors.GRAY900 ?? "#111827",
  },
  bannerDescription: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: colors.GRAY700 ?? "#374151",
  },
  bannerActions: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionBtn: {
    minHeight: 38,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  primaryActionBtn: {
    backgroundColor: colors.BLUE,
  },
  primaryActionBtnText: {
    color: colors.WHITE,
    fontSize: 13,
    fontWeight: "700",
  },
  secondaryBtn: {
    backgroundColor: colors.WHITE,
    borderWidth: 1,
    borderColor: colors.GRAY300 ?? "#D1D5DB",
  },
  secondaryBtnText: {
    color: colors.GRAY700 ?? "#374151",
    fontSize: 13,
    fontWeight: "600",
  },
  secondaryDangerBtn: {
    backgroundColor: colors.WHITE,
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  secondaryDangerBtnText: {
    color: colors.RED,
    fontSize: 13,
    fontWeight: "600",
  },
});
