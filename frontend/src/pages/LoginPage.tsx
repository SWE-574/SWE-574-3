import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Box,
  Flex,
  Text,
  Button,
  Input,
  VStack,
} from '@chakra-ui/react'
import { FiArrowLeft, FiMail, FiLock } from 'react-icons/fi'
import { useAuthStore } from '@/store/useAuthStore'
import { getErrorMessage } from '@/services/api'

const YELLOW = '#F8C84A'
const GREEN = '#2D5C4E'
const ORANGE = '#f97316'

function HexLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <polygon
        points="16,2 28,9 28,23 16,30 4,23 4,9"
        fill={YELLOW}
        stroke={GREEN}
        strokeWidth="1.5"
      />
      <text x="16" y="21" textAnchor="middle" fontSize="13" fontWeight="bold" fill={GREEN}>
        H
      </text>
    </svg>
  )
}

const LoginPage = () => {
  const navigate = useNavigate()
  const { login, isLoading } = useAuthStore()

  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')

  // Check for session_expired in URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'session_expired') {
      setError('Your session has expired. Please log in again.')
      window.history.replaceState({}, '', '/login')
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.email.trim()) { setError('Email is required.'); return }
    if (!form.password.trim()) { setError('Password is required.'); return }

    try {
      await login(form.email, form.password)
      navigate('/dashboard')
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Login failed. Please check your credentials.'))
    }
  }

  return (
    <Box minH="100vh" bg="linear-gradient(to bottom, #fffbeb, #ffffff)">
      {/* ── Header ── */}
      <Box
        as="header"
        borderBottom="1px solid"
        borderColor="orange.100"
        bg="rgba(255,255,255,0.85)"
        backdropFilter="blur(10px)"
      >
        <Flex maxW="1440px" mx="auto" px={8} py={4} align="center" justify="space-between">
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Flex align="center" gap={2}>
              <HexLogo />
              <Text fontWeight="700" fontSize="lg" color="gray.900">
                The Hive
              </Text>
            </Flex>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            style={{ color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <FiArrowLeft size={15} />
            Back to Home
          </Button>
        </Flex>
      </Box>

      {/* ── Form ── */}
      <Flex maxW="1440px" mx="auto" px={8} py={16} justify="center">
        <Box
          w="full"
          maxW="420px"
          bg="white"
          borderRadius="2xl"
          border="1px solid"
          borderColor="gray.200"
          p={8}
          boxShadow="lg"
        >
          <VStack gap={2} mb={8} textAlign="center">
            <Text as="h1" fontSize="2xl" fontWeight="800" color="gray.900">
              Welcome Back
            </Text>
            <Text color="gray.500" fontSize="sm">
              Log in to your Hive account
            </Text>
          </VStack>

          {/* Error alert */}
          {error && (
            <Box
              mb={6}
              p={4}
              bg="red.50"
              border="1px solid"
              borderColor="red.200"
              borderRadius="lg"
            >
              <Text fontSize="sm" color="red.700">
                {error}
              </Text>
            </Box>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <VStack gap={5}>
              {/* Email */}
              <Box w="full">
                <label htmlFor="email" style={{ fontSize: '14px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>
                  Email Address <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <Flex
                  align="center"
                  border="1px solid"
                  borderColor="gray.300"
                  borderRadius="lg"
                  overflow="hidden"
                  _focusWithin={{ borderColor: ORANGE, boxShadow: `0 0 0 2px ${ORANGE}33` }}
                >
                  <Box px={3} color="gray.400">
                    <FiMail size={16} />
                  </Box>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your.email@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    disabled={isLoading}
                    autoComplete="email"
                    border="none"
                    outline="none"
                    _focus={{ boxShadow: 'none', borderColor: 'transparent' }}
                    flex={1}
                  />
                </Flex>
              </Box>

              {/* Password */}
              <Box w="full">
                <label htmlFor="password" style={{ fontSize: '14px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>
                  Password <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <Flex
                  align="center"
                  border="1px solid"
                  borderColor="gray.300"
                  borderRadius="lg"
                  overflow="hidden"
                  _focusWithin={{ borderColor: ORANGE, boxShadow: `0 0 0 2px ${ORANGE}33` }}
                >
                  <Box px={3} color="gray.400">
                    <FiLock size={16} />
                  </Box>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    disabled={isLoading}
                    autoComplete="current-password"
                    border="none"
                    outline="none"
                    _focus={{ boxShadow: 'none', borderColor: 'transparent' }}
                    flex={1}
                  />
                </Flex>
              </Box>

              {/* Submit */}
              <Button
                type="submit"
                w="full"
                size="lg"
                loading={isLoading}
                loadingText="Logging in…"
                disabled={isLoading}
                style={{
                  background: ORANGE,
                  color: '#fff',
                  borderRadius: '9999px',
                  fontWeight: 600,
                }}
              >
                Log In
              </Button>
            </VStack>
          </form>

          {/* Register link */}
          <Text mt={6} textAlign="center" fontSize="sm" color="gray.600">
            Don't have an account?{' '}
            <Link
              to="/register"
              style={{ color: ORANGE, fontWeight: 600 }}
            >
              Sign up
            </Link>
          </Text>
        </Box>
      </Flex>
    </Box>
  )
}

export default LoginPage
