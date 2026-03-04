import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Box, Flex, Text, Button, VStack } from '@chakra-ui/react'
import { FiCheckCircle, FiAlertCircle } from 'react-icons/fi'
import { authAPI } from '@/services/authAPI'
import { getErrorMessage } from '@/services/api'
import { useAuthStore } from '@/store/useAuthStore'
import {
  GREEN, GREEN_LT, GREEN_MD,
  GRAY50, GRAY200, GRAY400, GRAY500, GRAY800,
  WHITE, RED, RED_LT,
} from '@/theme/tokens'
import { Logo } from '@/components/Logo'

const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { isAuthenticated, user, refreshUser } = useAuthStore()
  const token = searchParams.get('token') ?? ''
  // If there's no token at all, start directly in error state to avoid a
  // synchronous setState inside useEffect (react-hooks/set-state-in-effect).
  const [verifyStatus, setVerifyStatus] = useState<'loading' | 'success' | 'error'>(
    () => (token ? 'loading' : 'error'),
  )
  const [errorMessage, setErrorMessage] = useState(
    () => (token ? '' : 'No verification token found in the link.'),
  )

  useEffect(() => {
    if (!token) return
    authAPI.verifyEmail(token)
      .then(async (res) => {
        // Backend sets auth cookies and returns user data.
        // Update the store so the app knows the user is authenticated + verified.
        const returnedUser = res.data?.user
        if (returnedUser) {
          useAuthStore.getState().setUser({ ...returnedUser, is_verified: true })
        } else if (isAuthenticated) {
          // Fallback: re-fetch user data if backend didn't return it
          try { await refreshUser() } catch { /* non-fatal */ }
        }
        setVerifyStatus('success')
      })
      .catch((err) => {
        setVerifyStatus('error')
        setErrorMessage(getErrorMessage(err, 'This link is invalid or has expired.'))
      })
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleContinue = () => {
    // After verification, backend sets auth cookies → user is now authenticated.
    // Always try to send to onboarding; fall back to login only if something
    // went wrong and the store has no user (extremely unlikely).
    const { user: currentUser, isAuthenticated: loggedIn } = useAuthStore.getState()
    if (loggedIn) {
      navigate(currentUser?.is_onboarded ? '/dashboard' : '/onboarding', { replace: true })
    } else {
      navigate('/login', { replace: true })
    }
  }

  return (
    <Box minH="100vh" bg={GRAY50}>
      {/* Header */}
      <Box as="header" bg={WHITE} borderBottom={`1px solid ${GRAY200}`} boxShadow="0 1px 4px rgba(0,0,0,0.06)">
        <Flex maxW="1440px" mx="auto" px={6} h="64px" align="center">
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Flex align="center" gap={2}>
              <Logo />
              <Text fontWeight="700" fontSize="md" color={GRAY800}>The Hive</Text>
            </Flex>
          </Link>
        </Flex>
      </Box>

      <Flex justify="center" px={4} py={16}>
        <Box
          w="full" maxW="400px"
          bg={WHITE} borderRadius="16px"
          border={`1px solid ${GRAY200}`}
          boxShadow="0 4px 24px rgba(0,0,0,0.08)"
          p={8} textAlign="center"
        >
          {verifyStatus === 'loading' && (
            <VStack gap={4}>
              <Box
                w="48px" h="48px"
                border="3px solid" borderColor={GREEN_MD}
                borderTopColor={GREEN}
                borderRadius="full" mx="auto"
                style={{ animation: 'spin 0.8s linear infinite' }}
              />
              <Text fontSize="sm" color={GRAY500}>Verifying your email…</Text>
            </VStack>
          )}

          {verifyStatus === 'success' && (
            <VStack gap={4}>
              <Box
                w="64px" h="64px" borderRadius="full"
                bg={GREEN_LT} border={`2px solid ${GREEN_MD}`}
                display="flex" alignItems="center" justifyContent="center" mx="auto"
              >
                <FiCheckCircle size={28} color={GREEN} />
              </Box>
              <VStack gap={1}>
                <Text fontSize="xl" fontWeight="700" color={GRAY800}>Email verified!</Text>
                <Text fontSize="sm" color={GRAY500} maxW="280px">
                  Great! Let's set up your profile so you can start exchanging skills with your community.
                </Text>
              </VStack>
              <Button
                w="full" size="md" mt={2}
                onClick={handleContinue}
                style={{ background: GREEN, color: WHITE, borderRadius: '8px', fontWeight: 600, fontSize: '14px' }}
              >
                {user?.is_onboarded ? 'Go to Dashboard' : 'Complete Your Profile →'}
              </Button>
            </VStack>
          )}

          {verifyStatus === 'error' && (
            <VStack gap={4}>
              <Box
                w="64px" h="64px" borderRadius="full"
                bg={RED_LT} border={`1px solid ${RED}33`}
                display="flex" alignItems="center" justifyContent="center" mx="auto"
              >
                <FiAlertCircle size={28} color={RED} />
              </Box>
              <VStack gap={1}>
                <Text fontSize="xl" fontWeight="700" color={GRAY800}>Verification failed</Text>
                <Text fontSize="sm" color={GRAY500} maxW="280px">{errorMessage}</Text>
              </VStack>
              <VStack gap={2} w="full">
                <Link to="/verify-email-sent" style={{ width: '100%' }}>
                  <Button
                    w="full" size="md"
                    style={{ background: GREEN, color: WHITE, borderRadius: '8px', fontWeight: 600, fontSize: '14px' }}
                  >
                    Request New Link
                  </Button>
                </Link>
                <Link to="/login">
                  <Text fontSize="sm" color={GRAY400} fontWeight={500}>
                    Back to Login
                  </Text>
                </Link>
              </VStack>
            </VStack>
          )}
        </Box>
      </Flex>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Box>
  )
}

export default VerifyEmailPage
