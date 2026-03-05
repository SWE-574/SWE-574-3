import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Box, Flex, Stack, Text, Button } from '@chakra-ui/react'
import {
  FiArrowLeft, FiPlus, FiMessageSquare, FiEye, FiMapPin, FiLock,
  FiClock, FiChevronLeft, FiChevronRight,
} from 'react-icons/fi'
import { forumAPI } from '@/services/forumAPI'
import { useAuthStore } from '@/store/useAuthStore'
import type { ForumCategory, ForumTopic } from '@/types'
import {
  GREEN, GREEN_LT,
  GRAY50, GRAY100, GRAY200, GRAY300, GRAY400, GRAY500, GRAY600, GRAY700, GRAY800, WHITE, RED,
} from '@/theme/tokens'
import { SidebarLayout } from '@/components/MainSidebar'

const PAGE_SIZE = 15

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

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initial = name.charAt(0).toUpperCase()
  const colors = ['#2D5C4E', '#1D4ED8', '#7C3AED', '#D97706', '#EA580C', '#0D9488']
  const idx    = name.charCodeAt(0) % colors.length
  return (
    <Flex
      flexShrink={0}
      w={`${size}px`} h={`${size}px`}
      borderRadius="full" bg={colors[idx]}
      align="center" justify="center"
      color={WHITE} fontSize={`${Math.round(size * 0.4)}px`} fontWeight={700}
    >
      {initial}
    </Flex>
  )
}

// ─── Topic Row ────────────────────────────────────────────────────────────────

function TopicRow({ topic, onClick }: { topic: ForumTopic; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <Box
      bg={hov ? GRAY50 : WHITE}
      borderBottom={`1px solid ${GRAY100}`}
      px={5} py={4}
      cursor="pointer"
      transition="background 0.13s"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onClick}
      _last={{ borderBottom: 'none' }}
    >
      <Flex align="flex-start" gap={3}>
        <Avatar name={topic.author_name} />

        <Box flex={1} minW={0}>
          {/* Title row */}
          <Flex align="center" gap={2} flexWrap="wrap" mb={1}>
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
            <Text
              fontSize="15px" fontWeight={600} color={GRAY800}
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {topic.title}
            </Text>
          </Flex>

          {/* Meta */}
          <Flex align="center" gap={3} flexWrap="wrap">
            <Text fontSize="12px" color={GRAY500}>by <Text as="span" fontWeight={600} color={GRAY700}>{topic.author_name}</Text></Text>
            <Flex align="center" gap={1} fontSize="12px" color={GRAY400}>
              <FiClock size={11} />
              <Text>{timeAgo(topic.last_activity)}</Text>
            </Flex>
          </Flex>
        </Box>

        {/* Stats */}
        <Flex gap={4} flexShrink={0} align="center">
          <Flex direction="column" align="center" gap={0}>
            <Flex align="center" gap={1} color={GRAY500}>
              <FiMessageSquare size={13} />
              <Text fontSize="13px" fontWeight={600} color={GRAY700}>{topic.reply_count}</Text>
            </Flex>
            <Text fontSize="11px" color={GRAY400}>replies</Text>
          </Flex>
          <Flex direction="column" align="center" gap={0}>
            <Flex align="center" gap={1} color={GRAY500}>
              <FiEye size={13} />
              <Text fontSize="13px" fontWeight={600} color={GRAY700}>{topic.view_count}</Text>
            </Flex>
            <Text fontSize="11px" color={GRAY400}>views</Text>
          </Flex>
        </Flex>
      </Flex>
    </Box>
  )
}

