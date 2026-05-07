import { useState } from 'react'
import { ChakraProvider } from '@chakra-ui/react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventDetailModal, { type EventDetailModalTab } from '@/components/EventDetailModal'
import type { Service } from '@/types'
import type { Handshake } from '@/services/handshakeAPI'
import system from '@/theme'

/**
 * Integration counterpart to EventDetailModal.test.tsx. The unit spec mocks
 * useWebSocket so it can drive the modal deterministically; this spec runs
 * the *real* hook and asserts the modal is wired up to the WebSocket
 * constructor with the URL produced by buildEventChatWsUrl. If the modal
 * stops invoking the hook (e.g. swap to a polling chat), this fails before
 * the unit test mock starts lying about reality.
 */

const { getMessagesMock } = vi.hoisted(() => ({
  getMessagesMock: vi.fn(),
}))

vi.mock('@/services/conversationAPI', () => ({
  eventChatAPI: {
    getMessages: getMessagesMock,
    sendMessage: vi.fn(),
  },
  buildEventChatWsUrl: (roomId: string) => `ws://test/ws/public-chat/${roomId}/`,
}))

vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1' },
  }),
}))

const service: Service = {
  id: 'svc-1',
  title: 'Neighborhood Picnic',
  description: 'Bring snacks and help coordinate the setup.',
  type: 'Event',
  duration: 2,
  status: 'Active',
  location_type: 'In-Person',
  scheduled_time: '2026-03-08T12:00:00Z',
  location_area: 'Central Park',
  max_participants: 10,
  participant_count: 4,
  schedule_type: 'One-Time',
  tags: [],
  created_at: '2026-03-01T10:00:00Z',
  updated_at: '2026-03-01T10:00:00Z',
  user: {
    id: 'owner-1',
    email: 'owner@example.com',
    first_name: 'Aylin',
    last_name: 'Host',
    role: 'registered',
    featured_badges: [],
    featured_badges_detail: [],
  },
}

const handshakes: Handshake[] = [
  {
    id: 'hs-1',
    service: 'svc-1',
    service_title: 'Neighborhood Picnic',
    service_type: 'Event',
    requester: 'user-2',
    requester_name: 'Deniz Guest',
    provider_name: 'Aylin Host',
    status: 'checked_in',
    provisioned_hours: 0,
    provider_confirmed_complete: false,
    receiver_confirmed_complete: false,
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
  },
]

function Harness() {
  const [tab, setTab] = useState<EventDetailModalTab>('details')

  return (
    <ChakraProvider value={system}>
      <EventDetailModal
        isOpen
        activeTab={tab}
        onTabChange={setTab}
        onClose={vi.fn()}
        service={service}
        handshakes={handshakes}
        onComplete={vi.fn()}
        onMarkAttended={vi.fn()}
        onReportUser={vi.fn()}
        markingHandshakeId={null}
        reportingIssue={false}
        completing={false}
        isOwner
      />
    </ChakraProvider>
  )
}

describe('EventDetailModal (integration)', () => {
  let openedUrls: string[] = []
  const RealWebSocket = globalThis.WebSocket

  beforeEach(() => {
    openedUrls = []
    getMessagesMock.mockResolvedValue({
      room: {
        id: 'room-1',
        name: 'Neighborhood Picnic',
        type: 'event',
        related_service: 'svc-1',
        created_at: '2026-03-01T10:00:00Z',
      },
      messages: [],
    })

    class FakeWebSocket {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3
      readyState = FakeWebSocket.OPEN
      url: string
      onopen: ((this: WebSocket, ev: Event) => void) | null = null
      onclose: ((this: WebSocket, ev: CloseEvent) => void) | null = null
      onerror: ((this: WebSocket, ev: Event) => void) | null = null
      onmessage: ((this: WebSocket, ev: MessageEvent) => void) | null = null

      constructor(url: string) {
        this.url = url
        openedUrls.push(url)
      }
      send() { /* no-op */ }
      close() { this.readyState = FakeWebSocket.CLOSED }
      addEventListener() { /* no-op */ }
      removeEventListener() { /* no-op */ }
      dispatchEvent() { return true }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.WebSocket = FakeWebSocket as any
  })

  afterEach(() => {
    globalThis.WebSocket = RealWebSocket
  })

  it('opens a real WebSocket against the event chat URL when the chat tab is shown', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('tab', { name: /chat/i }))

    await waitFor(() => {
      expect(getMessagesMock).toHaveBeenCalledWith('svc-1', expect.any(AbortSignal))
    })
    await waitFor(() => {
      expect(openedUrls.some((u) => u.includes('/ws/public-chat/'))).toBe(true)
    })
  })
})
