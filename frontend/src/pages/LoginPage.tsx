import { useState } from 'react'
import { useNavigate, Link, Navigate, useLocation } from 'react-router-dom'
import { Box, Flex, Text, Button, Input, VStack } from '@chakra-ui/react'
import { FiArrowLeft, FiMail, FiLock } from 'react-icons/fi'
import { useAuthStore } from '@/store/useAuthStore'
import { getErrorMessage } from '@/services/api'
import {
  GREEN,
  GRAY50, GRAY200, GRAY300, GRAY400, GRAY500, GRAY600, GRAY700, GRAY800,
  WHITE, RED, RED_LT,
} from '@/theme/tokens'
import { Logo } from '@/components/Logo'

const LoginPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isLoading, isAuthenticated } = useAuthStore()

  const redirectFromQuery = new URLSearchParams(location.search).get('redirect')
  const safeRedirectFromQuery = redirectFromQuery && redirectFromQuery.startsWith('/') ? redirectFromQuery : null
  const redirectFromState = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
  const redirectAfterLogin = safeRedirectFromQuery || (redirectFromState && redirectFromState.startsWith('/') ? redirectFromState : null) || '/dashboard'

  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'session_expired') {
      window.history.replaceState({}, '', '/login')
      return 'Your session has expired. Please log in again.'
    }
    return ''
  })

  // Guard after all hooks to satisfy Rules of Hooks
  if (isAuthenticated) return <Navigate to={redirectAfterLogin} replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.email.trim()) { setError('Email is required.'); return }
    if (!form.password.trim()) { setError('Password is required.'); return }
    try {
      await login(form.email, form.password)
      // No navigate() here — the isAuthenticated guard above handles redirect
      // after the store state is updated, avoiding a double-navigation race.
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Login failed. Please check your credentials.'))
    }
  }

  return (
    <Box minH="100vh" bg={GRAY50}>
      {/* ── Header ── */}
      <Box
        as="header"
        bg={WHITE}
        borderBottom={`1px solid ${GRAY200}`}
        boxShadow="0 1px 4px rgba(0,0,0,0.06)"
      >
        <Flex maxW="1440px" mx="auto" px={6} h="64px" align="center" justify="space-between">
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Flex align="center" gap={2}>
              <Logo />
              <Text fontWeight="700" fontSize="md" color={GRAY800}>The Hive</Text>
            </Flex>
          </Link>
          <Box
            as="button"
            onClick={() => navigate('/')}
            display="flex"
            alignItems="center"
            gap="6px"
            fontSize="sm"
            color={GRAY600}
            fontWeight={500}
            px={3}
            py={2}
            borderRadius="8px"
            _hover={{ bg: GRAY50, color: GRAY800 }}
            transition="all 0.15s"
          >
            <FiArrowLeft size={14} />
            Back to Home
          </Box>
        </Flex>
      </Box>

      {/* ── Form ── */}
      <Flex justify="center" px={4} py={12}>
        <Box
          w="full"
          maxW="420px"
          bg={WHITE}
          borderRadius="16px"
          border={`1px solid ${GRAY200}`}
          boxShadow="0 4px 24px rgba(0,0,0,0.08)"
          p={8}
        >
          {/* Logo + heading */}
          <VStack gap={1} mb={7} textAlign="center">
            <Box mb={2}><Logo size={40} /></Box>
            <Text fontSize="xl" fontWeight="700" color={GRAY800}>Welcome back</Text>
            <Text fontSize="sm" color={GRAY500}>Log in to your Hive account</Text>
          </VStack>

          {/* Error */}
          {error && (
            <Box mb={5} p={3} bg={RED_LT} border={`1px solid ${RED}33`} borderRadius="8px">
              <Text fontSize="sm" color={RED}>{error}</Text>
            </Box>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <VStack gap={4}>
              {/* Email */}
              <Box w="full">
                <label htmlFor="email" style={{ fontSize: '13px', fontWeight: 500, color: GRAY700, display: 'block', marginBottom: '6px' }}>
                  Email address
                </label>
                <Flex
                  align="center"
                  border={`1px solid ${GRAY300}`}
                  borderRadius="8px"
                  overflow="hidden"
                  bg={WHITE}
                  _focusWithin={{ borderColor: GREEN, boxShadow: `0 0 0 3px ${GREEN}22` }}
                  transition="border-color 0.15s, box-shadow 0.15s"
                >
                  <Box px={3} color={GRAY400}><FiMail size={15} /></Box>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    disabled={isLoading}
                    autoComplete="email"
                    border="none"
                    bg="transparent"
                    _focus={{ boxShadow: 'none' }}
                    fontSize="sm"
                    flex={1}
                  />
                </Flex>
              </Box>

              {/* Password */}
              <Box w="full">
                <Flex justify="space-between" mb="6px">
                  <label htmlFor="password" style={{ fontSize: '13px', fontWeight: 500, color: GRAY700 }}>
                    Password
                  </label>
                  <Link to="/forgot-password" style={{ fontSize: '12px', color: GREEN, fontWeight: 500 }}>
                    Forgot password?
                  </Link>
                </Flex>
                <Flex
                  align="center"
                  border={`1px solid ${GRAY300}`}
                  borderRadius="8px"
                  overflow="hidden"
                  bg={WHITE}
                  _focusWithin={{ borderColor: GREEN, boxShadow: `0 0 0 3px ${GREEN}22` }}
                  transition="border-color 0.15s, box-shadow 0.15s"
                >
                  <Box px={3} color={GRAY400}><FiLock size={15} /></Box>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    disabled={isLoading}
                    autoComplete="current-password"
                    border="none"
                    bg="transparent"
                    _focus={{ boxShadow: 'none' }}
                    fontSize="sm"
                    flex={1}
                  />
                </Flex>
              </Box>

              {/* Submit */}
              <Button
                type="submit"
                w="full"
                size="md"
                loading={isLoading}
                loadingText="Signing in…"
                disabled={isLoading}
                mt={1}
                style={{
                  background: GREEN,
                  color: WHITE,
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '14px',
                  height: '42px',
                }}
                _hover={{ opacity: 0.9 }}
              >
                Sign in
              </Button>
            </VStack>
          </form>

          {/* Divider */}
          <Flex align="center" my={5} gap={3}>
            <Box flex={1} h="1px" bg={GRAY200} />
            <Text fontSize="xs" color={GRAY400}>or</Text>
            <Box flex={1} h="1px" bg={GRAY200} />
          </Flex>

          <Text textAlign="center" fontSize="sm" color={GRAY500}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: GREEN, fontWeight: 600 }}>
              Create one
            </Link>
          </Text>
        </Box>
      </Flex>
    </Box>
  )
}

export default LoginPage
