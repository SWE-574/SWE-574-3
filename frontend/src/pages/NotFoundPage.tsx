import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Flex, Text } from '@chakra-ui/react'
import { FiCompass, FiHome, FiSearch } from 'react-icons/fi'

import {
  AMBER,
  AMBER_LT,
  GRAY50,
  GRAY100,
  GRAY200,
  GRAY600,
  GRAY800,
  GREEN,
  GREEN_LT,
  WHITE,
} from '@/theme/tokens'

const NotFoundPage = () => {
  const navigate = useNavigate()

  useEffect(() => {
    document.title = '404 — Page Not Found'
  }, [])

  return (
    <Box bg={GRAY50} minH="calc(100vh - 64px)" py={{ base: 0, md: '8px' }} px={{ base: 0, md: '12px' }}>
      <Box
        maxW="1440px"
        mx="auto"
        minH={{ base: 'calc(100vh - 64px)', md: 'calc(100vh - 88px)' }}
        bg={WHITE}
        borderRadius={{ base: 0, md: '20px' }}
        border={{ base: 'none', md: `1px solid ${GRAY200}` }}
        boxShadow={{ base: 'none', md: '0 4px 24px rgba(0,0,0,0.08)' }}
        overflow="hidden"
      >
        <Flex minH={{ base: 'calc(100vh - 64px)', md: 'calc(100vh - 88px)' }} align="center" justify="center" px={6} py={10}>
          <Box maxW="620px" textAlign="center">
            <Flex
              w="110px"
              h="110px"
              mx="auto"
              mb={6}
              borderRadius="32px"
              align="center"
              justify="center"
              position="relative"
              style={{ background: `linear-gradient(135deg, ${GREEN_LT} 0%, ${AMBER_LT} 100%)`, border: `1px solid ${GRAY200}` }}
            >
              <Box position="absolute" top="14px" right="14px" w="28px" h="28px" borderRadius="full" bg={WHITE} display="flex" alignItems="center" justifyContent="center" border={`1px solid ${GRAY200}`}>
                <Text fontSize="11px" fontWeight={800} color={AMBER}>404</Text>
              </Box>
              <FiCompass size={42} color={GREEN} />
            </Flex>

            <Text as="h1" fontSize={{ base: '34px', md: '42px' }} fontWeight={900} color={GRAY800} lineHeight={1} mb={3}>
              Page Not Found
            </Text>
            <Text fontSize="15px" color={GRAY600} lineHeight={1.7} mb={7}>
              The page you were looking for may have moved, expired, or never existed.
              You can head home or jump back into the community and browse available services.
            </Text>

            <Flex justify="center" gap={3} wrap="wrap">
              <Box
                as="button"
                px="16px"
                py="10px"
                borderRadius="10px"
                fontSize="13px"
                fontWeight={700}
                display="inline-flex"
                alignItems="center"
                gap="7px"
                style={{ background: GREEN, color: WHITE, border: 'none', cursor: 'pointer' }}
                onClick={() => navigate('/')}
              >
                <FiHome size={14} />
                Go to Home
              </Box>
              <Box
                as="button"
                px="16px"
                py="10px"
                borderRadius="10px"
                fontSize="13px"
                fontWeight={700}
                display="inline-flex"
                alignItems="center"
                gap="7px"
                style={{ background: GRAY100, color: GRAY800, border: `1px solid ${GRAY200}`, cursor: 'pointer' }}
                onClick={() => navigate('/dashboard')}
              >
                <FiSearch size={14} />
                Browse Services
              </Box>
            </Flex>

            <Box mt={8} px={4} py={4} borderRadius="16px" bg={AMBER_LT} border={`1px solid ${AMBER}33`}>
              <Text fontSize="12px" fontWeight={700} color={AMBER} textTransform="uppercase" letterSpacing="0.06em" mb={1}>
                Need a shortcut?
              </Text>
              <Text fontSize="14px" color={GRAY600}>
                Try the dashboard to explore active offers and needs, or return home to navigate from the main landing page.
              </Text>
            </Box>
          </Box>
        </Flex>
      </Box>
    </Box>
  )
}

export default NotFoundPage
