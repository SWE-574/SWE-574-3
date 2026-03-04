import { useState } from 'react'
import { useNavigate, Link, Navigate } from 'react-router-dom'
import { Box, Flex, Text, Button, Input, VStack, Checkbox } from '@chakra-ui/react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FiArrowLeft, FiMail, FiLock, FiUser } from 'react-icons/fi'
import { useAuthStore } from '@/store/useAuthStore'
import { getErrorMessage } from '@/services/api'
import {
  GREEN,
  GRAY50, GRAY200, GRAY300, GRAY400, GRAY500, GRAY600, GRAY700, GRAY800,
  WHITE, RED, RED_LT,
} from '@/theme/tokens'
import { Logo } from '@/components/Logo'

const schema = z
  .object({
    first_name: z.string().min(1, 'First name is required'),
    last_name: z.string().min(1, 'Last name is required'),
    email: z.string().email('Please enter a valid email'),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Z]/, 'One uppercase letter required')
      .regex(/[a-z]/, 'One lowercase letter required')
      .regex(/[0-9]/, 'One number required'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    agreeToTerms: z.boolean().refine((v) => v === true, {
      message: 'You must agree to continue',
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type FormData = z.infer<typeof schema>

// ─── Shared field components ──────────────────────────────────────────────────

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{ fontSize: '13px', fontWeight: 500, color: GRAY700, display: 'block', marginBottom: '6px' }}
    >
      {children}
    </label>
  )
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <Text fontSize="xs" color={RED} mt="4px">{msg}</Text>
}

function InputRow({
  icon,
  children,
  hasError,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  hasError?: boolean
}) {
  return (
    <Flex
      align="center"
      border={`1px solid ${hasError ? RED : GRAY300}`}
      borderRadius="8px"
      overflow="hidden"
      bg={WHITE}
      _focusWithin={{ borderColor: GREEN, boxShadow: `0 0 0 3px ${GREEN}22` }}
      transition="border-color 0.15s, box-shadow 0.15s"
    >
      <Box px={3} color={GRAY400}>{icon}</Box>
      {children}
    </Flex>
  )
}

