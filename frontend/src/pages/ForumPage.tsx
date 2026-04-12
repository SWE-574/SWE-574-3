/**
 * ForumPage — subreddit-style layout
 *
 * Left sidebar: category list (like subreddits)
 * Main panel:
 *   - "home" view: category grid
 *   - category view: topic list for selected category
 *   - topic view: topic detail + replies
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Box, Flex, Text, Textarea, Button, Stack,
} from '@chakra-ui/react'
import {
  FiMessageSquare, FiBookOpen, FiCalendar, FiUsers, FiStar,
  FiZap, FiGlobe, FiCode, FiHeart, FiHome, FiTool, FiAward,
  FiClock, FiEye, FiMapPin, FiLock, FiFlag,
  FiPlus, FiArrowLeft, FiEdit2, FiTrash2, FiSend, FiCheck, FiX,
} from 'react-icons/fi'
import { toast } from 'sonner'
import { forumAPI, type ForumReportType, type TopicSortOption } from '@/services/forumAPI'
import { useAuthStore } from '@/store/useAuthStore'
import type { ForumCategory, ForumTopic, ForumPost, User } from '@/types'
import {
  GREEN, GREEN_LT,
  BLUE, BLUE_LT, AMBER, AMBER_LT,
  PURPLE, PURPLE_LT, RED, RED_LT,
  GRAY50, GRAY100, GRAY200, GRAY300, GRAY400, GRAY500, GRAY600, GRAY700, GRAY800, WHITE,
} from '@/theme/tokens'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ReactNode> = {
  'message-square': <FiMessageSquare size={18} />,
  'book-open':      <FiBookOpen size={18} />,
  'calendar':       <FiCalendar size={18} />,
  'users':          <FiUsers size={18} />,
  'star':           <FiStar size={18} />,
  'lightbulb':      <FiZap size={18} />,
  'globe':          <FiGlobe size={18} />,
  'code':           <FiCode size={18} />,
  'heart':          <FiHeart size={18} />,
  'home':           <FiHome size={18} />,
  'tool':           <FiTool size={18} />,
  'award':          <FiAward size={18} />,
}

const COLOR_MAP: Record<string, { bg: string; text: string; light: string }> = {
  blue:   { bg: BLUE,        text: WHITE, light: BLUE_LT   },
  green:  { bg: GREEN,       text: WHITE, light: GREEN_LT  },
  purple: { bg: PURPLE,      text: WHITE, light: PURPLE_LT },
  amber:  { bg: AMBER,       text: WHITE, light: AMBER_LT  },
  orange: { bg: '#EA580C',   text: WHITE, light: '#FFF7ED' },
  pink:   { bg: '#DB2777',   text: WHITE, light: '#FDF2F8' },
  red:    { bg: RED,         text: WHITE, light: RED_LT    },
  teal:   { bg: '#0D9488',   text: WHITE, light: '#F0FDFA' },
}

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
    <Box bg={WHITE} p={3} borderRadius="10px" border={`1px solid ${GRAY200}`}>
      <Text fontSize="11px" fontWeight={600} color={GRAY600} mb={1}>Title</Text>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{
          width: '100%', height: '36px', fontSize: '13px',
          padding: '0 10px', marginBottom: '10px',
          border: `1px solid ${GRAY300}`, borderRadius: '8px',
          background: WHITE, outline: 'none', boxSizing: 'border-box',
        }}
      />
      <Text fontSize="11px" fontWeight={600} color={GRAY600} mb={1}>Body</Text>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        fontSize="13px"
        resize="vertical"
        border={`1px solid ${GRAY300}`}
        borderRadius="8px"
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

function timeAgo(iso: string | null | undefined) {
  if (!iso) return '—'
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d < 7 ? `${d}d ago`
    : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function Skel({ h = '14px', w = '100%', mb }: { h?: string; w?: string; mb?: number | string }) {
  return <Box h={h} w={w} mb={mb} borderRadius="6px" bg={GRAY200} style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
}

function UserAvatar({
  name, avatarUrl, size = 36,
}: { name: string; avatarUrl?: string | null; size?: number }) {
  const initial = name.charAt(0).toUpperCase()
  const palette = ['#2D5C4E', '#1D4ED8', '#7C3AED', '#D97706', '#EA580C', '#0D9488']
  const bg = palette[name.charCodeAt(0) % palette.length]
  return (
    <Flex
      flexShrink={0} w={`${size}px`} h={`${size}px`} borderRadius="full" bg={bg}
      align="center" justify="center" overflow="hidden"
      color={WHITE} fontSize={`${Math.round(size * 0.38)}px`} fontWeight={700}
    >
      {avatarUrl
        ? <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initial
      }
    </Flex>
  )
}

// ─── Category Sidebar ─────────────────────────────────────────────────────────

function CategorySidebar({
  categories, loading, selectedSlug, onSelect, onHome,
  user, myTopics, myReplies, isAuthenticated,
}: {
  categories: ForumCategory[]
  loading: boolean
  selectedSlug: string | null
  onSelect: (cat: ForumCategory) => void
  onHome: () => void
  user: { first_name?: string; last_name?: string; name?: string; avatar_url?: string | null; email?: string } | null
  myTopics: number
  myReplies: number
  isAuthenticated: boolean
}) {
  // Role logic
  const u = user as (User | null) | undefined
  const roleLabel = u?.is_admin || u?.role === 'admin'
    ? 'Admin' : u?.role === 'moderator' ? 'Moderator' : 'Member'
  const roleBg    = roleLabel === 'Admin' ? AMBER_LT : roleLabel === 'Moderator' ? PURPLE_LT : GREEN_LT
  const roleColor  = roleLabel === 'Admin' ? AMBER    : roleLabel === 'Moderator' ? PURPLE    : GREEN
  const fullName   = [user?.first_name, user?.last_name].filter(Boolean).join(' ')
    || user?.name || user?.email || 'User'

  return (
    <Box
      w="268px" minW="268px" bg={WHITE} borderRight={`1px solid ${GRAY200}`}
      display="flex" flexDirection="column" h="100%" overflow="hidden"
    >


      {/* User card + stats + New Topic */}
      {isAuthenticated && user && (
        <Box px={4} pt={5} pb={4} borderBottom={`1px solid ${GRAY100}`}>
          {/* Identity */}
          <Flex align="center" gap={3} mb={4}>
            <UserAvatar name={fullName} avatarUrl={user.avatar_url} size={44} />
            <Box minW={0} flex={1}>
              <Text fontSize="14px" fontWeight={700} color={GRAY800}
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {fullName}
              </Text>
              <Text fontSize="11px" color={GRAY400}
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.email}
              </Text>
              <Box display="inline-flex" mt="2px" px={2} py="1px" borderRadius="20px" bg={roleBg}>
                <Text fontSize="10px" fontWeight={700} color={roleColor}>{roleLabel}</Text>
              </Box>
            </Box>
          </Flex>


          {/* Green activity card */}
          <Box
            borderRadius="12px" p="14px" mb={3} position="relative" overflow="hidden"
            style={{ background: `linear-gradient(135deg, ${GREEN} 0%, #1a3d35 100%)` }}
          >
            <Box style={{ position: 'absolute', top: '-20px', right: '-20px', width: '70px', height: '70px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
            <Text fontSize="9px" fontWeight={700} color="rgba(255,255,255,0.6)"
              style={{ letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '8px' }}>
              My Forum Activity
            </Text>
            <Flex gap={4}>
              <Box>
                <Text fontSize="22px" fontWeight={800} color={WHITE} lineHeight={1}>{myTopics}</Text>
                <Text fontSize="10px" color="rgba(255,255,255,0.6)" mt="1px">Topics</Text>
              </Box>
              <Box w="1px" bg="rgba(255,255,255,0.15)" />
              <Box>
                <Text fontSize="22px" fontWeight={800} color={WHITE} lineHeight={1}>{myReplies}</Text>
                <Text fontSize="10px" color="rgba(255,255,255,0.6)" mt="1px">Replies</Text>
              </Box>
            </Flex>
          </Box>
        </Box>
      )}
      {/* Header */}
      <Box px={4} pt={4} pb={3} borderBottom={`1px solid ${GRAY100}`}>
        <Text fontSize="12px" fontWeight={800} color={GRAY800} letterSpacing="0.04em" style={{ textTransform: 'uppercase' }}>
          Community Forum
        </Text>
      </Box>

      {/* Home link */}
      <Box px={3} pt={3} pb={1}>
        <Flex
          as="button" w="full" align="center" gap="10px" px={3} py="9px"
          borderRadius="10px"
          bg={selectedSlug === null ? GREEN_LT : 'transparent'}
          color={selectedSlug === null ? GREEN : GRAY600}
          _hover={{ bg: selectedSlug === null ? GREEN_LT : GRAY50 }}
          onClick={onHome}
          transition="all 0.13s"
        >
          <FiHome size={15} />
          <Text fontSize="13px" fontWeight={selectedSlug === null ? 700 : 600} flex={1} textAlign="left">
            Home
          </Text>
        </Flex>
      </Box>

      {/* Category list */}
      <Box flex={1} overflowY="auto" px={3} pb={4}>
        {loading
          ? [1,2,3,4,5].map((i) => (
              <Flex key={i} align="center" gap={2} px={3} py={2} mb={1}>
                <Skel h="28px" w="28px" /><Skel h="14px" w="70%" />
              </Flex>
            ))
          : [...categories].sort((a, b) => a.display_order - b.display_order).map((cat) => {
              const c = COLOR_MAP[cat.color] ?? COLOR_MAP.blue
              const icon = ICON_MAP[cat.icon] ?? <FiMessageSquare size={15} />
              const active = selectedSlug === cat.slug
              return (
                <Flex
                  key={cat.slug}
                  as="button" w="full" align="center" gap="10px" px={3} py="9px"
                  borderRadius="10px" mb="2px"
                  bg={active ? c.light : 'transparent'}
                  color={active ? c.bg : GRAY600}
                  _hover={{ bg: active ? c.light : GRAY50 }}
                  onClick={() => onSelect(cat)}
                  transition="all 0.13s"
                >
                  <Flex
                    w="26px" h="26px" borderRadius="7px" flexShrink={0}
                    bg={active ? c.bg : GRAY100} color={active ? WHITE : GRAY500}
                    align="center" justify="center"
                    transition="all 0.13s"
                  >
                    {icon}
                  </Flex>
                  <Box flex={1} textAlign="left" minW={0}>
                    <Text fontSize="13px" fontWeight={active ? 700 : 600} lineHeight={1.2}
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cat.name}
                    </Text>
                    {cat.topic_count > 0 && (
                      <Text fontSize="10px" color={active ? c.bg : GRAY400} style={{ opacity: active ? 0.7 : 1 }}>
                        {cat.topic_count} topics
                      </Text>
                    )}
                  </Box>
                </Flex>
              )
            })
        }
      </Box>
    </Box>
  )
}

