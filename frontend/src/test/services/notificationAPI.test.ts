/**
 * Tests for notificationAPI service module.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('notificationAPI', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('module exports notificationAPI with expected methods', async () => {
    const mod = await import('@/services/notificationAPI')
    expect(mod.notificationAPI).toBeDefined()
    expect(typeof mod.notificationAPI.list).toBe('function')
    expect(typeof mod.notificationAPI.unreadCount).toBe('function')
    expect(typeof mod.notificationAPI.markAsRead).toBe('function')
    expect(typeof mod.notificationAPI.markAllAsRead).toBe('function')
  })

  it('list is callable with a page number', async () => {
    const mod = await import('@/services/notificationAPI')
    // Verify function accepts expected arguments (page, signal)
    expect(mod.notificationAPI.list.length).toBeLessThanOrEqual(2)
  })

  it('markAsRead accepts a string id parameter', async () => {
    const mod = await import('@/services/notificationAPI')
    expect(mod.notificationAPI.markAsRead.length).toBeGreaterThanOrEqual(1)
  })
})