const RegistrationPage = () => {
  const navigate = useNavigate()
  const { register: registerUser, isLoading, isAuthenticated } = useAuthStore()
  const [apiError, setApiError] = useState('')

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { agreeToTerms: false },
  })

  const agreeToTerms = watch('agreeToTerms')
  const passwordValue = watch('password') ?? ''

  const pwChecks = {
    length:    passwordValue.length >= 8,
    uppercase: /[A-Z]/.test(passwordValue),
    lowercase: /[a-z]/.test(passwordValue),
    number:    /[0-9]/.test(passwordValue),
  }
  const pwScore = Object.values(pwChecks).filter(Boolean).length // 0-4
  const pwStrengthColor = pwScore <= 1 ? '#EF4444' : pwScore === 2 ? '#F59E0B' : pwScore === 3 ? '#F59E0B' : '#22C55E'
  const pwStrengthLabel = pwScore <= 1 ? 'Weak' : pwScore === 2 ? 'Fair' : pwScore === 3 ? 'Good' : 'Strong'

  // Guard after all hooks to satisfy Rules of Hooks
  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  const onSubmit = async (data: FormData) => {
    setApiError('')
    try {
      await registerUser({
        email: data.email,
        password: data.password,
        first_name: data.first_name,
        last_name: data.last_name,
      })
      navigate('/verify-email-sent', { state: { email: data.email } })
    } catch (err: unknown) {
      setApiError(getErrorMessage(err, 'Registration failed. Please try again.'))
    }
  }

  return (
    <Box minH="100vh" bg={GRAY50}>
      {/* ── Header ── */}
      <Box as="header" bg={WHITE} borderBottom={`1px solid ${GRAY200}`} boxShadow="0 1px 4px rgba(0,0,0,0.06)">
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
            display="flex" alignItems="center" gap="6px"
            fontSize="sm" color={GRAY600} fontWeight={500}
            px={3} py={2} borderRadius="8px"
            _hover={{ bg: GRAY50, color: GRAY800 }}
            transition="all 0.15s"
          >
            <FiArrowLeft size={14} />
            Back to Home
          </Box>
        </Flex>
      </Box>

      {/* ── Form ── */}
      <Flex justify="center" px={4} py={10}>
        <Box
          w="full"
          maxW="460px"
          bg={WHITE}
          borderRadius="16px"
          border={`1px solid ${GRAY200}`}
          boxShadow="0 4px 24px rgba(0,0,0,0.08)"
          p={8}
        >
          {/* Heading */}
          <VStack gap={1} mb={6} textAlign="center">
            <Box mb={2}><Logo size={40} /></Box>
            <Text fontSize="xl" fontWeight="700" color={GRAY800}>Create your account</Text>
            <Text fontSize="sm" color={GRAY500}>Join The Hive and start exchanging skills</Text>
          </VStack>

          {/* API error */}
          {apiError && (
            <Box mb={5} p={3} bg={RED_LT} border={`1px solid ${RED}33`} borderRadius="8px">
              <Text fontSize="sm" color={RED}>{apiError}</Text>
            </Box>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <VStack gap={4}>
              {/* Name row */}
              <Flex gap={3} w="full">
                <Box flex={1}>
                  <FieldLabel htmlFor="first_name">First name</FieldLabel>
                  <InputRow icon={<FiUser size={14} />} hasError={!!errors.first_name}>
                    <Input
                      id="first_name"
                      placeholder="John"
                      {...register('first_name')}
                      disabled={isLoading}
                      autoComplete="given-name"
                      border="none" bg="transparent"
                      _focus={{ boxShadow: 'none' }}
                      fontSize="sm" flex={1}
                    />
                  </InputRow>
                  <FieldError msg={errors.first_name?.message} />
                </Box>
                <Box flex={1}>
                  <FieldLabel htmlFor="last_name">Last name</FieldLabel>
                  <InputRow icon={<FiUser size={14} />} hasError={!!errors.last_name}>
                    <Input
                      id="last_name"
                      placeholder="Doe"
                      {...register('last_name')}
                      disabled={isLoading}
                      autoComplete="family-name"
                      border="none" bg="transparent"
                      _focus={{ boxShadow: 'none' }}
                      fontSize="sm" flex={1}
                    />
                  </InputRow>
                  <FieldError msg={errors.last_name?.message} />
                </Box>
              </Flex>

              {/* Email */}
              <Box w="full">
                <FieldLabel htmlFor="email">Email address</FieldLabel>
                <InputRow icon={<FiMail size={14} />} hasError={!!errors.email}>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    {...register('email')}
                    disabled={isLoading}
                    autoComplete="email"
                    border="none" bg="transparent"
                    _focus={{ boxShadow: 'none' }}
                    fontSize="sm" flex={1}
                  />
                </InputRow>
                <FieldError msg={errors.email?.message} />
              </Box>

              {/* Password */}
              <Box w="full">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <InputRow icon={<FiLock size={14} />} hasError={!!errors.password}>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Min. 8 chars, uppercase & number"
                    {...register('password')}
                    disabled={isLoading}
                    autoComplete="new-password"
                    border="none" bg="transparent"
                    _focus={{ boxShadow: 'none' }}
                    fontSize="sm" flex={1}
                  />
                </InputRow>

                {/* Password strength meter — only while typing */}
                {passwordValue.length > 0 && (
                  <Box mt={2}>
                    {/* Segmented bar */}
                    <Flex gap={1} mb={1}>
                      {[1, 2, 3, 4].map((i) => (
                        <Box
                          key={i}
                          flex={1} h="3px" borderRadius="full"
                          bg={i <= pwScore ? pwStrengthColor : GRAY200}
                          transition="background 0.2s"
                        />
                      ))}
                    </Flex>
                    <Flex justify="space-between" align="center">
                      <Text fontSize="10px" fontWeight={600} style={{ color: pwStrengthColor }}>
                        {pwStrengthLabel}
                      </Text>
                    </Flex>

                    {/* Requirement checklist */}
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
                            flexShrink={0}
                            transition="background 0.2s"
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

                <FieldError msg={errors.password?.message} />
              </Box>

              {/* Confirm password */}
              <Box w="full">
                <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
                <InputRow icon={<FiLock size={14} />} hasError={!!errors.confirmPassword}>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Repeat your password"
                    {...register('confirmPassword')}
                    disabled={isLoading}
                    autoComplete="new-password"
                    border="none" bg="transparent"
                    _focus={{ boxShadow: 'none' }}
                    fontSize="sm" flex={1}
                  />
                </InputRow>
                <FieldError msg={errors.confirmPassword?.message} />
              </Box>

              {/* Terms */}
              <Box w="full">
                <Flex align="flex-start" gap={2}>
                  <Controller
                    name="agreeToTerms"
                    control={control}
                    render={({ field }) => (
                      <Checkbox.Root
                        id="agreeToTerms"
                        checked={field.value}
                        onCheckedChange={(e) => field.onChange(!!e.checked)}
                        disabled={isLoading}
                        colorPalette="green"
                        mt="2px"
                      >
                        <Checkbox.HiddenInput />
                        <Checkbox.Control />
                      </Checkbox.Root>
                    )}
                  />
                  <label
                    htmlFor="agreeToTerms"
                    style={{ fontSize: '13px', color: GRAY600, cursor: 'pointer', lineHeight: '1.5' }}
                  >
                    I agree to the{' '}
                    <span style={{ color: GREEN, fontWeight: 600 }}>Terms of Service</span>
                    {' '}and{' '}
                    <span style={{ color: GREEN, fontWeight: 600 }}>Privacy Policy</span>
                  </label>
                </Flex>
                <FieldError msg={errors.agreeToTerms?.message} />
              </Box>

              {/* Submit */}
              <Button
                type="submit"
                w="full"
                size="md"
                loading={isLoading}
                loadingText="Creating account…"
                disabled={isLoading || !agreeToTerms}
                mt={1}
                style={{
                  background: GREEN,
                  color: WHITE,
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '14px',
                  height: '42px',
                }}
              >
                Create Account
              </Button>
            </VStack>
          </form>

          <Flex align="center" my={5} gap={3}>
            <Box flex={1} h="1px" bg={GRAY200} />
            <Text fontSize="xs" color={GRAY400}>or</Text>
            <Box flex={1} h="1px" bg={GRAY200} />
          </Flex>

          <Text textAlign="center" fontSize="sm" color={GRAY500}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: GREEN, fontWeight: 600 }}>Sign in</Link>
          </Text>
        </Box>
      </Flex>
    </Box>
  )
}

export default RegistrationPage
