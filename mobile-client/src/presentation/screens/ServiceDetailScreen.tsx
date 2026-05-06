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
  Pressable,
  RefreshControl,
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
import * as SecureStore from "expo-secure-store";
import type { HomeStackParamList } from "../../navigation/HomeStack";
import type { ProfileStackParamList } from "../../navigation/ProfileStack";
import type { BottomTabParamList } from "../../navigation/BottomTabNavigator";
import {
  addServiceInterest,
  cancelEvent,
  completeEvent,
  deleteService,
  getService,
  pinEvent,
  reportService,
  setPrimaryMedia,
} from "../../api/services";
import {
  listHandshakes,
  joinEvent,
  leaveEvent,
  checkinEvent,
  markAttended,
  reportHandshake,
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
import { getMapboxToken } from "../../constants/env";
import { formatTimeAgo } from "../../utils/formatTimeAgo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../constants/colors";
import ImagePreviewModal from "../components/ImagePreviewModal";
import { ChatEvaluationModal } from "../components/chat/ChatEvaluationModal";
import { EventEvaluationSummaryCard } from "../components/service/EventEvaluationSummaryCard";
import ServiceCommentsSection from "../components/service/ServiceCommentsSection";
import EventDetailModal, {
  type EventDetailModalTab,
} from "../components/service/EventDetailModal";
import ReportModal, {
  type ReportModalRequest,
  type ReportOption,
} from "../components/ReportModal";
import {
  QRScannerModal,
  QRDisplayModal,
} from "../components/service/QRAttendanceModal";

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

function getDisplayNameFromUnknown(value: unknown): string {
  if (!value) return "Unknown";
  if (typeof value === "string") {
    const trimmed = value.trim();
    const looksLikeUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        trimmed,
      );
    if (looksLikeUuid) return "Participant";
    return trimmed || "Unknown";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const fullName = [obj.first_name, obj.last_name].filter(Boolean).join(" ").trim();
    if (fullName) return fullName;
    if (typeof obj.email === "string" && obj.email.trim()) return obj.email.trim();
    return "Participant";
  }
  return "Unknown";
}

function getAvatarFromUnknown(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  return typeof obj.avatar_url === "string" ? obj.avatar_url : null;
}

