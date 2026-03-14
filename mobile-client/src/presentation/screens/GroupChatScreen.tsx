import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { buildGroupChatWsUrl, withAuthToken } from "../../api/websocketUrls";
import { normalizeMessage, type ChatMessage } from "../../api/chatMessages";

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

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<FlatList>(null);

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
        const data = JSON.parse(event.data as string);
        if (Array.isArray(data)) {
          setMessages((prev) => [
            ...prev,
            ...data.map((m: Record<string, unknown>) => normalizeMessage(m)),
          ]);
        } else if (data.type === "message" || data.body !== undefined || data.content !== undefined) {
          setMessages((prev) => [...prev, normalizeMessage(data)]);
        } else if (data.messages && Array.isArray(data.messages)) {
          setMessages(data.messages.map((m: Record<string, unknown>) => normalizeMessage(m)));
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          normalizeMessage({
            id: `raw-${Date.now()}`,
            body: typeof event.data === "string" ? event.data : JSON.stringify(event.data),
            created_at: new Date().toISOString(),
          }),
        ]);
      }
    };

    ws.onerror = () => setError("Connection error");
    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [groupId]);

  useEffect(() => {
    navigation.setOptions({ headerTitle: groupTitle });
  }, [navigation, groupTitle]);

  const sendMessage = useCallback(() => {
    const text = inputText.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "message", content: text }));
    setInputText("");
  }, [inputText]);

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <View style={styles.messageBubble}>
        {item.sender_name ? (
          <Text style={styles.senderName}>{item.sender_name}</Text>
        ) : null}
        <Text style={styles.messageText}>{item.body || item.content || ""}</Text>
        <Text style={styles.messageTime}>
          {item.created_at
            ? new Date(item.created_at).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })
            : ""}
        </Text>
      </View>
    ),
    []
  );

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {error ? (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {!connected && !error ? (
          <View style={styles.connecting}>
            <ActivityIndicator size="small" />
            <Text style={styles.connectingText}>Connecting…</Text>
          </View>
        ) : null}
        <FlatList
          ref={listRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
        />
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Message…"
            placeholderTextColor="#999"
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={sendMessage}
            returnKeyType="send"
            editable={connected}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !connected && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!connected || !inputText.trim()}
          >
            <Text style={styles.sendBtnText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  keyboardView: {
    flex: 1,
  },
  errorBar: {
    backgroundColor: "#fee",
    padding: 8,
    alignItems: "center",
  },
  errorText: {
    color: "#c00",
    fontSize: 14,
  },
  connecting: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    gap: 8,
  },
  connectingText: {
    fontSize: 14,
    color: "#666",
  },
  listContent: {
    padding: 12,
    paddingBottom: 8,
  },
  messageBubble: {
    maxWidth: "85%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  senderName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  messageText: {
    fontSize: 16,
    color: "#111",
  },
  messageTime: {
    fontSize: 11,
    color: "#888",
    marginTop: 4,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    paddingBottom: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: "#f0f0f0",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: "#000",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: "#999",
  },
  sendBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
});
