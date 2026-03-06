import { useEffect, useState } from 'react'
import { Flex, Text, VStack, Spinner, Badge } from '@chakra-ui/react'
import { adminAPI } from '@/services/adminAPI'
import { GRAY400, GRAY500, GRAY100, GRAY50 } from '@/theme/tokens'
import type { AdminAuditLog } from '@/types'

interface AdminActivityFeedProps {
  limit?: number
}

function formatAuditAction(action: string): string {
  return action.replace(/_/g, ' ')
}

function getActionBadgeColor(action: string): string {
  if (action.includes('ban') || action.includes('warn')) return 'red'
  if (action.includes('restore') || action.includes('unban')) return 'green'
  if (action.includes('remove') || action.includes('delete')) return 'orange'
  return 'blue'
}

const AdminActivityFeed = ({ limit = 15 }: AdminActivityFeedProps) => {
  const [logs, setLogs] = useState<AdminAuditLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadLogs = async () => {
      try {
        const result = await adminAPI.getAuditLogs(undefined, 'all', 1, limit)
        setLogs(result.results || [])
      } catch (err) {
        console.error('Failed to load audit logs for activity feed:', err)
        setLogs([])
      } finally {
        setLoading(false)
      }
    }

    loadLogs()
  }, [limit])

  if (loading) {
    return (
      <Flex py={8} justify="center">
        <Spinner />
      </Flex>
    )
  }

  if (logs.length === 0) {
    return (
      <Text fontSize="sm" color={GRAY500}>
        No recent activity yet.
      </Text>
    )
  }

  return (
    <VStack gap={2} align="stretch">
      {logs.map((log) => (
        <Flex
          key={log.id}
          p={3}
          bg={GRAY50}
          borderRadius="8px"
          border={`1px solid ${GRAY100}`}
          align="flex-start"
          gap={2}
          _hover={{ bg: GRAY100 }}
          transition="background-color 0.15s"
        >
          <Flex direction="column" flex={1} gap={1}>
            <Flex align="center" gap={2}>
              <Badge colorPalette={getActionBadgeColor(log.action_type)} size="sm" textTransform="capitalize">
                {formatAuditAction(log.action_type)}
              </Badge>
              <Text fontSize="xs" color={GRAY400}>
                {log.target_entity}
              </Text>
            </Flex>
            <Text fontSize="sm" color={GRAY500}>
              {log.reason || `Action: ${formatAuditAction(log.action_type)}`}
            </Text>
            <Text fontSize="xs" color={GRAY400}>
              {new Date(log.created_at).toLocaleString()} by {log.admin_name || 'Unknown'}
            </Text>
          </Flex>
        </Flex>
      ))}
    </VStack>
  )
}

export default AdminActivityFeed
