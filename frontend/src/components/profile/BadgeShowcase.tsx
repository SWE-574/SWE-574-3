import React, { useState } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { toast } from 'sonner'
import { FiPlus, FiArrowUp, FiArrowDown, FiStar, FiCheckCircle, FiLock } from 'react-icons/fi'
import type { BadgeDetail, BadgeProgress } from '@/types'
import EyebrowLabel from '@/components/ui/EyebrowLabel'
import {
  GRAY100, GRAY200, GRAY400, GRAY500, GRAY600, GRAY800,
  GREEN, GREEN_LT, GREEN_MD,
  WHITE,
} from '@/theme/tokens'

// ── Tooltip (simple CSS-driven, no Chakra Tooltip to avoid portal issues) ─────
function BadgeTooltip({ badge, children }: { badge: BadgeDetail; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false)
  return (
    <Box
      position="relative"
      display="inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <Box
          position="absolute"
          bottom="calc(100% + 8px)"
          left="50%"
          style={{ transform: 'translateX(-50%)', zIndex: 100 }}
          bg={GRAY800}
          color={WHITE}
          borderRadius="10px"
          px={3}
          py="10px"
          minW="180px"
          maxW="240px"
          boxShadow="0 8px 24px rgba(0,0,0,0.22)"
          pointerEvents="none"
        >
          <Text fontSize="12px" fontWeight={800} mb="4px">{badge.name}</Text>
          <Text fontSize="11px" color="rgba(255,255,255,0.75)" lineHeight={1.5} mb="6px">
            {badge.description}
          </Text>
          {badge.earned_at && (
            <Text fontSize="10px" color="rgba(255,255,255,0.5)">
              Earned {new Date(badge.earned_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          )}
        </Box>
      )}
    </Box>
  )
}

// ── Compact badge circle ────────────────────────────────────────────────────────
function CompactBadgeCircle({ badge, onHeroSurface }: { badge: BadgeDetail; onHeroSurface?: boolean }) {
  const bg = onHeroSurface ? 'rgba(255,255,255,0.2)' : GREEN_LT
  const iconColor = onHeroSurface ? 'rgba(255,255,255,0.9)' : GREEN

  return (
    <BadgeTooltip badge={badge}>
      <Flex
        w="40px"
        h="40px"
        borderRadius="full"
        align="center"
        justify="center"
        flexShrink={0}
        role="img"
        aria-label={badge.name}
        style={{
          background: bg,
          border: onHeroSurface ? '1px solid rgba(255,255,255,0.35)' : `1px solid ${GREEN}30`,
          cursor: 'default',
          overflow: 'hidden',
        }}
      >
        {badge.icon_url ? (
          <img
            src={badge.icon_url}
            alt={badge.name}
            style={{ width: '28px', height: '28px', objectFit: 'contain' }}
          />
        ) : (
          <FiStar size={18} color={iconColor} />
        )}
      </Flex>
    </BadgeTooltip>
  )
}

// ── Types ────────────────────────────────────────────────────────────────────────
type CompactProps = {
  variant: 'compact'
  mode: 'own' | 'public'
  badges: BadgeDetail[]
  onPickerOpenRequest?: () => void
  onHeroSurface?: boolean
}

type PickerProps = {
  variant: 'picker'
  allBadges: BadgeProgress[]
  selected: string[]
  onChange: (ids: string[]) => void
}

type Props = CompactProps | PickerProps

// ── Max featured badges ───────────────────────────────────────────────────────
const MAX_FEATURED = 2

// ── Main component ────────────────────────────────────────────────────────────
const BadgeShowcase = (props: Props) => {
  if (props.variant === 'compact') {
    return <CompactShowcase {...props} />
  }
  return <PickerShowcase {...props} />
}

