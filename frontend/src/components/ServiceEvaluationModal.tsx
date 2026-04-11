import { useMemo, useState } from 'react'
import { Box, Flex, SimpleGrid, Text } from '@chakra-ui/react'
import { FiAlertTriangle, FiCamera, FiCheckCircle, FiClock, FiFlag, FiSlash, FiStar, FiUsers, FiX } from 'react-icons/fi'
import { toast } from 'sonner'
import { reputationAPI } from '@/services/reputationAPI'

import {
  GREEN,
  GREEN_LT,
  RED,
  RED_LT,
  GRAY100,
  GRAY200,
  GRAY400,
  GRAY700,
  GRAY800,
  WHITE,
} from '@/theme/tokens'

interface Props {
  isOpen: boolean
  onClose: () => void
  handshakeId: string
  counterpartName: string
  isEventEvaluation?: boolean
  alreadyReviewed?: boolean
  onSubmitted?: () => Promise<void> | void
}

interface TraitOption {
  key: string
  label: string
  tone: 'positive' | 'negative'
  icon: 'clock' | 'users' | 'star' | 'flag' | 'alert' | 'slash'
}

const SERVICE_TRAITS: TraitOption[] = [
  { key: 'punctual', label: 'Punctual', tone: 'positive', icon: 'clock' },
  { key: 'helpful', label: 'Helpful', tone: 'positive', icon: 'users' },
  { key: 'kindness', label: 'Kind', tone: 'positive', icon: 'star' },
  { key: 'is_late', label: 'Late', tone: 'negative', icon: 'slash' },
  { key: 'is_unhelpful', label: 'Unhelpful', tone: 'negative', icon: 'flag' },
  { key: 'is_rude', label: 'Rude', tone: 'negative', icon: 'alert' },
]

const EVENT_TRAITS: TraitOption[] = [
  { key: 'well_organized', label: 'Well Organized', tone: 'positive', icon: 'star' },
  { key: 'engaging', label: 'Engaging', tone: 'positive', icon: 'users' },
  { key: 'welcoming', label: 'Welcoming', tone: 'positive', icon: 'clock' },
  { key: 'disorganized', label: 'Disorganized', tone: 'negative', icon: 'slash' },
  { key: 'boring', label: 'Boring', tone: 'negative', icon: 'flag' },
  { key: 'unwelcoming', label: 'Unwelcoming', tone: 'negative', icon: 'alert' },
]

function TraitIcon({ icon, color }: { icon: TraitOption['icon']; color: string }) {
  if (icon === 'clock') return <FiClock size={14} color={color} />
  if (icon === 'users') return <FiUsers size={14} color={color} />
  if (icon === 'star') return <FiStar size={14} color={color} />
  if (icon === 'flag') return <FiFlag size={14} color={color} />
  if (icon === 'slash') return <FiSlash size={14} color={color} />
  return <FiAlertTriangle size={14} color={color} />
}

