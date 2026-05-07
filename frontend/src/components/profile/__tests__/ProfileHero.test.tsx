// @vitest-environment happy-dom
import { ChakraProvider } from '@chakra-ui/react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import system from '@/theme'
import ProfileHero from '../ProfileHero'
import type { User } from '@/types'

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <ChakraProvider value={system}>{children}</ChakraProvider>
    </MemoryRouter>
  )
}

const baseUser: User = {
  id: 'user-1',
  email: 'alice@example.com',
  first_name: 'Alice',
  last_name: 'Smith',
  role: 'member',
  featured_badges: [],
  featured_badges_detail: [],
}

describe('ProfileHero — own mode', () => {
  it('renders the Edit profile button', () => {
    render(
      <Wrapper>
        <ProfileHero user={baseUser} mode="own" />
      </Wrapper>,
    )
    expect(screen.getByText('Edit profile')).toBeInTheDocument()
  })

  it('calls onEditClick when Edit profile is clicked', () => {
    const onEditClick = vi.fn()
    render(
      <Wrapper>
        <ProfileHero user={baseUser} mode="own" onEditClick={onEditClick} />
      </Wrapper>,
    )
    fireEvent.click(screen.getByText('Edit profile'))
    expect(onEditClick).toHaveBeenCalledTimes(1)
  })

  it('does NOT render Message or Report buttons', () => {
    render(
      <Wrapper>
        <ProfileHero user={baseUser} mode="own" />
      </Wrapper>,
    )
    expect(screen.queryByText('Message')).toBeNull()
    expect(screen.queryByText('Report')).toBeNull()
  })

  it('shows active services tile instead of time balance in own mode', () => {
    render(
      <Wrapper>
        <ProfileHero user={baseUser} mode="own" activeServicesCount={3} />
      </Wrapper>,
    )
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Active services')).toBeInTheDocument()
    // time balance tile must NOT appear
    expect(screen.queryByText('Time balance')).toBeNull()
  })

  it('shows — for unknown active services count', () => {
    render(
      <Wrapper>
        <ProfileHero user={baseUser} mode="own" />
      </Wrapper>,
    )
    // There should be at least one — (unknown stat)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
  })

  it('shows avatar fallback initials when avatar_url is null', () => {
    const userNoAvatar: User = { ...baseUser, avatar_url: undefined }
    render(
      <Wrapper>
        <ProfileHero user={userNoAvatar} mode="own" />
      </Wrapper>,
    )
    // Initials for Alice Smith = AS
    expect(screen.getByText('AS')).toBeInTheDocument()
  })

  it('renders View Time Activity link in own mode', () => {
    render(
      <Wrapper>
        <ProfileHero user={baseUser} mode="own" />
      </Wrapper>,
    )
    expect(screen.getByText('View Time Activity →')).toBeInTheDocument()
  })

  it('shows the join month and year instead of a zero-month duration', () => {
    render(
      <Wrapper>
        <ProfileHero user={{ ...baseUser, date_joined: '2026-05-01T10:00:00Z' }} mode="own" />
      </Wrapper>,
    )
    expect(screen.getAllByText('May 2026').length).toBeGreaterThan(0)
    expect(screen.queryByText('0m')).toBeNull()
  })

  it('labels follower and following counts clearly', () => {
    render(
      <Wrapper>
        <ProfileHero
          user={{ ...baseUser, followers_count: 9, following_count: 8 }}
          mode="own"
        />
      </Wrapper>,
    )
    expect(screen.getByText('Followers')).toBeInTheDocument()
    expect(screen.getByText('Following')).toBeInTheDocument()
  })
})

describe('ProfileHero — public mode', () => {
  it('renders Message and Report buttons', () => {
    render(
      <Wrapper>
        <ProfileHero user={baseUser} mode="public" />
      </Wrapper>,
    )
    expect(screen.getByText('Message')).toBeInTheDocument()
    expect(screen.getByText('Report')).toBeInTheDocument()
  })

  it('does NOT render Edit profile button', () => {
    render(
      <Wrapper>
        <ProfileHero user={baseUser} mode="public" />
      </Wrapper>,
    )
    expect(screen.queryByText('Edit profile')).toBeNull()
  })

  it('hides time balance tile and shows reputation instead', () => {
    render(
      <Wrapper>
        <ProfileHero user={baseUser} mode="public" reputationScore={4.7} />
      </Wrapper>,
    )
    expect(screen.queryByText('Time balance')).toBeNull()
    expect(screen.getByText('Reputation')).toBeInTheDocument()
  })

  it('calls onMessageClick when Message is clicked', () => {
    const onMessageClick = vi.fn()
    render(
      <Wrapper>
        <ProfileHero user={baseUser} mode="public" onMessageClick={onMessageClick} />
      </Wrapper>,
    )
    fireEvent.click(screen.getByText('Message'))
    expect(onMessageClick).toHaveBeenCalledTimes(1)
  })
})
