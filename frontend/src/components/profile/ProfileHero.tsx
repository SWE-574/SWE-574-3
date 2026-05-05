import React from 'react'
import { Box, Flex, Grid, Text, useBreakpointValue } from '@chakra-ui/react'
import { FiCamera, FiClock, FiEdit2, FiFlag, FiMessageSquare, FiStar } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import type { User, BadgeDetail } from '@/types'
import HeroSurface from '@/components/ui/HeroSurface'
import EyebrowLabel from '@/components/ui/EyebrowLabel'
import BadgeShowcase from './BadgeShowcase'
import {
  GREEN, BLUE, TEAL, AMBER,
  WHITE, HERO_GRADIENT,
} from '@/theme/tokens'

// ── Constants ────────────────────────────────────────────────────────────────────
const AVATAR_PALETTE = [GREEN, BLUE, TEAL, AMBER, '#0D9488', '#EA580C']

// ── Helpers ────────────────────────────────────────────────────────────────────
const avatarBg = (name: string) =>
  AVATAR_PALETTE[name.charCodeAt(0) % AVATAR_PALETTE.length]

const getInitials = (f: string, l: string, e: string) =>
  f && l
    ? `${f[0]}${l[0]}`.toUpperCase()
    : (f || l || e || 'U')[0].toUpperCase()

const formatJoinDate = (d?: string) => {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

const formatMemberSince = (d?: string) => {
  if (!d) return '—'
  const date = new Date(d)
  const years = Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000))
  const months = Math.floor(((Date.now() - date.getTime()) % (365.25 * 24 * 3600 * 1000)) / (30.44 * 24 * 3600 * 1000))
  if (years > 0) return `${years}y ${months}m`
  return `${months}m`
}

// ── Types ────────────────────────────────────────────────────────────────────────
type Mode = 'own' | 'public'

type Props = {
  user: User
  mode: Mode
  featuredBadges?: BadgeDetail[]
  onEditClick?: () => void
  onMessageClick?: () => void
  onReportClick?: () => void
  onAvatarClick?: () => void
  onBadgePickerOpen?: () => void
  followStats?: { followers: number; following: number }
  onFollowersClick?: () => void
  onFollowingClick?: () => void
  reputationScore?: number
  completedExchanges?: number
  /** @deprecated Time balance is no longer shown in the hero — shown in sidebar instead */
  timeBalance?: number
  activeServicesCount?: number
}

// ── Stat tile ────────────────────────────────────────────────────────────────────
function StatTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Box p={3} borderRadius="14px" style={{ background: 'rgba(255,255,255,0.1)' }}>
      <Text
        fontSize="11px"
        fontWeight={800}
        letterSpacing="0.12em"
        textTransform="uppercase"
        mb={1}
        style={{ color: 'rgba(255,255,255,0.65)' }}
      >
        {label}
      </Text>
      <Text fontSize="22px" fontWeight={900} lineHeight={1} style={{ color: WHITE }}>
        {value}
      </Text>
      {sub && (
        <Text fontSize="11px" fontWeight={600} mt="3px" style={{ color: 'rgba(255,255,255,0.6)' }}>
          {sub}
        </Text>
      )}
    </Box>
  )
}

