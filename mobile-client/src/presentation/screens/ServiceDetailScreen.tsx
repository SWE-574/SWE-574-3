import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  StatusBar,
  Image,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Dimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  useRoute,
  useNavigation,
  type CompositeNavigationProp,
} from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { HomeStackParamList } from "../../navigation/HomeStack";
import type { ProfileStackParamList } from "../../navigation/ProfileStack";
import type { BottomTabParamList } from "../../navigation/BottomTabNavigator";
import { getService, addServiceInterest, completeEvent } from "../../api/services";
import {
  listHandshakes,
  joinEvent,
  leaveEvent,
  checkinEvent,
  markAttended,
  type Handshake,
} from "../../api/handshakes";
import {
  isFutureEvent,
  isPastEvent,
  isWithinLockdownWindow,
  isEventFull,
  spotsLeft,
  isEventBanned,
} from "../../utils/eventUtils";
import type { Service } from "../../api/types";
import { useAuth } from "../../context/AuthContext";
import { formatTimeAgo } from "../../utils/formatTimeAgo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../constants/colors";
import ImagePreviewModal from "../components/ImagePreviewModal";
import { ChatEvaluationModal } from "../components/chat/ChatEvaluationModal";
import { EventEvaluationSummaryCard } from "../components/service/EventEvaluationSummaryCard";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SLIDER_WIDTH = SCREEN_WIDTH;
const HEADER_HEIGHT = 280;

const HEADER_PALETTE = ["#6a48d8", "#2e4bf0", "#e53935", "#2e7d32", "#f9a825"];

function headerColorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
  }
  return HEADER_PALETTE[Math.abs(hash) % HEADER_PALETTE.length];
}

function getInitials(firstName: string, lastName: string): string {
  const f = (firstName || "").trim().charAt(0) || "";
  const l = (lastName || "").trim().charAt(0) || "";
  return (f + l).toUpperCase() || "?";
}

type MediaItem = {
  id: string;
  file_url: string;
};

type ServiceDetailRouteParams = { ServiceDetail: { id: string } };

type ServiceDetailNavigation = CompositeNavigationProp<
  | NativeStackNavigationProp<HomeStackParamList, "ServiceDetail">
  | NativeStackNavigationProp<ProfileStackParamList, "ServiceDetail">,
  BottomTabNavigationProp<BottomTabParamList>
>;

function getIdFromField(value: string | object | undefined): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "id" in value) return String((value as { id: unknown }).id);
  return undefined;
}

