import { useEffect, useState } from 'react'
import { Box, Flex, Grid, Skeleton, Stack, Text } from '@chakra-ui/react'
import { FiUsers } from 'react-icons/fi'
import { userAPI } from '@/services/userAPI'
import type { UserSummary } from '@/types'
import { SuggestedUserCard } from '@/components/users/SuggestedUserCard'

export default function SuggestedUsersPage() {
  const [users, setUsers] = useState<UserSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    userAPI
      .getSuggested()
      .then(({ results }) => {
        if (!cancelled) setUsers(results)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load suggestions right now.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Box minH="calc(100vh - 64px)" bg="gray.50">
      <Box maxW="1080px" mx="auto" px={{ base: 4, md: 6 }} py={8}>
        <Flex align="center" mb={2} gap={2}>
          <Box
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            w="38px"
            h="38px"
            borderRadius="12px"
            bg="teal.50"
            color="teal.600"
          >
            <Box as={FiUsers} fontSize="20px" />
          </Box>
          <Text fontSize="2xl" fontWeight={800} color="gray.900">
            People you might know
          </Text>
        </Flex>
        <Text fontSize="sm" color="gray.600" mb={6}>
          Neighbors with shared skills and interests. Follow a few to fill out your activity feed.
        </Text>

        {loading ? (
          <Grid templateColumns={{ base: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }} gap={4}>
            {[0, 1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} h="180px" borderRadius="14px" />
            ))}
          </Grid>
        ) : error ? (
          <Box bg="red.50" p={4} borderRadius="md">
            <Text fontSize="sm" color="red.700">{error}</Text>
          </Box>
        ) : users.length === 0 ? (
          <Stack
            bg="white"
            borderWidth="1px"
            borderColor="gray.200"
            borderRadius="14px"
            p={8}
            align="center"
            gap={3}
          >
            <Box as={FiUsers} fontSize="32px" color="gray.400" />
            <Text fontSize="sm" color="gray.600" textAlign="center">
              No suggestions right now. As more neighbors join, we'll surface people who share your skills.
            </Text>
          </Stack>
        ) : (
          <Grid templateColumns={{ base: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }} gap={4}>
            {users.map(u => (
              <SuggestedUserCard key={u.id} user={u} />
            ))}
          </Grid>
        )}
      </Box>
    </Box>
  )
}