// ── Action button (hero surface) ──────────────────────────────────────────────
function HeroBtn({
  onClick,
  icon,
  children,
  primary = false,
}: {
  onClick?: () => void
  icon: React.ReactNode
  children: React.ReactNode
  primary?: boolean
}) {
  return (
    <Box
      as="button"
      onClick={onClick}
      display="inline-flex"
      alignItems="center"
      gap="6px"
      px="14px"
      py="8px"
      borderRadius="999px"
      fontSize="12px"
      fontWeight={700}
      style={{
        background: primary ? WHITE : 'rgba(255,255,255,0.2)',
        border: primary ? 'none' : '1px solid rgba(255,255,255,0.35)',
        color: primary ? GREEN : WHITE,
        cursor: 'pointer',
        backdropFilter: 'blur(4px)',
        transition: 'background 0.12s',
      }}
    >
      {icon}
      {children}
    </Box>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
const ProfileHero = ({
  user,
  mode,
  featuredBadges = [],
  onEditClick,
  onMessageClick,
  onReportClick,
  onAvatarClick,
  onBadgePickerOpen,
  followStats,
  onFollowersClick,
  onFollowingClick,
  reputationScore,
  completedExchanges,
  activeServicesCount,
}: Props) => {
  const displayName = `${user.first_name} ${user.last_name}`.trim() || user.email
  const initials = getInitials(user.first_name, user.last_name, user.email)
  const bg = avatarBg(displayName)
  const joinDate = formatJoinDate(user.date_joined)
  const memberSince = formatMemberSince(user.date_joined)
  const followers = followStats?.followers ?? user.followers_count
  const following = followStats?.following ?? user.following_count

  // Bio truncation: single node, responsive via useBreakpointValue (IMPORTANT 1 — a11y fix)
  // SSR/hydration: ?? 140 keeps desktop default until breakpoint resolves
  const bioMax = useBreakpointValue({ base: 80, md: 140 }) ?? 140
  const bio = user.bio
    ? user.bio.length > bioMax
      ? `${user.bio.slice(0, bioMax)}…`
      : user.bio
    : null

  // Identity meta strip items — no username/handle per user direction
  const metaParts = [
    joinDate ? `Joined ${joinDate}` : null,
    user.location || null,
  ].filter(Boolean)

  return (
    <Box mb={5}>
      {/* ── Cover photo (banner_url) ──────────────────────────────────────── */}
      {user.banner_url && (
        <Box
          h="130px"
          borderRadius="16px 16px 0 0"
          overflow="hidden"
          style={{ marginBottom: '-1px' }}
        >
          <img
            src={user.banner_url}
            alt="Cover"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </Box>
      )}
    <HeroSurface
      gradient={HERO_GRADIENT}
      borderRadius={user.banner_url ? '0 0 16px 16px' : undefined}
    >
      <Grid
        templateColumns={{ base: '1fr', md: '1.4fr 1fr' }}
        gap={{ base: 5, md: 6 }}
        alignItems="start"
      >
        {/* ── Left column: identity ────────────────────────────────────────── */}
        <Box>
          {/* Avatar */}
          <Box position="relative" display="inline-block" mb={3}>
            <Box
              w={{ base: '72px', md: '96px' }}
              h={{ base: '72px', md: '96px' }}
              borderRadius="full"
              overflow="hidden"
              style={{
                border: '3px solid rgba(255,255,255,0.8)',
                background: user.avatar_url ? 'transparent' : bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: WHITE,
                fontSize: '28px',
                fontWeight: 700,
                boxShadow: '0 4px 16px rgba(0,0,0,0.22)',
                flexShrink: 0,
              }}
            >
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={displayName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <Text fontSize={{ base: '24px', md: '32px' }} fontWeight={700} style={{ color: WHITE }}>
                  {initials}
                </Text>
              )}
            </Box>
            {mode === 'own' && onAvatarClick && (
              <Box
                as="button"
                position="absolute"
                bottom={0}
                right={0}
                w="28px"
                h="28px"
                borderRadius="full"
                display="flex"
                alignItems="center"
                justifyContent="center"
                onClick={onAvatarClick}
                aria-label="Change avatar"
                style={{
                  background: WHITE,
                  border: '2px solid rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  color: GREEN,
                }}
              >
                <FiCamera size={13} />
              </Box>
            )}
          </Box>

          {/* Name */}
          <Text
            fontSize={{ base: '40px', md: '52px' }}
            fontWeight={900}
            lineHeight={1}
            mb={2}
            style={{ color: WHITE }}
          >
            {displayName}
          </Text>

          {/* Identity meta strip */}
          {metaParts.length > 0 && (
            <Text fontSize="12px" fontWeight={600} mb={2} style={{ color: 'rgba(255,255,255,0.7)' }}>
              {metaParts.join(' · ')}
            </Text>
          )}

          {/* Bio — single DOM node via useBreakpointValue (eliminates duplicate SR read) */}
          {bio && (
            <Text
              fontSize="13px"
              lineHeight={1.55}
              mb={4}
              style={{ color: 'rgba(255,255,255,0.82)' }}
            >
              {bio}
            </Text>
          )}

          {/* Action row */}
          <Flex gap={2} flexWrap="wrap">
            {mode === 'own' ? (
              <HeroBtn primary icon={<FiEdit2 size={13} />} onClick={onEditClick}>
                Edit profile
              </HeroBtn>
            ) : (
              <>
                <HeroBtn primary icon={<FiMessageSquare size={13} />} onClick={onMessageClick}>
                  Message
                </HeroBtn>
                <HeroBtn icon={<FiFlag size={13} />} onClick={onReportClick}>
                  Report
                </HeroBtn>
              </>
            )}
          </Flex>
        </Box>

        {/* ── Right column: stats glass card ───────────────────────────────── */}
        <Box
          borderRadius="16px"
          p={4}
          style={{
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.25)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <EyebrowLabel tone="light" icon={<FiStar size={14} />}>
            At a glance
          </EyebrowLabel>

          {/* Stat grid */}
          <Grid templateColumns="1fr 1fr" gap={2} mt={3} mb={3}>
            {mode === 'own' ? (
              <>
                <StatTile
                  label="Exchanges"
                  value={completedExchanges != null ? completedExchanges : '—'}
                />
                <StatTile
                  label="Active services"
                  value={activeServicesCount != null ? activeServicesCount : '—'}
                />
                <StatTile
                  label="Community"
                  value={
                    followers != null || following != null ? (
                      <Flex align="center" gap="5px" style={{ flexWrap: 'nowrap' }}>
                        <Box
                          as="button"
                          style={{ background: 'none', border: 'none', cursor: onFollowersClick ? 'pointer' : 'default', padding: 0, color: WHITE, fontWeight: 900, fontSize: '20px' }}
                          onClick={onFollowersClick}
                        >
                          {followers ?? 0}
                        </Box>
                        <Text fontSize="13px" style={{ color: 'rgba(255,255,255,0.6)' }}>·</Text>
                        <Box
                          as="button"
                          style={{ background: 'none', border: 'none', cursor: onFollowingClick ? 'pointer' : 'default', padding: 0, color: WHITE, fontWeight: 900, fontSize: '20px' }}
                          onClick={onFollowingClick}
                        >
                          {following ?? 0}
                        </Box>
                      </Flex>
                    ) : '—'
                  }
                  sub={
                    followers != null && following != null
                      ? `${followers ?? 0} followers · ${following ?? 0} following`
                      : undefined
                  }
                />
                <StatTile label="Member since" value={memberSince} />
              </>
            ) : (
              <>
                <StatTile
                  label="Exchanges"
                  value={completedExchanges != null ? completedExchanges : '—'}
                />
                <StatTile
                  label="Reputation"
                  value={
                    reputationScore != null
                      ? (
                        <Flex align="center" gap="4px">
                          <FiStar size={16} style={{ color: '#FCD34D' }} />
                          {reputationScore.toFixed(1)}
                        </Flex>
                      )
                      : '—'
                  }
                />
                <StatTile
                  label="Community"
                  value={
                    followers != null || following != null ? (
                      <Flex align="center" gap="5px" style={{ flexWrap: 'nowrap' }}>
                        <Box
                          as="button"
                          style={{ background: 'none', border: 'none', cursor: onFollowersClick ? 'pointer' : 'default', padding: 0, color: WHITE, fontWeight: 900, fontSize: '20px' }}
                          onClick={onFollowersClick}
                        >
                          {followers ?? 0}
                        </Box>
                        <Text fontSize="13px" style={{ color: 'rgba(255,255,255,0.6)' }}>·</Text>
                        <Box
                          as="button"
                          style={{ background: 'none', border: 'none', cursor: onFollowingClick ? 'pointer' : 'default', padding: 0, color: WHITE, fontWeight: 900, fontSize: '20px' }}
                          onClick={onFollowingClick}
                        >
                          {following ?? 0}
                        </Box>
                      </Flex>
                    ) : '—'
                  }
                  sub={
                    followers != null && following != null
                      ? `${followers ?? 0} followers · ${following ?? 0} following`
                      : undefined
                  }
                />
                <StatTile label="Member since" value={memberSince} />
              </>
            )}
          </Grid>

          {/* View Time Activity link */}
          <Box mb={3}>
            <Link
              to="/transaction-history"
              style={{ textDecoration: 'none' }}
            >
              <Flex
                align="center"
                gap="5px"
                display="inline-flex"
                px="10px"
                py="5px"
                borderRadius="999px"
                fontSize="11px"
                fontWeight={600}
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  color: WHITE,
                  cursor: 'pointer',
                  backdropFilter: 'blur(4px)',
                }}
              >
                <FiClock size={11} />
                View Time Activity →
              </Flex>
            </Link>
          </Box>

          {/* Badge showcase row */}
          <Box borderTop="1px solid rgba(255,255,255,0.2)" pt={3}>
            <Text fontSize="10px" fontWeight={700} textTransform="uppercase" letterSpacing="0.12em" mb={2} style={{ color: 'rgba(255,255,255,0.6)' }}>
              Showcase
            </Text>
            <BadgeShowcase
              variant="compact"
              mode={mode}
              badges={featuredBadges}
              onPickerOpenRequest={onBadgePickerOpen}
              onHeroSurface
            />
          </Box>
        </Box>
      </Grid>
    </HeroSurface>
    </Box>
  )
}

export default ProfileHero
