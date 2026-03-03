import { Box, Container, Heading, Text } from '@chakra-ui/react'
import ServiceForm from '@/components/ServiceForm'

export default function PostOfferForm() {
  return (
    <>
      <Container maxW="2xl" py={10}>
        <Box mb={8}>
          <Heading size="xl" color="orange.600">Post an Offer</Heading>
          <Text color="gray.500" mt={1}>
            Share a skill or service you can provide to the community.
          </Text>
        </Box>
        <ServiceForm type="Offer" />
      </Container>
    </>
  )
}
