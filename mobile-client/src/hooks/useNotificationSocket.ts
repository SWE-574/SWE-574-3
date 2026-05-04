import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { buildNotificationWsUrl, withAuthToken } from '../api/websocketUrls';
import { useAuth } from '../context/AuthContext';
import { useNotificationStore } from '../store/useNotificationStore';
import { useToastStore } from '../store/useToastStore';

const MAX_RECONNECT_ATTEMPTS = 5;
const MAX_RECONNECT_DELAY = 30_000;

export function useNotificationSocket() {
  const { isAuthenticated } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(true);

  const connect = useCallback(() => {
    if (!enabledRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const url = withAuthToken(buildNotificationWsUrl());
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      useNotificationStore.getState().fetchUnreadCount();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'notification' && data.notification) {
          const n = data.notification;
          useNotificationStore.getState().addNotification(n);
          useToastStore.getState().push({
            id: String(n.id),
            title: n.title ?? 'New notification',
            body: n.message,
            payload: n.type
              ? {
                  type: n.type,
                  notification_id: n.id,
                  related_handshake: n.related_handshake ?? null,
                  related_service: n.related_service ?? null,
                }
              : undefined,
          });
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = (event) => {
      wsRef.current = null;
      if (event.code === 1000 || event.code >= 4000) return;
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!enabledRef.current) return;
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) return;

    const attempt = reconnectAttemptsRef.current;
    const delay = Math.min(1000 * Math.pow(2, attempt), MAX_RECONNECT_DELAY);
    reconnectAttemptsRef.current = attempt + 1;

    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [connect]);

  const disconnect = useCallback(() => {
    enabledRef.current = false;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close(1000);
      wsRef.current = null;
    }
  }, []);

  // Connect/disconnect based on auth state
  useEffect(() => {
    if (isAuthenticated) {
      enabledRef.current = true;
      reconnectAttemptsRef.current = 0;
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, connect, disconnect]);

  // Reconnect when app returns to foreground
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const ws = wsRef.current;
        if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          enabledRef.current = true;
          reconnectAttemptsRef.current = 0;
          connect();
        }
        useNotificationStore.getState().fetchUnreadCount();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [isAuthenticated, connect]);
}
