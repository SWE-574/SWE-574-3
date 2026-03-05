import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Box, Button, Flex, Spinner, Text, Textarea } from '@chakra-ui/react'
import { toast } from 'sonner'
import { adminAPI, type ReportResolveAction } from '@/services/adminAPI'
import AdminReauthBanner from '@/components/AdminReauthBanner'
import { getErrorMessage } from '@/services/api'
import { useAuthStore } from '@/store/useAuthStore'
import type { AdminReport } from '@/types'

function asStatusCode(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status
}

const ReportDetail = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const logout = useAuthStore((s) => s.logout)

  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<AdminReport | null>(null)
  const [notes, setNotes] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [authIssue, setAuthIssue] = useState<string | null>(null)

  const handleReLogin = useCallback(async () => {
    await logout()
    const redirect = id ? `/report-detail/${id}` : '/admin'
    navigate(`/login?redirect=${encodeURIComponent(redirect)}`, { replace: true })
  }, [id, logout, navigate])

  const loadReport = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const data = await adminAPI.getReport(id)
      setReport(data)
      setNotes(data.admin_notes || '')
      setAuthIssue(null)
    } catch (error) {
      if (asStatusCode(error) === 403) {
        setAuthIssue('You no longer have permission to access this report. Please log in again.')
        setReport(null)
        return
      }
      toast.error(getErrorMessage(error, 'Failed to load report'))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  const resolve = async (action: ReportResolveAction) => {
    if (!id || !report) return
    if (!window.confirm(`Confirm action: ${action.replace('_', ' ')}?`)) return

    setActionLoading(true)
    try {
      const data = await adminAPI.resolveReport(id, action, notes)
      setReport(data)
      setAuthIssue(null)
      toast.success('Report updated')
    } catch (error) {
      if (asStatusCode(error) === 403) {
        setAuthIssue('Your admin permissions were revoked. Please log in again.')
        return
      }
      toast.error(getErrorMessage(error, 'Failed to resolve report'))
    } finally {
      setActionLoading(false)
    }
  }

  const pause = async () => {
    if (!id || !report) return
    if (!window.confirm('Pause related handshake for investigation?')) return

    setActionLoading(true)
    try {
      await adminAPI.pauseHandshake(id)
      toast.success('Handshake paused')
      await loadReport()
    } catch (error) {
      if (asStatusCode(error) === 403) {
        setAuthIssue('Your admin permissions were revoked. Please log in again.')
        return
      }
      toast.error(getErrorMessage(error, 'Failed to pause handshake'))
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return <Flex py={12} justify="center"><Spinner /></Flex>
  }

  if (!report) {
    if (authIssue) {
      return (
        <Box p={8}>
          <AdminReauthBanner
            message={authIssue}
            onReLogin={handleReLogin}
            onSecondary={() => navigate('/admin')}
            secondaryLabel="Back to Admin Panel"
            variant="page"
          />
        </Box>
      )
    }

    return (
      <Box p={8}>
        <Text fontSize="xl" fontWeight={700}>Content unavailable</Text>
        <Text color="gray.600" mt={1}>This report no longer exists or cannot be accessed.</Text>
        <Button mt={4} variant="outline" onClick={() => navigate('/admin')}>Back to Admin Panel</Button>
      </Box>
    )
  }

  return (
    <Box p={{ base: 4, md: 8 }}>
      <Flex justify="space-between" align="center" mb={5}>
        <Box>
          <Text fontSize="2xl" fontWeight={800}>Report Detail</Text>
          <Text color="gray.600" fontSize="sm">Moderate and resolve this report.</Text>
        </Box>
        <Box as="button" px={3} py={2} borderRadius="8px" bg="#F1F5F9" onClick={() => navigate('/admin')}>Back</Box>
      </Flex>

      <Box border="1px solid #E2E8F0" borderRadius="12px" p={4} bg="white">
        <Text fontWeight={700} mb={1}>{report.type.replace('_', ' ')}</Text>
        <Text fontSize="sm" color="gray.600">Status: {report.status}</Text>
        <Text fontSize="sm" color="gray.600">Reporter: {report.reporter_name || 'Unknown'}</Text>
        <Text fontSize="sm" color="gray.600">Reported user: {report.reported_user_name || 'Content unavailable'}</Text>
        <Text fontSize="sm" color="gray.600">Created: {new Date(report.created_at).toLocaleString()}</Text>

        <Box mt={4} p={3} borderRadius="10px" bg="#F8FAFC" border="1px solid #E2E8F0">
          <Text fontSize="sm">{report.description}</Text>
        </Box>

        <Box mt={4}>
          <Text fontSize="sm" fontWeight={600} mb={1}>Admin notes</Text>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reason / moderation notes"
            minH="90px"
            bg="white"
          />
        </Box>

        <Flex mt={4} gap={2} wrap="wrap">
          <Button colorPalette="green" variant="subtle" disabled={actionLoading} onClick={() => resolve('confirm_no_show')}>Confirm no-show</Button>
          <Button colorPalette="blue" variant="subtle" disabled={actionLoading} onClick={() => resolve('dismiss')}>Dismiss report</Button>
          <Button colorPalette="orange" variant="subtle" disabled={actionLoading} onClick={pause}>Pause handshake</Button>
        </Flex>
      </Box>
    </Box>
  )
}

export default ReportDetail
