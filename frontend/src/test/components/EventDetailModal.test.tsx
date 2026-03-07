import { useState } from 'react'
import { ChakraProvider } from '@chakra-ui/react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EventDetailModal, { type EventDetailModalTab } from '@/components/EventDetailModal'
import type { Service } from '@/types'
import type { Handshake } from '@/services/handshakeAPI'
import system from '@/theme'

const { getMessagesMock, sendMessageMock } = vi.hoisted(() => ({
  getMessagesMock: vi.fn(),
  sendMessageMock: vi.fn(() => true),
}))

vi.mock('@/services/conversationAPI', () => ({
  eventChatAPI: {
    getMessages: getMessagesMock,
    sendMessage: vi.fn(),
  },
  buildEventChatWsUrl: (roomId: string) => `ws://test/ws/public-chat/${roomId}/`,
}))

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    isConnected: true,
    sendMessage: sendMessageMock,
    disconnect: vi.fn(),
    connect: vi.fn(),
    reconnectAttempts: 0,
  }),
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

function Harness({ isOwner }: { isOwner: boolean }) {
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
        isOwner={isOwner}
      />
    </ChakraProvider>
  )
}

describe('EventDetailModal', () => {
  beforeEach(() => {
    getMessagesMock.mockReset()
    sendMessageMock.mockClear()
    getMessagesMock.mockResolvedValue({
      room: {
        id: 'room-1',
        name: 'Neighborhood Picnic',
        type: 'event',
        related_service: 'svc-1',
        created_at: '2026-03-01T10:00:00Z',
      },
      messages: [
        {
          id: 'msg-1',
          room: 'room-1',
          sender_id: 'owner-1',
          sender_name: 'Aylin Host',
          sender_avatar_url: null,
          body: 'Kickoff in 10 minutes',
          created_at: '2026-03-08T11:50:00Z',
        },
      ],
    })
  })

  it('switches from details to chat and loads embedded event messages', async () => {
    const user = userEvent.setup()
    render(<Harness isOwner />)

    expect(screen.getByText('Stay in the event context')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /chat/i }))

    await waitFor(() => {
      expect(getMessagesMock).toHaveBeenCalledWith('svc-1', expect.any(AbortSignal))
    })
    expect(await screen.findByText('Kickoff in 10 minutes')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('shows the roster tab for owners and renders attendee controls', async () => {
    const user = userEvent.setup()
    render(<Harness isOwner />)

    await user.click(screen.getByRole('tab', { name: /roster/i }))

    expect(screen.getByText('Deniz Guest')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mark attended/i })).toBeInTheDocument()
  })

  it('hides the roster tab for participants', () => {
    render(<Harness isOwner={false} />)

    expect(screen.queryByRole('tab', { name: /roster/i })).not.toBeInTheDocument()
  })
})