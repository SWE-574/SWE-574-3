import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { Box, Flex, Text, Button, Input, VStack } from '@chakra-ui/react'
import { FiMail, FiCheckCircle } from 'react-icons/fi'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/useAuthStore'
import { authAPI } from '@/services/authAPI'
import {
  GREEN, GREEN_LT, GREEN_MD,
  GRAY50, GRAY200, GRAY300, GRAY400, GRAY500, GRAY600, GRAY800,
  WHITE,
} from '@/theme/tokens'
import { Logo } from '@/components/Logo'

const COOLDOWN_SECS = import.meta.env.DEV ? 0 : 60

const VerifyEmailSentPage = () => {
  const location = useLocation()
  const { user, isAuthenticated, isLoading, checkAuth } = useAuthStore()

  const passedEmail = (location.state as { email?: string } | null)?.email ?? ''
  const [email, setEmail] = useState(passedEmail)
  const [isSending, setIsSending] = useState(false)
  const [sentCount, setSentCount] = useState(0)
  const [cooldown, setCooldown] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Track whether we've finished the initial auth check so we don't flash-redirect
  const [authChecked, setAuthChecked] = useState(isAuthenticated)

  // On direct URL access (store is empty after page refresh), run a single auth check.
  // App.tsx skips checkAuth on public paths, so we do it here manually.
  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      checkAuth().finally(() => setAuthChecked(true))
    } else {
      setAuthChecked(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  // Guards — only apply after auth check is done to avoid flash redirects
  if (authChecked && !isLoading) {
    // Not logged in at all → must register first
    if (!isAuthenticated) return <Navigate to="/register" replace />
    // Already verified → go to dashboard
    if (user?.is_verified) return <Navigate to="/dashboard" replace />
  }

  const startCooldown = () => {
    if (COOLDOWN_SECS === 0) return
    setCooldown(COOLDOWN_SECS)
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current!); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  const handleResend = async () => {
    if (!email.trim()) { toast.error('Please enter your email address.'); return }
    setIsSending(true)
    try {
      await authAPI.resendVerification(email.trim())
      setSentCount((c) => c + 1)
      toast.success('Verification email sent!')
      startCooldown()
    } catch {
      toast.error('Could not send email. Please try again.')
    } finally {
      setIsSending(false)
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

      <Flex justify="center" px={4} py={12}>
        <Box
          w="full" maxW="440px"
          bg={WHITE} borderRadius="16px"
          border={`1px solid ${GRAY200}`}
          boxShadow="0 4px 24px rgba(0,0,0,0.08)"
          p={8}
        >
          <VStack gap={5} textAlign="center">
            {/* Icon */}
            <Box
              w="64px" h="64px" borderRadius="full"
              bg={GREEN_LT} border={`2px solid ${GREEN_MD}`}
              display="flex" alignItems="center" justifyContent="center"
              mx="auto"
            >
              <FiMail size={28} color={GREEN} />
            </Box>

            <VStack gap={1}>
              <Text fontSize="xl" fontWeight="700" color={GRAY800}>Check your email</Text>
              <Text fontSize="sm" color={GRAY500} maxW="300px">
                We sent a verification link to your email. Click the link to activate your account.
              </Text>
            </VStack>

            {/* Tips */}
            <Box
              bg={GRAY50} borderRadius="12px" p={4} w="full"
              border={`1px solid ${GRAY200}`} textAlign="left"
            >
              <Text fontSize="xs" fontWeight="600" color={GRAY600} mb={2}>Tips:</Text>
              <VStack gap={1} align="start">
                {[
                  'Check your spam / junk folder',
                  'The link expires in 24 hours',
                  'You can still browse the dashboard',
                ].map((tip) => (
                  <Text key={tip} fontSize="xs" color={GRAY500}>• {tip}</Text>
                ))}
              </VStack>
            </Box>

            {/* Resend section */}
            <Box w="full" pt={1}>
              <Text fontSize="sm" color={GRAY500} mb={3}>
                Didn't receive it?{' '}
                {sentCount > 0 && (
                  <span style={{ color: GREEN, fontWeight: 600 }}>
                    <FiCheckCircle size={12} style={{ display: 'inline', marginRight: 3 }} />
                    Sent {sentCount}×
                  </span>
                )}
              </Text>

              {!passedEmail && (
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  borderColor={GRAY300} borderRadius="8px" fontSize="sm" mb={3}
                  _focus={{ borderColor: GREEN, boxShadow: `0 0 0 3px ${GREEN}22` }}
                />
              )}

              <Button
                w="full" size="md"
                onClick={handleResend}
                loading={isSending}
                loadingText="Sending…"
                disabled={isSending || cooldown > 0}
                variant="outline"
                style={{
                  borderRadius: '8px',
                  borderColor: cooldown > 0 ? GRAY300 : GREEN,
                  color: cooldown > 0 ? GRAY400 : GREEN,
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Verification Email'}
              </Button>
            </Box>

            {/* Links */}
            <Flex gap={4} justify="center" pt={1}>
              <Link to="/login">
                <Text fontSize="sm" color={GREEN} fontWeight={600}>Back to Login</Text>
              </Link>
              <Text fontSize="sm" color={GRAY300}>|</Text>
              <Link to="/dashboard">
                <Text fontSize="sm" color={GRAY500}>Go to Dashboard</Text>
              </Link>
            </Flex>
          </VStack>
        </Box>
      </Flex>
    </Box>
  )
}

export default VerifyEmailSentPage
