import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWebSocket } from '@/hooks/useWebSocket'
import { installMockWebSocket, MockWebSocket } from '@/test/helpers/mockWebSocket'

let restoreWS: () => void

beforeEach(() => {
  restoreWS = installMockWebSocket()
})

afterEach(() => {
  restoreWS()
  vi.useRealTimers()
})

describe('useWebSocket — connect', () => {
  it('opens the given url verbatim when no token is supplied', () => {
    renderHook(() => useWebSocket({ url: 'ws://host/ws/chat/1/' }))
    expect(MockWebSocket.last().url).toBe('ws://host/ws/chat/1/')
  })

  it('appends ?token= when token is supplied (mobile path)', () => {
    renderHook(() => useWebSocket({ url: 'ws://host/ws/chat/1/', token: 'abc 123' }))
    expect(MockWebSocket.last().url).toBe('ws://host/ws/chat/1/?token=abc%20123')
  })

  it('appends with & when url already has a query string', () => {
    renderHook(() => useWebSocket({ url: 'ws://host/ws/chat/1/?room=2', token: 't' }))
    expect(MockWebSocket.last().url).toBe('ws://host/ws/chat/1/?room=2&token=t')
  })

  it('does not open when enabled is false', () => {
    renderHook(() => useWebSocket({ url: 'ws://host/', enabled: false }))
    expect(MockWebSocket.instances).toHaveLength(0)
  })

  it('flips isConnected on open and back on close', () => {
    const { result } = renderHook(() => useWebSocket({ url: 'ws://host/' }))
    expect(result.current.isConnected).toBe(false)
    act(() => MockWebSocket.last().triggerOpen())
    expect(result.current.isConnected).toBe(true)
    act(() => MockWebSocket.last().triggerClose({ code: 1000 }))
    expect(result.current.isConnected).toBe(false)
  })
})

describe('useWebSocket — message dispatch', () => {
  it('forwards chat_message frames to onMessage', () => {
    const onMessage = vi.fn()
    renderHook(() => useWebSocket({ url: 'ws://host/', onMessage }))
    act(() => {
      MockWebSocket.last().triggerOpen()
      MockWebSocket.last().triggerMessage({ type: 'chat_message', message: { id: 1, body: 'hi' } })
    })
    expect(onMessage).toHaveBeenCalledWith({ id: 1, body: 'hi' })
  })

  it('forwards notification frames to onMessage', () => {
    const onMessage = vi.fn()
    renderHook(() => useWebSocket({ url: 'ws://host/', onMessage }))
    act(() => {
      MockWebSocket.last().triggerOpen()
      MockWebSocket.last().triggerMessage({ type: 'notification', message: { id: 'n-1' } })
    })
    expect(onMessage).toHaveBeenCalledWith({ id: 'n-1' })
  })

  it('ignores unknown frame types', () => {
    const onMessage = vi.fn()
    renderHook(() => useWebSocket({ url: 'ws://host/', onMessage }))
    act(() => {
      MockWebSocket.last().triggerOpen()
      MockWebSocket.last().triggerMessage({ type: 'pong' })
    })
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('swallows malformed JSON frames', () => {
    const onMessage = vi.fn()
    renderHook(() => useWebSocket({ url: 'ws://host/', onMessage }))
    act(() => {
      MockWebSocket.last().triggerOpen()
      MockWebSocket.last().triggerMessage('not-json{')
    })
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('uses the latest onMessage callback even after re-render', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ cb }) => useWebSocket({ url: 'ws://host/', onMessage: cb }),
      { initialProps: { cb: first } },
    )
    act(() => MockWebSocket.last().triggerOpen())
    rerender({ cb: second })
    act(() => {
      MockWebSocket.last().triggerMessage({ type: 'chat_message', message: 'x' })
    })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('x')
  })
})

describe('useWebSocket — sendMessage', () => {
  it('serialises and sends when socket is OPEN', () => {
    const { result } = renderHook(() => useWebSocket({ url: 'ws://host/' }))
    act(() => MockWebSocket.last().triggerOpen())
    let ok = false
    act(() => { ok = result.current.sendMessage('hello') })
    expect(ok).toBe(true)
    expect(MockWebSocket.last().sent).toEqual([
      JSON.stringify({ type: 'chat_message', body: 'hello' }),
    ])
  })

  it('returns false when socket is not OPEN', () => {
    const { result } = renderHook(() => useWebSocket({ url: 'ws://host/' }))
    let ok = true
    act(() => { ok = result.current.sendMessage('hi') })
    expect(ok).toBe(false)
    expect(MockWebSocket.last().sent).toEqual([])
  })
})