export default function ServiceDetailScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<ServiceDetailRouteParams, "ServiceDetail">>();
  const navigation = useNavigation<ServiceDetailNavigation>();
  const { user: currentUser } = useAuth();

  const styles = useMemo(
    () => getStyles(insets.top, insets.bottom),
    [insets.top, insets.bottom],
  );

  const { id } = route.params;
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [interestLoading, setInterestLoading] = useState(false);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [modalInitialIndex, setModalInitialIndex] = useState(0);

  const [myEventHandshake, setMyEventHandshake] = useState<Handshake | null>(null);
  const [allEventHandshakes, setAllEventHandshakes] = useState<Handshake[]>([]);
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [eventActionLoading, setEventActionLoading] = useState(false);
  const [markingAttendedId, setMarkingAttendedId] = useState<string | null>(null);

  const sliderRef = useRef<FlatList<MediaItem>>(null);

  const loadService = useCallback(() => {
    return getService(id)
      .then(setService)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [id]);

  const loadHandshakes = useCallback(() => {
    if (!service || service.type !== "Event") return;
    listHandshakes()
      .then((res) => {
        const eventHandshakes = res.results.filter((h) => {
          const svcId = getIdFromField(h.service);
          return svcId === service.id;
        });
        setAllEventHandshakes(eventHandshakes);

        if (currentUser?.id) {
          const mine = eventHandshakes.find((h) => {
            const requesterId = getIdFromField(h.requester);
            return (
              requesterId === currentUser.id &&
              ["accepted", "checked_in", "attended", "no_show", "reported", "cancelled"].includes(h.status)
            );
          });
          setMyEventHandshake(mine ?? null);
        }
      })
      .catch(() => {});
  }, [service, currentUser?.id]);

  useEffect(() => {
    loadService().finally(() => setLoading(false));
  }, [loadService]);

  useEffect(() => {
    loadHandshakes();
  }, [loadHandshakes]);

  const isOwner = service?.user?.id === currentUser?.id;

  const handleEvaluationSubmitted = useCallback(async () => {
    await loadService();
    setMyEventHandshake((prev) => prev ? { ...prev, user_has_reviewed: true } : null);
  }, [loadService]);

  const handleExpressInterest = () => {
    setInterestLoading(true);
    addServiceInterest(id)
      .then(() => Alert.alert("Success", "Your interest has been sent to the provider."))
      .catch((e) => Alert.alert("Error", e instanceof Error ? e.message : "Could not send interest."))
      .finally(() => setInterestLoading(false));
  };

  const handleJoinEvent = async () => {
    if (!service) return;
    setEventActionLoading(true);
    try {
      await joinEvent(service.id);
      Alert.alert("Joined!", "You've joined the event.");
      await loadService();
      loadHandshakes();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not join event.");
    } finally {
      setEventActionLoading(false);
    }
  };

  const handleLeaveEvent = async () => {
    if (!myEventHandshake) return;
    Alert.alert("Leave Event", "Are you sure you want to leave this event?", [
      { text: "Stay", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          setEventActionLoading(true);
          try {
            await leaveEvent(myEventHandshake.id);
            Alert.alert("Left", "You have left the event.");
            setMyEventHandshake(null);
            await loadService();
            loadHandshakes();
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Could not leave event.");
          } finally {
            setEventActionLoading(false);
          }
        },
      },
    ]);
  };

  const handleCheckin = async () => {
    if (!myEventHandshake) return;
    setEventActionLoading(true);
    try {
      await checkinEvent(myEventHandshake.id);
      Alert.alert("Checked in!", "See you there.");
      loadHandshakes();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not check in.");
    } finally {
      setEventActionLoading(false);
    }
  };

  const handleMarkAttended = async (handshakeId: string) => {
    setMarkingAttendedId(handshakeId);
    try {
      await markAttended(handshakeId);
      Alert.alert("Done", "Attendance marked.");
      loadHandshakes();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not mark attendance.");
    } finally {
      setMarkingAttendedId(null);
    }
  };

  const handleCompleteEvent = async () => {
    if (!service) return;
    Alert.alert("Complete Event", "Mark this event as completed?", [
      { text: "Not yet", style: "cancel" },
      {
        text: "Complete",
        onPress: async () => {
          setEventActionLoading(true);
          try {
            await completeEvent(service.id);
            Alert.alert("Done", "Event marked complete!");
            await loadService();
            loadHandshakes();
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Could not complete event.");
          } finally {
            setEventActionLoading(false);
          }
        },
      },
    ]);
  };

  const openEventChat = () => {
    if (!service) return;
    navigation.navigate("Messages", {
      screen: "PublicChat",
      params: { roomId: service.id, roomTitle: service.title },
    } as any);
  };

  const onSliderMomentumEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SLIDER_WIDTH);
    setActiveImageIndex(index);
  };

  const openImageModal = (index: number) => {
    setModalInitialIndex(index);
    setImageModalVisible(true);
  };

  const openProviderPublicProfile = () => {
    const userId = service?.user?.id;
    if (!userId) return;
    navigation.navigate("Profile", {
      screen: "PublicProfile",
      params: { userId },
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.loadingWrap}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={colors.BLUE} />
            <Text style={styles.loadingText}>Loading service details...</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !service) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.errorTopBar}>
          <TouchableOpacity
            style={styles.backButtonLight}
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-back" size={20} color="#1a1a1a" />
          </TouchableOpacity>
        </View>

        <View style={styles.loadingWrap}>
          <View style={styles.errorCard}>
            <Ionicons
              name="alert-circle-outline"
              size={44}
              color="#9e9e9e"
              style={{ marginBottom: 10 }}
            />
            <Text style={styles.errorTitle}>Something went wrong</Text>
            <Text style={styles.errorText}>{error ?? "Service not found"}</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const headerColor = headerColorFor(service.id);
  const isOffer = service.type === "Offer";
  const isEvent = service.type === "Event";
  const providerSectionLabel = isOffer
    ? "Service Provider"
    : isEvent
      ? "Event Organizer"
      : "Posted by";
  const viewProfileLinkColor = isEvent
    ? colors.AMBER
    : isOffer
      ? colors.GREEN
      : colors.BLUE;
  const displayName =
    [service.user.first_name, service.user.last_name]
      .filter(Boolean)
      .join(" ") || "Unknown";
  const initials = getInitials(service.user.first_name, service.user.last_name);
  const isRecurring = service.schedule_type === "Recurrent";

  const mediaItems = (service.media ?? []).filter(
    (item): item is MediaItem => Boolean(item?.file_url),
  );
  const hasMedia = mediaItems.length > 0;

  const detailItems = [
    service.duration
      ? {
          key: "duration",
          icon: "time-outline" as const,
          text: service.duration,
        }
      : null,
    service.location_area || service.location_type
      ? {
          key: "location",
          icon: "location-outline" as const,
          text: service.location_area || service.location_type || "",
        }
      : null,
    service.schedule_type || service.schedule_details
      ? {
          key: "schedule",
          icon: "calendar-outline" as const,
          text: `${service.schedule_type ?? ""}${
            service.schedule_details ? ` · ${service.schedule_details}` : ""
          }`,
        }
      : null,
    {
      key: "participants",
      icon: "people-outline" as const,
      text: `Up to ${service.max_participants} participant${
        service.max_participants !== 1 ? "s" : ""
      }`,
    },
    isRecurring
      ? {
          key: "recurring",
          icon: "repeat-outline" as const,
          text: "Recurring",
          highlight: true,
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    icon: keyof typeof Ionicons.glyphMap;
    text: string;
    highlight?: boolean;
  }>;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      <StatusBar barStyle={hasMedia ? "light-content" : "light-content"} />

      {hasMedia ? (
        <View style={styles.headerImageWrap}>
          <FlatList
            ref={sliderRef}
            data={mediaItems}
            keyExtractor={(_, index) => `media-${index}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onSliderMomentumEnd}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                activeOpacity={0.95}
                onPress={() => openImageModal(index)}
                style={styles.slide}
              >
                <Image
                  source={{ uri: item.file_url }}
                  style={styles.headerImage}
                />
              </TouchableOpacity>
            )}
          />

          <View
            style={[
              styles.headerTopBarAbsolute,
              { paddingTop: insets.top + 8 },
            ]}
          >
            <TouchableOpacity
              style={styles.backButtonDark}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.sliderFooter}>
            <View
              style={[
                styles.typeBadge,
                service.type === "Offer"
                  ? styles.typeOffer
                  : service.type === "Need"
                    ? styles.typeWant
                    : styles.typeEvent,
              ]}
            >
              <Text
                style={
                  service.type === "Offer"
                    ? styles.typeOfferBadgeText
                    : service.type === "Need"
                      ? styles.typeWantBadgeText
                      : styles.typeEventBadgeText
                }
              >
                {service.type}
              </Text>
            </View>

            {mediaItems.length > 1 ? (
              <View style={styles.pagination}>
                {mediaItems.map((_, index) => (
                  <View
                    key={`dot-${index}`}
                    style={[
                      styles.dot,
                      activeImageIndex === index && styles.activeDot,
                    ]}
                  />
                ))}
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={[styles.header, { backgroundColor: headerColor }]}>
          <View style={styles.headerOverlayTopLeft} />
          <View style={styles.headerOverlayBottomRight} />

          <View style={styles.headerTopRow}>
            <TouchableOpacity
              style={styles.backButtonDark}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.headerContent}>
            <View
              style={[
                styles.typeBadge,
                isOffer ? styles.typeOffer : styles.typeWant,
              ]}
            >
              <Text
                style={
                  isOffer ? styles.typeOfferBadgeText : styles.typeWantBadgeText
                }
              >
                {service.type}
              </Text>
            </View>

            <Text style={styles.headerTitle}>{service.title}</Text>
          </View>
        </View>
      )}

      <View style={styles.contentContainer}>
        <View style={styles.contentCard}>
          <Text style={styles.serviceTitle}>{service.title}</Text>

          <View style={styles.userSection}>
            <View style={styles.providerHeaderRow}>
              <Text style={styles.providerHeaderLabel}>
                {providerSectionLabel}
              </Text>
              {service.user.id ? (
                <TouchableOpacity
                  onPress={openProviderPublicProfile}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                  accessibilityRole="link"
                  accessibilityLabel="View profile"
                >
                  <Text
                    style={[
                      styles.viewProfileLink,
                      { color: viewProfileLinkColor },
                    ]}
                  >
                    View Profile →
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.userRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>

              <View style={styles.userMeta}>
                <Text style={styles.userName}>{displayName}</Text>
                <View style={styles.timeRow}>
                  <Ionicons
                    name="time-outline"
                    size={13}
                    color="#8a8f98"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.timeAgo}>
                    {formatTimeAgo(service.created_at)}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Description</Text>
            <Text style={styles.description}>{service.description || "—"}</Text>
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Details</Text>
            <View style={styles.detailsCard}>
              {detailItems.map((item, index) => (
                <View key={item.key}>
                  <View style={styles.detailRow}>
                    <View
                      style={[
                        styles.detailIconWrap,
                        item.highlight && styles.detailIconWrapHighlight,
                      ]}
                    >
                      <Ionicons
                        name={item.icon}
                        size={17}
                        color={item.highlight ? "#6a1b9a" : "#5f6368"}
                      />
                    </View>
                    <Text
                      style={[
                        styles.detailText,
                        item.highlight && styles.recurringText,
                      ]}
                    >
                      {item.text}
                    </Text>
                  </View>

                  {index !== detailItems.length - 1 ? (
                    <View style={styles.detailDivider} />
                  ) : null}
                </View>
              ))}
            </View>
          </View>

          {service.tags?.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionLabel}>Tags</Text>
              <View style={styles.tagsRow}>
                {service.tags.map((tag) => (
                  <View key={tag.id} style={styles.tag}>
                    <Text style={styles.tagText}>#{tag.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {isEvent && service.event_evaluation_summary &&
            service.event_evaluation_summary.feedback_submission_count > 0 && (
              <View style={styles.sectionBlock}>
                <EventEvaluationSummaryCard summary={service.event_evaluation_summary} />
              </View>
          )}

          {/* ─── Event lifecycle CTA ─── */}
          {isEvent && !isOwner && (() => {
            const status = myEventHandshake?.status;
            const banned = isEventBanned(currentUser?.is_organizer_banned_until);
            const full = isEventFull(service.max_participants, service.participant_count ?? 0);
            const future = isFutureEvent(service.scheduled_time);
            const past = isPastEvent(service.scheduled_time);
            const lockdown = isWithinLockdownWindow(service.scheduled_time);

            if (status === "reported") return (
              <View style={styles.sectionBlock}>
                <View style={styles.warningBanner}>
                  <Ionicons name="alert-circle" size={20} color={colors.AMBER} />
                  <Text style={[styles.bannerText, { color: colors.AMBER }]}>Participation under review</Text>
                </View>
              </View>
            );

            if (status === "cancelled") return (
              <View style={styles.sectionBlock}>
                <View style={styles.dangerBanner}>
                  <Ionicons name="close-circle" size={20} color={colors.RED} />
                  <Text style={[styles.bannerText, { color: colors.RED }]}>Removed from event</Text>
                </View>
              </View>
            );

            if (status === "attended") return (
              <View style={styles.sectionBlock}>
                <View style={styles.attendedBanner}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.GREEN} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.attendedTitle}>Attendance confirmed!</Text>
                    <Text style={styles.attendedSubtitle}>The organizer marked you as attended.</Text>
                  </View>
                </View>
                {!myEventHandshake?.user_has_reviewed && (
                  <TouchableOpacity style={styles.evaluationButton} onPress={() => setShowEvaluationModal(true)} activeOpacity={0.85}>
                    <Ionicons name="star-outline" size={16} color={colors.WHITE} />
                    <Text style={styles.evaluationButtonText}>Leave Evaluation</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.eventChatButton} onPress={openEventChat} activeOpacity={0.85}>
                  <Ionicons name="chatbubbles-outline" size={16} color={colors.WHITE} />
                  <Text style={styles.eventChatButtonText}>Event Chat</Text>
                </TouchableOpacity>
              </View>
            );

            if (status === "checked_in") return (
              <View style={styles.sectionBlock}>
                <View style={styles.attendedBanner}>
                  <Ionicons name="checkmark-done" size={20} color={colors.GREEN} />
                  <Text style={[styles.bannerText, { color: colors.GREEN, marginLeft: 10 }]}>Checked in</Text>
                </View>
                <TouchableOpacity style={styles.eventChatButton} onPress={openEventChat} activeOpacity={0.85}>
                  <Ionicons name="chatbubbles-outline" size={16} color={colors.WHITE} />
                  <Text style={styles.eventChatButtonText}>Event Chat</Text>
                </TouchableOpacity>
              </View>
            );

            if (status === "accepted" && future) return (
              <View style={styles.sectionBlock}>
                <View style={styles.attendedBanner}>
                  <Ionicons name="calendar-outline" size={20} color={colors.GREEN} />
                  <Text style={[styles.bannerText, { color: colors.GREEN, marginLeft: 10 }]}>You've joined this event</Text>
                </View>
                {lockdown ? (
                  <TouchableOpacity
                    style={styles.joinButton}
                    onPress={handleCheckin}
                    disabled={eventActionLoading}
                    activeOpacity={0.85}
                  >
                    {eventActionLoading ? <ActivityIndicator color="#fff" size="small" /> : (
                      <><Ionicons name="log-in-outline" size={16} color={colors.WHITE} /><Text style={styles.joinButtonText}>Check In</Text></>
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.leaveButton}
                    onPress={handleLeaveEvent}
                    disabled={eventActionLoading}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="exit-outline" size={16} color={colors.RED} />
                    <Text style={styles.leaveButtonText}>Leave Event</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.eventChatButton} onPress={openEventChat} activeOpacity={0.85}>
                  <Ionicons name="chatbubbles-outline" size={16} color={colors.WHITE} />
                  <Text style={styles.eventChatButtonText}>Event Chat</Text>
                </TouchableOpacity>
              </View>
            );

            if (past && !status) return (
              <View style={styles.sectionBlock}>
                <View style={styles.warningBanner}>
                  <Ionicons name="time-outline" size={20} color={colors.GRAY500} />
                  <Text style={[styles.bannerText, { color: colors.GRAY500 }]}>Event ended</Text>
                </View>
              </View>
            );

            if (banned) return (
              <View style={styles.sectionBlock}>
                <View style={styles.dangerBanner}>
                  <Ionicons name="ban-outline" size={20} color={colors.RED} />
                  <Text style={[styles.bannerText, { color: colors.RED }]}>You are temporarily banned from joining events</Text>
                </View>
              </View>
            );

            if (full && !status) return (
              <View style={styles.sectionBlock}>
                <View style={styles.warningBanner}>
                  <Ionicons name="people" size={20} color={colors.AMBER} />
                  <Text style={[styles.bannerText, { color: colors.AMBER }]}>
                    Event full ({spotsLeft(service.max_participants, service.participant_count ?? 0)} spots left)
                  </Text>
                </View>
              </View>
            );

            if (service.status === "Active" && !status) return (
              <TouchableOpacity
                style={[styles.joinButton, eventActionLoading && styles.ctaDisabled]}
                onPress={handleJoinEvent}
                disabled={eventActionLoading}
                activeOpacity={0.9}
              >
                {eventActionLoading ? <ActivityIndicator color="#fff" size="small" /> : (
                  <><Ionicons name="add-circle-outline" size={18} color="#fff" /><Text style={styles.joinButtonText}>Join Event</Text></>
                )}
              </TouchableOpacity>
            );

            return null;
          })()}

          {/* ─── Organizer management ─── */}
          {isEvent && isOwner && (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionLabel}>Participants</Text>
              {allEventHandshakes
                .filter((h) => ["accepted", "checked_in", "attended", "no_show"].includes(h.status))
                .map((h) => {
                  const name = (() => {
                    const r = h.requester;
                    if (!r || typeof r === "string") return r ?? "Unknown";
                    const obj = r as Record<string, unknown>;
                    return [obj.first_name, obj.last_name].filter(Boolean).join(" ") || String(obj.email ?? "Participant");
                  })();
                  const badgeColors: Record<string, { bg: string; fg: string }> = {
                    accepted: { bg: "#dcfce7", fg: "#166534" },
                    checked_in: { bg: "#d1fae5", fg: "#065f46" },
                    attended: { bg: "#d1fae5", fg: "#065f46" },
                    no_show: { bg: "#fee2e2", fg: "#991b1b" },
                  };
                  const badge = badgeColors[h.status] ?? { bg: colors.GRAY100, fg: colors.GRAY500 };
                  return (
                    <View key={h.id} style={styles.rosterRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rosterName}>{name}</Text>
                        <View style={[styles.rosterBadge, { backgroundColor: badge.bg }]}>
                          <Text style={[styles.rosterBadgeText, { color: badge.fg }]}>
                            {h.status === "checked_in" ? "Checked In" : h.status === "no_show" ? "No-Show" : h.status.charAt(0).toUpperCase() + h.status.slice(1)}
                          </Text>
                        </View>
                      </View>
                      {h.status === "checked_in" && (
                        <TouchableOpacity
                          style={styles.markAttendedBtn}
                          onPress={() => handleMarkAttended(h.id)}
                          disabled={markingAttendedId === h.id}
                          activeOpacity={0.85}
                        >
                          {markingAttendedId === h.id
                            ? <ActivityIndicator size="small" color={colors.WHITE} />
                            : <Text style={styles.markAttendedText}>Mark Attended</Text>
                          }
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}

              {service.status === "Active" && (
                <TouchableOpacity
                  style={[styles.completeEventButton, eventActionLoading && styles.ctaDisabled]}
                  onPress={handleCompleteEvent}
                  disabled={eventActionLoading}
                  activeOpacity={0.85}
                >
                  {eventActionLoading ? <ActivityIndicator color="#fff" size="small" /> : (
                    <><Ionicons name="checkmark-done-outline" size={16} color={colors.WHITE} /><Text style={styles.completeEventText}>Complete Event</Text></>
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.eventChatButton} onPress={openEventChat} activeOpacity={0.85}>
                <Ionicons name="chatbubbles-outline" size={16} color={colors.WHITE} />
                <Text style={styles.eventChatButtonText}>Event Chat</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ─── Non-event: Express Interest ─── */}
          {!isEvent && (
            <TouchableOpacity
              style={[styles.ctaButton, interestLoading && styles.ctaDisabled]}
              onPress={handleExpressInterest}
              disabled={interestLoading}
              activeOpacity={0.9}
            >
              {interestLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="heart-outline" size={18} color="#fff" />
                  <Text style={styles.ctaText}>Express interest</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ImagePreviewModal
        visible={imageModalVisible}
        images={mediaItems.map((item) => item.file_url)}
        initialIndex={modalInitialIndex}
        onClose={() => setImageModalVisible(false)}
      />

      {isEvent && myEventHandshake?.status === "attended" && !myEventHandshake.user_has_reviewed && (
        <ChatEvaluationModal
          visible={showEvaluationModal}
          handshakeId={myEventHandshake.id}
          counterpartName={service.title}
          isEventEvaluation
          onClose={() => setShowEvaluationModal(false)}
          onSubmitted={handleEvaluationSubmitted}
        />
      )}
    </ScrollView>
  );
}

const getStyles = (topInset: number, bottomInset: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.WHITE,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: Math.max(28, bottomInset + 14),
    },
    loadingWrap: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 24,
    },
    contentContainer: {
      marginTop: -10,
    },
    loadingCard: {
      backgroundColor: "#fff",
      borderRadius: 24,
      paddingVertical: 28,
      paddingHorizontal: 26,
      alignItems: "center",
      shadowColor: "#000",
      shadowOpacity: 0.06,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
      minWidth: 220,
    },
    loadingText: {
      marginTop: 14,
      fontSize: 15,
      color: "#6b7280",
      fontWeight: "500",
    },
    errorTopBar: {
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    errorCard: {
      backgroundColor: "#fff",
      borderRadius: 24,
      paddingVertical: 28,
      paddingHorizontal: 22,
      alignItems: "center",
      shadowColor: "#000",
      shadowOpacity: 0.06,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    errorTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: "#1f2937",
      marginBottom: 8,
    },
    errorText: {
      fontSize: 15,
      color: "#6b7280",
      textAlign: "center",
      lineHeight: 22,
    },
    header: {
      position: "relative",
      paddingTop: topInset + 8,
      paddingHorizontal: 18,
      paddingBottom: 38,
      overflow: "hidden",
    },
    headerImageWrap: {
      width: "100%",
      height: HEADER_HEIGHT,
      backgroundColor: "#eaecef",
      position: "relative",
    },
    headerTopBarAbsolute: {
      position: "absolute",
      top: 0,
      left: 18,
      right: 18,
      zIndex: 10,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    slide: {
      width: SLIDER_WIDTH,
      height: HEADER_HEIGHT,
    },
    headerImage: {
      width: "100%",
      height: "100%",
      resizeMode: "cover",
    },
    sliderFooter: {
      position: "absolute",
      bottom: 14,
      left: 16,
      right: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    pagination: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(0,0,0,0.18)",
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: "rgba(255,255,255,0.55)",
      marginHorizontal: 3,
    },

    activeDot: {
      width: 18,
      backgroundColor: "#fff",
    },

    headerOverlayTopLeft: {
      position: "absolute",
      width: 180,
      height: 180,
      borderRadius: 999,
      backgroundColor: "rgba(255,255,255,0.10)",
      top: -60,
      left: -30,
    },

    headerOverlayBottomRight: {
      position: "absolute",
      width: 220,
      height: 220,
      borderRadius: 999,
      backgroundColor: "rgba(255,255,255,0.08)",
      right: -80,
      bottom: -90,
    },

    headerTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 28,
      zIndex: 2,
    },

    headerContent: {
      paddingRight: 8,
      zIndex: 2,
    },

    backButtonDark: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: "rgba(0,0,0,0.28)",
      alignItems: "center",
      justifyContent: "center",
    },

    backButtonLight: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: "#ffffff",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },

    typeBadge: {
      alignSelf: "flex-start",
      paddingVertical: 7,
      paddingHorizontal: 13,
      borderRadius: 999,
    },

    typeOffer: {
      backgroundColor: "rgba(240, 253, 244, 0.95)",
    },

    typeWant: {
      backgroundColor: "rgba(239, 246, 255, 0.95)",
    },

    typeEvent: {
      backgroundColor: "rgba(255, 245, 238, 0.95)",
    },
    typeOfferBadgeText: {
      fontSize: 12,
      fontWeight: "800",
      color: colors.GREEN,
      letterSpacing: 0.4,
    },
    typeWantBadgeText: {
      fontSize: 12,
      fontWeight: "800",
      color: colors.BLUE,
      letterSpacing: 0.4,
    },
    typeEventBadgeText: {
      fontSize: 12,
      fontWeight: "800",
      color: colors.AMBER,
      letterSpacing: 0.4,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: "800",
      color: "#fff",
      lineHeight: 34,
      letterSpacing: -0.3,
    },
    contentCard: {
      backgroundColor: "#fff",
      borderRadius: 28,
      padding: 18,
      shadowColor: "#0f172a",
      shadowOpacity: 0.08,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
      elevation: 5,
    },
    serviceTitle: {
      fontSize: 26,
      fontWeight: "800",
      color: "#1f2937",
      lineHeight: 32,
      marginBottom: 16,
      letterSpacing: -0.3,
    },
    userSection: {
      marginBottom: 10,
    },
    providerHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    providerHeaderLabel: {
      fontSize: 12,
      fontWeight: "800",
      color: "#98a2b3",
      textTransform: "uppercase",
      letterSpacing: 0.9,
      flex: 1,
      marginRight: 8,
    },
    viewProfileLink: {
      fontSize: 12,
      fontWeight: "600",
    },
    userRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#fafbff",
      borderRadius: 18,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: "#eef1f6",
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: "#2e7d32",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
      shadowColor: "#2e7d32",
      shadowOpacity: 0.16,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    avatarText: {
      fontSize: 17,
      fontWeight: "800",
      color: "#fff",
    },
    userMeta: {
      flex: 1,
    },
    userName: {
      fontSize: 16,
      fontWeight: "800",
      color: "#1f2937",
    },
    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 4,
    },
    timeAgo: {
      fontSize: 13,
      color: "#8a8f98",
      fontWeight: "500",
    },

    sectionBlock: {
      marginTop: 14,
    },

    sectionLabel: {
      fontSize: 12,
      fontWeight: "800",
      color: "#98a2b3",
      textTransform: "uppercase",
      letterSpacing: 0.9,
      marginBottom: 10,
      marginTop: 2,
    },

    description: {
      fontSize: 15,
      color: "#374151",
      lineHeight: 24,
    },

    detailsCard: {
      backgroundColor: "#fbfcfe",
      borderRadius: 18,
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: "#edf1f7",
    },

    detailRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
    },

    detailIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: "#f1f4f8",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
    },

    detailIconWrapHighlight: {
      backgroundColor: "#f4e8fb",
    },

    detailText: {
      fontSize: 15,
      color: "#475467",
      flex: 1,
      lineHeight: 22,
      fontWeight: "500",
    },

    recurringText: {
      color: "#6a1b9a",
      fontWeight: "700",
    },

    detailDivider: {
      height: 1,
      backgroundColor: "#eef2f6",
      marginLeft: 44,
    },

    tagsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },

    tag: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: "#f3f5f9",
      borderWidth: 1,
      borderColor: "#ebeff5",
    },

    tagText: {
      fontSize: 13,
      color: "#475467",
      fontWeight: "600",
    },

    attendedBanner: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#f0fdf4",
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: "rgba(34,197,94,0.25)",
    },

    attendedTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.GREEN,
    },

    attendedSubtitle: {
      fontSize: 12,
      color: "#166534",
      marginTop: 2,
    },

    warningBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.AMBER_LT,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: `${colors.AMBER}30`,
    },

    dangerBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.RED_LT,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: `${colors.RED}30`,
    },

    bannerText: {
      fontSize: 14,
      fontWeight: "700",
      flex: 1,
    },

    evaluationButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      minHeight: 44,
      borderRadius: 10,
      backgroundColor: colors.AMBER,
      marginTop: 10,
    },

    evaluationButtonText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.WHITE,
    },

    joinButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      minHeight: 52,
      borderRadius: 14,
      backgroundColor: colors.AMBER,
      marginTop: 10,
    },

    joinButtonText: {
      fontSize: 15,
      fontWeight: "800",
      color: colors.WHITE,
    },

    leaveButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      minHeight: 44,
      borderRadius: 10,
      backgroundColor: colors.RED_LT,
      borderWidth: 1,
      borderColor: `${colors.RED}30`,
      marginTop: 10,
    },

    leaveButtonText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.RED,
    },

    eventChatButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      minHeight: 44,
      borderRadius: 10,
      backgroundColor: colors.GREEN,
      marginTop: 10,
    },

    eventChatButtonText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.WHITE,
    },

    rosterRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.GRAY100,
    },

    rosterName: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.GRAY800,
    },

    rosterBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      marginTop: 4,
    },

    rosterBadgeText: {
      fontSize: 11,
      fontWeight: "700",
    },

    markAttendedBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.GREEN,
    },

    markAttendedText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.WHITE,
    },

    completeEventButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      minHeight: 48,
      borderRadius: 12,
      backgroundColor: colors.BLUE,
      marginTop: 14,
    },

    completeEventText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.WHITE,
    },

    ctaButton: {
      minHeight: 56,
      borderRadius: 16,
      backgroundColor: "#1a1a1a",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      marginTop: 24,
      shadowColor: "#000",
      shadowOpacity: 0.14,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },

    ctaDisabled: {
      opacity: 0.72,
    },

    ctaText: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.WHITE,
      letterSpacing: 0.2,
    },
  });
