import { Box, Text } from '@chakra-ui/react'
import { GRAY50, GRAY200, GRAY400, WHITE } from '@/theme/tokens'

const NotificationsPage = () => {
  return (
    <Box bg={GRAY50} h="calc(100vh - 64px)" overflowY="auto"
      py={{ base: 0, md: '8px' }} px={{ base: 0, md: '12px' }}>
      <Box maxW="1440px" mx="auto"
        bg={WHITE}
        borderRadius={{ base: 0, md: '20px' }}
        border={{ base: 'none', md: `1px solid ${GRAY200}` }}
        boxShadow={{ base: 'none', md: '0 4px 24px rgba(0,0,0,0.08)' }}
        minH={{ base: 'calc(100vh - 64px)', md: 'calc(100vh - 88px)' }}
        overflow="hidden"
        p={{ base: 5, md: 8 }}
      >
        <Text fontSize="22px" fontWeight={800} color="#1F2937" mb={2}>Notifications</Text>
        <Text color={GRAY400}>This page will be implemented during module migration.</Text>
      </Box>
    </Box>
  )
}

export default NotificationsPage
