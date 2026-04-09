import { useState } from 'react'
import { Box, Flex, Input, Text, Textarea } from '@chakra-ui/react'
import { FiAlertCircle, FiAlertTriangle, FiBarChart2 } from 'react-icons/fi'
import { toast } from 'sonner'
import { adminAPI } from '@/services/adminAPI'
import { getErrorMessage } from '@/services/api'
import {
  AMBER, AMBER_LT,
  BLUE, BLUE_LT,
  GRAY50, GRAY100, GRAY200, GRAY400, GRAY500, GRAY600, GRAY800,
  GREEN, GREEN_LT,
  RED, RED_LT,
  WHITE,
} from '@/theme/tokens'

// ── Layout primitives ─────────────────────────────────────────────────────────

export const ModalBackdrop = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <Box position="fixed" inset={0} zIndex={3000} display="flex" alignItems="center" justifyContent="center" p={4}
    style={{ background: 'rgba(15,23,42,0.48)', backdropFilter: 'blur(2px)' }} onClick={onClick}>
    {children}
  </Box>
)

export const ModalCard = ({ maxW = '420px', children, onClick }: { maxW?: string; children: React.ReactNode; onClick: (e: React.MouseEvent) => void }) => (
  <Box bg={WHITE} borderRadius="16px" w="100%" maxW={maxW} border={`1px solid ${GRAY200}`}
    style={{ boxShadow: '0 20px 48px rgba(0,0,0,0.18)' }} onClick={onClick}>
    {children}
  </Box>
)

export const ModalHeader = ({ icon, iconBg, iconColor, title, subtitle }: { icon: React.ReactNode; iconBg: string; iconColor: string; title: string; subtitle?: string }) => (
  <Flex align="center" gap="12px" px={5} pt={5} pb={4} borderBottom={`1px solid ${GRAY100}`}>
    <Box w="34px" h="34px" borderRadius="10px" display="flex" alignItems="center" justifyContent="center" flexShrink={0}
      style={{ background: iconBg, color: iconColor }}>
      {icon}
    </Box>
    <Box>
      <Text fontSize="15px" fontWeight={700} color={GRAY800} lineHeight={1.2}>{title}</Text>
      {subtitle && <Text fontSize="12px" color={GRAY400} mt="2px">{subtitle}</Text>}
    </Box>
  </Flex>
)

export const ModalFooter = ({ onClose, confirmLabel, accent, accentLt, onConfirm, loading, disabled }: {
  onClose: () => void; confirmLabel: string; accent: string; accentLt: string
  onConfirm: () => void; loading: boolean; disabled?: boolean
}) => (
  <Flex px={5} py={4} gap={3} justify="flex-end" borderTop={`1px solid ${GRAY100}`}>
    <Box as="button" px="16px" py="8px" borderRadius="9px" fontSize="13px" fontWeight={500}
      style={{ background: GRAY100, color: GRAY600, border: `1px solid ${GRAY200}`, cursor: 'pointer' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = GRAY200 }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = GRAY100 }}
      onClick={onClose}>Cancel</Box>
    <Box as="button" px="18px" py="8px" borderRadius="9px" fontSize="13px" fontWeight={600}
      style={{ background: accentLt, color: accent, border: `1px solid ${accent}40`, cursor: (loading || disabled) ? 'not-allowed' : 'pointer', opacity: (loading || disabled) ? 0.6 : 1, transition: 'filter 0.12s' }}
      onMouseEnter={(e) => { if (!loading && !disabled) (e.currentTarget as HTMLElement).style.filter = 'brightness(0.9)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = 'none' }}
      onClick={() => { if (!loading && !disabled) onConfirm() }}>
      {loading ? 'Working…' : confirmLabel}
    </Box>
  </Flex>
)

export const ModalFieldLabel = ({ children }: { children: React.ReactNode }) => (
  <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb="6px">{children}</Text>
)

// ── AdminConfirmModal ─────────────────────────────────────────────────────────

export interface ConfirmModalProps {
  isOpen: boolean; title: string; description: string; confirmLabel: string
  accent: string; accentLt: string; onConfirm: () => void; onClose: () => void; loading: boolean
}

export function AdminConfirmModal({ isOpen, title, description, confirmLabel, accent, accentLt, onConfirm, onClose, loading }: ConfirmModalProps) {
  if (!isOpen) return null
  const isDestructive = accent === RED
  return (
    <ModalBackdrop onClick={onClose}>
      <ModalCard onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          icon={isDestructive ? <FiAlertTriangle size={15} /> : <FiAlertCircle size={15} />}
          iconBg={accentLt} iconColor={accent}
          title={title} />
        <Box px={5} py={4}>
          <Text fontSize="13px" color={GRAY500} lineHeight={1.6}>{description}</Text>
        </Box>
        <ModalFooter onClose={onClose} confirmLabel={confirmLabel} accent={accent} accentLt={accentLt} onConfirm={onConfirm} loading={loading} />
      </ModalCard>
    </ModalBackdrop>
  )
}

// ── AdminWarnModal ────────────────────────────────────────────────────────────

export interface WarnModalProps {
  isOpen: boolean; userName: string; onConfirm: (msg: string) => void; onClose: () => void; loading: boolean
}

export function AdminWarnModal({ isOpen, userName, onConfirm, onClose, loading }: WarnModalProps) {
  const [message, setMessage] = useState('Please follow community guidelines.')
  if (!isOpen) return null
  const canSubmit = !loading && message.trim().length > 0
  return (
    <ModalBackdrop onClick={onClose}>
      <ModalCard maxW="460px" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          icon={<FiAlertCircle size={15} />} iconBg={BLUE_LT} iconColor={BLUE}
          title={`Warn ${userName}`} subtitle="Message will be sent as a warning notification" />
        <Box px={5} py={4}>
          <ModalFieldLabel>Warning message</ModalFieldLabel>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)}
            rows={4} bg={GRAY50} borderColor={GRAY200} borderRadius="10px" fontSize="13px"
            placeholder="Describe the violation and expected behaviour…" />
          <Text fontSize="11px" color={GRAY400} mt={2}>{message.trim().length} chars</Text>
        </Box>
        <ModalFooter onClose={onClose} confirmLabel="Send Warning" accent={BLUE} accentLt={BLUE_LT}
          onConfirm={() => { if (canSubmit) onConfirm(message.trim()) }} loading={loading} disabled={!canSubmit} />
      </ModalCard>
    </ModalBackdrop>
  )
}

