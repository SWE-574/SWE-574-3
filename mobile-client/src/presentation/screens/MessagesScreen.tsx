import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { type Chat, listChats } from "../../api/chats";
import { getService, listServices } from "../../api/services";
import { listHandshakes, type Handshake } from "../../api/handshakes";
import type { Service } from "../../api/types";
import type { MessagesStackParamList } from "../../navigation/MessagesStack";
import { useAuth } from "../../context/AuthContext";
import { colors } from "../../constants/colors";
import type { BottomTabParamList } from "../../navigation/BottomTabNavigator";
import Ionicons from "@expo/vector-icons/Ionicons";

type Nav = NativeStackNavigationProp<MessagesStackParamList, "MessagesList">;

const STATUS_DOT_COLOR: Record<string, string> = {
  pending: colors.AMBER,
  accepted: "#10B981",
  completed: colors.BLUE,
  cancelled: colors.GRAY400,
  denied: colors.RED,
  paused: colors.AMBER,
  reported: colors.RED,
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  completed: "Completed",
  cancelled: "Cancelled",
  denied: "Denied",
  paused: "Paused",
  reported: "Reported",
};

const ACTIVE_STATUSES = new Set(["pending", "accepted"]);
const EVENT_TAB_HANDSHAKE_STATUSES = new Set([
  "accepted",
  "checked_in",
  "attended",
  "completed",
  "cancelled",
  "no_show",
]);
const CLOSED_EVENT_LABELS = new Set(["Completed", "Cancelled"]);

function getEvaluationWindowState(chat: Chat): {
  isPending: boolean;
  isClosed: boolean;
  timeLeftLabel: string | null;
} {
  const isStandardService = chat.service_type?.toLowerCase() !== "event";
  const isEligible =
    chat.status?.toLowerCase() === "completed" &&
    isStandardService &&
    !chat.user_has_reviewed;

  if (!isEligible) {
    return { isPending: false, isClosed: false, timeLeftLabel: null };
  }

  if (chat.evaluation_window_closed_at) {
    return { isPending: false, isClosed: true, timeLeftLabel: null };
  }

  let deadlineMs: number | null = null;
  if (chat.evaluation_window_ends_at) {
    const parsed = new Date(chat.evaluation_window_ends_at).getTime();
    if (!Number.isNaN(parsed)) deadlineMs = parsed;
  } else if (chat.evaluation_window_starts_at) {
    const start = new Date(chat.evaluation_window_starts_at).getTime();
    if (!Number.isNaN(start)) deadlineMs = start + 48 * 60 * 60 * 1000;
  } else if (chat.updated_at) {
    const updatedMs = new Date(chat.updated_at).getTime();
    if (!Number.isNaN(updatedMs)) deadlineMs = updatedMs + 48 * 60 * 60 * 1000;
  }

  if (deadlineMs == null) {
    return { isPending: true, isClosed: false, timeLeftLabel: "48h window active" };
  }

  const msLeft = deadlineMs - Date.now();
  if (msLeft <= 0) {
    return { isPending: false, isClosed: true, timeLeftLabel: null };
  }

  const totalMinutes = Math.ceil(msLeft / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return {
    isPending: true,
    isClosed: false,
    timeLeftLabel: `${hours}h ${minutes}m left`,
  };
}

/** Matches web ChatPage: group room row only when at least one accepted handshake */
function isGroupChatEligible(c: Chat): boolean {
  return (c.max_participants ?? 1) > 1;
}

function isAcceptedHandshake(c: Chat): boolean {
  return c.status?.toLowerCase() === "accepted";
}

type GroupChatListEntry = {
  serviceId: string;
  serviceTitle: string;
  memberCount: number;
  previewBody: string | null;
  previewAt: string | null;
};

type ChatTab = "private" | "group" | "events";

function isServiceOwner(chat: Chat): boolean {
  const type = chat.service_type?.toLowerCase();
  const isOffer = type !== "need" && type !== "want";
  return isOffer ? !!chat.is_provider : !chat.is_provider;
}

function buildGroupChatEntries(chats: Chat[]): GroupChatListEntry[] {
  const byService = new Map<string, Chat[]>();
  for (const c of chats) {
    if (!isGroupChatEligible(c) || !c.service_id) continue;
    const list = byService.get(c.service_id) ?? [];
    list.push(c);
    byService.set(c.service_id, list);
  }

  const rows: GroupChatListEntry[] = [];
  for (const [serviceId, convs] of byService) {
    if (!convs.some(isAcceptedHandshake)) continue;

    let latest: Chat | null = null;
    let latestTs = 0;
    for (const c of convs) {
      const msgT = c.last_message?.created_at
        ? new Date(c.last_message.created_at).getTime()
        : 0;
      const upT = c.updated_at ? new Date(c.updated_at).getTime() : 0;
      const t = Math.max(msgT, upT);
      if (t >= latestTs) {
        latestTs = t;
        latest = c;
      }
    }
    const rep = latest ?? convs[0];
    const acceptedCount = convs.filter(isAcceptedHandshake).length;
    const memberCount =
      typeof rep.service_member_count === "number"
        ? rep.service_member_count
        : 1 + acceptedCount;

    rows.push({
      serviceId,
      serviceTitle: rep.service_title ?? "Group chat",
      memberCount,
      previewBody: rep.last_message?.body ?? null,
      previewAt: rep.last_message?.created_at ?? null,
    });
  }

  rows.sort((a, b) => {
    const ta = a.previewAt ? new Date(a.previewAt).getTime() : 0;
    const tb = b.previewAt ? new Date(b.previewAt).getTime() : 0;
    return tb - ta;
  });
  return rows;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

type EventChatEntry = {
  serviceId: string;
  serviceTitle: string;
  memberCount: number | null;
  previewBody: string | null;
  previewAt: string | null;
  statusLabel: string;
  relationLabel: string;
  isEvaluationPending: boolean;
  evaluationTimeLeftLabel: string | null;
};

type ListItem =
  | { kind: "sectionHeader"; label: string; count: number; id: string }
  | { kind: "closedToggle"; count: number; expanded: boolean }
  | { kind: "groupChat"; data: GroupChatListEntry }
  | { kind: "eventChat"; data: EventChatEntry }
  | { kind: "chat"; data: Chat };

function getIdFromField(value: string | object | undefined): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "id" in value) {
    return String((value as { id: unknown }).id);
  }
  return undefined;
}

