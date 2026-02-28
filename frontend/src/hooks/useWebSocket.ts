import { useEffect, useRef, useState, useCallback } from 'react'

interface WebSocketMessage {
  type: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message?: any
  error?: string
}

interface UseWebSocketOptions {
  url: string
  token: string | null
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
    if (!enabled || !token || !url) return

    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    const wsUrl = url.includes('?') ? `${url}&token=${token}` : `${url}?token=${token}`

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setIsConnected(true)
        setReconnectAttempts(0)
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
        onCloseRef.current?.()

        if (event.code !== 1000 && enabled) {
          setReconnectAttempts((prev) => {
            if (prev < 5) {
              const delay = Math.min(1000 * Math.pow(2, prev), 30_000)
              reconnectTimeoutRef.current = setTimeout(() => {
                connect()
              }, delay)
              return prev + 1
            }
            return prev
          })
        }
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
    if (wsRef.current) {
      wsRef.current.close(1000)
      wsRef.current = null
    }
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
    if (enabled && token && url) {
      connect()
    } else {
      disconnect()
    }
    return () => { disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, token, url])

  return { isConnected, sendMessage, disconnect, connect, reconnectAttempts }
}
