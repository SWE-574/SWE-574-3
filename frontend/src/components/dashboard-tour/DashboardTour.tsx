import { useEffect, useMemo } from 'react'
import {
  Joyride,
  EVENTS,
  ACTIONS,
  type EventData,
  type Options,
  type Step,
} from 'react-joyride'
import { useTourStore } from '@/store/useTourStore'
import { GREEN, GRAY600, GRAY800 } from '@/theme/tokens'

/* ────────────────────────────────────────────────────────────────────────────
 * Dashboard guided tour (~12 steps).
 *
 * Tone: clear and human, community-minded, suitable for a serious product —
 * welcoming without slang or corporate jargon.
 * Opens from the navbar help icon only. Targets use [data-tour="…"].
 * ──────────────────────────────────────────────────────────────────────── */

interface TourStep extends Step {
  /** Internal id, useful when filtering optional steps. */
  id: string
  /** If true, the step is dropped when its target is not present. */
  optional?: boolean
}

const ALL_STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: 'body',
    placement: 'center',
    skipBeacon: true,
    title: 'Welcome to The Hive',
    content: (
      <p>
        People here exchange skills, small favors, and local know-how. Take a
        moment to look around — then consider posting an offer, a need, or an
        event. Active feeds help everyone discover what&apos;s possible nearby.
      </p>
    ),
  },
  {
    id: 'profile-card',
    target: '[data-tour="profile-card"]',
    placement: 'right',
    title: 'Your profile',
    content: (
      <p>
        A short, honest profile makes it easier for others to trust you and join
        what you share. Update it as your skills or interests change.
      </p>
    ),
  },
  {
    id: 'time-balance',
    target: '[data-tour="time-balance"]',
    placement: 'right',
    title: 'Your hours',
    content: (
      <p>
        You start with hours you can use when you request help from others. You
        earn more by contributing your own time when someone needs you — it
        keeps give and take in balance.
      </p>
    ),
  },
  {
    id: 'activity-stats',
    target: '[data-tour="activity-stats"]',
    placement: 'right',
    title: 'Your activity',
    content: (
      <p>
        See what you&apos;ve opened, what&apos;s still in progress, and what
        you&apos;ve completed. It&apos;s a simple view of how you&apos;re taking
        part in the community.
      </p>
    ),
  },
  {
    id: 'post-buttons',
    target: '[data-tour="post-buttons"]',
    placement: 'right',
    title: 'Share with the community',
    content: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ margin: 0 }}>
          Choose a type, add a bit of detail, and you&apos;re easier to find:
        </p>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            lineHeight: 1.45,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <li>
            <strong>Offer</strong> — what you&apos;re good at or happy to share;
            say it clearly so the right people respond.
          </li>
          <li>
            <strong>Need</strong> — when you&apos;re looking for support.
          </li>
          <li>
            <strong>Event</strong> — when you want to bring people together.
          </li>
        </ul>
        <p style={{ margin: 0, color: GRAY600, fontSize: 13 }}>
          Posting is how others find you.
        </p>
      </div>
    ),
  },
  {
    id: 'location',
    target: '[data-tour="location"]',
    placement: 'right',
    title: 'Location',
    content: (
      <p>
        Sharing your general area helps surface relevant listings nearby. Your
        exact position isn&apos;t shown publicly until you choose to meet or
        share more in a conversation.
      </p>
    ),
  },
  {
    id: 'my-listings',
    target: '[data-tour="my-listings"]',
    placement: 'right',
    title: 'Your posts',
    content: (
      <p>
        All of your listings appear here, along with interest from others. Use
        it to manage what you&apos;ve published and follow up with participants.
      </p>
    ),
    optional: true,
  },
  {
    id: 'search',
    target: '[data-tour="search"]',
    placement: 'bottom',
    title: 'Search',
    content: (
      <p>
        Search by skill, topic, or keyword to find offers, needs, and events that
        match what you&apos;re looking for — or what you can contribute.
      </p>
    ),
  },
  {
    id: 'filters',
    target: '[data-tour="filters"]',
    placement: 'bottom',
    title: 'Filters',
    content: (
      <p>
        Use the pills next to search: <strong>All</strong> for the main ranked
        feed, <strong>New</strong> for the latest posts first,{' '}
        <strong>Online</strong> for remote-friendly listings,{' '}
        <strong>Recurrent</strong> for ongoing or repeating offers, and{' '}
        <strong>Weekend</strong> when details mention a weekend time.
      </p>
    ),
  },
  {
    id: 'map-toggle',
    target: '[data-tour="map-toggle"]',
    placement: 'bottom',
    title: 'Map view',
    content: (
      <p>
        Switch to the map to see listings in context. Orange markers indicate
        offers; blue markers indicate requests for help.
      </p>
    ),
  },
  {
    id: 'listing-card',
    target: '[data-tour="listing-card"]',
    placement: 'top',
    title: 'Listing details',
    content: (
      <p>
        Each card summarizes the title, host, duration, area, and tags. Open a
        card for full details and next steps.
      </p>
    ),
    optional: true,
  },
  {
    id: 'top-nav',
    target: '[data-tour="top-nav"]',
    placement: 'bottom',
    title: 'Explore the app',
    content: (
      <p>
        Use <strong>Browse</strong> for the main feed, <strong>Forum</strong>{' '}
        for longer discussions, and <strong>Messages</strong> for private
        coordination. When you&apos;re ready, post or reply — that&apos;s how the
        community grows.
      </p>
    ),
  },
]

