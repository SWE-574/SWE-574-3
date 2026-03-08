import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Flex, Spinner, Text } from '@chakra-ui/react'

const ReportDetail = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()

  useEffect(() => {
    const target = id
      ? `/admin?tab=reports&reportId=${encodeURIComponent(id)}`
      : '/admin?tab=reports'
    navigate(target, { replace: true })
  }, [id, navigate])

  return (
    <Flex minH="40vh" justify="center" align="center" direction="column" gap={3}>
      <Spinner />
      <Text fontSize="sm" color="gray.600">Redirecting to report panel...</Text>
    </Flex>
  )
}

export default ReportDetail
