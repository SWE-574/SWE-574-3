// @vitest-environment happy-dom
import { ChakraProvider } from '@chakra-ui/react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import system from '@/theme'
import BadgeShowcase from '../BadgeShowcase'
import type { BadgeDetail, BadgeProgress } from '@/types'

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: vi.fn(),
}))

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ChakraProvider value={system}>{children}</ChakraProvider>
}

const badge1: BadgeDetail = {
  id: 'badge-1',
  name: 'First Exchange',
  description: 'Complete your first exchange',
  icon_url: null,
  earned_at: '2024-01-01T00:00:00Z',
}

const badge2: BadgeDetail = {
  id: 'badge-2',
  name: 'Community Star',
  description: 'Help 5 members',
  icon_url: null,
  earned_at: '2024-02-01T00:00:00Z',
}

const progress1: BadgeProgress = {
  badge_type: 'badge-1',
  name: 'First Exchange',
  description: 'Complete your first exchange',
  current_value: 1,
  threshold: 1,
  earned: true,
  earned_at: '2024-01-01T00:00:00Z',
}

const progress2: BadgeProgress = {
  badge_type: 'badge-2',
  name: 'Community Star',
  description: 'Help 5 members',
  current_value: 5,
  threshold: 5,
  earned: true,
  earned_at: '2024-02-01T00:00:00Z',
}

const progress3: BadgeProgress = {
  badge_type: 'badge-3',
  name: 'Master Giver',
  description: 'Help 10 members',
  current_value: 3,
  threshold: 10,
  earned: false,
}

// Third earned badge for the 2-max swap test
const progress4: BadgeProgress = {
  badge_type: 'badge-4',
  name: 'Super Helper',
  description: 'Help 20 members',
  current_value: 20,
  threshold: 20,
  earned: true,
  earned_at: '2024-03-01T00:00:00Z',
}

describe('BadgeShowcase — compact mode', () => {
  it('renders up to 2 badges', () => {
    render(
      <Wrapper>
        <BadgeShowcase variant="compact" mode="own" badges={[badge1, badge2]} />
      </Wrapper>,
    )
    expect(screen.getByRole('img', { name: 'First Exchange' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Community Star' })).toBeInTheDocument()
  })

  it('shows placeholder for own-mode with no badges', () => {
    const onPickerOpenRequest = vi.fn()
    render(
      <Wrapper>
        <BadgeShowcase variant="compact" mode="own" badges={[]} onPickerOpenRequest={onPickerOpenRequest} />
      </Wrapper>,
    )
    const placeholder = screen.getByText('Showcase a badge')
    expect(placeholder).toBeInTheDocument()
    fireEvent.click(placeholder)
    expect(onPickerOpenRequest).toHaveBeenCalledTimes(1)
  })

  it('renders nothing for public mode with no badges', () => {
    const { container } = render(
      <Wrapper>
        <BadgeShowcase variant="compact" mode="public" badges={[]} />
      </Wrapper>,
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('BadgeShowcase — picker mode', () => {
  it('renders earned and locked badge sections', () => {
    render(
      <Wrapper>
        <BadgeShowcase
          variant="picker"
          allBadges={[progress1, progress2, progress3]}
          selected={[]}
          onChange={vi.fn()}
        />
      </Wrapper>,
    )
    expect(screen.getByText('Your earned badges')).toBeInTheDocument()
    expect(screen.getByText('Locked — keep going')).toBeInTheDocument()
    expect(screen.getByText('First Exchange')).toBeInTheDocument()
    expect(screen.getByText('Master Giver')).toBeInTheDocument()
  })

  it('locked badges are not clickable / aria-disabled', () => {
    render(
      <Wrapper>
        <BadgeShowcase
          variant="picker"
          allBadges={[progress3]}
          selected={[]}
          onChange={vi.fn()}
        />
      </Wrapper>,
    )
    // The locked badge container should be aria-disabled
    const lockedBadge = screen.getByText('Master Giver').closest('[aria-disabled="true"]')
    expect(lockedBadge).toBeInTheDocument()
  })

  it('selecting a badge calls onChange with the badge_type', () => {
    const onChange = vi.fn()
    render(
      <Wrapper>
        <BadgeShowcase
          variant="picker"
          allBadges={[progress1, progress2]}
          selected={[]}
          onChange={onChange}
        />
      </Wrapper>,
    )
    fireEvent.click(screen.getByLabelText('First Exchange'))
    expect(onChange).toHaveBeenCalledWith(['badge-1'])
  })

  it('deselects a badge when clicked again', () => {
    const onChange = vi.fn()
    render(
      <Wrapper>
        <BadgeShowcase
          variant="picker"
          allBadges={[progress1, progress2]}
          selected={['badge-1']}
          onChange={onChange}
        />
      </Wrapper>,
    )
    // Click the already-selected badge to deselect
    const badgeBtn = screen.getByLabelText('First Exchange')
    fireEvent.click(badgeBtn)
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('enforces 2-max with swap: clicking a third earned badge replaces oldest and shows toast', async () => {
    const { toast } = await import('sonner')
    const onChange = vi.fn()
    render(
      <Wrapper>
        <BadgeShowcase
          variant="picker"
          // Three earned badges: badge-1, badge-2, badge-4. badge-3 is locked.
          allBadges={[progress1, progress2, progress3, progress4]}
          // badge-1 and badge-2 are already selected (2-max reached)
          selected={['badge-1', 'badge-2']}
          onChange={onChange}
        />
      </Wrapper>,
    )
    // Click the third earned badge (Super Helper / badge-4)
    const thirdBadge = screen.getByLabelText('Super Helper')
    fireEvent.click(thirdBadge)

    // Oldest (badge-1) should be swapped out; result is [badge-2, badge-4]
    expect(onChange).toHaveBeenCalledWith(['badge-2', 'badge-4'])

    // Toast should mention "replaced"
    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining('replaced'),
      expect.any(Object),
    )
  })
})
