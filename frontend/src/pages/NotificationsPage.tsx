import { useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Flex, Text } from '@chakra-ui/react'
import { FiBell } from 'react-icons/fi'
import { useNotificationStore } from '@/store/useNotificationStore'
import { NotificationItem } from '@/components/NotificationItem'
import type { Notification } from '@/types'
import {
  GRAY100, GRAY200, GRAY500, GRAY900,
  GREEN, GREEN_LT, WHITE,
} from '@/theme/tokens'

const NotificationsPage = () => {
  const navigate = useNavigate()
  const {
    notifications,
    unreadCount,
    isLoading,
    hasMore,
    currentPage,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotificationStore()

  useEffect(() => {
    fetchNotifications(1)
  }, [fetchNotifications])

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      fetchNotifications(currentPage + 1)
    }
  }, [isLoading, hasMore, currentPage, fetchNotifications])

  const handleClick = useCallback(
    (notification: Notification) => {
      if (!notification.is_read) markAsRead(notification.id)

      if (notification.type === 'new_report' && notification.related_report) {
        navigate(`/admin?tab=reports&reportId=${notification.related_report}`)
        return
      }
      if (
        notification.type === 'report_received'
        || notification.type === 'report_resolved'
        || notification.type === 'report_dismissed'
      ) {
        navigate('/profile?tab=reports')
        return
      }

      const isFeedbackNotif = notification.type === 'positive_rep'
      if (notification.related_service && isFeedbackNotif) {
        navigate(`/service-detail/${notification.related_service}`)
      } else if (notification.related_handshake) {
        navigate(`/messages?handshake=${notification.related_handshake}`)
      } else if (notification.related_service) {
        navigate(`/service-detail/${notification.related_service}`)
      }
    },
    [markAsRead, navigate],
  )

  return (
    <Box maxW="640px" mx="auto" py="32px" px="16px">
      {/* Header */}
      <Flex align="center" justify="space-between" mb="24px">
        <Flex align="center" gap="10px">
          <Text fontSize="22px" fontWeight={700} color={GRAY900}>
            Notifications
          </Text>
          {unreadCount > 0 && (
            <Flex
              align="center"
              justify="center"
              minW="22px"
              h="22px"
              borderRadius="full"
              px="6px"
              fontSize="12px"
              fontWeight={700}
              style={{ background: GREEN, color: WHITE }}
            >
              {unreadCount}
            </Flex>
          )}
        </Flex>
        {unreadCount > 0 && (
          <Box
            as="button"
            onClick={() => markAllAsRead()}
            fontSize="13px"
            fontWeight={600}
            px="12px"
            py="6px"
            borderRadius="8px"
            cursor="pointer"
            style={{
              color: GREEN,
              background: GREEN_LT,
              transition: 'opacity 0.15s',
            }}
          >
            Mark all as read
          </Box>
        )}
      </Flex>

      {/* List */}
      <Box
        borderRadius="14px"
        overflow="hidden"
        style={{ border: `1px solid ${GRAY200}`, background: WHITE }}
      >
        {notifications.length === 0 && !isLoading ? (
          <Flex
            direction="column"
            align="center"
            justify="center"
            py="64px"
            gap="12px"
          >
            <Box
              p="16px"
              borderRadius="full"
              style={{ background: GRAY100, color: GRAY500 }}
            >
              <FiBell size={28} />
            </Box>
            <Text fontSize="14px" color={GRAY500}>
              No notifications yet
            </Text>
          </Flex>
        ) : (
          <Box p="4px">
            {notifications.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onClick={handleClick}
              />
            ))}
          </Box>
        )}

        {/* Load more */}
        {hasMore && notifications.length > 0 && (
          <Box
            as="button"
            onClick={loadMore}
            w="100%"
            textAlign="center"
            py="12px"
            fontSize="13px"
            fontWeight={600}
            cursor="pointer"
            style={{
              color: GREEN,
              borderTop: `1px solid ${GRAY200}`,
              transition: 'opacity 0.15s',
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            {isLoading ? 'Loading…' : 'Load more'}
          </Box>
        )}
      </Box>

      {/* Subtle footer */}
      <Text fontSize="12px" color={GRAY500} textAlign="center" mt="16px">
        Notifications older than 90 days may be removed
      </Text>
    </Box>
  )
}

export default NotificationsPage
