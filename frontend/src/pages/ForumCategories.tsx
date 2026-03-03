import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Flex, Grid, Stack, Text } from '@chakra-ui/react'
import {
  FiMessageSquare, FiBookOpen, FiCalendar, FiUsers, FiStar,
  FiZap, FiGlobe, FiCode, FiHeart, FiHome, FiTool, FiAward,
  FiChevronRight, FiClock,
} from 'react-icons/fi'
import { forumAPI } from '@/services/forumAPI'
import type { ForumCategory } from '@/types'
import {
  GREEN, GREEN_LT, BLUE, BLUE_LT, AMBER, AMBER_LT,
  PURPLE, PURPLE_LT, RED, RED_LT,
  GRAY50, GRAY100, GRAY200, GRAY400, GRAY500, GRAY700, GRAY800, WHITE,
} from '@/theme/tokens'

// ─── Icon map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ReactNode> = {
  'message-square': <FiMessageSquare size={22} />,
  'book-open':      <FiBookOpen size={22} />,
  'calendar':       <FiCalendar size={22} />,
  'users':          <FiUsers size={22} />,
  'star':           <FiStar size={22} />,
  'lightbulb':      <FiZap size={22} />,
  'globe':          <FiGlobe size={22} />,
  'code':           <FiCode size={22} />,
  'heart':          <FiHeart size={22} />,
  'home':           <FiHome size={22} />,
  'tool':           <FiTool size={22} />,
  'award':          <FiAward size={22} />,
}

// ─── Color map ────────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, { bg: string; text: string; light: string }> = {
  blue:   { bg: BLUE,   text: WHITE,  light: BLUE_LT   },
  green:  { bg: GREEN,  text: WHITE,  light: GREEN_LT  },
  purple: { bg: PURPLE, text: WHITE,  light: PURPLE_LT },
  amber:  { bg: AMBER,  text: WHITE,  light: AMBER_LT  },
  orange: { bg: '#EA580C', text: WHITE,  light: '#FFF7ED' },
  pink:   { bg: '#DB2777', text: WHITE,  light: '#FDF2F8' },
  red:    { bg: RED,    text: WHITE,  light: RED_LT    },
  teal:   { bg: '#0D9488', text: WHITE,  light: '#F0FDFA' },
}

function timeAgo(iso: string | null) {
  if (!iso) return 'No activity'
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d < 7 ? `${d}d ago`
    : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── Category Card ────────────────────────────────────────────────────────────

function CategoryCard({ cat, onClick }: { cat: ForumCategory; onClick: () => void }) {
  const c     = COLOR_MAP[cat.color] ?? COLOR_MAP.blue
  const icon  = ICON_MAP[cat.icon]  ?? <FiMessageSquare size={22} />
  const [hov, setHov] = useState(false)

  return (
    <Box
      bg={WHITE}
      borderRadius="18px"
      border={`1px solid ${hov ? GRAY400 : GRAY200}`}
      boxShadow={hov ? '0 6px 24px rgba(0,0,0,0.10)' : '0 2px 8px rgba(0,0,0,0.04)'}
      overflow="hidden"
      cursor="pointer"
      transition="all 0.18s"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      display="flex"
      flexDirection="column"
    >
      {/* Coloured top strip */}
      <Box h="4px" bg={c.bg} />

      <Box p={5} flex={1} display="flex" flexDirection="column" gap={4}>
        {/* Icon + name */}
        <Flex align="center" gap={3}>
          <Flex
            w="44px" h="44px" borderRadius="12px" flexShrink={0}
            bg={c.light} color={c.bg}
            align="center" justify="center"
          >
            {icon}
          </Flex>
          <Box flex={1} minW={0}>
            <Text fontSize="15px" fontWeight={700} color={GRAY800} lineHeight={1.3}>
              {cat.name}
            </Text>
            {cat.topic_count > 0 && (
              <Text fontSize="11px" color={GRAY500} fontWeight={500}>
                {cat.topic_count} topic{cat.topic_count !== 1 ? 's' : ''}
              </Text>
            )}
          </Box>
          <FiChevronRight size={16} color={GRAY400} />
        </Flex>

        {/* Description */}
        <Text
          fontSize="13px" color={GRAY500} lineHeight={1.55} flex={1}
          style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
        >
          {cat.description}
        </Text>

        {/* Footer stats */}
        <Flex align="center" justify="space-between" pt={2} borderTop={`1px solid ${GRAY100}`}>
          <Flex align="center" gap={1} fontSize="12px" color={GRAY400}>
            <FiMessageSquare size={11} />
            <Text>{cat.post_count} post{cat.post_count !== 1 ? 's' : ''}</Text>
          </Flex>
          <Flex align="center" gap={1} fontSize="12px" color={GRAY400}>
            <FiClock size={11} />
            <Text>{timeAgo(cat.last_activity)}</Text>
          </Flex>
        </Flex>
      </Box>
    </Box>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skel({ h = '16px', w = '100%', mb }: { h?: string; w?: string; mb?: number | string }) {
  return <Box h={h} w={w} mb={mb} borderRadius="6px" bg={GRAY200} style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ForumCategories() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState<ForumCategory[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    forumAPI.listCategories(ctrl.signal)
      .then((data) => setCategories(data.filter((c) => c.is_active)))
      .catch((e) => { if (!ctrl.signal.aborted) setError(e.message ?? 'Failed to load') })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [])

  return (
    <Box bg={GRAY50} minH="calc(100vh - 64px)" py={{ base: 4, md: 6 }} px={{ base: 3, md: 6 }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      <Box maxW="1100px" mx="auto">

        {/* Header */}
        <Box mb={8}>
          <Text fontSize={{ base: '22px', md: '28px' }} fontWeight={800} color={GRAY800} mb={1}>
            Community Forum
          </Text>
          <Text fontSize="14px" color={GRAY500}>
            Discuss, ask questions, and share knowledge with the Hive community.
          </Text>
        </Box>

        {error ? (
          <Box textAlign="center" py={12}>
            <Text color={RED} fontSize="14px">{error}</Text>
          </Box>
        ) : loading ? (
          <Grid templateColumns={{ base: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' }} gap={4}>
            {[1,2,3,4,5,6].map((i) => (
              <Box key={i} bg={WHITE} borderRadius="18px" border={`1px solid ${GRAY200}`} overflow="hidden" p={5}>
                <Box h="4px" bg={GRAY200} mx={-5} mt={-5} mb={4} />
                <Flex align="center" gap={3} mb={4}>
                  <Skel h="44px" w="44px" />
                  <Stack gap={2} flex={1}><Skel w="60%" /><Skel w="40%" h="12px" /></Stack>
                </Flex>
                <Skel h="12px" mb={2} /><Skel h="12px" w="80%" />
              </Box>
            ))}
          </Grid>
        ) : categories.length === 0 ? (
          <Box textAlign="center" py={16}>
            <Text fontSize="2xl" mb={3}>💬</Text>
            <Text fontSize="16px" fontWeight={600} color={GRAY700} mb={1}>No categories yet</Text>
            <Text fontSize="13px" color={GRAY400}>Forum categories will appear here.</Text>
          </Box>
        ) : (
          <Grid templateColumns={{ base: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' }} gap={4}>
            {[...categories].sort((a, b) => a.display_order - b.display_order).map((cat) => (
              <CategoryCard
                key={cat.id}
                cat={cat}
                onClick={() => navigate(`/forum/category/${cat.slug}`)}
              />
            ))}
          </Grid>
        )}
      </Box>
    </Box>
  )
}
