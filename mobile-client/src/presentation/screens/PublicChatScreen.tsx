import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";

import { getService } from "../../api/services";
import { listHandshakes, type Handshake } from "../../api/handshakes";
import { normalizeRuntimeUrl } from "../../constants/env";
import { getUser } from "../../api/users";
import {
  getPublicChat,
  postPublicChat,
} from "../../api/publicChat";
import { buildEventChatWsUrl, withAuthToken } from "../../api/websocketUrls";
import { normalizeMessage } from "../../api/chatMessages";
import { useAuth } from "../../context/AuthContext";
import { colors } from "../../constants/colors";
import type { ChatMessageWithMeta } from "../../types/chatTypes";
import type { MessagesStackParamList } from "../../navigation/MessagesStack";
import { ChatInputBar } from "../components/chat/ChatInputBar";
import { ChatMessageBubble } from "../components/chat/ChatMessageBubble";
import {
  ParticipantsSheet,
  type ChatParticipantItem,
} from "../components/chat/ParticipantsSheet";

type PublicChatScreenParams = {
  roomId: string;
  roomTitle?: string;
};

type NavProps = NativeStackScreenProps<
  { PublicChat: PublicChatScreenParams },
  "PublicChat"
>;

export default function PublicChatScreen() {
  const { params } = useRoute<NavProps["route"]>();
  const navigation = useNavigation<NativeStackNavigationProp<MessagesStackParamList>>();
  const { user } = useAuth();
  const { roomId: serviceId, roomTitle = "Event chat" } = params ?? {
    roomId: "",
  };

  const [messages, setMessages] = useState<ChatMessageWithMeta[]>([]);
  const [inputText, setInputText] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [wsRoomId, setWsRoomId] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [participants, setParticipants] = useState<ChatParticipantItem[]>([]);
  const [showParticipantsSheet, setShowParticipantsSheet] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<FlatList<ChatMessageWithMeta>>(null);

  const currentUserId = user?.id ? String(user.id) : undefined;
  const currentUserEmail = user?.email;

  const getIdFromField = useCallback((value: string | object | undefined) => {
    if (!value) return undefined;
    if (typeof value === "string") return value;
    if (typeof value === "object" && "id" in value) {
      return String((value as { id: unknown }).id);
    }
    return undefined;
  }, []);

  const getHandshakeRequesterName = useCallback((handshake: Handshake) => {
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
  }, []);

  const getHandshakeAvatar = useCallback((handshake: Handshake) => {
    const requester = handshake.requester;
    if (!requester || typeof requester !== "object") return null;
    const obj = requester as Record<string, unknown>;
    return typeof obj.avatar_url === "string"
      ? normalizeRuntimeUrl(obj.avatar_url)
      : null;
  }, []);

  const openServiceDetail = useCallback(() => {
    if (!serviceId) return;
    navigation.navigate("ServiceDetail", { id: serviceId });
  }, [navigation, serviceId]);

  const openParticipantProfile = useCallback(
    (participant: ChatParticipantItem) => {
      if (!participant.id) return;
      setShowParticipantsSheet(false);
      navigation.navigate("UserPublicProfile", { userId: participant.id });
    },
    [navigation],
  );

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const dedupeMessages = useCallback((items: ChatMessageWithMeta[]) => {
    const map = new Map<string, ChatMessageWithMeta>();
    for (const item of items) {
      map.set(item.id, item);
    }
    return Array.from(map.values()).sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return aTime - bTime;
    });
  }, []);

  const loadHistory = useCallback(
    async (isRefresh = false) => {
      if (!serviceId) return;

      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        const [chatResponse, service, handshakesResponse] = await Promise.all([
          getPublicChat(serviceId),
          getService(serviceId),
          listHandshakes({ page_size: 200 }),
        ]);

        if (chatResponse.room?.id) {
          setWsRoomId(chatResponse.room.id);
        }

        const results = chatResponse.messages?.results ?? [];
        const normalized = results.map((item) =>
          normalizeMessage(item as Record<string, unknown>),
        ) as ChatMessageWithMeta[];
        setMessages(dedupeMessages(normalized));

        if (typeof service.participant_count === "number") {
          setMemberCount(service.participant_count);
        } else {
          setMemberCount(null);
        }

        const activeParticipants = handshakesResponse.results.filter((handshake) => {
          const handshakeService =
            typeof handshake.service === "string"
              ? handshake.service
              : typeof handshake.service === "object" &&
                  handshake.service &&
                  "id" in handshake.service
                ? String((handshake.service as { id: unknown }).id)
                : null;

          return (
            handshakeService === service.id &&
            ["accepted", "checked_in", "attended"].includes(
              handshake.status?.toLowerCase() ?? "",
            )
          );
        });

        const resolvedParticipants = await Promise.all(
          activeParticipants.map(async (handshake) => {
            const requesterId = getIdFromField(handshake.requester) ?? handshake.id;
            let resolvedName = getHandshakeRequesterName(handshake);
            let resolvedAvatar = getHandshakeAvatar(handshake);

            if (requesterId && (!resolvedAvatar || resolvedName === "Participant")) {
              try {
                const profile = await getUser(requesterId);
                const profileName =
                  [profile.first_name, profile.last_name]
                    .filter(Boolean)
                    .join(" ")
                    .trim();
                if (profileName) resolvedName = profileName;
                resolvedAvatar = normalizeRuntimeUrl(profile.avatar_url) ?? resolvedAvatar;
              } catch {
                // Keep handshake-derived fallback data.
              }
            }

            return {
              id: requesterId,
              name: resolvedName,
              avatarUrl: resolvedAvatar,
              subtitle:
                handshake.status?.toLowerCase() === "checked_in"
                  ? "Checked in"
                  : handshake.status?.toLowerCase() === "attended"
                    ? "Attended"
                    : "Participant",
            } satisfies ChatParticipantItem;
          }),
        );

        const nextParticipants: ChatParticipantItem[] = [
          {
            id: String(service.user.id),
            name:
              [service.user.first_name, service.user.last_name]
                .filter(Boolean)
                .join(" ")
                .trim() || "Organizer",
            avatarUrl: service.user.avatar_url,
            subtitle: "Organizer",
          },
          ...resolvedParticipants,
        ];
        setParticipants(nextParticipants);

        scrollToBottom(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load event chat.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      dedupeMessages,
      getHandshakeAvatar,
      getHandshakeRequesterName,
      getIdFromField,
      scrollToBottom,
      serviceId,
    ],
  );

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    navigation.setOptions({ headerTitle: roomTitle });
  }, [navigation, roomTitle]);

  useEffect(() => {
    if (!wsRoomId) return;

    const url = withAuthToken(buildEventChatWsUrl(wsRoomId));
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data as string) as Record<
          string,
          unknown
        >;
        const incoming =
          payload.message && typeof payload.message === "object"
            ? normalizeMessage(payload.message as Record<string, unknown>)
            : payload.type === "message" ||
                payload.body !== undefined ||
                payload.content !== undefined
              ? normalizeMessage(payload)
              : null;

        if (!incoming) return;

        setMessages((prev) => {
          const next = prev.filter(
            (item) =>
              !(
                item.pending &&
                (item.body ?? item.content ?? "").trim() ===
                  (incoming.body ?? incoming.content ?? "").trim() &&
                (item.sender_id === incoming.sender_id ||
                  item.sender === incoming.sender)
              ),
          );
          return dedupeMessages([
            ...next,
            incoming as ChatMessageWithMeta,
          ]);
        });
        scrollToBottom();
      } catch {
        // Ignore malformed WS payloads.
      }
    };

    ws.onerror = () => setError("Connection error. Pull to refresh.");
    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [dedupeMessages, scrollToBottom, wsRoomId]);

  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;
    if (!connected) {
      setError("Not connected — please wait.");
      return;
    }

    const pendingId = `pending-${Date.now()}`;
    const optimistic: ChatMessageWithMeta = {
      id: pendingId,
      body: text,
      content: text,
      created_at: new Date().toISOString(),
      sender_id: currentUserId,
      sender: currentUserEmail,
      sender_name:
        user
          ? [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
            user.email ||
            "You"
          : "You",
      pending: true,
    };

    setMessages((prev) => dedupeMessages([...prev, optimistic]));
    setInputText("");
    scrollToBottom();

    try {
      const confirmed = normalizeMessage(
        (await postPublicChat(serviceId, { body: text })) as Record<
          string,
          unknown
        >,
      ) as ChatMessageWithMeta;
      setMessages((prev) => {
        const next = prev.filter((item) => item.id !== pendingId);
        return dedupeMessages([...next, confirmed]);
      });
      scrollToBottom(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message.");
      setMessages((prev) => prev.filter((item) => item.id !== pendingId));
    }
  }, [
    connected,
    currentUserEmail,
    currentUserId,
    dedupeMessages,
    inputText,
    scrollToBottom,
    serviceId,
    user,
  ]);

  const formatTime = useCallback((value?: string) => {
    if (!value) return "";
    return new Date(value).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, []);

  const isOwnMessage = useCallback(
    (item: ChatMessageWithMeta) => {
      if (currentUserId && item.sender_id) {
        return String(currentUserId) === String(item.sender_id);
      }
      if (currentUserEmail && item.sender) {
        return currentUserEmail === item.sender;
      }
      return false;
    },
    [currentUserEmail, currentUserId],
  );

  const renderMessage = useCallback(
    ({ item, index }: { item: ChatMessageWithMeta; index: number }) => {
      const own = isOwnMessage(item);
      const previous = messages[index - 1];
      const previousOwn = previous ? isOwnMessage(previous) : false;
      const previousSenderKey = String(previous?.sender_id ?? previous?.sender ?? "");
      const currentSenderKey = String(item.sender_id ?? item.sender ?? "");
      const showAvatar =
        !own && (!previous || previousOwn || previousSenderKey !== currentSenderKey);

      return (
        <ChatMessageBubble
          item={item}
          isOwn={own}
          showAvatar={showAvatar}
          senderName={item.sender_name ?? "Member"}
          avatarUrl={item.sender_avatar_url}
          formatTime={formatTime}
        />
      );
    },
    [formatTime, isOwnMessage, messages],
  );

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerIconWrap}>
            <Ionicons name="calendar" size={18} color={colors.AMBER} />
          </View>
          <View style={styles.headerInfo}>
            <TouchableOpacity
              onPress={openServiceDetail}
              activeOpacity={0.75}
              style={styles.serviceLinkWrap}
            >
              <Text style={styles.headerTitleLink} numberOfLines={1}>
                {roomTitle}
              </Text>
              <Text style={styles.headerSubtitle}>
                {memberCount !== null
                  ? `${memberCount} participant${memberCount !== 1 ? "s" : ""} · Tap to open event`
                  : "Event chat · Tap to open event"}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.connectionIndicator}>
            <TouchableOpacity
              onPress={() => setShowParticipantsSheet(true)}
              activeOpacity={0.8}
              style={styles.participantsButton}
            >
              <Ionicons name="people-outline" size={16} color={colors.AMBER} />
              <Text style={styles.participantsButtonText}>People</Text>
            </TouchableOpacity>
            <View
              style={[
                styles.connectionDot,
                { backgroundColor: connected ? "#10B981" : colors.GRAY400 },
              ]}
            />
            <Text style={styles.connectionText}>
              {connected ? "Live" : "Connecting"}
            </Text>
          </View>
        </View>

        {error ? (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {loading && messages.length === 0 ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={colors.AMBER} />
            <Text style={styles.centerStateText}>Loading event chat...</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.listContent,
              messages.length === 0 && styles.emptyListContent,
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollToBottom(false)}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadHistory(true)}
                tintColor={colors.AMBER}
              />
            }
            ListEmptyComponent={
              <View style={styles.centerState}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={34}
                  color={colors.GRAY400}
                />
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.centerStateText}>
                  Start the event conversation by sending a message.
                </Text>
              </View>
            }
          />
        )}

        <ChatInputBar
          value={inputText}
          onChangeText={setInputText}
          onSend={sendMessage}
          placeholder={connected ? "Message event…" : "Connecting…"}
          editable={connected}
          sendDisabled={!connected || !inputText.trim()}
        />

        <ParticipantsSheet
          visible={showParticipantsSheet}
          title="Event Participants"
          subtitle={
            memberCount !== null
              ? `${memberCount} participant${memberCount !== 1 ? "s" : ""} joined this event`
              : "See who is currently in this event chat"
          }
          participants={participants}
          onClose={() => setShowParticipantsSheet(false)}
          onParticipantPress={openParticipantProfile}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.WHITE,
  },
  keyboardView: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY200,
    backgroundColor: colors.WHITE,
  },
  headerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF7ED",
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
  },
  serviceLinkWrap: {
    alignSelf: "stretch",
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.GRAY900,
  },
  headerTitleLink: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.BLUE,
    textDecorationLine: "underline",
  },
  headerSubtitle: {
    marginTop: 1,
    fontSize: 12,
    color: colors.GRAY500,
  },
  connectionIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connectionText: {
    fontSize: 12,
    color: colors.GRAY500,
  },
  participantsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.AMBER_LT,
  },
  participantsButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.AMBER,
  },
  errorBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#FEF2F2",
    borderBottomWidth: 1,
    borderBottomColor: "#FECACA",
  },
  errorText: {
    color: colors.RED,
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  centerStateText: {
    marginTop: 10,
    fontSize: 14,
    textAlign: "center",
    color: colors.GRAY500,
    lineHeight: 20,
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "700",
    color: colors.GRAY900,
  },
});
