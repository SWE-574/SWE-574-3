// @vitest-environment happy-dom
import { ChakraProvider } from '@chakra-ui/react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import system from '@/theme'
import CalendarMonthGrid from '../CalendarMonthGrid'
import type { CalendarItem, CalendarConflict } from '@/types'

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <ChakraProvider value={system}>{children}</ChakraProvider>
    </MemoryRouter>
  )
}

// Fixed month for deterministic tests: May 2026
const MAY_2026 = new Date(2026, 4, 1) // month is 0-indexed

function makeItem(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id: 'item-1',
    kind: 'service_session',
    title: 'Test session',
    start: '2026-05-12T14:00:00+00:00',
    end: '2026-05-12T16:00:00+00:00',
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

describe('CalendarMonthGrid', () => {
  it('renders 7 column headers (Mon–Sun)', () => {
    render(
      <Wrapper>
        <CalendarMonthGrid
          items={[]}
          conflicts={[]}
          selectedDate={null}
          onSelectDate={vi.fn()}
          initialMonth={MAY_2026}
        />
      </Wrapper>,
    )
    expect(screen.getByText('Mon')).toBeInTheDocument()
    expect(screen.getByText('Sun')).toBeInTheDocument()
  })

  it('renders the correct month label', () => {
    render(
      <Wrapper>
        <CalendarMonthGrid
          items={[]}
          conflicts={[]}
          selectedDate={null}
          onSelectDate={vi.fn()}
          initialMonth={MAY_2026}
        />
      </Wrapper>,
    )
    expect(screen.getByText('May 2026')).toBeInTheDocument()
  })

  it('changes to previous month when clicking prev chevron', () => {
    render(
      <Wrapper>
        <CalendarMonthGrid
          items={[]}
          conflicts={[]}
          selectedDate={null}
          onSelectDate={vi.fn()}
          initialMonth={MAY_2026}
        />
      </Wrapper>,
    )
    fireEvent.click(screen.getByLabelText('Previous month'))
    expect(screen.getByText('April 2026')).toBeInTheDocument()
  })

  it('changes to next month when clicking next chevron', () => {
    render(
      <Wrapper>
        <CalendarMonthGrid
          items={[]}
          conflicts={[]}
          selectedDate={null}
          onSelectDate={vi.fn()}
          initialMonth={MAY_2026}
        />
      </Wrapper>,
    )
    fireEvent.click(screen.getByLabelText('Next month'))
    expect(screen.getByText('June 2026')).toBeInTheDocument()
  })

  it('calls onSelectDate when a day cell is clicked', () => {
    const onSelectDate = vi.fn()
    render(
      <Wrapper>
        <CalendarMonthGrid
          items={[]}
          conflicts={[]}
          selectedDate={null}
          onSelectDate={onSelectDate}
          initialMonth={MAY_2026}
        />
      </Wrapper>,
    )
    // Click on May 15 (will be in the grid)
    const may15 = screen.getByLabelText('15 May 2026')
    fireEvent.click(may15)
    expect(onSelectDate).toHaveBeenCalledTimes(1)
    expect(onSelectDate.mock.calls[0][0]).toBeInstanceOf(Date)
  })

  it('keeps the selected day active when clicking it again', () => {
    const onSelectDate = vi.fn()
    const selectedDate = new Date(2026, 4, 15)
    render(
      <Wrapper>
        <CalendarMonthGrid
          items={[]}
          conflicts={[]}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          initialMonth={MAY_2026}
        />
      </Wrapper>,
    )

    fireEvent.click(screen.getByLabelText('15 May 2026'))

    expect(onSelectDate).toHaveBeenCalledTimes(1)
    expect(onSelectDate.mock.calls[0][0]).toBeInstanceOf(Date)
  })

  it('renders the Today button and clicking it goes to current month', () => {
    render(
      <Wrapper>
        <CalendarMonthGrid
          items={[]}
          conflicts={[]}
          selectedDate={null}
          onSelectDate={vi.fn()}
          initialMonth={MAY_2026}
        />
      </Wrapper>,
    )
    expect(screen.getByLabelText('Go to today')).toBeInTheDocument()
    // First navigate away
    fireEvent.click(screen.getByLabelText('Next month'))
    expect(screen.getByText('June 2026')).toBeInTheDocument()
    // Then click Today
    fireEvent.click(screen.getByLabelText('Go to today'))
    // Should show current actual month
    const now = new Date()
    expect(screen.getByText(
      now.toLocaleString('en-US', { month: 'long', year: 'numeric' })
    )).toBeInTheDocument()
  })

  it('renders grid cells (role=gridcell) for each day', () => {
    render(
      <Wrapper>
        <CalendarMonthGrid
          items={[]}
          conflicts={[]}
          selectedDate={null}
          onSelectDate={vi.fn()}
          initialMonth={MAY_2026}
        />
      </Wrapper>,
    )
    const cells = screen.getAllByRole('gridcell')
    // May 2026 grid: 5 or 6 weeks × 7 days = 35 or 42
    expect(cells.length).toBeGreaterThanOrEqual(35)
  })

  it('renders a dot container for a day that has items', () => {
    const item = makeItem({ start: '2026-05-12T14:00:00+00:00' })
    render(
      <Wrapper>
        <CalendarMonthGrid
          items={[item]}
          conflicts={[]}
          selectedDate={null}
          onSelectDate={vi.fn()}
          initialMonth={MAY_2026}
        />
      </Wrapper>,
    )
    // The 12th cell should have more children than an empty cell (the date number + dot flex container)
    const may12 = screen.getByLabelText('12 May 2026')
    // An empty day cell has 1 child (the date number); a day with items has 2 (date + dots)
    expect(may12.children.length).toBeGreaterThanOrEqual(2)
  })

  it('renders selected state when selectedDate matches a cell', () => {
    const selectedDate = new Date(2026, 4, 15) // May 15
    render(
      <Wrapper>
        <CalendarMonthGrid
          items={[]}
          conflicts={[]}
          selectedDate={selectedDate}
          onSelectDate={vi.fn()}
          initialMonth={MAY_2026}
        />
      </Wrapper>,
    )
    const cell = screen.getByLabelText('15 May 2026')
    expect(cell).toHaveAttribute('aria-selected', 'true')
  })

  it('ArrowRight moves focus to the next day cell', () => {
    render(
      <Wrapper>
        <CalendarMonthGrid
          items={[]}
          conflicts={[]}
          selectedDate={null}
          onSelectDate={vi.fn()}
          initialMonth={MAY_2026}
        />
      </Wrapper>,
    )
    const may12 = screen.getByLabelText('12 May 2026')
    const may13 = screen.getByLabelText('13 May 2026')
    // Focus the 12th cell, then fire ArrowRight — focus should move to 13th
    may12.focus()
    fireEvent.keyDown(may12, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(may13)
  })

  it('ArrowLeft moves focus to the previous day cell', () => {
    render(
      <Wrapper>
        <CalendarMonthGrid
          items={[]}
          conflicts={[]}
          selectedDate={null}
          onSelectDate={vi.fn()}
          initialMonth={MAY_2026}
        />
      </Wrapper>,
    )
    const may15 = screen.getByLabelText('15 May 2026')
    const may14 = screen.getByLabelText('14 May 2026')
    may15.focus()
    fireEvent.keyDown(may15, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(may14)
  })

  it('ArrowDown moves focus one week down', () => {
    render(
      <Wrapper>
        <CalendarMonthGrid
          items={[]}
          conflicts={[]}
          selectedDate={null}
          onSelectDate={vi.fn()}
          initialMonth={MAY_2026}
        />
      </Wrapper>,
    )
    const may12 = screen.getByLabelText('12 May 2026')
    const may19 = screen.getByLabelText('19 May 2026')
    may12.focus()
    fireEvent.keyDown(may12, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(may19)
  })

  it('does not add an extra dot for conflicts', () => {
    const item = makeItem({ id: 'item-a', start: '2026-05-20T10:00:00+00:00' })
    const item2 = makeItem({ id: 'item-b', start: '2026-05-20T09:30:00+00:00', accent_token: 'BLUE' })
    const conflict: CalendarConflict = { item_id: 'item-a', overlaps_with: ['item-b'] }
    render(
      <Wrapper>
        <CalendarMonthGrid
          items={[item, item2]}
          conflicts={[conflict]}
          selectedDate={null}
          onSelectDate={vi.fn()}
          initialMonth={MAY_2026}
        />
      </Wrapper>,
    )
    const may20 = screen.getByLabelText('20 May 2026')
    expect(may20.querySelectorAll('[data-testid="calendar-item-dot"]')).toHaveLength(2)
  })
})
