import { useCallback, useState } from 'react'

export const PROFILE_PAGE_SIZE = 6

/**
 * Tracks how many items of a long list are currently revealed. The counter
 * resets whenever `resetKey` changes so a viewer who scrolled deep on one
 * profile doesn't land halfway into the next.
 *
 * Uses the "adjust state while rendering" pattern from the React docs to
 * reset on key change without an extra effect or ref:
 * https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
 */
export function useReveal(resetKey: unknown, pageSize: number = PROFILE_PAGE_SIZE) {
  const [visible, setVisible] = useState(pageSize)
  const [prevResetKey, setPrevResetKey] = useState(resetKey)
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey)
    setVisible(pageSize)
  }
  const showMore = useCallback(() => setVisible((c) => c + pageSize), [pageSize])
  return { visible, showMore }
}
