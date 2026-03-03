import { useNavigate } from 'react-router-dom'
import { Box, Flex, Text } from '@chakra-ui/react'
import { FiArrowLeft, FiZap } from 'react-icons/fi'
import ServiceForm from '@/components/ServiceForm'

import { GREEN, GRAY50, GRAY200, GRAY400, GRAY500, WHITE } from '@/theme/tokens'

export default function PostOfferForm() {
  const navigate = useNavigate()
  return (
    <Box bg={GRAY50} minH="calc(100vh - 64px)" py={{ base: 3, md: 5 }} px={{ base: 3, md: 5 }}>
      <Box maxW="720px" mx="auto">

        {/* Back */}
        <Box
          as="button" onClick={() => navigate(-1)}
          display="flex" alignItems="center" gap="6px"
          fontSize="13px" fontWeight={600} color={GRAY500} mb={4}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#1F2937' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = GRAY500 }}
        >
          <FiArrowLeft size={15} /> Back
        </Box>

        {/* Header card */}
        <Box bg={WHITE} borderRadius="20px" border={`1px solid ${GRAY200}`} overflow="hidden"
          boxShadow="0 4px 20px rgba(0,0,0,0.06)" mb={4}
        >
          <Box h="5px" style={{ background: `linear-gradient(90deg, ${GREEN} 0%, #1a4a3a 100%)` }} />
          <Box px={6} py={5}>
            <Flex align="center" gap={3}>
              <Box w="44px" h="44px" borderRadius="12px" flexShrink={0}
                display="flex" alignItems="center" justifyContent="center"
                style={{ background: `linear-gradient(135deg, ${GREEN} 0%, #1a3d35 100%)` }}
              >
                <FiZap size={20} color={WHITE} />
              </Box>
              <Box>
                <Text fontSize="20px" fontWeight={800} color="#1F2937" lineHeight={1.2}>Post an Offer</Text>
                <Text fontSize="13px" color={GRAY400} mt="3px">
                  Share a skill or service you can provide to the community
                </Text>
              </Box>
            </Flex>
          </Box>
        </Box>

        {/* Form card */}
        <Box bg={WHITE} borderRadius="20px" border={`1px solid ${GRAY200}`} p={6}
          boxShadow="0 4px 20px rgba(0,0,0,0.06)"
        >
          <ServiceForm type="Offer" />
        </Box>

      </Box>
    </Box>
  )
}
