import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Flex, Text } from '@chakra-ui/react'
import { FiMail, FiCheckCircle } from 'react-icons/fi'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/useAuthStore'
import { authAPI } from '@/services/authAPI'
import {
  GREEN, GREEN_LT, AMBER, AMBER_LT,
  GRAY50, GRAY200, GRAY500, GRAY700, GRAY800, WHITE,
} from '@/theme/tokens'

/* ────────────────────────────────────────────────────────────────────────────
 * RequireVerifiedEmail
 * ────────────────────────────────────────────────────────────────────────────
 * Guards a route from users whose email address has not yet been verified.
 *
 * The backend is the source of truth for this restriction (POST /api/services/
 * rejects unverified users with code=EMAIL_NOT_VERIFIED for type='Offer'),
 * but blocking before submit gives clearer UX:
 * - explains *why* the action is unavailable
 * - offers a one-click path to resend the verification email
 * - links back to the dashboard so the user is not stuck on the page
 *
 * Behaviour mirrors EmailVerificationBanner in App.tsx: only block when
 * `user.is_verified === false` is explicitly known. While the user payload
 * is still loading (null/undefined), render children — the backend will
 * still reject any premature submit safely.
 * ──────────────────────────────────────────────────────────────────────── */

interface RequireVerifiedEmailProps {
  children: React.ReactNode
  /**
   * Friendly action name shown in the message — e.g. "post an Offer".
   * Defaults to a generic phrasing.
   */
  actionLabel?: string
}

export default function RequireVerifiedEmail({
  children,
  actionLabel = 'continue',
}: RequireVerifiedEmailProps) {
  const user = useAuthStore((s) => s.user)
  const [isSending, setIsSending] = useState(false)
  const [sent, setSent] = useState(false)

  // Loading or unknown verification state → defer to backend.
  if (!user || user.is_verified !== false) {
    return <>{children}</>
  }

  const handleResend = async () => {
    setIsSending(true)
    try {
      // Authenticated flow: server already knows which email to send to.
      await authAPI.sendVerification()
      setSent(true)
      toast.success('Verification email sent. Check your inbox.')
    } catch {
      toast.error('Could not send the email. Please try again in a moment.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Box
      bg={GRAY50}
      minH="calc(100vh - 64px)"
      display="flex"
      alignItems="center"
      justifyContent="center"
      px={{ base: 4, md: 8 }}
      py={{ base: 6, md: 10 }}
      data-testid="require-verified-email"
    >
      <Box
        bg={WHITE}
        border={`1px solid ${GRAY200}`}
        borderRadius="20px"
        boxShadow="0 8px 32px rgba(0,0,0,0.08)"
        maxW="520px"
        w="full"
        px={{ base: 6, md: 10 }}
        py={{ base: 8, md: 10 }}
        textAlign="center"
      >
        <Flex
          mx="auto" mb={4}
          w="64px" h="64px" borderRadius="full"
          align="center" justify="center"
          bg={AMBER_LT} color={AMBER}
        >
          <FiMail size={28} />
        </Flex>

        <Text fontSize="22px" fontWeight={800} color={GRAY800} mb={2}>
          Verify your email to {actionLabel}
        </Text>

        <Text fontSize="14px" color={GRAY500} lineHeight="1.6" mb={6}>
          For the safety of the community, you need a verified email address
          before you can publish offers. Check your inbox for the verification
          link we already sent, or request a new one below.
        </Text>

        {user.email && (
          <Text fontSize="13px" color={GRAY700} mb={6}>
            We&apos;ll send the link to{' '}
            <strong style={{ color: GRAY800 }}>{user.email}</strong>.
          </Text>
        )}

        <Flex direction={{ base: 'column', sm: 'row' }} gap={3} justify="center">
          <button
            type="button"
            onClick={handleResend}
            disabled={isSending || sent}
            data-testid="resend-verification-button"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '11px 18px',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 700,
              color: sent ? GREEN : WHITE,
              background: sent ? GREEN_LT : GREEN,
              border: sent ? `1px solid ${GREEN}` : 'none',
              cursor: isSending || sent ? 'default' : 'pointer',
              opacity: isSending ? 0.7 : 1,
              transition: 'opacity 0.15s, background 0.15s',
            }}
          >
            {sent ? (
              <>
                <FiCheckCircle size={15} />
                Email sent
              </>
            ) : isSending ? (
              'Sending…'
            ) : (
              'Resend verification email'
            )}
          </button>

          <RouterLink
            to="/dashboard"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '11px 18px',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 600,
              color: GRAY700,
              background: GRAY50,
              border: `1px solid ${GRAY200}`,
              textDecoration: 'none',
            }}
          >
            Back to dashboard
          </RouterLink>
        </Flex>
      </Box>
    </Box>
  )
}
