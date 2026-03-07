import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Flex, Grid, Spinner, Text } from '@chakra-ui/react'
import { FiAward, FiLock, FiStar, FiTrendingUp, FiX } from 'react-icons/fi'
import { toast } from 'sonner'

import { useAuthStore } from '@/store/useAuthStore'
import { userAPI } from '@/services/userAPI'
import type { AchievementProgressItem } from '@/types'
import { getAchievementMeta } from '@/utils/achievementMeta'
import {
  AMBER,
  AMBER_LT,
  BLUE,
  BLUE_LT,
  GRAY50,
  GRAY100,
  GRAY200,
  GRAY300,
  GRAY400,
  GRAY500,
  GRAY600,
  GRAY700,
  GRAY800,
  GREEN,
  GREEN_LT,
  PURPLE,
  PURPLE_LT,
  WHITE,
} from '@/theme/tokens'

function formatEarnedDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function SummaryStat({
  label,
  value,
  icon,
  color,
  bg,
}: {
  label: string
  value: string | number
  icon: React.ReactNode
  color: string
  bg: string
}) {
  return (
    <Box borderRadius="16px" border={`1px solid ${GRAY200}`} bg={WHITE} overflow="hidden">
      <Box h="3px" style={{ background: `linear-gradient(90deg, ${color}, ${color}99)` }} />
      <Flex align="center" gap={3} px={4} py={4}>
        <Flex w="38px" h="38px" borderRadius="12px" align="center" justify="center" style={{ background: bg, color }}>
          {icon}
        </Flex>
        <Box>
          <Text fontSize="22px" fontWeight={800} color={color} lineHeight={1}>{value}</Text>
          <Text fontSize="11px" fontWeight={700} color={GRAY400} textTransform="uppercase" letterSpacing="0.07em">{label}</Text>
        </Box>
      </Flex>
    </Box>
  )
}

