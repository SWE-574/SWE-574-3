import {
  Box,
  Text,
  Button,
  Stack,
  Flex,
  Link,
} from '@chakra-ui/react'
import { FiMapPin, FiClock, FiCalendar } from 'react-icons/fi'
import { buildMapsUrl } from '@/utils/location'

interface Props {
  isOpen: boolean
  onClose: () => void
  exactLocation: string
  exactDuration: number
  scheduledTime: string
  onApprove: () => Promise<void>
  onDecline: () => Promise<void>
  approving: boolean
  declining: boolean
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Flex align="flex-start" gap={3} p={3} bg="gray.50" borderRadius="10px">
      <Box color="gray.400" mt="2px">{icon}</Box>
      <Box>
        <Text fontSize="11px" color="gray.400" fontWeight={600} textTransform="uppercase" letterSpacing="0.05em">
          {label}
        </Text>
        <Text fontSize="14px" color="gray.800" fontWeight={600}>
          {value}
        </Text>
      </Box>
    </Flex>
  )
}

export function ProviderDetailsModal({
  isOpen,
  onClose,
  exactLocation,
  exactDuration,
  scheduledTime,
  onApprove,
  onDecline,
  approving,
  declining,
}: Props) {
  if (!isOpen) return null

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
          Session Details
        </Text>
        <Text fontSize="13px" color="gray.500" mb={5}>
          The service owner has proposed the session details. Review and approve or decline.
        </Text>

        <Stack gap={3}>
          <Flex align="flex-start" gap={3} p={3} bg="gray.50" borderRadius="10px">
            <Box color="gray.400" mt="2px"><FiMapPin size={16} /></Box>
            <Box flex={1}>
              <Text fontSize="11px" color="gray.400" fontWeight={600} textTransform="uppercase" letterSpacing="0.05em">
                Location
              </Text>
              <Text fontSize="14px" color="gray.800" fontWeight={600}>
                {exactLocation}
              </Text>
              {exactLocation && (
                <Link
                  href={buildMapsUrl(exactLocation)}
                  target="_blank"
                  rel="noopener noreferrer"
                  fontSize="13px"
                  fontWeight={600}
                  color="#2D5C4E"
                  mt={1}
                  display="inline-block"
                  _hover={{ textDecoration: 'underline' }}
                >
                  Open in Maps
                </Link>
              )}
            </Box>
          </Flex>
          <DetailRow
            icon={<FiClock size={16} />}
            label="Duration"
            value={`${exactDuration} ${exactDuration === 1 ? 'hour' : 'hours'}`}
          />
          <DetailRow
            icon={<FiCalendar size={16} />}
            label="Scheduled Time"
            value={formatDateTime(scheduledTime)}
          />
        </Stack>

        <Flex gap={2} mt={5} justify="flex-end">
          <Button
            size="sm"
            variant="ghost"
            colorScheme="red"
            onClick={onDecline}
            loading={declining}
            disabled={approving}
            style={{ color: '#dc2626' }}
          >
            Decline
          </Button>
          <Button
            size="sm"
            onClick={onApprove}
            loading={approving}
            disabled={declining}
            style={{ background: '#16a34a', color: 'white' }}
          >
            Approve & Confirm
          </Button>
        </Flex>
      </Box>
    </Box>
  )
}
