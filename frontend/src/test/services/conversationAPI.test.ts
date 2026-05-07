import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Targeted unit coverage for conversationAPI / groupChatAPI / eventChatAPI
 * and the WebSocket URL builders. Stryker mutates string literals,
 * conditional operators, and parameter substitutions; the URL builders
 * have several branches (sessionId? param, http→ws scheme switch) that
 * each warrant a dedicated assertion.
 */

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/services/api', () => ({
  default: apiMocks,
  apiClient: apiMocks,
  getErrorMessage: vi.fn(),
}))

let conversationAPI: typeof import('@/services/conversationAPI').conversationAPI
let groupChatAPI: typeof import('@/services/conversationAPI').groupChatAPI
let eventChatAPI: typeof import('@/services/conversationAPI').eventChatAPI
let buildChatWsUrl: typeof import('@/services/conversationAPI').buildChatWsUrl
let buildGroupChatWsUrl: typeof import('@/services/conversationAPI').buildGroupChatWsUrl
let buildEventChatWsUrl: typeof import('@/services/conversationAPI').buildEventChatWsUrl

beforeEach(async () => {
  apiMocks.get.mockReset()
  apiMocks.post.mockReset()
  vi.resetModules()
  // Force a known location so the URL-builder tests are deterministic.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new URL('http://localhost:5173/dashboard'),
  })
  const mod = await import('@/services/conversationAPI')
  conversationAPI = mod.conversationAPI
  groupChatAPI = mod.groupChatAPI
  eventChatAPI = mod.eventChatAPI
  buildChatWsUrl = mod.buildChatWsUrl
  buildGroupChatWsUrl = mod.buildGroupChatWsUrl
  buildEventChatWsUrl = mod.buildEventChatWsUrl
})

afterEach(() => {
  vi.useRealTimers()
})

describe('conversationAPI.listConversations', () => {
  it('hits /chats/ with the force flag and returns an array body unchanged', async () => {
    apiMocks.get.mockResolvedValue({ data: [{ handshake_id: 'h-1' } as never] })
    const result = await conversationAPI.listConversations()
    expect(apiMocks.get).toHaveBeenCalledWith('/chats/', { signal: undefined, params: { force: 1 } })
    expect(result).toEqual([{ handshake_id: 'h-1' }])
  })

  it('unwraps a paginated DRF response transparently', async () => {
    apiMocks.get.mockResolvedValue({ data: { results: [{ handshake_id: 'h-2' } as never] } })
    const result = await conversationAPI.listConversations()
    expect(result).toEqual([{ handshake_id: 'h-2' }])
  })

  it('returns an empty array when the response has no results key', async () => {
    apiMocks.get.mockResolvedValue({ data: { results: undefined } as never })
    expect(await conversationAPI.listConversations()).toEqual([])
  })
})

describe('conversationAPI.getMessages', () => {
  it('passes through the handshake id and the page_size', async () => {
    apiMocks.get.mockResolvedValue({ data: { results: [], count: 0, next: null, previous: null } })
    await conversationAPI.getMessages('hs-123', undefined, 25)
    expect(apiMocks.get).toHaveBeenCalledWith('/chats/hs-123/', expect.objectContaining({
      params: { page_size: 25 },
    }))
  })

  it('defaults to a page size of 50', async () => {
    apiMocks.get.mockResolvedValue({ data: { results: [], count: 0, next: null, previous: null } })
    await conversationAPI.getMessages('hs-1')
    expect(apiMocks.get).toHaveBeenCalledWith('/chats/hs-1/', expect.objectContaining({
      params: { page_size: 50 },
    }))
  })

  it('returns an empty list when results are missing', async () => {
    apiMocks.get.mockResolvedValue({ data: {} as never })
    expect(await conversationAPI.getMessages('hs-1')).toEqual([])
  })
})

describe('conversationAPI.sendMessage', () => {
  it('posts the handshake id and body and returns the created message', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 'm-1' } as never })
    const out = await conversationAPI.sendMessage('hs-1', 'hello')
    expect(apiMocks.post).toHaveBeenCalledWith('/chats/', { handshake_id: 'hs-1', body: 'hello' })
    expect(out).toEqual({ id: 'm-1' })
  })
})