// ─── Forum Home View ──────────────────────────────────────────────────────────

function ForumHomeView({
  categories,
  onSelectTopic,
  // loading and onSelect passed by parent for consistency; not used in home view
  loading: _loading,
  onSelect: _onSelect,
}: {
  categories: ForumCategory[]
  loading: boolean
  onSelect: (cat: ForumCategory) => void
  onSelectTopic: (id: string) => void
}) {
  void _loading
  void _onSelect
  const [trending, setTrending] = useState<ForumTopic[]>([])
  const [trendLoading, setTrendLoading] = useState(true)

  useEffect(() => {
    const ac = new AbortController()
    const id = setTimeout(() => setTrendLoading(true), 0)
    forumAPI.listTopics({ page_size: 8 }, ac.signal)
      .then((res) => { setTrending(res.results) })
      .catch(() => {})
      .finally(() => setTrendLoading(false))
    return () => {
      clearTimeout(id)
      ac.abort()
    }
  }, [])


  return (
    <Box flex={1} overflowY="auto" bg={GRAY50} p={{ base: 3, md: 5 }}>
      {/* Header */}
      <Box mb={4}>
        <Text fontSize={{ base: '18px', md: '22px' }} fontWeight={800} color={GRAY800} mb={0}>Home</Text>
        <Text fontSize="12px" color={GRAY500}>Trending discussions &amp; community activity</Text>
      </Box>

      {/* Trending topics */}
      <Flex align="center" gap={2} mb={2}>
        <Box color={AMBER}><FiZap size={13} /></Box>
        <Text fontSize="13px" fontWeight={700} color={GRAY800}>Trending Topics</Text>
      </Flex>
      <Box bg={WHITE} borderRadius="14px" border={`1px solid ${GRAY200}`} overflow="hidden"
        boxShadow="0 1px 4px rgba(0,0,0,0.04)" mb={4}>
        {trendLoading ? (
          <Box p={4}>
            {[1,2,3,4].map((i) => (
              <Flex key={i} gap={3} align="center" py={2}>
                <Skel h="28px" w="28px" /><Box flex={1}><Skel h="12px" w="60%" mb={1} /><Skel h="10px" w="35%" /></Box><Skel h="18px" w="36px" />
              </Flex>
            ))}
          </Box>
        ) : trending.length === 0 ? (
          <Box p={8} textAlign="center">
            <Text fontSize="13px" color={GRAY400}>No topics yet — be the first to post!</Text>
          </Box>
        ) : trending.map((t, idx) => {
          const cat = categories.find((c) => c.slug === t.category_slug)
          const c = COLOR_MAP[cat?.color ?? 'blue'] ?? COLOR_MAP.blue
          return (
            <Flex
              key={t.id} as="button" w="full" align="center" gap={3}
              px={4} py="11px" borderBottom={idx < trending.length - 1 ? `1px solid ${GRAY100}` : 'none'}
              _hover={{ bg: GRAY50 }} onClick={() => onSelectTopic(t.id)}
              transition="background 0.12s" textAlign="left"
            >
              <Box
                w="26px" h="26px" borderRadius="7px" flexShrink={0}
                display="flex" alignItems="center" justifyContent="center"
                bg={idx < 3 ? AMBER_LT : GRAY100}
                fontSize="11px" fontWeight={800} color={idx < 3 ? AMBER : GRAY500}
              >{idx + 1}</Box>
              <Box flex={1} minW={0}>
                <Text fontSize="13px" fontWeight={600} color={GRAY800}
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.title}
                </Text>
                <Flex align="center" gap={2} mt="2px">
                  <Box px="6px" py="1px" borderRadius="20px" bg={c.light} fontSize="10px" fontWeight={700} color={c.bg}>
                    {cat?.name ?? t.category_slug}
                  </Box>
                  <Text fontSize="10px" color={GRAY400}>{timeAgo(t.created_at)}</Text>
                  <Text fontSize="10px" color={GRAY400}>by {t.author_name}</Text>
                </Flex>
              </Box>
              <Flex align="center" gap={1} fontSize="11px" color={GRAY500} flexShrink={0}>
                <FiMessageSquare size={10} /><Text>{t.reply_count ?? 0}</Text>
              </Flex>
            </Flex>
          )
        })}
      </Box>

    </Box>
  )
}

