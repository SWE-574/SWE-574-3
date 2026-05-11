import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PROFILE_PAGE_SIZE, useReveal } from '@/hooks/useReveal'

describe('useReveal', () => {
  it('starts at PROFILE_PAGE_SIZE by default', () => {
    const { result } = renderHook(() => useReveal('user-1'))
    expect(result.current.visible).toBe(PROFILE_PAGE_SIZE)
  })

  it('respects a custom page size for both initial value and increments', () => {
    const { result } = renderHook(() => useReveal('user-1', 4))
    expect(result.current.visible).toBe(4)
    act(() => result.current.showMore())
    expect(result.current.visible).toBe(8)
  })

  it('grows by pageSize each time showMore is called', () => {
    const { result } = renderHook(() => useReveal('user-1'))
    act(() => result.current.showMore())
    expect(result.current.visible).toBe(PROFILE_PAGE_SIZE * 2)
    act(() => result.current.showMore())
    expect(result.current.visible).toBe(PROFILE_PAGE_SIZE * 3)
  })

  it('resets back to pageSize when resetKey changes', () => {
    const { result, rerender } = renderHook(({ key }: { key: string }) => useReveal(key), {
      initialProps: { key: 'user-1' },
    })
    act(() => result.current.showMore())
    expect(result.current.visible).toBe(PROFILE_PAGE_SIZE * 2)
    rerender({ key: 'user-2' })
    expect(result.current.visible).toBe(PROFILE_PAGE_SIZE)
  })

  it('does not reset when resetKey stays the same across renders', () => {
    const { result, rerender } = renderHook(({ key }: { key: string }) => useReveal(key), {
      initialProps: { key: 'user-1' },
    })
    act(() => result.current.showMore())
    rerender({ key: 'user-1' })
    expect(result.current.visible).toBe(PROFILE_PAGE_SIZE * 2)
  })
})
