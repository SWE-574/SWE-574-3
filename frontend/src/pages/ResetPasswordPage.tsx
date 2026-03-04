import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { Box, Flex, Text, Button, Input, VStack } from '@chakra-ui/react'
import { FiArrowLeft, FiLock, FiCheckCircle, FiAlertCircle } from 'react-icons/fi'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { authAPI } from '@/services/authAPI'
import { getErrorMessage } from '@/services/api'
import {
  GREEN, GREEN_LT, GREEN_MD,
  GRAY50, GRAY200, GRAY300, GRAY400, GRAY500, GRAY600, GRAY700, GRAY800,
  WHITE, RED, RED_LT,
} from '@/theme/tokens'
import { Logo } from '@/components/Logo'

const schema = z
  .object({
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Z]/, 'One uppercase letter required')
      .regex(/[a-z]/, 'One lowercase letter required')
      .regex(/[0-9]/, 'One number required'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type FormData = z.infer<typeof schema>

const ResetPasswordPage = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const { isAuthenticated, user } = useAuthStore()

  const [success, setSuccess] = useState(false)
  const [apiError, setApiError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  // Verified + logged-in users don't need this page — guard after all hooks
  if (isAuthenticated && user?.is_verified) {
    return <Navigate to="/dashboard" replace />
  }

  const passwordValue = watch('password') ?? ''
  const pwChecks = {
    length:    passwordValue.length >= 8,
    uppercase: /[A-Z]/.test(passwordValue),
    lowercase: /[a-z]/.test(passwordValue),
    number:    /[0-9]/.test(passwordValue),
  }
  const pwScore = Object.values(pwChecks).filter(Boolean).length
  const pwStrengthColor = pwScore <= 1 ? '#EF4444' : pwScore <= 3 ? '#F59E0B' : '#22C55E'
  const pwStrengthLabel = pwScore <= 1 ? 'Weak' : pwScore === 2 ? 'Fair' : pwScore === 3 ? 'Good' : 'Strong'

  // No token → show error
  if (!token) {
    return (
      <Box minH="100vh" bg={GRAY50} display="flex" alignItems="center" justifyContent="center">
        <Box
          bg={WHITE} borderRadius="16px" border={`1px solid ${GRAY200}`}
          boxShadow="0 4px 24px rgba(0,0,0,0.08)"
          p={8} maxW="380px" w="full" textAlign="center"
        >
          <Box
            w="60px" h="60px" borderRadius="full" bg={RED_LT}
            display="flex" alignItems="center" justifyContent="center" mx="auto" mb={4}
          >
            <FiAlertCircle size={28} color={RED} />
          </Box>
          <Text fontSize="lg" fontWeight="700" color={GRAY800} mb={2}>Invalid Link</Text>
          <Text fontSize="sm" color={GRAY500} mb={6}>This password reset link is missing a token.</Text>
          <Link to="/forgot-password">
            <Button
              w="full" size="md"
              style={{ background: GREEN, color: WHITE, borderRadius: '8px', fontWeight: 600 }}
            >
              Request New Link
            </Button>
          </Link>
        </Box>
      </Box>
    )
  }

  const onSubmit = async (data: FormData) => {
    setApiError('')
    setIsSubmitting(true)
    try {
      await authAPI.resetPassword(token, data.password)
      setSuccess(true)
      setTimeout(() => navigate('/login'), 3000)
    } catch (err) {
      setApiError(getErrorMessage(err, 'Failed to reset password. The link may have expired.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Box minH="100vh" bg={GRAY50}>
      {/* Header */}
      <Box as="header" bg={WHITE} borderBottom={`1px solid ${GRAY200}`} boxShadow="0 1px 4px rgba(0,0,0,0.06)">
        <Flex maxW="1440px" mx="auto" px={6} h="64px" align="center" justify="space-between">
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Flex align="center" gap={2}>
              <Logo />
              <Text fontWeight="700" fontSize="md" color={GRAY800}>The Hive</Text>
            </Flex>
          </Link>
          <Link to="/login">
            <Box
              display="flex" alignItems="center" gap="6px"
              fontSize="sm" color={GRAY600} fontWeight={500}
              px={3} py={2} borderRadius="8px"
              _hover={{ bg: GRAY50, color: GRAY800 }}
              transition="all 0.15s"
            >
              <FiArrowLeft size={14} />
              Back to Login
            </Box>
          </Link>
        </Flex>
      </Box>

      <Flex justify="center" px={4} py={12}>
        <Box
          w="full" maxW="420px"
          bg={WHITE} borderRadius="16px"
          border={`1px solid ${GRAY200}`}
          boxShadow="0 4px 24px rgba(0,0,0,0.08)"
          p={8}
        >
          {success ? (
            <VStack gap={4} textAlign="center">
              <Box
                w="64px" h="64px" borderRadius="full"
                bg={GREEN_LT} border={`2px solid ${GREEN_MD}`}
                display="flex" alignItems="center" justifyContent="center" mx="auto"
              >
                <FiCheckCircle size={28} color={GREEN} />
              </Box>
              <VStack gap={1}>
                <Text fontSize="lg" fontWeight="700" color={GRAY800}>Password updated!</Text>
                <Text fontSize="sm" color={GRAY500}>Redirecting you to login…</Text>
              </VStack>
              <Link to="/login" style={{ width: '100%' }}>
                <Button
                  w="full" size="md" mt={2}
                  style={{ background: GREEN, color: WHITE, borderRadius: '8px', fontWeight: 600, fontSize: '14px' }}
                >
                  Go to Login
                </Button>
              </Link>
            </VStack>
          ) : (
            <>
              <VStack gap={1} mb={6} textAlign="center">
                <Box mb={2}><Logo size={40} /></Box>
                <Text fontSize="xl" fontWeight="700" color={GRAY800}>Set a new password</Text>
                <Text fontSize="sm" color={GRAY500}>Choose a strong password for your account.</Text>
              </VStack>

              {apiError && (
                <Box mb={5} p={3} bg={RED_LT} border={`1px solid ${RED}33`} borderRadius="8px">
                  <Text fontSize="sm" color={RED}>{apiError}</Text>
                </Box>
              )}

              <form onSubmit={handleSubmit(onSubmit)} noValidate>
                <VStack gap={4}>
                  {/* New password */}
                  <Box w="full">
                    <label htmlFor="password" style={{ fontSize: '13px', fontWeight: 500, color: GRAY700, display: 'block', marginBottom: '6px' }}>
                      New password
                    </label>
                    <Flex
                      align="center"
                      border={`1px solid ${errors.password ? RED : GRAY300}`}
                      borderRadius="8px" overflow="hidden" bg={WHITE}
                      _focusWithin={{ borderColor: GREEN, boxShadow: `0 0 0 3px ${GREEN}22` }}
                      transition="border-color 0.15s, box-shadow 0.15s"
                    >
                      <Box px={3} color={GRAY400}><FiLock size={15} /></Box>
                      <Input
                        id="password"
                        type="password"
                        placeholder="Min. 8 chars, uppercase & number"
                        {...register('password')}
                        disabled={isSubmitting}
                        autoComplete="new-password"
                        border="none" bg="transparent"
                        _focus={{ boxShadow: 'none' }}
                        fontSize="sm" flex={1}
                      />
                    </Flex>
                    {/* Password strength meter */}
                    {passwordValue.length > 0 && (
                      <Box mt={2}>
                        <Flex gap={1} mb={1}>
                          {[1, 2, 3, 4].map((i) => (
                            <Box
                              key={i} flex={1} h="3px" borderRadius="full"
                              bg={i <= pwScore ? pwStrengthColor : GRAY200}
                              transition="background 0.2s"
                            />
                          ))}
                        </Flex>
                        <Text fontSize="10px" fontWeight={600} style={{ color: pwStrengthColor }}>{pwStrengthLabel}</Text>
                        <Flex flexWrap="wrap" gap="4px 12px" mt={2}>
                          {[
                            { ok: pwChecks.length,    label: '8+ chars' },
                            { ok: pwChecks.uppercase, label: 'Uppercase' },
                            { ok: pwChecks.lowercase, label: 'Lowercase' },
                            { ok: pwChecks.number,    label: 'Number' },
                          ].map(({ ok, label }) => (
                            <Flex key={label} align="center" gap="3px">
                              <Box
                                w="12px" h="12px" borderRadius="full"
                                display="flex" alignItems="center" justifyContent="center"
                                bg={ok ? '#22C55E' : GRAY200}
                                flexShrink={0} transition="background 0.2s"
                              >
                                {ok && (
                                  <svg width="7" height="6" viewBox="0 0 7 6" fill="none">
                                    <path d="M1 3l1.5 1.5L6 1" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                )}
                              </Box>
                              <Text fontSize="10px" color={ok ? GRAY700 : GRAY400}>{label}</Text>
                            </Flex>
                          ))}
                        </Flex>
                      </Box>
                    )}
                    {errors.password && <Text fontSize="xs" color={RED} mt="4px">{errors.password.message}</Text>}
                  </Box>

                  {/* Confirm password */}
                  <Box w="full">
                    <label htmlFor="confirmPassword" style={{ fontSize: '13px', fontWeight: 500, color: GRAY700, display: 'block', marginBottom: '6px' }}>
                      Confirm new password
                    </label>
                    <Flex
                      align="center"
                      border={`1px solid ${errors.confirmPassword ? RED : GRAY300}`}
                      borderRadius="8px" overflow="hidden" bg={WHITE}
                      _focusWithin={{ borderColor: GREEN, boxShadow: `0 0 0 3px ${GREEN}22` }}
                      transition="border-color 0.15s, box-shadow 0.15s"
                    >
                      <Box px={3} color={GRAY400}><FiLock size={15} /></Box>
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="Repeat new password"
                        {...register('confirmPassword')}
                        disabled={isSubmitting}
                        autoComplete="new-password"
                        border="none" bg="transparent"
                        _focus={{ boxShadow: 'none' }}
                        fontSize="sm" flex={1}
                      />
                    </Flex>
                    {errors.confirmPassword && <Text fontSize="xs" color={RED} mt="4px">{errors.confirmPassword.message}</Text>}
                  </Box>

                  <Button
                    type="submit"
                    w="full" size="md"
                    loading={isSubmitting}
                    loadingText="Saving…"
                    disabled={isSubmitting}
                    mt={1}
                    style={{
                      background: GREEN, color: WHITE,
                      borderRadius: '8px', fontWeight: 600, fontSize: '14px', height: '42px',
                    }}
                  >
                    Reset Password
                  </Button>
                </VStack>
              </form>
            </>
          )}
        </Box>
      </Flex>
    </Box>
  )
}

export default ResetPasswordPage