function CompactShowcase({ mode, badges, onPickerOpenRequest, onHeroSurface }: CompactProps) {
  const displayed = badges.slice(0, MAX_FEATURED)

  if (displayed.length === 0) {
    if (mode === 'public') return null
    // own mode: show placeholder
    return (
      <Box
        as="button"
        display="flex"
        alignItems="center"
        gap="6px"
        px="10px"
        py="6px"
        borderRadius="999px"
        fontSize="12px"
        fontWeight={600}
        onClick={onPickerOpenRequest}
        style={{
          background: 'none',
          border: onHeroSurface ? '1px dashed rgba(255,255,255,0.5)' : `1px dashed ${GRAY400}`,
          color: onHeroSurface ? 'rgba(255,255,255,0.75)' : GRAY600,
          cursor: 'pointer',
        }}
        aria-label="Showcase a badge"
      >
        <FiPlus size={13} />
        Showcase a badge
      </Box>
    )
  }

  return (
    <Flex align="center" gap="8px" flexWrap="wrap">
      {displayed.map((badge) => (
        <CompactBadgeCircle key={badge.id} badge={badge} onHeroSurface={onHeroSurface} />
      ))}
      {mode === 'own' && (
        <Box
          as="button"
          display="flex"
          alignItems="center"
          justifyContent="center"
          w="32px"
          h="32px"
          borderRadius="full"
          onClick={onPickerOpenRequest}
          style={{
            background: 'none',
            border: onHeroSurface ? '1px dashed rgba(255,255,255,0.4)' : `1px dashed ${GRAY400}`,
            color: onHeroSurface ? 'rgba(255,255,255,0.6)' : GRAY500,
            cursor: 'pointer',
          }}
          aria-label="Edit badge showcase"
          title="Edit badge showcase"
        >
          <FiPlus size={12} />
        </Box>
      )}
    </Flex>
  )
}

