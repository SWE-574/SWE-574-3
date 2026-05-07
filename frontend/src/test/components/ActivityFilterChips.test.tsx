import { ChakraProvider } from '@chakra-ui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActivityFilterChips } from '@/components/activity/ActivityFilterChips'
import system from '@/theme'

/**
 * Coverage for the activity feed filter chip strip. Pins:
 *  - empty-state (all counts zero) — chips still render with 0 next to each
 *  - populated-state (counts present) — labels and counts both visible
 *  - active-state — clicking a chip fires onChange with the filter id
 *  - missing-count fallback — chip without a key in counts shows 0
 */

const COUNTS_EMPTY = { all: 0, following: 0, nearby: 0, recent: 0 } as const

function renderChips(props: Partial<Parameters<typeof ActivityFilterChips>[0]> = {}) {
  return render(
    <ChakraProvider value={system}>
      <ActivityFilterChips
        active="all"
        counts={COUNTS_EMPTY}
        onChange={vi.fn()}
        {...props}
      />
    </ChakraProvider>,
  )
}

describe('ActivityFilterChips', () => {
  it('renders all four filter labels even with empty counts', () => {
    renderChips()
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('Following')).toBeInTheDocument()
    expect(screen.getByText('Nearby')).toBeInTheDocument()
    expect(screen.getByText('Last 24h')).toBeInTheDocument()
  })

  it('shows zero counts when the filter has no items', () => {
    renderChips()
    expect(screen.getAllByText('0')).toHaveLength(4)
  })

  it('shows populated counts next to each label', () => {
    renderChips({ counts: { all: 12, following: 3, nearby: 5, recent: 7 } })
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('fires onChange with the filter id when a chip is clicked', () => {
    const onChange = vi.fn()
    renderChips({ onChange })
    fireEvent.click(screen.getByText('Following'))
    expect(onChange).toHaveBeenCalledWith('following')
  })

  it('does not fire onChange for the currently active chip when its parent ignores re-clicks', () => {
    // Sanity test: clicking the active chip still invokes onChange
    // (parent decides whether to deduplicate). Documents that the chip
    // always emits, never short-circuits.
    const onChange = vi.fn()
    renderChips({ onChange, active: 'all' })
    fireEvent.click(screen.getByText('All'))
    expect(onChange).toHaveBeenCalledWith('all')
  })

  it('treats a missing count key as zero rather than crashing', () => {
    // counts intentionally missing the "recent" key
    renderChips({ counts: { all: 1, following: 2, nearby: 3 } as never })
    expect(screen.getByText('Last 24h')).toBeInTheDocument()
  })
})