function AchievementCard({
  item,
  onClick,
}: {
  item: AchievementProgressItem
  onClick: () => void
}) {
  const { icon: Icon, color, rarity } = getAchievementMeta(item.badge_type)
  const locked = !item.earned
  const hidden = !item.earned && item.achievement.is_hidden
  const earnedDate = formatEarnedDate(item.earned_at)
  const current = item.current ?? 0
  const threshold = item.threshold ?? 0

  return (
    <Box
      as="button"
      onClick={onClick}
      textAlign="left"
      borderRadius="18px"
      border={`1px solid ${locked ? GRAY200 : color + '33'}`}
      bg={WHITE}
      overflow="hidden"
      style={{
        cursor: 'pointer',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
        opacity: locked ? 0.92 : 1,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.transform = 'translateY(-2px)'
        el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'
        el.style.borderColor = locked ? GRAY300 : `${color}55`
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.transform = 'translateY(0)'
        el.style.boxShadow = 'none'
        el.style.borderColor = locked ? GRAY200 : `${color}33`
      }}
    >
      <Box
        px={4}
        py={4}
        style={{
          background: locked
            ? `linear-gradient(135deg, ${GRAY50} 0%, ${WHITE} 100%)`
            : `linear-gradient(135deg, ${color}14 0%, ${WHITE} 100%)`,
        }}
      >
        <Flex align="start" justify="space-between" gap={3} mb={3}>
          <Flex w="48px" h="48px" borderRadius="16px" align="center" justify="center" style={{ background: locked ? GRAY100 : `${color}22`, color: locked ? GRAY400 : color }}>
            {hidden ? <FiLock size={22} /> : <Icon size={22} />}
          </Flex>
          <Box px="9px" py="4px" borderRadius="999px" fontSize="10px" fontWeight={700} style={{ background: locked ? GRAY100 : `${color}18`, color: locked ? GRAY500 : color }}>
            {locked ? 'Locked' : rarity}
          </Box>
        </Flex>

        <Text fontSize="16px" fontWeight={800} color={GRAY800} mb={1}>
          {hidden ? 'Hidden Achievement' : item.achievement.name}
        </Text>
        <Text fontSize="13px" color={GRAY500} lineHeight={1.6} minH="42px">
          {hidden ? 'Keep contributing to reveal this community milestone.' : item.achievement.description}
        </Text>
      </Box>

      <Box px={4} py={4}>
        {item.earned ? (
          <Flex align="center" justify="space-between" gap={3}>
            <Box>
              <Text fontSize="11px" color={GRAY400} fontWeight={700} textTransform="uppercase" letterSpacing="0.06em">Status</Text>
              <Text fontSize="13px" fontWeight={700} color={GREEN}>{earnedDate ? `Earned on ${earnedDate}` : 'Achievement unlocked'}</Text>
            </Box>
            <Box textAlign="right">
              <Text fontSize="11px" color={GRAY400} fontWeight={700} textTransform="uppercase" letterSpacing="0.06em">XP</Text>
              <Text fontSize="16px" fontWeight={800} color={color}>+{item.achievement.karma_points ?? 0}</Text>
            </Box>
          </Flex>
        ) : (
          <Box>
            <Flex align="center" justify="space-between" mb={2}>
              <Text fontSize="11px" color={GRAY400} fontWeight={700} textTransform="uppercase" letterSpacing="0.06em">Progress</Text>
              <Text fontSize="12px" color={GRAY600} fontWeight={700}>
                {threshold > 0 ? `${current} / ${threshold}` : `${item.progress_percent}%`}
              </Text>
            </Flex>
            <Box h="8px" borderRadius="999px" bg={GRAY100} overflow="hidden">
              <Box h="100%" borderRadius="999px" style={{ width: `${Math.max(0, Math.min(100, item.progress_percent))}%`, background: color }} />
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  )
}

function AchievementModal({
  item,
  onClose,
}: {
  item: AchievementProgressItem | null
  onClose: () => void
}) {
  if (!item) return null

  const { icon: Icon, color, rarity, howToEarn } = getAchievementMeta(item.badge_type)
  const hidden = !item.earned && item.achievement.is_hidden
  const earnedDate = formatEarnedDate(item.earned_at)

  return (
    <Box position="fixed" inset={0} zIndex={250} bg="rgba(0,0,0,0.58)" display="flex" alignItems="center" justifyContent="center" p={4} onClick={onClose}>
      <Box
        bg={WHITE}
        borderRadius="22px"
        w="100%"
        maxW="620px"
        overflow="hidden"
        boxShadow="0 24px 60px rgba(0,0,0,0.2)"
        onClick={(e) => e.stopPropagation()}
      >
        <Flex px={6} py={5} align="center" justify="space-between" borderBottom={`1px solid ${GRAY100}`}>
          <Flex align="center" gap={3}>
            <Flex w="46px" h="46px" borderRadius="16px" align="center" justify="center" style={{ background: hidden ? GRAY100 : `${color}20`, color: hidden ? GRAY400 : color }}>
              {hidden ? <FiLock size={22} /> : <Icon size={22} />}
            </Flex>
            <Box>
              <Text fontSize="18px" fontWeight={800} color={GRAY800}>{hidden ? 'Hidden Achievement' : item.achievement.name}</Text>
              <Text fontSize="12px" color={GRAY500}>{item.earned ? 'Unlocked milestone' : 'Locked milestone'}</Text>
            </Box>
          </Flex>
          <Box
            as="button"
            onClick={onClose}
            w="34px"
            h="34px"
            borderRadius="10px"
            bg={GRAY100}
            color={GRAY700}
            display="flex"
            alignItems="center"
            justifyContent="center"
            style={{ border: 'none', cursor: 'pointer' }}
          >
            <FiX />
          </Box>
        </Flex>

        <Box px={6} py={5}>
          <Grid templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }} gap={3} mb={5}>
            <SummaryStat label="Rarity" value={rarity} icon={<FiStar size={16} />} color={color} bg={`${color}18`} />
            <SummaryStat label="XP" value={`+${item.achievement.karma_points ?? 0}`} icon={<FiTrendingUp size={16} />} color={PURPLE} bg={PURPLE_LT} />
            <SummaryStat label="Status" value={item.earned ? 'Earned' : 'Locked'} icon={<FiAward size={16} />} color={item.earned ? GREEN : BLUE} bg={item.earned ? GREEN_LT : BLUE_LT} />
          </Grid>

          <Box mb={4}>
            <Text fontSize="11px" color={GRAY400} fontWeight={700} textTransform="uppercase" letterSpacing="0.06em" mb={2}>Description</Text>
            <Text fontSize="14px" color={GRAY700} lineHeight={1.7}>
              {hidden ? 'This hidden achievement will reveal itself once you unlock it.' : item.achievement.description}
            </Text>
          </Box>

          <Box mb={4}>
            <Text fontSize="11px" color={GRAY400} fontWeight={700} textTransform="uppercase" letterSpacing="0.06em" mb={2}>How to Earn</Text>
            <Text fontSize="14px" color={GRAY700} lineHeight={1.7}>{howToEarn}</Text>
          </Box>

          <Box borderRadius="16px" bg={GRAY50} border={`1px solid ${GRAY200}`} px={4} py={4}>
            {item.earned ? (
              <>
                <Text fontSize="11px" color={GRAY400} fontWeight={700} textTransform="uppercase" letterSpacing="0.06em" mb={1}>Earned</Text>
                <Text fontSize="14px" color={GREEN} fontWeight={700}>
                  {earnedDate ? `Unlocked on ${earnedDate}` : 'Unlocked and added to your profile'}
                </Text>
              </>
            ) : (
              <>
                <Flex align="center" justify="space-between" mb={2}>
                  <Text fontSize="11px" color={GRAY400} fontWeight={700} textTransform="uppercase" letterSpacing="0.06em">Progress</Text>
                  <Text fontSize="13px" color={GRAY700} fontWeight={700}>
                    {item.threshold ? `${item.current ?? 0} / ${item.threshold}` : `${item.progress_percent}%`}
                  </Text>
                </Flex>
                <Box h="10px" borderRadius="999px" bg={GRAY200} overflow="hidden" mb={2}>
                  <Box h="100%" borderRadius="999px" style={{ width: `${Math.max(0, Math.min(100, item.progress_percent))}%`, background: color }} />
                </Box>
                <Text fontSize="12px" color={GRAY500}>{item.progress_percent}% complete</Text>
              </>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

const AchievementView = () => {
  const { user } = useAuthStore()
  const [items, setItems] = useState<AchievementProgressItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<AchievementProgressItem | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    document.title = 'Achievements'
  }, [])

  useEffect(() => {
    if (!user?.id) return
    const ac = new AbortController()
    const requestId = ++requestIdRef.current

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await userAPI.getAchievementProgress(user.id, ac.signal)
        const sorted = [...data].sort((a, b) => {
          if (a.earned !== b.earned) return a.earned ? -1 : 1
          return (b.achievement.karma_points ?? 0) - (a.achievement.karma_points ?? 0)
        })
        if (requestId === requestIdRef.current) {
          setItems(sorted)
        }
      } catch (err) {
        const isAbort =
          ac.signal.aborted ||
          (err instanceof Error && (
            err.name === 'AbortError' ||
            err.message.toLowerCase() === 'canceled' ||
            err.message.toLowerCase() === 'cancelled'
          ))
        if (isAbort) return
        const message = err instanceof Error ? err.message : 'Could not load achievements.'
        if (requestId === requestIdRef.current) {
          setError(message)
        }
        toast.error('Could not load achievements.')
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => ac.abort()
  }, [user?.id])

  const earnedItems = useMemo(() => items.filter((item) => item.earned), [items])
  const lockedItems = useMemo(() => items.filter((item) => !item.earned), [items])
  const totalXp = useMemo(
    () => earnedItems.reduce((sum, item) => sum + (item.achievement.karma_points ?? 0), 0),
    [earnedItems],
  )

  return (
    <Box bg={GRAY50} h="calc(100vh - 64px)" overflowY="auto" py={{ base: 0, md: '8px' }} px={{ base: 0, md: '12px' }}>
      <Box
        maxW="1440px"
        mx="auto"
        bg={WHITE}
        borderRadius={{ base: 0, md: '20px' }}
        border={{ base: 'none', md: `1px solid ${GRAY200}` }}
        boxShadow={{ base: 'none', md: '0 4px 24px rgba(0,0,0,0.08)' }}
        minH={{ base: 'calc(100vh - 64px)', md: 'calc(100vh - 88px)' }}
        overflow="hidden"
      >
        <Box px={{ base: 5, md: 8 }} py={{ base: 5, md: 7 }}>
          <Box mb={6}>
            <Text fontSize={{ base: '24px', md: '30px' }} fontWeight={800} color={GRAY800} mb={2}>Achievements</Text>
            <Text fontSize="14px" color={GRAY500}>
              Track the milestones you have unlocked and see what you can work toward next in the community.
            </Text>
          </Box>

          <Grid templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }} gap={4} mb={8}>
            <SummaryStat label="Unlocked" value={earnedItems.length} icon={<FiAward size={17} />} color={GREEN} bg={GREEN_LT} />
            <SummaryStat label="Locked" value={lockedItems.length} icon={<FiLock size={17} />} color={BLUE} bg={BLUE_LT} />
            <SummaryStat label="XP Earned" value={totalXp} icon={<FiTrendingUp size={17} />} color={PURPLE} bg={PURPLE_LT} />
          </Grid>

          {loading ? (
            <Flex direction="column" align="center" justify="center" py={20} gap={3}>
              <Spinner color={GREEN} size="lg" />
              <Text fontSize="14px" color={GRAY500}>Loading achievements...</Text>
            </Flex>
          ) : error ? (
            <Box borderRadius="20px" border={`1px solid ${AMBER}33`} bg={AMBER_LT} px={5} py={5}>
              <Text fontSize="16px" fontWeight={800} color={AMBER} mb={1}>Could not load achievements</Text>
              <Text fontSize="14px" color={GRAY700}>{error}</Text>
            </Box>
          ) : items.length === 0 ? (
            <Flex direction="column" align="center" justify="center" py={20} gap={3}>
              <Flex w="72px" h="72px" borderRadius="24px" align="center" justify="center" bg={GRAY100} color={GRAY400}>
                <FiAward size={28} />
              </Flex>
              <Text fontSize="18px" fontWeight={800} color={GRAY800}>No achievements yet</Text>
              <Text fontSize="14px" color={GRAY500} textAlign="center" maxW="460px">
                Complete exchanges, contribute to the forum, and keep showing up for the community to unlock your first milestones.
              </Text>
            </Flex>
          ) : (
            <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' }} gap={4}>
              {items.map((item) => (
                <AchievementCard
                  key={item.badge_type}
                  item={item}
                  onClick={() => setSelected(item)}
                />
              ))}
            </Grid>
          )}
        </Box>
      </Box>

      <AchievementModal item={selected} onClose={() => setSelected(null)} />
    </Box>
  )
}

export default AchievementView
