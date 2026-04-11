import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  useRoute,
  useNavigation,
  type CompositeNavigationProp,
} from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { MessagesStackParamList } from "../../navigation/MessagesStack";
import type { BottomTabParamList } from "../../navigation/BottomTabNavigator";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  normalizeMessage,
  type ChatMessageApi,
  type ChatMessagesResponse,
} from "../../api/chatMessages";
import { getChat } from "../../api/chats";
import { colors } from "../../constants/colors";
import { useAuth } from "../../context/AuthContext";
import { formatStatusLabel } from "../../utils/chatUtils";
import type { Handshake } from "../../api/handshakes";
import type {
  ActionType,
  ChatMessageWithMeta,
  NavProps,
} from "../../types/chatTypes";

type ChatScreenNavigation = CompositeNavigationProp<
  NativeStackNavigationProp<MessagesStackParamList, "Chat">,
  BottomTabNavigationProp<BottomTabParamList>
>;
import { useChatWebSocket } from "../../hooks/useChatWebSocket";
import { useHandshake } from "../../hooks/useHandshake";
import { ChatMessageBubble } from "../components/chat/ChatMessageBubble";
import { ChatHandshakeBanner } from "../components/chat/ChatHandshakeBanner";
import { ChatInputBar } from "../components/chat/ChatInputBar";
import { ChatTopMeta } from "../components/chat/ChatTopMeta";

