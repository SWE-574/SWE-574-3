import { describe, it, expect } from 'vitest'

import {
  MAP_COLLAPSE_SCROLL_PX,
  MAP_EXPAND_SCROLL_PX,
  nextMapCollapsedState,
} from '@/utils/dashboardScroll'

describe('Dashboard map scroll hysteresis', () => {
  it('keeps the threshold gap that prevents flicker', () => {
    expect(MAP_EXPAND_SCROLL_PX).toBeLessThan(MAP_COLLAPSE_SCROLL_PX)
  })

  it('collapses the map once scroll passes the upper threshold', () => {
    expect(nextMapCollapsedState(false, MAP_COLLAPSE_SCROLL_PX + 1)).toBe(true)
  })

  it('does not collapse while still inside the dead zone above the lower threshold', () => {
    const middle = (MAP_COLLAPSE_SCROLL_PX + MAP_EXPAND_SCROLL_PX) / 2
    expect(nextMapCollapsedState(false, middle)).toBe(false)
  })

  it('keeps the map collapsed in the dead zone after a collapse', () => {
    const middle = (MAP_COLLAPSE_SCROLL_PX + MAP_EXPAND_SCROLL_PX) / 2
    expect(nextMapCollapsedState(true, middle)).toBe(true)
  })

  it('only re-opens when scroll returns to the lower threshold', () => {
    expect(nextMapCollapsedState(true, MAP_EXPAND_SCROLL_PX)).toBe(false)
    expect(nextMapCollapsedState(true, MAP_EXPAND_SCROLL_PX + 1)).toBe(true)
  })

  it('walks through a realistic collapse-then-recover sequence', () => {
    let collapsed = false
    // Scroll down past the collapse threshold.
    collapsed = nextMapCollapsedState(collapsed, 120)
    expect(collapsed).toBe(true)
    // Small bounce back into the dead zone -- must NOT re-open.
    collapsed = nextMapCollapsedState(collapsed, 60)
    expect(collapsed).toBe(true)
    // Further scroll-back into the dead zone -- still collapsed.
    collapsed = nextMapCollapsedState(collapsed, 25)
    expect(collapsed).toBe(true)
    // Reach the bottom -- now re-open.
    collapsed = nextMapCollapsedState(collapsed, 5)
    expect(collapsed).toBe(false)
  })
})
