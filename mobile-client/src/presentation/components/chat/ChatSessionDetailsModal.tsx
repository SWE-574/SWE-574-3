import React from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../../constants/colors";
import type { ActionType } from "../../../types/chatTypes";
import type { SessionDetails } from "./ChatHandshakeBanner";

type Props = {
  visible: boolean;
  sessionDetails: SessionDetails | null;
  bannerTitle: string;
  bannerDescription?: string | null;
  canInitiatePending: boolean;
  canApprovePending: boolean;
  canCancelPending: boolean;
  canConfirmCompletion: boolean;
  isAwaitingSecondConfirmationLike: boolean;
  myConfirmed?: boolean;
  otherConfirmed?: boolean;
  counterpartName?: string;
  hasCancellationRequest?: boolean;
  cancellationRequestedByName?: string | null;
  canRequestCancellation?: boolean;
  canRespondToCancellation?: boolean;
  canReportParticipant?: boolean;
  canLeaveEvaluation?: boolean;
  evaluationLabel?: string | null;
  actionLoading: ActionType | null;
  onClose: () => void;
  onInitiate: () => void;
  onReviewApprove: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  onRequestCancellation: () => void;
  onApproveCancellation: () => void;
  onRejectCancellation: () => void;
  onReportParticipant: () => void;
  onOpenEvaluation: () => void;
};

function fmtDateTime(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function DetailRow({
  icon,
  label,
  value,
  action,
  isLast = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  action?: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.detailCard, isLast && styles.detailCardLast]}>
      <View style={styles.detailIconWrap}>
        <Ionicons name={icon} size={15} color={colors.GRAY500} />
      </View>
      <View style={styles.detailContent}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
        {action}
      </View>
    </View>
  );
}