function PickerShowcase({ allBadges, selected, onChange }: PickerProps) {
  const earnedBadges = allBadges.filter((b) => b.earned)
  const lockedBadges = allBadges.filter((b) => !b.earned)

  const handleToggle = (badgeType: string) => {
    const currentIndex = selected.indexOf(badgeType)

    if (currentIndex >= 0) {
      // Deselect
      onChange(selected.filter((id) => id !== badgeType))
      return
    }

    if (selected.length < MAX_FEATURED) {
      // Add
      onChange([...selected, badgeType])
      return
    }

    // Swap oldest (first) out
    const swappedOut = selected[0]
    const oldBadge = earnedBadges.find((b) => b.badge_type === swappedOut)
    const oldName = oldBadge?.name ?? swappedOut
    toast(`Showcase is limited to 2 — replaced ${oldName}`, { duration: 3000 })
    onChange([selected[1], badgeType])
  }

  const moveUp = (index: number) => {
    if (index === 0) return
    const next = [...selected]
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    onChange(next)
  }

  const moveDown = (index: number) => {
    if (index >= selected.length - 1) return
    const next = [...selected]
    ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
    onChange(next)
  }

  return (
    <Box>
      <EyebrowLabel>{`Pick up to ${MAX_FEATURED} to feature`}</EyebrowLabel>

      {/* Selected badges reorder area */}
      {selected.length > 0 && (
        <Box mt={3} mb={4} p={3} borderRadius="12px" bg={GREEN_LT} border={`1px solid ${GREEN}30`}>
          <Text fontSize="11px" fontWeight={700} color={GREEN} textTransform="uppercase" letterSpacing="0.06em" mb={2}>
            Featured ({selected.length}/{MAX_FEATURED})
          </Text>
          {selected.map((badgeType, index) => {
            const badge = earnedBadges.find((b) => b.badge_type === badgeType)
            if (!badge) return null
            return (
              <Flex
                key={badgeType}
                align="center"
                gap={2}
                py={2}
                borderTop={index > 0 ? `1px solid ${GREEN}20` : undefined}
              >
                <Flex
                  w="32px"
                  h="32px"
                  borderRadius="full"
                  align="center"
                  justify="center"
                  flexShrink={0}
                  style={{ background: GREEN_MD, border: `1px solid ${GREEN}30` }}
                >
                  <FiStar size={14} color={GREEN} />
                </Flex>
                <Text fontSize="12px" fontWeight={700} color={GREEN} flex={1}>
                  {badge.name}
                </Text>
                <Flex gap={1}>
                  <Box
                    as="button"
                    onClick={index === 0 ? undefined : () => moveUp(index)}
                    aria-disabled={index === 0}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: index === 0 ? 'not-allowed' : 'pointer',
                      opacity: index === 0 ? 0.4 : 1,
                      padding: '4px',
                      color: GREEN,
                    }}
                    aria-label="Move up"
                  >
                    <FiArrowUp size={13} />
                  </Box>
                  <Box
                    as="button"
                    onClick={index >= selected.length - 1 ? undefined : () => moveDown(index)}
                    aria-disabled={index >= selected.length - 1}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: index >= selected.length - 1 ? 'not-allowed' : 'pointer',
                      opacity: index >= selected.length - 1 ? 0.4 : 1,
                      padding: '4px',
                      color: GREEN,
                    }}
                    aria-label="Move down"
                  >
                    <FiArrowDown size={13} />
                  </Box>
                  <Box
                    as="button"
                    onClick={() => handleToggle(badgeType)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      color: GREEN,
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                    aria-label={`Remove ${badge.name}`}
                  >
                    Remove
                  </Box>
                </Flex>
              </Flex>
            )
          })}
        </Box>
      )}

      {/* Earned badges grid */}
      {earnedBadges.length > 0 && (
        <Box mb={3}>
          <Text fontSize="11px" fontWeight={700} color={GRAY500} textTransform="uppercase" letterSpacing="0.06em" mb={2}>
            Your earned badges
          </Text>
          <Box display="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
            {earnedBadges.map((badge) => {
              const isSelected = selected.includes(badge.badge_type)
              return (
                <Box
                  key={badge.badge_type}
                  as="button"
                  onClick={() => handleToggle(badge.badge_type)}
                  p={3}
                  borderRadius="12px"
                  border={`1px solid ${GREEN}40`}
                  style={{
                    background: isSelected ? GREEN_MD : GREEN_LT,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.12s',
                  }}
                  aria-pressed={isSelected}
                  aria-label={badge.name}
                >
                  <Flex align="center" gap={2} mb="6px">
                    <Flex
                      w="28px"
                      h="28px"
                      borderRadius="full"
                      align="center"
                      justify="center"
                      flexShrink={0}
                      style={{ background: isSelected ? GREEN_MD : GREEN_LT }}
                    >
                      {isSelected ? <FiCheckCircle size={14} color={GREEN} /> : <FiStar size={14} color={GREEN} />}
                    </Flex>
                    <Text fontSize="12px" fontWeight={700} color={GREEN}>
                      {badge.name}
                    </Text>
                  </Flex>
                  <Text fontSize="11px" color={GRAY600} lineHeight={1.4}
                    style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {badge.description}
                  </Text>
                </Box>
              )
            })}
          </Box>
        </Box>
      )}

      {/* Locked badges grid */}
      {lockedBadges.length > 0 && (
        <Box>
          <Text fontSize="11px" fontWeight={700} color={GRAY500} textTransform="uppercase" letterSpacing="0.06em" mb={2}>
            Locked — keep going
          </Text>
          <Box display="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
            {lockedBadges.map((badge) => {
              const progressPct = badge.threshold > 0
                ? Math.min(100, Math.round((badge.current_value / badge.threshold) * 100))
                : 0
              const remaining = Math.max(0, badge.threshold - badge.current_value)
              return (
                <Box
                  key={badge.badge_type}
                  p={3}
                  borderRadius="12px"
                  border={`1px solid ${GRAY200}`}
                  style={{ background: GRAY100, opacity: 0.75, cursor: 'not-allowed' }}
                  aria-disabled="true"
                >
                  <Flex align="center" gap={2} mb="6px">
                    <Flex
                      w="28px"
                      h="28px"
                      borderRadius="full"
                      align="center"
                      justify="center"
                      flexShrink={0}
                      style={{ background: WHITE, border: `1px solid ${GRAY200}` }}
                    >
                      <FiLock size={12} color={GRAY400} />
                    </Flex>
                    <Text fontSize="12px" fontWeight={700} color={GRAY600}>
                      {badge.name}
                    </Text>
                  </Flex>
                  <Box w="100%" h="3px" borderRadius="full" mb="5px" style={{ background: GRAY200 }}>
                    <Box h="100%" borderRadius="full" style={{ background: GRAY400, width: `${progressPct}%` }} />
                  </Box>
                  <Text fontSize="10px" color={GRAY500}>
                    {remaining} more to unlock
                  </Text>
                </Box>
              )
            })}
          </Box>
        </Box>
      )}

      {allBadges.length === 0 && (
        <Flex direction="column" align="center" py={6} gap={2}>
          <FiStar size={24} color={GRAY400} />
          <Text fontSize="13px" color={GRAY500}>Complete exchanges to earn badges</Text>
        </Flex>
      )}
    </Box>
  )
}

export default BadgeShowcase
