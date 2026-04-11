import React from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  ActivityIndicator,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../../constants/colors";
import type { SessionDetails } from "./ChatHandshakeBanner";

type Props = {
  visible: boolean;
  sessionDetails: SessionDetails | null;
  onClose: () => void;
  onApprove: () => void;
  onDecline: () => void;
  actionLoading: "approve" | "decline" | null;
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
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.detailCard}>
      <View style={styles.detailIconWrap}>
        <Ionicons name={icon} size={16} color={colors.GRAY500} />
      </View>
      <View style={styles.detailContent}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
        {action}
      </View>
    </View>
  );
}

export function ChatApproveDetailsModal({
  visible,
  sessionDetails,
  onClose,
  onApprove,
  onDecline,
  actionLoading,
}: Props) {
  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.headerRow}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>Session Details</Text>
              <Text style={styles.subtitle}>
                Review the proposed details before you approve or request changes.
              </Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={18} color={colors.GRAY600} />
            </Pressable>
          </View>

          <View style={styles.detailsWrap}>
            {!sessionDetails?.is_online && sessionDetails?.exact_location ? (
              <DetailRow
                icon="location-outline"
                label="Location"
                value={sessionDetails.exact_location}
                action={
                  sessionDetails.exact_location_maps_url ? (
                    <Text
                      style={styles.linkText}
                      onPress={() =>
                        Linking.openURL(sessionDetails.exact_location_maps_url as string)
                      }
                    >
                      Open in Google Maps
                    </Text>
                  ) : null
                }
              />
            ) : null}

            {sessionDetails?.is_online ? (
              <DetailRow
                icon="videocam-outline"
                label="Session Type"
                value="Online session"
              />
            ) : null}

            {sessionDetails?.scheduled_time ? (
              <DetailRow
                icon="calendar-outline"
                label="Scheduled Time"
                value={fmtDateTime(sessionDetails.scheduled_time)}
              />
            ) : null}

            {sessionDetails?.exact_duration ? (
              <DetailRow
                icon="time-outline"
                label="Duration"
                value={`${sessionDetails.exact_duration} hour${sessionDetails.exact_duration === 1 ? "" : "s"}${sessionDetails.provisioned_hours ? ` · ${sessionDetails.provisioned_hours}h reserved` : ""}`}
              />
            ) : null}

            {sessionDetails?.exact_location_guide ? (
              <DetailRow
                icon="information-circle-outline"
                label="Location Guide"
                value={sessionDetails.exact_location_guide}
              />
            ) : null}
          </View>

          <View style={styles.footer}>
            <Pressable
              style={styles.declineButton}
              onPress={onDecline}
              disabled={actionLoading !== null}
            >
              {actionLoading === "decline" ? (
                <ActivityIndicator size="small" color={colors.RED} />
              ) : (
                <>
                  <Ionicons name="close" size={16} color={colors.RED} />
                  <Text style={styles.declineButtonText}>Request Changes</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={styles.approveButton}
              onPress={onApprove}
              disabled={actionLoading !== null}
            >
              {actionLoading === "approve" ? (
                <ActivityIndicator size="small" color={colors.WHITE} />
              ) : (
                <>
                  <Ionicons name="checkmark" size={16} color={colors.WHITE} />
                  <Text style={styles.approveButtonText}>Approve</Text>
                </>
              )}
            </Pressable>
          </View>
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    maxHeight: "78%",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: 19,
    fontWeight: "800",
    color: colors.GRAY900,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
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
  detailsWrap: {
    marginTop: 14,
    gap: 10,
  },
  detailCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.GRAY50,
    borderWidth: 1,
    borderColor: colors.GRAY200,
  },
  detailIconWrap: {
    marginTop: 2,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.GRAY500,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  detailValue: {
    marginTop: 3,
    fontSize: 14,
    lineHeight: 20,
    color: colors.GRAY800,
    fontWeight: "600",
  },
  linkText: {
    marginTop: 6,
    color: colors.GREEN,
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 18,
  },
  declineButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: colors.RED_LT,
  },
  declineButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.RED,
  },
  approveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: colors.GREEN,
  },
  approveButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.WHITE,
  },
});
