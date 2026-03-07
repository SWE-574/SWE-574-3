import { memo } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import {
  FiRefreshCw,
  FiMessageSquare,
  FiStar,
  FiAlertTriangle,
  FiClock,
  FiBell,
  FiCheckCircle,
} from 'react-icons/fi'
import type { Notification, NotificationType } from '@/types'
import { GRAY100, GRAY500, GRAY700, GRAY800, GREEN_LT, GREEN } from '@/theme/tokens'

const ICON_MAP: Record<NotificationType, React.ElementType> = {
  handshake_request: FiRefreshCw,
  handshake_accepted: FiCheckCircle,
  handshake_denied: FiRefreshCw,
  handshake_cancelled: FiRefreshCw,
  service_updated: FiRefreshCw,
  chat_message: FiMessageSquare,
  positive_rep: FiStar,
  admin_warning: FiAlertTriangle,
  service_reminder: FiClock,
  service_confirmation: FiCheckCircle,
  dispute_resolved: FiCheckCircle,
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

interface NotificationItemProps {
  notification: Notification
  onClick?: (notification: Notification) => void
  compact?: boolean
}

export const NotificationItem = memo(function NotificationItem({
  notification,
  onClick,
  compact = false,
}: NotificationItemProps) {
  const Icon = ICON_MAP[notification.type] || FiBell

  return (
    <Flex
      as="button"
      onClick={() => onClick?.(notification)}
      align="flex-start"
      gap="10px"
      w="100%"
      p={compact ? '10px 12px' : '12px 16px'}
      borderRadius="10px"
      cursor="pointer"
      textAlign="left"
      style={{
        background: notification.is_read ? 'transparent' : GREEN_LT,
        transition: 'background 0.15s',
      }}
      _hover={{ bg: GRAY100 }}
    >
      <Flex
        align="center"
        justify="center"
        minW="32px"
        h="32px"
        borderRadius="8px"
        style={{
          background: notification.is_read ? GRAY100 : GREEN_LT,
          color: notification.is_read ? GRAY500 : GREEN,
        }}
      >
        <Icon size={16} />
      </Flex>

      <Box flex="1" minW={0}>
        <Text
          fontSize="13px"
          fontWeight={notification.is_read ? 400 : 600}
          color={GRAY800}
          lineClamp={compact ? 2 : undefined}
        >
          {notification.title}
        </Text>
        {!compact && notification.message && (
          <Text fontSize="12px" color={GRAY700} mt="2px" lineClamp={2}>
            {notification.message}
          </Text>
        )}
        <Text fontSize="11px" color={GRAY500} mt="2px">
          {timeAgo(notification.created_at)}
        </Text>
      </Box>

      {!notification.is_read && (
        <Box
          w="8px"
          h="8px"
          borderRadius="50%"
          mt="6px"
          flexShrink={0}
          style={{ background: GREEN }}
        />
      )}
    </Flex>
  )
})
