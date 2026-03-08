import { useEffect, useState } from 'react'
import { Box, Flex, Text, Spinner } from '@chakra-ui/react'
import { adminAPI } from '@/services/adminAPI'
import {
  AMBER, AMBER_LT,
  BLUE, BLUE_LT,
  GREEN, GREEN_LT,
  GRAY100, GRAY300, GRAY400, GRAY600,
  RED, RED_LT,
  WHITE,
} from '@/theme/tokens'
import { FiActivity } from 'react-icons/fi'
import type { AdminAuditLog } from '@/types'

interface AdminActivityFeedProps {
  limit?: number
}

function pillStyle(action: string): { color: string; bg: string } {
  if (action.includes('warn'))                              return { color: AMBER,  bg: AMBER_LT }
  if (action.includes('ban') || action.includes('suspend')) return { color: RED,    bg: RED_LT   }
  if (action.includes('resolve') || action.includes('dismiss')) return { color: GREEN, bg: GREEN_LT }
  if (action.includes('karma') || action.includes('adjust'))    return { color: BLUE,  bg: BLUE_LT  }
  if (action.includes('remove') || action.includes('delete'))   return { color: RED,   bg: RED_LT   }
  return { color: GRAY600, bg: GRAY100 }
}

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d < 7 ? `${d}d ago`
    : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const AdminActivityFeed = ({ limit = 15 }: AdminActivityFeedProps) => {
  const [logs, setLogs]       = useState<AdminAuditLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const result = await adminAPI.getAuditLogs(undefined, 'all', 1, limit)
        setLogs(result.results || [])
      } catch {
        setLogs([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [limit])

  if (loading) {
    return <Flex py={8} justify="center"><Spinner color={GREEN} /></Flex>
  }

  if (logs.length === 0) {
    return (
      <Flex py={6} justify="center" direction="column" align="center" gap={2}>
        <FiActivity size={18} color={GRAY300} />
        <Text fontSize="13px" color={GRAY400}>No recent activity yet.</Text>
      </Flex>
    )
  }

  return (
    <Flex direction="column">
      {logs.map((log, idx) => {
        const pill = pillStyle(log.action_type)
        const isLast = idx === logs.length - 1
        return (
          <Flex key={log.id} align="flex-start" gap={3} py="12px"
            borderBottom={isLast ? 'none' : `1px solid ${GRAY100}`}
            style={{ transition: 'background 0.12s' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#fafafa' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = WHITE }}>

            {/* Action pill + entity */}
            <Flex align="center" gap={2} flexShrink={0} w="200px">
              <Box display="inline-flex" px="7px" py="2px" borderRadius="6px" fontSize="11px" fontWeight={500}
                style={{ background: pill.bg, color: pill.color, whiteSpace: 'nowrap' }}>
                {log.action_type.replace(/_/g, ' ')}
              </Box>
              {log.target_entity && (
                <Text fontSize="11px" color={GRAY400} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {log.target_entity}
                </Text>
              )}
            </Flex>

            {/* Reason */}
            <Box flex={1} minW={0}>
              <Text fontSize="13px" color={GRAY600} lineHeight={1.5}
                style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {log.reason || `${log.action_type.replace(/_/g, ' ')} performed`}
              </Text>
              <Text fontSize="11px" color={GRAY400} mt="2px">
                {timeAgo(log.created_at)} · {log.admin_name || 'Admin'}
              </Text>
            </Box>
          </Flex>
        )
      })}
    </Flex>
  )
}

export default AdminActivityFeed