function formatJoinedDate(value?: string | null): string {
  if (!value) return "Recently joined";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently joined";
  return date.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

function formatScheduledDateTime(value?: string | null): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeUntilLabel(value?: string | null): string {
  if (!value) return "Not scheduled";
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return "Not scheduled";
  const diff = target - Date.now();
  if (diff <= 0) return "Started";
  const totalMinutes = Math.ceil(diff / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getEvaluationWindowInfo(handshake?: Handshake | null) {
  if (!handshake) {
    return { isOpen: false, label: "" };
  }

  if (handshake.evaluation_window_closed_at) {
    return { isOpen: false, label: "Evaluation window closed" };
  }

  let deadlineMs: number | null = null;
  if (handshake.evaluation_window_ends_at) {
    const parsed = new Date(handshake.evaluation_window_ends_at).getTime();
    if (!Number.isNaN(parsed)) deadlineMs = parsed;
  }

  if (deadlineMs == null) {
    const startIso = handshake.evaluation_window_starts_at ?? handshake.updated_at ?? handshake.created_at;
    const parsedStart = new Date(startIso).getTime();
    if (!Number.isNaN(parsedStart)) {
      deadlineMs = parsedStart + 48 * 60 * 60 * 1000;
    }
  }

  if (deadlineMs == null) {
    return { isOpen: true, label: "48h evaluation window active" };
  }

  const msLeft = deadlineMs - Date.now();
  if (msLeft <= 0) {
    return { isOpen: false, label: "Evaluation window closed" };
  }

  const totalMinutes = Math.ceil(msLeft / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return { isOpen: true, label: `${hours}h ${minutes}m left to evaluate` };
}

function getMapPreviewUrl(service: Service): string | null {
  const token = getMapboxToken();
  const lat = Number(service.location_lat);
  const lng = Number(service.location_lng);
  if (!token || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+22c55e(${lng},${lat})/${lng},${lat},13/800x400@2x?access_token=${token}`;
}

function getReportKey(userId: string, suffix: string) {
  return `reported:${userId}:${suffix}`;
}

function getHandshakeRequesterName(handshake: Handshake): string {
  const requesterName = (handshake as Record<string, unknown>).requester_name;
  if (typeof requesterName === "string" && requesterName.trim()) {
    return requesterName.trim();
  }
  return getDisplayNameFromUnknown(handshake.requester);
}

function upsertHandshake(list: Handshake[], next: Handshake): Handshake[] {
  const existingIndex = list.findIndex((item) => item.id === next.id);
  if (existingIndex === -1) return [next, ...list];
  const clone = [...list];
  clone[existingIndex] = next;
  return clone;
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
  const { user: currentUser, isAuthenticated, refreshUser } = useAuth();

  const styles = useMemo(
    () => getStyles(insets.top, insets.bottom),
    [insets.top, insets.bottom],
  );

  const { id } = route.params;
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interestLoading, setInterestLoading] = useState(false);
  const [ownerActionLoading, setOwnerActionLoading] = useState<string | null>(null);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [modalInitialIndex, setModalInitialIndex] = useState(0);

  const [serviceHandshakes, setServiceHandshakes] = useState<Handshake[]>([]);
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [showListingReportModal, setShowListingReportModal] = useState(false);
  const [selectedParticipantReport, setSelectedParticipantReport] = useState<Handshake | null>(null);
  const [reportedListing, setReportedListing] = useState(false);
  const [reportedParticipantIds, setReportedParticipantIds] = useState<Record<string, boolean>>({});
  const [commentRefreshKey, setCommentRefreshKey] = useState(0);
  const [showEventDetailModal, setShowEventDetailModal] = useState(false);
  const [eventDetailModalTab, setEventDetailModalTab] =
    useState<EventDetailModalTab>("details");
  const [eventActionLoading, setEventActionLoading] = useState(false);
  const [markingAttendedId, setMarkingAttendedId] = useState<string | null>(null);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [qrDisplayOpen, setQrDisplayOpen] = useState(false);

  const sliderRef = useRef<FlatList<MediaItem>>(null);

  const loadService = useCallback(async () => {
    try {
      setError(null);
      const next = await getService(id);
      setService(next);
      return next;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load";
      setError(message);
      throw e;
    }
  }, [id]);

  const loadHandshakes = useCallback(async (targetService?: Service | null) => {
    const activeService = targetService;
    if (!activeService || !isAuthenticated) {
      setServiceHandshakes([]);
      return [] as Handshake[];
    }
    try {
      const res = await listHandshakes({ page_size: 200 });
      const filtered = res.results.filter((h) => getIdFromField(h.service) === activeService.id);
      setServiceHandshakes(filtered);
      return filtered;
    } catch {
      setServiceHandshakes([]);
      return [] as Handshake[];
    }
  }, [isAuthenticated]);

  const loadReportState = useCallback(async (
    targetService?: Service | null,
    handshakes: Handshake[] = [],
  ) => {
    const activeService = targetService;
    if (!activeService || !currentUser?.id) {
      setReportedListing(false);
      setReportedParticipantIds({});
      return;
    }
    try {
      const listing = await SecureStore.getItemAsync(
        getReportKey(currentUser.id, `service:${activeService.id}`),
      );
      setReportedListing(Boolean(listing));
      const reportMap: Record<string, boolean> = {};
      await Promise.all(
        handshakes.map(async (handshake) => {
          const value = await SecureStore.getItemAsync(
            getReportKey(currentUser.id, `handshake:${handshake.id}`),
          );
          if (value) reportMap[handshake.id] = true;
        }),
      );
      setReportedParticipantIds(reportMap);
    } catch {
      setReportedListing(false);
      setReportedParticipantIds({});
    }
  }, [currentUser?.id]);

  useEffect(() => {
    loadService()
      .finally(() => setLoading(false));
  }, [loadService]);

  useEffect(() => {
    if (!service) return;
    void loadHandshakes(service);
  }, [isAuthenticated, loadHandshakes, service]);

  useEffect(() => {
    if (!service) return;
    void loadReportState(service, serviceHandshakes);
  }, [currentUser?.id, loadReportState, service, serviceHandshakes]);

  const isOwner = service?.user?.id === currentUser?.id;
  const isAdmin =
    currentUser?.role === "admin" ||
    currentUser?.role === "super_admin" ||
    currentUser?.role === "moderator";
  const isEvent = service?.type === "Event";
  const isOffer = service?.type === "Offer";

  const myHandshake = useMemo(() => {
    if (!currentUser?.id) return null;
    const mine = serviceHandshakes.filter(
      (h) => getIdFromField(h.requester) === currentUser.id,
    );
    return (
      mine.find((h) => ["pending", "accepted"].includes(h.status?.toLowerCase())) ??
      mine[0] ??
      null
    );
  }, [currentUser?.id, serviceHandshakes]);

  const ownerIncomingHandshakes = useMemo(
    () =>
      serviceHandshakes.filter(
        (h) => getIdFromField(h.requester) !== currentUser?.id,
      ),
    [currentUser?.id, serviceHandshakes],
  );

  const myEventHandshake = isEvent ? myHandshake : null;
  const allEventHandshakes = isEvent ? serviceHandshakes : [];
  const eventEvaluationTarget =
    isEvent && myEventHandshake?.status?.toLowerCase() === "attended"
      ? myEventHandshake
      : null;
  const eventParticipantStatus = myEventHandshake?.status?.toLowerCase() ?? null;
  const evaluationHandshake = useMemo(() => {
    if (isEvent) return null;
    return (
      serviceHandshakes.find(
        (h) =>
          h.status?.toLowerCase() === "completed" &&
          !h.user_has_reviewed,
      ) ?? null
    );
  }, [isEvent, serviceHandshakes]);

  const evaluationWindow = getEvaluationWindowInfo(isEvent ? eventEvaluationTarget : evaluationHandshake);
  const participantCount = service?.participant_count ?? 0;
  const maxParticipants = service?.max_participants ?? 1;
  const isFull =
    maxParticipants > 0 ? participantCount >= maxParticipants : false;
  const nearlyFull =
    maxParticipants > 1 && participantCount / maxParticipants >= 0.8;
  const mapPreviewUrl = service ? getMapPreviewUrl(service) : null;
  const ownerEditLocked = useMemo(() => {
    if (!service) return false;
    if (service.type === "Event") {
      return (
        isWithinLockdownWindow(service.scheduled_time) ||
        serviceHandshakes.some((h) =>
          ["accepted", "checked_in", "attended"].includes(h.status?.toLowerCase()),
        )
      );
    }
    return serviceHandshakes.some((h) =>
      ["pending", "accepted"].includes(h.status?.toLowerCase()),
    );
  }, [service, serviceHandshakes]);
  const ownerEditLockReason = useMemo(() => {
    if (!ownerEditLocked || !service) return null;
    if (service.type === "Event" && isWithinLockdownWindow(service.scheduled_time)) {
      return "Editing is locked within 24 hours of the event.";
    }
    if (service.type === "Event") {
      return "Editing is locked because the event already has active participants.";
    }
    return "Editing is locked while there are pending or accepted handshakes.";
  }, [ownerEditLocked, service]);

  const openLogin = useCallback(() => {
    navigation.navigate("Profile", { screen: "Login" } as never);
  }, [navigation]);

  const openEventDetailModal = useCallback(
    (tab: EventDetailModalTab = "details") => {
      setEventDetailModalTab(tab);
      setShowEventDetailModal(true);
    },
    [],
  );

  const refreshAll = useCallback(async () => {
    if (!service && !loading) return;
    setRefreshing(true);
    try {
      const next = await loadService();
      const handshakes = await loadHandshakes(next);
      await loadReportState(next, handshakes);
    } finally {
      setRefreshing(false);
    }
  }, [loadHandshakes, loadReportState, loadService, loading, service]);

  const handleEvaluationSubmitted = useCallback(async () => {
    const next = await loadService();
    const handshakes = await loadHandshakes(next);
    await loadReportState(next, handshakes);
    setCommentRefreshKey((value) => value + 1);
  }, [loadHandshakes, loadReportState, loadService]);

  const openChatForHandshake = useCallback(
    (handshake: Handshake, fallbackName: string, fallbackAvatar?: string | null) => {
      if (!service) return;
      const requester = handshake.requester;
      const isRequester =
        getIdFromField(requester) === currentUser?.id;
      const otherName = isOwner
        ? getHandshakeRequesterName(handshake)
        : fallbackName;
      const otherAvatar = isOwner
        ? getAvatarFromUnknown(requester)
        : fallbackAvatar;
      const otherUserId = isOwner
        ? getIdFromField(requester)
        : service.user.id;

      navigation.navigate("Messages", {
        screen: "Chat",
        params: {
          handshakeId: handshake.id,
          otherUserName: otherName,
          otherUserId,
          otherUserAvatarUrl: otherAvatar ?? service.user.avatar_url ?? undefined,
          isProvider: Boolean((handshake as Record<string, unknown>).is_current_user_provider),
          serviceTitle: service.title,
          serviceType: service.type,
          scheduleType: service.schedule_type,
          maxParticipants: service.max_participants,
          serviceLocationType: service.location_type,
          serviceLocationArea: service.location_area,
          serviceExactLocation: service.session_exact_location,
          serviceLocationGuide: service.session_location_guide,
          serviceScheduledTime: service.scheduled_time,
          provisionedHours:
            typeof (handshake as Record<string, unknown>).provisioned_hours === "number"
              ? ((handshake as Record<string, unknown>).provisioned_hours as number)
              : Number(service.duration) || 1,
        },
      } as never);
    },
    [currentUser?.id, isOwner, navigation, service],
  );

  const handleExpressInterest = async () => {
    if (!service) return;
    if (!isAuthenticated) {
      openLogin();
      return;
    }
    setInterestLoading(true);
    try {
      const createdHandshake = await addServiceInterest(id);
      const optimisticHandshakes = upsertHandshake(serviceHandshakes, createdHandshake);
      setServiceHandshakes(optimisticHandshakes);
      Alert.alert("Success", "Your interest has been sent.", [
        {
          text: "Later",
          style: "cancel",
        },
        {
          text: "Go to Chat",
          onPress: () =>
            openChatForHandshake(
              createdHandshake,
              displayName,
              service.user.avatar_url,
            ),
        },
      ]);
      const handshakes = await loadHandshakes(service);
      await loadReportState(service, handshakes);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not send interest.";
      if (message.toLowerCase().includes("already")) {
        Alert.alert("Already requested", "You already have a handshake for this service.");
        const handshakes = await loadHandshakes(service);
        await loadReportState(service, handshakes);
      } else {
        Alert.alert("Error", message);
      }
    } finally {
      setInterestLoading(false);
    }
  };

  const handleJoinEvent = async () => {
    if (!service) return;
    if (!isAuthenticated) {
      openLogin();
      return;
    }
    setEventActionLoading(true);
    try {
      await joinEvent(service.id);
      Alert.alert("Joined!", "You've joined the event.");
      const next = await loadService();
      const handshakes = await loadHandshakes(next);
      await loadReportState(next, handshakes);
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
            const next = await loadService();
            const handshakes = await loadHandshakes(next);
            await loadReportState(next, handshakes);
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Could not leave event.");
          } finally {
            setEventActionLoading(false);
          }
        },
      },
    ]);
  };

  const handleCheckin = async (qrToken?: string) => {
    if (!myEventHandshake) return;
    setEventActionLoading(true);
    try {
      await checkinEvent(myEventHandshake.id, qrToken);
      if (qrToken) {
        setQrScannerOpen(false);
        Alert.alert("Attendance confirmed!", "You're marked as attended.");
      } else {
        Alert.alert("Checked in!", "See you there.");
      }
      const handshakes = await loadHandshakes(service);
      await loadReportState(service, handshakes);
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
      const handshakes = await loadHandshakes(service);
      await loadReportState(service, handshakes);
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
            const next = await loadService();
            const handshakes = await loadHandshakes(next);
            await loadReportState(next, handshakes);
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

  const handleDeleteService = async () => {
    if (!service) return;
    Alert.alert("Remove listing", "This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setOwnerActionLoading("delete");
          try {
            await deleteService(service.id);
            if (service.type === "Need") {
              await refreshUser();
            }
            Alert.alert("Removed", "The listing has been removed.");
            navigation.navigate("Home", { screen: "HomeFeed" } as never);
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Could not remove listing.");
          } finally {
            setOwnerActionLoading(null);
          }
        },
      },
    ]);
  };

  const handleEditService = () => {
    if (!service) return;
    if (ownerEditLocked) {
      Alert.alert("Editing locked", ownerEditLockReason ?? "This listing cannot be edited right now.");
      return;
    }
    const screen =
      service.type === "Offer"
        ? "PostOffer"
        : service.type === "Need"
          ? "PostNeed"
          : "PostEvent";
    navigation.navigate("PostService", {
      screen,
      params: { serviceId: service.id },
    } as never);
  };

  const handleSetCoverPhoto = async (mediaId: string) => {
    if (!service) return;
    try {
      setOwnerActionLoading(`cover:${mediaId}`);
      const next = await setPrimaryMedia(service.id, mediaId);
      setService(next);
      Alert.alert("Updated", "Cover photo updated.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not set cover photo.");
    } finally {
      setOwnerActionLoading(null);
    }
  };

  const handleCancelEvent = () => {
    if (!service) return;
    Alert.alert("Cancel Event", "Participants will be notified. Continue?", [
      { text: "Keep event", style: "cancel" },
      {
        text: "Cancel Event",
        style: "destructive",
        onPress: async () => {
          setEventActionLoading(true);
          try {
            await cancelEvent(service.id);
            const next = await loadService();
            const handshakes = await loadHandshakes(next);
            await loadReportState(next, handshakes);
            Alert.alert("Cancelled", "Event cancelled.");
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Could not cancel event.");
          } finally {
            setEventActionLoading(false);
          }
        },
      },
    ]);
  };

  const handleTogglePinEvent = async () => {
    if (!service) return;
    setEventActionLoading(true);
    try {
      const next = await pinEvent(service.id);
      setService(next);
      Alert.alert("Updated", next.is_pinned ? "Event pinned." : "Event unpinned.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not update pin state.");
    } finally {
      setEventActionLoading(false);
    }
  };

  const submitListingReport = useCallback(async (request: ReportModalRequest) => {
    if (!service || !currentUser?.id || reportedListing) return;
    const normalizedType =
      request.type === "no_show" ? "service_issue" : request.type;
    await reportService(service.id, {
      issue_type: normalizedType,
      description: request.description,
    });
    await SecureStore.setItemAsync(
      getReportKey(currentUser.id, `service:${service.id}`),
      "1",
    );
    setReportedListing(true);
  }, [currentUser?.id, reportedListing, service]);

  const submitParticipantReport = useCallback(async (request: ReportModalRequest) => {
    if (!selectedParticipantReport || !currentUser?.id) return;
    const reportedUserId = getIdFromField(selectedParticipantReport.requester);
    const normalizedType =
      request.type === "inappropriate_content" || request.type === "no_show"
        ? "other"
        : request.type;
    await reportHandshake(selectedParticipantReport.id, {
      issue_type: normalizedType,
      description: request.description,
      reported_user_id: reportedUserId,
    });
    await SecureStore.setItemAsync(
      getReportKey(currentUser.id, `handshake:${selectedParticipantReport.id}`),
      "1",
    );
    setReportedParticipantIds((prev) => ({
      ...prev,
      [selectedParticipantReport.id]: true,
    }));
    setSelectedParticipantReport(null);
  }, [currentUser?.id, selectedParticipantReport]);

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

  const openRequesterPublicProfile = (handshake: Handshake) => {
    const userId = getIdFromField(handshake.requester);
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
        <View style={styles.skeletonWrap}>
          <View style={styles.skeletonHero} />
          <View style={styles.skeletonCard}>
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonLineShort} />
            <View style={styles.skeletonProviderRow} />
            <View style={styles.skeletonBlock} />
            <View style={styles.skeletonBlockTall} />
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
            <View style={styles.errorActions}>
              <TouchableOpacity
                style={styles.secondaryActionButton}
                onPress={() => navigation.goBack()}
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryActionText}>Go Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryActionButton}
                onPress={() => navigation.navigate("Home", { screen: "HomeFeed" } as never)}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryActionText}>Back to Browse</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const headerColor = headerColorFor(service.id);
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
  const createdLabel = formatScheduledDateTime(service.created_at);
  const serviceStatusLower = service.status?.toLowerCase();

  const mediaItems = (service.media ?? []).filter(
    (item): item is MediaItem => Boolean(item?.file_url),
  );
  const hasMedia = mediaItems.length > 0;

  const detailItems = [
    service.duration
      ? {
          key: "duration",
          icon: "time-outline" as const,
          text: `${Number(service.duration) || service.duration} hour${Number(service.duration) === 1 ? "" : "s"}`,
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
    isEvent && service.scheduled_time
      ? {
          key: "scheduled-time",
          icon: "calendar-clear-outline" as const,
          text: formatScheduledDateTime(service.scheduled_time),
        }
      : null,
    isEvent && service.scheduled_time
      ? {
          key: "time-until",
          icon: "hourglass-outline" as const,
          text: timeUntilLabel(service.scheduled_time),
        }
      : null,
    {
      key: "participants",
      icon: "people-outline" as const,
      text:
        service.max_participants > 1
          ? `${participantCount}/${service.max_participants} participants`
          : "1 participant",
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
  const slotProgressPct = Math.max(
    0,
    Math.min(100, Math.round((participantCount / Math.max(1, maxParticipants)) * 100)),
  );
  const currentHandshakeStatus = myHandshake?.status?.toLowerCase() ?? null;
  const currentHandshakeLabel =
    currentHandshakeStatus
      ? currentHandshakeStatus.charAt(0).toUpperCase() + currentHandshakeStatus.slice(1).replace(/_/g, " ")
      : null;
  const showOpenChat = Boolean(myHandshake) && !isEvent && !isOwner;
  const disableNonEventCta =
    !isEvent &&
    (!isAuthenticated ||
      isOwner ||
      serviceStatusLower === "completed" ||
      serviceStatusLower === "cancelled" ||
      showOpenChat ||
      isFull);
  const listingReportOptions: ReportOption[] = [
    { value: "inappropriate_content", label: "Inappropriate Content" },
    { value: "spam", label: "Spam" },
    { value: "service_issue", label: "Service Issue" },
    { value: "harassment", label: "Harassment" },
    { value: "scam", label: "Scam or Fraud" },
    { value: "other", label: "Other" },
  ];
  const participantReportOptions: ReportOption[] = [
    { value: "no_show", label: "No-Show" },
    { value: "harassment", label: "Harassment" },
    { value: "scam", label: "Scam or Fraud" },
    { value: "service_issue", label: "Service Issue" },
    { value: "other", label: "Other" },
  ];
  const evaluationTarget = isEvent ? myEventHandshake : evaluationHandshake;
  const evaluationCounterpartName = isEvent
    ? service.title
    : isOwner && evaluationHandshake
      ? getDisplayNameFromUnknown(evaluationHandshake.requester)
      : displayName;

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshAll} />
        }
      >
      <StatusBar barStyle={"light-content"} />

      {hasMedia ? (
        <View style={styles.headerImageWrap}>
          <FlatList
            ref={sliderRef}
            data={mediaItems}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onSliderMomentumEnd}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                activeOpacity={0.95}
                onPress={() => openImageModal(index)}
                onLongPress={() => {
                  if (!isOwner || mediaItems[0]?.id === item.id) return;
                  Alert.alert("Set cover photo", "Use this image as the cover photo?", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Set Cover",
                      onPress: () => {
                        void handleSetCoverPhoto(item.id);
                      },
                    },
                  ]);
                }}
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
            <View style={styles.headerBadgeRow}>
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
              {isRecurring ? (
                <View style={styles.headerChip}>
                  <Ionicons name="repeat-outline" size={12} color={colors.PURPLE} />
                  <Text style={[styles.headerChipText, { color: colors.PURPLE }]}>Recurring</Text>
                </View>
              ) : null}
              {isEvent && service.is_pinned ? (
                <View style={styles.headerChip}>
                  <Ionicons name="pin" size={12} color={colors.AMBER} />
                  <Text style={[styles.headerChipText, { color: colors.AMBER }]}>Featured Event</Text>
                </View>
              ) : null}
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
            <View style={styles.headerBadgeRow}>
              <View
                style={[
                  styles.typeBadge,
                  isOffer ? styles.typeOffer : isEvent ? styles.typeEvent : styles.typeWant,
                ]}
              >
                <Text
                  style={
                    isOffer
                      ? styles.typeOfferBadgeText
                      : isEvent
                        ? styles.typeEventBadgeText
                        : styles.typeWantBadgeText
                  }
                >
                  {service.type}
                </Text>
              </View>
              {isRecurring ? (
                <View style={styles.headerChip}>
                  <Ionicons name="repeat-outline" size={12} color={colors.PURPLE} />
                  <Text style={[styles.headerChipText, { color: colors.PURPLE }]}>Recurring</Text>
                </View>
              ) : null}
              {isEvent && service.is_pinned ? (
                <View style={styles.headerChip}>
                  <Ionicons name="pin" size={12} color={colors.AMBER} />
                  <Text style={[styles.headerChipText, { color: colors.AMBER }]}>Featured Event</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.headerTitle}>{service.title}</Text>
          </View>
        </View>
      )}

      <View style={styles.contentContainer}>
        <View style={styles.contentCard}>
          <Text style={styles.serviceTitle}>{service.title}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.GRAY600} />
              <Text style={styles.metaChipText}>{service.comment_count ?? 0} review{(service.comment_count ?? 0) !== 1 ? "s" : ""}</Text>
            </View>
            <View style={styles.metaChip}>
              <Ionicons name="calendar-outline" size={13} color={colors.GRAY600} />
              <Text style={styles.metaChipText}>{createdLabel}</Text>
            </View>
          </View>

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
              {service.user.avatar_url ? (
                <Image source={{ uri: service.user.avatar_url }} style={styles.avatarImageLg} />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
              )}

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
                {service.user.bio ? (
                  <Text style={styles.userBio} numberOfLines={2}>
                    {service.user.bio}
                  </Text>
                ) : null}
                <View style={styles.providerStatsRow}>
                  <View style={styles.providerStatCard}>
                    <Text style={styles.providerStatValue}>{service.user.karma_score ?? 0}</Text>
                    <Text style={styles.providerStatLabel}>Karma</Text>
                  </View>
                  <View style={styles.providerStatCard}>
                    <Text style={styles.providerStatValue}>{formatJoinedDate(service.user.date_joined)}</Text>
                    <Text style={styles.providerStatLabel}>Member since</Text>
                  </View>
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

          {maxParticipants > 1 ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionLabel}>Availability</Text>
              <View style={[styles.progressCard, nearlyFull && styles.progressCardWarning]}>
                {nearlyFull ? (
                  <Text style={styles.nearlyFullText}>Nearly Full</Text>
                ) : null}
                <View style={styles.progressMetaRow}>
                  <Text style={styles.progressLabel}>
                    {participantCount} of {maxParticipants} spots taken
                  </Text>
                  <Text style={styles.progressLabel}>{slotProgressPct}%</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${slotProgressPct}%`,
                        backgroundColor: nearlyFull ? colors.RED : isEvent ? colors.AMBER : colors.GREEN,
                      },
                    ]}
                  />
                </View>
              </View>
            </View>
          ) : null}

          {mapPreviewUrl ? (() => {
            const joinedEvent = isEvent && myEventHandshake && ['accepted', 'checked_in', 'attended'].includes(myEventHandshake.status?.toLowerCase());
            const showExact = isOwner || joinedEvent;
            return (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionLabel}>{showExact ? 'Event Location' : 'Approximate Location'}</Text>
              {showExact && service.session_exact_location ? (
                <Text style={[styles.mapPrivacyText, { marginBottom: 6, color: colors.GRAY700, fontWeight: '500' }]}>
                  {service.session_exact_location}
                </Text>
              ) : null}
              {showExact && service.session_location_guide ? (
                <Text style={[styles.mapPrivacyText, { marginBottom: 6 }]}>
                  {service.session_location_guide}
                </Text>
              ) : null}
              <View style={styles.mapCard}>
                <Image source={{ uri: mapPreviewUrl }} style={styles.mapPreview} />
                {!showExact && (
                  <Text style={styles.mapPrivacyText}>
                    Approximate location only. Exact address is shared after acceptance.
                  </Text>
                )}
              </View>
            </View>
            );
          })() : null}

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

          {isEvent ? (
            <View style={styles.sectionBlock}>
              <TouchableOpacity
                style={styles.eventModalTrigger}
                onPress={() => openEventDetailModal(isOwner ? "participants" : "details")}
                activeOpacity={0.88}
              >
                <View style={styles.eventModalTriggerIcon}>
                  <Ionicons name="calendar-outline" size={18} color={colors.AMBER} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventModalTriggerTitle}>
                    {isOwner ? "Open Event Panel" : "View Event Details"}
                  </Text>
                  <Text style={styles.eventModalTriggerSubtitle}>
                    {isOwner
                      ? "Manage participants and review event details in one place."
                      : "See schedule, location, and event info in a dedicated panel."}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.GRAY400} />
              </TouchableOpacity>
            </View>
          ) : null}

          {!isEvent && isOwner ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionLabel}>Owner Actions</Text>
              <View style={styles.ownerActionsCard}>
                <View style={styles.ownerButtonRow}>
                  <TouchableOpacity
                    style={[
                      styles.secondaryInlineButton,
                      ownerEditLocked && styles.disabledInlineButton,
                    ]}
                    onPress={handleEditService}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="create-outline" size={16} color={colors.GRAY800} />
                    <Text style={styles.secondaryInlineButtonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.secondaryInlineButton,
                      ownerActionLoading === "delete" && styles.disabledInlineButton,
                    ]}
                    onPress={handleDeleteService}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.RED} />
                    <Text style={[styles.secondaryInlineButtonText, { color: colors.RED }]}>Remove</Text>
                  </TouchableOpacity>
                </View>
                {ownerEditLockReason ? (
                  <Text style={styles.lockReasonText}>{ownerEditLockReason}</Text>
                ) : null}

                {service.type === "Need" ? (
                  <View style={styles.needReservationNote}>
                    <Text style={styles.needReservationTitle}>Time reserved for this request</Text>
                    <Text style={styles.needReservationBody}>
                      This listing itself is your request. The reserved time appears in Time Activity;
                      incoming requests will show here only after another member offers help.
                    </Text>
                  </View>
                ) : null}

                {ownerIncomingHandshakes.length > 0 ? (
                  <View style={styles.ownerList}>
                    {ownerIncomingHandshakes.map((handshake) => {
                      const requesterId = getIdFromField(handshake.requester);
                      const requesterName = getHandshakeRequesterName(handshake);

                      return (
                        <View key={handshake.id} style={styles.ownerRequestRow}>
                          <TouchableOpacity
                            style={styles.ownerRequestMeta}
                            onPress={() => openRequesterPublicProfile(handshake)}
                            activeOpacity={0.72}
                            disabled={!requesterId}
                            accessibilityRole={requesterId ? "link" : undefined}
                            accessibilityLabel={
                              requesterId ? `View ${requesterName} profile` : undefined
                            }
                          >
                            <View style={styles.ownerRequestNameRow}>
                              <Text style={styles.ownerRequestName}>
                                {requesterName}
                              </Text>
                              {requesterId ? (
                                <Ionicons name="chevron-forward" size={15} color={colors.GRAY400} />
                              ) : null}
                            </View>
                            <Text style={styles.ownerRequestSub}>
                              {formatScheduledDateTime(handshake.created_at)} · {handshake.status}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.chatActionButton}
                            onPress={() =>
                              openChatForHandshake(
                                handshake,
                                displayName,
                                service.user.avatar_url,
                              )
                            }
                          >
                            <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.WHITE} />
                            <Text style={styles.chatActionButtonText}>Chat</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.ownerEmptyText}>No incoming requests yet.</Text>
                )}
              </View>
            </View>
          ) : null}

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
              </View>
            );

            if (status === "checked_in") return (
              <View style={styles.sectionBlock}>
                <View style={styles.attendedBanner}>
                  <Ionicons name="checkmark-done" size={20} color={colors.GREEN} />
                  <Text style={[styles.bannerText, { color: colors.GREEN, marginLeft: 10 }]}>Checked in</Text>
                </View>
              </View>
            );

            if (status === "accepted" && future) return (
              <View style={styles.sectionBlock}>
                <View style={styles.attendedBanner}>
                  <Ionicons name="calendar-outline" size={20} color={colors.GREEN} />
                  <Text style={[styles.bannerText, { color: colors.GREEN, marginLeft: 10 }]}>You've joined this event</Text>
                </View>
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

            if (service.status === "Active" && !status) return null;

            return null;
          })()}

          {/* ─── Non-event: Express Interest ─── */}
          {!isEvent && !isOwner && (
            <>
            {showOpenChat && myHandshake ? (
              <View style={styles.sectionBlock}>
                <TouchableOpacity
                  style={styles.openChatButton}
                  onPress={() => openChatForHandshake(myHandshake, displayName, service.user.avatar_url)}
                  activeOpacity={0.9}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.WHITE} />
                  <Text style={styles.ctaText}>
                    {currentHandshakeStatus === "pending" ? "View Chat (Pending)" : "Open Chat"}
                  </Text>
                </TouchableOpacity>
                {currentHandshakeLabel ? (
                  <Text style={styles.statusHelperText}>Current status: {currentHandshakeLabel}</Text>
                ) : null}
              </View>
            ) : (
            <TouchableOpacity
              style={[
                styles.ctaButton,
                disableNonEventCta && styles.disabledInlineButton,
                isOffer ? styles.offerCtaButton : styles.needCtaButton,
                interestLoading && styles.ctaDisabled,
              ]}
              onPress={handleExpressInterest}
              disabled={disableNonEventCta || interestLoading}
              activeOpacity={0.9}
            >
              {interestLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons
                    name={
                      !isAuthenticated
                        ? "log-in-outline"
                        : serviceStatusLower === "completed" || serviceStatusLower === "cancelled"
                          ? "lock-closed-outline"
                          : isFull
                            ? "people-outline"
                            : "heart-outline"
                    }
                    size={18}
                    color="#fff"
                  />
                  <Text style={styles.ctaText}>
                    {!isAuthenticated
                      ? "Log in to request"
                      : serviceStatusLower === "completed" || serviceStatusLower === "cancelled"
                        ? `Service ${service.status}`
                        : isFull
                          ? "All Slots Taken"
                          : isOffer
                            ? "Request this Service"
                            : "Offer to Help"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            )}
            {evaluationTarget && currentHandshakeStatus !== "pending" && evaluationWindow.label ? (
              <View style={styles.sectionBlock}>
                {!evaluationTarget.user_has_reviewed && evaluationWindow.isOpen ? (
                  <TouchableOpacity
                    style={styles.evaluationButton}
                    onPress={() => setShowEvaluationModal(true)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="star-outline" size={16} color={colors.WHITE} />
                    <Text style={styles.evaluationButtonText}>Leave Evaluation</Text>
                  </TouchableOpacity>
                ) : null}
                <Text style={styles.statusHelperText}>
                  {evaluationTarget.user_has_reviewed
                    ? `You already reviewed this ${isEvent ? 'event' : 'exchange'}.`
                    : evaluationWindow.label}
                </Text>
              </View>
            ) : null}
            </>
          )}

          <View style={styles.sectionBlock}>
            <ServiceCommentsSection
              serviceId={service.id}
              refreshKey={commentRefreshKey}
            />
          </View>

          {isAuthenticated && !isOwner ? (
            <View style={styles.sectionBlock}>
              <TouchableOpacity
                style={styles.reportLink}
                onPress={() => setShowListingReportModal(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="flag-outline" size={15} color={reportedListing ? colors.GRAY400 : colors.GRAY600} />
                <Text style={[styles.reportLinkText, reportedListing && styles.reportLinkTextDisabled]}>
                  {reportedListing ? "Already Reported" : "Report this listing"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>

      <ImagePreviewModal
        visible={imageModalVisible}
        images={mediaItems.map((item) => item.file_url)}
        initialIndex={modalInitialIndex}
        onClose={() => setImageModalVisible(false)}
      />

      {evaluationTarget && (
        <ChatEvaluationModal
          visible={showEvaluationModal}
          handshakeId={evaluationTarget.id}
          counterpartName={evaluationCounterpartName}
          isEventEvaluation={isEvent}
          alreadyReviewed={evaluationTarget.user_has_reviewed}
          onClose={() => setShowEvaluationModal(false)}
          onSubmitted={handleEvaluationSubmitted}
        />
      )}

      {service && isEvent ? (
        <EventDetailModal
          visible={showEventDetailModal}
          activeTab={eventDetailModalTab}
          onTabChange={setEventDetailModalTab}
          onClose={() => setShowEventDetailModal(false)}
          onOpenChat={openEventChat}
          onOpenEvaluation={() => {
            setShowEventDetailModal(false);
            setShowEvaluationModal(true);
          }}
          onJoinEvent={handleJoinEvent}
          onLeaveEvent={handleLeaveEvent}
          onCheckinEvent={() => handleCheckin()}
          onOpenQRScanner={() => setQrScannerOpen(true)}
          onShowQRCode={() => setQrDisplayOpen(true)}
          onEditEvent={handleEditService}
          onCancelEvent={handleCancelEvent}
          onTogglePinEvent={handleTogglePinEvent}
          service={service}
          handshakes={allEventHandshakes}
          isOwner={Boolean(isOwner)}
          isAdmin={Boolean(isAdmin)}
          ownerEditLocked={ownerEditLocked}
          ownerEditLockReason={ownerEditLockReason}
          canOpenChat={Boolean(isOwner || ["accepted", "checked_in", "attended"].includes(eventParticipantStatus ?? ""))}
          participantStatus={eventParticipantStatus}
          participantActionLoading={eventActionLoading}
          participantBanned={isEventBanned(currentUser?.is_organizer_banned_until)}
          participantFull={isEventFull(service.max_participants, service.participant_count ?? 0)}
          participantFuture={isFutureEvent(service.scheduled_time)}
          participantPast={isPastEvent(service.scheduled_time)}
          participantLockdown={isWithinLockdownWindow(service.scheduled_time)}
          markingHandshakeId={markingAttendedId}
          completing={eventActionLoading}
          reportedParticipantIds={reportedParticipantIds}
          eventEvaluationTarget={eventEvaluationTarget}
          onMarkAttended={handleMarkAttended}
          onOpenParticipantReport={setSelectedParticipantReport}
          onCompleteEvent={handleCompleteEvent}
        />
      ) : null}

      {service && (
        <>
          <QRScannerModal
            visible={qrScannerOpen}
            onClose={() => setQrScannerOpen(false)}
            onSubmit={(code) => handleCheckin(code)}
            loading={eventActionLoading}
          />
          <QRDisplayModal
            visible={qrDisplayOpen}
            onClose={() => setQrDisplayOpen(false)}
            serviceId={service.id}
          />
        </>
      )}

      <ReportModal
        visible={showListingReportModal}
        onClose={() => setShowListingReportModal(false)}
        onSubmit={submitListingReport}
        targetLabel="listing"
        title="Report this listing"
        subtitle="Select a reason. Moderators will review your report."
        options={listingReportOptions}
      />

      <ReportModal
        visible={Boolean(selectedParticipantReport)}
        onClose={() => setSelectedParticipantReport(null)}
        onSubmit={submitParticipantReport}
        targetLabel="participant"
        title="Report participant"
        subtitle="Select a reason. Moderators will review the report."
        options={participantReportOptions}
      />
      </ScrollView>
    </SafeAreaView>
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
    skeletonWrap: {
      flex: 1,
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    skeletonHero: {
      height: HEADER_HEIGHT,
      borderRadius: 28,
      backgroundColor: colors.GRAY200,
      marginBottom: -12,
    },
    skeletonCard: {
      backgroundColor: colors.WHITE,
      borderRadius: 28,
      padding: 18,
      shadowColor: "#0f172a",
      shadowOpacity: 0.06,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    skeletonTitle: {
      width: "72%",
      height: 28,
      borderRadius: 12,
      backgroundColor: colors.GRAY200,
      marginBottom: 12,
    },
    skeletonLineShort: {
      width: "36%",
      height: 14,
      borderRadius: 8,
      backgroundColor: colors.GRAY200,
      marginBottom: 14,
    },
    skeletonProviderRow: {
      width: "100%",
      height: 92,
      borderRadius: 18,
      backgroundColor: colors.GRAY100,
      marginBottom: 14,
    },
    skeletonBlock: {
      width: "100%",
      height: 120,
      borderRadius: 18,
      backgroundColor: colors.GRAY100,
      marginBottom: 14,
    },
    skeletonBlockTall: {
      width: "100%",
      height: 220,
      borderRadius: 18,
      backgroundColor: colors.GRAY100,
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
    errorActions: {
      flexDirection: "row",
      gap: 10,
      marginTop: 18,
    },
    primaryActionButton: {
      minHeight: 44,
      borderRadius: 12,
      backgroundColor: colors.BLUE,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 14,
    },
    primaryActionText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.WHITE,
    },
    secondaryActionButton: {
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.GRAY200,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 14,
      backgroundColor: colors.WHITE,
    },
    secondaryActionText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.GRAY700,
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
    headerBadgeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
    },
    headerChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: "rgba(255,255,255,0.92)",
    },
    headerChipText: {
      fontSize: 11,
      fontWeight: "800",
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
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 16,
    },
    metaChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.GRAY100,
    },
    metaChipText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.GRAY700,
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
    avatarImageLg: {
      width: 60,
      height: 60,
      borderRadius: 30,
      marginRight: 12,
      backgroundColor: colors.GRAY200,
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
    userBio: {
      fontSize: 13,
      color: colors.GRAY600,
      lineHeight: 19,
      marginTop: 8,
    },
    providerStatsRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 12,
    },
    providerStatCard: {
      flex: 1,
      borderRadius: 14,
      backgroundColor: colors.WHITE,
      borderWidth: 1,
      borderColor: colors.GRAY200,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    providerStatValue: {
      fontSize: 13,
      fontWeight: "800",
      color: colors.GRAY900,
    },
    providerStatLabel: {
      marginTop: 3,
      fontSize: 11,
      fontWeight: "700",
      color: colors.GRAY500,
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
    progressCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.GRAY200,
      backgroundColor: colors.WHITE,
      padding: 14,
    },
    progressCardWarning: {
      borderColor: `${colors.RED}40`,
      backgroundColor: colors.RED_LT,
    },
    nearlyFullText: {
      fontSize: 11,
      fontWeight: "800",
      color: colors.RED,
      marginBottom: 8,
    },
    progressMetaRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    progressLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.GRAY700,
    },
    progressTrack: {
      height: 10,
      borderRadius: 999,
      backgroundColor: colors.GRAY200,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      borderRadius: 999,
    },
    mapCard: {
      overflow: "hidden",
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.GRAY200,
      backgroundColor: colors.WHITE,
    },
    mapPreview: {
      width: "100%",
      height: 190,
      backgroundColor: colors.GRAY200,
    },
    mapPrivacyText: {
      fontSize: 12,
      lineHeight: 18,
      color: colors.GRAY600,
      paddingHorizontal: 12,
      paddingVertical: 10,
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

    eventModalTrigger: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.GRAY200,
      backgroundColor: colors.WHITE,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    eventModalTriggerIcon: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.AMBER_LT,
    },
    eventModalTriggerTitle: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.GRAY900,
    },
    eventModalTriggerSubtitle: {
      marginTop: 3,
      fontSize: 12,
      lineHeight: 18,
      color: colors.GRAY500,
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
    ownerActionsCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.GRAY200,
      backgroundColor: colors.WHITE,
      padding: 14,
    },
    ownerButtonRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 10,
    },
    secondaryInlineButton: {
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
    secondaryInlineButtonText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.GRAY800,
    },
    disabledInlineButton: {
      opacity: 0.55,
    },
    ownerList: {
      gap: 10,
      marginTop: 4,
    },
    ownerRequestRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: 14,
      backgroundColor: colors.GRAY50,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    ownerRequestMeta: {
      flex: 1,
    },
    ownerRequestNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    ownerRequestName: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.GRAY900,
    },
    ownerRequestSub: {
      marginTop: 4,
      fontSize: 12,
      color: colors.GRAY500,
    },
    ownerEmptyText: {
      fontSize: 13,
      color: colors.GRAY500,
    },
    needReservationNote: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: `${colors.BLUE}22`,
      backgroundColor: colors.BLUE_LT,
      paddingHorizontal: 12,
      paddingVertical: 11,
      marginBottom: 10,
    },
    needReservationTitle: {
      fontSize: 12,
      fontWeight: "800",
      color: colors.BLUE,
    },
    needReservationBody: {
      marginTop: 4,
      fontSize: 12,
      lineHeight: 17,
      color: colors.GRAY700,
    },
    chatActionButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 10,
      backgroundColor: colors.BLUE,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    chatActionButtonText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.WHITE,
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
      marginBottom: 10,
    },
    pinButtonText: {
      fontSize: 12,
      fontWeight: "800",
      color: colors.AMBER,
    },
    lockReasonText: {
      fontSize: 12,
      lineHeight: 18,
      color: colors.GRAY500,
      marginBottom: 10,
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
    participantReportButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      alignSelf: "flex-start",
      marginTop: 6,
    },
    participantReportText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.RED,
    },
    alreadyReportedText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.GRAY400,
      marginTop: 6,
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
    offerCtaButton: {
      backgroundColor: colors.GREEN,
    },
    needCtaButton: {
      backgroundColor: colors.BLUE,
    },
    openChatButton: {
      minHeight: 56,
      borderRadius: 16,
      backgroundColor: colors.BLUE,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
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
    statusHelperText: {
      marginTop: 10,
      fontSize: 12,
      lineHeight: 18,
      color: colors.GRAY500,
    },
    reportLink: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      alignSelf: "flex-start",
    },
    reportLinkText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.GRAY700,
    },
    reportLinkTextDisabled: {
      color: colors.GRAY400,
    },
  });