describe('useWebSocket — reconnect', () => {
  beforeEach(() => vi.useFakeTimers())

  it('schedules a reconnect after a non-clean close', () => {
    renderHook(() => useWebSocket({ url: 'ws://host/' }))
    act(() => MockWebSocket.last().triggerOpen())
    expect(MockWebSocket.instances).toHaveLength(1)
    // open >2s so backoff uses 2^prev, not the 8s "short open" path
    act(() => { vi.advanceTimersByTime(2_500) })
    act(() => MockWebSocket.last().triggerClose({ code: 1006 }))
    act(() => { vi.advanceTimersByTime(1_000) })
    expect(MockWebSocket.instances).toHaveLength(2)
  })

  it('uses 8s backoff when the connection lasted less than 2s', () => {
    renderHook(() => useWebSocket({ url: 'ws://host/' }))
    act(() => MockWebSocket.last().triggerOpen())
    act(() => MockWebSocket.last().triggerClose({ code: 1006 }))
    // 1s would be the normal first backoff; we expect 8s instead.
    act(() => { vi.advanceTimersByTime(1_000) })
    expect(MockWebSocket.instances).toHaveLength(1)
    act(() => { vi.advanceTimersByTime(7_500) })
    expect(MockWebSocket.instances).toHaveLength(2)
  })

  it('does not reconnect on application-level rejection (code ≥ 4000)', () => {
    renderHook(() => useWebSocket({ url: 'ws://host/' }))
    act(() => MockWebSocket.last().triggerOpen())
    act(() => MockWebSocket.last().triggerClose({ code: 4001 }))
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(MockWebSocket.instances).toHaveLength(1)
  })

  it('does not reconnect on a clean close (code 1000)', () => {
    renderHook(() => useWebSocket({ url: 'ws://host/' }))
    act(() => MockWebSocket.last().triggerOpen())
    act(() => MockWebSocket.last().triggerClose({ code: 1000 }))
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(MockWebSocket.instances).toHaveLength(1)
  })

  it('caps reconnect attempts at 5', () => {
    // Each iteration: open + close-without-stabilising → 8s backoff branch.
    // Closing before 2s clears the stable-timer, so reconnectAttempts keeps
    // climbing and the 5-cap kicks in.
    renderHook(() => useWebSocket({ url: 'ws://host/' }))
    for (let i = 0; i < 8; i++) {
      act(() => MockWebSocket.last().triggerOpen())
      act(() => MockWebSocket.last().triggerClose({ code: 1006 }))
      act(() => { vi.advanceTimersByTime(9_000) })
    }
    // 1 initial + 5 retries = 6 total; further closes don't schedule.
    expect(MockWebSocket.instances).toHaveLength(6)
  })
})

describe('useWebSocket — url change & disconnect', () => {
  it('opens a new socket when url changes', () => {
    const { rerender } = renderHook(
      ({ url }) => useWebSocket({ url }),
      { initialProps: { url: 'ws://a/' } },
    )
    expect(MockWebSocket.last().url).toBe('ws://a/')
    rerender({ url: 'ws://b/' })
    expect(MockWebSocket.instances).toHaveLength(2)
    expect(MockWebSocket.last().url).toBe('ws://b/')
  })

  it('does not reopen when url is unchanged', () => {
    const { rerender } = renderHook(
      ({ url }: { url: string }) => useWebSocket({ url }),
      { initialProps: { url: 'ws://a/' } },
    )
    act(() => MockWebSocket.last().triggerOpen())
    rerender({ url: 'ws://a/' })
    expect(MockWebSocket.instances).toHaveLength(1)
  })

  it('closes with code 1000 on disconnect()', () => {
    const { result } = renderHook(() => useWebSocket({ url: 'ws://host/' }))
    act(() => MockWebSocket.last().triggerOpen())
    const ws = MockWebSocket.last()
    act(() => result.current.disconnect())
    expect(ws.closed?.code).toBe(1000)
    expect(result.current.isConnected).toBe(false)
  })

  it('disconnects on unmount', () => {
    const { unmount } = renderHook(() => useWebSocket({ url: 'ws://host/' }))
    act(() => MockWebSocket.last().triggerOpen())
    const ws = MockWebSocket.last()
    unmount()
    expect(ws.closed?.code).toBe(1000)
  })
})
