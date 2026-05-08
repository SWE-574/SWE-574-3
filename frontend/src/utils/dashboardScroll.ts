// Map collapse uses hysteresis to avoid flicker around the threshold:
// scroll past _COLLAPSE_PX collapses the map, but scrolling back must
// reach _EXPAND_PX (much smaller) before the map re-opens. Without the
// gap a small scroll-back would re-trigger the original threshold and
// produce a jitter loop. The DashboardPage scroll handler also wraps
// these decisions in a setTimeout debounce.
export const MAP_COLLAPSE_SCROLL_PX = 80
export const MAP_EXPAND_SCROLL_PX = 20
export const MAP_SCROLL_DEBOUNCE_MS = 50

// Pure hysteresis decision for the dashboard grid scroll handler.
// Returns the next collapsed state. Returns the input state unchanged
// when the scroll position is in the dead zone between EXPAND and
// COLLAPSE thresholds.
export function nextMapCollapsedState(
  currentlyCollapsed: boolean,
  scrollTop: number,
): boolean {
  if (scrollTop > MAP_COLLAPSE_SCROLL_PX) return true
  if (scrollTop <= MAP_EXPAND_SCROLL_PX) return false
  return currentlyCollapsed
}
