/**
 * Tests for event chat API helpers and WebSocket URL builder
 * (GitHub issue #76).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// We need to mock window.location before importing the module
// since wsBase is computed at module load time.
// Instead, test the exported functions that use relative paths through apiClient.

describe('eventChatAPI', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('module exports eventChatAPI with getMessages and sendMessage', async () => {
    const mod = await import('@/services/conversationAPI')
    expect(mod.eventChatAPI).toBeDefined()
    expect(typeof mod.eventChatAPI.getMessages).toBe('function')
    expect(typeof mod.eventChatAPI.sendMessage).toBe('function')
  })

  it('module exports buildEventChatWsUrl function', async () => {
    const mod = await import('@/services/conversationAPI')
    expect(typeof mod.buildEventChatWsUrl).toBe('function')
  })

  it('buildEventChatWsUrl produces correct path format', async () => {
    const mod = await import('@/services/conversationAPI')
    const url = mod.buildEventChatWsUrl('abc-123')
    // Should end with the correct path regardless of protocol/host
    expect(url).toContain('/ws/public-chat/abc-123/')
  })

  it('buildChatWsUrl produces ws/chat path', async () => {
    const mod = await import('@/services/conversationAPI')
    const url = mod.buildChatWsUrl('xyz-789')
    expect(url).toContain('/ws/chat/xyz-789/')
  })

  it('buildGroupChatWsUrl produces ws/group-chat path', async () => {
    const mod = await import('@/services/conversationAPI')
    const url = mod.buildGroupChatWsUrl('svc-456')
    expect(url).toContain('/ws/group-chat/svc-456/')
  })

  it('buildGroupChatWsUrl with sessionId adds session_id query', async () => {
    const mod = await import('@/services/conversationAPI')
    const url = mod.buildGroupChatWsUrl('svc-456', 'session-uuid-123')
    expect(url).toContain('/ws/group-chat/svc-456/')
    expect(url).toContain('session_id=session-uuid-123')
  })
})

describe('PublicChatMessage type exports', () => {
  it('conversationAPI module exports all expected API objects', async () => {
    const mod = await import('@/services/conversationAPI')
    expect(mod.conversationAPI).toBeDefined()
    expect(mod.groupChatAPI).toBeDefined()
    expect(mod.eventChatAPI).toBeDefined()

    // conversationAPI
    expect(typeof mod.conversationAPI.listConversations).toBe('function')
    expect(typeof mod.conversationAPI.getMessages).toBe('function')
    expect(typeof mod.conversationAPI.sendMessage).toBe('function')

    // groupChatAPI
    expect(typeof mod.groupChatAPI.getSessions).toBe('function')
    expect(typeof mod.groupChatAPI.getMessages).toBe('function')
    expect(typeof mod.groupChatAPI.sendMessage).toBe('function')

    // eventChatAPI
    expect(typeof mod.eventChatAPI.getMessages).toBe('function')
    expect(typeof mod.eventChatAPI.sendMessage).toBe('function')
  })
})
