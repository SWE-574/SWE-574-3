import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Flex, Text } from '@chakra-ui/react'
import { FiBell } from 'react-icons/fi'
import { useNotificationStore } from '@/store/useNotificationStore'
import { NotificationItem } from '@/components/NotificationItem'
import type { Notification } from '@/types'
import {
  GRAY100, GRAY200, GRAY500, GRAY800,
  GREEN, GREEN_LT, WHITE,
} from '@/theme/tokens'

const MAX_PREVIEW = 6

export function NotificationDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const {
    notifications,
    unreadCount,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotificationStore()

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Fetch latest when opening
  useEffect(() => {
    if (open) {
      fetchNotifications(1)
    }
  }, [open, fetchNotifications])

  const handleClick = useCallback(
    (notification: Notification) => {
      if (!notification.is_read) markAsRead(notification.id)
      setOpen(false)
      if (notification.related_handshake) {
        navigate(`/messages?handshake=${notification.related_handshake}`)
      } else if (notification.related_service) {
        navigate(`/service-detail/${notification.related_service}`)
      } else {
        navigate('/notifications')
      }
    },
    [markAsRead, navigate],
  )

  const handleMarkAll = useCallback(() => {
    markAllAsRead()
  }, [markAllAsRead])

  const preview = notifications.slice(0, MAX_PREVIEW)
  const badge = unreadCount > 0 ? (unreadCount > 9 ? '9+' : String(unreadCount)) : null

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Bell trigger */}
      <Box
        as="button"
        onClick={() => setOpen((v) => !v)}
        p="8px"
        borderRadius="10px"
        cursor="pointer"
        position="relative"
        display="flex"
        alignItems="center"
        style={{ color: GRAY500, transition: 'background 0.15s' }}
        onMouseEnter={(e) => {
          ;(e.currentTarget as HTMLDivElement).style.background = GRAY100
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
        }}
      >
        <FiBell size={18} />
        {badge && (
          <Box
            position="absolute"
            top="2px"
            right="2px"
            minW="16px"
            h="16px"
            borderRadius="full"
            display="flex"
            alignItems="center"
            justifyContent="center"
            fontSize="10px"
            fontWeight={700}
            lineHeight="1"
            px="4px"
            style={{ background: GREEN, color: WHITE, border: `2px solid ${WHITE}` }}
          >
            {badge}
          </Box>
        )}
      </Box>

      {/* Dropdown panel */}
      {open && (
        <Box
          position="absolute"
          right="0"
          top="calc(100% + 8px)"
          w="360px"
          maxH="480px"
          overflowY="auto"
          borderRadius="14px"
          boxShadow="0 8px 30px rgba(0,0,0,0.12)"
          zIndex={1000}
          style={{ background: WHITE, border: `1px solid ${GRAY200}` }}
        >
          {/* Header */}
          <Flex
            align="center"
            justify="space-between"
            px="16px"
            py="12px"
            style={{ borderBottom: `1px solid ${GRAY200}` }}
          >
            <Text fontSize="14px" fontWeight={700} color={GRAY800}>
              Notifications
            </Text>
            {unreadCount > 0 && (
              <Box
                as="button"
                onClick={handleMarkAll}
                fontSize="12px"
                fontWeight={600}
                px="8px"
                py="3px"
                borderRadius="6px"
                cursor="pointer"
                style={{
                  color: GREEN,
                  background: GREEN_LT,
                  transition: 'opacity 0.15s',
                }}
              >
                Mark all read
              </Box>
            )}
          </Flex>

          {/* Items */}
          <Box p="4px">
            {preview.length === 0 ? (
              <Flex align="center" justify="center" py="32px">
                <Text fontSize="13px" color={GRAY500}>
                  No notifications yet
                </Text>
              </Flex>
            ) : (
              preview.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onClick={handleClick}
                  compact
                />
              ))
            )}
          </Box>

          {/* Footer */}
          {notifications.length > 0 && (
            <Box
              as="button"
              onClick={() => {
                setOpen(false)
                navigate('/notifications')
              }}
              w="100%"
              textAlign="center"
              py="10px"
              fontSize="13px"
              fontWeight={600}
              cursor="pointer"
              style={{
                color: GREEN,
                borderTop: `1px solid ${GRAY200}`,
                transition: 'background 0.15s',
              }}
            >
              View all notifications
            </Box>
          )}
        </Box>
      )}
    </div>
  )
}