describe('groupChatAPI', () => {
  it('getSessions calls /group-chat/<id>/ with list_sessions=1', async () => {
    apiMocks.get.mockResolvedValue({ data: { sessions: [{ id: 's-1', scheduled_time: 't' }] } })
    const out = await groupChatAPI.getSessions('svc-1')
    expect(apiMocks.get).toHaveBeenCalledWith('/group-chat/svc-1/', expect.objectContaining({
      params: { list_sessions: 1 },
    }))
    expect(out).toEqual([{ id: 's-1', scheduled_time: 't' }])
  })

  it('getMessages without sessionId omits the session_id param', async () => {
    apiMocks.get.mockResolvedValue({
      data: { service_id: 'svc-1', service_title: 't', participants: [], messages: [] },
    })
    await groupChatAPI.getMessages('svc-1')
    expect(apiMocks.get).toHaveBeenCalledWith('/group-chat/svc-1/', expect.objectContaining({
      params: {},
    }))
  })

  it('getMessages with sessionId attaches the session_id param', async () => {
    apiMocks.get.mockResolvedValue({
      data: { service_id: 'svc-1', service_title: 't', participants: [], messages: [] },
    })
    await groupChatAPI.getMessages('svc-1', undefined, 'sess-9')
    expect(apiMocks.get).toHaveBeenCalledWith('/group-chat/svc-1/', expect.objectContaining({
      params: { session_id: 'sess-9' },
    }))
  })

  it('sendMessage without session sends just the body', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 'g-1' } as never })
    await groupChatAPI.sendMessage('svc-1', 'hi')
    expect(apiMocks.post).toHaveBeenCalledWith('/group-chat/svc-1/', { body: 'hi' })
  })

  it('sendMessage with session adds session_id to the payload', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 'g-2' } as never })
    await groupChatAPI.sendMessage('svc-1', 'hi', 'sess-1')
    expect(apiMocks.post).toHaveBeenCalledWith('/group-chat/svc-1/', { body: 'hi', session_id: 'sess-1' })
  })
})

describe('eventChatAPI', () => {
  it('getMessages flattens the room and messages.results pair', async () => {
    apiMocks.get.mockResolvedValue({
      data: {
        room: { id: 'r-1', name: 'event', type: 'event', related_service: 'svc', created_at: 't' },
        messages: { results: [{ id: 'em-1' } as never] },
      },
    })
    const out = await eventChatAPI.getMessages('svc-1')
    expect(apiMocks.get).toHaveBeenCalledWith('/public-chat/svc-1/', expect.objectContaining({}))
    expect(out.room.id).toBe('r-1')
    expect(out.messages).toEqual([{ id: 'em-1' }])
  })

  it('getMessages tolerates a missing messages payload', async () => {
    apiMocks.get.mockResolvedValue({
      data: {
        room: { id: 'r-1', name: 'event', type: 'event', related_service: null, created_at: 't' },
      } as never,
    })
    const out = await eventChatAPI.getMessages('svc-1')
    expect(out.messages).toEqual([])
  })

  it('sendMessage posts to /public-chat/<id>/ with just the body', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 'm-1' } as never })
    await eventChatAPI.sendMessage('svc-1', 'cheers')
    expect(apiMocks.post).toHaveBeenCalledWith('/public-chat/svc-1/', { body: 'cheers' })
  })
})

describe('WebSocket URL builders', () => {
  it('buildChatWsUrl uses ws:// over http and includes the handshake id', () => {
    expect(buildChatWsUrl('hs-1')).toBe('ws://localhost:5173/ws/chat/hs-1/')
  })

  it('buildGroupChatWsUrl omits session_id when none is supplied', () => {
    expect(buildGroupChatWsUrl('svc-1')).toBe('ws://localhost:5173/ws/group-chat/svc-1/')
  })

  it('buildGroupChatWsUrl appends URL-encoded session_id when supplied', () => {
    expect(buildGroupChatWsUrl('svc-1', 'sess id with space')).toBe(
      'ws://localhost:5173/ws/group-chat/svc-1/?session_id=sess%20id%20with%20space',
    )
  })

  it('buildEventChatWsUrl points at the public-chat path', () => {
    expect(buildEventChatWsUrl('room-1')).toBe('ws://localhost:5173/ws/public-chat/room-1/')
  })

  it('falls back to the wss:// scheme when the page is served over https', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://app.example.com/dashboard'),
    })
    vi.resetModules()
    const mod = await import('@/services/conversationAPI')
    expect(mod.buildChatWsUrl('hs-1')).toBe('wss://app.example.com/ws/chat/hs-1/')
  })
})
