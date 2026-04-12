import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { colors } from "../../../constants/colors";
import type { Handshake } from "../../../api/handshakes";
import type { Service } from "../../../api/types";
import { isFutureEvent, spotsLeft } from "../../../utils/eventUtils";
import { EventEvaluationSummaryCard } from "./EventEvaluationSummaryCard";

export type EventDetailModalTab = "details" | "participants";

type Props = {
  visible: boolean;
  activeTab: EventDetailModalTab;
  onTabChange: (tab: EventDetailModalTab) => void;
  onClose: () => void;
  onOpenChat: () => void;
  onOpenEvaluation: () => void;
  onJoinEvent: () => void;
  onLeaveEvent: () => void;
  onCheckinEvent: () => void;
  onEditEvent: () => void;
  onCancelEvent: () => void;
  onTogglePinEvent: () => void;
  service: Service;
  handshakes: Handshake[];
  isOwner: boolean;
  isAdmin?: boolean;
  ownerEditLocked?: boolean;
  ownerEditLockReason?: string | null;
  canOpenChat?: boolean;
  participantStatus?: string | null;
  participantActionLoading?: boolean;
  participantBanned?: boolean;
  participantFull?: boolean;
  participantFuture?: boolean;
  participantPast?: boolean;
  participantLockdown?: boolean;
  markingHandshakeId?: string | null;
  completing?: boolean;
  reportedParticipantIds?: Record<string, boolean>;
  eventEvaluationTarget?: Handshake | null;
  onMarkAttended: (handshakeId: string) => void;
  onOpenParticipantReport: (handshake: Handshake) => void;
  onCompleteEvent: () => void;
};

