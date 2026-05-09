import { Box, Button, Flex, Stack, Text } from '@chakra-ui/react'
import { Link as RouterLink } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'

import { Avatar } from '@/components/Avatar'
import type { ActivityEvent } from '@/services/activityAPI'

interface Props {
  event: ActivityEvent
}

interface VerbRender {
  story: React.ReactNode
  primaryAction: React.ReactNode | null
  secondaryAction?: React.ReactNode | null
}

function renderVerb(event: ActivityEvent): VerbRender | null {
  const actorName = `${event.actor.first_name} ${event.actor.last_name}`.trim()
  const svc = event.service
  const target = event.target_user

  switch (event.verb) {
    case 'service_created':
      if (!svc) return null
      return {
        story: (
          <>
            <strong>{actorName}</strong> posted{' '}
            <em>{svc.title}</em>
          </>
        ),
        primaryAction: (
          <RouterLink
            to={`/service-detail/${svc.id}?from=pulse_following`}
            style={{ textDecoration: 'none' }}
          >
            <Button size="sm" colorPalette="teal" variant="outline">
              View service
            </Button>
          </RouterLink>
        ),
      }

    case 'handshake_accepted': {
      if (!svc) return null
      const partnerName = target
        ? `${target.first_name} ${target.last_name}`.trim()
        : null
      return {
        story: (
          <>
            <strong>{actorName}</strong>
            {partnerName ? (
              <>
                {' '}joined <strong>{partnerName}</strong> on{' '}
              </>
            ) : (
              <> joined </>
            )}
            <em>{svc.title}</em>
          </>
        ),
        primaryAction: (
          <RouterLink
            to={`/service-detail/${svc.id}?from=pulse_following`}
            style={{ textDecoration: 'none' }}
          >
            <Button size="sm" variant="ghost">View</Button>
          </RouterLink>
        ),
      }
    }

    case 'handshake_completed': {
      if (!svc) return null
      const hrs = event.handshake_duration_hours
      return {
        story: (
          <>
            <strong>{actorName}</strong> completed{' '}
            <em>{svc.title}</em>
            {hrs ? ` · ${hrs}h exchanged` : ''}
          </>
        ),
        primaryAction: (
          <RouterLink
            to={`/service-detail/${svc.id}?from=pulse_following`}
            style={{ textDecoration: 'none' }}
          >
            <Button size="sm" variant="ghost">View</Button>
          </RouterLink>
        ),
        secondaryAction: (
          <RouterLink
            to={`/dashboard?similar_to=${svc.id}`}
            style={{ textDecoration: 'none' }}
          >
            <Button size="sm" variant="outline">
              Try similar
            </Button>
          </RouterLink>
        ),
      }
    }

    case 'user_followed': {
      if (!target) return null
      const targetName = `${target.first_name} ${target.last_name}`.trim()
      return {
        story: (
          <>
            <strong>{actorName}</strong> followed{' '}
            <strong>{targetName}</strong>
          </>
        ),
        primaryAction: (
          <RouterLink
            to={`/public-profile/${target.id}`}
            style={{ textDecoration: 'none' }}
          >
            <Button size="sm" variant="ghost">View profile</Button>
          </RouterLink>
        ),
      }
    }

    case 'event_filling_up': {
      if (!svc) return null
      const pct = event.event_capacity_pct
      return {
        story: (
          <>
            <em>{svc.title}</em> is{' '}
            {pct ? <strong>{Math.round(pct * 100)}% full</strong> : 'filling up'}
          </>
        ),
        primaryAction: (
          <RouterLink
            to={`/service-detail/${svc.id}?from=pulse_following`}
            style={{ textDecoration: 'none' }}
          >
            <Button size="sm" colorPalette="amber">
              View event
            </Button>
          </RouterLink>
        ),
      }
    }

    case 'new_neighbor':
      return null

    default:
      return null
  }
}

export default function ActivityEventCard({ event }: Props) {
  const rendered = renderVerb(event)
  if (!rendered) return null

  const when = formatDistanceToNow(new Date(event.created_at), {
    addSuffix: true,
  })

  return (
    <Flex
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="12px"
      p="12px 14px"
      gap={3}
      align="flex-start"
      data-testid="activity-event-card"
    >
      <Avatar u={event.actor} size={32} />
      <Stack flex={1} gap={1} minW={0}>
        <Text fontSize="13px" color="gray.800" lineClamp={2}>
          {rendered.story}
        </Text>
        <Text fontSize="11px" color="gray.500">
          {when}
          {event.actor_location ? ` · ${event.actor_location}` : ''}
        </Text>
      </Stack>
      <Box display="flex" gap={2} flexShrink={0}>
        {rendered.secondaryAction}
        {rendered.primaryAction}
      </Box>
    </Flex>
  )
}