export default function ServiceEvaluationModal({
  isOpen,
  onClose,
  handshakeId,
  counterpartName,
  isEventEvaluation = false,
  alreadyReviewed = false,
  onSubmitted,
}: Props) {
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [comment, setComment] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const traitSet = isEventEvaluation ? EVENT_TRAITS : SERVICE_TRAITS

  const selectedCount = useMemo(
    () => Object.values(selected).filter(Boolean).length,
    [selected],
  )
  const positiveTraits = useMemo(() => traitSet.filter((t) => t.tone === 'positive'), [traitSet])
  const negativeTraits = useMemo(() => traitSet.filter((t) => t.tone === 'negative'), [traitSet])

  if (!isOpen) return null

  const toggle = (key: string) => {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const reset = () => {
    setSelected({})
    setComment('')
    setImages([])
    setImagePreviews([])
  }

  const handleImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || images.length >= 3) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setImagePreviews((p) => [...p, ev.target?.result as string])
    }
    reader.readAsDataURL(file)
    setImages((prev) => [...prev, file])
    e.target.value = ''
  }

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx))
    setImagePreviews((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleClose = () => {
    if (!submitting) {
      reset()
      onClose()
    }
  }

  const handleSubmit = async () => {
    if (submitting || alreadyReviewed) return
    if (selectedCount === 0) {
      toast.error('Please select at least one trait.')
      return
    }

    setSubmitting(true)
    try {
      if (isEventEvaluation) {
        await reputationAPI.submitCombinedEvent({
          handshake_id: handshakeId,
          positive: {
            well_organized: Boolean(selected.well_organized),
            engaging: Boolean(selected.engaging),
            welcoming: Boolean(selected.welcoming),
          },
          negative: {
            disorganized: Boolean(selected.disorganized),
            boring: Boolean(selected.boring),
            unwelcoming: Boolean(selected.unwelcoming),
          },
          comment,
        })
      } else {
        await reputationAPI.submitCombined({
          handshake_id: handshakeId,
          positive: {
            punctual: Boolean(selected.punctual),
            helpful: Boolean(selected.helpful),
            kindness: Boolean(selected.kindness),
          },
          negative: {
            is_late: Boolean(selected.is_late),
            is_unhelpful: Boolean(selected.is_unhelpful),
            is_rude: Boolean(selected.is_rude),
          },
          comment,
        })
      }

      toast.success('Evaluation submitted. Thank you for your feedback!')
      // Attach images after the main evaluation — a failure here should not block the flow.
      if (images.length > 0) {
        try {
          await reputationAPI.attachReviewImages(handshakeId, images)
        } catch {
          toast.warning('Evaluation saved, but photo upload failed. You can re-upload photos later.')
        }
      }
      await onSubmitted?.()
      reset()
      onClose()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to submit evaluation.'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box
      position="fixed"
      inset={0}
      zIndex={230}
      bg="rgba(0,0,0,0.58)"
      display="flex"
      alignItems="center"
      justifyContent="center"
      p={4}
      onClick={handleClose}
    >
      <Box
        bg={WHITE}
        borderRadius="20px"
        w="100%"
        maxW={{ base: '96vw', md: '560px' }}
        maxH={{ base: '92vh', md: 'auto' }}
        overflowY={{ base: 'auto', md: 'visible' }}
        boxShadow="0 20px 60px rgba(0,0,0,0.2)"
        onClick={(e) => e.stopPropagation()}
      >
        <Flex align="center" justify="space-between" px={{ base: 4, md: 6 }} py={{ base: 4, md: 5 }} borderBottom={`1px solid ${GRAY100}`}>
          <Box>
            <Text fontSize="18px" fontWeight={800} color={GRAY800}>{isEventEvaluation ? 'Evaluate Organizer' : 'Evaluate Exchange'}</Text>
            <Text fontSize="12px" color={GRAY400} mt="2px">
              Share feedback for {counterpartName}.
            </Text>
          </Box>
          <Box
            as="button"
            onClick={handleClose}
            aria-label="Close"
            w="32px"
            h="32px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            borderRadius="8px"
            bg={GRAY100}
            color={GRAY700}
            style={{ border: 'none', cursor: submitting ? 'not-allowed' : 'pointer' }}
          >
            <FiX />
          </Box>
        </Flex>

        <Box px={{ base: 4, md: 6 }} py={{ base: 4, md: 5 }}>
          {alreadyReviewed ? (
            <Box bg={GREEN_LT} border={`1px solid ${GREEN}40`} borderRadius="12px" p={4}>
              <Flex align="center" gap={2}>
                <FiCheckCircle color={GREEN} />
                <Text fontSize="13px" color={GREEN} fontWeight={700}>You already reviewed this exchange.</Text>
              </Flex>
            </Box>
          ) : (
            <>
              <Text fontSize="12px" fontWeight={700} color={GRAY700} mb={3}>
                Select trait(s)
              </Text>
              <Box mb={4}>
                <Text fontSize="12px" fontWeight={700} color={GREEN} mb={2}>Nice Traits</Text>
                <SimpleGrid columns={{ base: 1, md: 3 }} gap={2} mb={3}>
                  {positiveTraits.map((trait) => {
                    const active = Boolean(selected[trait.key])
                    const activeBg = GREEN_LT
                    const activeColor = GREEN
                    const iconColor = active ? activeColor : GRAY400
                    return (
                      <Box
                        key={trait.key}
                        as="button"
                        textAlign="left"
                        px={4}
                        py="10px"
                        borderRadius="10px"
                        border={`1px solid ${active ? activeColor : GRAY200}`}
                        bg={active ? activeBg : WHITE}
                        color={active ? activeColor : GRAY700}
                        fontSize="13px"
                        fontWeight={700}
                        onClick={() => toggle(trait.key)}
                        style={{ cursor: 'pointer' }}
                      >
                        <Flex align="center" justify="center" gap={2}>
                          <TraitIcon icon={trait.icon} color={iconColor} />
                          <Text>{trait.label}</Text>
                        </Flex>
                      </Box>
                    )
                  })}
                </SimpleGrid>

                <Text fontSize="12px" fontWeight={700} color={RED} mb={2}>Needs Improvement</Text>
                <SimpleGrid columns={{ base: 1, md: 3 }} gap={2}>
                  {negativeTraits.map((trait) => {
                    const active = Boolean(selected[trait.key])
                    const activeBg = RED_LT
                    const activeColor = RED
                    const iconColor = active ? activeColor : GRAY400
                    return (
                      <Box
                        key={trait.key}
                        as="button"
                        textAlign="left"
                        px={4}
                        py="10px"
                        borderRadius="10px"
                        border={`1px solid ${active ? activeColor : GRAY200}`}
                        bg={active ? activeBg : WHITE}
                        color={active ? activeColor : GRAY700}
                        fontSize="13px"
                        fontWeight={700}
                        onClick={() => toggle(trait.key)}
                        style={{ cursor: 'pointer' }}
                      >
                        <Flex align="center" justify="center" gap={2}>
                          <TraitIcon icon={trait.icon} color={iconColor} />
                          <Text>{trait.label}</Text>
                        </Flex>
                      </Box>
                    )
                  })}
                </SimpleGrid>
              </Box>

              <Text fontSize="12px" fontWeight={700} color={GRAY700} mb={2}>
                Review (optional)
              </Text>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 500))}
                placeholder="Write a short review of this completed exchange"
                rows={4}
                style={{
                  width: '100%',
                  borderRadius: '10px',
                  border: `1px solid ${GRAY200}`,
                  padding: '12px',
                  fontSize: '13px',
                  color: GRAY800,
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
              <Text fontSize="11px" color={GRAY400} mt={1} textAlign="right">
                {comment.length}/500
              </Text>

              {/* Photo attachment */}
              <Box mt={3}>
                <Text fontSize="12px" fontWeight={700} color={GRAY700} mb={2}>
                  Photos (optional · max 3 )
                </Text>
                <Flex gap={2} flexWrap="wrap">
                  {imagePreviews.map((src, i) => (
                    <Box key={i} position="relative" w="72px" h="72px" flexShrink={0}>
                      <img
                        src={src}
                        alt={`Preview ${i + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }}
                      />
                      <Box
                        as="button"
                        position="absolute"
                        top="2px"
                        right="2px"
                        onClick={() => removeImage(i)}
                        style={{
                          background: 'rgba(0,0,0,0.55)',
                          border: 'none',
                          borderRadius: '50%',
                          color: '#fff',
                          cursor: 'pointer',
                          lineHeight: 1,
                          padding: '2px 5px',
                          fontSize: 13,
                        }}
                      >
                        ×
                      </Box>
                    </Box>
                  ))}
                  {images.length < 3 && (
                    <Box
                      as="label"
                      w="72px"
                      h="72px"
                      border={`2px dashed ${GRAY200}`}
                      borderRadius="8px"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      style={{ cursor: 'pointer' }}
                    >
                      <FiCamera size={20} color={GRAY400} />
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        style={{ display: 'none' }}
                        onChange={handleImageAdd}
                      />
                    </Box>
                  )}
                </Flex>
              </Box>
            </>
          )}
        </Box>

        <Flex
          gap={3}
          px={{ base: 4, md: 6 }}
          py={{ base: 4, md: 5 }}
          borderTop={`1px solid ${GRAY100}`}
          direction={{ base: 'column', sm: 'row' }}
        >
          <Box
            as="button"
            flex={1}
            py="11px"
            borderRadius="11px"
            bg={GRAY100}
            color={GRAY700}
            fontSize="14px"
            fontWeight={600}
            onClick={handleClose}
            style={{ border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}
          >
            Cancel
          </Box>
          <Box
            as="button"
            flex={2}
            py="11px"
            borderRadius="11px"
            bg={alreadyReviewed ? GRAY200 : GREEN}
            color={WHITE}
            fontSize="14px"
            fontWeight={700}
            onClick={handleSubmit}
            style={{
              border: 'none',
              cursor: alreadyReviewed || submitting ? 'not-allowed' : 'pointer',
              opacity: alreadyReviewed || submitting ? 0.7 : 1,
            }}
            aria-disabled={alreadyReviewed || submitting}
          >
            {submitting ? 'Submitting…' : 'Submit Evaluation'}
          </Box>
        </Flex>
      </Box>
    </Box>
  )
}