function formatDateTime(value?: string | null): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeUntil(value?: string | null): string {
  if (!value) return "Not scheduled";
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return "Not scheduled";
  const diff = target - Date.now();
  if (diff <= 0) return "Event started";
  const totalMinutes = Math.ceil(diff / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

function getRequesterName(handshake: Handshake): string {
  const requesterName = (handshake as Record<string, unknown>).requester_name;
  if (typeof requesterName === "string" && requesterName.trim()) {
    return requesterName.trim();
  }

  const requester = handshake.requester;
  if (requester && typeof requester === "object") {
    const obj = requester as Record<string, unknown>;
    const fullName = [obj.first_name, obj.last_name].filter(Boolean).join(" ").trim();
    if (fullName) return fullName;
    if (typeof obj.email === "string" && obj.email.trim()) return obj.email.trim();
  }

  return "Participant";
}

function DetailTile({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.tile}>
      <View style={styles.tileIconWrap}>
        <Ionicons name={icon} size={16} color={colors.AMBER} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.tileLabel}>{label}</Text>
        <Text style={styles.tileValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function EventDetailModal({
  visible,
  activeTab,
  onTabChange,
  onClose,
  onOpenChat,
  onOpenEvaluation,
  onJoinEvent,
  onLeaveEvent,
  onCheckinEvent,
  onEditEvent,
  onCancelEvent,
  onTogglePinEvent,
  service,
  handshakes,
  isOwner,
  isAdmin = false,
  ownerEditLocked = false,
  ownerEditLockReason = null,
  canOpenChat = false,
  participantStatus = null,
  participantActionLoading = false,
  participantBanned = false,
  participantFull = false,
  participantFuture = false,
  participantPast = false,
  participantLockdown = false,
  markingHandshakeId = null,
  completing = false,
  reportedParticipantIds = {},
  eventEvaluationTarget = null,
  onMarkAttended,
  onOpenParticipantReport,
  onCompleteEvent,
}: Props) {
  if (!visible) return null;

  const activeParticipants = handshakes.filter((handshake) =>
    ["accepted", "checked_in", "attended", "no_show"].includes(
      handshake.status?.toLowerCase(),
    ),
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropDismissLayer} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>Event Details</Text>
              <Text style={styles.subtitle} numberOfLines={2}>
                {service.title}
              </Text>
            </View>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={20} color={colors.GRAY600} />
            </Pressable>
          </View>

          {isOwner ? (
            <View style={styles.tabsRow}>
              <TouchableOpacity
                style={[
                  styles.tabButton,
                  activeTab === "details" && styles.tabButtonActive,
                ]}
                onPress={() => onTabChange("details")}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="settings-outline"
                  size={15}
                  color={activeTab === "details" ? colors.WHITE : colors.GRAY700}
                />
                <Text
                  style={[
                    styles.tabText,
                    activeTab === "details" && styles.tabTextActive,
                  ]}
                >
                  Actions
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.tabButton,
                  activeTab === "participants" && styles.tabButtonActive,
                ]}
                onPress={() => onTabChange("participants")}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="people-outline"
                  size={15}
                  color={activeTab === "participants" ? colors.WHITE : colors.GRAY700}
                />
                <Text
                  style={[
                    styles.tabText,
                    activeTab === "participants" && styles.tabTextActive,
                  ]}
                >
                  Participants
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.scrollArea}>
          {activeTab === "details" ? (
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {isOwner ? (
                <View style={styles.descriptionBlock}>
                  <Text style={styles.sectionEyebrow}>Organizer Actions</Text>

                  <View style={styles.ownerActionsRow}>
                    <TouchableOpacity
                      style={[
                        styles.secondaryActionButton,
                        ownerEditLocked && styles.actionButtonDisabled,
                      ]}
                      onPress={onEditEvent}
                      activeOpacity={0.88}
                    >
                      <Ionicons
                        name="create-outline"
                        size={16}
                        color={colors.GRAY800}
                      />
                      <Text style={styles.secondaryActionButtonText}>Edit Event</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.secondaryDangerButton}
                      onPress={onCancelEvent}
                      activeOpacity={0.88}
                    >
                      <Ionicons
                        name="close-circle-outline"
                        size={16}
                        color={colors.RED}
                      />
                      <Text style={styles.secondaryDangerButtonText}>Cancel Event</Text>
                    </TouchableOpacity>
                  </View>

                  {isAdmin ? (
                    <TouchableOpacity
                      style={styles.pinButton}
                      onPress={onTogglePinEvent}
                      activeOpacity={0.88}
                    >
                      <Ionicons
                        name={service.is_pinned ? "pin" : "pin-outline"}
                        size={16}
                        color={colors.AMBER}
                      />
                      <Text style={styles.pinButtonText}>
                        {service.is_pinned ? "Unpin Event" : "Pin Event"}
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  {ownerEditLockReason ? (
                    <Text style={styles.inlineHelperText}>{ownerEditLockReason}</Text>
                  ) : null}

                  <View style={styles.infoCard}>
                    <Ionicons
                      name="people-outline"
                      size={18}
                      color={colors.GREEN}
                    />
                    <View style={styles.infoCardTextWrap}>
                      <Text style={styles.infoCardTitle}>Participant Management</Text>
                      <Text style={styles.infoCardText}>
                        Use the `Participants` tab to review roster, mark attendance, report
                        issues, and complete the event.
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.descriptionBlock}>
                  <Text style={styles.sectionEyebrow}>Your Actions</Text>

                  {participantStatus === "reported" ? (
                    <View style={styles.warningCard}>
                      <Ionicons
                        name="alert-circle-outline"
                        size={18}
                        color={colors.AMBER}
                      />
                      <Text style={styles.warningCardText}>
                        Participation under review.
                      </Text>
                    </View>
                  ) : null}

                  {participantStatus === "cancelled" ? (
                    <View style={styles.dangerCard}>
                      <Ionicons
                        name="close-circle-outline"
                        size={18}
                        color={colors.RED}
                      />
                      <Text style={styles.dangerCardText}>Removed from event.</Text>
                    </View>
                  ) : null}

                  {participantStatus === "attended" ? (
                    <>
                      <View style={styles.infoCard}>
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={18}
                          color={colors.GREEN}
                        />
                        <View style={styles.infoCardTextWrap}>
                          <Text style={styles.infoCardTitle}>Attendance confirmed</Text>
                          <Text style={styles.infoCardText}>
                            The organizer marked you as attended.
                          </Text>
                        </View>
                      </View>

                      {eventEvaluationTarget ? (() => {
                        const windowEnd = eventEvaluationTarget.evaluation_window_ends_at
                          ? new Date(eventEvaluationTarget.evaluation_window_ends_at).getTime()
                          : null;
                        const windowClosed = eventEvaluationTarget.evaluation_window_closed_at
                          || (windowEnd != null && windowEnd <= Date.now());
                        return eventEvaluationTarget.user_has_reviewed ? (
                          <View style={styles.infoCard}>
                            <Ionicons
                              name="star-outline"
                              size={18}
                              color={colors.GREEN}
                            />
                            <View style={styles.infoCardTextWrap}>
                              <Text style={styles.infoCardTitle}>Evaluation submitted</Text>
                              <Text style={styles.infoCardText}>
                                You already reviewed this event.
                              </Text>
                            </View>
                          </View>
                        ) : windowClosed ? (
                          <View style={styles.infoCard}>
                            <Ionicons
                              name="time-outline"
                              size={18}
                              color={colors.GRAY400}
                            />
                            <View style={styles.infoCardTextWrap}>
                              <Text style={styles.infoCardTitle}>Evaluation window closed</Text>
                              <Text style={styles.infoCardText}>
                                The 48-hour feedback window has ended.
                              </Text>
                            </View>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.evaluationButton}
                            onPress={onOpenEvaluation}
                            activeOpacity={0.88}
                          >
                            <Ionicons
                              name="star-outline"
                              size={16}
                              color={colors.WHITE}
                            />
                            <Text style={styles.evaluationButtonText}>
                              Leave Evaluation
                            </Text>
                          </TouchableOpacity>
                        );
                      })() : null}
                    </>
                  ) : null}

                  {participantStatus === "checked_in" ? (
                    <View style={styles.infoCard}>
                      <Ionicons
                        name="checkmark-done-outline"
                        size={18}
                        color={colors.GREEN}
                      />
                      <View style={styles.infoCardTextWrap}>
                        <Text style={styles.infoCardTitle}>Checked in</Text>
                        <Text style={styles.infoCardText}>
                          You are checked in for this event.
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {participantStatus === "accepted" && participantFuture ? (
                    <>
                      <View style={styles.infoCard}>
                        <Ionicons
                          name="calendar-outline"
                          size={18}
                          color={colors.GREEN}
                        />
                        <View style={styles.infoCardTextWrap}>
                          <Text style={styles.infoCardTitle}>You're joined</Text>
                          <Text style={styles.infoCardText}>
                            Manage your participation from here.
                          </Text>
                        </View>
                      </View>

                      {participantLockdown ? (
                        <TouchableOpacity
                          style={styles.joinButton}
                          onPress={onCheckinEvent}
                          disabled={participantActionLoading}
                          activeOpacity={0.88}
                        >
                          {participantActionLoading ? (
                            <ActivityIndicator size="small" color={colors.WHITE} />
                          ) : (
                            <>
                              <Ionicons
                                name="log-in-outline"
                                size={16}
                                color={colors.WHITE}
                              />
                              <Text style={styles.joinButtonText}>Check In</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={styles.leaveButton}
                          onPress={onLeaveEvent}
                          disabled={participantActionLoading}
                          activeOpacity={0.88}
                        >
                          {participantActionLoading ? (
                            <ActivityIndicator size="small" color={colors.RED} />
                          ) : (
                            <>
                              <Ionicons
                                name="exit-outline"
                                size={16}
                                color={colors.RED}
                              />
                              <Text style={styles.leaveButtonText}>Leave Event</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      )}
                    </>
                  ) : null}

                  {participantPast && !participantStatus ? (
                    <View style={styles.neutralCard}>
                      <Ionicons
                        name="time-outline"
                        size={18}
                        color={colors.GRAY500}
                      />
                      <Text style={styles.neutralCardText}>Event ended.</Text>
                    </View>
                  ) : null}

                  {participantBanned ? (
                    <View style={styles.dangerCard}>
                      <Ionicons name="ban-outline" size={18} color={colors.RED} />
                      <Text style={styles.dangerCardText}>
                        You are temporarily banned from joining events.
                      </Text>
                    </View>
                  ) : null}

                  {participantFull && !participantStatus ? (
                    <View style={styles.warningCard}>
                      <Ionicons name="people-outline" size={18} color={colors.AMBER} />
                      <Text style={styles.warningCardText}>
                        This event is currently full.
                      </Text>
                    </View>
                  ) : null}

                  {service.status === "Active" &&
                  !participantStatus &&
                  !participantPast &&
                  !participantBanned &&
                  !participantFull ? (
                    <TouchableOpacity
                      style={styles.joinButton}
                      onPress={onJoinEvent}
                      disabled={participantActionLoading}
                      activeOpacity={0.88}
                    >
                      {participantActionLoading ? (
                        <ActivityIndicator size="small" color={colors.WHITE} />
                      ) : (
                        <>
                          <Ionicons
                            name="add-circle-outline"
                            size={16}
                            color={colors.WHITE}
                          />
                          <Text style={styles.joinButtonText}>Join Event</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}
            </ScrollView>
          ) : (
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.heroCard}>
                <Text style={styles.heroTitle}>Manage your roster</Text>
                <Text style={styles.heroText}>
                  Track accepted attendees, mark check-ins as attended, and complete the
                  event when everything is done.
                </Text>
              </View>

              {activeParticipants.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="people-outline" size={28} color={colors.GRAY400} />
                  <Text style={styles.emptyTitle}>No active participants yet</Text>
                  <Text style={styles.emptyText}>
                    Accepted and checked-in attendees will appear here.
                  </Text>
                </View>
              ) : (
                activeParticipants.map((handshake) => {
                  const status = handshake.status?.toLowerCase() ?? "accepted";
                  const badgeStyle =
                    status === "no_show"
                      ? styles.badgeDanger
                      : status === "checked_in" || status === "attended"
                        ? styles.badgeSuccess
                        : styles.badgeNeutral;

                  const badgeTextStyle =
                    status === "no_show"
                      ? styles.badgeDangerText
                      : status === "checked_in" || status === "attended"
                        ? styles.badgeSuccessText
                        : styles.badgeNeutralText;

                  return (
                    <View key={handshake.id} style={styles.participantCard}>
                      <View style={styles.participantTopRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.participantName}>
                            {getRequesterName(handshake)}
                          </Text>
                          <View style={[styles.badgeBase, badgeStyle]}>
                            <Text style={[styles.badgeTextBase, badgeTextStyle]}>
                              {status === "checked_in"
                                ? "Checked In"
                                : status === "no_show"
                                  ? "No-Show"
                                  : status.charAt(0).toUpperCase() + status.slice(1)}
                            </Text>
                          </View>
                        </View>

                        {status === "checked_in" ? (
                          <TouchableOpacity
                            style={styles.markButton}
                            onPress={() => onMarkAttended(handshake.id)}
                            disabled={markingHandshakeId === handshake.id}
                            activeOpacity={0.85}
                          >
                            {markingHandshakeId === handshake.id ? (
                              <ActivityIndicator size="small" color={colors.WHITE} />
                            ) : (
                              <Text style={styles.markButtonText}>Mark Attended</Text>
                            )}
                          </TouchableOpacity>
                        ) : null}
                      </View>

                      {reportedParticipantIds[handshake.id] ? (
                        <Text style={styles.reportedText}>Already reported</Text>
                      ) : (
                        <TouchableOpacity
                          style={styles.reportAction}
                          onPress={() => onOpenParticipantReport(handshake)}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="flag-outline" size={14} color={colors.RED} />
                          <Text style={styles.reportActionText}>Report participant</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}

              {(service.status === "Active" || service.status === "Agreed") ? (
                <TouchableOpacity
                  style={[styles.completeButton, completing && styles.completeButtonDisabled]}
                  onPress={onCompleteEvent}
                  disabled={completing}
                  activeOpacity={0.88}
                >
                  {completing ? (
                    <ActivityIndicator size="small" color={colors.WHITE} />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark-done-outline"
                        size={16}
                        color={colors.WHITE}
                      />
                      <Text style={styles.completeButtonText}>Complete Event</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          )}
          </View>

          <View style={styles.footerRow}>
            {canOpenChat ? (
              <TouchableOpacity
                style={styles.footerPrimaryButton}
                onPress={onOpenChat}
                activeOpacity={0.88}
              >
                <Ionicons name="chatbubbles-outline" size={16} color={colors.WHITE} />
                <Text style={styles.footerPrimaryButtonText}>Open Chat</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.44)",
    justifyContent: "flex-end",
  },
  backdropDismissLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    height: "84%",
    backgroundColor: colors.WHITE,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
  },
  scrollArea: {
    flex: 1,
    minHeight: 0,
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
    minHeight: 0,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.GRAY200,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
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
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  tabsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
    marginBottom: 8,
  },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    backgroundColor: colors.WHITE,
  },
  tabButtonActive: {
    borderColor: colors.AMBER,
    backgroundColor: colors.AMBER,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.GRAY700,
  },
  tabTextActive: {
    color: colors.WHITE,
  },
  content: {
    paddingTop: 8,
    paddingBottom: 16,
    flexGrow: 1,
    gap: 14,
  },
  heroCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.GRAY900,
  },
  heroText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 20,
    color: colors.GRAY600,
  },
  tilesWrap: {
    gap: 10,
  },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: colors.GRAY100,
  },
  tileIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF7ED",
  },
  tileLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.GRAY400,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  tileValue: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
    color: colors.GRAY800,
  },
  descriptionBlock: {
    marginTop: 2,
  },
  ownerActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  secondaryActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    backgroundColor: colors.WHITE,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  secondaryActionButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.GRAY800,
  },
  secondaryDangerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${colors.RED}20`,
    backgroundColor: colors.WHITE,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  secondaryDangerButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.RED,
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.GRAY500,
    textTransform: "uppercase",
    letterSpacing: 0.9,
    marginBottom: 8,
  },
  descriptionCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.GRAY100,
    backgroundColor: colors.WHITE,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.GRAY700,
  },
  pinButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: colors.AMBER_LT,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  pinButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.AMBER,
  },
  inlineHelperText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.GRAY500,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 34,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.GRAY100,
    backgroundColor: "#F8FAFC",
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "700",
    color: colors.GRAY800,
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    color: colors.GRAY500,
  },
  participantCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.GRAY100,
    backgroundColor: colors.WHITE,
  },
  participantTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  participantName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.GRAY900,
  },
  badgeBase: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeNeutral: {
    backgroundColor: "#DCFCE7",
  },
  badgeSuccess: {
    backgroundColor: "#D1FAE5",
  },
  badgeDanger: {
    backgroundColor: "#FEE2E2",
  },
  badgeTextBase: {
    fontSize: 11,
    fontWeight: "700",
  },
  badgeNeutralText: {
    color: "#166534",
  },
  badgeSuccessText: {
    color: "#065F46",
  },
  badgeDangerText: {
    color: "#991B1B",
  },
  markButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.GREEN,
    minWidth: 108,
    alignItems: "center",
    justifyContent: "center",
  },
  markButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.WHITE,
  },
  reportAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  reportActionText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.RED,
  },
  reportedText: {
    marginTop: 12,
    fontSize: 12,
    color: colors.GRAY500,
  },
  completeButton: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
    backgroundColor: "#1D4ED8",
  },
  completeButtonDisabled: {
    opacity: 0.65,
  },
  completeButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.WHITE,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.22)",
  },
  infoCardTextWrap: {
    flex: 1,
  },
  infoCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.GREEN,
  },
  infoCardText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 18,
    color: "#166534",
  },
  evaluationButton: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: colors.AMBER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  evaluationButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.WHITE,
  },
  warningCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.AMBER_LT,
    borderWidth: 1,
    borderColor: `${colors.AMBER}30`,
  },
  warningCardText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    color: "#92400E",
  },
  dangerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.RED_LT,
    borderWidth: 1,
    borderColor: `${colors.RED}30`,
  },
  dangerCardText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    color: "#991B1B",
  },
  joinButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.AMBER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  joinButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.WHITE,
  },
  leaveButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.RED_LT,
    borderWidth: 1,
    borderColor: `${colors.RED}30`,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },
  leaveButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.RED,
  },
  neutralCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.GRAY50,
    borderWidth: 1,
    borderColor: colors.GRAY100,
  },
  neutralCardText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    color: colors.GRAY600,
  },
  footerRow: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.GRAY100,
  },
  footerPrimaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.GREEN,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  footerPrimaryButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.WHITE,
  },
});
