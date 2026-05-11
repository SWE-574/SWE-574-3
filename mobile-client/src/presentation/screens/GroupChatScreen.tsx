import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useRoute, useNavigation, StackActions } from "@react-navigation/native";
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { buildGroupChatWsUrl, withAuthToken } from "../../api/websocketUrls";
import { normalizeMessage } from "../../api/chatMessages";
import {
  getGroupChat,
  sendGroupChatMessage,
  type GroupChatParticipant,
} from "../../api/chats";
import { useAuth } from "../../context/AuthContext";
import { useKeyboardHeight } from "../../hooks/useKeyboardHeight";
import { colors } from "../../constants/colors";
import { ChatMessageBubble } from "../components/chat/ChatMessageBubble";
import { ChatInputBar } from "../components/chat/ChatInputBar";
import {
  ParticipantsSheet,
  type ChatParticipantItem,
} from "../components/chat/ParticipantsSheet";
import type { ChatMessageWithMeta } from "../../types/chatTypes";
import type { MessagesStackParamList } from "../../navigation/MessagesStack";

type GroupChatScreenParams = {
  groupId: string;
  groupTitle?: string;
};

type NavProps = NativeStackScreenProps<
  { GroupChat: GroupChatScreenParams },
  "GroupChat"
>;

export default function GroupChatScreen() {
  const { params } = useRoute<NavProps["route"]>();
  const navigation = useNavigation<NativeStackNavigationProp<MessagesStackParamList>>();
  const { groupId, groupTitle = "Group chat" } = params ?? { groupId: "" };
  const { user } = useAuth();
  const keyboardHeight = useKeyboardHeight();

  const [messages, setMessages] = useState<ChatMessageWithMeta[]>([]);
  const [inputText, setInputText] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [threadTitle, setThreadTitle] = useState(groupTitle);
  const [participants, setParticipants] = useState<ChatParticipantItem[]>([]);
  const [showParticipantsSheet, setShowParticipantsSheet] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<FlatList<ChatMessageWithMeta>>(null);

  const currentUserId = user?.id ? String(user.id) : undefined;
  const currentUserEmail = user?.email;

  const toParticipantItem = useCallback(
    (participant: GroupChatParticipant): ChatParticipantItem => {
      const name = participant.name?.trim() || "Member";
      return {
        id: participant.id,
        name,
        avatarUrl: participant.avatar_url,
      };
    },
    [],
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
      if (!groupId) return;
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        const data = await getGroupChat(groupId);
        if (data.service_title?.trim()) {
          setThreadTitle(data.service_title.trim());
        }
        if (Array.isArray(data.participants)) {
          setParticipants(data.participants.map(toParticipantItem));
          setMemberCount(data.participants.length);
        } else {
          setParticipants([]);
          setMemberCount(null);
        }
        const msgs = Array.isArray(data.messages)
          ? data.messages.map((item) => normalizeMessage(item))
          : [];
        if (msgs.length > 0) {
          setMessages(dedupeMessages(msgs));
          scrollToBottom(false);
        }
      } catch (e) {
        console.error("Failed to load group chat history:", e);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [groupId, dedupeMessages, scrollToBottom, toParticipantItem],
  );

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!groupId) return;
    const url = withAuthToken(buildGroupChatWsUrl(groupId));
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data as string) as Record<string, unknown>;

        // Backend sends {"type": "chat_message", "message": {...}}
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
            (m) =>
              !(
                m.pending &&
                (m.body ?? m.content ?? "").trim() ===
                  (incoming.body ?? incoming.content ?? "").trim() &&
                (m.sender_id === incoming.sender_id ||
                  m.sender === incoming.sender)
              ),
          );
          return dedupeMessages([...next, incoming]);
        });
        scrollToBottom();
      } catch {
        // Non-JSON or unexpected payload — ignore silently
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
  }, [groupId, dedupeMessages, scrollToBottom]);

  useEffect(() => {
    const isRootScreen = navigation.getState().index === 0;
    navigation.setOptions({
      headerTitle: threadTitle || groupTitle,
      headerLeft: isRootScreen ? () => (
        <TouchableOpacity
          onPress={() => navigation.dispatch(StackActions.replace("MessagesList"))}
          hitSlop={8}
          style={{ paddingRight: 8 }}
        >
          <Ionicons name="chevron-back" size={28} color="#007AFF" />
        </TouchableOpacity>
      ) : undefined,
    });
  }, [navigation, groupTitle, threadTitle]);

  const openParticipantProfile = useCallback(
    (participant: ChatParticipantItem) => {
      if (!participant.id) return;
      setShowParticipantsSheet(false);
      navigation.navigate("PublicProfile", { userId: participant.id });
    },
    [navigation],
  );

  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;
    if (!connected) {
      setError("Not connected — please wait.");
      return;
    }

    const now = new Date().toISOString();
    const pendingId = `pending-${Date.now()}`;
    const displayName = user
      ? [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
        user.email ||
        "You"
      : "You";

    const optimistic: ChatMessageWithMeta = {
      id: pendingId,
      body: text,
      content: text,
      created_at: now,
      sender_id: currentUserId,
      sender: currentUserEmail,
      sender_name: displayName,
      pending: true,
    };

    setMessages((prev) => dedupeMessages([...prev, optimistic]));
    setInputText("");
    scrollToBottom();

    try {
      const response = await sendGroupChatMessage(groupId, text);
      const confirmed = normalizeMessage(response);
      setMessages((prev) => {
        const next = prev.filter((m) => m.id !== pendingId);
        return dedupeMessages([...next, confirmed]);
      });
      scrollToBottom(false);
    } catch (e) {
      setError("Failed to send message.");
      setMessages((prev) => prev.filter((m) => m.id !== pendingId));
    }
  }, [
    inputText,
    connected,
    groupId,
    user,
    currentUserId,
    currentUserEmail,
    dedupeMessages,
    scrollToBottom,
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
    [currentUserId, currentUserEmail],
  );

  const renderMessage = useCallback(
    ({ item, index }: { item: ChatMessageWithMeta; index: number }) => {
      const own = isOwnMessage(item);
      const previous = messages[index - 1];
      const showAvatar =
        !own && (!previous || previous.sender_id !== item.sender_id);
      const senderName = item.sender_name ?? "Member";
      const avatarUrl =
        item.sender_avatar_url != null ? item.sender_avatar_url : undefined;

      return (
        <ChatMessageBubble
          item={item}
          isOwn={own}
          showAvatar={showAvatar}
          senderName={senderName}
          avatarUrl={avatarUrl}
          formatTime={formatTime}
        />
      );
    },
    [formatTime, isOwnMessage, messages],
  );

  return (
    <View style={styles.container}>
      <View style={styles.keyboardView}>
        {/* Group header */}
        <View style={styles.groupHeader}>
          <View style={styles.groupIconWrap}>
            <Text style={styles.groupIconText}>
              {groupTitle.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.groupHeaderInfo}>
            <Text style={styles.groupHeaderTitle} numberOfLines={1}>
              {threadTitle}
            </Text>
            {memberCount !== null ? (
              <Text style={styles.groupHeaderSub}>
                {memberCount} member{memberCount !== 1 ? "s" : ""}
              </Text>
            ) : (
              <Text style={styles.groupHeaderSub}>Group</Text>
            )}
          </View>
          <View style={styles.connectionIndicator}>
            <TouchableOpacity
              style={styles.participantsButton}
              onPress={() => setShowParticipantsSheet(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="people-outline" size={16} color={colors.BLUE} />
              <Text style={styles.participantsButtonText}>People</Text>
            </TouchableOpacity>
            <View style={styles.liveStatusPill}>
              <View
                style={[
                  styles.connDot,
                  { backgroundColor: connected ? "#10B981" : colors.GRAY400 },
                ]}
              />
              <Text style={styles.connText}>
                {connected ? "Live" : "Connecting"}
              </Text>
            </View>
          </View>
        </View>

        {error ? (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.messagesPane}>
          {loading && messages.length === 0 ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="large" color={colors.GREEN} />
              <Text style={styles.centerStateText}>Loading messages...</Text>
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
                  tintColor={colors.GREEN}
                />
              }
              ListEmptyComponent={
                <View style={styles.centerState}>
                  <Text style={styles.emptyTitle}>No messages yet</Text>
                  <Text style={styles.centerStateText}>
                    Start the group conversation.
                  </Text>
                </View>
              }
              ListFooterComponent={() => (
                // 46 = bar min-height, 30 = gap between bar bottom and keyboard/screen edge
                <View style={{ height: keyboardHeight + 76 }} />
              )}
            />
          )}
        </View>

        <ChatInputBar
          keyboardHeight={keyboardHeight}
          value={inputText}
          onChangeText={setInputText}
          onSend={sendMessage}
          placeholder={connected ? "Message group…" : "Connecting…"}
          editable={connected}
          sendDisabled={!connected || !inputText.trim()}
        />

        <ParticipantsSheet
          visible={showParticipantsSheet}
          title="Group Participants"
          subtitle={
            memberCount !== null
              ? `${memberCount} member${memberCount !== 1 ? "s" : ""} in this group`
              : "See who is currently in this group chat"
          }
          participants={participants}
          onClose={() => setShowParticipantsSheet(false)}
          onParticipantPress={openParticipantProfile}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.WHITE,
  },
  keyboardView: {
    flex: 1,
    backgroundColor: colors.GRAY50,
  },
  messagesPane: {
    flex: 1,
    minHeight: 0,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.WHITE,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.GRAY200,
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
  groupIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.BLUE_LT,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderWidth: 1,
    borderColor: colors.GRAY200,
  },
  groupIconText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.BLUE,
  },
  groupHeaderInfo: {
    flex: 1,
    minWidth: 0,
  },
  groupHeaderTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.GRAY900,
    letterSpacing: -0.2,
  },
  groupHeaderSub: {
    fontSize: 12,
    color: colors.GRAY500,
    marginTop: 1,
  },
  connectionIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  liveStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.GRAY50,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.GRAY200,
  },
  connDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  connText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.GRAY600,
    letterSpacing: 0.2,
  },
  participantsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.BLUE_LT,
  },
  participantsButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.BLUE,
  },
  errorBar: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: colors.RED_LT,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.GRAY200,
  },
  errorText: {
    color: colors.RED,
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 20,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  centerState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  centerStateText: {
    marginTop: 8,
    fontSize: 14,
    color: colors.GRAY500,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.GRAY900,
    marginBottom: 4,
  },
});
