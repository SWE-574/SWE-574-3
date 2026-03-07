import { useEffect, useState } from 'react'
import {
  Box,
  Text,
  Button,
  Input,
  Stack,
  Flex,
} from '@chakra-ui/react'
import type { InitiatePayload } from '@/services/handshakeAPI'
import { formatEventDateTime } from '@/utils/eventUtils'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: InitiatePayload) => Promise<void>
  serviceType?: string
  scheduledTime?: string | null
  presetDetails?: {
    exactLocation: string
    exactDuration: number
    scheduledTime: string
  } | null
  /** Original post duration (hours). Used for Offer/Need to show "Original post: X hours" and validate agreed duration. */
  serviceDuration?: number | null
}

const isOfferOrNeed = (t?: string) => t === 'Offer' || t === 'Need'

export function HandshakeDetailsModal({
  isOpen,
  onClose,
  onSubmit,
  serviceType,
  scheduledTime,
  presetDetails,
  serviceDuration,
}: Props) {
  const [location, setLocation] = useState('')
  const [duration, setDuration] = useState<number>(1)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const useStrictDuration = isOfferOrNeed(serviceType)

  useEffect(() => {
    if (!isOpen || presetDetails) return
    if (useStrictDuration && serviceDuration != null) {
      setDuration(serviceDuration)
    }
  }, [isOpen, presetDetails, serviceDuration, useStrictDuration])

  if (!isOpen) return null

  // Event handshakes don't use the initiation flow — show info only
  if (serviceType === 'Event') {
    return (
      <Box
        position="fixed" inset={0} zIndex={1000}
        style={{ background: 'rgba(0,0,0,0.5)' }}
        display="flex" alignItems="center" justifyContent="center"
        onClick={onClose}
      >
        <Box
          bg="white" borderRadius="16px" p={6} w="100%" maxW="400px" mx={4}
          boxShadow="xl" onClick={(e) => e.stopPropagation()}
        >
          <Text fontSize="17px" fontWeight={700} color="gray.800" mb={1}>Event Registration</Text>
          {scheduledTime && (
            <Text fontSize="13px" color="gray.500" mb={4}>
              📅 {formatEventDateTime(scheduledTime)}
            </Text>
          )}
          <Text fontSize="13px" color="gray.600" mb={5} lineHeight={1.6}>
            You have joined this event. Check-in opens 24 hours before the event starts.
            Make sure to check in to confirm your attendance!
          </Text>
          <Flex justify="flex-end">
            <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
          </Flex>
        </Box>
      </Box>
    )
  }

  const isPresetMode = !!presetDetails

  const minDate = new Date().toISOString().slice(0, 10)

  const handleSubmit = async () => {
    setError(null)
    if (isPresetMode && presetDetails) {
      setLoading(true)
      try {
        await onSubmit({
          exact_location: presetDetails.exactLocation,
          exact_duration: presetDetails.exactDuration,
          scheduled_time: presetDetails.scheduledTime,
        })
        onClose()
      } catch (e: unknown) {
        const err = e as { response?: { data?: { detail?: string } }; message?: string }
        setError(err?.response?.data?.detail ?? err?.message ?? 'Failed to initiate handshake.')
      } finally {
        setLoading(false)
      }
      return
    }

    if (!location.trim()) { setError('Location is required.'); return }
    if (!date || !time) { setError('Scheduled date and time are required.'); return }
    if (useStrictDuration) {
      if (!Number.isInteger(duration)) { setError('Time credit must be a whole number.'); return }
      if (duration < 1) { setError('Time credit must be at least 1 hour.'); return }
      if (duration > 10) { setError('Time credit cannot exceed 10 hours.'); return }
    } else {
      if (duration <= 0) { setError('Duration must be greater than 0.'); return }
    }

    const scheduled_time = `${date}T${time}:00`
    const now = new Date()
    if (new Date(scheduled_time) <= now) { setError('Scheduled time must be in the future.'); return }

    setLoading(true)
    try {
      await onSubmit({ exact_location: location.trim(), exact_duration: duration, scheduled_time })
      onClose()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string }
      setError(err?.response?.data?.detail ?? err?.message ?? 'Failed to initiate handshake.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box
      position="fixed"
      inset={0}
      zIndex={1000}
      style={{ background: 'rgba(0,0,0,0.5)' }}
      display="flex"
      alignItems="center"
      justifyContent="center"
      onClick={onClose}
    >
      <Box
        bg="white"
        borderRadius="16px"
        p={6}
        w="100%"
        maxW="440px"
        mx={4}
        boxShadow="xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Text fontSize="17px" fontWeight={700} color="gray.800" mb={1}>
          {isPresetMode ? 'Use Group Offer Details' : 'Initiate Handshake'}
        </Text>
        <Text fontSize="13px" color="gray.500" mb={5}>
          {isPresetMode
            ? 'This group offer already has a fixed location and date. The requester will review and approve these preset details.'
            : 'Provide session details. The requester will review and approve.'
          }
        </Text>

        {isPresetMode && presetDetails ? (
          <Stack gap={4}>
            <Box>
              <Text fontSize="13px" fontWeight={600} color="gray.700" mb={1}>Location</Text>
              <Box px={3} py={2.5} borderRadius="8px" bg="gray.50" border="1px solid" borderColor="gray.200">
                <Text fontSize="13px" color="gray.800">{presetDetails.exactLocation}</Text>
              </Box>
            </Box>
            <Box>
              <Text fontSize="13px" fontWeight={600} color="gray.700" mb={1}>Duration</Text>
              <Box px={3} py={2.5} borderRadius="8px" bg="gray.50" border="1px solid" borderColor="gray.200">
                <Text fontSize="13px" color="gray.800">{presetDetails.exactDuration}h</Text>
              </Box>
            </Box>
            <Box>
              <Text fontSize="13px" fontWeight={600} color="gray.700" mb={1}>Scheduled Date & Time</Text>
              <Box px={3} py={2.5} borderRadius="8px" bg="gray.50" border="1px solid" borderColor="gray.200">
                <Text fontSize="13px" color="gray.800">{formatEventDateTime(presetDetails.scheduledTime)}</Text>
              </Box>
            </Box>
          </Stack>
        ) : (
          <Stack gap={4}>
            <Box>
              <Text fontSize="13px" fontWeight={600} color="gray.700" mb={1}>
                Exact Location
              </Text>
              <Input
                placeholder="e.g. Beşiktaş Library, Room 3"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                size="sm"
                borderRadius="8px"
              />
            </Box>

            <Box>
              {useStrictDuration && serviceDuration != null && (
                <Text fontSize="12px" color="gray.500" mb={1}>
                  Original post: {Number(serviceDuration)} hours
                </Text>
              )}
              <Text fontSize="13px" fontWeight={600} color="gray.700" mb={1}>
                {useStrictDuration ? 'Agreed duration (hours)' : 'Duration (hours)'}
              </Text>
              <Input
                type="number"
                min={useStrictDuration ? 1 : 0.5}
                max={useStrictDuration ? 10 : undefined}
                step={useStrictDuration ? 1 : 0.5}
                placeholder={useStrictDuration ? 'e.g. 1' : undefined}
                value={duration}
                onChange={(e) => setDuration(parseFloat(e.target.value) || 0)}
                size="sm"
                borderRadius="8px"
                w="120px"
              />
              {useStrictDuration && (
                <Text fontSize="11px" color="gray.500" mt={1}>
                  Time credit will be based on this agreed duration.
                </Text>
              )}
            </Box>

            <Box>
              <Text fontSize="13px" fontWeight={600} color="gray.700" mb={1}>
                Scheduled Date & Time
              </Text>
              <Flex gap={2}>
                <Input
                  type="date"
                  min={minDate}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  size="sm"
                  borderRadius="8px"
                  flex={1}
                />
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  size="sm"
                  borderRadius="8px"
                  w="120px"
                />
              </Flex>
            </Box>
          </Stack>
        )}

        {error && (
          <Text fontSize="12px" color="red.500" mt={3}>
            {error}
          </Text>
        )}

        <Flex gap={2} mt={5} justify="flex-end">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            size="sm"
            colorScheme="green"
            onClick={handleSubmit}
            loading={loading}
            style={{ background: '#16a34a', color: 'white' }}
          >
            {isPresetMode ? 'Share Fixed Details' : 'Send Details'}
          </Button>
        </Flex>
      </Box>
    </Box>
  )
}