function pickAvailableSteps(): TourStep[] {
  if (typeof document === 'undefined') return ALL_STEPS
  return ALL_STEPS.filter((step) => {
    if (!step.optional) return true
    const target = typeof step.target === 'string' ? step.target : null
    if (!target || target === 'body') return true
    return !!document.querySelector(target)
  })
}

export default function DashboardTour() {
  const isOpen = useTourStore((s) => s.isOpen)
  const runId = useTourStore((s) => s.runId)
  const endTour = useTourStore((s) => s.endTour)

  /* Re-evaluate which optional steps are present every time the tour
   * is (re)started. Derived during render (no setState-in-effect) so
   * the list always reflects the latest DOM when the tour opens.
   * `runId` is referenced so the memo recomputes when startTour() is
   * called even if `isOpen` was already true. */
  const steps = useMemo<TourStep[]>(() => {
    void runId
    return isOpen ? pickAvailableSteps() : ALL_STEPS
  }, [isOpen, runId])

  /* Lock background scrolling while the tour is active. */
  useEffect(() => {
    if (!isOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [isOpen])

  /* End-of-tour detection. v3 emits a single `tour:end` event and reports
   * how it ended via `data.action` (`complete` for natural finish,
   * `skip` when the user used the skip button). */
  const handleEvent = (data: EventData) => {
    if (data.type !== EVENTS.TOUR_END) return
    if (data.action === ACTIONS.SKIP) endTour('skipped')
    else endTour('done')
  }

  /* Behaviour and theming options. In v3 these live on the `options`
   * prop; only pure CSS overrides go in `styles`. */
  const options = useMemo<Partial<Options>>(
    () => ({
      primaryColor: GREEN,
      textColor: GRAY800,
      backgroundColor: '#ffffff',
      arrowColor: '#ffffff',
      overlayColor: 'rgba(15, 23, 42, 0.55)',
      zIndex: 10_000,
      showProgress: true,
      skipScroll: true,
      skipBeacon: true,
      // Show Back / Next-or-Finish / Skip — omit "Close" so there is no X.
      buttons: ['back', 'primary', 'skip'],
    }),
    [],
  )

  const styles = useMemo(
    () => ({
      tooltip: {
        borderRadius: 14,
        padding: 18,
        fontSize: 14,
        lineHeight: 1.5,
        maxWidth: 360,
      },
      tooltipTitle: {
        fontSize: 16,
        fontWeight: 700,
        marginBottom: 6,
        color: GRAY800,
      },
      buttonPrimary: {
        backgroundColor: GREEN,
        borderRadius: 9,
        padding: '8px 14px',
        fontWeight: 600,
        fontSize: 13,
      },
      buttonBack: {
        color: GRAY800,
        marginRight: 8,
        fontSize: 13,
      },
      buttonSkip: {
        color: '#6b7280',
        fontSize: 13,
      },
    }),
    [],
  )

  if (!isOpen) return null

  return (
    <Joyride
      key={runId}
      run
      continuous
      steps={steps}
      onEvent={handleEvent}
      options={options}
      styles={styles}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Finish',
        next: 'Next',
        skip: 'Skip tour',
      }}
    />
  )
}