// ── AdminKarmaModal ───────────────────────────────────────────────────────────
// Shows current karma and lets the actor apply a positive or negative adjustment.

export interface KarmaModalProps {
  isOpen: boolean
  userName: string
  currentKarma: number
  userId: string
  onDone: () => void
  onClose: () => void
}

export function AdminKarmaModal({ isOpen, userName, currentKarma, userId, onDone, onClose }: KarmaModalProps) {
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const num = Number.parseInt(value, 10)
  const isValid = !Number.isNaN(num) && value.trim() !== '' && num !== 0

  const submit = async () => {
    if (!isValid) return
    setLoading(true)
    try {
      await adminAPI.adjustKarma(userId, num)
      toast.success(`Karma adjusted by ${num > 0 ? '+' : ''}${num}`)
      onDone()
    } catch (e) {
      toast.error(getErrorMessage(e) ?? 'Failed to adjust karma')
    } finally {
      setLoading(false)
      setValue('')
    }
  }

  return (
    <ModalBackdrop onClick={onClose}>
      <ModalCard maxW="380px" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          icon={<FiBarChart2 size={15} />} iconBg={AMBER_LT} iconColor={AMBER}
          title="Adjust Karma" subtitle={`${userName} · current: ${currentKarma}`} />
        <Box px={5} py={4}>
          <ModalFieldLabel>Amount (use negative to subtract)</ModalFieldLabel>
          <Input value={value} onChange={(e) => setValue(e.target.value)} type="number"
            placeholder="e.g. +10 or -5"
            bg={GRAY50} borderColor={GRAY200} borderRadius="10px" fontSize="14px" />
          {isValid && (
            <Flex align="center" gap="6px" mt={3} px={3} py="8px" borderRadius="8px"
              style={{ background: num > 0 ? GREEN_LT : RED_LT, border: `1px solid ${(num > 0 ? GREEN : RED)}30` }}>
              <Box w="6px" h="6px" borderRadius="full" style={{ background: num > 0 ? GREEN : RED, flexShrink: 0 }} />
              <Text fontSize="12px" fontWeight={600} color={num > 0 ? GREEN : RED}>
                {num > 0 ? `+${num}` : num} karma will be applied to {userName}
              </Text>
            </Flex>
          )}
        </Box>
        <ModalFooter onClose={onClose} confirmLabel="Apply" accent={AMBER} accentLt={AMBER_LT}
          onConfirm={submit} loading={loading} disabled={!isValid} />
      </ModalCard>
    </ModalBackdrop>
  )
}
