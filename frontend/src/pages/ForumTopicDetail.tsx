import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Box, Flex, Text, Textarea, Button } from '@chakra-ui/react'
import {
  FiArrowLeft, FiMessageSquare, FiEye, FiMapPin, FiLock,
  FiEdit2, FiTrash2, FiSend, FiChevronLeft, FiChevronRight, FiCheck, FiX, FiFlag,
} from 'react-icons/fi'
import { toast } from 'sonner'
import { forumAPI, type ForumReportType } from '@/services/forumAPI'
import { useAuthStore } from '@/store/useAuthStore'
import type { ForumTopic, ForumPost } from '@/types'
import {
  GREEN, GREEN_LT,
  GRAY50, GRAY100, GRAY200, GRAY300, GRAY400, GRAY500, GRAY600, GRAY700, GRAY800, WHITE, RED, RED_LT,
} from '@/theme/tokens'

const PAGE_SIZE = 20
const FORUM_REPORT_OPTIONS: ForumReportType[] = ['inappropriate_content', 'spam', 'scam', 'harassment', 'other']

function askForumReportType(): ForumReportType | null {
  const raw = window.prompt('Report reason: inappropriate_content | spam | scam | harassment | other', 'inappropriate_content')
  if (!raw) return null
  const normalized = raw.trim().toLowerCase() as ForumReportType
  if (!FORUM_REPORT_OPTIONS.includes(normalized)) {
    toast.error('Invalid report reason')
    return null
  }
  return normalized
}

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d < 7 ? `${d}d ago`
    : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initial = name.charAt(0).toUpperCase()
  const colors = ['#2D5C4E', '#1D4ED8', '#7C3AED', '#D97706', '#EA580C', '#0D9488']
  const idx    = name.charCodeAt(0) % colors.length
  return (
    <Flex
      flexShrink={0}
      w={`${size}px`} h={`${size}px`}
      borderRadius="full" bg={colors[idx]}
      align="center" justify="center"
      color={WHITE} fontSize={`${Math.round(size * 0.38)}px`} fontWeight={700}
    >
      {initial}
    </Flex>
  )
}

function Skel({ h = '14px', w = '100%', mb }: { h?: string; w?: string; mb?: number | string }) {
  return <Box h={h} w={w} mb={mb} borderRadius="6px" bg={GRAY200} style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
}

// ─── Post Card ────────────────────────────────────────────────────────────────

interface PostCardProps {
  post: ForumPost
  isOp?: boolean
  currentUserId?: string
  onEdit: (post: ForumPost) => void
  onDelete: (post: ForumPost) => void
  onReport: (post: ForumPost) => void
}

function PostCard({ post, isOp, currentUserId, onEdit, onDelete, onReport }: PostCardProps) {
  const isOwn = currentUserId && post.author_id === currentUserId
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (post.is_deleted) {
    return (
      <Box px={5} py={4} borderBottom={`1px solid ${GRAY100}`} _last={{ borderBottom: 'none' }}>
        <Text fontSize="13px" color={GRAY400} fontStyle="italic">[This post was deleted]</Text>
      </Box>
    )
  }

  return (
    <Box
      px={5} py={5}
      borderBottom={`1px solid ${GRAY100}`}
      _last={{ borderBottom: 'none' }}
      bg={isOp ? GREEN_LT : WHITE}
    >
      <Flex gap={3} align="flex-start">
        <Avatar name={post.author_name} size={36} />

        <Box flex={1} minW={0}>
          <Flex align="center" justify="space-between" mb={2} flexWrap="wrap" gap={2}>
            <Flex align="center" gap={2}>
              <Text fontSize="14px" fontWeight={700} color={GRAY800}>{post.author_name}</Text>
              {isOp && (
                <Box bg={GREEN} color={WHITE} borderRadius="6px" px={2} py="2px" fontSize="10px" fontWeight={700}>
                  OP
                </Box>
              )}
              <Text fontSize="12px" color={GRAY400}>{timeAgo(post.created_at)}</Text>
              {post.updated_at !== post.created_at && (
                <Text fontSize="11px" color={GRAY400} fontStyle="italic">(edited)</Text>
              )}
            </Flex>

            {isOwn && !confirmDelete && (
              <Flex gap={1}>
                <Box
                  as="button"
                  p={1.5} borderRadius="8px"
                  color={GRAY400} cursor="pointer"
                  _hover={{ bg: GRAY100, color: GRAY700 }}
                  onClick={() => onEdit(post)}
                  title="Edit"
                >
                  <FiEdit2 size={13} />
                </Box>
                <Box
                  as="button"
                  p={1.5} borderRadius="8px"
                  color={GRAY400} cursor="pointer"
                  _hover={{ bg: RED_LT, color: RED }}
                  onClick={() => setConfirmDelete(true)}
                  title="Delete"
                >
                  <FiTrash2 size={13} />
                </Box>
              </Flex>
            )}

            {!isOwn && !confirmDelete && currentUserId && (
              <Box
                as="button"
                p={1.5}
                borderRadius="8px"
                color={GRAY400}
                cursor="pointer"
                _hover={{ bg: RED_LT, color: RED }}
                onClick={() => onReport(post)}
                title="Report"
              >
                <FiFlag size={13} />
              </Box>
            )}

            {confirmDelete && (
              <Flex align="center" gap={2}>
                <Text fontSize="12px" color={RED}>Delete post?</Text>
                <Box
                  as="button" p={1.5} borderRadius="8px" bg={RED_LT} color={RED} cursor="pointer"
                  onClick={() => { onDelete(post); setConfirmDelete(false) }}
                >
                  <FiCheck size={13} />
                </Box>
                <Box
                  as="button" p={1.5} borderRadius="8px" bg={GRAY100} color={GRAY600} cursor="pointer"
                  onClick={() => setConfirmDelete(false)}
                >
                  <FiX size={13} />
                </Box>
              </Flex>
            )}
          </Flex>

          <Text fontSize="14px" color={GRAY700} lineHeight={1.7} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {post.body}
          </Text>
        </Box>
      </Flex>
    </Box>
  )
}