function ActionButton({
  label,
  tone = "primary",
  loading = false,
  onPress,
}: {
  label: string;
  tone?: "primary" | "danger" | "dangerSoft" | "neutral" | "success";
  loading?: boolean;
  onPress: () => void;
}) {
  const toneStyle =
    tone === "danger"
      ? [styles.actionButton, styles.actionButtonDanger]
      : tone === "dangerSoft"
        ? [styles.actionButton, styles.actionButtonDangerSoft]
        : tone === "neutral"
          ? [styles.actionButton, styles.actionButtonNeutral]
          : tone === "success"
            ? [styles.actionButton, styles.actionButtonSuccess]
            : [styles.actionButton, styles.actionButtonPrimary];

  const textStyle =
    tone === "dangerSoft"
      ? styles.actionButtonTextDanger
      : tone === "neutral"
        ? styles.actionButtonTextNeutral
        : styles.actionButtonTextLight;

  return (
    <TouchableOpacity style={toneStyle} onPress={onPress} disabled={loading}>
      {loading ? (
        <ActivityIndicator size="small" color={tone === "neutral" ? colors.GRAY700 : colors.WHITE} />
      ) : (
        <Text style={textStyle}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

export function ChatSessionDetailsModal({
  visible,
  sessionDetails,
  bannerTitle,
  bannerDescription,
  canInitiatePending,
  canApprovePending,
  canCancelPending,
  canConfirmCompletion,
  isAwaitingSecondConfirmationLike,
  myConfirmed = false,
  otherConfirmed = false,
  counterpartName = "the other participant",
  hasCancellationRequest = false,
  cancellationRequestedByName = null,
  canRequestCancellation = false,
  canRespondToCancellation = false,
  canReportParticipant = false,
  canLeaveEvaluation = false,
  evaluationLabel = null,
  actionLoading,
  onClose,
  onInitiate,
  onReviewApprove,
  onCancel,
  onConfirm,
  onRequestCancellation,
  onApproveCancellation,
  onRejectCancellation,
  onReportParticipant,
  onOpenEvaluation,
}: Props) {
  if (!visible) return null;

  const modalTitle =
    canConfirmCompletion && (myConfirmed || otherConfirmed)
      ? "Exchange completed"
      : bannerTitle;

  const modalSubtitle =
    canConfirmCompletion && (myConfirmed || otherConfirmed)
      ? "The exchange has entered the completion stage. Review details and final actions here."
      : bannerDescription?.trim() ||
        "Review session details and manage this exchange here.";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.headerRow}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>{modalTitle}</Text>
              <Text style={styles.subtitle}>{modalSubtitle}</Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color={colors.GRAY600} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {sessionDetails ? (
            <View style={styles.detailsPanel}>
              {sessionDetails.is_online ? (
                <DetailRow
                  icon="videocam-outline"
                  label="Session Type"
                  value="Online session"
                  isLast={
                    !sessionDetails.exact_location &&
                    !sessionDetails.scheduled_time &&
                    !sessionDetails.exact_duration &&
                    !sessionDetails.exact_location_guide
                  }
                />
              ) : null}

              {!sessionDetails.is_online && sessionDetails.exact_location ? (
                <DetailRow
                  icon="location-outline"
                  label="Location"
                  value={sessionDetails.exact_location}
                  isLast={
                    !sessionDetails.scheduled_time &&
                    !sessionDetails.exact_duration &&
                    !sessionDetails.exact_location_guide
                  }
                  action={
                    sessionDetails.exact_location_maps_url ? (
                      <Text
                        style={styles.linkText}
                        onPress={() => Linking.openURL(sessionDetails.exact_location_maps_url as string)}
                      >
                        Open in Google Maps
                      </Text>
                    ) : null
                  }
                />
              ) : null}

              {sessionDetails.scheduled_time ? (
                <DetailRow
                  icon="calendar-outline"
                  label="Date & Time"
                  value={fmtDateTime(sessionDetails.scheduled_time)}
                  isLast={
                    !sessionDetails.exact_duration &&
                    !sessionDetails.exact_location_guide
                  }
                />
              ) : null}

              {sessionDetails.exact_duration ? (
                <DetailRow
                  icon="time-outline"
                  label="Duration"
                  value={`${sessionDetails.exact_duration}h${sessionDetails.provisioned_hours ? ` · ${sessionDetails.provisioned_hours}h reserved` : ""}`}
                  isLast={!sessionDetails.exact_location_guide}
                />
              ) : null}

              {sessionDetails.exact_location_guide ? (
                <DetailRow
                  icon="information-circle-outline"
                  label="Location Guide"
                  value={sessionDetails.exact_location_guide}
                  isLast
                />
              ) : null}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="document-text-outline" size={18} color={colors.GRAY500} />
              <Text style={styles.emptyTitle}>Session details are not shared yet</Text>
              <Text style={styles.emptyText}>
                Open the action below to start or review the handshake flow.
              </Text>
            </View>
          )}

          {canConfirmCompletion ? (
            <View style={[styles.statusCard, myConfirmed ? styles.statusCardDone : styles.statusCardPending]}>
              <Text style={[styles.statusTitle, myConfirmed ? styles.statusTitleDone : styles.statusTitlePending]}>
                {myConfirmed ? "You confirmed completion" : "Confirm the service is done"}
              </Text>
              <Text style={styles.statusText}>
                {myConfirmed
                  ? otherConfirmed
                    ? "Both confirmed. Finalizing the transfer now."
                    : `Waiting for ${counterpartName} to confirm`
                  : otherConfirmed
                    ? `${counterpartName} already confirmed. Your turn now.`
                    : "Both sides must confirm to release TimeBank hours."}
              </Text>
            </View>
          ) : null}

          {hasCancellationRequest ? (
            <View style={styles.noticeCard}>
              <View style={styles.noticeHeader}>
                <Ionicons name="alert-circle" size={16} color={colors.RED} />
                <Text style={styles.noticeTitle}>Cancellation Request</Text>
              </View>
              <Text style={styles.noticeText}>
                {cancellationRequestedByName
                  ? `${cancellationRequestedByName} requested cancellation for this exchange.`
                  : "There is an active cancellation request for this exchange."}
              </Text>
            </View>
          ) : null}

          <View style={styles.actionsSection}>
            <View style={styles.actionsWrap}>
              {canInitiatePending ? (
                <ActionButton
                  label="Initiate Handshake"
                  loading={actionLoading === "initiate"}
                  onPress={onInitiate}
                />
              ) : null}

              {canApprovePending ? (
                <ActionButton
                  label="Approve"
                  loading={actionLoading === "approve"}
                  onPress={onReviewApprove}
                />
              ) : null}

              {canCancelPending ? (
                <ActionButton
                  label="Cancel Exchange"
                  tone="neutral"
                  loading={actionLoading === "cancel"}
                  onPress={onCancel}
                />
              ) : null}

              {canConfirmCompletion && !myConfirmed ? (
                <ActionButton
                  label={isAwaitingSecondConfirmationLike ? "Confirm Final Completion" : "Confirm Completion"}
                  tone="success"
                  loading={actionLoading === "confirm"}
                  onPress={onConfirm}
                />
              ) : null}

              {hasCancellationRequest && canRespondToCancellation ? (
                <>
                  <ActionButton
                    label="Approve Cancellation"
                    tone="danger"
                    loading={actionLoading === "approveCancellation"}
                    onPress={onApproveCancellation}
                  />
                  <ActionButton
                    label="Keep Handshake"
                    tone="neutral"
                    loading={actionLoading === "rejectCancellation"}
                    onPress={onRejectCancellation}
                  />
                </>
              ) : null}

              {!hasCancellationRequest && canRequestCancellation ? (
                <ActionButton
                  label="Request Cancellation"
                  tone="danger"
                  loading={actionLoading === "requestCancellation"}
                  onPress={onRequestCancellation}
                />
              ) : null}

              {canReportParticipant ? (
                <ActionButton
                  label="Report Participant"
                  tone="dangerSoft"
                  loading={actionLoading === "reportParticipant"}
                  onPress={onReportParticipant}
                />
              ) : null}

              {canLeaveEvaluation ? (
                <ActionButton
                  label={evaluationLabel ? `Leave Evaluation · ${evaluationLabel}` : "Leave Evaluation"}
                  tone="primary"
                  loading={actionLoading === "submitEvaluation"}
                  onPress={onOpenEvaluation}
                />
              ) : null}
            </View>
          </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.WHITE,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: "88%",
    paddingTop: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.GRAY900,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: colors.GRAY500,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.GRAY100,
  },
  content: {
    padding: 14,
    gap: 8,
  },
  detailsPanel: {
    backgroundColor: colors.GRAY50,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    borderRadius: 13,
    overflow: "hidden",
  },
  detailCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY200,
  },
  detailCardLast: {
    borderBottomWidth: 0,
  },
  detailIconWrap: {
    marginTop: 1,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.GRAY500,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  detailValue: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.GRAY800,
    fontWeight: "600",
  },
  linkText: {
    marginTop: 2,
    color: colors.GREEN,
    fontSize: 11,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  emptyCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.GRAY50,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.GRAY800,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.GRAY500,
  },
  statusCard: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusCardPending: {
    backgroundColor: colors.AMBER_LT,
    borderColor: "#FDE68A",
  },
  statusCardDone: {
    backgroundColor: colors.GREEN_LT,
    borderColor: "#BBF7D0",
  },
  statusTitle: {
    fontSize: 12,
    fontWeight: "800",
  },
  statusTitlePending: {
    color: colors.AMBER,
  },
  statusTitleDone: {
    color: colors.GREEN,
  },
  statusText: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    color: colors.GRAY600,
  },
  noticeCard: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1.5,
    borderColor: "#FCA5A5",
  },
  noticeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  noticeTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.RED,
  },
  noticeText: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    color: "#991B1B",
  },
  actionsSection: {
    gap: 6,
  },
  actionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  actionButton: {
    minHeight: 36,
    borderRadius: 11,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonPrimary: {
    backgroundColor: colors.BLUE,
  },
  actionButtonSuccess: {
    backgroundColor: colors.AMBER,
  },
  actionButtonDanger: {
    backgroundColor: colors.RED,
  },
  actionButtonDangerSoft: {
    backgroundColor: colors.RED_LT,
    borderWidth: 1,
    borderColor: colors.RED,
  },
  actionButtonNeutral: {
    backgroundColor: colors.WHITE,
    borderWidth: 1,
    borderColor: colors.GRAY300,
  },
  actionButtonTextLight: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.WHITE,
  },
  actionButtonTextDanger: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.RED,
  },
  actionButtonTextNeutral: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.GRAY700,
  },
});
