import { useState } from 'react'
import { Box, Flex, Stack, Text } from '@chakra-ui/react'
import { FiCheck, FiUserPlus } from 'react-icons/fi'
import { Link as RouterLink } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { userAPI } from '@/services/userAPI'
import type { UserSummary } from '@/types'

interface SuggestedUserCardProps {
  user: UserSummary
}

export function SuggestedUserCard({ user }: SuggestedUserCardProps) {
  const [following, setFollowing] = useState(false)
  const [pending, setPending] = useState(false)

  const handleFollow = async () => {
    if (following || pending) return
    setPending(true)
    setFollowing(true)
    try {
      await userAPI.followUser(user.id)
    } catch {
      setFollowing(false)
    } finally {
      setPending(false)
    }
  }

  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email

  return (
    <Box
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="14px"
      bg="white"
      p="16px"
      transition="all 0.18s ease"
      _hover={{ borderColor: 'teal.300', boxShadow: '0 6px 16px rgba(20, 184, 166, 0.10)' }}
    >
      <RouterLink to={`/public-profile/${user.id}`} style={{ textDecoration: 'none' }}>
        <Flex align="center" gap={3} mb="12px">
          <Avatar u={user} size={56} />
          <Stack gap={0} flex={1} minW={0}>
            <Text fontSize="15px" fontWeight={700} color="gray.900" lineClamp={1}>
              {displayName}
            </Text>
            <Text fontSize="11px" color="gray.500" lineClamp={1}>
              {user.email}
            </Text>
          </Stack>
        </Flex>
      </RouterLink>
      <Box
        as="button"
        onClick={handleFollow}
        aria-disabled={following || pending}
        w="100%"
        py="8px"
        borderRadius="9px"
        bg={following ? 'teal.50' : 'teal.500'}
        color={following ? 'teal.700' : 'white'}
        borderWidth={following ? '1px' : '0'}
        borderColor="teal.300"
        fontSize="13px"
        fontWeight={700}
        cursor={following ? 'default' : 'pointer'}
        _hover={following ? undefined : { bg: 'teal.600' }}
      >
        <Flex align="center" justify="center" gap="6px">
          <Box as={following ? FiCheck : FiUserPlus} />
          {following ? 'Following' : 'Follow'}
        </Flex>
      </Box>
    </Box>
  )
}
