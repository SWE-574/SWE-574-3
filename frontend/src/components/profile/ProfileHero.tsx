import React from 'react'
import { Box, Flex, Grid, Spinner, Text } from '@chakra-ui/react'
import { FiCamera, FiCheckCircle, FiClock, FiEdit2, FiMapPin, FiStar, FiUserPlus } from 'react-icons/fi'
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

const formatHeroLocation = (location?: string) => {
  if (!location) return null
  const slashParts = location.split('/').map((part) => part.trim()).filter(Boolean)
  if (slashParts.length >= 2) return `${slashParts[0]} / ${slashParts[1]}`

  const commaParts = location
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !['Türkiye', 'Turkey'].includes(part))
  if (commaParts.length >= 2) {
    return `${commaParts[1]} / ${commaParts[0]}`
  }

  return location
}

// ── Types ────────────────────────────────────────────────────────────────────────
type Mode = 'own' | 'public'

type Props = {
  user: User
  mode: Mode
  compact?: boolean
  featuredBadges?: BadgeDetail[]
  onEditClick?: () => void
  onAvatarClick?: () => void
  onBadgePickerOpen?: () => void
  followStats?: { followers: number; following: number }
  onFollowersClick?: () => void
  onFollowingClick?: () => void
  completedExchanges?: number
  /** @deprecated Time balance is no longer shown in the hero — shown in sidebar instead */
  timeBalance?: number
  activeServicesCount?: number
  /** Public profile: Follow / Unfollow beside the name */
  onFollowPress?: () => void
  isFollowing?: boolean
  followActionLoading?: boolean
}

// ── Stat tile ────────────────────────────────────────────────────────────────────
function StatTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Box
      py={2}
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <Text
        fontSize="10px"
        fontWeight={800}
        letterSpacing="0.12em"
        textTransform="uppercase"
        mb="4px"
        style={{ color: 'rgba(255,255,255,0.65)' }}
      >
        {label}
      </Text>
      <Box fontSize="20px" fontWeight={900} lineHeight={1.05} style={{ color: WHITE }}>
        {value}
      </Box>
      {sub && (
        <Text fontSize="11px" fontWeight={600} mt="3px" style={{ color: 'rgba(255,255,255,0.6)' }}>
          {sub}
        </Text>
      )}
    </Box>
  )
}

function CommunityStatValue({
  followers,
  following,
  onFollowersClick,
  onFollowingClick,
}: {
  followers?: number
  following?: number
  onFollowersClick?: () => void
  onFollowingClick?: () => void
}) {
  if (followers == null && following == null) return '—'

  const items = [
    { label: 'Followers', value: followers ?? 0, onClick: onFollowersClick, title: 'View followers' },
    { label: 'Following', value: following ?? 0, onClick: onFollowingClick, title: 'View following' },
  ]

  return (
    <Flex gap={2} align="center" wrap="wrap">
      {items.map((item) => (
        <Box
          key={item.label}
          as="button"
          onClick={item.onClick}
          title={item.onClick ? item.title : undefined}
          aria-label={item.onClick ? item.title : undefined}
          textAlign="left"
          style={{
            background: 'transparent',
            border: 'none',
            color: WHITE,
            cursor: item.onClick ? 'pointer' : 'default',
            padding: 0,
          }}
        >
          <Text as="span" fontSize="15px" fontWeight={900} lineHeight={1} mr="3px" style={{ color: WHITE }}>
            {item.value}
          </Text>
          <Text as="span" fontSize="9px" fontWeight={800} lineHeight={1.2} textTransform="uppercase" letterSpacing="0.06em" style={{ color: 'rgba(255,255,255,0.66)' }}>
            {item.label}
          </Text>
        </Box>
      ))}
    </Flex>
  )
}

