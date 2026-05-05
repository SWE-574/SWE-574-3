// @vitest-environment happy-dom
import { ChakraProvider } from '@chakra-ui/react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import system from '@/theme'
import AgendaList from '../AgendaList'
import type { CalendarItem, CalendarConflict } from '@/types'

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <ChakraProvider value={system}>{children}</ChakraProvider>
    </MemoryRouter>
  )
}

function makeItem(overrides: Partial<CalendarItem>): CalendarItem {
  return {
    id: 'item-1',
    kind: 'service_session',
    title: 'Test session',
    start: new Date().toISOString(),
    end: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    duration_hours: 2,
    location_type: 'In-Person',
    location_label: 'Kadıköy',
    service_type: 'Offer',
    service_id: 'svc-1',
    handshake_id: 'hs-1',
    chat_id: null,
    counterpart: { id: 'user-2', name: 'Ada Lovelace', avatar_url: null },
    is_owner: true,
    status: 'accepted',
    accent_token: 'GREEN',
    link: { type: 'service', id: 'svc-1' },
    ...overrides,
  }
}

describe('AgendaList', () => {
  it('renders empty state when items array is empty', () => {
    render(
      <Wrapper>
        <AgendaList items={[]} conflicts={[]} />
      </Wrapper>,
    )
    expect(screen.getByText(/Nothing on your calendar yet/i)).toBeInTheDocument()
    expect(screen.getByText(/Accept an exchange or join an event/i)).toBeInTheDocument()
  })

  it('groups items and renders Today section for a today item', () => {
    const now = new Date()
    const item = makeItem({
      id: 'today-item',
      title: 'My today session',
      start: now.toISOString(),
      end: new Date(now.getTime() + 3600000).toISOString(),
    })
    render(
      <Wrapper>
        <AgendaList items={[item]} conflicts={[]} />
      </Wrapper>,
    )
    // GROUP_LABELS.today = 'Today' (CSS textTransform="uppercase" doesn't change text content)
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('My today session')).toBeInTheDocument()
  })

  it('groups items — Tomorrow section for a tomorrow item', () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const item = makeItem({
      id: 'tomorrow-item',
      title: 'Tomorrow meeting',
      start: tomorrow.toISOString(),
      end: new Date(tomorrow.getTime() + 3600000).toISOString(),
    })
    render(
      <Wrapper>
        <AgendaList items={[item]} conflicts={[]} />
      </Wrapper>,
    )
    // GROUP_LABELS.tomorrow = 'Tomorrow' (CSS handles visual uppercase)
    expect(screen.getByText('Tomorrow')).toBeInTheDocument()
    expect(screen.getByText('Tomorrow meeting')).toBeInTheDocument()
  })

  it('renders a conflict item with amber conflict indicator', () => {
    const now = new Date()
    const itemA = makeItem({ id: 'item-a', title: 'Session A', start: now.toISOString() })
    const itemB = makeItem({
      id: 'item-b',
      title: 'Session B',
      start: now.toISOString(),
      accent_token: 'BLUE',
    })
    const conflict: CalendarConflict = { item_id: 'item-a', overlaps_with: ['item-b'] }

    render(
      <Wrapper>
        <AgendaList items={[itemA, itemB]} conflicts={[conflict]} />
      </Wrapper>,
    )

    // The conflict indicator text should appear
    const conflictTexts = screen.getAllByText('Schedule conflict')
    expect(conflictTexts.length).toBeGreaterThanOrEqual(1)
  })

  it('renders link to chat URL for item with link.type=chat', () => {
    const now = new Date()
    const item = makeItem({
      id: 'chat-item',
      title: 'Chat session',
      start: now.toISOString(),
      link: { type: 'chat', id: 'hs-abc' },
    })
    render(
      <Wrapper>
        <AgendaList items={[item]} conflicts={[]} />
      </Wrapper>,
    )
    const link = screen.getByText('Chat session').closest('a')
    expect(link).toHaveAttribute('href', '/messages/hs-abc')
  })

  it('renders link to service URL for item with link.type=service', () => {
    const now = new Date()
    const item = makeItem({
      id: 'svc-item',
      title: 'Service session',
      start: now.toISOString(),
      link: { type: 'service', id: 'svc-xyz' },
    })
    render(
      <Wrapper>
        <AgendaList items={[item]} conflicts={[]} />
      </Wrapper>,
    )
    const link = screen.getByText('Service session').closest('a')
    expect(link).toHaveAttribute('href', '/services/svc-xyz')
  })

  it('when selectedDate is set, shows only items on that day', () => {
    const today = new Date()
    today.setHours(10, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const todayItem = makeItem({
      id: 'today-item',
      title: 'Today only',
      start: today.toISOString(),
    })
    const tomorrowItem = makeItem({
      id: 'tomorrow-item',
      title: 'Tomorrow only',
      start: tomorrow.toISOString(),
    })

    render(
      <Wrapper>
        <AgendaList
          items={[todayItem, tomorrowItem]}
          conflicts={[]}
          selectedDate={today}
        />
      </Wrapper>,
    )

    expect(screen.getByText('Today only')).toBeInTheDocument()
    expect(screen.queryByText('Tomorrow only')).not.toBeInTheDocument()
  })

  it('when selectedDate is set with no items, shows "Nothing scheduled on this day"', () => {
    const someDate = new Date(2030, 0, 15)
    render(
      <Wrapper>
        <AgendaList items={[]} conflicts={[]} selectedDate={someDate} />
      </Wrapper>,
    )
    expect(screen.getByText(/Nothing scheduled on this day/i)).toBeInTheDocument()
  })

  it('when selectedDate is set and items exist but none match that day, shows empty state', () => {
    const today = new Date()
    today.setHours(10, 0, 0, 0)
    // An item that is not on 'someFilteredDate'
    const someOtherDayItem = makeItem({
      id: 'other-item',
      title: 'Other day session',
      start: today.toISOString(),
    })
    // Select a date with no items
    const emptyDate = new Date(2030, 5, 20)
    render(
      <Wrapper>
        <AgendaList items={[someOtherDayItem]} conflicts={[]} selectedDate={emptyDate} />
      </Wrapper>,
    )
    expect(screen.getByText(/Nothing scheduled on this day/i)).toBeInTheDocument()
    expect(screen.queryByText('Other day session')).not.toBeInTheDocument()
  })
})