// ─── Topic Inline Edit ────────────────────────────────────────────────────────

function TopicInlineEdit({ topic, onSave, onCancel }: { topic: ForumTopic; onSave: (title: string, body: string) => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = useState(topic.title)
  const [body, setBody]   = useState(topic.body)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const t = title.trim(); const b = body.trim()
    if (!t || !b) return
    setSaving(true)
    await onSave(t, b)
    setSaving(false)
  }

  return (
    <Box bg={GRAY50} p={4} borderRadius="12px" border={`1px solid ${GRAY200}`} mb={4}>
      <Text fontSize="12px" fontWeight={600} color={GRAY600} mb={1}>Title</Text>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{
          width: '100%',
          height: '40px',
          fontSize: '14px',
          padding: '0 12px',
          marginBottom: '12px',
          border: `1px solid ${GRAY300}`,
          borderRadius: '10px',
          background: WHITE,
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      <Text fontSize="12px" fontWeight={600} color={GRAY600} mb={1}>Body</Text>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        fontSize="14px"
        resize="vertical"
        border={`1px solid ${GRAY300}`}
        borderRadius="10px"
        bg={WHITE}
        _focus={{ borderColor: GREEN, outline: 'none' }}
        mb={3}
      />
      <Flex gap={2} justify="flex-end">
        <Button size="sm" variant="ghost" borderRadius="8px" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="sm" bg={GREEN} color={WHITE} borderRadius="8px" _hover={{ bg: '#214D41' }}
          onClick={save} disabled={saving || !title.trim() || !body.trim()}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </Flex>
    </Box>
  )
}

// ─── Inline Edit Modal ────────────────────────────────────────────────────────

function InlineEdit({ post, onSave, onCancel }: { post: ForumPost; onSave: (body: string) => Promise<void>; onCancel: () => void }) {
  const [body, setBody] = useState(post.body)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const trimmed = body.trim()
    if (!trimmed) return
    setSaving(true)
    await onSave(trimmed)
    setSaving(false)
  }

  return (
    <Box bg={GRAY50} p={4} borderRadius="12px" border={`1px solid ${GRAY200}`} mb={4}>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        fontSize="14px"
        resize="vertical"
        border={`1px solid ${GRAY300}`}
        borderRadius="10px"
        bg={WHITE}
        _focus={{ borderColor: GREEN, outline: 'none' }}
        mb={3}
      />
      <Flex gap={2} justify="flex-end">
        <Button size="sm" variant="ghost" borderRadius="8px" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          size="sm"
          bg={GREEN} color={WHITE} borderRadius="8px"
          _hover={{ bg: '#214D41' }}
          onClick={save}
          disabled={saving || !body.trim()}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </Flex>
    </Box>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ForumTopicDetail() {
  const { topicId }         = useParams<{ topicId: string }>()
  const navigate            = useNavigate()
  const { isAuthenticated, user } = useAuthStore()

  const [topic, setTopic]   = useState<ForumTopic | null>(null)
  const [posts, setPosts]   = useState<ForumPost[]>([])
  const [total, setTotal]   = useState(0)
  const [page, setPage]     = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  const [replyBody, setReplyBody]   = useState('')
  const [replying, setReplying]     = useState(false)
  const [editingPost, setEditingPost]   = useState<ForumPost | null>(null)
  const [editingTopic, setEditingTopic] = useState(false)

  const replyRef = useRef<HTMLTextAreaElement | null>(null)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const loadPosts = useCallback(async (p: number) => {
    if (!topicId) return
    setLoading(true)
    setError(null)
    try {
      const [t, res] = await Promise.all([
        forumAPI.getTopic(topicId),
        forumAPI.listPosts(topicId, { page: p, page_size: PAGE_SIZE }),
      ])
      setTopic(t)
      setPosts(res.results)
      setTotal(res.count)
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [topicId])

  useEffect(() => { loadPosts(page) }, [loadPosts, page])

  const goPage = (p: number) => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setPage(p)
  }

  const submitReply = async () => {
    const trimmed = replyBody.trim()
    if (!trimmed || !topicId) return
    setReplying(true)
    try {
      const newPost = await forumAPI.createPost(topicId, trimmed)
      setReplyBody('')
      // If on last page with room, append; else go to last page
      if (page === totalPages && posts.length < PAGE_SIZE) {
        setPosts((prev) => [...prev, newPost])
        setTotal((t) => t + 1)
      } else {
        const lastPage = Math.ceil((total + 1) / PAGE_SIZE)
        goPage(lastPage)
      }
      toast.success('Reply posted')
    } catch {
      toast.error('Failed to post reply')
    } finally {
      setReplying(false)
    }
  }

  const saveEdit = async (body: string) => {
    if (!editingPost) return
    try {
      const updated = await forumAPI.updatePost(editingPost.id, body)
      setPosts((prev) => prev.map((p) => p.id === updated.id ? updated : p))
      setEditingPost(null)
      toast.success('Post updated')
    } catch {
      toast.error('Failed to update post')
    }
  }

  const saveTopic = async (title: string, body: string) => {
    if (!topic) return
    try {
      const updated = await forumAPI.updateTopic(topic.id, { title, body })
      setTopic(updated)
      setEditingTopic(false)
      toast.success('Topic updated')
    } catch {
      toast.error('Failed to update topic')
    }
  }

  const deletePost = async (post: ForumPost) => {
    try {
      await forumAPI.deletePost(post.id)
      setPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, is_deleted: true } : p))
      toast.success('Post deleted')
    } catch {
      toast.error('Failed to delete post')
    }
  }

  const reportTopic = async () => {
    if (!topic || !user?.id) return
    if (topic.author_id === user.id) {
      toast.error('You cannot report your own topic')
      return
    }

    const reportType = askForumReportType()
    if (!reportType) return
    const description = window.prompt('Optional explanation', '') ?? ''

    try {
      await forumAPI.reportTopic(topic.id, reportType, description)
      toast.success('Topic report submitted for moderation')
    } catch {
      toast.error('Failed to submit topic report')
    }
  }

  const reportPost = async (post: ForumPost) => {
    if (!user?.id) return
    if (post.author_id === user.id) {
      toast.error('You cannot report your own post')
      return
    }

    const reportType = askForumReportType()
    if (!reportType) return
    const description = window.prompt('Optional explanation', '') ?? ''

    try {
      await forumAPI.reportPost(post.id, reportType, description)
      toast.success('Post report submitted for moderation')
    } catch {
      toast.error('Failed to submit post report')
    }
  }

  const topicAuthorId = topic?.author_id

  return (
    <Box bg={GRAY50} minH="calc(100vh - 64px)" py={{ base: 4, md: 6 }} px={{ base: 3, md: 6 }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      <Box maxW="860px" mx="auto">

        {/* Back */}
        <Flex
          as="button" align="center" gap={2} mb={4}
          color={GRAY500} fontSize="13px" cursor="pointer"
          _hover={{ color: GRAY700 }}
          onClick={() => topic ? navigate(`/forum/category/${topic.category_slug}`) : navigate('/forum')}
        >
          <FiArrowLeft size={14} />
          {topic ? topic.category_name : 'Forum'}
        </Flex>

        {loading ? (
          <Box bg={WHITE} borderRadius="18px" border={`1px solid ${GRAY200}`} p={6}>
            <Skel h="24px" w="60%" mb={4} />
            <Flex gap={3} mb={6}><Skel h="36px" w="36px" /><Box flex={1}><Skel h="14px" w="40%" mb={2} /><Skel h="12px" w="30%" /></Box></Flex>
            <Skel h="14px" mb={2} /><Skel h="14px" mb={2} /><Skel h="14px" w="70%" />
          </Box>
        ) : error ? (
          <Box textAlign="center" py={12}><Text color={RED} fontSize="14px">{error}</Text></Box>
        ) : topic && (
          <>
            {/* Topic header */}
            <Box bg={WHITE} borderRadius="18px" border={`1px solid ${GRAY200}`} boxShadow="0 2px 10px rgba(0,0,0,0.05)" overflow="hidden" mb={4}>
              {/* Title bar */}
              <Box px={5} pt={5} pb={4} borderBottom={`1px solid ${GRAY100}`}>
                <Flex align="center" gap={2} flexWrap="wrap" mb={2}>
                  {topic.is_pinned && (
                    <Flex align="center" gap={1} bg={GREEN_LT} color={GREEN} borderRadius="6px" px={2} py="2px" fontSize="11px" fontWeight={600}>
                      <FiMapPin size={10} /> Pinned
                    </Flex>
                  )}
                  {topic.is_locked && (
                    <Flex align="center" gap={1} bg={GRAY100} color={GRAY500} borderRadius="6px" px={2} py="2px" fontSize="11px" fontWeight={600}>
                      <FiLock size={10} /> Locked
                    </Flex>
                  )}
                </Flex>
                <Text fontSize={{ base: '18px', md: '22px' }} fontWeight={800} color={GRAY800} mb={2}>{topic.title}</Text>
                <Flex align="center" gap={4} flexWrap="wrap">
                  <Flex align="center" gap={1} fontSize="12px" color={GRAY400}>
                    <FiMessageSquare size={12} />
                    <Text>{topic.reply_count} replies</Text>
                  </Flex>
                  <Flex align="center" gap={1} fontSize="12px" color={GRAY400}>
                    <FiEye size={12} />
                    <Text>{topic.view_count} views</Text>
                  </Flex>
                  <Text fontSize="12px" color={GRAY400}>
                    in <Text as="span" fontWeight={600} color={GRAY600}>{topic.category_name}</Text>
                  </Text>
                  {isAuthenticated && user?.id !== topic.author_id && (
                    <Box
                      as="button"
                      display="inline-flex"
                      alignItems="center"
                      gap={1}
                      color={RED}
                      fontSize="12px"
                      onClick={reportTopic}
                    >
                      <FiFlag size={12} /> Report topic
                    </Box>
                  )}
                  {isAuthenticated && user?.id === topic.author_id && !topic.is_locked && !editingTopic && (
                    <Box
                      as="button"
                      display="inline-flex"
                      alignItems="center"
                      gap={1}
                      color={GRAY500}
                      fontSize="12px"
                      _hover={{ color: GRAY800 }}
                      onClick={() => setEditingTopic(true)}
                    >
                      <FiEdit2 size={12} /> Edit topic
                    </Box>
                  )}
                </Flex>
              </Box>

              {/* OP body */}
              <Box px={5} py={5} bg={GREEN_LT}>
                <Flex gap={3} align="flex-start">
                  <Avatar name={topic.author_name} size={40} />
                  <Box flex={1} minW={0}>
                    <Flex align="center" gap={2} mb={2}>
                      <Text fontSize="14px" fontWeight={700} color={GRAY800}>{topic.author_name}</Text>
                      <Box bg={GREEN} color={WHITE} borderRadius="6px" px={2} py="2px" fontSize="10px" fontWeight={700}>Author</Box>
                      <Text fontSize="12px" color={GRAY500}>{timeAgo(topic.created_at)}</Text>
                    </Flex>
                    {editingTopic ? (
                      <TopicInlineEdit
                        topic={topic}
                        onSave={saveTopic}
                        onCancel={() => setEditingTopic(false)}
                      />
                    ) : (
                      <Text fontSize="14px" color={GRAY700} lineHeight={1.75} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {topic.body}
                      </Text>
                    )}
                  </Box>
                </Flex>
              </Box>
            </Box>

            {/* Replies */}
            {posts.length > 0 && (
              <Box bg={WHITE} borderRadius="18px" border={`1px solid ${GRAY200}`} boxShadow="0 2px 10px rgba(0,0,0,0.05)" overflow="hidden" mb={4}>
                <Box px={5} py={3} borderBottom={`1px solid ${GRAY100}`}>
                  <Text fontSize="12px" color={GRAY400} fontWeight={500}>{total} repl{total === 1 ? 'y' : 'ies'}</Text>
                </Box>
                {posts.map((post) => (
                  editingPost?.id === post.id ? (
                    <Box key={post.id} px={5} py={4} borderBottom={`1px solid ${GRAY100}`} _last={{ borderBottom: 'none' }}>
                      <Flex gap={3} align="flex-start">
                        <Avatar name={post.author_name} />
                        <Box flex={1}>
                          <Text fontSize="13px" fontWeight={600} color={GRAY700} mb={2}>Editing your post…</Text>
                          <InlineEdit
                            post={post}
                            onSave={saveEdit}
                            onCancel={() => setEditingPost(null)}
                          />
                        </Box>
                      </Flex>
                    </Box>
                  ) : (
                    <PostCard
                      key={post.id}
                      post={post}
                      isOp={post.author_id === topicAuthorId}
                      currentUserId={user?.id}
                      onEdit={setEditingPost}
                      onDelete={deletePost}
                      onReport={reportPost}
                    />
                  )
                ))}
              </Box>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <Flex justify="center" align="center" gap={2} mb={6}>
                <Box
                  as="button"
                  w="36px" h="36px" borderRadius="10px"
                  border={`1px solid ${GRAY200}`} bg={WHITE}
                  display="flex" alignItems="center" justifyContent="center"
                  cursor={page === 1 ? 'not-allowed' : 'pointer'}
                  color={page === 1 ? GRAY300 : GRAY600}
                  onClick={() => page > 1 && goPage(page - 1)}
                >
                  <FiChevronLeft size={16} />
                </Box>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Box
                    key={p}
                    as="button"
                    w="36px" h="36px" borderRadius="10px"
                    border={`1px solid ${page === p ? GREEN : GRAY200}`}
                    bg={page === p ? GREEN : WHITE}
                    color={page === p ? WHITE : GRAY600}
                    fontWeight={page === p ? 700 : 400}
                    fontSize="13px" cursor="pointer"
                    onClick={() => goPage(p)}
                  >
                    {p}
                  </Box>
                ))}
                <Box
                  as="button"
                  w="36px" h="36px" borderRadius="10px"
                  border={`1px solid ${GRAY200}`} bg={WHITE}
                  display="flex" alignItems="center" justifyContent="center"
                  cursor={page === totalPages ? 'not-allowed' : 'pointer'}
                  color={page === totalPages ? GRAY300 : GRAY600}
                  onClick={() => page < totalPages && goPage(page + 1)}
                >
                  <FiChevronRight size={16} />
                </Box>
              </Flex>
            )}

            {/* Reply form */}
            {isAuthenticated && !topic.is_locked ? (
              <Box bg={WHITE} borderRadius="18px" border={`1px solid ${GRAY200}`} boxShadow="0 2px 10px rgba(0,0,0,0.05)" p={5}>
                <Text fontSize="14px" fontWeight={700} color={GRAY800} mb={3}>Add a reply</Text>
                <Textarea
                  ref={replyRef}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Write your reply…"
                  rows={5}
                  fontSize="14px"
                  resize="vertical"
                  border={`1px solid ${GRAY300}`}
                  borderRadius="12px"
                  bg={GRAY50}
                  _focus={{ borderColor: GREEN, outline: 'none', bg: WHITE }}
                  mb={3}
                />
                <Flex justify="space-between" align="center">
                  <Text fontSize="12px" color={GRAY400}>{replyBody.length} chars</Text>
                  <Button
                    bg={GREEN} color={WHITE}
                    borderRadius="10px" px={5}
                    _hover={{ bg: '#214D41' }}
                    onClick={submitReply}
                    disabled={replying || !replyBody.trim()}
                    style={{ opacity: (!replyBody.trim() || replying) ? 0.6 : 1, cursor: (!replyBody.trim() || replying) ? 'not-allowed' : 'pointer' }}
                  >
                    <Flex align="center" gap={2}>
                      <FiSend size={14} />
                      {replying ? 'Posting…' : 'Post Reply'}
                    </Flex>
                  </Button>
                </Flex>
              </Box>
            ) : topic.is_locked ? (
              <Box bg={GRAY100} borderRadius="14px" p={4} textAlign="center">
                <Flex align="center" justify="center" gap={2} color={GRAY500}>
                  <FiLock size={14} />
                  <Text fontSize="13px">This topic is locked and no longer accepts replies.</Text>
                </Flex>
              </Box>
            ) : (
              <Box bg={GRAY100} borderRadius="14px" p={4} textAlign="center">
                <Text fontSize="13px" color={GRAY500}>
                  <Text
                    as="span" color={GREEN} fontWeight={600} cursor="pointer"
                    onClick={() => navigate('/login')}
                    _hover={{ textDecoration: 'underline' }}
                  >
                    Sign in
                  </Text>
                  {' '}to join the discussion.
                </Text>
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  )
}
