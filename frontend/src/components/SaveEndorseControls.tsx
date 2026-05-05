import { useState } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { FiBookmark, FiThumbsUp } from 'react-icons/fi'
import { toast } from 'sonner'

import { serviceAPI } from '@/services/serviceAPI'
import { useAuthStore } from '@/store/useAuthStore'
import type { Service } from '@/types'

interface Props {
  service: Service
  isOwn: boolean
  onChange?: (next: Partial<Service>) => void
}

/** Save (private bookmark) and Endorse (public vouch) controls for a service.
 *  Save is hidden for the owner (you don't bookmark your own).
 *  Endorse is hidden for the owner (the API also rejects self-endorsements).
 */
export default function SaveEndorseControls({ service, isOwn, onChange }: Props) {
  const isAuthenticated = useAuthStore(state => Boolean(state.user))
  const [saved, setSaved] = useState(Boolean(service.is_saved))
  const [endorsed, setEndorsed] = useState(Boolean(service.is_endorsed))
  const [endorseCount, setEndorseCount] = useState(service.endorsement_count ?? 0)
  const [busy, setBusy] = useState(false)

  if (!isAuthenticated || isOwn) {
    if (endorseCount > 0) {
      return (
        <Flex gap={2} align="center" mb={4}>
          <FiThumbsUp />
          <Text fontSize="sm" color="gray.600">
            {endorseCount} {endorseCount === 1 ? 'endorsement' : 'endorsements'}
          </Text>
        </Flex>
      )
    }
    return null
  }

  const toggleSaved = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await serviceAPI.setSaved(service.id, !saved)
      setSaved(res.is_saved)
      onChange?.({ is_saved: res.is_saved })
      toast.success(res.is_saved ? 'Saved to your bookmarks' : 'Removed from bookmarks')
    } catch {
      toast.error('Could not update bookmark')
    } finally {
      setBusy(false)
    }
  }

  const toggleEndorsed = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await serviceAPI.setEndorsed(service.id, !endorsed)
      setEndorsed(res.is_endorsed)
      setEndorseCount(res.endorsement_count)
      onChange?.({
        is_endorsed: res.is_endorsed,
        endorsement_count: res.endorsement_count,
      })
      toast.success(res.is_endorsed ? 'Endorsement added' : 'Endorsement removed')
    } catch {
      toast.error('Could not update endorsement')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Flex gap={2} mb={4}>
      <Box
        as="button"
        onClick={toggleSaved}
        aria-disabled={busy}
        pointerEvents={busy ? 'none' : 'auto'}
        px="12px"
        py="6px"
        borderRadius="9px"
        fontSize="13px"
        fontWeight={600}
        display="flex"
        alignItems="center"
        gap="6px"
        bg={saved ? 'purple.500' : 'gray.50'}
        color={saved ? 'white' : 'gray.700'}
        borderWidth="1px"
        borderColor={saved ? 'purple.500' : 'gray.200'}
        _hover={{ opacity: 0.92, cursor: busy ? 'wait' : 'pointer' }}
      >
        <FiBookmark size={14} />
        {saved ? 'Saved' : 'Save'}
      </Box>
      <Box
        as="button"
        onClick={toggleEndorsed}
        aria-disabled={busy}
        pointerEvents={busy ? 'none' : 'auto'}
        px="12px"
        py="6px"
        borderRadius="9px"
        fontSize="13px"
        fontWeight={600}
        display="flex"
        alignItems="center"
        gap="6px"
        bg={endorsed ? 'green.500' : 'gray.50'}
        color={endorsed ? 'white' : 'gray.700'}
        borderWidth="1px"
        borderColor={endorsed ? 'green.500' : 'gray.200'}
        _hover={{ opacity: 0.92, cursor: busy ? 'wait' : 'pointer' }}
      >
        <FiThumbsUp size={14} />
        {endorsed ? 'Endorsed' : 'Endorse'}
        {endorseCount > 0 && (
          <Text as="span" fontSize="12px" opacity={0.85}>· {endorseCount}</Text>
        )}
      </Box>
    </Flex>
  )
}
