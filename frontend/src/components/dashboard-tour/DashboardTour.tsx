import { useEffect, useMemo } from 'react'
import { Joyride, STATUS, type CallBackProps, type Step } from 'react-joyride'
import { useTourStore } from '@/store/useTourStore'
import { GREEN, GRAY800 } from '@/theme/tokens'

/* ────────────────────────────────────────────────────────────────────────────
 * 12-step guided tour for the Dashboard.
 *
 * - English copy, professional tone — explains the purpose of each area,
 *   not just "this is a button".
 * - Manually triggered: opens only when the user clicks the help icon in
 *   the navbar. No auto-open on first visit.
 * - Anchors via [data-tour="…"] selectors so we don't depend on internal
 *   class names; if a target is missing (e.g. empty feed), the step is
 *   skipped gracefully.
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
    disableBeacon: true,
    title: 'Welcome to The Hive',
    content: (
      <p>
        The Hive is a community where neighbours trade time and skills, and
        host events together. Take a quick tour to see how it works.
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
        Your avatar, name, and membership badge live here. Use the menu in
        the top-right to edit your profile or sign out.
      </p>
    ),
  },
  {
    id: 'time-balance',
    target: '[data-tour="time-balance"]',
    placement: 'right',
    title: 'Your time balance',
    content: (
      <p>
        These are the hours you can spend. New members start with
        <strong> 3 hours</strong>. When you book a service, your hours are
        reserved until both sides confirm. Your karma score appears here too.
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
        <strong>Pending</strong>, <strong>Active</strong>, <strong>Done</strong>,
        and <strong>Achievements</strong> show where each of your interactions
        stands.
      </p>
    ),
  },
  {
    id: 'post-buttons',
    target: '[data-tour="post-buttons"]',
    placement: 'right',
    title: 'Share with the community',
    content: (
      <ul style={{ paddingLeft: 18, marginTop: 0, lineHeight: 1.5 }}>
        <li><strong>Offer</strong> — share something you can give.</li>
        <li><strong>Need</strong> — request help (hours are reserved when accepted).</li>
        <li><strong>Event</strong> — host a community gathering.</li>
      </ul>
    ),
  },
  {
    id: 'location',
    target: '[data-tour="location"]',
    placement: 'right',
    title: "Find what's nearby",
    content: (
      <p>
        Enable location to see listings near you. Exact addresses stay
        private until both members agree to meet.
      </p>
    ),
  },
  {
    id: 'my-listings',
    target: '[data-tour="my-listings"]',
    placement: 'right',
    title: 'Your listings',
    content: (
      <p>
        Everything you&apos;ve posted, along with the people interested in
        each one.
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
      <p>Find services, skills, or tags in seconds.</p>
    ),
  },
  {
    id: 'filters',
    target: '[data-tour="filters"]',
    placement: 'bottom',
    title: 'Filters',
    content: (
      <p>
        Narrow the feed by <strong>All</strong>, <strong>New</strong>,
        <strong> Online</strong>, <strong>Recurrent</strong>, or
        <strong> Weekend</strong>.
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
        Toggle the map to see listings around you. Orange pins are
        <strong> offers</strong>, blue pins are <strong>requests</strong>.
      </p>
    ),
  },
  {
    id: 'listing-card',
    target: '[data-tour="listing-card"]',
    placement: 'top',
    title: 'Listing card',
    content: (
      <p>
        Each card shows the title, host, duration, location, and tags. Tap
        a card to open the details.
      </p>
    ),
    optional: true,
  },
  {
    id: 'top-nav',
    target: '[data-tour="top-nav"]',
    placement: 'bottom',
    title: 'Browse, Forum, Messages',
    content: (
      <>
        <p>
          <strong>Browse</strong> is your discovery feed.
          <strong> Forum</strong> is for community discussions.
          <strong> Messages</strong> keeps your active conversations — a
          chat opens automatically when a service request begins.
        </p>
        <p style={{ marginTop: 6 }}>
          You&apos;re all set. Click the question mark in the top-right any
          time to replay this tour.
        </p>
      </>
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

  const handleCallback = (data: CallBackProps) => {
    const { status } = data
    if (status === STATUS.FINISHED) endTour('done')
    else if (status === STATUS.SKIPPED) endTour('skipped')
  }

  const styles = useMemo(
    () => ({
      options: {
        primaryColor: GREEN,
        textColor: GRAY800,
        backgroundColor: '#ffffff',
        arrowColor: '#ffffff',
        overlayColor: 'rgba(15, 23, 42, 0.55)',
        zIndex: 10_000,
      },
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
      buttonNext: {
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
      buttonClose: { display: 'none' as const },
    }),
    [],
  )

  if (!isOpen) return null

  return (
    <Joyride
      key={runId}
      run
      continuous
      showProgress
      showSkipButton
      disableScrolling
      disableScrollParentFix
      hideCloseButton
      steps={steps}
      callback={handleCallback}
      styles={styles}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Finish',
        next: 'Next',
        skip: 'Skip tour',
      }}
      floaterProps={{ disableAnimation: true }}
    />
  )
}
