import { Box, Flex, Text } from '@chakra-ui/react'
import { Link } from 'react-router-dom'
import { FiArrowRight } from 'react-icons/fi'
import type { Handshake } from '@/services/handshakeAPI'
import { HS_BADGE, STATUS_FALLBACK } from '@/constants/handshakeBadges'
import {
  GREEN, GREEN_LT, GRAY50, GRAY200, GRAY400, GRAY700, GRAY800, WHITE,
} from '@/theme/tokens'

const AVATAR_PALETTE = [GREEN, '#1D4ED8', '#7C3AED', '#D97706', '#0D9488', '#EA580C']

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

type Props = {
  handshake: Handshake
  isOwner: boolean
  /**
   * Service location_type from the parent listing. Required so the
   * row can apply the #300 / FR-13m eligibility gate (in-person only)
   * without needing to fetch the service itself. Online exchanges have
   * the chat-based dual-confirmation flow as their existing path.
   */
  serviceLocationType?: 'In-Person' | 'Online' | null
  onAccept?: () => void
  onReject?: () => void
  /**
   * #300 / FR-13m — owner-side manual Mark-as-Complete fallback. Wires
   * to `handshakeAPI.confirm` so the dual-confirmation flow can be
   * driven from the interests panel without navigating to chat. Only
   * surfaced for in-person exchanges per the SRS scope.
   */
  onMarkComplete?: () => void
}

const InterestRequesterRow = ({
  handshake,
  isOwner,
  serviceLocationType,
  onAccept,
  onReject,
  onMarkComplete,
}: Props) => {
  // Defensive: only render for owners
  if (!isOwner) return null

  const detail = handshake.requester_detail
  const requesterId = detail?.id ?? handshake.requester
  const firstName = detail?.first_name ?? handshake.requester_name.split(' ')[0] ?? ''
  const displayName =
    detail
      ? `${detail.first_name} ${detail.last_name}`.trim()
      : handshake.requester_name
  const avatarUrl = detail?.avatar_url ?? null
  const memberSince = detail?.member_since
    ? new Date(detail.member_since).getFullYear().toString()
    : null

  const initials = getInitials(displayName || firstName || 'U')
  const avatarBg = AVATAR_PALETTE[displayName.charCodeAt(0) % AVATAR_PALETTE.length]

  const cfg = HS_BADGE[handshake.status] ?? { label: handshake.status, ...STATUS_FALLBACK }
  const isPending = handshake.status === 'pending'
  const isActive = ['pending', 'accepted'].includes(handshake.status)
  // Owner can mark complete on an accepted in-person exchange that
  // they have not yet confirmed. The button records the owner's half
  // of the dual-confirmation; the row stays "accepted" until the
  // requester also confirms (or the action is repeated through chat).
  // Hiding it after the owner already confirmed prevents double-clicks.
  // Per #300 / FR-13m the fallback is in-person only — online exchanges
  // already have the chat-based confirmation surface as their path.
  const canMarkComplete =
    handshake.status === 'accepted'
    && !handshake.provider_confirmed_complete
    && serviceLocationType === 'In-Person'
    && Boolean(onMarkComplete)

  const profileUrl = `/public-profile/${requesterId}`

  return (
    <Flex
      align="center"
      gap={3}
      px={3}
      py="10px"
      borderBottom={`1px solid ${GRAY200}`}
      opacity={isActive ? 1 : 0.65}
      style={{ transition: 'background 0.1s' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = GRAY50 }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '' }}
    >
      {/* Avatar + Name — single <Link> so screen readers announce once (#298 spec §5.6) */}
      <Link
        to={profileUrl}
        aria-label={`View ${displayName}'s public profile`}
        style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0, textDecoration: 'none' }}
      >
        {/* Avatar */}
        <Box flexShrink={0}>
          {avatarUrl ? (
            <Box w="40px" h="40px" borderRadius="full" overflow="hidden">
              <img
                src={avatarUrl}
                alt={displayName}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </Box>
          ) : (
            <Flex
              w="40px"
              h="40px"
              borderRadius="full"
              align="center"
              justify="center"
              style={{ background: avatarBg, color: WHITE, fontSize: '13px', fontWeight: 700 }}
            >
              {initials}
            </Flex>
          )}
        </Box>

        {/* Name + meta */}
        <Box flex={1} minW={0}>
          <Text
            fontSize="13px"
            fontWeight={600}
            color={GRAY800}
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {displayName}
          </Text>
          <Flex align="center" gap="6px" mt="1px" flexWrap="wrap">
            {memberSince && (
              <Text fontSize="11px" color={GRAY400}>
                {`Joined ${memberSince}`}
              </Text>
            )}
            {/* Status badge */}
            <Box
              px="7px"
              py="2px"
              borderRadius="full"
              fontSize="10px"
              fontWeight={700}
              style={{ background: cfg.bg, color: cfg.color }}
            >
              {cfg.label}
            </Box>
          </Flex>
        </Box>
      </Link>

      {/* Right action group */}
      <Flex align="center" gap={2} flexShrink={0}>
        {/* View profile button */}
        <Link
          to={profileUrl}
          aria-label={`Open ${displayName}'s public profile page`}
          style={{ textDecoration: 'none' }}
        >
          <Flex
            align="center"
            gap="4px"
            px="10px"
            py="5px"
            borderRadius="7px"
            fontSize="11px"
            fontWeight={600}
            style={{
              border: `1px solid ${GRAY200}`,
              color: GRAY700,
              cursor: 'pointer',
              background: 'none',
            }}
          >
            View profile <FiArrowRight size={11} />
          </Flex>
        </Link>

        {/* Accept button — only for pending status */}
        {isPending && onAccept && (
          <Box
            as="button"
            px="10px"
            py="5px"
            borderRadius="7px"
            fontSize="11px"
            fontWeight={700}
            style={{ background: GREEN_LT, border: 'none', cursor: 'pointer', color: GREEN }}
            onClick={onAccept}
          >
            Accept
          </Box>
        )}
        {/* Reject button — only for pending status */}
        {isPending && onReject && (
          <Box
            as="button"
            px="10px"
            py="5px"
            borderRadius="7px"
            fontSize="11px"
            fontWeight={700}
            style={{ background: '#fee2e2', border: 'none', cursor: 'pointer', color: '#991b1b' }}
            onClick={onReject}
          >
            Decline
          </Box>
        )}
        {/* Mark as Complete — only for accepted status, owner not yet confirmed (#300 / FR-13m) */}
        {canMarkComplete && (
          <Box
            as="button"
            px="10px"
            py="5px"
            borderRadius="7px"
            fontSize="11px"
            fontWeight={700}
            data-testid="mark-as-complete-button"
            aria-label={`Mark exchange with ${displayName} as complete`}
            style={{ background: GREEN_LT, border: 'none', cursor: 'pointer', color: GREEN }}
            onClick={onMarkComplete}
          >
            Mark as Complete
          </Box>
        )}
      </Flex>
    </Flex>
  )
}

export default InterestRequesterRow