function Skel({ h = '16px', w = '100%', mb }: { h?: string; w?: string; mb?: number | string }) {
  return <Box h={h} w={w} mb={mb} borderRadius="6px" bg={GRAY200} style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ForumTopicList() {
  const { slug }       = useParams<{ slug: string }>()
  const navigate       = useNavigate()
  const { isAuthenticated } = useAuthStore()

  const [category, setCategory] = useState<ForumCategory | null>(null)
  const [topics, setTopics]     = useState<ForumTopic[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const load = useCallback(async (p: number, signal: AbortSignal) => {
    if (!slug) return
    setLoading(true)
    setError(null)
    try {
      const [cat, res] = await Promise.all([
        forumAPI.getCategory(slug, signal),
        forumAPI.listTopics({ category: slug, page: p, page_size: PAGE_SIZE }, signal),
      ])
      setCategory(cat)
      // pinned topics float to the top
      const sorted = [...res.results].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0))
      setTopics(sorted)
      setTotal(res.count)
    } catch (e: unknown) {
      if (!signal.aborted) setError((e as Error).message ?? 'Failed to load')
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    const ctrl = new AbortController()
    load(page, ctrl.signal)
    return () => ctrl.abort()
  }, [load, page])

  const goPage = (p: number) => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setPage(p)
  }

  return (
    <SidebarLayout sidebarProps={{ hideLocationFilters: true }}>
      <Box flex={1} overflowY="auto" bg={GRAY50} py={{ base: 4, md: 6 }} px={{ base: 3, md: 6 }}>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
        <Box maxW="860px" mx="auto">

          {/* Back + header */}
          <Flex align="flex-start" justify="space-between" mb={6} gap={4} flexWrap="wrap">
            <Box>
              <Flex
                as="button" align="center" gap={2}
                color={GRAY500} fontSize="13px" mb={3} cursor="pointer" _hover={{ color: GRAY700 }}
                onClick={() => navigate('/forum')}
              >
                <FiArrowLeft size={14} /> Forum
              </Flex>
              <Text fontSize={{ base: '20px', md: '26px' }} fontWeight={800} color={GRAY800} mb={1}>
                {category ? category.name : (loading ? '...' : 'Category')}
              </Text>
              {category && (
                <Text fontSize="13px" color={GRAY500}>{category.description}</Text>
              )}
            </Box>

            {isAuthenticated && (
              <Button
                size="sm"
                bg={GREEN} color={WHITE}
                borderRadius="10px"
                px={4}
                _hover={{ bg: '#214D41' }}
                onClick={() => navigate(`/forum/new?category=${slug}`)}
                flexShrink={0}
              >
                <Flex align="center" gap={2}><FiPlus size={14} /> New Topic</Flex>
              </Button>
            )}
          </Flex>

          {/* Topic list card */}
          <Box
            bg={WHITE}
            borderRadius="18px"
            border={`1px solid ${GRAY200}`}
            boxShadow="0 2px 10px rgba(0,0,0,0.05)"
            overflow="hidden"
            mb={6}
          >
            {loading ? (
              <Box p={5}>
                <Stack gap={5}>
                  {[1,2,3,4,5].map((i) => (
                    <Flex key={i} align="flex-start" gap={3}>
                      <Skel h="36px" w="36px" />
                      <Box flex={1}>
                        <Skel h="15px" w="70%" mb={2} />
                        <Skel h="12px" w="40%" />
                      </Box>
                      <Skel h="36px" w="60px" />
                    </Flex>
                  ))}
                </Stack>
              </Box>
            ) : error ? (
              <Box p={8} textAlign="center">
                <Text color={RED} fontSize="14px">{error}</Text>
              </Box>
            ) : topics.length === 0 ? (
              <Box p={12} textAlign="center">
                <Text fontSize="2xl" mb={3}>💬</Text>
                <Text fontSize="15px" fontWeight={600} color={GRAY700} mb={1}>No topics yet</Text>
                <Text fontSize="13px" color={GRAY400} mb={4}>Be the first to start a discussion!</Text>
                {isAuthenticated && (
                  <Button
                    size="sm" bg={GREEN} color={WHITE} borderRadius="10px" px={4}
                    _hover={{ bg: '#214D41' }}
                    onClick={() => navigate(`/forum/new?category=${slug}`)}
                  >
                    <Flex align="center" gap={2}><FiPlus size={13} /> New Topic</Flex>
                  </Button>
                )}
              </Box>
            ) : (
              <>
                {/* Count header */}
                <Box px={5} py={3} borderBottom={`1px solid ${GRAY100}`}>
                  <Text fontSize="12px" color={GRAY400} fontWeight={500}>{total} topic{total !== 1 ? 's' : ''}</Text>
                </Box>
                {topics.map((t) => (
                  <TopicRow key={t.id} topic={t} onClick={() => navigate(`/forum/topic/${t.id}`)} />
                ))}
              </>
            )}
          </Box>

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <Flex justify="center" align="center" gap={2}>
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

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce<(number | '...')[]>((acc, p, i, arr) => {
                  if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...')
                  acc.push(p)
                  return acc
                }, [])
                .map((p, i) =>
                  p === '...' ? (
                    <Text key={`e${i}`} fontSize="13px" color={GRAY400} px={1}>…</Text>
                  ) : (
                    <Box
                      key={p}
                      as="button"
                      w="36px" h="36px" borderRadius="10px"
                      border={`1px solid ${page === p ? GREEN : GRAY200}`}
                      bg={page === p ? GREEN : WHITE}
                      color={page === p ? WHITE : GRAY600}
                      fontWeight={page === p ? 700 : 400}
                      fontSize="13px"
                      cursor="pointer"
                      onClick={() => goPage(p as number)}
                    >
                      {p}
                    </Box>
                  )
                )}

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
        </Box>
      </Box>
    </SidebarLayout>
  )
}
