import type { ActivityEvent } from '@/services/activityAPI'
import { ActivityHeroCard } from './ActivityHeroCard'
import { ActivityMatchCard } from './ActivityMatchCard'
import { ActivityQuoteCard } from './ActivityQuoteCard'
import { ActivityWelcomeCard } from './ActivityWelcomeCard'
import { ActivityFollowStrip } from './ActivityFollowStrip'

// Maps each verb to its visual treatment.
export function ActivityCard({ event }: { event: ActivityEvent }) {
  switch (event.verb) {
    case 'service_created':
      return <ActivityHeroCard event={event} />
    case 'event_filling_up':
      return <ActivityHeroCard event={event} variant="urgent" />
    case 'handshake_accepted':
      return <ActivityMatchCard event={event} variant="accepted" />
    case 'handshake_completed':
      return <ActivityMatchCard event={event} variant="completed" />
    case 'service_endorsed':
      return <ActivityQuoteCard event={event} />
    case 'new_neighbor':
      return <ActivityWelcomeCard event={event} />
    case 'user_followed':
      return <ActivityFollowStrip event={event} />
    default:
      return null
  }
}