// ─── Topic List View ──────────────────────────────────────────────────────────

const TOPICS_PAGE_SIZE = 15

function TopicListView({
  category, onSelectTopic, isAuthenticated, navigate,
}: {
  category: ForumCategory
  onSelectTopic: (topicId: string) => void
  isAuthenticated: boolean
  navigate: ReturnType<typeof useNavigate>
}) {
  const [topics, setTopics] = useState<ForumTopic[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<TopicSortOption>('newest')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const totalPages = Math.max(1, Math.ceil(total / TOPICS_PAGE_SIZE))

  const load = useCallback(async (p: number, signal: AbortSignal) => {
    setTopics(prev => { if (prev.length > 0) { setRefreshing(true); return prev } setLoading(true); return prev })
    setError(null)
    try {
      const res = await forumAPI.listTopics({ category: category.slug, page: p, page_size: TOPICS_PAGE_SIZE, sort }, signal)
      setTopics(res.results); setTotal(res.count)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      const isAbort = e instanceof Error && (e.name?.includes('Abort') || e.message === 'canceled' || e.message === 'CanceledError')
      if (!isAbort) setError(msg || 'Failed to load')
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [category.slug, sort])

  useEffect(() => {
    setPage(1)
  }, [category.slug])

  useEffect(() => {
    setPage(1)
  }, [sort])

  useEffect(() => {
    const ctrl = new AbortController()
    load(page, ctrl.signal)
    return () => ctrl.abort()
  }, [load, page])

  const c = COLOR_MAP[category.color] ?? COLOR_MAP.blue
  const icon = ICON_MAP[category.icon] ?? <FiMessageSquare size={16} />

  return (
    <Box flex={1} overflowY="auto" bg={GRAY50} p={{ base: 3, md: 5 }}>
      {/* Header */}
      <Box bg={WHITE} borderRadius="14px" border={`1px solid ${GRAY200}`} overflow="hidden" mb={4}
        boxShadow="0 1px 4px rgba(0,0,0,0.04)">
        <Box h="4px" bg={c.bg} />
        <Flex align="center" justify="space-between" p={4} flexWrap="wrap" gap={3}>
          <Flex align="center" gap={3}>
            <Flex w="42px" h="42px" borderRadius="11px" bg={c.light} color={c.bg} align="center" justify="center" flexShrink={0}>
              {icon}
            </Flex>
            <Box>
              <Text fontSize="18px" fontWeight={800} color={GRAY800}>{category.name}</Text>
              <Text fontSize="12px" color={GRAY500}>{category.description}</Text>
            </Box>
          </Flex>
          {isAuthenticated && (
            <Button
              size="sm" bg={GREEN} color={WHITE} borderRadius="9px" px={4}
              _hover={{ bg: '#214D41' }}
              onClick={() => navigate(`/forum/new?category=${category.slug}`)}
            >
              <Flex align="center" gap={2}><FiPlus size={13} /> New Topic</Flex>
            </Button>
          )}
        </Flex>
      </Box>

      {/* List */}
      <Box bg={WHITE} borderRadius="14px" border={`1px solid ${GRAY200}`} overflow="hidden"
        boxShadow="0 1px 4px rgba(0,0,0,0.04)">
        {loading ? (
          <Box p={5}>
            <Stack gap={4}>
              {[1,2,3,4].map((i) => (
                <Flex key={i} gap={3} align="flex-start">
                  <Skel h="32px" w="32px" />
                  <Box flex={1}><Skel h="14px" w="65%" mb={2} /><Skel h="11px" w="40%" /></Box>
                  <Skel h="32px" w="50px" />
                </Flex>
              ))}
            </Stack>
          </Box>
        ) : error ? (
          <Box p={8} textAlign="center"><Text color={RED} fontSize="14px">{error}</Text></Box>
        ) : topics.length === 0 ? (
          <Box p={10} textAlign="center">
            <Text fontSize="xl" mb={2}>💬</Text>
            <Text fontSize="14px" fontWeight={600} color={GRAY700} mb={1}>No topics yet</Text>
            <Text fontSize="12px" color={GRAY400} mb={4}>Be the first to start a discussion!</Text>
            {isAuthenticated && (
              <Button size="sm" bg={GREEN} color={WHITE} borderRadius="9px" _hover={{ bg: '#214D41' }}
                onClick={() => navigate(`/forum/new?category=${category.slug}`)}>
                <Flex align="center" gap={2}><FiPlus size={13} /> New Topic</Flex>
              </Button>
            )}
          </Box>
        ) : (
          <>
            <Flex px={4} py={3} borderBottom={`1px solid ${GRAY100}`} align="center" justify="space-between">
              <Text fontSize="11px" color={GRAY400} fontWeight={500}>{total} topic{total !== 1 ? 's' : ''}</Text>
              <Flex gap={1} bg={GRAY100} borderRadius="8px" p="3px">
                {(['newest', 'most_active'] as TopicSortOption[]).map((opt) => (
                  <Box
                    key={opt}
                    as="button"
                    px={3} py="3px"
                    fontSize="10px" fontWeight={600}
                    borderRadius="6px"
                    bg={sort === opt ? WHITE : 'transparent'}
                    color={sort === opt ? GRAY800 : GRAY500}
                    boxShadow={sort === opt ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'}
                    cursor="pointer"
                    transition="all 0.13s"
                    onClick={() => setSort(opt)}
                  >
                    {opt === 'newest' ? 'Newest' : 'Most Active'}
                  </Box>
                ))}
              </Flex>
            </Flex>
            <Box opacity={refreshing ? 0.45 : 1} transition="opacity 0.15s">
            {topics.map((t) => (
              <Flex
                key={t.id} as="div" w="full" align="flex-start" gap={3}
                px={4} py="14px" borderBottom={`1px solid ${GRAY100}`}
                _last={{ borderBottom: 'none' }}
                _hover={{ bg: GRAY50 }}
                onClick={() => onSelectTopic(t.id)}
                transition="background 0.12s" textAlign="left" cursor="pointer"
              >
                <UserAvatar name={t.author_name} avatarUrl={t.author_avatar_url} size={32} />
                <Box flex={1} minW={0}>
                  <Flex align="center" gap={2} mb={1} flexWrap="wrap">
                    {t.is_pinned && (
                      <Flex align="center" gap={1} bg={GREEN_LT} color={GREEN} borderRadius="5px" px={2} py="1px" fontSize="10px" fontWeight={600}>
                        <FiMapPin size={9} /> Pinned
                      </Flex>
                    )}
                    {t.is_locked && (
                      <Flex align="center" gap={1} bg={GRAY100} color={GRAY500} borderRadius="5px" px={2} py="1px" fontSize="10px" fontWeight={600}>
                        <FiLock size={9} /> Locked
                      </Flex>
                    )}
                    <Text fontSize="14px" fontWeight={600} color={GRAY800}
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.title}
                    </Text>
                  </Flex>
                  <Flex align="center" gap={3}>
                    <Text fontSize="11px" color={GRAY500}>by <Text as="span" fontWeight={600}>{t.author_name}</Text></Text>
                    <Flex align="center" gap={1} fontSize="11px" color={GRAY400}><FiClock size={10} /><Text>{timeAgo(t.last_activity)}</Text></Flex>
                  </Flex>
                </Box>
                <Flex gap={4} flexShrink={0}>
                  <Flex direction="column" align="center">
                    <Flex align="center" gap={1} color={GRAY500} fontSize="12px">
                      <FiMessageSquare size={12} /><Text fontWeight={600} color={GRAY700}>{t.reply_count}</Text>
                    </Flex>
                    <Text fontSize="10px" color={GRAY400}>replies</Text>
                  </Flex>
                  <Flex direction="column" align="center">
                    <Flex align="center" gap={1} color={GRAY500} fontSize="12px">
                      <FiEye size={12} /><Text fontWeight={600} color={GRAY700}>{t.view_count}</Text>
                    </Flex>
                    <Text fontSize="10px" color={GRAY400}>views</Text>
                  </Flex>
                </Flex>
              </Flex>
            ))}
            </Box>
          </>
        )}
      </Box>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <Flex justify="center" gap={2} mt={4}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Box key={p} as="button" w="34px" h="34px" borderRadius="9px" fontSize="13px"
              border={`1px solid ${page === p ? GREEN : GRAY200}`}
              bg={page === p ? GREEN : WHITE}
              color={page === p ? WHITE : GRAY600}
              fontWeight={page === p ? 700 : 400}
              onClick={() => setPage(p)}
            >{p}</Box>
          ))}
        </Flex>
      )}
    </Box>
  )
}

