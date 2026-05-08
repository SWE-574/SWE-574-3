import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}))
vi.mock('@/services/api', () => ({
  default: apiMocks,
  apiClient: apiMocks,
  getErrorMessage: vi.fn(),
}))

let forumAPI: typeof import('@/services/forumAPI').forumAPI

beforeEach(async () => {
  Object.values(apiMocks).forEach((fn) => fn.mockReset())
  vi.resetModules()
  forumAPI = (await import('@/services/forumAPI')).forumAPI
})

describe('forumAPI.listCategories', () => {
  it('GETs /forum/categories/', async () => {
    apiMocks.get.mockResolvedValue({ data: [{ slug: 'general' }] })
    const out = await forumAPI.listCategories()
    expect(apiMocks.get).toHaveBeenCalledWith('/forum/categories/', { signal: undefined })
    expect(out).toEqual([{ slug: 'general' }])
  })
})

describe('forumAPI.getCategory', () => {
  it('GETs /forum/categories/:slug/', async () => {
    apiMocks.get.mockResolvedValue({ data: { slug: 'general' } })
    const out = await forumAPI.getCategory('general')
    expect(apiMocks.get).toHaveBeenCalledWith('/forum/categories/general/', { signal: undefined })
    expect(out).toEqual({ slug: 'general' })
  })
})

describe('forumAPI.listTopics', () => {
  it('GETs /forum/topics/ with no params by default', async () => {
    apiMocks.get.mockResolvedValue({ data: { count: 0, results: [] } })
    await forumAPI.listTopics()
    expect(apiMocks.get).toHaveBeenCalledWith('/forum/topics/', { params: {}, signal: undefined })
  })

  it('forwards category/page/page_size/sort params', async () => {
    apiMocks.get.mockResolvedValue({ data: { count: 0, results: [] } })
    await forumAPI.listTopics({ category: 'general', page: 2, page_size: 50, sort: 'most_active' })
    expect(apiMocks.get).toHaveBeenCalledWith('/forum/topics/', {
      params: { category: 'general', page: 2, page_size: 50, sort: 'most_active' },
      signal: undefined,
    })
  })
})

describe('forumAPI.getTopic / createTopic / updateTopic / deleteTopic', () => {
  it('getTopic GETs /forum/topics/:id/', async () => {
    apiMocks.get.mockResolvedValue({ data: { id: 't-1' } })
    const out = await forumAPI.getTopic('t-1')
    expect(apiMocks.get).toHaveBeenCalledWith('/forum/topics/t-1/', { signal: undefined })
    expect(out).toEqual({ id: 't-1' })
  })

  it('createTopic POSTs the title/body/category payload', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 't-2' } })
    const out = await forumAPI.createTopic({ title: 'T', body: 'B', category: 'general' })
    expect(apiMocks.post).toHaveBeenCalledWith('/forum/topics/', {
      title: 'T', body: 'B', category: 'general',
    })
    expect(out).toEqual({ id: 't-2' })
  })

  it('updateTopic PATCHes /forum/topics/:id/', async () => {
    apiMocks.patch.mockResolvedValue({ data: { id: 't-1', title: 'New' } })
    await forumAPI.updateTopic('t-1', { title: 'New' })
    expect(apiMocks.patch).toHaveBeenCalledWith('/forum/topics/t-1/', { title: 'New' })
  })

  it('deleteTopic DELETEs /forum/topics/:id/', async () => {
    apiMocks.delete.mockResolvedValue({})
    await forumAPI.deleteTopic('t-1')
    expect(apiMocks.delete).toHaveBeenCalledWith('/forum/topics/t-1/')
  })
})

describe('forumAPI.pinTopic / lockTopic', () => {
  it('pinTopic POSTs to /forum/topics/:id/pin/', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 't-1' } })
    await forumAPI.pinTopic('t-1')
    expect(apiMocks.post).toHaveBeenCalledWith('/forum/topics/t-1/pin/')
  })

  it('lockTopic POSTs to /forum/topics/:id/lock/', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 't-1' } })
    await forumAPI.lockTopic('t-1')
    expect(apiMocks.post).toHaveBeenCalledWith('/forum/topics/t-1/lock/')
  })
})

describe('forumAPI.reportTopic / reportPost', () => {
  it('reportTopic posts type+description to /forum/topics/:id/report/', async () => {
    apiMocks.post.mockResolvedValue({})
    await forumAPI.reportTopic('t-1', 'spam', 'because')
    expect(apiMocks.post).toHaveBeenCalledWith('/forum/topics/t-1/report/', {
      type: 'spam', description: 'because',
    })
  })

  it('reportTopic defaults description to empty string when omitted', async () => {
    apiMocks.post.mockResolvedValue({})
    await forumAPI.reportTopic('t-1', 'inappropriate_content')
    expect(apiMocks.post).toHaveBeenCalledWith('/forum/topics/t-1/report/', {
      type: 'inappropriate_content', description: '',
    })
  })

  it('reportPost posts to /forum/posts/:id/report/', async () => {
    apiMocks.post.mockResolvedValue({})
    await forumAPI.reportPost('p-1', 'harassment', 'detail')
    expect(apiMocks.post).toHaveBeenCalledWith('/forum/posts/p-1/report/', {
      type: 'harassment', description: 'detail',
    })
  })
})

describe('forumAPI posts (listPosts, createPost, updatePost, deletePost)', () => {
  it('listPosts GETs /forum/topics/:id/posts/ with params', async () => {
    apiMocks.get.mockResolvedValue({ data: { count: 0, results: [] } })
    await forumAPI.listPosts('t-1', { page: 2, page_size: 25 })
    expect(apiMocks.get).toHaveBeenCalledWith('/forum/topics/t-1/posts/', {
      params: { page: 2, page_size: 25 },
      signal: undefined,
    })
  })

  it('createPost POSTs body to /forum/topics/:id/posts/', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 'p-1' } })
    await forumAPI.createPost('t-1', 'hello')
    expect(apiMocks.post).toHaveBeenCalledWith('/forum/topics/t-1/posts/', { body: 'hello' })
  })

  it('updatePost PATCHes /forum/posts/:id/', async () => {
    apiMocks.patch.mockResolvedValue({ data: { id: 'p-1' } })
    await forumAPI.updatePost('p-1', 'edited')
    expect(apiMocks.patch).toHaveBeenCalledWith('/forum/posts/p-1/', { body: 'edited' })
  })

  it('deletePost DELETEs /forum/posts/:id/', async () => {
    apiMocks.delete.mockResolvedValue({})
    await forumAPI.deletePost('p-1')
    expect(apiMocks.delete).toHaveBeenCalledWith('/forum/posts/p-1/')
  })

  it('listRecentPosts GETs /forum/posts/recent/', async () => {
    apiMocks.get.mockResolvedValue({ data: { count: 0, results: [] } })
    await forumAPI.listRecentPosts({ page: 1, page_size: 20 })
    expect(apiMocks.get).toHaveBeenCalledWith('/forum/posts/recent/', {
      params: { page: 1, page_size: 20 },
      signal: undefined,
    })
  })
})

describe('forumAPI.getMyActivity', () => {
  it('GETs /forum/my-activity/', async () => {
    apiMocks.get.mockResolvedValue({ data: { topic_count: 3 } as never })
    const out = await forumAPI.getMyActivity()
    expect(apiMocks.get).toHaveBeenCalledWith('/forum/my-activity/', { signal: undefined })
    expect(out).toEqual({ topic_count: 3 })
  })
})
