import { useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/useAuthStore'
import { useNotificationStore } from '@/store/useNotificationStore'
import type { Notification } from '@/types'

const MAX_RECONNECT = 5

/**
 * Connects to the ws/notifications/ WebSocket and pushes incoming
 * notifications into the Zustand store + triggers a Sonner toast.
 * Should be mounted once inside the authenticated layout.
 */
export function useNotificationSocket() {
  const { isAuthenticated, user } = useAuthStore()
  const { addNotification, fetchUnreadCount } = useNotificationStore()

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attemptsRef = useRef(0)
  const enabledRef = useRef(false)
  const connectRef = useRef<() => void>()

  const connect = useCallback(() => {
    if (!enabledRef.current) return

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${proto}://${window.location.host}/ws/notifications/`

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        attemptsRef.current = 0
        // Sync unread count on (re)connect
        fetchUnreadCount()
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string)
          if (data.type === 'notification' && data.notification) {
            const n: Notification = data.notification
            addNotification(n)
            toast(n.title, { description: n.message || undefined })
          }
        } catch {
          // ignore malformed frames
        }
      }

      ws.onclose = (event) => {
        wsRef.current = null
        const isPermanent = event.code >= 4000
        if (event.code === 1000 || isPermanent || !enabledRef.current) return

        if (attemptsRef.current < MAX_RECONNECT) {
          const delay = Math.min(1000 * 2 ** attemptsRef.current, 30_000)
          attemptsRef.current += 1
          reconnectRef.current = setTimeout(() => connectRef.current?.(), delay)
        }
      }

      ws.onerror = () => {
        // onclose will handle reconnect
      }
    } catch {
      // connection failed — let reconnect handle it
    }
  }, [addNotification, fetchUnreadCount])

  connectRef.current = connect

  const disconnect = useCallback(() => {
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current)
      reconnectRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close(1000)
      wsRef.current = null
    }
    attemptsRef.current = 0
  }, [])

  useEffect(() => {
    if (isAuthenticated && user) {
      enabledRef.current = true
      connect()
    } else {
      enabledRef.current = false
      disconnect()
    }
    return () => {
      enabledRef.current = false
      disconnect()
    }
  }, [isAuthenticated, user, connect, disconnect])
}
