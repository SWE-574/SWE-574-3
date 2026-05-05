import { Box } from '@chakra-ui/react'
import { GREEN, WHITE } from '@/theme/tokens'
import { initials } from '@/utils/initials'
import type { UserLike } from '@/utils/initials'

export function Avatar({
  u,
  size = 36,
}: {
  u?: UserLike | null
  size?: number
}) {
  return (
    <Box
      w={`${size}px`}
      h={`${size}px`}
      borderRadius="full"
      flexShrink={0}
      bg={GREEN}
      color={WHITE}
      overflow="hidden"
      display="flex"
      alignItems="center"
      justifyContent="center"
      fontSize={`${Math.round(size * 0.34)}px`}
      fontWeight={700}
    >
      {u?.avatar_url ? (
        <img
          src={u.avatar_url}
          alt=""
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        initials(u)
      )}
    </Box>
  )
}
