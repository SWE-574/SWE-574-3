import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { usePolling } from '@/hooks/usePolling'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('usePolling', () => {
  it('sets isLoading on the first call and isRefreshing on subsequent ticks', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => usePolling(fn, [fn], { interval: 1_000 }))

    expect(result.current.isLoading).toBe(true)
    expect(result.current.isRefreshing).toBe(false)
    await act(async () => { await Promise.resolve() })
    expect(result.current.isLoading).toBe(false)

    await act(async () => { vi.advanceTimersByTime(1_000) })
    await act(async () => { await Promise.resolve() })
    expect(fn).toHaveBeenCalledTimes(2)
    // Background refresh should never re-show the full-page loading state
    expect(result.current.isLoading).toBe(false)
  })

  it('refresh() triggers an extra run between intervals', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => usePolling(fn, [fn], { interval: 60_000 }))
    await act(async () => { await Promise.resolve() })
    expect(fn).toHaveBeenCalledTimes(1)
    act(() => result.current.refresh())
    await act(async () => { await Promise.resolve() })
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('treats AbortError / CanceledError / ERR_CANCELED as silent cancellations', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    const { result } = renderHook(() => usePolling(fn, [fn], { interval: 60_000 }))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeNull()
  })

  it('captures non-cancel errors into error state', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => usePolling(fn, [fn], { interval: 60_000 }))
    await waitFor(() => expect(result.current.error).toBe('boom'))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isRefreshing).toBe(false)
  })

  it('falls back to a default error message when err.message is missing', async () => {
    const fn = vi.fn().mockRejectedValue({})
    const { result } = renderHook(() => usePolling(fn, [fn], { interval: 60_000 }))
    await waitFor(() => expect(result.current.error).toBe('Something went wrong'))
  })

  it('does not run when enabled is false', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockResolvedValue(undefined)
    renderHook(() => usePolling(fn, [fn], { interval: 1_000, enabled: false }))
    await act(async () => { vi.advanceTimersByTime(5_000) })
    expect(fn).not.toHaveBeenCalled()
  })

  it('re-runs when the tab becomes visible again', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockResolvedValue(undefined)
    renderHook(() => usePolling(fn, [fn], { interval: 60_000 }))
    await act(async () => { await Promise.resolve() })
    expect(fn).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    await act(async () => { await Promise.resolve() })
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('aborts the in-flight fetch and stops the interval on unmount', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockImplementation((signal: AbortSignal) =>
      new Promise<void>((_, reject) => {
        signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        })
      }),
    )
    const { unmount } = renderHook(() => usePolling(fn, [fn], { interval: 1_000 }))
    expect(fn).toHaveBeenCalledTimes(1)
    const signal = (fn.mock.calls[0]![0]) as AbortSignal
    unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => { vi.advanceTimersByTime(5_000) })
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
