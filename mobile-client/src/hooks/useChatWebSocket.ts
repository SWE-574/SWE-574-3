import { useCallback, useEffect, useRef, useState } from "react";
import { buildChatWsUrl, withAuthToken } from "../api/websocketUrls";
import type { Handshake } from "../api/handshakes";
import type { ChatMessageWithMeta } from "../types/chatTypes";

export type UseChatWebSocketParams = {
  handshakeId: string;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageWithMeta[]>>;
  setHandshake: React.Dispatch<React.SetStateAction<Handshake | null>>;
  mergeIncomingMessage: (
    prev: ChatMessageWithMeta[],
    incoming: ChatMessageWithMeta,
  ) => ChatMessageWithMeta[];
  normalizeIncomingMessage: (
    raw: Record<string, unknown>,
  ) => ChatMessageWithMeta;
  loadMessages: () => Promise<void>;
  loadHandshake: () => Promise<void>;
  scrollToBottom: (animated?: boolean) => void;
};

export function useChatWebSocket({
  handshakeId,
  setMessages,
  setHandshake,
  mergeIncomingMessage,
  normalizeIncomingMessage,
  loadMessages,
  loadHandshake,
  scrollToBottom,
}: UseChatWebSocketParams) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const openedAtRef = useRef<number>(0);
  const connectRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!handshakeId) return;

    const PING_INTERVAL_MS = 25000;

    const clearPingPongTimers = () => {
      if (pingIntervalRef.current !== null) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };

    const clearReconnectTimeout = () => {
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    const connect = () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      const url = withAuthToken(buildChatWsUrl(handshakeId));
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        openedAtRef.current = Date.now();
        setConnected(true);
        setError(null);
        setReconnectAttempts(0);
        loadMessages();
        loadHandshake();

        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
          try {
            ws.send(JSON.stringify({ type: "ping" }));
          } catch (e) {
            console.error("Ping send failed:", e);
          }
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);

          if (data?.type === "pong") {
            return;
          }

          if (data?.type === "ping") {
            try {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "pong" }));
              }
            } catch (e) {
              console.error("Pong send failed:", e);
            }
            return;
          }

          if (
            data?.type === "handshake_update" ||
            data?.type === "exchange_update" ||
            data?.type === "status_update"
          ) {
            loadHandshake();
            return;
          }

          if (
            data?.handshake &&
            typeof data.handshake === "object" &&
            data.handshake !== null
          ) {
            setHandshake(data.handshake as Handshake);
          }

          if (data?.type === "chat_message" && data.message != null) {
            const payload = data.message;
            const raw =
              typeof payload === "object" && payload !== null
                ? payload
                : {
                    id: `msg-${Date.now()}`,
                    body: String(payload),
                    created_at: new Date().toISOString(),
                  };
            const normalized = normalizeIncomingMessage(
              raw as Record<string, unknown>,
            );
            setMessages((prev) => mergeIncomingMessage(prev, normalized));
            scrollToBottom();
            return;
          }

          if (data?.type === "notification" && data.message != null) {
            const payload = data.message;
            const raw =
              typeof payload === "object" && payload !== null
                ? payload
                : {
                    id: `notif-${Date.now()}`,
                    body: String(payload),
                    created_at: new Date().toISOString(),
                  };
            const normalized = normalizeIncomingMessage(
              raw as Record<string, unknown>,
            );
            setMessages((prev) => mergeIncomingMessage(prev, normalized));
            scrollToBottom();

            if (
              /approved|accepted|confirmed|completed|cancelled|canceled|declined|denied/i.test(
                String(
                  (typeof raw === "object" && raw && "body" in raw
                    ? (raw as { body?: string }).body
                    : "") ?? "",
                ),
              )
            ) {
              loadHandshake();
            }

            return;
          }

          if (Array.isArray(data)) {
            const incoming = data.map((m: Record<string, unknown>) =>
              normalizeIncomingMessage(m),
            );

            setMessages((prev) => {
              let next = prev;
              for (const msg of incoming) {
                next = mergeIncomingMessage(next, msg);
              }
              return next;
            });

            scrollToBottom();
            return;
          }

          if (
            data.type === "message" ||
            data.body !== undefined ||
            data.content !== undefined
          ) {
            const normalized = normalizeIncomingMessage(data);
            setMessages((prev) => mergeIncomingMessage(prev, normalized));
            scrollToBottom();
            return;
          }

          if (data.messages && Array.isArray(data.messages)) {
            const normalized = data.messages.map((m: Record<string, unknown>) =>
              normalizeIncomingMessage(m),
            );

            setMessages((prev) => {
              let next = prev;
              for (const msg of normalized) {
                next = mergeIncomingMessage(next, msg);
              }
              return next;
            });

            scrollToBottom();
          }
        } catch (e) {
          console.error("ws.onmessage parse error:", e, event.data);
        }
      };

      ws.onerror = () => {
        setError("Connection error");
      };

      ws.onclose = (event: { code: number }) => {
        clearPingPongTimers();
        setConnected(false);
        wsRef.current = null;

        const isPermanentRejection = event.code >= 4000;
        if (event.code === 1000 || isPermanentRejection) return;

        const openDuration = Date.now() - openedAtRef.current;
        setReconnectAttempts((prev) => {
          if (prev >= 5) return prev;
          const delay =
            openDuration < 2000
              ? 8000
              : Math.min(1000 * Math.pow(2, prev), 30_000);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connectRef.current?.();
          }, delay);
          return prev + 1;
        });
      };
    };

    connectRef.current = connect;
    connect();

    return () => {
      clearReconnectTimeout();
      clearPingPongTimers();
      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
    };
  }, [
    handshakeId,
    loadHandshake,
    loadMessages,
    mergeIncomingMessage,
    normalizeIncomingMessage,
    scrollToBottom,
    setHandshake,
    setMessages,
  ]);

  const sendMessage = useCallback((text: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify({ type: "chat_message", body: text }));
    } catch (e) {
      console.error("Send failed:", e);
      setError("Failed to send message.");
    }
  }, []);

  return {
    connected,
    error,
    setError,
    sendMessage,
    reconnectAttempts,
    wsRef,
  };
}
