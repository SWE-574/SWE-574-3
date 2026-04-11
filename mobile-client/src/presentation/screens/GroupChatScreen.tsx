import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { buildGroupChatWsUrl, withAuthToken } from "../../api/websocketUrls";
import { normalizeMessage } from "../../api/chatMessages";
import { getGroupChat, sendGroupChatMessage } from "../../api/chats";
import { useAuth } from "../../context/AuthContext";
import { colors } from "../../constants/colors";
import { ChatMessageBubble } from "../components/chat/ChatMessageBubble";
import { ChatInputBar } from "../components/chat/ChatInputBar";
import type { ChatMessageWithMeta } from "../../types/chatTypes";

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
  const navigation = useNavigation<NavProps["navigation"]>();
  const { groupId, groupTitle = "Group chat" } = params ?? { groupId: "" };
  const { user } = useAuth();

  const [messages, setMessages] = useState<ChatMessageWithMeta[]>([]);
  const [inputText, setInputText] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [memberCount, setMemberCount] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<FlatList<ChatMessageWithMeta>>(null);

  const currentUserId = user?.id ? String(user.id) : undefined;
  const currentUserEmail = user?.email;

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
        // Backend may return a member count on the group thread metadata
        const raw = data as unknown as Record<string, unknown>;
        if (typeof raw.service_member_count === "number") {
          setMemberCount(raw.service_member_count);
        }
        // Group chat endpoint may return messages inline
        const msgs = Array.isArray(raw.messages)
          ? (raw.messages as Record<string, unknown>[]).map(normalizeMessage)
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
    [groupId, dedupeMessages, scrollToBottom],
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
        const data = JSON.parse(event.data as string) as Record<
          string,
          unknown
        >;
        if (data.messages && Array.isArray(data.messages)) {
          const normalized = (
            data.messages as Record<string, unknown>[]
          ).map(normalizeMessage);
          setMessages((prev) => dedupeMessages([...prev, ...normalized]));
          scrollToBottom(false);
        } else if (
          data.type === "message" ||
          data.body !== undefined ||
          data.content !== undefined
        ) {
          const incoming = normalizeMessage(data);
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
        } else if (Array.isArray(data)) {
          const normalized = (data as Record<string, unknown>[]).map(
            normalizeMessage,
          );
          setMessages((prev) => dedupeMessages([...prev, ...normalized]));
          scrollToBottom(false);
        }
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
    navigation.setOptions({ headerTitle: groupTitle });
  }, [navigation, groupTitle]);

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
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        {/* Group header */}
        <View style={styles.groupHeader}>
          <View style={styles.groupIconWrap}>
            <Text style={styles.groupIconText}>
              {groupTitle.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.groupHeaderInfo}>
            <Text style={styles.groupHeaderTitle} numberOfLines={1}>
              {groupTitle}
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

        {error ? (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

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
          />
        )}

        <ChatInputBar
          value={inputText}
          onChangeText={setInputText}
          onSend={sendMessage}
          placeholder={connected ? "Message group…" : "Connecting…"}
          editable={connected}
          sendDisabled={!connected || !inputText.trim()}
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
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY200,
    gap: 10,
  },
  groupIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.BLUE_LT,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
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
    fontSize: 15,
    fontWeight: "700",
    color: colors.GRAY900,
  },
  groupHeaderSub: {
    fontSize: 12,
    color: colors.GRAY500,
    marginTop: 1,
  },
  connectionIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
  },
  connDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connText: {
    fontSize: 12,
    color: colors.GRAY500,
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