function getServiceFromHandshake(value: string | object | undefined): Partial<Service> | null {
  if (!value || typeof value === "string") return null;
  return value as Partial<Service>;
}

export default function MessagesScreen() {
  const navigation = useNavigation<Nav>();
  const [chats, setChats] = useState<Chat[]>([]);
  const [eventServices, setEventServices] = useState<Service[]>([]);
  const [joinedEventServices, setJoinedEventServices] = useState<Service[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTab, setSelectedTab] = useState<ChatTab>("private");
  const [showClosedPrivate, setShowClosedPrivate] = useState(false);
  const [showClosedGroup, setShowClosedGroup] = useState(false);
  const [showClosedEvents, setShowClosedEvents] = useState(false);
  const { user } = useAuth();

  const fetchChats = useCallback(
    async (isRefresh = false) => {
      if (!user) {
        setChats([]);
        setError(null);
        return;
      }
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        const [data, ownEvents, handshakePage] = await Promise.all([
          listChats(),
          listServices({ type: "Event", user: user.id, page_size: 100 }),
          listHandshakes({ page_size: 200 }),
        ]);
        setChats(data);

        const relevantEventHandshakes = handshakePage.results.filter((handshake) =>
          EVENT_TAB_HANDSHAKE_STATUSES.has(handshake.status?.toLowerCase() ?? ""),
        );

        const ownEventList = (ownEvents.results ?? []).filter(
          (service) => service.type?.toLowerCase() === "event",
        );

        const embeddedEventServices = relevantEventHandshakes
          .map((handshake) => getServiceFromHandshake(handshake.service))
          .filter(
            (service): service is Partial<Service> & { id: string; type: string } =>
              Boolean(service?.id) &&
              typeof service?.type === "string" &&
              service.type.toLowerCase() === "event",
          );

        const handshakeEventIds = Array.from(
          new Set(
            relevantEventHandshakes
              .map((handshake) => getIdFromField(handshake.service))
              .filter((serviceId): serviceId is string => Boolean(serviceId)),
          ),
        );

        const previewEventIds = Array.from(
          new Set(
            data
              .filter(
                (chat) =>
                  chat.service_type?.toLowerCase() === "event" && Boolean(chat.service_id),
              )
              .map((chat) => chat.service_id),
          ),
        );

        const candidateEventServices: Service[] = [
          ...ownEventList,
          ...embeddedEventServices.map((service) => service as Service),
        ];

        const knownEventIds = new Set(
          candidateEventServices.map((service) => service.id).filter(Boolean),
        );

        const missingEventIds = Array.from(
          new Set([...handshakeEventIds, ...previewEventIds]),
        ).filter(
          (serviceId) => !knownEventIds.has(serviceId),
        );

        const fetchedMissingEventServices = await Promise.all(
          missingEventIds.map(async (serviceId) => {
            try {
              return await getService(serviceId);
            } catch {
              return null;
            }
          }),
        );

        const uniqueEventServices = [
          ...candidateEventServices,
          ...fetchedMissingEventServices.filter(
            (service): service is Service => Boolean(service),
          ),
        ].filter(
          (service, index, array) =>
            service.type?.toLowerCase() === "event" &&
            Boolean(service.id) &&
            array.findIndex((candidate) => candidate.id === service.id) === index,
        );

        setEventServices(
          uniqueEventServices.filter(
            (service) => String(service.user?.id ?? "") === String(user.id),
          ),
        );
        setJoinedEventServices(
          uniqueEventServices.filter(
            (service) => String(service.user?.id ?? "") !== String(user.id),
          ),
        );
      } catch (err) {
        console.error("Failed to load chats:", err);
        setError("Failed to load messages.");
        setChats([]);
        setEventServices([]);
        setJoinedEventServices([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user],
  );

  useEffect(() => {
    if (!user) {
      setChats([]);
      setEventServices([]);
      setJoinedEventServices([]);
      setError(null);
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (user) fetchChats();
    }, [user, fetchChats]),
  );

  const openChat = (item: Chat) => {
    navigation.navigate("Chat", {
      handshakeId: item.handshake_id,
      serviceId: item.service_id,
      otherUserName: item.other_user?.name ?? "Unknown",
      serviceTitle: item.service_title,
      otherUserId: item.other_user?.id,
      otherUserAvatarUrl: item.other_user?.avatar_url ?? undefined,
      isProvider: item.is_provider,
      serviceType: item.service_type,
      scheduleType: item.schedule_type,
      maxParticipants: item.max_participants,
      serviceLocationType: item.service_location_type,
      serviceLocationArea: item.service_location_area ?? null,
      serviceExactLocation: item.service_exact_location ?? null,
      serviceLocationGuide: item.service_location_guide ?? null,
      serviceScheduledTime: item.service_scheduled_time ?? null,
      provisionedHours: item.provisioned_hours,
    });
  };

  const openGroupChat = (entry: GroupChatListEntry) => {
    navigation.navigate("GroupChat", {
      groupId: entry.serviceId,
      groupTitle: entry.serviceTitle,
    });
  };

  const openEventChat = (entry: EventChatEntry) => {
    navigation.navigate("PublicChat", {
      roomId: entry.serviceId,
      roomTitle: entry.serviceTitle,
    });
  };

  const goToLogin = () => {
    const tabNav = navigation.getParent() as
      | import("@react-navigation/native").NavigationProp<BottomTabParamList>
      | undefined;
    tabNav?.navigate("Profile", { screen: "Login" });
  };

  const chatList = Array.isArray(chats) ? chats : [];
  const privateChats = chatList;
  const groupSourceChats = chatList.filter((c) => isGroupChatEligible(c));

  const activePrivateChats = privateChats.filter((c) =>
    ACTIVE_STATUSES.has(c.status?.toLowerCase()),
  );
  const evaluationPendingPrivateChats = privateChats.filter(
    (c) => getEvaluationWindowState(c).isPending,
  );
  const evaluationPendingPrivateIds = new Set(
    evaluationPendingPrivateChats.map((c) => c.handshake_id),
  );
  const closedPrivateChats = privateChats.filter(
    (c) =>
      !ACTIVE_STATUSES.has(c.status?.toLowerCase()) &&
      !evaluationPendingPrivateIds.has(c.handshake_id),
  );

  const activeGroupSourceChats = groupSourceChats.filter((c) =>
    ACTIVE_STATUSES.has(c.status?.toLowerCase()),
  );
  const closedGroupSourceChats = groupSourceChats.filter(
    (c) => !ACTIVE_STATUSES.has(c.status?.toLowerCase()),
  );

  const activeGroupEntries = buildGroupChatEntries(activeGroupSourceChats);
  const closedGroupEntries = buildGroupChatEntries(closedGroupSourceChats);

  const eventChatEntries: EventChatEntry[] = (() => {
    const previewByService = new Map<string, Chat>();
    for (const chat of chatList) {
      if (chat.service_type?.toLowerCase() !== "event" || !chat.service_id) continue;
      const current = previewByService.get(chat.service_id);
      const currentTs = current
        ? Math.max(
            current.last_message?.created_at ? new Date(current.last_message.created_at).getTime() : 0,
            current.updated_at ? new Date(current.updated_at).getTime() : 0,
          )
        : 0;
      const nextTs = Math.max(
        chat.last_message?.created_at ? new Date(chat.last_message.created_at).getTime() : 0,
        chat.updated_at ? new Date(chat.updated_at).getTime() : 0,
      );
      if (!current || nextTs >= currentTs) {
        previewByService.set(chat.service_id, chat);
      }
    }

    const rows = new Map<string, EventChatEntry>();
    const organizerEventIds = new Set(eventServices.map((service) => service.id));
    const joinedEventIds = new Set(joinedEventServices.map((service) => service.id));
    const pushEventRow = (service: Partial<Service>) => {
      if (!service.id || service.type?.toLowerCase() !== "event") return;
      const preview = previewByService.get(service.id);
      const scheduledTime = service.scheduled_time ?? null;
      const relationLabel =
        organizerEventIds.has(service.id)
          ? "Organizer"
          : joinedEventIds.has(service.id)
            ? "Joined"
            : service.user?.id === user?.id
              ? "Organizer"
              : "Joined";
      const status = preview?.status?.toLowerCase();
      const eventEvaluationPending =
        ["attended", "completed"].includes(status ?? "") &&
        !preview?.user_has_reviewed &&
        Boolean(
          preview?.evaluation_window_ends_at ||
            preview?.evaluation_window_starts_at ||
            preview?.evaluation_window_closed_at,
        );
      let evaluationTimeLeftLabel: string | null = null;
      if (eventEvaluationPending) {
        if (preview?.evaluation_window_closed_at) {
          evaluationTimeLeftLabel = null;
        } else {
          const deadlineMs = preview?.evaluation_window_ends_at
            ? new Date(preview.evaluation_window_ends_at).getTime()
            : preview?.evaluation_window_starts_at
              ? new Date(preview.evaluation_window_starts_at).getTime() + 48 * 60 * 60 * 1000
              : null;
          if (deadlineMs && !Number.isNaN(deadlineMs)) {
            const msLeft = deadlineMs - Date.now();
            if (msLeft > 0) {
              const totalMinutes = Math.ceil(msLeft / 60000);
              const hours = Math.floor(totalMinutes / 60);
              const minutes = totalMinutes % 60;
              evaluationTimeLeftLabel = `${hours}h ${minutes}m left`;
            }
          }
        }
      }
      const statusLabel =
        status === "checked_in"
          ? "Ongoing"
          : status === "attended" || service.status?.toLowerCase() === "completed"
            ? "Completed"
            : service.status?.toLowerCase() === "cancelled"
              ? "Cancelled"
              : "Upcoming";

      rows.set(service.id, {
        serviceId: service.id,
        serviceTitle: service.title ?? "Event",
        memberCount:
          typeof preview?.service_member_count === "number"
            ? preview.service_member_count
            : typeof service.participant_count === "number"
              ? service.participant_count
              : null,
        previewBody:
          preview?.last_message?.body ??
          (eventEvaluationPending
            ? "Leave your event evaluation."
            : statusLabel === "Ongoing"
              ? "Event is currently live."
              : statusLabel === "Completed"
                ? "Event completed."
                : statusLabel === "Cancelled"
                  ? "Event cancelled."
                  : scheduledTime
                    ? `Starts ${timeAgo(scheduledTime)}`
                    : "Tap to open event chat"),
        previewAt:
          preview?.last_message?.created_at ??
          preview?.updated_at ??
          scheduledTime ??
          service.created_at ??
          null,
        statusLabel,
        relationLabel,
        isEvaluationPending: eventEvaluationPending,
        evaluationTimeLeftLabel,
      });
    };

    for (const service of eventServices) {
      pushEventRow(service);
    }
    for (const service of joinedEventServices) {
      if (rows.has(service.id)) continue;
      pushEventRow(service);
    }

    return Array.from(rows.values()).sort((a, b) => {
      const ta = a.previewAt ? new Date(a.previewAt).getTime() : 0;
      const tb = b.previewAt ? new Date(b.previewAt).getTime() : 0;
      return tb - ta;
    });
  })();
  const activeEventEntries = eventChatEntries.filter(
    (entry) => !CLOSED_EVENT_LABELS.has(entry.statusLabel),
  );
  const closedEventEntries = eventChatEntries.filter((entry) =>
    CLOSED_EVENT_LABELS.has(entry.statusLabel),
  );

  const listData: ListItem[] = [];
  if (selectedTab === "private") {
    if (activePrivateChats.length > 0) {
      listData.push({
        kind: "sectionHeader",
        id: "header-active-private",
        label: "ACTIVE",
        count: activePrivateChats.length,
      });
      for (const c of activePrivateChats) {
        listData.push({ kind: "chat", data: c });
      }
    }
    if (evaluationPendingPrivateChats.length > 0) {
      listData.push({
        kind: "sectionHeader",
        id: "header-eval-private",
        label: "EVALUATION PENDING",
        count: evaluationPendingPrivateChats.length,
      });
      for (const c of evaluationPendingPrivateChats) {
        listData.push({ kind: "chat", data: c });
      }
    }
    if (closedPrivateChats.length > 0) {
      listData.push({
        kind: "closedToggle",
        count: closedPrivateChats.length,
        expanded: showClosedPrivate,
      });
      if (showClosedPrivate) {
        for (const c of closedPrivateChats) {
          listData.push({ kind: "chat", data: c });
        }
      }
    }
  } else if (selectedTab === "events") {
    if (activeEventEntries.length > 0) {
      listData.push({
        kind: "sectionHeader",
        id: "header-events",
        label: "ACTIVE",
        count: activeEventEntries.length,
      });
      for (const e of activeEventEntries) {
        listData.push({ kind: "eventChat", data: e });
      }
    }
    if (closedEventEntries.length > 0) {
      listData.push({
        kind: "closedToggle",
        count: closedEventEntries.length,
        expanded: showClosedEvents,
      });
      if (showClosedEvents) {
        for (const e of closedEventEntries) {
          listData.push({ kind: "eventChat", data: e });
        }
      }
    }
  } else {
    if (activeGroupEntries.length > 0) {
      listData.push({
        kind: "sectionHeader",
        id: "header-active-group",
        label: "ACTIVE",
        count: activeGroupEntries.length,
      });
      for (const g of activeGroupEntries) {
        listData.push({ kind: "groupChat", data: g });
      }
    }
    if (closedGroupEntries.length > 0) {
      listData.push({
        kind: "closedToggle",
        count: closedGroupEntries.length,
        expanded: showClosedGroup,
      });
      if (showClosedGroup) {
        for (const g of closedGroupEntries) {
          listData.push({ kind: "groupChat", data: g });
        }
      }
    }
  }

  const renderChatRow = (item: Chat) => {
    const name = item.other_user?.name ?? "Unknown";
    const avatarUrl = item.other_user?.avatar_url ?? null;
    const statusKey = item.status?.toLowerCase() ?? "";
    const evalWindow = getEvaluationWindowState(item);
    const dotColor = evalWindow.isPending
      ? colors.AMBER
      : STATUS_DOT_COLOR[statusKey] ?? colors.GRAY400;
    const statusLabel = evalWindow.isPending
      ? "Evaluation Pending"
      : STATUS_LABEL[statusKey] ?? item.status;
    const isGroup = (item.max_participants ?? 1) > 1;
    const myService = isServiceOwner(item);

    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => openChat(item)}
        activeOpacity={0.75}
      >
        <View style={styles.avatarWrap}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatar}
              accessibilityLabel={`${name} avatar`}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>
                {name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View
            style={[styles.statusDotOverlay, { backgroundColor: dotColor }]}
          />
        </View>

        <View style={styles.chatContent}>
          <View style={styles.chatHeaderRow}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {name}
            </Text>
            <View style={styles.rightMeta}>
              {myService && (
                <View style={styles.myServiceBadge}>
                  <Text style={styles.myServiceBadgeText}>MY SERVICE</Text>
                </View>
              )}
              {isGroup && (
                <View style={styles.groupBadge}>
                  <Text style={styles.groupBadgeText}>GROUP</Text>
                </View>
              )}
              {item.last_message?.created_at ? (
                <Text style={styles.itemTime}>
                  {timeAgo(item.last_message.created_at)}
                </Text>
              ) : null}
            </View>
          </View>

          {!!item.service_title && (
            <Text style={styles.serviceTitle} numberOfLines={1}>
              {item.service_title}
            </Text>
          )}

          <View style={styles.statusRow}>
            <View style={[styles.inlineStatusDot, { backgroundColor: dotColor }]} />
            <Text style={styles.statusLabel}>{statusLabel}</Text>
          </View>

          {evalWindow.isPending && evalWindow.timeLeftLabel ? (
            <Text style={styles.evaluationTimeLabel}>{evalWindow.timeLeftLabel}</Text>
          ) : null}

          <Text style={styles.itemBody} numberOfLines={1}>
            {item.last_message?.body ?? "No messages yet"}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderGroupRow = (entry: GroupChatListEntry) => (
    <TouchableOpacity
      style={styles.groupChatItem}
      onPress={() => openGroupChat(entry)}
      activeOpacity={0.75}
    >
      <View style={styles.groupChatIconWrap}>
        <Ionicons name="people" size={22} color={colors.BLUE} />
      </View>
      <View style={styles.chatContent}>
        <View style={styles.chatHeaderRow}>
          <Text style={styles.groupChatTitle} numberOfLines={1}>
            {entry.serviceTitle}
          </Text>
          <View style={styles.rightMeta}>
            <View style={styles.groupBadge}>
              <Text style={styles.groupBadgeText}>GROUP</Text>
            </View>
            {entry.previewAt ? (
              <Text style={styles.itemTime}>{timeAgo(entry.previewAt)}</Text>
            ) : null}
          </View>
        </View>
        <Text style={styles.groupChatSub} numberOfLines={1}>
          {entry.memberCount} member{entry.memberCount !== 1 ? "s" : ""} · Group
          chat
        </Text>
        <Text style={styles.itemBody} numberOfLines={1}>
          {entry.previewBody ?? "Open group chat"}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderEventRow = (entry: EventChatEntry) => (
    <TouchableOpacity
      style={styles.groupChatItem}
      onPress={() => openEventChat(entry)}
      activeOpacity={0.75}
    >
      <View style={[styles.groupChatIconWrap, { backgroundColor: "#FFF7ED" }]}>
        <Ionicons name="calendar" size={22} color={colors.AMBER} />
      </View>
      <View style={styles.chatContent}>
        <View style={styles.chatHeaderRow}>
          <Text style={styles.groupChatTitle} numberOfLines={1}>
            {entry.serviceTitle}
          </Text>
          <View style={styles.rightMeta}>
            <View style={[styles.groupBadge, { backgroundColor: "#FFF7ED" }]}>
              <Text style={[styles.groupBadgeText, { color: colors.AMBER }]}>EVENT</Text>
            </View>
            <View style={[styles.groupBadge, { backgroundColor: colors.GREEN_LT }]}>
              <Text style={[styles.groupBadgeText, { color: colors.GREEN }]}>{entry.relationLabel}</Text>
            </View>
            <View style={[styles.groupBadge, { backgroundColor: colors.GRAY100 }]}>
              <Text style={[styles.groupBadgeText, { color: colors.GRAY700 }]}>
                {entry.statusLabel}
              </Text>
            </View>
            {entry.previewAt ? (
              <Text style={styles.itemTime}>{timeAgo(entry.previewAt)}</Text>
            ) : null}
          </View>
        </View>
        <Text style={styles.groupChatSub} numberOfLines={1}>
          {entry.memberCount !== null
            ? `${entry.memberCount} participant${entry.memberCount !== 1 ? "s" : ""} · Event chat`
            : "Event chat"}
        </Text>
        {entry.isEvaluationPending && entry.evaluationTimeLeftLabel ? (
          <Text style={styles.evaluationTimeLabel}>{entry.evaluationTimeLeftLabel}</Text>
        ) : null}
        <Text style={styles.itemBody} numberOfLines={1}>
          {entry.previewBody ?? "Tap to open event chat"}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.kind === "sectionHeader") {
      return (
        <View style={styles.sectionHeader}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionHeaderText}>
            {item.label} · {item.count}
          </Text>
        </View>
      );
    }
    if (item.kind === "closedToggle") {
      return (
        <TouchableOpacity
          style={styles.closedToggle}
          onPress={() =>
            selectedTab === "private"
              ? setShowClosedPrivate((v) => !v)
              : selectedTab === "events"
                ? setShowClosedEvents((v) => !v)
              : setShowClosedGroup((v) => !v)
          }
          activeOpacity={0.7}
        >
          <View
            style={[styles.sectionDot, { backgroundColor: colors.GRAY400 }]}
          />
          <Text style={styles.closedToggleText}>
            COMPLETED / CLOSED · {item.count}
          </Text>
          <Text style={styles.closedToggleChevron}>
            {item.expanded ? "▲" : "▼"}
          </Text>
        </TouchableOpacity>
      );
    }
    if (item.kind === "groupChat") {
      return renderGroupRow(item.data);
    }
    if (item.kind === "eventChat") {
      return renderEventRow(item.data);
    }
    return renderChatRow(item.data);
  };

  const keyExtractor = (item: ListItem) => {
    if (item.kind === "sectionHeader") return item.id;
    if (item.kind === "closedToggle") return `closed-toggle-${selectedTab}`;
    if (item.kind === "groupChat") return `group-${item.data.serviceId}`;
    if (item.kind === "eventChat") return `event-${item.data.serviceId}`;
    return item.data.handshake_id;
  };

  return (
    <View style={styles.safeArea}>
      <View style={styles.screen}>
        {!user ? (
          <View style={styles.centerState}>
            <Text style={styles.stateTitle}>You are not logged in</Text>
            <Text style={styles.subheader}>
              <Text style={styles.link} onPress={goToLogin}>
                Sign in
              </Text>
              {` to see your messages`}
            </Text>
          </View>
        ) : loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={colors.GREEN} />
            <Text style={styles.subheader}>Loading messages...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Text style={styles.stateTitle}>Something went wrong</Text>
            <Text style={styles.subheader}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => fetchChats()}
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.tabsWrap}>
              <TouchableOpacity
                style={[
                  styles.tabButton,
                  selectedTab === "private" && styles.tabButtonActive,
                ]}
                onPress={() => setSelectedTab("private")}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    selectedTab === "private" && styles.tabButtonTextActive,
                  ]}
                >
                  Private · {privateChats.length}
                </Text>
                <View
                  style={[
                    styles.tabUnderline,
                    selectedTab === "private" && styles.tabUnderlineActive,
                  ]}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.tabButton,
                  selectedTab === "group" && styles.tabButtonActive,
                ]}
                onPress={() => setSelectedTab("group")}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    selectedTab === "group" && styles.tabButtonTextActive,
                  ]}
                >
                  Group · {activeGroupEntries.length + closedGroupEntries.length}
                </Text>
                <View
                  style={[
                    styles.tabUnderline,
                    selectedTab === "group" && styles.tabUnderlineActive,
                  ]}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.tabButton,
                  selectedTab === "events" && styles.tabButtonActive,
                ]}
                onPress={() => setSelectedTab("events")}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    selectedTab === "events" && styles.tabButtonTextActive,
                  ]}
                >
                  Events · {eventChatEntries.length}
                </Text>
                <View
                  style={[
                    styles.tabUnderline,
                    selectedTab === "events" && styles.tabUnderlineActive,
                  ]}
                />
              </TouchableOpacity>
            </View>

            <FlatList
              data={listData}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              contentContainerStyle={[
                styles.listContent,
                listData.length === 0 && styles.emptyListContent,
              ]}
              ItemSeparatorComponent={({ leadingItem }) =>
                leadingItem?.kind === "chat" ||
                leadingItem?.kind === "groupChat" ||
                leadingItem?.kind === "eventChat" ? (
                  <View style={styles.separator} />
                ) : null
              }
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => fetchChats(true)}
                  tintColor={colors.GREEN}
                />
              }
              ListEmptyComponent={
                <View style={styles.centerState}>
                  <Text style={styles.stateTitle}>
                    {selectedTab === "events"
                      ? "No event chats yet"
                      : selectedTab === "group"
                        ? "No group conversations yet"
                        : "No private conversations yet"}
                  </Text>
                  <Text style={styles.subheader}>
                    {selectedTab === "events"
                      ? "Join an event to access its chat."
                      : selectedTab === "group"
                        ? "Accepted multi-member services will appear here as group chats."
                        : "Express interest in a service to start chatting."}
                  </Text>
                </View>
              }
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.WHITE,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.WHITE,
  },
  tabsWrap: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 0,
    backgroundColor: colors.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY200,
  },
  tabButton: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  tabButtonActive: {
  },
  tabButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.GRAY600,
  },
  tabButtonTextActive: {
    color: colors.GREEN,
  },
  tabUnderline: {
    height: 3,
    width: "100%",
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    backgroundColor: "transparent",
  },
  tabUnderlineActive: {
    backgroundColor: colors.GREEN,
  },
  listContent: { flexGrow: 1 },
  emptyListContent: {
    flexGrow: 1,
  },
  centerState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.GRAY900,
    marginBottom: 8,
    textAlign: "center",
  },
  subheader: {
    fontSize: 15,
    color: colors.GRAY500,
    textAlign: "center",
    lineHeight: 22,
    marginTop: 4,
  },
  link: {
    color: colors.BLUE,
    textDecorationLine: "underline",
    fontWeight: "600",
  },
  separator: {
    height: 1,
    backgroundColor: colors.GRAY100,
    marginLeft: 76,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: colors.GRAY50,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY200,
  },
  sectionDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#10B981",
  },
  sectionHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.GRAY600,
    letterSpacing: 0.6,
  },
  closedToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: colors.GRAY50,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.GRAY200,
  },
  closedToggleText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: colors.GRAY500,
    letterSpacing: 0.6,
  },
  closedToggleChevron: {
    fontSize: 10,
    color: colors.GRAY400,
  },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.WHITE,
  },
  groupChatItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.BLUE_LT,
  },
  groupChatIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  groupChatTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "700",
    color: colors.BLUE,
  },
  groupChatSub: {
    fontSize: 12,
    color: colors.GRAY500,
    marginTop: 2,
  },
  avatarWrap: {
    marginRight: 12,
    position: "relative",
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.GRAY200,
  },
  avatarFallback: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.GREEN_MD,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarFallbackText: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.GREEN,
  },
  statusDotOverlay: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.WHITE,
  },
  chatContent: {
    flex: 1,
    minWidth: 0,
  },
  chatHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  itemTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "700",
    color: colors.GRAY900,
  },
  rightMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  myServiceBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: "#EFF6FF",
  },
  myServiceBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.BLUE,
    letterSpacing: 0.4,
  },
  groupBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: "#EFF6FF",
  },
  groupBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.BLUE,
    letterSpacing: 0.4,
  },
  itemTime: {
    fontSize: 11,
    color: colors.GRAY400,
  },
  serviceTitle: {
    fontSize: 12,
    color: colors.GREEN,
    marginTop: 1,
    fontWeight: "600",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 3,
  },
  inlineStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontSize: 11,
    color: colors.GRAY500,
    fontWeight: "500",
  },
  evaluationTimeLabel: {
    marginTop: 2,
    fontSize: 11,
    color: colors.AMBER,
    fontWeight: "600",
  },
  itemBody: {
    fontSize: 13,
    color: colors.GRAY400,
    lineHeight: 18,
    marginTop: 2,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: colors.GREEN,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryButtonText: {
    color: colors.WHITE,
    fontSize: 14,
    fontWeight: "600",
  },
});
