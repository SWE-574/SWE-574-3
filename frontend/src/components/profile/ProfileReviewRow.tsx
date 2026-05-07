import { Box, Flex, Text } from '@chakra-ui/react'
import { FiCheckCircle } from 'react-icons/fi'
import type { ProfileReview } from '@/types'
import {
  GREEN, GREEN_LT,
  AMBER, AMBER_LT,
  GRAY100, GRAY400, GRAY500, GRAY700, GRAY800,
  WHITE,
} from '@/theme/tokens'

const AVATAR_PALETTE = [GREEN, '#1D4ED8', '#7C3AED', AMBER, '#0D9488', '#EA580C']
const AVATAR_IMAGE_BG = `linear-gradient(180deg, ${WHITE} 0%, ${GRAY100} 100%)`

const fmtDur = (d: number | string) => `${Number(d)}h`

const timeAgo = (d: string) => {
  const sec = (Date.now() - new Date(d).getTime()) / 1000
  if (sec < 60) return 'just now'
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  if (sec < 2592000) return `${Math.floor(sec / 86400)}d ago`
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Shared profile review row ─────────────────────────────────────────────────
// Used by UserProfile and PublicProfile.
// showMedia: render attached photos if present. Default true.
export function ProfileReviewRow({
  review,
  showMedia = true,
}: {
  review: ProfileReview
  showMedia?: boolean
}) {
  const col = AVATAR_PALETTE[review.user_name.charCodeAt(0) % AVATAR_PALETTE.length]
  const ini = review.user_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <Flex gap={3} py="10px" borderBottom={`1px solid ${GRAY100}`}>
      {review.user_avatar_url ? (
        <Box w="32px" h="32px" borderRadius="full" flexShrink={0} overflow="hidden" style={{ background: AVATAR_IMAGE_BG }}>
          <img src={review.user_avatar_url} alt={review.user_name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </Box>
      ) : (
        <Flex w="32px" h="32px" borderRadius="full" flexShrink={0} align="center" justify="center" style={{ background: col, color: WHITE, fontSize: '11px', fontWeight: 700 }}>
          {ini}
        </Flex>
      )}
      <Box flex={1} minW={0}>
        <Flex align="center" gap={2} flexWrap="wrap" mb="4px">
          <Text fontSize="13px" fontWeight={600} color={GRAY800}>{review.user_name}</Text>
          <Box px="6px" py="2px" borderRadius="full" fontSize="10px" fontWeight={700} style={{ background: GREEN_LT, color: GREEN }}>
            <FiCheckCircle size={9} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />Verified
          </Box>
          {review.handshake_hours != null && (
            <Box px="6px" py="2px" borderRadius="full" fontSize="10px" fontWeight={600} style={{ background: AMBER_LT, color: AMBER }}>
              {fmtDur(review.handshake_hours)} exchange
            </Box>
          )}
          <Text fontSize="11px" color={GRAY400}>{timeAgo(review.created_at)}</Text>
        </Flex>
        {review.service_title && <Text fontSize="11px" color={GRAY500} mb="4px">{review.service_title}</Text>}
        <Text fontSize="13px" color={GRAY700} lineHeight={1.55}>{review.body}</Text>
        {showMedia && review.media && review.media.length > 0 && (
          <Flex gap={2} mt={2} flexWrap="wrap">
            {review.media.map((m) => (
              <Box key={m.id} w="72px" h="72px" borderRadius="8px" overflow="hidden" flexShrink={0}
                style={{ cursor: 'pointer' }} onClick={() => window.open(m.file_url, '_blank')}>
                <img src={m.file_url} alt="Review photo" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </Box>
            ))}
          </Flex>
        )}
      </Box>
    </Flex>
  )
}

export default ProfileReviewRow
