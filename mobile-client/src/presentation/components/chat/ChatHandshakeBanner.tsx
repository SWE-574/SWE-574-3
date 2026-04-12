import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../../constants/colors";
import type { ActionType } from "../../../types/chatTypes";

export type HandshakeBannerData = {
  tone: "neutral" | "success" | "warning" | "danger" | "info";
  title: string;
  description: string;
};

export type SessionDetails = {
  exact_location?: string | null;
  scheduled_time?: string | null;
  exact_duration?: number | null;
  provisioned_hours?: number | null;
  exact_location_maps_url?: string | null;
  exact_location_guide?: string | null;
  is_online?: boolean;
};

export type ChatHandshakeBannerProps = {
  banner: HandshakeBannerData;
  canInitiatePending: boolean;
  canApprovePending: boolean;
  canCancelPending: boolean;
  canConfirmCompletion: boolean;
  isAwaitingSecondConfirmationLike: boolean;
  myConfirmed?: boolean;
  otherConfirmed?: boolean;
  counterpartName?: string;
  hasSessionDetails?: boolean;
  canRequestCancellation?: boolean;
  canRespondToCancellation?: boolean;
  hasCancellationRequest?: boolean;
  cancellationRequestedByName?: string | null;
  canReportNoShow?: boolean;
  canLeaveEvaluation?: boolean;
  evaluationLabel?: string | null;
  actionLoading: ActionType | null;
  sessionDetails?: SessionDetails | null;
  onInitiate: () => void;
  onReviewApprove: () => void;
  onOpenSessionDetails: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  onRequestCancellation: () => void;
  onApproveCancellation: () => void;
  onRejectCancellation: () => void;
  onReportNoShow: () => void;
  onOpenEvaluation: () => void;
};

export function ChatHandshakeBanner({
  banner,
  actionLoading,
  onOpenSessionDetails,
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
    <TouchableOpacity
      style={[styles.bannerBase, bannerStyle.container]}
      onPress={onOpenSessionDetails}
      activeOpacity={0.86}
      disabled={actionLoading !== null}
    >
      <View style={styles.bannerHeader}>
        <Ionicons
          name={bannerStyle.icon}
          size={15}
          color={bannerStyle.iconColor}
        />
        <View style={styles.bannerTextWrap}>
          <Text style={styles.bannerTitle}>{banner.title}</Text>
          {!!banner.description ? (
            <Text style={styles.bannerDescription} numberOfLines={1}>
              {banner.description}
            </Text>
          ) : null}
        </View>
        <View style={styles.bannerPill}>
          <Text style={styles.bannerPillText}>Details</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.GRAY500} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export const styles = StyleSheet.create({
  bannerBase: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 6,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    minHeight: 56,
    justifyContent: "center",
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
  bannerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.GRAY900,
  },
  bannerDescription: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.GRAY600,
  },
  bannerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  bannerPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.GRAY600,
  },
});
