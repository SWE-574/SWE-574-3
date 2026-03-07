import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Box, Flex, Spinner, Text } from '@chakra-ui/react'
import { FiArrowLeft, FiEdit3 } from 'react-icons/fi'
import { toast } from 'sonner'
import ServiceForm from '@/components/ServiceForm'
import { serviceAPI } from '@/services/serviceAPI'
import { useAuthStore } from '@/store/useAuthStore'
import type { Service } from '@/types'
import {
  GREEN,
  BLUE,
  AMBER,
  GRAY50,
  GRAY200,
  GRAY400,
  GRAY500,
  WHITE,
} from '@/theme/tokens'

function accentForType(type: Service['type']): string {
  if (type === 'Event') return AMBER
  if (type === 'Need') return BLUE
  return GREEN
}

export default function EditServiceForm() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [service, setService] = useState<Service | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) {
      navigate('/dashboard')
      return
    }

    let active = true
    serviceAPI.get(id)
      .then((data) => {
        if (!active) return
        setService(data)
      })
      .catch(() => {
        if (!active) return
        toast.error('Failed to load service for editing.')
        navigate('/dashboard')
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [id, navigate])

  useEffect(() => {
    if (!service || !user?.id) return
    if (service.user?.id !== user.id) {
      toast.error('You can only edit your own service.')
      navigate(`/service-detail/${service.id}`)
    }
  }, [service, user?.id, navigate])

  const accent = useMemo(() => {
    if (!service) return GREEN
    return accentForType(service.type)
  }, [service])

  if (loading || !service) {
    return (
      <Box bg={GRAY50} h="calc(100vh - 64px)" display="flex" alignItems="center" justifyContent="center">
        <Flex align="center" gap={3}>
          <Spinner size="sm" color={accent} />
          <Text fontSize="14px" color={GRAY500}>Loading editor...</Text>
        </Flex>
      </Box>
    )
  }

  return (
    <Box bg={GRAY50} h="calc(100vh - 64px)" overflowY="auto"
      py={{ base: 0, md: '8px' }} px={{ base: 0, md: '12px' }}>
      <Box maxW="1440px" mx="auto" py={{ base: 4, md: 6 }} px={{ base: 4, md: 6 }}>
        <Box maxW="720px" mx="auto">
          <Box
            as="button"
            onClick={() => navigate(`/service-detail/${service.id}`)}
            display="flex"
            alignItems="center"
            gap="6px"
            fontSize="13px"
            fontWeight={600}
            color={GRAY500}
            mb={4}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            onMouseEnter={(e) => { (e.currentTarget as unknown as HTMLButtonElement).style.color = '#1F2937' }}
            onMouseLeave={(e) => { (e.currentTarget as unknown as HTMLButtonElement).style.color = GRAY500 }}
          >
            <FiArrowLeft size={15} /> Back
          </Box>

          <Box bg={WHITE} borderRadius="20px" border={`1px solid ${GRAY200}`} overflow="hidden"
            boxShadow="0 4px 20px rgba(0,0,0,0.06)" mb={4}
          >
            <Box h="5px" style={{ background: `linear-gradient(90deg, ${accent} 0%, #1F2937 100%)` }} />
            <Box px={6} py={5}>
              <Flex align="center" gap={3}>
                <Box w="44px" h="44px" borderRadius="12px" flexShrink={0}
                  display="flex" alignItems="center" justifyContent="center"
                  style={{ background: `linear-gradient(135deg, ${accent} 0%, #1F2937 100%)` }}
                >
                  <FiEdit3 size={20} color={WHITE} />
                </Box>
                <Box>
                  <Text fontSize="20px" fontWeight={800} color="#1F2937" lineHeight={1.2}>Edit {service.type}</Text>
                  <Text fontSize="13px" color={GRAY400} mt="3px">
                    Changes will notify relevant participants according to policy.
                  </Text>
                </Box>
              </Flex>
            </Box>
          </Box>

          <Box bg={WHITE} borderRadius="20px" border={`1px solid ${GRAY200}`} p={6}
            boxShadow="0 4px 20px rgba(0,0,0,0.06)"
          >
            <ServiceForm
              type={service.type}
              mode="edit"
              serviceId={service.id}
              initialService={service}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