// ── Action button (hero surface) ──────────────────────────────────────────────
function HeroBtn({
  onClick,
  icon,
  children,
  primary = false,
  loading = false,
  'aria-label': ariaLabel,
}: {
  onClick?: () => void
  icon: React.ReactNode
  children: React.ReactNode
  primary?: boolean
  loading?: boolean
  'aria-label'?: string
}) {
  const busy = Boolean(loading)
  return (
    <button
      type="button"
      onClick={busy ? undefined : onClick}
      disabled={busy}
      aria-busy={busy}
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '6px 12px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 700,
        flexShrink: 0,
        fontFamily: 'inherit',
        background: primary ? WHITE : 'rgba(255,255,255,0.2)',
        border: primary ? 'none' : '1px solid rgba(255,255,255,0.35)',
        color: primary ? GREEN : WHITE,
        cursor: busy ? 'wait' : 'pointer',
        backdropFilter: 'blur(4px)',
        transition: 'background 0.12s',
        opacity: busy ? 0.88 : 1,
      }}
    >
      {busy ? <Spinner size="sm" color={primary ? GREEN : WHITE} /> : icon}
      {children}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
const ProfileHero = ({
  user,
  mode,
  compact = false,
  featuredBadges = [],
  onEditClick,
  onAvatarClick,
  onBadgePickerOpen,
  followStats,
  onFollowersClick,
  onFollowingClick,
  completedExchanges,
  activeServicesCount,
  onFollowPress,
  isFollowing = false,
  followActionLoading = false,
}: Props) => {
  const displayName = `${user.first_name} ${user.last_name}`.trim() || user.email
  const initials = getInitials(user.first_name, user.last_name, user.email)
  const bg = avatarBg(displayName)
  const joinDate = formatJoinDate(user.date_joined)
  const memberSince = joinDate ?? '—'
  const followers = followStats?.followers ?? user.followers_count
  const following = followStats?.following ?? user.following_count
  const heroLocation = formatHeroLocation(user.location)

  const bio = user.bio?.trim() || null

  return (
    <Box
      mb={compact ? 0 : 4}
      h={compact ? '100%' : undefined}
      display={compact ? 'flex' : undefined}
      flexDirection={compact ? 'column' : undefined}
      borderRadius={user.banner_url ? '16px' : '22px'}
      style={{
        boxShadow: '0 20px 52px rgba(15, 23, 42, 0.24), 0 2px 10px rgba(15, 23, 42, 0.08)',
      }}
    >
      {/* ── Cover photo (banner_url) ──────────────────────────────────────── */}
      {user.banner_url && (
        <Box
          h={compact ? { base: '68px', md: '76px' } : { base: '88px', md: '108px' }}
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
      boxShadow="none"
      p={compact ? { base: 3.5, md: 4 } : { base: 4, md: 5 }}
      flex={compact ? 1 : undefined}
    >
      <Box
        position="absolute"
        top={{ base: '12px', md: '14px' }}
        right={{ base: '12px', md: '16px' }}
        style={{ zIndex: 2 }}
      >
        <BadgeShowcase
          variant="compact"
          mode={mode}
          badges={featuredBadges}
          onPickerOpenRequest={onBadgePickerOpen}
          onHeroSurface
        />
      </Box>

      <Grid
        templateColumns={compact ? '1fr' : { base: '1fr', md: '1.35fr 0.95fr' }}
        gap={compact ? 3 : { base: 4, md: 5 }}
        alignItems="start"
      >
        {/* ── Left column: identity ────────────────────────────────────────── */}
        <Box>
          {/* Avatar */}
          <Box position="relative" display="inline-block" mb={compact ? 2 : 2}>
            <Box
              w={compact ? { base: '78px', md: '90px' } : { base: '70px', md: '84px' }}
              h={compact ? { base: '78px', md: '90px' } : { base: '70px', md: '84px' }}
              borderRadius="full"
              overflow="hidden"
              style={{
                border: '3px solid rgba(255,255,255,0.8)',
                background: user.avatar_url ? 'transparent' : bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: WHITE,
                fontSize: compact ? '30px' : '26px',
                fontWeight: 700,
                boxShadow: '0 12px 30px rgba(0,0,0,0.24)',
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
                <Text fontSize={compact ? { base: '28px', md: '32px' } : { base: '22px', md: '26px' }} fontWeight={700} style={{ color: WHITE }}>
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
                w="32px"
                h="32px"
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
                <FiCamera size={15} />
              </Box>
            )}
          </Box>

          {/* Name (+ Follow / Unfollow): inline — button starts right after name, single-line name + ellipsis when tight */}
          <Flex
            align="center"
            justify="flex-start"
            gap={2}
            flexWrap="nowrap"
            mb={1.5}
            minW={0}
            maxW="100%"
          >
            <Text
              minW={0}
              flexShrink={1}
              lineClamp={1}
              title={displayName}
              fontSize={compact ? { base: '32px', md: '38px' } : { base: '34px', md: '40px' }}
              fontWeight={900}
              lineHeight={1.15}
              style={{ color: WHITE }}
            >
              {displayName}
            </Text>
            {mode === 'public' && onFollowPress && (
              <HeroBtn
                primary={!isFollowing}
                loading={followActionLoading}
                aria-label={isFollowing ? 'Unfollow' : 'Follow'}
                icon={
                  isFollowing ? (
                    <FiCheckCircle size={13} />
                  ) : (
                    <FiUserPlus size={13} />
                  )
                }
                onClick={onFollowPress}
              >
                {isFollowing ? 'Unfollow' : 'Follow'}
              </HeroBtn>
            )}
          </Flex>

          {/* Location meta strip */}
          {heroLocation && (
            <Flex align="center" gap="5px" mb={compact ? 1.5 : 2} style={{ color: 'rgba(255,255,255,0.72)' }}>
              <FiMapPin size={12} />
              <Text fontSize="11px" fontWeight={600}>
                {heroLocation}
              </Text>
            </Flex>
          )}

          {/* Bio — single DOM node via useBreakpointValue (eliminates duplicate SR read) */}
          {bio && (
            <Text
              fontSize="13px"
              lineHeight={compact ? 1.35 : 1.45}
              mb={compact ? 2 : 3}
              style={{ color: 'rgba(255,255,255,0.82)' }}
            >
              {bio}
            </Text>
          )}

          {/* Action row */}
          {mode === 'own' && (
            <Flex gap={2} flexWrap="wrap">
              <HeroBtn primary icon={<FiEdit2 size={13} />} onClick={onEditClick}>
                Edit profile
              </HeroBtn>
            </Flex>
          )}
        </Box>

        {/* ── Stats strip ───────────────────────────────── */}
        <Box
          borderRadius="18px"
          p={compact ? 3 : 3}
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.11), rgba(255,255,255,0.04))',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16)',
          }}
        >
          <EyebrowLabel tone="light" icon={<FiStar size={14} />}>
            At a glance
          </EyebrowLabel>

          {/* Stat grid */}
          <Grid
            templateColumns={compact ? { base: '1fr 1fr', md: 'repeat(3, 1fr)' } : '1fr 1fr'}
            columnGap={compact ? 5 : 4}
            rowGap={0}
            mt={compact ? 1 : 1.5}
            mb={compact ? 2 : 2.5}
          >
            {mode === 'own' ? (
              <>
                <StatTile
                  label="Karma"
                  value={user.karma_score != null ? user.karma_score : '—'}
                />
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
                  value={<CommunityStatValue followers={followers} following={following} onFollowersClick={onFollowersClick} onFollowingClick={onFollowingClick} />}
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
                  label="Karma"
                  value={user.karma_score != null ? user.karma_score : '—'}
                />
                <StatTile label="Member since" value={memberSince} />
                <StatTile
                  label="Community"
                  value={<CommunityStatValue followers={followers} following={following} onFollowersClick={onFollowersClick} onFollowingClick={onFollowingClick} />}
                />
              </>
            )}
          </Grid>

          {/* View Time Activity is only for own profile */}
          {mode === 'own' && (
            <Box mb={2}>
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
          )}

        </Box>
      </Grid>
    </HeroSurface>
    </Box>
  )
}

export default ProfileHero
