import { useEffect, useState } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { FiMail, FiCheckCircle, FiX } from 'react-icons/fi'
import { toast } from 'sonner'
import { authAPI } from '@/services/authAPI'
import {
  GREEN, GREEN_LT, AMBER, AMBER_LT,
  GRAY50, GRAY200, GRAY500, GRAY700, GRAY800, WHITE,
} from '@/theme/tokens'

/* ────────────────────────────────────────────────────────────────────────────
 * VerificationRequiredModal
 * ────────────────────────────────────────────────────────────────────────────
 * Lightweight modal shown when an unverified user tries to perform an action
 * that requires a verified email — e.g. requesting an Offer, offering help on
 * a Need, or RSVP-ing to an Event from the service detail page.
 *
 * Mirrors the copy and CTA of `RequireVerifiedEmail` (the route-level guard
 * for /post-offer, /post-need and /post-event), so the user gets the same
 * resolution path no matter where the gate fires.
 *
 * Backend remains the source of truth: even if this modal is bypassed, the
 * corresponding API endpoints reject unverified callers with 403 +
 * `code=EMAIL_NOT_VERIFIED`.
 * ──────────────────────────────────────────────────────────────────────── */

interface VerificationRequiredModalProps {
  isOpen: boolean
  onClose: () => void
  /** Friendly action verb for the heading, e.g. "request this service". */
  actionLabel: string
  /** The email the verification link will be sent to. */
  email?: string
}

export default function VerificationRequiredModal({
  isOpen,
  onClose,
  actionLabel,
  email,
}: VerificationRequiredModalProps) {
  const [isSending, setIsSending] = useState(false)
  const [sent, setSent] = useState(false)

  // Reset transient state every time the modal is closed so reopening starts
  // from the default "Resend verification email" CTA.
  useEffect(() => {
    if (!isOpen) {
      setIsSending(false)
      setSent(false)
    }
  }, [isOpen])

  // Lock background scroll while the modal is open.
  useEffect(() => {
    if (!isOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleResend = async () => {
    setIsSending(true)
    try {
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
      position="fixed" inset={0}
      zIndex={2000}
      display="flex"
      alignItems="center"
      justifyContent="center"
      px={4}
      data-testid="verification-required-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="verification-required-title"
      onClick={(e) => {
        // Close when clicking the backdrop (outside the card).
        if (e.target === e.currentTarget) onClose()
      }}
      style={{ background: 'rgba(15, 23, 42, 0.55)' }}
    >
      <Box
        bg={WHITE}
        border={`1px solid ${GRAY200}`}
        borderRadius="20px"
        boxShadow="0 12px 40px rgba(0,0,0,0.18)"
        maxW="480px"
        w="full"
        px={{ base: 6, md: 8 }}
        py={{ base: 7, md: 8 }}
        position="relative"
        textAlign="center"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          data-testid="verification-required-close"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'transparent',
            border: 'none',
            color: GRAY500,
            cursor: 'pointer',
            padding: 6,
            borderRadius: 8,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FiX size={20} />
        </button>

        <Flex
          mx="auto" mb={4}
          w="56px" h="56px" borderRadius="full"
          align="center" justify="center"
          bg={AMBER_LT} color={AMBER}
        >
          <FiMail size={24} />
        </Flex>

        <Text
          id="verification-required-title"
          fontSize="20px" fontWeight={800} color={GRAY800} mb={2}
        >
          Verify your email to {actionLabel}
        </Text>

        <Text fontSize="14px" color={GRAY500} lineHeight="1.6" mb={5}>
          For the safety of the community, you need a verified email address
          before you can join or request services. Check your inbox for the
          verification link, or request a new one.
        </Text>

        {email && (
          <Text fontSize="13px" color={GRAY700} mb={5}>
            We&apos;ll send the link to{' '}
            <strong style={{ color: GRAY800 }}>{email}</strong>.
          </Text>
        )}

        <Flex direction={{ base: 'column', sm: 'row' }} gap={3} justify="center">
          <button
            type="button"
            onClick={handleResend}
            disabled={isSending || sent}
            data-testid="verification-required-resend"
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

          <button
            type="button"
            onClick={onClose}
            data-testid="verification-required-cancel"
            style={{
              padding: '11px 18px',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 600,
              color: GRAY700,
              background: GRAY50,
              border: `1px solid ${GRAY200}`,
              cursor: 'pointer',
            }}
          >
            Not now
          </button>
        </Flex>
      </Box>
    </Box>
  )
}
