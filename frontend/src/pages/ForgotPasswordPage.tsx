import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Box, Flex, Text, Button, Input, VStack } from '@chakra-ui/react'
import { FiArrowLeft, FiMail, FiCheckCircle } from 'react-icons/fi'
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

const schema = z.object({
  email: z.string().email('Please enter a valid email address'),
})
type FormData = z.infer<typeof schema>

const ForgotPasswordPage = () => {
  const [sent, setSent] = useState(false)
  const [apiError, setApiError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { register, handleSubmit, formState: { errors }, getValues } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setApiError('')
    setIsSubmitting(true)
    try {
      await authAPI.forgotPassword(data.email)
      setSent(true)
    } catch (err) {
      setApiError(getErrorMessage(err, 'Something went wrong. Please try again.'))
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
          {sent ? (
            /* ── Success state ── */
            <VStack gap={4} textAlign="center">
              <Box
                w="64px" h="64px" borderRadius="full"
                bg={GREEN_LT} border={`2px solid ${GREEN_MD}`}
                display="flex" alignItems="center" justifyContent="center"
                mx="auto"
              >
                <FiCheckCircle size={28} color={GREEN} />
              </Box>
              <VStack gap={1}>
                <Text fontSize="lg" fontWeight="700" color={GRAY800}>Check your email</Text>
                <Text fontSize="sm" color={GRAY500} maxW="300px">
                  If <strong style={{ color: GRAY700 }}>{getValues('email')}</strong> is registered,
                  you'll receive a reset link shortly.
                </Text>
              </VStack>
              <Text fontSize="xs" color={GRAY400}>
                Didn't get it? Check your spam folder or{' '}
                <Box
                  as="button"
                  onClick={() => setSent(false)}
                  style={{ color: GREEN, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  try again
                </Box>
                .
              </Text>
              <Link to="/login" style={{ width: '100%' }}>
                <Button
                  w="full" size="md" variant="outline" mt={2}
                  style={{
                    borderRadius: '8px', borderColor: GRAY200,
                    color: GRAY700, fontWeight: 600, fontSize: '14px',
                  }}
                >
                  Back to Login
                </Button>
              </Link>
            </VStack>
          ) : (
            /* ── Form state ── */
            <>
              <VStack gap={1} mb={6} textAlign="center">
                <Box mb={2}><Logo size={40} /></Box>
                <Text fontSize="xl" fontWeight="700" color={GRAY800}>Forgot your password?</Text>
                <Text fontSize="sm" color={GRAY500}>
                  Enter your email and we'll send you a reset link.
                </Text>
              </VStack>

              {apiError && (
                <Box mb={5} p={3} bg={RED_LT} border={`1px solid ${RED}33`} borderRadius="8px">
                  <Text fontSize="sm" color={RED}>{apiError}</Text>
                </Box>
              )}

              <form onSubmit={handleSubmit(onSubmit)} noValidate>
                <VStack gap={4}>
                  <Box w="full">
                    <label htmlFor="email" style={{ fontSize: '13px', fontWeight: 500, color: GRAY700, display: 'block', marginBottom: '6px' }}>
                      Email address
                    </label>
                    <Flex
                      align="center"
                      border={`1px solid ${errors.email ? RED : GRAY300}`}
                      borderRadius="8px" overflow="hidden" bg={WHITE}
                      _focusWithin={{ borderColor: GREEN, boxShadow: `0 0 0 3px ${GREEN}22` }}
                      transition="border-color 0.15s, box-shadow 0.15s"
                    >
                      <Box px={3} color={GRAY400}><FiMail size={15} /></Box>
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        {...register('email')}
                        disabled={isSubmitting}
                        autoComplete="email"
                        border="none" bg="transparent"
                        _focus={{ boxShadow: 'none' }}
                        fontSize="sm" flex={1}
                      />
                    </Flex>
                    {errors.email && <Text fontSize="xs" color={RED} mt="4px">{errors.email.message}</Text>}
                  </Box>

                  <Button
                    type="submit"
                    w="full" size="md"
                    loading={isSubmitting}
                    loadingText="Sending…"
                    disabled={isSubmitting}
                    style={{
                      background: GREEN, color: WHITE,
                      borderRadius: '8px', fontWeight: 600, fontSize: '14px', height: '42px',
                    }}
                  >
                    Send Reset Link
                  </Button>
                </VStack>
              </form>

              <Flex align="center" my={5} gap={3}>
                <Box flex={1} h="1px" bg={GRAY200} />
                <Text fontSize="xs" color={GRAY400}>or</Text>
                <Box flex={1} h="1px" bg={GRAY200} />
              </Flex>

              <Text textAlign="center" fontSize="sm" color={GRAY500}>
                Remember your password?{' '}
                <Link to="/login" style={{ color: GREEN, fontWeight: 600 }}>Sign in</Link>
              </Text>
            </>
          )}
        </Box>
      </Flex>
    </Box>
  )
}

export default ForgotPasswordPage
