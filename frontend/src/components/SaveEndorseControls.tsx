import { useState } from 'react'
import { Box, Flex } from '@chakra-ui/react'
import { FiBookmark } from 'react-icons/fi'
import { toast } from 'sonner'

import { serviceAPI } from '@/services/serviceAPI'
import { useAuthStore } from '@/store/useAuthStore'
import type { Service } from '@/types'

interface Props {
  service: Service
  isOwn: boolean
  onChange?: (next: Partial<Service>) => void
}

/** Save (private bookmark) control for a service.
 *  Hidden for the owner and for anonymous viewers.
 */
export default function SaveEndorseControls({ service, isOwn, onChange }: Props) {
  const isAuthenticated = useAuthStore(state => Boolean(state.user))
  const [saved, setSaved] = useState(Boolean(service.is_saved))
  const [busy, setBusy] = useState(false)

  if (!isAuthenticated || isOwn) {
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
    </Flex>
  )
}