// ─── Topic Detail View ────────────────────────────────────────────────────────

const POSTS_PAGE_SIZE = 20

function TopicDetailView({
  topicId, onBack, isAuthenticated, user, navigate,
}: {
  topicId: string
  onBack: () => void
  isAuthenticated: boolean
  user: User | null
  navigate: ReturnType<typeof useNavigate>
}) {
  const [topic, setTopic] = useState<ForumTopic | null>(null)
  const [posts, setPosts] = useState<ForumPost[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [replying, setReplying] = useState(false)
  const [editingPost, setEditingPost] = useState<ForumPost | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [editingTopic, setEditingTopic] = useState(false)
  const totalPages = Math.max(1, Math.ceil(total / POSTS_PAGE_SIZE))
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (p: number) => {
    setLoading(true); setError(null)
    try {
      const [t, res] = await Promise.all([
        forumAPI.getTopic(topicId),
        forumAPI.listPosts(topicId, { page: p, page_size: POSTS_PAGE_SIZE }),
      ])
      setTopic(t); setPosts(res.results); setTotal(res.count)
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed')
    } finally {
      setLoading(false)
    }
  }, [topicId])

  useEffect(() => { load(page) }, [load, page])

  const submitReply = async () => {
    const body = replyBody.trim()
    if (!body) return
    setReplying(true)
    try {
      const newPost = await forumAPI.createPost(topicId, body)
      setReplyBody('')
      if (page === totalPages && posts.length < POSTS_PAGE_SIZE) {
        setPosts((p) => [...p, newPost]); setTotal((t) => t + 1)
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      } else {
        setPage(Math.ceil((total + 1) / POSTS_PAGE_SIZE))
      }
      toast.success('Reply posted!')
    } catch { toast.error('Failed to post reply') }
    finally { setReplying(false) }
  }

  const saveEdit = async (postId: string, body: string) => {
    try {
      const updated = await forumAPI.updatePost(postId, body)
      setPosts((p) => p.map((x) => x.id === updated.id ? updated : x))
      setEditingPost(null)
      toast.success('Updated!')
    } catch { toast.error('Failed to update') }
  }

  const saveTopic = async (title: string, body: string) => {
    if (!topic) return
    try {
      const updated = await forumAPI.updateTopic(topic.id, { title, body })
      setTopic(updated)
      setEditingTopic(false)
      toast.success('Topic updated!')
    } catch { toast.error('Failed to update topic') }
  }

  const deletePost = async (postId: string) => {
    try {
      await forumAPI.deletePost(postId)
      setPosts((p) => p.map((x) => x.id === postId ? { ...x, is_deleted: true } : x))
      setConfirmDeleteId(null)
      toast.success('Deleted!')
    } catch { toast.error('Failed to delete') }
  }

  const reportTopic = async () => {
    if (!topic) return
    if (!isAuthenticated) {
      toast.error('Please sign in to flag content')
      navigate('/login')
      return
    }
    if (user?.id && topic.author_id === user.id) {
      toast.error('You cannot flag your own topic')
      return
    }

    const reportType: ForumReportType = 'inappropriate_content'
    const description = window.prompt('Why are you flagging this topic? (optional)')
    if (description === null) return

    try {
      await forumAPI.reportTopic(topic.id, reportType, description.trim())
      toast.success('Topic flagged for moderator review')
    } catch {
      toast.error('Could not submit topic flag')
    }
  }

  const reportReply = async (post: ForumPost) => {
    if (!isAuthenticated) {
      toast.error('Please sign in to flag content')
      navigate('/login')
      return
    }
    if (user?.id && post.author_id === user.id) {
      toast.error('You cannot flag your own reply')
      return
    }

    const reportType: ForumReportType = 'inappropriate_content'
    const description = window.prompt('Why are you flagging this reply? (optional)')
    if (description === null) return

    try {
      await forumAPI.reportPost(post.id, reportType, description.trim())
      toast.success('Reply flagged for moderator review')
    } catch {
      toast.error('Could not submit reply flag')
    }
  }

  if (loading) {
    return (
      <Box flex={1} overflowY="auto" bg={GRAY50} p={{ base: 3, md: 5 }}>
        <Box bg={WHITE} borderRadius="14px" border={`1px solid ${GRAY200}`} p={6}>
          <Skel h="22px" w="55%" mb={4} />
          <Flex gap={3} mb={5}><Skel h="36px" w="36px" /><Box flex={1}><Skel h="13px" w="40%" mb={2} /><Skel h="11px" w="30%" /></Box></Flex>
          <Skel h="13px" mb={2} /><Skel h="13px" mb={2} /><Skel h="13px" w="70%" />
        </Box>
      </Box>
    )
  }
  if (error) return <Box flex={1} p={8} textAlign="center"><Text color={RED}>{error}</Text></Box>
  if (!topic) return null

  return (
    <Box flex={1} overflowY="auto" bg={GRAY50} p={{ base: 3, md: 5 }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>

      {/* Back */}
      <Flex as="button" align="center" gap={2} mb={4} color={GRAY500} fontSize="13px"
        _hover={{ color: GRAY700 }} onClick={onBack}>
        <FiArrowLeft size={13} /> {topic.category_name}
      </Flex>

      {/* Topic header */}
      <Box bg={WHITE} borderRadius="14px" border={`1px solid ${GRAY200}`} overflow="hidden" mb={4}
        boxShadow="0 1px 4px rgba(0,0,0,0.04)">
        <Box px={5} pt={5} pb={4} borderBottom={`1px solid ${GRAY100}`}>
          <Flex gap={2} flexWrap="wrap" mb={2}>
            {topic.is_pinned && (
              <Flex align="center" gap={1} bg={GREEN_LT} color={GREEN} borderRadius="5px" px={2} py="1px" fontSize="10px" fontWeight={600}>
                <FiMapPin size={9} /> Pinned
              </Flex>
            )}
            {topic.is_locked && (
              <Flex align="center" gap={1} bg={GRAY100} color={GRAY500} borderRadius="5px" px={2} py="1px" fontSize="10px" fontWeight={600}>
                <FiLock size={9} /> Locked
              </Flex>
            )}
          </Flex>
          <Text fontSize={{ base: '17px', md: '22px' }} fontWeight={800} color={GRAY800} mb={2}>
            {topic.title}
          </Text>
          <Flex align="center" justify="space-between" gap={3} flexWrap="wrap">
            <Flex align="center" gap={4} flexWrap="wrap">
            <Flex align="center" gap={1} fontSize="12px" color={GRAY400}><FiMessageSquare size={11} /><Text>{topic.reply_count} replies</Text></Flex>
            <Flex align="center" gap={1} fontSize="12px" color={GRAY400}><FiEye size={11} /><Text>{topic.view_count} views</Text></Flex>
            </Flex>
            <Flex align="center" gap={2}>
              {isAuthenticated && (!user?.id || topic.author_id !== user.id) && (
                <Button size="xs" variant="outline" borderRadius="8px" onClick={reportTopic}>
                  <Flex align="center" gap={1}><FiFlag size={11} /></Flex>
                </Button>
              )}
              {isAuthenticated && user?.id === topic.author_id && !topic.is_locked && !editingTopic && (
                <Button size="xs" variant="outline" borderRadius="8px" onClick={() => setEditingTopic(true)}>
                  <Flex align="center" gap={1}><FiEdit2 size={11} /> Edit</Flex>
                </Button>
              )}
            </Flex>
          </Flex>
        </Box>

        {/* OP body */}
        <Box px={5} py={5} bg={GREEN_LT}>
          <Flex gap={3}>
            <UserAvatar name={topic.author_name} avatarUrl={topic.author_avatar_url} size={38} />
            <Box flex={1}>
              <Flex align="center" gap={2} mb={2}>
                <Text fontSize="14px" fontWeight={700} color={GRAY800}>{topic.author_name}</Text>
                <Box bg={GREEN} color={WHITE} borderRadius="5px" px={2} py="1px" fontSize="10px" fontWeight={700}>Author</Box>
                <Text fontSize="11px" color={GRAY500}>{timeAgo(topic.created_at)}</Text>
              </Flex>
              {editingTopic ? (
                <TopicInlineEdit topic={topic} onSave={saveTopic} onCancel={() => setEditingTopic(false)} />
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
        <Box bg={WHITE} borderRadius="14px" border={`1px solid ${GRAY200}`} overflow="hidden" mb={4}
          boxShadow="0 1px 4px rgba(0,0,0,0.04)">
          <Box px={4} py={3} borderBottom={`1px solid ${GRAY100}`}>
            <Text fontSize="11px" color={GRAY400} fontWeight={500}>{total} repl{total === 1 ? 'y' : 'ies'}</Text>
          </Box>
          {posts.map((post) => {
            const isOwn = user?.id && post.author_id === user.id
            const isAuthor = post.author_id === topic.author_id
            if (post.is_deleted) {
              return (
                <Box key={post.id} px={4} py="12px" borderBottom={`1px solid ${GRAY100}`} _last={{ borderBottom: 'none' }}>
                  <Text fontSize="13px" color={GRAY400} fontStyle="italic">[Deleted]</Text>
                </Box>
              )
            }
            if (editingPost?.id === post.id) {
              return (
                <Box key={post.id} px={4} py={4} borderBottom={`1px solid ${GRAY100}`} _last={{ borderBottom: 'none' }}>
                  <Flex gap={3}>
                    <UserAvatar name={post.author_name} avatarUrl={post.author_avatar_url} size={32} />
                    <Box flex={1}>
                      <Text fontSize="12px" color={GRAY500} mb={2}>Editing…</Text>
                      <Textarea
                        value={editingPost.body}
                        onChange={(e) => setEditingPost({ ...editingPost, body: e.target.value })}
                        rows={4} fontSize="13px" resize="vertical"
                        border={`1px solid ${GRAY300}`} borderRadius="10px" bg={GRAY50}
                        _focus={{ borderColor: GREEN, bg: WHITE }} mb={2}
                      />
                      <Flex gap={2} justify="flex-end">
                        <Button size="xs" variant="ghost" onClick={() => setEditingPost(null)}>Cancel</Button>
                        <Button size="xs" bg={GREEN} color={WHITE} _hover={{ bg: '#214D41' }}
                          onClick={() => saveEdit(post.id, editingPost.body)} disabled={!editingPost.body.trim()}>
                          Save
                        </Button>
                      </Flex>
                    </Box>
                  </Flex>
                </Box>
              )
            }
            return (
              <Box key={post.id} px={4} py="14px" borderBottom={`1px solid ${GRAY100}`} _last={{ borderBottom: 'none' }}
                bg={isAuthor ? '#F0FDF4' : WHITE}>
                <Flex gap={3}>
                  <UserAvatar name={post.author_name} avatarUrl={post.author_avatar_url} size={32} />
                  <Box flex={1}>
                    <Flex align="center" justify="space-between" mb="6px" flexWrap="wrap" gap={2}>
                      <Flex align="center" gap={2}>
                        <Text fontSize="13px" fontWeight={700} color={GRAY800}>{post.author_name}</Text>
                        {isAuthor && <Box bg={GREEN} color={WHITE} borderRadius="4px" px="6px" py="1px" fontSize="9px" fontWeight={700}>OP</Box>}
                        <Text fontSize="11px" color={GRAY400}>{timeAgo(post.created_at)}</Text>
                        {post.updated_at !== post.created_at && <Text fontSize="10px" color={GRAY400} fontStyle="italic">(edited)</Text>}
                      </Flex>
                      {isOwn && (
                        confirmDeleteId === post.id ? (
                          <Flex align="center" gap={2}>
                            <Text fontSize="11px" color={RED}>Delete?</Text>
                            <Box as="button" p={1} borderRadius="6px" bg={RED_LT} color={RED} onClick={() => deletePost(post.id)}>
                              <FiCheck size={11} />
                            </Box>
                            <Box as="button" p={1} borderRadius="6px" bg={GRAY100} color={GRAY600} onClick={() => setConfirmDeleteId(null)}>
                              <FiX size={11} />
                            </Box>
                          </Flex>
                        ) : (
                          <Flex gap={1}>
                            <Box as="button" p={1} borderRadius="6px" color={GRAY400} _hover={{ bg: GRAY100, color: GRAY700 }}
                              onClick={() => setEditingPost(post)}>
                              <FiEdit2 size={12} />
                            </Box>
                            <Box as="button" p={1} borderRadius="6px" color={GRAY400} _hover={{ bg: RED_LT, color: RED }}
                              onClick={() => setConfirmDeleteId(post.id)}>
                              <FiTrash2 size={12} />
                            </Box>
                          </Flex>
                        )
                      )}
                      {!isOwn && isAuthenticated && (
                        <Box as="button" p={1} borderRadius="6px" color={GRAY400} _hover={{ bg: RED_LT, color: RED }} onClick={() => void reportReply(post)}>
                          <FiFlag size={12} />
                        </Box>
                      )}
                    </Flex>
                    <Text fontSize="14px" color={GRAY700} lineHeight={1.7} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {post.body}
                    </Text>
                  </Box>
                </Flex>
              </Box>
            )
          })}
        </Box>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Flex justify="center" gap={2} mb={4}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Box key={p} as="button" w="34px" h="34px" borderRadius="9px" fontSize="13px"
              border={`1px solid ${page === p ? GREEN : GRAY200}`}
              bg={page === p ? GREEN : WHITE}
              color={page === p ? WHITE : GRAY600}
              fontWeight={page === p ? 700 : 400}
              onClick={() => setPage(p)}>{p}</Box>
          ))}
        </Flex>
      )}

      <div ref={bottomRef} />

      {/* Reply form */}
      {isAuthenticated && !topic.is_locked ? (
        <Box bg={WHITE} borderRadius="14px" border={`1px solid ${GRAY200}`} p={4}
          boxShadow="0 1px 4px rgba(0,0,0,0.04)">
          <Text fontSize="13px" fontWeight={700} color={GRAY800} mb={3}>Add a reply</Text>
          <Textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Write your reply…"
            rows={4} fontSize="14px" resize="vertical"
            border={`1px solid ${GRAY300}`} borderRadius="11px" bg={GRAY50}
            _focus={{ borderColor: GREEN, bg: WHITE }} mb={3}
          />
          <Flex justify="space-between" align="center">
            <Text fontSize="11px" color={GRAY400}>{replyBody.length} chars</Text>
            <Button bg={GREEN} color={WHITE} borderRadius="9px" size="sm" px={4}
              _hover={{ bg: '#214D41' }} onClick={submitReply}
              disabled={replying || !replyBody.trim()}
              style={{ opacity: (!replyBody.trim() || replying) ? 0.6 : 1 }}>
              <Flex align="center" gap={2}><FiSend size={13} />{replying ? 'Posting…' : 'Post Reply'}</Flex>
            </Button>
          </Flex>
        </Box>
      ) : topic.is_locked ? (
        <Box bg={GRAY100} borderRadius="12px" p={4} textAlign="center">
          <Flex align="center" justify="center" gap={2} color={GRAY500}>
            <FiLock size={13} /><Text fontSize="13px">This topic is locked.</Text>
          </Flex>
        </Box>
      ) : (
        <Box bg={GRAY100} borderRadius="12px" p={4} textAlign="center">
          <Text fontSize="13px" color={GRAY500}>
            <Text as="span" color={GREEN} fontWeight={600} cursor="pointer" _hover={{ textDecoration: 'underline' }}
              onClick={() => navigate('/login')}>Sign in</Text>{' '}to reply.
          </Text>
        </Box>
      )}
    </Box>
  )
}

