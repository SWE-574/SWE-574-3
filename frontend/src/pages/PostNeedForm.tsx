import { Box, Container, Heading, Text } from '@chakra-ui/react'
import ServiceForm from '@/components/ServiceForm'

export default function PostNeedForm() {
  return (
    <>
      <Container maxW="2xl" py={10}>
        <Box mb={8}>
          <Heading size="xl" color="blue.600">Post a Need</Heading>
          <Text color="gray.500" mt={1}>
            Describe something you need help with and find community members who can assist.
          </Text>
        </Box>
        <ServiceForm type="Need" />
      </Container>
    </>
  )
}
