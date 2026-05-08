import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}))
vi.mock('@/services/api', () => ({
  default: apiMocks,
  apiClient: apiMocks,
  getErrorMessage: vi.fn(),
}))

let adminAPI: typeof import('@/services/adminAPI').adminAPI

beforeEach(async () => {
  Object.values(apiMocks).forEach((fn) => fn.mockReset())
  vi.resetModules()
  adminAPI = (await import('@/services/adminAPI')).adminAPI
})

describe('adminAPI.getMetrics / getSettings / updateSettings', () => {
  it('GETs /metrics/', async () => {
    apiMocks.get.mockResolvedValue({ data: { active_users: 0 } })
    await adminAPI.getMetrics()
    expect(apiMocks.get).toHaveBeenCalledWith('/metrics/', { signal: undefined })
  })

  it('GETs /admin/settings/', async () => {
    apiMocks.get.mockResolvedValue({ data: {} })
    await adminAPI.getSettings()
    expect(apiMocks.get).toHaveBeenCalledWith('/admin/settings/', { signal: undefined })
  })

  it('PATCHes /admin/settings/ with the partial payload', async () => {
    apiMocks.patch.mockResolvedValue({ data: {} })
    await adminAPI.updateSettings({ feature_flag: true } as never)
    expect(apiMocks.patch).toHaveBeenCalledWith('/admin/settings/', { feature_flag: true }, { signal: undefined })
  })
})

describe('adminAPI.getReports', () => {
  it('defaults status=pending, page=1, page_size=20 and includes a cache-bust _t', async () => {
    apiMocks.get.mockResolvedValue({ data: [] })
    await adminAPI.getReports()
    const params = apiMocks.get.mock.calls[0][1].params
    expect(params).toMatchObject({ status: 'pending', page: 1, page_size: 20 })
    expect(typeof params._t).toBe('number')
  })

  it('wraps a bare-array response into a paginated structure', async () => {
    apiMocks.get.mockResolvedValue({ data: [{ id: 'r-1' }, { id: 'r-2' }] })
    const out = await adminAPI.getReports()
    expect(out).toEqual({ count: 2, next: null, previous: null, results: [{ id: 'r-1' }, { id: 'r-2' }] })
  })

  it('passes through paginated responses unchanged', async () => {
    const payload = { count: 5, next: 'p2', previous: null, results: [{ id: 'r-1' }] }
    apiMocks.get.mockResolvedValue({ data: payload })
    const out = await adminAPI.getReports('resolved', 2, 50)
    expect(out).toBe(payload)
  })
})

describe('adminAPI.resolveReport / pauseHandshake', () => {
  it('resolveReport POSTs the action and admin_notes payload', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 'r-1' } })
    await adminAPI.resolveReport('r-1', 'mark_resolved', 'note')
    expect(apiMocks.post).toHaveBeenCalledWith(
      '/admin/reports/r-1/resolve/',
      { action: 'mark_resolved', admin_notes: 'note' },
      { signal: undefined },
    )
  })

  it('resolveReport defaults admin_notes to empty string when omitted', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 'r-1' } })
    await adminAPI.resolveReport('r-1', 'dismiss')
    expect(apiMocks.post.mock.calls[0][1].admin_notes).toBe('')
  })

  it('pauseHandshake POSTs an empty body to /pause/', async () => {
    apiMocks.post.mockResolvedValue({ data: { status: 'paused' } })
    await adminAPI.pauseHandshake('r-1')
    expect(apiMocks.post).toHaveBeenCalledWith('/admin/reports/r-1/pause/', {}, { signal: undefined })
  })
})

describe('adminAPI.getUsers', () => {
  it('omits search/status when undefined and forwards page/page_size', async () => {
    apiMocks.get.mockResolvedValue({ data: { count: 0, results: [] } })
    await adminAPI.getUsers()
    expect(apiMocks.get).toHaveBeenCalledWith('/admin/users/', {
      params: { search: undefined, status: undefined, page: 1, page_size: 20 },
      signal: undefined,
    })
  })

  it('passes search and status when set', async () => {
    apiMocks.get.mockResolvedValue({ data: { count: 0, results: [] } })
    await adminAPI.getUsers('alice', 'banned', 2, 10)
    expect(apiMocks.get).toHaveBeenCalledWith('/admin/users/', {
      params: { search: 'alice', status: 'banned', page: 2, page_size: 10 },
      signal: undefined,
    })
  })
})