// ─── Root ForumPage ───────────────────────────────────────────────────────────

type ForumView =
  | { kind: 'home' }
  | { kind: 'category'; slug: string; cat: ForumCategory | null }
  | { kind: 'topic'; topicId: string; catSlug: string }

export default function ForumPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, user } = useAuthStore()

  const [categories, setCategories] = useState<ForumCategory[]>([])
  const [catsLoading, setCatsLoading] = useState(true)

  // Parse URL to determine initial view
  const [view, setView] = useState<ForumView>(() => {
    if (location.pathname.startsWith('/forum/topic/')) {
      const topicId = location.pathname.split('/forum/topic/')[1]
      return { kind: 'topic', topicId, catSlug: '' }
    }
    if (location.pathname.startsWith('/forum/category/')) {
      const slug = location.pathname.split('/forum/category/')[1]
      return { kind: 'category', slug, cat: null }
    }
    return { kind: 'home' }
  })

  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Forum activity stats for sidebar
  const [myTopics, setMyTopics]   = useState(0)
  const [myReplies, setMyReplies] = useState(0)

  useEffect(() => {
    if (!user) return
    const ac = new AbortController()
    forumAPI.getMyActivity(ac.signal)
      .then((activity) => {
        setMyTopics(activity.my_topics)
        setMyReplies(activity.my_replies)
      })
      .catch(() => {})
    return () => ac.abort()
  }, [user])

  useEffect(() => {
    const ctrl = new AbortController()
    forumAPI.listCategories(ctrl.signal)
      .then((data) => {
        const active = data.filter((c) => c.is_active)
        setCategories(active)
        // If we were deep-linked to a category, resolve the category object
        setView((v) => {
          if (v.kind === 'category' && !v.cat) {
            const found = active.find((c) => c.slug === v.slug)
            return found ? { kind: 'category', slug: v.slug, cat: found } : { kind: 'home' }
          }
          return v
        })
      })
      .catch(() => {})
      .finally(() => setCatsLoading(false))
    return () => ctrl.abort()
  }, [])

  // Update URL when view changes
  useEffect(() => {
    if (view.kind === 'home') {
      navigate('/forum', { replace: true })
    } else if (view.kind === 'category') {
      navigate(`/forum/category/${view.slug}`, { replace: true })
    } else if (view.kind === 'topic') {
      navigate(`/forum/topic/${view.topicId}`, { replace: true })
    }
  }, [view, navigate])

  const handleSelectCategory = (cat: ForumCategory) => {
    setView({ kind: 'category', slug: cat.slug, cat })
    setSidebarOpen(false)
  }

  const handleHome = () => {
    setView({ kind: 'home' })
    setSidebarOpen(false)
  }

  const handleSelectTopic = (topicId: string) => {
    if (view.kind === 'category') {
      setView({ kind: 'topic', topicId, catSlug: view.slug })
    } else {
      setView({ kind: 'topic', topicId, catSlug: '' })
    }
  }

  const handleBackFromTopic = () => {
    if (view.kind === 'topic' && view.catSlug) {
      const cat = categories.find((c) => c.slug === view.catSlug)
      if (cat) { setView({ kind: 'category', slug: cat.slug, cat }); return }
    }
    setView({ kind: 'home' })
  }

  const selectedSlug = view.kind === 'category' ? view.slug : null

  return (
    <Box bg={GRAY50} h="calc(100vh - 64px)" overflow="hidden" py={{ base: 0, md: '8px' }} px={{ base: 0, md: '12px' }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      <Box
        maxW="1440px" mx="auto"
        h={{ base: 'calc(100vh - 64px)', md: 'calc(100vh - 88px)' }}
        borderRadius={{ base: 0, md: '20px' }}
        boxShadow={{ base: 'none', md: '0 4px 24px rgba(0,0,0,0.08)' }}
        border={{ base: 'none', md: `1px solid ${GRAY200}` }}
        display="flex" overflow="hidden" position="relative"
      >
        {/* ── Left sidebar ── */}
        <Box
          display={{ base: sidebarOpen ? 'flex' : 'none', md: 'flex' }}
          position={{ base: 'absolute', md: 'relative' }}
          zIndex={{ base: 30, md: 'auto' }}
          top={0} left={0} bottom={0}
          flexShrink={0}
        >
          <CategorySidebar
            categories={categories}
            loading={catsLoading}
            selectedSlug={selectedSlug}
            onSelect={handleSelectCategory}
            onHome={handleHome}
            user={user}
            myTopics={myTopics}
            myReplies={myReplies}
            isAuthenticated={isAuthenticated}
          />
        </Box>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <Box
            display={{ base: 'block', md: 'none' }}
            position="absolute" inset={0} zIndex={20}
            bg="rgba(0,0,0,0.4)"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Main panel ── */}
        <Flex direction="column" flex={1} h="100%" overflow="hidden" minW={0}>
          {/* Content */}
          {view.kind === 'home' && (
            <ForumHomeView
              categories={categories}
              loading={catsLoading}
              onSelect={handleSelectCategory}
              onSelectTopic={handleSelectTopic}
            />
          )}
          {view.kind === 'category' && view.cat && (
            <TopicListView
              category={view.cat}
              onSelectTopic={handleSelectTopic}
              isAuthenticated={isAuthenticated}
              navigate={navigate}
            />
          )}
          {view.kind === 'topic' && (
            <TopicDetailView
              topicId={view.topicId}
              onBack={handleBackFromTopic}
              isAuthenticated={isAuthenticated}
              user={user}
              navigate={navigate}
            />
          )}
        </Flex>
      </Box>
    </Box>
  )
}
