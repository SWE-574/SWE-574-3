import { useState } from 'react'
import {
  Box,
  Text,
  Button,
  Flex,
  Stack,
} from '@chakra-ui/react'
import { FiCheckCircle } from 'react-icons/fi'

interface Props {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  provisioned_hours?: number
  other_user_name: string
}

export function ServiceConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  provisioned_hours,
  other_user_name,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleConfirm = async () => {
    setError(null)
    setLoading(true)
    try {
      await onConfirm()
      onClose()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string }
      setError(err?.response?.data?.detail ?? err?.message ?? 'Failed to confirm. Please try again.')
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
        maxW="400px"
        mx={4}
        boxShadow="xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Flex direction="column" align="center" textAlign="center">
          <Box color="#f59e0b" mb={3}>
            <FiCheckCircle size={40} />
          </Box>
          <Text fontSize="17px" fontWeight={700} color="gray.800" mb={2}>
            Confirm Service Completion
          </Text>
          <Text fontSize="13px" color="gray.500" mb={4}>
            Confirm that the service with{' '}
            <Text as="span" fontWeight={600} color="gray.700">
              {other_user_name}
            </Text>{' '}
            has been completed.{provisioned_hours ? ` (${provisioned_hours}h)` : ''}
          </Text>

          <Stack gap={2} w="100%">
            <Box p={3} bg="#fef3c7" borderRadius="10px" border="1px solid #fde68a">
              <Text fontSize="12px" color="#92400e">
                ⚠️ Both parties must confirm. TimeBank hours will be transferred once both confirm.
              </Text>
            </Box>
          </Stack>
        </Flex>

        {error && (
          <Text fontSize="12px" color="red.500" mt={3} textAlign="center">
            {error}
          </Text>
        )}

        <Flex gap={2} mt={5} justify="flex-end">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            loading={loading}
            style={{ background: '#f59e0b', color: 'white' }}
          >
            Yes, Confirm Completion
          </Button>
        </Flex>
      </Box>
    </Box>
  )
}