export default function ChatScreen() {
  const { params } = useRoute<NavProps["route"]>();
  const navigation = useNavigation<ChatScreenNavigation>();
  const { user } = useAuth();

  const { handshakeId, otherUserName, serviceTitle, otherUserId } = params ?? {
    handshakeId: "",
    otherUserName: "Chat",
    serviceTitle: undefined,
    otherUserId: undefined,
  };

  const [messages, setMessages] = useState<ChatMessageWithMeta[]>([]);
  const [inputText, setInputText] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [handshake, setHandshake] = useState<Handshake | null>(null);
  const [handshakeLoading, setHandshakeLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<ActionType | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const listRef = useRef<FlatList<ChatMessageWithMeta>>(null);

  const currentUserId = user?.id ? String(user.id) : undefined;
  const currentUserEmail = user?.email;

  const title = useMemo(() => otherUserName || "Messages", [otherUserName]);
  const subtitle = useMemo(() => serviceTitle ?? undefined, [serviceTitle]);

  const openOtherUserPublicProfile = useCallback(() => {
    if (!otherUserId) return;
    navigation.navigate("Profile", {
      screen: "PublicProfile",
      params: { userId: otherUserId },
    });
  }, [navigation, otherUserId]);

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const normalizeIncomingMessage = useCallback(
    (raw: Record<string, unknown>): ChatMessageWithMeta => {
      return normalizeMessage(raw) as ChatMessageWithMeta;
    },
    [],
  );

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

  const sameLogicalMessage = useCallback(
    (a: ChatMessageWithMeta, b: ChatMessageWithMeta) => {
      const aText = (a.body ?? a.content ?? "").trim();
      const bText = (b.body ?? b.content ?? "").trim();
      const sameSender =
        (!!a.sender_id && !!b.sender_id && a.sender_id === b.sender_id) ||
        (!!a.sender && !!b.sender && a.sender === b.sender);
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return sameSender && aText === bText && Math.abs(aTime - bTime) < 15000;
    },
    [],
  );

  const mergeIncomingMessage = useCallback(
    (prev: ChatMessageWithMeta[], incoming: ChatMessageWithMeta) => {
      const next = [...prev];
      const pendingIndex = next.findIndex(
        (m) => m.pending && sameLogicalMessage(m, incoming),
      );
      if (pendingIndex !== -1) {
        next[pendingIndex] = { ...incoming, pending: false };
        return dedupeMessages(next);
      }
      return dedupeMessages([...next, incoming]);
    },
    [dedupeMessages, sameLogicalMessage],
  );

  const loadMessages = useCallback(async () => {
    if (!handshakeId) return;
    try {
      setLoadingMessages(true);
      const data = (await getChat(handshakeId)) as unknown;
      const results = Array.isArray((data as { results?: unknown[] }).results)
        ? (data as ChatMessagesResponse).results
        : [];
      const normalized = results.map(
        (m: ChatMessageApi | Record<string, unknown>) =>
          normalizeIncomingMessage(m as Record<string, unknown>),
      );
      setMessages(dedupeMessages(normalized));
      scrollToBottom(false);
    } catch (e) {
      console.error("Failed to load messages:", e);
    } finally {
      setLoadingMessages(false);
    }
  }, [dedupeMessages, handshakeId, normalizeIncomingMessage, scrollToBottom]);

  const {
    handshakeStatus,
    canSendMessages,
    canApprovePending,
    canDeclinePending,
    canCancelPending,
    canConfirmCompletion,
    isAwaitingSecondConfirmationLike,
    loadHandshake,
    runHandshakeAction,
    handshakeBanner,
  } = useHandshake({
    handshakeId,
    handshake,
    setHandshake,
    handshakeLoading,
    setHandshakeLoading,
    actionLoading,
    setActionLoading,
    actionError,
    setActionError,
    currentUserId,
    currentUserEmail,
  });

  const {
    connected,
    error,
    setError,
    sendMessage: wsSendMessage,
    reconnectAttempts,
  } = useChatWebSocket({
    handshakeId,
    setMessages,
    setHandshake,
    mergeIncomingMessage,
    normalizeIncomingMessage,
    loadMessages,
    loadHandshake,
    scrollToBottom,
  });

  useEffect(() => {
    loadHandshake();
  }, [loadHandshake]);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: title,
      headerBackTitle: "Back",
    });
  }, [navigation, title]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadMessages(), loadHandshake()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadHandshake, loadMessages]);

  const sendMessage = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;

    if (!canSendMessages) {
      setError("You cannot send messages for this exchange anymore.");
      return;
    }

    if (!connected) {
      setError("Socket is not connected.");
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
      handshake_id: handshakeId,
      pending: true,
    };

    setMessages((prev) => dedupeMessages([...prev, optimistic]));
    setInputText("");
    scrollToBottom();

    try {
      wsSendMessage(text);
    } catch (e) {
      setError("Failed to send message.");
      setMessages((prev) => prev.filter((m) => m.id !== pendingId));
    }
  }, [
    inputText,
    canSendMessages,
    connected,
    user,
    currentUserId,
    currentUserEmail,
    handshakeId,
    dedupeMessages,
    scrollToBottom,
    wsSendMessage,
    setError,
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
        return currentUserId === item.sender_id;
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
      const showAvatar =
        !own && (!previous || previous.sender_id !== item.sender_id);
      const senderName = item.sender_name ?? otherUserName;
      const avatarUrl = item.sender_avatar_url;

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
    [formatTime, isOwnMessage, messages, otherUserName],
  );

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        <ChatTopMeta
          otherUserName={otherUserName}
          subtitle={subtitle}
          handshakeStatus={handshakeStatus}
          formatStatusLabel={formatStatusLabel}
          connected={connected}
          reconnectAttempts={reconnectAttempts}
          onViewProfile={
            otherUserId ? openOtherUserPublicProfile : undefined
          }
        />

        <ChatHandshakeBanner
          banner={handshakeBanner}
          canApprovePending={canApprovePending}
          canDeclinePending={canDeclinePending}
          canCancelPending={canCancelPending}
          canConfirmCompletion={canConfirmCompletion}
          isAwaitingSecondConfirmationLike={isAwaitingSecondConfirmationLike}
          actionLoading={actionLoading}
          onApprove={() => runHandshakeAction("approve")}
          onDecline={() => runHandshakeAction("decline")}
          onCancel={() => runHandshakeAction("cancel")}
          onConfirm={() => runHandshakeAction("confirm")}
        />

        {error ? (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={refreshAll}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {actionError ? (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>{actionError}</Text>
            <TouchableOpacity onPress={loadHandshake}>
              <Text style={styles.retryText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {loadingMessages && messages.length === 0 ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={colors.BLUE} />
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
              <RefreshControl refreshing={refreshing} onRefresh={refreshAll} />
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
                  {canSendMessages
                    ? "Start the conversation by sending a message."
                    : "This conversation is read-only now, but the history remains accessible."}
                </Text>
              </View>
            }
          />
        )}

        <ChatInputBar
          value={inputText}
          onChangeText={setInputText}
          onSend={sendMessage}
          placeholder={
            !connected
              ? "Connecting..."
              : canSendMessages
                ? "Type a message..."
                : "Messaging disabled for this exchange"
          }
          editable={connected && canSendMessages}
          sendDisabled={!connected || !canSendMessages || !inputText.trim()}
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
  errorBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#FEF2F2",
    borderBottomWidth: 1,
    borderBottomColor: "#FECACA",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  errorText: {
    flex: 1,
    color: colors.RED,
    fontSize: 13,
    marginRight: 12,
  },
  retryText: {
    color: colors.BLUE,
    fontSize: 13,
    fontWeight: "600",
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
    marginTop: 10,
    fontSize: 14,
    color: colors.GRAY500,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "700",
    color: colors.GRAY900 ?? "#111827",
  },
});