describe('adminAPI.warnUser / banUser / unbanUser / adjustKarma / assignUserRole', () => {
  it('warnUser POSTs message', async () => {
    apiMocks.post.mockResolvedValue({ data: {} })
    await adminAPI.warnUser('u-1', 'be nice')
    expect(apiMocks.post).toHaveBeenCalledWith(
      '/admin/users/u-1/warn/',
      { message: 'be nice' },
      { signal: undefined },
    )
  })

  it('banUser POSTs empty body', async () => {
    apiMocks.post.mockResolvedValue({ data: {} })
    await adminAPI.banUser('u-1')
    expect(apiMocks.post).toHaveBeenCalledWith('/admin/users/u-1/ban/', {}, { signal: undefined })
  })

  it('unbanUser POSTs empty body', async () => {
    apiMocks.post.mockResolvedValue({ data: {} })
    await adminAPI.unbanUser('u-1')
    expect(apiMocks.post).toHaveBeenCalledWith('/admin/users/u-1/unban/', {}, { signal: undefined })
  })

  it('adjustKarma POSTs adjustment value', async () => {
    apiMocks.post.mockResolvedValue({ data: { new_karma: 5 } })
    await adminAPI.adjustKarma('u-1', -3)
    expect(apiMocks.post).toHaveBeenCalledWith(
      '/admin/users/u-1/adjust-karma/',
      { adjustment: -3 },
      { signal: undefined },
    )
  })

  it('assignUserRole POSTs role', async () => {
    apiMocks.post.mockResolvedValue({ data: {} })
    await adminAPI.assignUserRole('u-1', 'moderator')
    expect(apiMocks.post).toHaveBeenCalledWith(
      '/admin/users/u-1/assign-role/',
      { role: 'moderator' },
      { signal: undefined },
    )
  })
})

describe('adminAPI.getComments', () => {
  it('defaults status=active, omits search when empty', async () => {
    apiMocks.get.mockResolvedValue({ data: [] })
    await adminAPI.getComments()
    expect(apiMocks.get).toHaveBeenCalledWith('/admin/comments/', {
      params: { status: 'active', page: 1, page_size: 20, search: undefined },
      signal: undefined,
    })
  })

  it('forwards search when set', async () => {
    apiMocks.get.mockResolvedValue({ data: [] })
    await adminAPI.getComments('removed', 2, 10, 'spam')
    expect(apiMocks.get).toHaveBeenCalledWith('/admin/comments/', {
      params: { status: 'removed', page: 2, page_size: 10, search: 'spam' },
      signal: undefined,
    })
  })
})

describe('adminAPI.removeComment / restoreComment', () => {
  it('removeComment POSTs to /remove/', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 'c-1' } })
    await adminAPI.removeComment('c-1')
    expect(apiMocks.post).toHaveBeenCalledWith('/admin/comments/c-1/remove/', {}, { signal: undefined })
  })

  it('restoreComment POSTs to /restore/', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 'c-1' } })
    await adminAPI.restoreComment('c-1')
    expect(apiMocks.post).toHaveBeenCalledWith('/admin/comments/c-1/restore/', {}, { signal: undefined })
  })
})

describe('adminAPI.getAuditLogs', () => {
  it('omits action_type when blank, drops target_entity when "all"', async () => {
    apiMocks.get.mockResolvedValue({ data: [] })
    await adminAPI.getAuditLogs(undefined, 'all')
    expect(apiMocks.get).toHaveBeenCalledWith('/admin/audit-logs/', {
      params: { action_type: undefined, target_entity: undefined, page: 1, page_size: 20 },
      signal: undefined,
    })
  })

  it('passes through specific filter values', async () => {
    apiMocks.get.mockResolvedValue({ data: [] })
    await adminAPI.getAuditLogs('ban', 'user', 3, 25)
    expect(apiMocks.get).toHaveBeenCalledWith('/admin/audit-logs/', {
      params: { action_type: 'ban', target_entity: 'user', page: 3, page_size: 25 },
      signal: undefined,
    })
  })
})
