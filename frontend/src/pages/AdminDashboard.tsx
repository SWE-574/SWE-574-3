import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Box, Button, Flex, Input, NativeSelect, Spinner, Table, Text, Textarea } from '@chakra-ui/react'
import { toast } from 'sonner'
import { adminAPI, type AuditTargetFilter, type CommentStatusFilter, type ReportResolveAction, type ReportStatusFilter } from '@/services/adminAPI'
import { forumAPI } from '@/services/forumAPI'
import AdminReauthBanner from '@/components/AdminReauthBanner'
import AdminLayout from '@/components/AdminLayout'
import AdminActivityFeed from '@/components/AdminActivityFeed'
import { getErrorMessage } from '@/services/api'
import { useAuthStore } from '@/store/useAuthStore'
import type { AdminAuditLog, AdminComment, AdminMetrics, AdminReport, AdminUserSummary, ForumTopic, PaginatedResponse } from '@/types'

type AdminTab = 'dashboard' | 'users' | 'reports' | 'comments' | 'moderation' | 'audit'

function asStatusCode(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status
}

function userDisplayName(user: AdminUserSummary): string {
  const full = `${user.first_name || ''} ${user.last_name || ''}`.trim()
  return full || user.email
}

function formatAuditAction(action: string): string {
  return action.replace(/_/g, ' ')
}

