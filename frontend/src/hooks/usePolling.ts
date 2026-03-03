import { useEffect, useRef, useCallback, useState } from 'react'

interface UsePollingOptions {
  /** Polling interval in ms. Default: 30 000 */
  interval?: number
  /** Re-fetch when the browser tab becomes visible again. Default: true */
  onVisibility?: boolean
  /** Start polling immediately on mount. Default: true */
  enabled?: boolean
}

interface UsePollingResult {
  /** True only during the very first fetch — use to show a full-page skeleton */
  isLoading: boolean
  /** True during background refreshes — use to show a subtle indicator */
  isRefreshing: boolean
  /** Last error message, null when healthy */
  error: string | null
  /** Manually trigger a background refresh */
  refresh: () => void
}

/**
 * usePolling — generic polling hook with first-load vs background-refresh distinction.
 *
 * @param fn   Async function to call on every tick. Receives an AbortSignal.
 * @param deps Dependency array; changing any dep restarts the polling cycle.
 *             NOTE: wrap `fn` in useCallback to avoid infinite loops.
 *
 * @example
 * const fetch = useCallback(async (signal) => {
 *   const data = await myAPI.list({ signal })
 *   setItems(data)
 * }, [filter])
 *
 * const { isLoading, isRefreshing } = usePolling(fetch, [fetch])
 */
export function usePolling(
  fn: (signal: AbortSignal) => Promise<void>,
  deps: unknown[],
  { interval = 30_000, onVisibility = true, enabled = true }: UsePollingOptions = {},
): UsePollingResult {
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Survives re-renders and dep changes — spinner only on the very first fetch ever
  const hasLoadedOnce = useRef(false)
  // Allows manual refresh trigger
  const manualTick = useRef(0)

  const refresh = useCallback(() => {
    manualTick.current += 1
    // Force re-run by triggering state update via the effect dependency below
    setError(null)
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!enabled) return

    let mounted = true
    const controller = new AbortController()

    const run = async () => {
      if (!hasLoadedOnce.current) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }
      setError(null)

      try {
        await fn(controller.signal)
        if (mounted) {
          hasLoadedOnce.current = true
          setIsLoading(false)
          setIsRefreshing(false)
        }
      } catch (err: unknown) {
        if (!mounted) return
        const e = err as { name?: string; code?: string; message?: string }
        if (
          e?.name === 'AbortError' ||
          e?.name === 'CanceledError' ||
          e?.code === 'ERR_CANCELED'
        ) {
          setIsLoading(false)
          setIsRefreshing(false)
          return
        }
        setError(e?.message ?? 'Something went wrong')
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }

    run()
    const timer = setInterval(run, interval)

    const onVisibilityChange = () => {
      if (onVisibility && !document.hidden && mounted) run()
    }
    if (onVisibility) {
      document.addEventListener('visibilitychange', onVisibilityChange)
    }

    return () => {
      mounted = false
      controller.abort()
      clearInterval(timer)
      if (onVisibility) {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
    }
  // deps intentionally spread — eslint-disable covers the dynamic array
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, interval, onVisibility, enabled, manualTick.current])

  return { isLoading, isRefreshing, error, refresh }
}
