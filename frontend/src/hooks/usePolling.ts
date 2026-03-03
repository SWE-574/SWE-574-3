import { useState, useEffect, useCallback, useRef } from 'react'

interface UsePollingOptions {
  /** Milliseconds between each poll. */
  interval: number
  /** When false the polling is paused (default: true). */
  enabled?: boolean
}

interface UsePollingResult {
  isLoading: boolean
  error: Error | null
}

/**
 * Repeatedly calls `fn` on mount and every `interval` milliseconds.
 * Passes an AbortSignal so the function can cancel in-flight requests.
 * Re-subscribes whenever `deps` change.
 */
export function usePolling(
  fn: (signal: AbortSignal) => Promise<void>,
  deps: React.DependencyList,
  { interval, enabled = true }: UsePollingOptions,
): UsePollingResult {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Keep a stable ref to fn so the interval closure doesn't stale-close over it
  const fnRef = useRef(fn)
  useEffect(() => { fnRef.current = fn })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(async (signal: AbortSignal) => {
    if (signal.aborted) return
    setIsLoading(true)
    try {
      await fnRef.current(signal)
      if (!signal.aborted) setError(null)
    } catch (e: unknown) {
      if (!signal.aborted) {
        setError(e instanceof Error ? e : new Error(String(e)))
      }
    } finally {
      if (!signal.aborted) setIsLoading(false)
    }
  // deps are intentionally spread here so callers control re-subscription
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    if (!enabled) return

    const ctrl = new AbortController()

    // Fire immediately, then on a timer
    run(ctrl.signal)
    const id = setInterval(() => run(ctrl.signal), interval)

    return () => {
      ctrl.abort()
      clearInterval(id)
    }
  }, [run, interval, enabled])

  return { isLoading, error }
}
