// @vitest-environment happy-dom
import { ChakraProvider } from '@chakra-ui/react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import system from '@/theme'
import InterestRequesterRow from '../InterestRequesterRow'
import type { Handshake } from '@/services/handshakeAPI'

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <ChakraProvider value={system}>{children}</ChakraProvider>
    </MemoryRouter>
  )
}

function makeHandshake(overrides: Partial<Handshake> = {}): Handshake {
  return {
    id: 'hs-1',
    service: 'svc-1',
    service_id: 'svc-1',
    service_title: 'Pottery basics',
    service_type: 'Offer',
    requester: 'user-2',
    requester_name: 'Alice Smith',
    requester_detail: {
      id: 'user-2',
      first_name: 'Alice',
      last_name: 'Smith',
      avatar_url: null,
      member_since: '2023-03-15T00:00:00Z',
    },
    provider_name: 'Bob Jones',
    status: 'pending',
    provisioned_hours: 2,
    provider_confirmed_complete: false,
    receiver_confirmed_complete: false,
    created_at: '2026-04-01T10:00:00Z',
    updated_at: '2026-04-01T10:00:00Z',
    ...overrides,
  }
}

describe('InterestRequesterRow', () => {
  it('renders nothing (returns null) when isOwner is false', () => {
    const { container } = render(
      <Wrapper>
        <InterestRequesterRow handshake={makeHandshake()} isOwner={false} />
      </Wrapper>,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders requester name when isOwner is true', () => {
    render(
      <Wrapper>
        <InterestRequesterRow handshake={makeHandshake()} isOwner />
      </Wrapper>,
    )
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
  })

  it('renders the status badge', () => {
    render(
      <Wrapper>
        <InterestRequesterRow handshake={makeHandshake()} isOwner />
      </Wrapper>,
    )
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('renders accepted status badge for accepted handshake', () => {
    render(
      <Wrapper>
        <InterestRequesterRow handshake={makeHandshake({ status: 'accepted' })} isOwner />
      </Wrapper>,
    )
    expect(screen.getByText('Accepted')).toBeInTheDocument()
  })

  it('renders member_since year in meta line', () => {
    render(
      <Wrapper>
        <InterestRequesterRow handshake={makeHandshake()} isOwner />
      </Wrapper>,
    )
    expect(screen.getByText(/joined 2023/i)).toBeInTheDocument()
  })

  it('all profile links point to /public-profile/{requesterId}', () => {
    render(
      <Wrapper>
        <InterestRequesterRow handshake={makeHandshake()} isOwner />
      </Wrapper>,
    )
    const links = screen.getAllByRole('link')
    const profileLinks = links.filter((l) =>
      l.getAttribute('href') === '/public-profile/user-2',
    )
    // Avatar link + name link + View profile button = at least 2 links
    expect(profileLinks.length).toBeGreaterThanOrEqual(2)
  })

  it('View profile link navigates to /public-profile/{requesterId}', () => {
    render(
      <Wrapper>
        <InterestRequesterRow handshake={makeHandshake()} isOwner />
      </Wrapper>,
    )
    // The view profile button has a distinct aria-label per IMPORTANT 4
    const viewProfileLink = screen.getByLabelText(/Open Alice Smith's public profile page/i)
    expect(viewProfileLink).toBeDefined()
    expect(viewProfileLink).toHaveAttribute('href', '/public-profile/user-2')
  })

  it('avatar link and view-profile button have distinct aria-labels', () => {
    render(
      <Wrapper>
        <InterestRequesterRow handshake={makeHandshake()} isOwner />
      </Wrapper>,
    )
    // Wrapper Link uses "View {name}'s public profile"
    const avatarLink = screen.getByLabelText(/View Alice Smith's public profile/i)
    expect(avatarLink).toBeDefined()
    // View profile button uses a different label
    const viewProfileBtn = screen.getByLabelText(/Open Alice Smith's public profile page/i)
    expect(viewProfileBtn).toBeDefined()
    expect(avatarLink).not.toBe(viewProfileBtn)
  })

  it('shows Accept and Decline buttons for pending status', () => {
    const onAccept = vi.fn()
    const onReject = vi.fn()
    render(
      <Wrapper>
        <InterestRequesterRow
          handshake={makeHandshake({ status: 'pending' })}
          isOwner
          onAccept={onAccept}
          onReject={onReject}
        />
      </Wrapper>,
    )
    expect(screen.getByText('Accept')).toBeInTheDocument()
    expect(screen.getByText('Decline')).toBeInTheDocument()
  })

  it('calls onAccept when Accept button is clicked', () => {
    const onAccept = vi.fn()
    render(
      <Wrapper>
        <InterestRequesterRow
          handshake={makeHandshake({ status: 'pending' })}
          isOwner
          onAccept={onAccept}
        />
      </Wrapper>,
    )
    fireEvent.click(screen.getByText('Accept'))
    expect(onAccept).toHaveBeenCalledTimes(1)
  })

  it('calls onReject when Decline button is clicked', () => {
    const onReject = vi.fn()
    render(
      <Wrapper>
        <InterestRequesterRow
          handshake={makeHandshake({ status: 'pending' })}
          isOwner
          onReject={onReject}
        />
      </Wrapper>,
    )
    fireEvent.click(screen.getByText('Decline'))
    expect(onReject).toHaveBeenCalledTimes(1)
  })

  it('does not show Accept/Decline buttons for accepted status', () => {
    render(
      <Wrapper>
        <InterestRequesterRow handshake={makeHandshake({ status: 'accepted' })} isOwner />
      </Wrapper>,
    )
    expect(screen.queryByText('Accept')).not.toBeInTheDocument()
    expect(screen.queryByText('Decline')).not.toBeInTheDocument()
  })

  it('falls back to requester.id when requester_detail is absent', () => {
    const handshake = makeHandshake({
      requester: 'user-fallback',
      requester_name: 'Fallback User',
      requester_detail: undefined,
    })
    render(
      <Wrapper>
        <InterestRequesterRow handshake={handshake} isOwner />
      </Wrapper>,
    )
    // All links should point to /public-profile/user-fallback
    const links = screen.getAllByRole('link')
    const profileLinks = links.filter((l) =>
      l.getAttribute('href') === '/public-profile/user-fallback',
    )
    expect(profileLinks.length).toBeGreaterThanOrEqual(1)
    // The "View profile" link specifically
    const viewProfileLink = links.find((l) =>
      l.textContent?.includes('View profile') &&
      l.getAttribute('href') === '/public-profile/user-fallback',
    )
    expect(viewProfileLink).toBeDefined()
  })
})
