import { useState } from 'react'
import {
  Box,
  Text,
  Button,
  Input,
  Stack,
  Flex,
} from '@chakra-ui/react'
import type { InitiatePayload } from '@/services/handshakeAPI'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: InitiatePayload) => Promise<void>
}

export function HandshakeDetailsModal({ isOpen, onClose, onSubmit }: Props) {
  const [location, setLocation] = useState('')
  const [duration, setDuration] = useState<number>(1)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const minDate = new Date().toISOString().slice(0, 10)

  const handleSubmit = async () => {
    setError(null)
    if (!location.trim()) { setError('Location is required.'); return }
    if (!date || !time) { setError('Scheduled date and time are required.'); return }
    if (duration <= 0) { setError('Duration must be greater than 0.'); return }

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
          Initiate Handshake
        </Text>
        <Text fontSize="13px" color="gray.500" mb={5}>
          Provide session details. The requester will review and approve.
        </Text>

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
            <Text fontSize="13px" fontWeight={600} color="gray.700" mb={1}>
              Duration (hours)
            </Text>
            <Input
              type="number"
              min={0.5}
              step={0.5}
              value={duration}
              onChange={(e) => setDuration(parseFloat(e.target.value) || 0)}
              size="sm"
              borderRadius="8px"
              w="120px"
            />
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
            Send Details
          </Button>
        </Flex>
      </Box>
    </Box>
  )
}
