import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const userAPIMock = vi.hoisted(() => ({
  getMyReports: vi.fn(),
}))

vi.mock('@/services/userAPI', () => ({
  userAPI: userAPIMock,
}))

let useMyReports: typeof import('@/hooks/useMyReports').useMyReports

beforeEach(async () => {
  userAPIMock.getMyReports.mockReset()
  vi.resetModules()
  useMyReports = (await import('@/hooks/useMyReports')).useMyReports
})

describe('useMyReports', () => {
  it('starts with reports=null and no error', () => {
    userAPIMock.getMyReports.mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useMyReports())
    expect(result.current.reports).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('exposes loaded reports on success', async () => {
    userAPIMock.getMyReports.mockResolvedValue([{ id: 'r-1', title: 't' }])
    const { result } = renderHook(() => useMyReports())
    await waitFor(() => expect(result.current.reports).toEqual([{ id: 'r-1', title: 't' }]))
  })

  it('captures the error message and resets reports to []', async () => {
    userAPIMock.getMyReports.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useMyReports())
    await waitFor(() => expect(result.current.error).toBe('boom'))
    expect(result.current.reports).toEqual([])
  })

  it('falls back to a generic message when the rejection is not an Error', async () => {
    userAPIMock.getMyReports.mockRejectedValue('nope')
    const { result } = renderHook(() => useMyReports())
    await waitFor(() => expect(result.current.error).toBe('Failed to load reports'))
  })

  it('aborts the in-flight request on unmount', async () => {
    let observedSignal: AbortSignal | undefined
    userAPIMock.getMyReports.mockImplementation((signal: AbortSignal) => {
      observedSignal = signal
      return new Promise(() => {})
    })
    const { unmount } = renderHook(() => useMyReports())
    unmount()
    expect(observedSignal?.aborted).toBe(true)
  })

  it('does not surface an error when rejection arrives after abort', async () => {
    let rejectFn!: (reason?: unknown) => void
    userAPIMock.getMyReports.mockImplementation((signal: AbortSignal) =>
      new Promise<never>((_, reject) => {
        rejectFn = reject
        signal.addEventListener('abort', () => reject(new Error('aborted')))
      }),
    )
    const { result, unmount } = renderHook(() => useMyReports())
    unmount()
    rejectFn(new Error('aborted'))
    await new Promise<void>((r) => setTimeout(r, 0))
    expect(result.current.error).toBeNull()
  })
})
