import { useEffect, useRef, useState, useCallback } from 'react'

interface WebSocketMessage {
  type: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message?: any
  error?: string
}

interface UseWebSocketOptions {
  url: string
  /** Optional: when omitted/null, backend uses Cookie (same-origin). Pass for query-string auth (e.g. mobile). */
  token?: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMessage?: (message: any) => void
  onError?: (error: Event) => void
  onOpen?: () => void
  onClose?: () => void
  enabled?: boolean
}

export function useWebSocket({
  url,
  token,
  onMessage,
  onError,
  onOpen,
  onClose,
  enabled = true,
}: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openedAtRef = useRef<number>(0)
  const connectedUrlRef = useRef<string | null>(null)
  const onMessageRef = useRef(onMessage)
  const onErrorRef = useRef(onError)
  const onOpenRef = useRef(onOpen)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onMessageRef.current = onMessage
    onErrorRef.current = onError
    onOpenRef.current = onOpen
    onCloseRef.current = onClose
  }, [onMessage, onError, onOpen, onClose])

  const connect = useCallback(() => {
    if (!enabled || !url) return

    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    connectedUrlRef.current = url
    const wsUrl =
      token != null && token !== ''
        ? url.includes('?')
          ? `${url}&token=${encodeURIComponent(token)}`
          : `${url}?token=${encodeURIComponent(token)}`
        : url

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        openedAtRef.current = Date.now()
        setIsConnected(true)
        // Reset the reconnect budget only after the connection has been stable
        // for >2s, so flapping connections (open→close→open) don't keep
        // refilling credits and masking a chronically broken socket.
        if (stableTimerRef.current) clearTimeout(stableTimerRef.current)
        stableTimerRef.current = setTimeout(() => {
          setReconnectAttempts(0)
          stableTimerRef.current = null
        }, 2000)
        onOpenRef.current?.()
      }

      ws.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data as string)
          if (data.type === 'chat_message' && data.message) {
            onMessageRef.current?.(data.message)
          } else if (data.type === 'notification' && data.message) {
            onMessageRef.current?.(data.message)
          }
        } catch {
          // ignore parse errors
        }
      }

      ws.onerror = (error) => {
        onErrorRef.current?.(error)
      }

      ws.onclose = (event) => {
        setIsConnected(false)
        connectedUrlRef.current = null
        if (stableTimerRef.current) {
          clearTimeout(stableTimerRef.current)
          stableTimerRef.current = null
        }
        onCloseRef.current?.()

        // 4xxx = application-level rejection — never retry.
        const isPermanentRejection = event.code >= 4000
        if (event.code === 1000 || isPermanentRejection || !enabled) return

        // If connection was open for less than 2s, server/proxy likely closed it — use longer backoff to avoid reconnect storm.
        const openDuration = Date.now() - openedAtRef.current
        setReconnectAttempts((prev) => {
          if (prev >= 5) return prev
          const delay =
            openDuration < 2000
              ? 8000
              : Math.min(1000 * Math.pow(2, prev), 30_000)
          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, delay)
          return prev + 1
        })
      }
    } catch (error) {
      onErrorRef.current?.(error as Event)
    }
  }, [url, token, enabled])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (stableTimerRef.current) {
      clearTimeout(stableTimerRef.current)
      stableTimerRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close(1000)
      wsRef.current = null
    }
    connectedUrlRef.current = null
    setIsConnected(false)
    setReconnectAttempts(0)
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'chat_message', body: message }))
      return true
    }
    return false
  }, [])

  useEffect(() => {
    if (!enabled || !url) {
      disconnect()
      return
    }
    // Avoid opening a new connection if we're already (connecting or) connected to this url.
    if (connectedUrlRef.current === url && wsRef.current) {
      return
    }
    connect()
    return () => { disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, token, url])

  return { isConnected, sendMessage, disconnect, connect, reconnectAttempts }
}