const AdminDashboard = () => {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard')

  const checkAuth = useAuthStore((s) => s.checkAuth)
  const refreshUser = useAuthStore((s) => s.refreshUser)
  const logout = useAuthStore((s) => s.logout)

  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [forumPostsCount, setForumPostsCount] = useState<number | null>(null)
  const [pendingReportsCount, setPendingReportsCount] = useState<number | null>(null)
  const [removedCommentsCount, setRemovedCommentsCount] = useState<number | null>(null)
  const [dashboardPendingReports, setDashboardPendingReports] = useState<AdminReport[]>([])
  const [dashboardRemovedComments, setDashboardRemovedComments] = useState<AdminComment[]>([])

  const [usersLoading, setUsersLoading] = useState(false)
  const [users, setUsers] = useState<PaginatedResponse<AdminUserSummary> | null>(null)
  const [userSearch, setUserSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [userStatus, setUserStatus] = useState<'all' | 'active' | 'banned'>('all')
  const [usersPage, setUsersPage] = useState(1)

  const [reportsLoading, setReportsLoading] = useState(false)
  const [reports, setReports] = useState<PaginatedResponse<AdminReport> | null>(null)
  const [reportStatus, setReportStatus] = useState<ReportStatusFilter>('pending')
  const [reportNotes, setReportNotes] = useState<Record<string, string>>({})

  const [commentsLoading, setCommentsLoading] = useState(false)
  const [comments, setComments] = useState<PaginatedResponse<AdminComment> | null>(null)
  const [commentStatus, setCommentStatus] = useState<CommentStatusFilter>('active')
  const [commentSearch, setCommentSearch] = useState('')
  const [debouncedCommentSearch, setDebouncedCommentSearch] = useState('')
  const [commentsPage, setCommentsPage] = useState(1)

  const [topicsLoading, setTopicsLoading] = useState(false)
  const [topics, setTopics] = useState<PaginatedResponse<ForumTopic> | null>(null)
  const [topicsPage, setTopicsPage] = useState(1)

  const [auditLoading, setAuditLoading] = useState(false)
  const [auditLogs, setAuditLogs] = useState<PaginatedResponse<AdminAuditLog> | null>(null)
  const [auditTarget, setAuditTarget] = useState<AuditTargetFilter>('all')
  const [auditPage, setAuditPage] = useState(1)

  const [authIssue, setAuthIssue] = useState<string | null>(null)

  useEffect(() => {
    checkAuth(true).then(() => refreshUser())
  }, [checkAuth, refreshUser])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(userSearch.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [userSearch])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedCommentSearch(commentSearch.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [commentSearch])

  const handleForbidden = useCallback((message: string) => {
    setAuthIssue(message)
  }, [])

  const handleReLogin = useCallback(async () => {
    await logout()
    navigate('/login?redirect=/admin', { replace: true })
  }, [logout, navigate])

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true)
    try {
      const [metricsData, pendingReports, removedComments, recentPosts] = await Promise.all([
        adminAPI.getMetrics(),
        adminAPI.getReports('pending', 1, 5),
        adminAPI.getComments('removed', 1, 5),
        forumAPI.listRecentPosts({ page: 1, page_size: 1 }),
      ])
      setMetrics(metricsData)
      setPendingReportsCount(pendingReports.count)
      setRemovedCommentsCount(removedComments.count)
      setDashboardPendingReports(pendingReports.results)
      setDashboardRemovedComments(removedComments.results)
      setForumPostsCount(recentPosts.count)
      setAuthIssue(null)
    } catch (error) {
      if (asStatusCode(error) === 403) {
        handleForbidden('Permissions changed. Please log in again to continue moderation.')
        return
      }
      toast.error(getErrorMessage(error, 'Failed to load dashboard metrics'))
    } finally {
      setDashboardLoading(false)
    }
  }, [handleForbidden])

  const loadUsers = useCallback(async () => {
    setUsersLoading(true)
    try {
      const result = await adminAPI.getUsers(
        debouncedSearch || undefined,
        userStatus === 'all' ? undefined : userStatus,
        usersPage,
        20,
      )
      setUsers(result)
      setAuthIssue(null)
    } catch (error) {
      if (asStatusCode(error) === 403) {
        handleForbidden('You no longer have admin access. Please log in again.')
        return
      }
      toast.error(getErrorMessage(error, 'Failed to load users'))
    } finally {
      setUsersLoading(false)
    }
  }, [debouncedSearch, handleForbidden, userStatus, usersPage])

  const loadReports = useCallback(async () => {
    setReportsLoading(true)
    try {
      const result = await adminAPI.getReports(reportStatus, 1, 20)
      setReports(result)
      setAuthIssue(null)
    } catch (error) {
      if (asStatusCode(error) === 403) {
        handleForbidden('You no longer have admin access. Please log in again.')
        return
      }
      toast.error(getErrorMessage(error, 'Failed to load reports'))
    } finally {
      setReportsLoading(false)
    }
  }, [handleForbidden, reportStatus])

  const loadComments = useCallback(async () => {
    setCommentsLoading(true)
    try {
      const result = await adminAPI.getComments(commentStatus, commentsPage, 20, debouncedCommentSearch || undefined)
      setComments(result)
      setAuthIssue(null)
    } catch (error) {
      if (asStatusCode(error) === 403) {
        handleForbidden('Your admin session can no longer access comment moderation. Please log in again.')
        return
      }
      toast.error(getErrorMessage(error, 'Failed to load comments moderation queue'))
    } finally {
      setCommentsLoading(false)
    }
  }, [commentStatus, commentsPage, debouncedCommentSearch, handleForbidden])

  const loadTopics = useCallback(async () => {
    setTopicsLoading(true)
    try {
      const result = await forumAPI.listTopics({ page: topicsPage, page_size: 20 })
      setTopics(result)
      setAuthIssue(null)
    } catch (error) {
      if (asStatusCode(error) === 403) {
        handleForbidden('Topic moderation is currently unavailable for this account.')
        return
      }
      toast.error(getErrorMessage(error, 'Failed to load forum topics'))
    } finally {
      setTopicsLoading(false)
    }
  }, [handleForbidden, topicsPage])

  const loadAuditLogs = useCallback(async () => {
    setAuditLoading(true)
    try {
      const result = await adminAPI.getAuditLogs(undefined, auditTarget, auditPage, 20)
      setAuditLogs(result)
      setAuthIssue(null)
    } catch (error) {
      if (asStatusCode(error) === 403) {
        handleForbidden('Your account can no longer access admin audit logs. Please log in again.')
        return
      }
      toast.error(getErrorMessage(error, 'Failed to load audit logs'))
    } finally {
      setAuditLoading(false)
    }
  }, [auditPage, auditTarget, handleForbidden])

  useEffect(() => {
    if (activeTab === 'dashboard') loadDashboard()
  }, [activeTab, loadDashboard])

  useEffect(() => {
    if (activeTab === 'users') loadUsers()
  }, [activeTab, loadUsers])

  useEffect(() => {
    if (activeTab === 'reports') loadReports()
  }, [activeTab, loadReports])

  useEffect(() => {
    if (activeTab === 'comments') loadComments()
  }, [activeTab, loadComments])

  useEffect(() => {
    if (activeTab === 'moderation') loadTopics()
  }, [activeTab, loadTopics])

  useEffect(() => {
    if (activeTab === 'audit') loadAuditLogs()
  }, [activeTab, loadAuditLogs])

  const handleWarnUser = async (user: AdminUserSummary) => {
    const message = window.prompt('Warning message', 'Please follow community guidelines.')
    if (!message) return
    try {
      await adminAPI.warnUser(user.id, message)
      toast.success(`Warning issued to ${userDisplayName(user)}`)
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not issue warning'))
    }
  }

  const handleBanToggle = async (user: AdminUserSummary) => {
    const action = user.is_active ? 'suspend' : 'reactivate'
    const confirmed = window.confirm(`Please confirm to ${action} ${userDisplayName(user)}.`)
    if (!confirmed) return

    try {
      if (user.is_active) {
        await adminAPI.banUser(user.id)
        toast.success('User suspended')
      } else {
        await adminAPI.unbanUser(user.id)
        toast.success('User reactivated')
      }
      await loadUsers()
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update user status'))
    }
  }

  const handleAdjustKarma = async (user: AdminUserSummary) => {
    const raw = window.prompt('Enter karma adjustment (e.g., -5 or 10)', '0')
    if (raw === null) return
    const adjustment = Number.parseInt(raw, 10)
    if (Number.isNaN(adjustment)) {
      toast.error('Karma adjustment must be a valid integer')
      return
    }

    try {
      await adminAPI.adjustKarma(user.id, adjustment)
      toast.success('Karma updated')
      await loadUsers()
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update karma'))
    }
  }

  const handleResolveReport = async (report: AdminReport, action: ReportResolveAction) => {
    const confirmed = window.confirm(`Confirm action: ${action.replace('_', ' ')}?`)
    if (!confirmed) return

    try {
      await adminAPI.resolveReport(report.id, action, reportNotes[report.id])
      toast.success('Report updated')
      await loadReports()
      await loadDashboard()
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to resolve report'))
    }
  }

  const handlePauseReport = async (report: AdminReport) => {
    const confirmed = window.confirm('Pause this handshake for investigation?')
    if (!confirmed) return

    try {
      await adminAPI.pauseHandshake(report.id)
      toast.success('Handshake paused')
      await loadReports()
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not pause handshake'))
    }
  }

  const handleLockTopic = async (topicId: string) => {
    try {
      await forumAPI.lockTopic(topicId)
      toast.success('Topic lock state updated')
      await loadTopics()
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update topic lock state'))
    }
  }

  const handlePinTopic = async (topicId: string) => {
    try {
      await forumAPI.pinTopic(topicId)
      toast.success('Topic pin state updated')
      await loadTopics()
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update topic pin state'))
    }
  }

  const handleRemoveComment = async (comment: AdminComment) => {
    if (comment.is_deleted) return
    const confirmed = window.confirm('Remove this comment from public view?')
    if (!confirmed) return

    try {
      await adminAPI.removeComment(comment.id)
      toast.success('Comment removed')
      await loadComments()
    } catch (error) {
      if (asStatusCode(error) === 403) {
        handleForbidden('You no longer have admin access. Please log in again.')
        return
      }
      toast.error(getErrorMessage(error, 'Failed to remove comment'))
    }
  }

  const handleRestoreComment = async (comment: AdminComment) => {
    if (!comment.is_deleted) return
    const confirmed = window.confirm('Restore this comment?')
    if (!confirmed) return

    try {
      await adminAPI.restoreComment(comment.id)
      toast.success('Comment restored')
      await loadComments()
    } catch (error) {
      if (asStatusCode(error) === 403) {
        handleForbidden('You no longer have admin access. Please log in again.')
        return
      }
      toast.error(getErrorMessage(error, 'Failed to restore comment'))
    }
  }

  const summaryCards = useMemo(
    () => [
      { label: 'Total users', value: metrics?.users.total ?? '-' },
      { label: 'Forum posts', value: forumPostsCount ?? '-' },
      { label: 'Flagged reports', value: pendingReportsCount ?? '-' },
      { label: 'Removed comments', value: removedCommentsCount ?? '-' },
    ],
    [metrics, forumPostsCount, pendingReportsCount, removedCommentsCount],
  )

  return (
    <AdminLayout activeTab={activeTab} onTabChange={setActiveTab}>
      <Box p={{ base: 4, md: 8 }}>
        <Box mb={6}>
          <Text fontSize="2xl" fontWeight={800}>Admin Panel</Text>
          <Text color="gray.600" fontSize="sm">Backoffice tools for platform moderation and user management.</Text>
        </Box>

        {authIssue && (
          <AdminReauthBanner
            message={authIssue}
            onReLogin={handleReLogin}
            onDismiss={() => setAuthIssue(null)}
          />
        )}

      {activeTab === 'dashboard' && (
        <Box>
          {dashboardLoading ? (
            <Flex py={10} justify="center"><Spinner /></Flex>
          ) : (
            <>
              <Flex gap={3} wrap="wrap">
                {summaryCards.map((card) => (
                  <Box
                    key={card.label}
                    p={4}
                    borderRadius="12px"
                    border="1px solid #CFE3DA"
                    borderTop="3px solid #2D5C4E"
                    minW="180px"
                    bg="#F8FCFA"
                  >
                    <Text fontSize="sm" color="#2D5C4E">{card.label}</Text>
                    <Text fontSize="2xl" fontWeight={800} color="#1F2937">{card.value}</Text>
                  </Box>
                ))}
              </Flex>

              <Flex mt={4} gap={4} wrap="wrap" align="stretch">
                <Box flex="1" minW={{ base: '100%', lg: '460px' }} border="1px solid #CFE3DA" borderRadius="12px" bg="#F8FCFA" p={4}>
                  <Flex align="center" justify="space-between" mb={3}>
                    <Text fontWeight={700} color="#2D5C4E">Action Needed: Recent Reports</Text>
                    <Button size="xs" variant="outline" onClick={() => setActiveTab('reports')}>Open reports queue</Button>
                  </Flex>

                  {dashboardPendingReports.length === 0 ? (
                    <Text fontSize="sm" color="gray.500">No pending reports right now.</Text>
                  ) : (
                    <Table.ScrollArea borderWidth="1px" borderColor="#E2E8F0" borderRadius="10px">
                      <Table.Root size="sm" variant="line">
                        <Table.Header>
                          <Table.Row>
                            <Table.ColumnHeader>Type</Table.ColumnHeader>
                            <Table.ColumnHeader>Reporter</Table.ColumnHeader>
                            <Table.ColumnHeader>Description</Table.ColumnHeader>
                            <Table.ColumnHeader>Action</Table.ColumnHeader>
                          </Table.Row>
                        </Table.Header>
                        <Table.Body>
                          {dashboardPendingReports.map((report) => (
                            <Table.Row key={report.id}>
                              <Table.Cell>
                                <Badge colorPalette="orange" textTransform="capitalize">{report.type.replace('_', ' ')}</Badge>
                              </Table.Cell>
                              <Table.Cell>{report.reporter_name || 'Unknown'}</Table.Cell>
                              <Table.Cell>
                                <Text maxW="260px" whiteSpace="normal">{report.description}</Text>
                              </Table.Cell>
                              <Table.Cell>
                                <Button size="xs" variant="subtle" colorPalette="blue" borderRadius="8px" onClick={() => navigate(`/report-detail/${report.id}`)}>
                                  Review
                                </Button>
                              </Table.Cell>
                            </Table.Row>
                          ))}
                        </Table.Body>
                      </Table.Root>
                    </Table.ScrollArea>
                  )}
                </Box>

                <Box flex="1" minW={{ base: '100%', lg: '460px' }} border="1px solid #CFE3DA" borderRadius="12px" bg="#F8FCFA" p={4}>
                  <Flex align="center" justify="space-between" mb={3}>
                    <Text fontWeight={700} color="#2D5C4E">Action Needed: Recently Removed Comments</Text>
                    <Button size="xs" variant="outline" onClick={() => setActiveTab('comments')}>Open comments queue</Button>
                  </Flex>

                  {dashboardRemovedComments.length === 0 ? (
                    <Text fontSize="sm" color="gray.500">No removed comments requiring review.</Text>
                  ) : (
                    <Table.ScrollArea borderWidth="1px" borderColor="#E2E8F0" borderRadius="10px">
                      <Table.Root size="sm" variant="line">
                        <Table.Header>
                          <Table.Row>
                            <Table.ColumnHeader>Comment</Table.ColumnHeader>
                            <Table.ColumnHeader>Author</Table.ColumnHeader>
                            <Table.ColumnHeader>Service</Table.ColumnHeader>
                            <Table.ColumnHeader>Action</Table.ColumnHeader>
                          </Table.Row>
                        </Table.Header>
                        <Table.Body>
                          {dashboardRemovedComments.map((comment) => (
                            <Table.Row key={comment.id}>
                              <Table.Cell>
                                <Text maxW="260px" whiteSpace="normal">{comment.body}</Text>
                              </Table.Cell>
                              <Table.Cell>{comment.user_name}</Table.Cell>
                              <Table.Cell>{comment.service_title}</Table.Cell>
                              <Table.Cell>
                                <Button size="xs" colorPalette="green" variant="subtle" borderRadius="8px" onClick={() => setActiveTab('comments')}>
                                  Restore from queue
                                </Button>
                              </Table.Cell>
                            </Table.Row>
                          ))}
                        </Table.Body>
                      </Table.Root>
                    </Table.ScrollArea>
                  )}
                </Box>
              </Flex>

              <Box mt={6} border="1px solid #CFE3DA" borderRadius="12px" bg="#F8FCFA" p={4}>
                <Flex align="center" justify="space-between" mb={3}>
                  <Text fontWeight={700} color="#2D5C4E">Recent Activity</Text>
                  <Button size="xs" variant="outline" onClick={() => setActiveTab('audit')}>View all logs</Button>
                </Flex>
                <AdminActivityFeed limit={10} />
              </Box>
            </>
          )}
        </Box>
      )}

      {activeTab === 'users' && (
        <Box>
          <Flex gap={2} mb={3} wrap="wrap">
            <Input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search users"
              minW="260px"
              maxW="360px"
              bg="white"
            />
            <NativeSelect.Root width="180px" bg="white">
              <NativeSelect.Field
                value={userStatus}
                onChange={(e) => {
                  setUsersPage(1)
                  setUserStatus(e.target.value as 'all' | 'active' | 'banned')
                }}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="banned">Suspended</option>
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Flex>

          {usersLoading ? (
            <Flex py={8} justify="center"><Spinner /></Flex>
          ) : (
            <Table.ScrollArea borderWidth="1px" borderColor="#E2E8F0" borderRadius="12px" bg="white">
              <Table.Root size="sm" variant="line" striped>
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>User</Table.ColumnHeader>
                    <Table.ColumnHeader>Role</Table.ColumnHeader>
                    <Table.ColumnHeader>Status</Table.ColumnHeader>
                    <Table.ColumnHeader>Karma</Table.ColumnHeader>
                    <Table.ColumnHeader>Actions</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {(users?.results || []).map((user) => (
                    <Table.Row key={user.id}>
                      <Table.Cell>
                        <Text fontWeight={600}>{userDisplayName(user)}</Text>
                        <Text fontSize="sm" color="gray.600">{user.email}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge colorPalette={user.role === 'admin' ? 'purple' : 'gray'} textTransform="capitalize">
                          {user.role}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge colorPalette={user.is_active ? 'green' : 'red'}>
                          {user.is_active ? 'active' : 'suspended'}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>{user.karma_score}</Table.Cell>
                      <Table.Cell>
                        <Flex gap={2} wrap="wrap">
                          <Button size="xs" colorPalette="blue" variant="subtle" borderRadius="8px" onClick={() => handleWarnUser(user)}>Warn</Button>
                          <Button size="xs" colorPalette={user.is_active ? 'red' : 'green'} variant="subtle" borderRadius="8px" onClick={() => handleBanToggle(user)}>
                            {user.is_active ? 'Suspend' : 'Activate'}
                          </Button>
                          <Button size="xs" colorPalette="orange" variant="subtle" borderRadius="8px" onClick={() => handleAdjustKarma(user)}>Adjust karma</Button>
                        </Flex>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                  {(users?.results || []).length === 0 && (
                    <Table.Row>
                      <Table.Cell colSpan={5}>
                        <Text py={4} textAlign="center" color="gray.500">No users found for the selected filters.</Text>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Root>
            </Table.ScrollArea>
          )}

          <Flex justify="space-between" mt={3}>
            <Button size="sm" variant="outline" disabled={!users?.previous || usersLoading} onClick={() => setUsersPage((p) => Math.max(1, p - 1))}>Previous</Button>
            <Text fontSize="sm" color="gray.600">{users?.count ?? 0} users</Text>
            <Button size="sm" variant="outline" disabled={!users?.next || usersLoading} onClick={() => setUsersPage((p) => p + 1)}>Next</Button>
          </Flex>
        </Box>
      )}

      {activeTab === 'reports' && (
        <Box>
          <Flex gap={2} mb={3}>
            <NativeSelect.Root width="180px" bg="white">
              <NativeSelect.Field value={reportStatus} onChange={(e) => setReportStatus(e.target.value as ReportStatusFilter)}>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Flex>

          {reportsLoading ? (
            <Flex py={8} justify="center"><Spinner /></Flex>
          ) : (
            <Table.ScrollArea borderWidth="1px" borderColor="#E2E8F0" borderRadius="12px" bg="white">
              <Table.Root size="sm" variant="line">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>Type</Table.ColumnHeader>
                    <Table.ColumnHeader>Reporter</Table.ColumnHeader>
                    <Table.ColumnHeader>Reported</Table.ColumnHeader>
                    <Table.ColumnHeader>Status</Table.ColumnHeader>
                    <Table.ColumnHeader>Description</Table.ColumnHeader>
                    <Table.ColumnHeader>Note</Table.ColumnHeader>
                    <Table.ColumnHeader>Actions</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {(reports?.results || []).map((report) => (
                    <Table.Row key={report.id}>
                      <Table.Cell>
                        <Badge colorPalette="purple" textTransform="capitalize">
                          {report.type.replace('_', ' ')}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>{report.reporter_name || 'Unknown'}</Table.Cell>
                      <Table.Cell>
                        {report.reported_user_name
                          || report.reported_forum_topic_title
                          || report.reported_service_title
                          || 'Content unavailable'}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge colorPalette={report.status === 'pending' ? 'orange' : report.status === 'resolved' ? 'green' : 'gray'}>
                          {report.status}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Text maxW="280px" whiteSpace="normal">{report.description}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Textarea
                          value={reportNotes[report.id] || ''}
                          onChange={(e) => setReportNotes((prev) => ({ ...prev, [report.id]: e.target.value }))}
                          placeholder="Optional note"
                          size="sm"
                          width="180px"
                          minH="52px"
                          bg="white"
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <Flex gap={2} wrap="wrap">
                          <Button size="xs" colorPalette="green" variant="subtle" borderRadius="8px" onClick={() => handleResolveReport(report, 'confirm_no_show')}>Confirm</Button>
                          <Button size="xs" colorPalette="blue" variant="subtle" borderRadius="8px" onClick={() => handleResolveReport(report, 'dismiss')}>Dismiss</Button>
                          <Button size="xs" colorPalette="orange" variant="subtle" borderRadius="8px" onClick={() => handlePauseReport(report)}>Pause</Button>
                        </Flex>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                  {(reports?.results || []).length === 0 && (
                    <Table.Row>
                      <Table.Cell colSpan={7}>
                        <Text py={4} textAlign="center" color="gray.500">No reports available for this status.</Text>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Root>
            </Table.ScrollArea>
          )}
        </Box>
      )}

      {activeTab === 'comments' && (
        <Box>
          <Flex gap={2} mb={3} wrap="wrap">
            <Input
              value={commentSearch}
              onChange={(e) => {
                setCommentsPage(1)
                setCommentSearch(e.target.value)
              }}
              placeholder="Search comments by text, user, or service"
              minW="280px"
              maxW="420px"
              bg="white"
            />
            <NativeSelect.Root width="180px" bg="white">
              <NativeSelect.Field
                value={commentStatus}
                onChange={(e) => {
                  setCommentsPage(1)
                  setCommentStatus(e.target.value as CommentStatusFilter)
                }}
              >
                <option value="active">Active</option>
                <option value="removed">Removed</option>
                <option value="all">All</option>
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Flex>

          {commentsLoading ? (
            <Flex py={8} justify="center"><Spinner /></Flex>
          ) : (
            <Table.ScrollArea borderWidth="1px" borderColor="#E2E8F0" borderRadius="12px" bg="white">
              <Table.Root size="sm" variant="line" striped>
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>Comment</Table.ColumnHeader>
                    <Table.ColumnHeader>Author</Table.ColumnHeader>
                    <Table.ColumnHeader>Service</Table.ColumnHeader>
                    <Table.ColumnHeader>Status</Table.ColumnHeader>
                    <Table.ColumnHeader>Actions</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {(comments?.results || []).map((comment) => (
                    <Table.Row key={comment.id}>
                      <Table.Cell>
                        <Text maxW="360px" whiteSpace="normal">{comment.body}</Text>
                        <Text fontSize="xs" color="gray.500" mt={1}>{new Date(comment.created_at).toLocaleString()}</Text>
                      </Table.Cell>
                      <Table.Cell>{comment.user_name}</Table.Cell>
                      <Table.Cell>{comment.service_title}</Table.Cell>
                      <Table.Cell>
                        <Badge colorPalette={comment.is_deleted ? 'red' : 'green'}>
                          {comment.is_deleted ? 'removed' : 'active'}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        {comment.is_deleted ? (
                          <Button size="xs" colorPalette="green" variant="subtle" borderRadius="8px" onClick={() => handleRestoreComment(comment)}>
                            Restore
                          </Button>
                        ) : (
                          <Button size="xs" colorPalette="red" variant="subtle" borderRadius="8px" onClick={() => handleRemoveComment(comment)}>
                            Remove
                          </Button>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                  {(comments?.results || []).length === 0 && (
                    <Table.Row>
                      <Table.Cell colSpan={5}>
                        <Text py={4} textAlign="center" color="gray.500">No comments found for the selected filters.</Text>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Root>
            </Table.ScrollArea>
          )}

          <Flex justify="space-between" mt={3}>
            <Button
              size="sm"
              variant="outline"
              disabled={!comments?.previous || commentsLoading}
              onClick={() => setCommentsPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Text fontSize="sm" color="gray.600">{comments?.count ?? 0} comments</Text>
            <Button
              size="sm"
              variant="outline"
              disabled={!comments?.next || commentsLoading}
              onClick={() => setCommentsPage((p) => p + 1)}
            >
              Next
            </Button>
          </Flex>
        </Box>
      )}

      {activeTab === 'moderation' && (
        <Box>
          <Box mb={3} p={3} borderRadius="10px" bg="#F8FAFC" border="1px solid #E2E8F0">
            <Text fontSize="sm" color="gray.700">
              Restore/deleted-content review queue is not currently available through backend endpoints. This panel supports topic lock/pin controls.
            </Text>
          </Box>

          {topicsLoading ? (
            <Flex py={8} justify="center"><Spinner /></Flex>
          ) : (
            <Table.ScrollArea borderWidth="1px" borderColor="#E2E8F0" borderRadius="12px" bg="white">
              <Table.Root size="sm" variant="line" striped>
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>Topic</Table.ColumnHeader>
                    <Table.ColumnHeader>Author</Table.ColumnHeader>
                    <Table.ColumnHeader>Replies</Table.ColumnHeader>
                    <Table.ColumnHeader>State</Table.ColumnHeader>
                    <Table.ColumnHeader>Actions</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {(topics?.results || []).map((topic) => (
                    <Table.Row key={topic.id}>
                      <Table.Cell>
                        <Text fontWeight={600}>{topic.title}</Text>
                      </Table.Cell>
                      <Table.Cell>{topic.author_name}</Table.Cell>
                      <Table.Cell>{topic.reply_count}</Table.Cell>
                      <Table.Cell>
                        <Flex gap={2}>
                          <Badge colorPalette={topic.is_locked ? 'red' : 'green'}>{topic.is_locked ? 'locked' : 'open'}</Badge>
                          <Badge colorPalette={topic.is_pinned ? 'yellow' : 'gray'}>{topic.is_pinned ? 'pinned' : 'normal'}</Badge>
                        </Flex>
                      </Table.Cell>
                      <Table.Cell>
                        <Flex gap={2}>
                          <Button size="xs" colorPalette={topic.is_locked ? 'blue' : 'red'} variant="subtle" borderRadius="8px" onClick={() => handleLockTopic(topic.id)}>
                            {topic.is_locked ? 'Unlock' : 'Lock'}
                          </Button>
                          <Button size="xs" colorPalette={topic.is_pinned ? 'green' : 'yellow'} variant="subtle" borderRadius="8px" onClick={() => handlePinTopic(topic.id)}>
                            {topic.is_pinned ? 'Unpin' : 'Pin'}
                          </Button>
                        </Flex>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                  {(topics?.results || []).length === 0 && (
                    <Table.Row>
                      <Table.Cell colSpan={5}>
                        <Text py={4} textAlign="center" color="gray.500">No forum topics found.</Text>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Root>
            </Table.ScrollArea>
          )}

          <Flex justify="space-between" mt={3}>
            <Button size="sm" variant="outline" disabled={!topics?.previous || topicsLoading} onClick={() => setTopicsPage((p) => Math.max(1, p - 1))}>Previous</Button>
            <Text fontSize="sm" color="gray.600">{topics?.count ?? 0} topics</Text>
            <Button size="sm" variant="outline" disabled={!topics?.next || topicsLoading} onClick={() => setTopicsPage((p) => p + 1)}>Next</Button>
          </Flex>
        </Box>
      )}

      {activeTab === 'audit' && (
        <Box>
          <Flex gap={2} mb={3}>
            <NativeSelect.Root width="220px" bg="white">
              <NativeSelect.Field
                value={auditTarget}
                onChange={(e) => {
                  setAuditPage(1)
                  setAuditTarget(e.target.value as AuditTargetFilter)
                }}
              >
                <option value="all">All targets</option>
                <option value="user">Users</option>
                <option value="report">Reports</option>
                <option value="handshake">Handshakes</option>
                <option value="comment">Comments</option>
                <option value="forum_topic">Forum topics</option>
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Flex>

          {auditLoading ? (
            <Flex py={8} justify="center"><Spinner /></Flex>
          ) : (
            <Table.ScrollArea borderWidth="1px" borderColor="#E2E8F0" borderRadius="12px" bg="white">
              <Table.Root size="sm" variant="line" striped>
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>When</Table.ColumnHeader>
                    <Table.ColumnHeader>Admin</Table.ColumnHeader>
                    <Table.ColumnHeader>Action</Table.ColumnHeader>
                    <Table.ColumnHeader>Target</Table.ColumnHeader>
                    <Table.ColumnHeader>Reason</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {(auditLogs?.results || []).map((entry) => (
                    <Table.Row key={entry.id}>
                      <Table.Cell>{new Date(entry.created_at).toLocaleString()}</Table.Cell>
                      <Table.Cell>{entry.admin_name}</Table.Cell>
                      <Table.Cell>
                        <Badge colorPalette="blue" textTransform="capitalize">{formatAuditAction(entry.action_type)}</Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Text fontSize="sm">{entry.target_entity}</Text>
                        <Text fontSize="xs" color="gray.500">{entry.target_id}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text maxW="360px" whiteSpace="normal">{entry.reason || '-'}</Text>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                  {(auditLogs?.results || []).length === 0 && (
                    <Table.Row>
                      <Table.Cell colSpan={5}>
                        <Text py={4} textAlign="center" color="gray.500">No audit logs for selected filters.</Text>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Root>
            </Table.ScrollArea>
          )}

          <Flex justify="space-between" mt={3}>
            <Button size="sm" variant="outline" disabled={!auditLogs?.previous || auditLoading} onClick={() => setAuditPage((p) => Math.max(1, p - 1))}>Previous</Button>
            <Text fontSize="sm" color="gray.600">{auditLogs?.count ?? 0} entries</Text>
            <Button size="sm" variant="outline" disabled={!auditLogs?.next || auditLoading} onClick={() => setAuditPage((p) => p + 1)}>Next</Button>
          </Flex>
        </Box>
      )}
    </Box>
    </AdminLayout>
  )
}

export default AdminDashboard
