import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Box, Flex, Input, Spinner, Stack, Text, Textarea } from '@chakra-ui/react'
import {
  FiUsers, FiAlertTriangle, FiMessageSquare, FiMessageCircle, FiActivity, FiHome, FiBarChart2,
  FiCheck, FiX, FiLink2, FiAlertCircle, FiSlash, FiMapPin, FiClock,
  FiCalendar, FiTrash2, FiPauseCircle, FiArrowUpRight, FiLock, FiUserX,
  FiUnlock, FiBookmark, FiRefreshCw, FiMessageCircle as FiCommentIcon,
} from 'react-icons/fi'
import { toast } from 'sonner'
import { adminAPI, type AuditTargetFilter, type CommentStatusFilter, type ReportResolveAction, type ReportStatusFilter } from '@/services/adminAPI'
import { forumAPI } from '@/services/forumAPI'
import { serviceAPI } from '@/services/serviceAPI'
import AdminReauthBanner from '@/components/AdminReauthBanner'
import AdminLayout from '@/components/AdminLayout'
import AdminActivityFeed from '@/components/AdminActivityFeed'
import { getErrorMessage } from '@/services/api'
import { useAuthStore } from '@/store/useAuthStore'
import type { AdminAuditLog, AdminComment, AdminMetrics, AdminReport, AdminUserSummary, ForumTopic, PaginatedResponse, Service } from '@/types'
import {
  AMBER, AMBER_LT,
  BLUE, BLUE_LT,
  GREEN, GREEN_LT, GREEN_MD,
  GRAY50, GRAY100, GRAY200, GRAY300, GRAY400, GRAY500, GRAY600, GRAY700, GRAY800,
  PURPLE, PURPLE_LT,
  RED, RED_LT,
  WHITE,
} from '@/theme/tokens'

type AdminTab = 'dashboard' | 'users' | 'reports' | 'comments' | 'moderation' | 'audit'

const AVATAR_PALETTE = [GREEN, BLUE, PURPLE, AMBER, '#0D9488', '#EA580C']

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

function asLabel(value: string | null | undefined, fallback = 'N/A') {
  if (!value) return fallback
  return value.replace(/_/g, ' ')
}

function getReportedObjectPath(report: AdminReport): string | null {
  if (report.reported_service) return `/service-detail/${report.reported_service}`
  if (report.reported_forum_topic) return `/forum/topic/${report.reported_forum_topic}`
  if (report.reported_user) return `/admin/users/${report.reported_user}`
  return null
}

function getReportedObjectLabel(report: AdminReport): string {
  return report.reported_user_name
    || report.reported_forum_topic_title
    || report.reported_service_title
    || 'Content unavailable'
}

function hasPendingLinkedHandshake(report: AdminReport): boolean {
  return Boolean(report.related_handshake) && report.handshake_status === 'pending'
}

function isEventNotStartedForNoShow(report: AdminReport): boolean {
  if (report.reported_service_type !== 'Event') return false

  if (report.handshake_scheduled_time) {
    const startMs = new Date(report.handshake_scheduled_time).getTime()
    if (!Number.isNaN(startMs) && startMs > Date.now()) return true
  }

  return ['pending', 'accepted', 'checked_in'].includes(report.handshake_status ?? '')
}

function canCloseReportedService(report: AdminReport): boolean {
  if (!report.reported_service) return false
  if (!report.reported_user || !report.reported_service_owner) return false
  return report.reported_user === report.reported_service_owner
}

function canRemoveReportedUserFromEvent(report: AdminReport): boolean {
  if (!report.related_handshake) return false
  if (report.reported_service_type !== 'Event') return false
  if (!report.reported_user) return false
  if (report.reported_user === report.reported_service_owner) return false
  return ['accepted', 'checked_in', 'reported', 'paused'].includes(report.handshake_status ?? '')
}

// ── Shared modal primitives ────────────────────────────────────────────────────
const ModalBackdrop = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <Box position="fixed" inset={0} zIndex={3000} display="flex" alignItems="center" justifyContent="center" p={4}
    style={{ background: 'rgba(15,23,42,0.48)', backdropFilter: 'blur(2px)' }} onClick={onClick}>
    {children}
  </Box>
)
const ModalCard = ({ maxW = '420px', children, onClick }: { maxW?: string; children: React.ReactNode; onClick: (e: React.MouseEvent) => void }) => (
  <Box bg={WHITE} borderRadius="16px" w="100%" maxW={maxW} border={`1px solid ${GRAY200}`}
    style={{ boxShadow: '0 20px 48px rgba(0,0,0,0.18)' }} onClick={onClick}>
    {children}
  </Box>
)
const ModalHeader = ({ icon, iconBg, iconColor, title, subtitle }: { icon: React.ReactNode; iconBg: string; iconColor: string; title: string; subtitle?: string }) => (
  <Flex align="center" gap="12px" px={5} pt={5} pb={4} borderBottom={`1px solid ${GRAY100}`}>
    <Box w="34px" h="34px" borderRadius="10px" display="flex" alignItems="center" justifyContent="center" flexShrink={0}
      style={{ background: iconBg, color: iconColor }}>
      {icon}
    </Box>
    <Box>
      <Text fontSize="15px" fontWeight={700} color={GRAY800} lineHeight={1.2}>{title}</Text>
      {subtitle && <Text fontSize="12px" color={GRAY400} mt="2px">{subtitle}</Text>}
    </Box>
  </Flex>
)
const ModalFooter = ({ onClose, confirmLabel, accent, accentLt, onConfirm, loading, disabled }: { onClose: () => void; confirmLabel: string; accent: string; accentLt: string; onConfirm: () => void; loading: boolean; disabled?: boolean }) => (
  <Flex px={5} py={4} gap={3} justify="flex-end" borderTop={`1px solid ${GRAY100}`}>
    <Box as="button" px="16px" py="8px" borderRadius="9px" fontSize="13px" fontWeight={500}
      style={{ background: GRAY100, color: GRAY600, border: `1px solid ${GRAY200}`, cursor: 'pointer' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = GRAY200 }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = GRAY100 }}
      onClick={onClose}>Cancel</Box>
    <Box as="button" px="18px" py="8px" borderRadius="9px" fontSize="13px" fontWeight={600}
      style={{ background: accentLt, color: accent, border: `1px solid ${accent}40`, cursor: (loading || disabled) ? 'not-allowed' : 'pointer', opacity: (loading || disabled) ? 0.6 : 1, transition: 'filter 0.12s' }}
      onMouseEnter={(e) => { if (!loading && !disabled) (e.currentTarget as HTMLElement).style.filter = 'brightness(0.9)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = 'none' }}
      onClick={() => { if (!loading && !disabled) onConfirm() }}>
      {loading ? 'Working…' : confirmLabel}
    </Box>
  </Flex>
)
const ModalFieldLabel = ({ children }: { children: React.ReactNode }) => (
  <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb="6px">{children}</Text>
)

// ── AdminConfirmModal ─────────────────────────────────────────────────────────
interface ConfirmModalProps {
  isOpen: boolean; title: string; description: string; confirmLabel: string
  accent: string; accentLt: string; onConfirm: () => void; onClose: () => void; loading: boolean
}
function AdminConfirmModal({ isOpen, title, description, confirmLabel, accent, accentLt, onConfirm, onClose, loading }: ConfirmModalProps) {
  if (!isOpen) return null
  const isDestructive = accent === RED
  return (
    <ModalBackdrop onClick={onClose}>
      <ModalCard onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          icon={isDestructive ? <FiAlertTriangle size={15} /> : <FiAlertCircle size={15} />}
          iconBg={accentLt} iconColor={accent}
          title={title} />
        <Box px={5} py={4}>
          <Text fontSize="13px" color={GRAY500} lineHeight={1.6}>{description}</Text>
        </Box>
        <ModalFooter onClose={onClose} confirmLabel={confirmLabel} accent={accent} accentLt={accentLt} onConfirm={onConfirm} loading={loading} />
      </ModalCard>
    </ModalBackdrop>
  )
}

// ── AdminWarnModal ────────────────────────────────────────────────────────────
interface WarnModalProps { isOpen: boolean; userName: string; onConfirm: (msg: string) => void; onClose: () => void; loading: boolean }
function AdminWarnModal({ isOpen, userName, onConfirm, onClose, loading }: WarnModalProps) {
  const [message, setMessage] = useState('Please follow community guidelines.')
  if (!isOpen) return null
  const canSubmit = !loading && message.trim().length > 0
  return (
    <ModalBackdrop onClick={onClose}>
      <ModalCard maxW="460px" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          icon={<FiAlertCircle size={15} />} iconBg={BLUE_LT} iconColor={BLUE}
          title={`Warn ${userName}`} subtitle="Message will be sent as a warning notification" />
        <Box px={5} py={4}>
          <ModalFieldLabel>Warning message</ModalFieldLabel>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)}
            rows={4} bg={GRAY50} borderColor={GRAY200} borderRadius="10px" fontSize="13px"
            placeholder="Describe the violation and expected behaviour…" />
          <Text fontSize="11px" color={GRAY400} mt={2}>{message.trim().length} chars</Text>
        </Box>
        <ModalFooter onClose={onClose} confirmLabel="Send Warning" accent={BLUE} accentLt={BLUE_LT}
          onConfirm={() => { if (canSubmit) onConfirm(message.trim()) }} loading={loading} disabled={!canSubmit} />
      </ModalCard>
    </ModalBackdrop>
  )
}

// ── AdminKarmaModal ───────────────────────────────────────────────────────────
interface KarmaModalProps { isOpen: boolean; userName: string; onConfirm: (n: number) => void; onClose: () => void; loading: boolean }
function AdminKarmaModal({ isOpen, userName, onConfirm, onClose, loading }: KarmaModalProps) {
  const [value, setValue] = useState('0')
  if (!isOpen) return null
  const num = Number.parseInt(value, 10)
  const isValid = !Number.isNaN(num) && value.trim() !== '' && num !== 0
  return (
    <ModalBackdrop onClick={onClose}>
      <ModalCard maxW="380px" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          icon={<FiBarChart2 size={15} />} iconBg={AMBER_LT} iconColor={AMBER}
          title="Adjust Karma" subtitle={userName} />
        <Box px={5} py={4}>
          <ModalFieldLabel>Amount (use negative to subtract)</ModalFieldLabel>
          <Input value={value} onChange={(e) => setValue(e.target.value)} type="number"
            bg={GRAY50} borderColor={GRAY200} borderRadius="10px" fontSize="14px" />
          {isValid && (
            <Flex align="center" gap="6px" mt={3} px={3} py="8px" borderRadius="8px"
              style={{ background: num > 0 ? GREEN_LT : RED_LT, border: `1px solid ${(num > 0 ? GREEN : RED)}30` }}>
              <Box w="6px" h="6px" borderRadius="full" style={{ background: num > 0 ? GREEN : RED, flexShrink: 0 }} />
              <Text fontSize="12px" fontWeight={600} color={num > 0 ? GREEN : RED}>
                {num > 0 ? `+${num}` : num} karma will be applied to {userName}
              </Text>
            </Flex>
          )}
        </Box>
        <ModalFooter onClose={onClose} confirmLabel="Apply" accent={AMBER} accentLt={AMBER_LT}
          onConfirm={() => { if (!loading && isValid) onConfirm(num) }} loading={loading} disabled={!isValid} />
      </ModalCard>
    </ModalBackdrop>
  )
}


// ── AdminDashboard ────────────────────────────────────────────────────────────
const AdminDashboard = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard')

  const checkAuth = useAuthStore((s) => s.checkAuth)
  const logout = useAuthStore((s) => s.logout)
  const currentUser = useAuthStore((s) => s.user)

  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [forumPostsCount, setForumPostsCount] = useState<number | null>(null)
  const [pendingReportsCount, setPendingReportsCount] = useState<number | null>(null)
  const [removedCommentsCount, setRemovedCommentsCount] = useState<number | null>(null)
  const [dashboardPendingReports, setDashboardPendingReports] = useState<AdminReport[]>([])

  const [usersLoading, setUsersLoading] = useState(false)
  const [users, setUsers] = useState<PaginatedResponse<AdminUserSummary> | null>(null)
  const [userSearch, setUserSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [userStatus, setUserStatus] = useState<'all' | 'active' | 'banned'>('all')
  const [usersPage, setUsersPage] = useState(1)

  const [reportsLoading, setReportsLoading] = useState(false)
  const [reports, setReports] = useState<PaginatedResponse<AdminReport> | null>(null)
  const [reportStatus, setReportStatus] = useState<ReportStatusFilter>('pending')
  const [reportsPage, setReportsPage] = useState(1)
  const [pendingReportCount, setPendingReportCount] = useState<number | null>(null)
  const [reportNotes, setReportNotes] = useState<Record<string, string>>({})
  const [openReportId, setOpenReportId] = useState<string | null>(null)
  const [openReport, setOpenReport] = useState<AdminReport | null>(null)
  const [openReportService, setOpenReportService] = useState<Service | null>(null)
  const [openReportLoading, setOpenReportLoading] = useState(false)
  const [openReportActionLoading, setOpenReportActionLoading] = useState(false)
  const [isNotesExpanded, setIsNotesExpanded] = useState(false)

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

  // ── Modal state ──────────────────────────────────────────────────────────
  const [warnModal,    setWarnModal]    = useState<{ open: boolean; user: AdminUserSummary | null; loading: boolean }>({ open: false, user: null, loading: false })
  const [karmaModal,   setKarmaModal]   = useState<{ open: boolean; user: AdminUserSummary | null; loading: boolean }>({ open: false, user: null, loading: false })
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean; title: string; description: string; confirmLabel: string
    accent: string; accentLt: string; onConfirm: () => Promise<void>
  } | null>(null)
  const [confirmModalLoading, setConfirmModalLoading] = useState(false)

  useEffect(() => {
    checkAuth(true)
  }, [checkAuth])

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
      const result = await adminAPI.getReports(reportStatus, reportsPage, 10)
      setReports(result)
      if (reportStatus === 'pending') setPendingReportCount(result.count)
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
  }, [handleForbidden, reportStatus, reportsPage])

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

  const handleWarnUser = (user: AdminUserSummary) => {
    setWarnModal({ open: true, user, loading: false })
  }

  const submitWarn = async (message: string) => {
    if (!warnModal.user) return
    setWarnModal((prev) => ({ ...prev, loading: true }))
    try {
      await adminAPI.warnUser(warnModal.user.id, message)
      toast.success(`Warning issued to ${userDisplayName(warnModal.user)}`)
      setWarnModal({ open: false, user: null, loading: false })
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not issue warning'))
      setWarnModal((prev) => ({ ...prev, loading: false }))
    }
  }

  const handleBanToggle = (user: AdminUserSummary) => {
    if (currentUser && user.id === currentUser.id) {
      toast.error("You can't suspend your own account.")
      return
    }
    const isBanning = user.is_active
    setConfirmModal({
      open: true,
      title: isBanning ? 'Suspend User' : 'Reactivate User',
      description: `Are you sure you want to ${isBanning ? 'suspend' : 'reactivate'} ${userDisplayName(user)}? ${isBanning ? 'They will lose access to the platform.' : 'They will regain full access.'}`,
      confirmLabel: isBanning ? 'Suspend' : 'Reactivate',
      accent: isBanning ? RED : GREEN,
      accentLt: isBanning ? RED_LT : GREEN_LT,
      onConfirm: async () => {
        if (isBanning) { await adminAPI.banUser(user.id); toast.success('User suspended') }
        else { await adminAPI.unbanUser(user.id); toast.success('User reactivated') }
        await loadUsers()
      },
    })
  }

  const submitConfirmModal = async () => {
    if (!confirmModal) return
    setConfirmModalLoading(true)
    try {
      await confirmModal.onConfirm()
      setConfirmModal(null)
    } catch (error) {
      toast.error(getErrorMessage(error, 'Action failed'))
    } finally {
      setConfirmModalLoading(false)
    }
  }

  const handleAdjustKarma = (user: AdminUserSummary) => {
    setKarmaModal({ open: true, user, loading: false })
  }

  const submitKarma = async (adjustment: number) => {
    if (!karmaModal.user) return
    setKarmaModal((prev) => ({ ...prev, loading: true }))
    try {
      await adminAPI.adjustKarma(karmaModal.user.id, adjustment)
      toast.success('Karma updated')
      await loadUsers()
      setKarmaModal({ open: false, user: null, loading: false })
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update karma'))
      setKarmaModal((prev) => ({ ...prev, loading: false }))
    }
  }

  const handleResolveReport = (report: AdminReport, action: ReportResolveAction) => {
    if (action === 'confirm_no_show' && !report.related_handshake) {
      toast.error('This report has no linked handshake. Confirm no-show is disabled.')
      return
    }
    if (action === 'confirm_no_show' && hasPendingLinkedHandshake(report)) {
      toast.error('Confirm no-show is disabled while handshake status is pending.')
      return
    }
    if (action === 'confirm_no_show' && isEventNotStartedForNoShow(report)) {
      toast.error('Confirm no-show is disabled until the event has started.')
      return
    }
    if (action === 'remove_from_event' && !canRemoveReportedUserFromEvent(report)) {
      toast.error('Remove from event is only available for active reported event participants.')
      return
    }

    const labelMap: Record<string, { title: string; desc: string; label: string; accent: string; accentLt: string }> = {
      confirm_no_show: { title: 'Confirm No-Show', desc: 'Mark this as a no-show incident and resolve the report. This action cannot be undone.', label: 'Confirm no-show', accent: GREEN, accentLt: GREEN_LT },
      dismiss:         { title: 'Dismiss Report',  desc: 'Dismiss this report as unsubstantiated. The reported content will remain visible.', label: 'Dismiss', accent: BLUE, accentLt: BLUE_LT },
      remove_from_event: { title: 'Remove From Event', desc: 'Remove the reported participant from this event and resolve the report.', label: 'Remove participant', accent: RED, accentLt: RED_LT },
    }
    const meta = labelMap[action] ?? { title: `Action: ${action}`, desc: 'Confirm this moderation action.', label: 'Confirm', accent: GREEN, accentLt: GREEN_LT }

    setConfirmModal({
      open: true,
      title: meta.title,
      description: meta.desc,
      confirmLabel: meta.label,
      accent: meta.accent,
      accentLt: meta.accentLt,
      onConfirm: async () => {
        const updated = await adminAPI.resolveReport(report.id, action, reportNotes[report.id])
        setReports((prev) => {
          if (!prev) return prev
          const upserted = prev.results.map((row) => (row.id === updated.id ? updated : row))
          const filtered = reportStatus === 'pending'
            ? upserted.filter((row) => row.status === 'pending')
            : upserted
          return {
            ...prev,
            results: filtered,
            count: reportStatus === 'pending'
              ? Math.max(0, prev.count - (upserted.length - filtered.length))
              : prev.count,
          }
        })
        toast.success('Report updated')
        void loadReports()
        void loadDashboard()
      },
    })
  }

  const handlePauseReport = (report: AdminReport) => {
    if (!report.related_handshake) {
      toast.error('This report has no linked handshake. Pause is disabled.')
      return
    }
    if (hasPendingLinkedHandshake(report)) {
      toast.error('Pause handshake is disabled while handshake status is pending.')
      return
    }

    setConfirmModal({
      open: true,
      title: 'Pause Handshake',
      description: 'Pause the linked handshake while this report is under investigation. Both parties will be notified.',
      confirmLabel: 'Pause handshake',
      accent: AMBER,
      accentLt: AMBER_LT,
      onConfirm: async () => {
        await adminAPI.pauseHandshake(report.id)
        toast.success('Handshake paused')
        void loadReports()
      },
    })
  }

  const closeOpenReport = useCallback(() => {
    setOpenReportId(null)
    setOpenReport(null)
    setOpenReportService(null)
    setOpenReportLoading(false)
  }, [])

  const closeOpenReportPanel = useCallback(() => {
    closeOpenReport()
    navigate('/admin?tab=reports', { replace: true })
  }, [closeOpenReport, navigate])

  const openReportPanel = useCallback(async (reportId: string) => {
    if (openReportId === reportId) return

    setOpenReportId(reportId)
    setIsNotesExpanded(false)
    setOpenReportLoading(true)
    setOpenReportService(null)
    try {
      const detail = await adminAPI.getReport(reportId)
      setOpenReport(detail)

      if (detail.reported_service) {
        try {
          const service = await serviceAPI.get(detail.reported_service)
          setOpenReportService(service)
        } catch {
          // Keep report panel usable even if service endpoint is unavailable.
          setOpenReportService(null)
        }
      }

      setReportNotes((prev) => ({
        ...prev,
        [reportId]: prev[reportId] ?? detail.admin_notes ?? '',
      }))
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load report detail'))
      // Clear state AND remove the ?reportId= URL param to prevent the useEffect
      // from re-triggering openReportPanel in an infinite retry loop.
      setOpenReportId(null)
      setOpenReport(null)
      setOpenReportService(null)
      setOpenReportLoading(false)
      navigate('/admin?tab=reports', { replace: true })
    } finally {
      setOpenReportLoading(false)
    }
  }, [navigate, openReportId])

  const resolveOpenReport = useCallback((action: ReportResolveAction) => {
    if (!openReport) return
    if (action === 'confirm_no_show' && !openReport.related_handshake) {
      toast.error('This report has no linked handshake. Confirm no-show is disabled.')
      return
    }
    if (action === 'confirm_no_show' && hasPendingLinkedHandshake(openReport)) {
      toast.error('Confirm no-show is disabled while handshake status is pending.')
      return
    }
    if (action === 'confirm_no_show' && isEventNotStartedForNoShow(openReport)) {
      toast.error('Confirm no-show is disabled until the event has started.')
      return
    }
    if (action === 'remove_from_event' && !canRemoveReportedUserFromEvent(openReport)) {
      toast.error('Remove from event is only available for active reported event participants.')
      return
    }
    const labelMap: Record<string, { title: string; desc: string; label: string; accent: string; accentLt: string }> = {
      confirm_no_show: { title: 'Confirm No-Show', desc: 'Mark this as a no-show incident and resolve the report.', label: 'Confirm no-show', accent: GREEN, accentLt: GREEN_LT },
      dismiss:         { title: 'Dismiss Report',  desc: 'Dismiss this report. The reported content will remain visible.', label: 'Dismiss', accent: BLUE, accentLt: BLUE_LT },
      remove_from_event: { title: 'Remove From Event', desc: 'Remove the reported participant from this event and resolve the report.', label: 'Remove participant', accent: RED, accentLt: RED_LT },
    }
    const meta = labelMap[action] ?? { title: `Action: ${action}`, desc: 'Confirm this moderation action.', label: 'Confirm', accent: GREEN, accentLt: GREEN_LT }
    setConfirmModal({
      open: true, title: meta.title, description: meta.desc, confirmLabel: meta.label,
      accent: meta.accent, accentLt: meta.accentLt,
      onConfirm: async () => {
        setOpenReportActionLoading(true)
        try {
          const updated = await adminAPI.resolveReport(openReport.id, action, reportNotes[openReport.id])
          setOpenReport(updated)
          toast.success('Report updated')
          void loadReports()
          void loadDashboard()
        } finally { setOpenReportActionLoading(false) }
      },
    })
  }, [loadDashboard, loadReports, openReport, reportNotes])

  const pauseOpenReport = useCallback(() => {
    if (!openReport) return
    if (!openReport.related_handshake) {
      toast.error('This report has no linked handshake. Pause is disabled.')
      return
    }
    if (hasPendingLinkedHandshake(openReport)) {
      toast.error('Pause handshake is disabled while handshake status is pending.')
      return
    }
    setConfirmModal({
      open: true, title: 'Pause Handshake',
      description: 'Pause the linked handshake while this report is under investigation. Both parties will be notified.',
      confirmLabel: 'Pause handshake', accent: AMBER, accentLt: AMBER_LT,
      onConfirm: async () => {
        setOpenReportActionLoading(true)
        try {
          await adminAPI.pauseHandshake(openReport.id)
          const refreshed = await adminAPI.getReport(openReport.id)
          setOpenReport(refreshed)
          toast.success('Handshake paused')
          void loadReports()
          void loadDashboard()
        } catch (error) {
          toast.error(getErrorMessage(error, 'Could not pause handshake'))
        } finally { setOpenReportActionLoading(false) }
      },
    })
  }, [loadDashboard, loadReports, openReport])

  const requestOpenReport = useCallback((reportId: string) => {
    if (openReportId && openReportId !== reportId) {
      toast.info('Please close the current report first.')
      return
    }
    navigate(`/admin?tab=reports&reportId=${encodeURIComponent(reportId)}`)
  }, [navigate, openReportId])

  const warnOpenReportOwner = useCallback(async () => {
    if (!openReport) return
    const ownerUserId = openReport.reported_service_owner || openReport.reported_user
    const ownerName = openReport.reported_service_owner_name || openReport.reported_user_name || 'service owner'
    if (!ownerUserId) return

    const warningMessage = (reportNotes[openReport.id] || '').trim() || `Warning issued for report ${openReport.id}`
    setConfirmModal({
      open: true, title: `Warn ${ownerName}`,
      description: `Issue a formal warning to ${ownerName}. The warning will be logged and visible to admins.`,
      confirmLabel: 'Send warning', accent: AMBER, accentLt: AMBER_LT,
      onConfirm: async () => {
        setOpenReportActionLoading(true)
        try {
          await adminAPI.warnUser(ownerUserId, warningMessage)
          const refreshed = await adminAPI.getReport(openReport.id)
          setOpenReport(refreshed)
          toast.success('Warning sent to owner')
          void loadReports()
          void loadDashboard()
        } catch (error) {
          toast.error(getErrorMessage(error, 'Failed to warn owner'))
        } finally { setOpenReportActionLoading(false) }
      },
    })
  }, [loadDashboard, loadReports, openReport, reportNotes])

  const suspendOpenReportOwner = useCallback(async () => {
    if (!openReport) return
    const ownerUserId = openReport.reported_service_owner || openReport.reported_user
    const ownerName = openReport.reported_service_owner_name || openReport.reported_user_name || 'service owner'
    if (!ownerUserId) return

    setConfirmModal({
      open: true, title: `Suspend ${ownerName}`,
      description: `Suspend ${ownerName}'s account. They will lose access to the platform until reactivated by an admin.`,
      confirmLabel: 'Suspend account', accent: RED, accentLt: RED_LT,
      onConfirm: async () => {
        setOpenReportActionLoading(true)
        try {
          await adminAPI.banUser(ownerUserId)
          const refreshed = await adminAPI.getReport(openReport.id)
          setOpenReport(refreshed)
          toast.success('Owner suspended')
          void loadReports()
          void loadDashboard()
        } catch (error) {
          toast.error(getErrorMessage(error, 'Failed to suspend owner'))
        } finally { setOpenReportActionLoading(false) }
      },
    })
  }, [loadDashboard, loadReports, openReport])

  const deleteOpenReportedForumContent = useCallback(async () => {
    if (!openReport) return

    const hasReply = !!openReport.reported_forum_post
    const targetId = hasReply ? openReport.reported_forum_post : openReport.reported_forum_topic
    if (!targetId) {
      toast.error('No forum content is linked to this report.')
      return
    }

    const targetLabel = hasReply ? 'reply' : 'topic'
    setConfirmModal({
      open: true, title: `Delete Forum ${targetLabel.charAt(0).toUpperCase() + targetLabel.slice(1)}`,
      description: `Permanently delete this forum ${targetLabel}. This action cannot be undone and will be logged.`,
      confirmLabel: `Delete ${targetLabel}`, accent: RED, accentLt: RED_LT,
      onConfirm: async () => {
        setOpenReportActionLoading(true)
        try {
          if (hasReply) { await forumAPI.deletePost(targetId) }
          else { await forumAPI.deleteTopic(targetId) }
          toast.success(`Reported forum ${targetLabel} deleted`)
          void loadReports()
          void loadDashboard()
          try {
            const refreshed = await adminAPI.getReport(openReport.id)
            setOpenReport(refreshed)
          } catch { closeOpenReport() }
        } catch (error) {
          toast.error(getErrorMessage(error, `Failed to delete reported forum ${targetLabel}`))
        } finally { setOpenReportActionLoading(false) }
      },
    })
  }, [closeOpenReport, loadDashboard, loadReports, openReport])

  const closeOpenReportedService = useCallback(async () => {
    if (!openReport) return

    const serviceId = openReport.reported_service
    if (!serviceId) {
      toast.error('No service is linked to this report.')
      return
    }

    if (openReport.reported_service_status === 'Cancelled' || openReportService?.status === 'Cancelled') {
      toast.info('This service is already closed.')
      return
    }

    setConfirmModal({
      open: true, title: 'Close Reported Service',
      description: 'Remove this service from active listings. The service will be cancelled and no longer visible to users.',
      confirmLabel: 'Close service', accent: RED, accentLt: RED_LT,
      onConfirm: async () => {
    setOpenReportActionLoading(true)
    try {
      await serviceAPI.delete(serviceId)
      toast.success('Reported service closed')
      void loadReports()
      void loadDashboard()

      try {
        const refreshed = await adminAPI.getReport(openReport.id)
        setOpenReport(refreshed)
      } catch {
        closeOpenReport()
      }

      setOpenReportService((prev) => (prev ? { ...prev, status: 'Cancelled' } : prev))
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to close reported service'))
    } finally {
      setOpenReportActionLoading(false)
    }
      },
    })
  }, [closeOpenReport, loadDashboard, loadReports, openReport, openReportService])

  useEffect(() => {
    const tabParam = searchParams.get('tab')
    const reportIdParam = searchParams.get('reportId')
    const validTabs: AdminTab[] = ['dashboard', 'users', 'reports', 'comments', 'moderation', 'audit']

    if (reportIdParam) {
      if (activeTab !== 'reports') {
        setActiveTab('reports')
      }
      if (openReportId !== reportIdParam) {
        void openReportPanel(reportIdParam)
      }
      return
    }

    if (!reportIdParam && openReportId) {
      closeOpenReport()
    }

    if (tabParam && validTabs.includes(tabParam as AdminTab) && activeTab !== tabParam) {
      setActiveTab(tabParam as AdminTab)
    }
  }, [activeTab, closeOpenReport, openReportId, openReportPanel, searchParams])

  const handleTabChange = useCallback((tab: AdminTab) => {
    setActiveTab(tab)
    closeOpenReport()
    if (tab === 'dashboard') {
      navigate('/admin', { replace: true })
    } else {
      navigate(`/admin?tab=${tab}`, { replace: true })
    }
  }, [closeOpenReport, navigate])

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

  const handleRemoveComment = (comment: AdminComment) => {
    if (comment.is_deleted) return
    setConfirmModal({
      open: true, title: 'Remove Comment',
      description: 'Hide this comment from public view. It can be restored later by an admin.',
      confirmLabel: 'Remove comment', accent: RED, accentLt: RED_LT,
      onConfirm: async () => {
        try {
          await adminAPI.removeComment(comment.id)
          toast.success('Comment removed')
          void loadComments()
        } catch (error) {
          if (asStatusCode(error) === 403) { handleForbidden('You no longer have admin access. Please log in again.'); return }
          toast.error(getErrorMessage(error, 'Failed to remove comment'))
        }
      },
    })
  }

  const handleRestoreComment = (comment: AdminComment) => {
    if (!comment.is_deleted) return
    setConfirmModal({
      open: true, title: 'Restore Comment',
      description: 'Make this comment visible to the public again.',
      confirmLabel: 'Restore comment', accent: GREEN, accentLt: GREEN_LT,
      onConfirm: async () => {
        try {
          await adminAPI.restoreComment(comment.id)
          toast.success('Comment restored')
          void loadComments()
        } catch (error) {
          if (asStatusCode(error) === 403) { handleForbidden('You no longer have admin access. Please log in again.'); return }
          toast.error(getErrorMessage(error, 'Failed to restore comment'))
        }
      },
    })
  }

  const TAB_META: Record<AdminTab, { title: string; subtitle: string; icon: React.ReactNode }> = {
    dashboard: { title: 'Admin Panel', subtitle: 'Platform overview and moderation tools', icon: <FiHome size={16} /> },
    users:     { title: 'User Management', subtitle: 'Search, warn, suspend or reactivate users', icon: <FiUsers size={16} /> },
    reports:   { title: 'Reports & Flags', subtitle: 'Review and resolve reported content', icon: <FiAlertTriangle size={16} /> },
    comments:  { title: 'Comment Moderation', subtitle: 'Remove or restore flagged comments', icon: <FiMessageSquare size={16} /> },
    moderation:{ title: 'Forum Topics', subtitle: 'Lock, pin, or moderate forum content', icon: <FiMessageCircle size={16} /> },
    audit:     { title: 'Audit Logs', subtitle: 'Complete history of admin actions', icon: <FiActivity size={16} /> },
  }

  return (
    <>
    <AdminLayout activeTab={activeTab} onTabChange={handleTabChange}>
      {/* ── Sticky tab header ─────────────────────────────────────────────── */}
      <Box
        px={{ base: 4, md: 6 }} py="14px"
        bg={WHITE} borderBottom={`1px solid ${GRAY100}`}
        position="sticky" top={0} zIndex={20}
      >
        <Flex align="center" justify="space-between">
          <Flex align="center" gap="10px">
            <Box
              w="32px" h="32px" borderRadius="9px" flexShrink={0}
              display="flex" alignItems="center" justifyContent="center"
              style={{ background: GREEN_LT, color: GREEN }}
            >
              {TAB_META[activeTab].icon}
            </Box>
            <Box>
              <Text fontSize="15px" fontWeight={800} color={GRAY800} lineHeight={1.2}>{TAB_META[activeTab].title}</Text>
              <Text fontSize="11px" color={GRAY400} mt="1px">{TAB_META[activeTab].subtitle}</Text>
            </Box>
          </Flex>
          <Box
            px="10px" py="4px" borderRadius="8px"
            style={{ background: GREEN_LT, color: GREEN, fontSize: '11px', fontWeight: 700, border: `1px solid ${GREEN_MD}` }}
          >
            Admin Mode
          </Box>
        </Flex>
      </Box>

      {/* ── Page body ─────────────────────────────────────────────────────── */}
      <Box p={{ base: 4, md: 6 }} bg={GRAY50} minH="100%">
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
            <Flex py={16} justify="center" direction="column" align="center" gap={3}>
              <Spinner size="lg" color={GREEN} />
              <Text fontSize="13px" color={GRAY400}>Loading dashboard…</Text>
            </Flex>
          ) : (
            <Stack gap={4}>
              {/* ── Metric cards ── */}
              <Flex gap={3} wrap="wrap">
                {[
                  { label: 'Total Users',     value: metrics?.users.total ?? '—', icon: FiUsers,         accent: GREEN, accentLt: GREEN_LT },
                  { label: 'Forum Posts',      value: forumPostsCount ?? '—',      icon: FiBarChart2,     accent: BLUE,  accentLt: BLUE_LT  },
                  { label: 'Flagged Reports',  value: pendingReportsCount ?? '—',  icon: FiAlertTriangle, accent: AMBER, accentLt: AMBER_LT },
                  { label: 'Removed Comments', value: removedCommentsCount ?? '—', icon: FiMessageSquare, accent: RED,   accentLt: RED_LT   },
                ].map((card) => (
                  <Box key={card.label} flex="1" minW="150px"
                    bg={WHITE} borderRadius="12px" border={`1px solid ${GRAY200}`} p={4}
                    style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <Flex align="center" gap="8px" mb="10px">
                      <Box w="28px" h="28px" borderRadius="8px" flexShrink={0}
                        display="flex" alignItems="center" justifyContent="center"
                        style={{ background: card.accentLt, color: card.accent }}>
                        <card.icon size={13} />
                      </Box>
                      <Text fontSize="12px" fontWeight={500} color={GRAY500}>{card.label}</Text>
                    </Flex>
                    <Text fontSize="26px" fontWeight={700} color={GRAY800} lineHeight={1}>{card.value}</Text>
                  </Box>
                ))}
              </Flex>

              {/* ── Pending Reports ── */}
              <Box bg={WHITE} borderRadius="12px" border={`1px solid ${GRAY200}`} overflow="hidden"
                style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <Flex align="center" justify="space-between" px={5} py="14px" borderBottom={`1px solid ${GRAY100}`}>
                  <Flex align="center" gap="8px">
                    <FiAlertTriangle size={14} color={AMBER} />
                    <Box>
                      <Text fontSize="14px" fontWeight={600} color={GRAY800}>Pending Reports</Text>
                      <Text fontSize="11px" color={GRAY400}>Reports awaiting moderation</Text>
                    </Box>
                  </Flex>
                  <Box as="button" px="10px" py="5px" borderRadius="8px" fontSize="12px" fontWeight={500}
                    style={{ background: WHITE, border: `1px solid ${GRAY200}`, color: GRAY600, cursor: 'pointer' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = GRAY50 }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = WHITE }}
                    onClick={() => setActiveTab('reports')}>
                    Open queue
                  </Box>
                </Flex>

                {dashboardPendingReports.length === 0 ? (
                  <Flex py={10} justify="center" direction="column" align="center" gap={2}>
                    <FiAlertTriangle size={18} color={GRAY300} />
                    <Text fontSize="13px" color={GRAY400}>No pending reports right now.</Text>
                  </Flex>
                ) : (
                  <Box overflowX="auto">
                    <Box minW="560px">
                      {/* Header */}
                      <Flex px={5} py="9px" bg={GRAY50} borderBottom={`1px solid ${GRAY200}`} align="center">
                        <Box w="120px" flexShrink={0}>
                          <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em">Type</Text>
                        </Box>
                        <Box w="140px" flexShrink={0}>
                          <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em">Reporter · Reported</Text>
                        </Box>
                        <Box flex={1}>
                          <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em">Description</Text>
                        </Box>
                        <Box w="70px" flexShrink={0} />
                      </Flex>

                      {dashboardPendingReports.map((report, idx) => {
                        const TYPE_ACCENT: Record<string, string> = {
                          harassment: RED, scam: RED, spam: AMBER,
                          service_issue: BLUE, inappropriate_content: PURPLE,
                          no_show: GRAY500,
                        }
                        const accent = TYPE_ACCENT[report.type] ?? GRAY500
                        const isLast = idx === dashboardPendingReports.length - 1
                        return (
                          <Flex key={report.id} align="center" px={5} py="13px"
                            borderBottom={isLast ? 'none' : `1px solid ${GRAY100}`}
                            style={{ cursor: 'pointer', transition: 'background 0.12s', borderLeft: `3px solid ${accent}` }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = GRAY50 }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '' }}
                            onClick={() => { setActiveTab('reports'); requestOpenReport(report.id) }}>

                            {/* Type */}
                            <Box w="120px" flexShrink={0}>
                              <Box display="inline-flex" px="7px" py="2px" borderRadius="6px" fontSize="11px" fontWeight={500}
                                style={{ background: accent + '18', color: accent, whiteSpace: 'nowrap' }}>
                                {({ harassment:'Harassment', scam:'Scam', spam:'Spam', service_issue:'Service Issue', inappropriate_content:'Inappropriate', no_show:'No-Show' } as Record<string,string>)[report.type] ?? report.type.replace(/_/g,' ')}
                              </Box>
                            </Box>

                            {/* Reporter / Reported */}
                            <Box w="140px" flexShrink={0} pr={2}>
                              <Text fontSize="12px" fontWeight={500} color={GRAY700}
                                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {report.reporter_name || '—'}
                              </Text>
                              {report.reported_user_name && (
                                <Text fontSize="11px" color={GRAY400}
                                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {report.reported_user_name}
                                </Text>
                              )}
                            </Box>

                            {/* Description */}
                            <Box flex={1} minW={0} pr={3}>
                              <Text fontSize="12px" color={GRAY500}
                                style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>
                                {report.description}
                              </Text>
                            </Box>

                            {/* Review */}
                            <Box w="70px" flexShrink={0} onClick={(e) => e.stopPropagation()}>
                              <Box as="button" px="10px" py="4px" borderRadius="7px" fontSize="12px" fontWeight={500}
                                style={{ background: GREEN_LT, color: GREEN, border: `1px solid ${GREEN}30`, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                onClick={() => { setActiveTab('reports'); requestOpenReport(report.id) }}>
                                Review
                              </Box>
                            </Box>
                          </Flex>
                        )
                      })}
                    </Box>
                  </Box>
                )}
              </Box>

              {/* ── Recent Activity ── */}
              <Box bg={WHITE} borderRadius="12px" border={`1px solid ${GRAY200}`} overflow="hidden"
                style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <Flex align="center" justify="space-between" px={5} py="14px" borderBottom={`1px solid ${GRAY100}`}>
                  <Flex align="center" gap="8px">
                    <FiActivity size={14} color={GREEN} />
                    <Box>
                      <Text fontSize="14px" fontWeight={600} color={GRAY800}>Recent Activity</Text>
                      <Text fontSize="11px" color={GRAY400}>Latest admin actions and system events</Text>
                    </Box>
                  </Flex>
                  <Box as="button" px="10px" py="5px" borderRadius="8px" fontSize="12px" fontWeight={500}
                    style={{ background: WHITE, border: `1px solid ${GRAY200}`, color: GRAY600, cursor: 'pointer' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = GRAY50 }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = WHITE }}
                    onClick={() => setActiveTab('audit')}>
                    View all logs
                  </Box>
                </Flex>
                <Box px={5} py={4}>
                  <AdminActivityFeed limit={10} />
                </Box>
              </Box>
            </Stack>
          )}
        </Box>
      )}

      {activeTab === 'users' && (
        <Box>
          {/* ── Filter bar ── */}
          <Flex gap={3} mb={4} align="center" wrap="wrap">
            <Input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search by name or email…"
              bg={WHITE} borderColor={GRAY200} borderRadius="8px" fontSize="13px"
              style={{ height: '36px', flex: '1 1 200px', maxWidth: '340px' }}
            />
            <Flex gap={2}>
              {([['all', 'All'], ['active', 'Active'], ['banned', 'Suspended']] as const).map(([val, label]) => {
                const on = userStatus === val
                const accent = val === 'active' ? GREEN : val === 'banned' ? RED : GRAY600
                return (
                  <Box as="button" key={val} px="12px" borderRadius="full" fontSize="12px" fontWeight={500}
                    style={{
                      height: '32px', display: 'inline-flex', alignItems: 'center',
                      background: on ? (val === 'active' ? GREEN_LT : val === 'banned' ? RED_LT : GRAY100) : WHITE,
                      border: `1px solid ${on ? accent + '40' : GRAY200}`,
                      color: on ? accent : GRAY500,
                      cursor: 'pointer', transition: 'all 0.12s',
                    }}
                    onClick={() => { setUsersPage(1); setUserStatus(val) }}
                  >{label}</Box>
                )
              })}
            </Flex>
            {users?.count != null && (
              <Text fontSize="12px" color={GRAY400} ml="auto">{users.count} users</Text>
            )}
          </Flex>

          {/* ── Table card ── */}
          <Box bg={WHITE} borderRadius="12px" border={`1px solid ${GRAY200}`} overflow="hidden"
            style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            {usersLoading ? (
              <Flex py={12} justify="center"><Spinner color={GREEN} /></Flex>
            ) : (users?.results || []).length === 0 ? (
              <Flex py={12} justify="center" direction="column" align="center" gap={2}>
                <FiUsers size={20} color={GRAY300} />
                <Text fontSize="13px" color={GRAY400}>No users match the current filters</Text>
              </Flex>
            ) : (
              <Box overflowX="auto"><Box minW="560px">
                {/* Header */}
                <Flex px={5} py="10px" bg={GRAY50} borderBottom={`1px solid ${GRAY200}`} align="center">
                  {[['User','flex'],['Role','90px'],['Status','100px'],['Karma','70px'],['','108px']].map(([h,w]) => (
                    <Box key={h} w={w==='flex'?undefined:w} flex={w==='flex'?1:undefined} flexShrink={0}>
                      {h && <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em">{h}</Text>}
                    </Box>
                  ))}
                </Flex>
                {/* Rows */}
                {(users?.results || []).map((user, idx) => {
                  const name = userDisplayName(user)
                  const initials = [user.first_name?.[0], user.last_name?.[0]].filter(Boolean).join('').toUpperCase() || user.email[0].toUpperCase()
                  const avatarColor = AVATAR_PALETTE[name.charCodeAt(0) % AVATAR_PALETTE.length]
                  const isSelf = currentUser?.id === user.id
                  const isLast = idx === (users?.results || []).length - 1
                  const mkUserBtn = (title: string, icon: React.ReactNode, bg: string, border: string, color: string, onClick: () => void, disabled?: boolean) => (
                    <Box as="button" title={title}
                      style={{ background:bg, border:`1px solid ${border}`, color, cursor:disabled?'not-allowed':'pointer', opacity:disabled?0.3:1, width:'24px', height:'24px', display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:'6px', flexShrink:0, transition:'filter 0.1s' }}
                      onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.filter='brightness(0.88)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter='none' }}
                      onClick={disabled ? undefined : onClick}>{icon}</Box>
                  )
                  return (
                    <Flex key={user.id} align="center" px={5} py="12px"
                      borderBottom={isLast ? 'none' : `1px solid ${GRAY100}`}
                      style={{ transition:'background 0.12s' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background=GRAY50 }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background='' }}>
                      {/* User */}
                      <Flex flex={1} minW={0} align="center" gap="10px" pr={3}>
                        <Flex w="32px" h="32px" borderRadius="full" flexShrink={0} align="center" justify="center"
                          style={{ background:avatarColor, color:WHITE, fontSize:'12px', fontWeight:700, overflow:'hidden' }}>
                          {user.avatar_url
                            ? <img src={user.avatar_url} alt={initials} style={{ width:'32px', height:'32px', objectFit:'cover' }} />
                            : initials}
                        </Flex>
                        <Box minW={0}>
                          <Text fontSize="13px" fontWeight={600} color={GRAY800}
                            style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer' }}
                            onClick={() => navigate(`/admin/users/${user.id}`, { state: { from: 'users' } })}
                            _hover={{ color: GREEN }}>{name}</Text>
                          <Text fontSize="11px" color={GRAY400}
                            style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user.email}</Text>
                        </Box>
                      </Flex>
                      {/* Role */}
                      <Box w="90px" flexShrink={0}>
                        {(() => {
                          const roleMeta: Record<string, { label: string; bg: string; color: string }> = {
                            super_admin: { label: 'Super Admin', bg: RED_LT,    color: RED    },
                            admin:       { label: 'Admin',       bg: PURPLE_LT, color: PURPLE },
                            moderator:   { label: 'Moderator',   bg: AMBER_LT,  color: AMBER  },
                          }
                          const meta = roleMeta[user.role] ?? { label: 'Member', bg: GRAY100, color: GRAY600 }
                          return (
                            <Box display="inline-flex" px="7px" py="2px" borderRadius="6px" fontSize="11px" fontWeight={500}
                              style={{ background: meta.bg, color: meta.color }}>
                              {meta.label}
                            </Box>
                          )
                        })()}
                      </Box>
                      {/* Status */}
                      <Box w="100px" flexShrink={0}>
                        <Flex align="center" gap="5px" display="inline-flex">
                          <Box w="6px" h="6px" borderRadius="full" flexShrink={0}
                            style={{ background:user.is_active?GREEN:RED }} />
                          <Text fontSize="12px" color={user.is_active?GRAY600:GRAY400}>
                            {user.is_active ? 'Active' : 'Suspended'}
                          </Text>
                        </Flex>
                      </Box>
                      {/* Karma */}
                      <Box w="70px" flexShrink={0}>
                        <Text fontSize="13px" fontWeight={600} color={GRAY700}>{user.karma_score}</Text>
                      </Box>
                      {/* Actions */}
                      <Flex w="108px" flexShrink={0} justify="flex-end" gap="4px">
                        {mkUserBtn('View profile', <FiArrowUpRight size={11}/>, GRAY100, GRAY200, GRAY600, () => navigate(`/admin/users/${user.id}`, { state: { from: 'users' } }))}
                        {mkUserBtn('Warn user', <FiAlertCircle size={11}/>, BLUE_LT, BLUE+'40', BLUE, () => handleWarnUser(user), isSelf)}
                        {mkUserBtn(user.is_active?'Suspend user':'Activate user',
                          user.is_active ? <FiSlash size={11}/> : <FiCheck size={11}/>,
                          user.is_active ? RED_LT : GREEN_LT,
                          (user.is_active ? RED : GREEN)+'40',
                          user.is_active ? RED : GREEN,
                          () => handleBanToggle(user), isSelf)}
                        {mkUserBtn('Adjust karma', <FiBarChart2 size={11}/>, AMBER_LT, AMBER+'40', AMBER, () => handleAdjustKarma(user))}
                      </Flex>
                    </Flex>
                  )
                })}
              </Box></Box>
            )}
          </Box>

          {/* ── Pagination ── */}
          {(users?.count ?? 0) > 10 && (
            <Flex justify="space-between" align="center" mt={3} px={1}>
              <Box as="button" px="12px" py="6px" borderRadius="8px" fontSize="13px" fontWeight={500}
                style={{ background: WHITE, border: `1px solid ${GRAY200}`, color: (!users?.previous || usersLoading) ? GRAY300 : GRAY600, cursor: (!users?.previous || usersLoading) ? 'not-allowed' : 'pointer' }}
                onClick={() => { if (users?.previous && !usersLoading) setUsersPage((p) => Math.max(1, p - 1)) }}>
                ← Previous
              </Box>
              <Text fontSize="12px" color={GRAY400}>{users?.count ?? 0} users total</Text>
              <Box as="button" px="12px" py="6px" borderRadius="8px" fontSize="13px" fontWeight={500}
                style={{ background: WHITE, border: `1px solid ${GRAY200}`, color: (!users?.next || usersLoading) ? GRAY300 : GRAY600, cursor: (!users?.next || usersLoading) ? 'not-allowed' : 'pointer' }}
                onClick={() => { if (users?.next && !usersLoading) setUsersPage((p) => p + 1) }}>
                Next →
              </Box>
            </Flex>
          )}
        </Box>
      )}

      {activeTab === 'reports' && (() => {
        // Icon-only button for the table row — label shown as native tooltip
        const mkBtn = (label: string, icon: React.ReactNode, color: string, bg: string, border: string, onClick: () => void, disabled?: boolean) => (
          <Box as="button" title={label}
            style={{ background: bg, border: `1px solid ${border}`, color, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.3 : 1, width: '24px', height: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', flexShrink: 0, transition: 'filter 0.1s ease' }}
            onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.filter = 'brightness(0.88)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = 'none' }}
            onClick={onClick}>{icon}</Box>
        )
        const typeAccentMap: Record<string, string> = {
          harassment: RED, scam: RED, spam: AMBER, service_issue: BLUE,
          inappropriate_content: PURPLE, no_show: GRAY500, other: GRAY400,
        }
        const typeLabelMap: Record<string, string> = {
          no_show: 'No-Show', inappropriate_content: 'Inappropriate', service_issue: 'Service Issue',
          spam: 'Spam', scam: 'Scam / Fraud', harassment: 'Harassment', other: 'Other',
        }
        const statusMeta: Record<string, { color: string; bg: string }> = {
          pending: { color: AMBER, bg: AMBER_LT },
          resolved: { color: GREEN, bg: GREEN_LT },
          dismissed: { color: GRAY500, bg: GRAY100 },
        }
        const FILTERS: { value: ReportStatusFilter; label: string }[] = [
          { value: 'pending', label: 'Pending' },
          { value: 'resolved', label: 'Resolved' },
          { value: 'dismissed', label: 'Dismissed' },
        ]

        return (
          <Box>
            {/* ── Filter pills ── */}
            <Flex gap={2} mb={4} align="center">
              {FILTERS.map(({ value, label }) => {
                const active = reportStatus === value
                const meta = statusMeta[value]
                const showBadge = value === 'pending' && pendingReportCount != null && pendingReportCount > 0
                return (
                  <Box as="button" key={value}
                    style={{
                      background: active ? meta.bg : WHITE,
                      border: `1.5px solid ${active ? meta.color + '60' : GRAY200}`,
                      color: active ? meta.color : GRAY500,
                      cursor: 'pointer', height: '28px',
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      borderRadius: '20px', padding: '0 12px',
                      fontSize: '12px', fontWeight: 700,
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = GRAY300 }}
                    onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = GRAY200 }}
                    onClick={() => { setReportStatus(value); setReportsPage(1) }}
                  >
                    {label}
                    {showBadge && (
                      <Box style={{
                        background: RED, color: WHITE,
                        borderRadius: '999px', fontSize: '10px', fontWeight: 800,
                        minWidth: '16px', height: '16px', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', padding: '0 4px', lineHeight: 1,
                      }}>
                        {pendingReportCount > 99 ? '99+' : pendingReportCount}
                      </Box>
                    )}
                  </Box>
                )
              })}
            </Flex>

            {/* ── Table card ── */}
            <Box bg={WHITE} borderRadius="12px" border={`1px solid ${GRAY200}`} overflow="hidden"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>

              {reportsLoading ? (
                <Flex py={14} justify="center"><Spinner color={GREEN} /></Flex>
              ) : (reports?.results || []).length === 0 ? (
                <Flex py={14} justify="center" direction="column" align="center" gap={2}>
                  <FiAlertTriangle size={20} color={GRAY300} />
                  <Text fontSize="13px" color={GRAY400}>No {reportStatus} reports</Text>
                </Flex>
              ) : (
                /* Scroll wrapper keeps the card border-radius while allowing horizontal scroll */
                <Box overflowX="auto">
                  <Box minW="580px">
                  {/* Table header */}
                  <Flex px={5} py="10px" bg={GRAY50} borderBottom={`1px solid ${GRAY200}`} align="center">
                    <Box w="110px" flexShrink={0}>
                      <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em">Type</Text>
                    </Box>
                    <Box w="140px" flexShrink={0}>
                      <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em">Reporter · Reported</Text>
                    </Box>
                    <Box flex={1}>
                      <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em">Description</Text>
                    </Box>
                    <Box w="46px" flexShrink={0} textAlign="right">
                      <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em">Date</Text>
                    </Box>
                    <Box w="108px" flexShrink={0} />
                  </Flex>

                  {/* Rows */}
                  {(reports?.results || []).map((report, idx) => {
                    const typeAccent = typeAccentMap[report.type] || GRAY500
                    const reportedPath = getReportedObjectPath(report)
                    const isLast = idx === (reports?.results || []).length - 1
                    return (
                      <Flex key={report.id} align="center" px={5} py="10px"
                        borderBottom={isLast ? 'none' : `1px solid ${GRAY100}`}
                        style={{ cursor: 'pointer', transition: 'background 0.12s', borderLeft: `3px solid ${typeAccent}` }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = GRAY50 }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '' }}
                        onClick={() => requestOpenReport(report.id)}>

                        {/* Type */}
                        <Box w="110px" flexShrink={0}>
                          <Box display="inline-flex" px="7px" py="2px" borderRadius="6px" fontSize="11px" fontWeight={500}
                            style={{ background: typeAccent + '18', color: typeAccent, whiteSpace: 'nowrap' }}>
                            {typeLabelMap[report.type] || report.type}
                          </Box>
                          {report.related_handshake && (
                            <Flex align="center" gap="3px" display="inline-flex" px="5px" py="1px" borderRadius="4px"
                              ml="4px" style={{ background: BLUE_LT, color: BLUE, fontSize: '9px', fontWeight: 600 }}>
                              <FiLink2 size={7} />HS
                            </Flex>
                          )}
                        </Box>

                        {/* Reporter / Reported */}
                        <Box w="140px" flexShrink={0} pr={2}>
                          <Text fontSize="12px" fontWeight={500} color={GRAY700}
                            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {report.reporter_name || '—'}
                          </Text>
                          <Text fontSize="11px" color={GRAY400}
                            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {getReportedObjectLabel(report)}
                            {reportedPath && (
                              <Box as="span" ml="4px" style={{ cursor: 'pointer', color: GREEN }}
                                onClick={(e) => { e.stopPropagation(); navigate(reportedPath) }}>
                                ↗
                              </Box>
                            )}
                          </Text>
                        </Box>

                        {/* Description */}
                        <Box flex={1} minW={0} pr={3}>
                          <Text fontSize="12px" color={GRAY500}
                            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>
                            {report.description}
                          </Text>
                        </Box>

                        {/* Date */}
                        <Box w="46px" flexShrink={0} textAlign="right" pr={1}>
                          <Text fontSize="11px" color={GRAY400} style={{ whiteSpace: 'nowrap' }}>
                            {new Date(report.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </Text>
                        </Box>

                        {/* Actions — icon-only, label shown as native tooltip on hover */}
                        <Flex w="136px" flexShrink={0} justify="flex-end" gap="4px" pl={2}
                          onClick={(e) => e.stopPropagation()}>
                          {mkBtn('Detail', <FiArrowUpRight size={11} />, GRAY700, GRAY100, GRAY200, () => requestOpenReport(report.id))}
                          {mkBtn('No-show', <FiCheck size={11} />, GREEN, GREEN_LT, GREEN + '40', () => handleResolveReport(report, 'confirm_no_show'), !report.related_handshake || hasPendingLinkedHandshake(report) || isEventNotStartedForNoShow(report))}
                          {mkBtn('Dismiss', <FiX size={11} />, BLUE, BLUE_LT, BLUE + '40', () => handleResolveReport(report, 'dismiss'))}
                          {mkBtn('Remove', <FiUserX size={11} />, RED, RED_LT, RED + '40', () => handleResolveReport(report, 'remove_from_event'), !canRemoveReportedUserFromEvent(report))}
                          {mkBtn('Pause', <FiPauseCircle size={11} />, AMBER, AMBER_LT, AMBER + '40', () => handlePauseReport(report), !report.related_handshake || hasPendingLinkedHandshake(report))}
                        </Flex>
                      </Flex>
                    )
                  })}
                  </Box>
                </Box>
              )}
            </Box>

            {/* ── Pagination ── */}
            {(reports?.count ?? 0) > 10 && (
              <Flex justify="space-between" align="center" mt={3} px={1}>
                <Box as="button" px="12px" py="6px" borderRadius="8px" fontSize="13px" fontWeight={500}
                  style={{ background: WHITE, border: `1px solid ${GRAY200}`, color: (!reports?.previous || reportsLoading) ? GRAY300 : GRAY600, cursor: (!reports?.previous || reportsLoading) ? 'not-allowed' : 'pointer' }}
                  onClick={() => { if (reports?.previous && !reportsLoading) setReportsPage((p) => Math.max(1, p - 1)) }}>
                  ← Previous
                </Box>
                <Text fontSize="12px" color={GRAY400}>
                  Page {reportsPage} of {Math.ceil((reports?.count ?? 0) / 10)} · {reports?.count} total
                </Text>
                <Box as="button" px="12px" py="6px" borderRadius="8px" fontSize="13px" fontWeight={500}
                  style={{ background: WHITE, border: `1px solid ${GRAY200}`, color: (!reports?.next || reportsLoading) ? GRAY300 : GRAY600, cursor: (!reports?.next || reportsLoading) ? 'not-allowed' : 'pointer' }}
                  onClick={() => { if (reports?.next && !reportsLoading) setReportsPage((p) => p + 1) }}>
                  Next →
                </Box>
              </Flex>
            )}
          </Box>
        )
      })()}

      {activeTab === 'comments' && (
        <Box>
          {/* Filter bar */}
          <Flex gap={3} mb={4} align="center" wrap="wrap">
            <Input value={commentSearch}
              onChange={(e) => { setCommentsPage(1); setCommentSearch(e.target.value) }}
              placeholder="Search comments…"
              bg={WHITE} borderColor={GRAY200} borderRadius="8px" fontSize="13px"
              style={{ height: '36px', flex: '1 1 200px', maxWidth: '340px' }} />
            <Flex gap={2}>
              {([['active','Active'], ['removed','Removed'], ['all','All']] as const).map(([val, label]) => {
                const on = commentStatus === val
                const accent = val === 'removed' ? RED : val === 'active' ? GREEN : GRAY600
                return (
                  <Box as="button" key={val} px="12px" borderRadius="full" fontSize="12px" fontWeight={500}
                    style={{ height:'32px', display:'inline-flex', alignItems:'center', cursor:'pointer', transition:'all 0.12s',
                      background: on ? (val==='removed' ? RED_LT : val==='active' ? GREEN_LT : GRAY100) : WHITE,
                      border: `1px solid ${on ? accent+'40' : GRAY200}`, color: on ? accent : GRAY500 }}
                    onClick={() => { setCommentsPage(1); setCommentStatus(val) }}>{label}</Box>
                )
              })}
            </Flex>
            {comments?.count != null && <Text fontSize="12px" color={GRAY400} ml="auto">{comments.count} comments</Text>}
          </Flex>

          {/* Table card */}
          <Box bg={WHITE} borderRadius="12px" border={`1px solid ${GRAY200}`} overflow="hidden"
            style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            {commentsLoading ? (
              <Flex py={12} justify="center"><Spinner color={GREEN} /></Flex>
            ) : (comments?.results || []).length === 0 ? (
              <Flex py={12} justify="center" direction="column" align="center" gap={2}>
                <FiCommentIcon size={20} color={GRAY300} />
                <Text fontSize="13px" color={GRAY400}>No comments match the current filters</Text>
              </Flex>
            ) : (
              <Box overflowX="auto"><Box minW="560px">
                {/* Header */}
                <Flex px={5} py="10px" bg={GRAY50} borderBottom={`1px solid ${GRAY200}`} align="center">
                  {[['Author', '130px'], ['Comment', 'flex'], ['Service', '140px'], ['Status', '76px'], ['', '56px']].map(([h, w]) => (
                    <Box key={h} w={w === 'flex' ? undefined : w} flex={w === 'flex' ? 1 : undefined} flexShrink={0}>
                      {h && <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em">{h}</Text>}
                    </Box>
                  ))}
                </Flex>
                {(comments?.results || []).map((comment, idx) => {
                  const isLast = idx === (comments?.results || []).length - 1
                  return (
                    <Flex key={comment.id} align="flex-start" px={5} py="10px"
                      borderBottom={isLast ? 'none' : `1px solid ${GRAY100}`}
                      style={{ transition: 'background 0.12s' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = GRAY50 }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '' }}>
                      {/* Author */}
                      <Box w="130px" flexShrink={0} pr={2}>
                        <Text fontSize="13px" fontWeight={600} color={GRAY800}
                          style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {comment.user_name}
                        </Text>
                        <Text fontSize="11px" color={GRAY400}>
                          {new Date(comment.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}
                        </Text>
                      </Box>
                      {/* Comment */}
                      <Box flex={1} minW={0} pr={3}>
                        <Text fontSize="12px" color={GRAY600} style={{ lineHeight: 1.55, whiteSpace: 'normal' }}>
                          {comment.body}
                        </Text>
                      </Box>
                      {/* Service */}
                      <Box w="140px" flexShrink={0} pr={2}>
                        <Text fontSize="12px" color={GRAY500} style={{ lineHeight: 1.55, whiteSpace: 'normal' }}>
                          {comment.service_title || '—'}
                        </Text>
                      </Box>
                      {/* Status */}
                      <Box w="76px" flexShrink={0}>
                        <Box display="inline-flex" px="7px" py="2px" borderRadius="6px" fontSize="11px" fontWeight={500}
                          style={{ background: comment.is_deleted ? RED_LT : GREEN_LT, color: comment.is_deleted ? RED : GREEN }}>
                          {comment.is_deleted ? 'Removed' : 'Active'}
                        </Box>
                      </Box>
                      {/* Actions */}
                      <Flex w="56px" flexShrink={0} justify="flex-end" gap="4px">
                        <Box as="button" title="View service"
                          style={{ background:GRAY100, border:`1px solid ${GRAY200}`, color:GRAY600, cursor:'pointer', width:'24px', height:'24px', display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:'6px', flexShrink:0 }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter='brightness(0.88)' }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter='none' }}
                          onClick={() => navigate(`/service-detail/${comment.service}`)}>
                          <FiArrowUpRight size={11} />
                        </Box>
                        {comment.is_deleted ? (
                          <Box as="button" title="Restore comment"
                            style={{ background:GREEN_LT, border:`1px solid ${GREEN}40`, color:GREEN, cursor:'pointer', width:'24px', height:'24px', display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:'6px', flexShrink:0 }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter='brightness(0.88)' }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter='none' }}
                            onClick={() => handleRestoreComment(comment)}>
                            <FiRefreshCw size={11} />
                          </Box>
                        ) : (
                          <Box as="button" title="Remove comment"
                            style={{ background:RED_LT, border:`1px solid ${RED}40`, color:RED, cursor:'pointer', width:'24px', height:'24px', display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:'6px', flexShrink:0 }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter='brightness(0.88)' }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter='none' }}
                            onClick={() => handleRemoveComment(comment)}>
                            <FiTrash2 size={11} />
                          </Box>
                        )}
                      </Flex>
                    </Flex>
                  )
                })}
              </Box></Box>
            )}
          </Box>

          {(comments?.count ?? 0) > 10 && (
            <Flex justify="space-between" align="center" mt={3} px={1}>
              <Box as="button" px="12px" py="6px" borderRadius="8px" fontSize="13px" fontWeight={500}
                style={{ background:WHITE, border:`1px solid ${GRAY200}`, color:(!comments?.previous||commentsLoading)?GRAY300:GRAY600, cursor:(!comments?.previous||commentsLoading)?'not-allowed':'pointer' }}
                onClick={() => { if (comments?.previous&&!commentsLoading) setCommentsPage((p)=>Math.max(1,p-1)) }}>← Previous</Box>
              <Text fontSize="12px" color={GRAY400}>{comments?.count} total</Text>
              <Box as="button" px="12px" py="6px" borderRadius="8px" fontSize="13px" fontWeight={500}
                style={{ background:WHITE, border:`1px solid ${GRAY200}`, color:(!comments?.next||commentsLoading)?GRAY300:GRAY600, cursor:(!comments?.next||commentsLoading)?'not-allowed':'pointer' }}
                onClick={() => { if (comments?.next&&!commentsLoading) setCommentsPage((p)=>p+1) }}>Next →</Box>
            </Flex>
          )}
        </Box>
      )}

      {activeTab === 'moderation' && (
        <Box>
          {/* Info banner */}
          <Flex mb={4} px={4} py="10px" borderRadius="10px" align="center" gap={2}
            style={{ background: BLUE_LT, border:`1px solid ${BLUE}25` }}>
            <FiLock size={13} color={BLUE} style={{ flexShrink:0 }} />
            <Text fontSize="12px" fontWeight={500} color={BLUE}>
              Lock/pin controls are available. Deleted-content review requires direct backend access.
            </Text>
            {topics?.count != null && (
              <Text fontSize="12px" color={BLUE} ml="auto" fontWeight={600} flexShrink={0}>{topics.count} topics</Text>
            )}
          </Flex>

          {/* Table card */}
          <Box bg={WHITE} borderRadius="12px" border={`1px solid ${GRAY200}`} overflow="hidden"
            style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            {topicsLoading ? (
              <Flex py={12} justify="center"><Spinner color={GREEN} /></Flex>
            ) : (topics?.results || []).length === 0 ? (
              <Flex py={12} justify="center" direction="column" align="center" gap={2}>
                <FiMessageSquare size={20} color={GRAY300} />
                <Text fontSize="13px" color={GRAY400}>No forum topics found</Text>
              </Flex>
            ) : (
              <Box overflowX="auto"><Box minW="540px">
                {/* Header */}
                <Flex px={5} py="10px" bg={GRAY50} borderBottom={`1px solid ${GRAY200}`} align="center">
                  {[['Topic','flex'], ['Author','120px'], ['Replies','70px'], ['State','120px'], ['','80px']].map(([h,w]) => (
                    <Box key={h} w={w==='flex'?undefined:w} flex={w==='flex'?1:undefined} flexShrink={0}>
                      {h && <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em">{h}</Text>}
                    </Box>
                  ))}
                </Flex>
                {(topics?.results || []).map((topic, idx) => {
                  const isLast = idx === (topics?.results || []).length - 1
                  return (
                    <Flex key={topic.id} align="center" px={5} py="10px"
                      borderBottom={isLast ? 'none' : `1px solid ${GRAY100}`}
                      style={{ transition:'background 0.12s' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = GRAY50 }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '' }}>
                      {/* Topic */}
                      <Box flex={1} minW={0} pr={3}>
                        <Text fontSize="13px" fontWeight={600} color={GRAY800}
                          style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {topic.title}
                        </Text>
                      </Box>
                      {/* Author */}
                      <Box w="120px" flexShrink={0} pr={2}>
                        <Text fontSize="12px" color={GRAY600}
                          style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {topic.author_name}
                        </Text>
                      </Box>
                      {/* Replies */}
                      <Box w="70px" flexShrink={0}>
                        <Text fontSize="12px" fontWeight={600} color={GRAY700}>{topic.reply_count}</Text>
                      </Box>
                      {/* State */}
                      <Flex w="120px" flexShrink={0} gap={1}>
                        <Box display="inline-flex" px="6px" py="2px" borderRadius="6px" fontSize="10px" fontWeight={600}
                          style={{ background: topic.is_locked ? RED_LT : GREEN_LT, color: topic.is_locked ? RED : GREEN, whiteSpace:'nowrap' }}>
                          {topic.is_locked ? 'Locked' : 'Open'}
                        </Box>
                        {topic.is_pinned && (
                          <Box display="inline-flex" px="6px" py="2px" borderRadius="6px" fontSize="10px" fontWeight={600}
                            style={{ background: AMBER_LT, color: AMBER }}>Pinned</Box>
                        )}
                      </Flex>
                      {/* Actions */}
                      <Flex w="80px" flexShrink={0} justify="flex-end" gap="4px">
                        <Box as="button" title="View topic"
                          style={{ background:GRAY100, border:`1px solid ${GRAY200}`, color:GRAY600, cursor:'pointer', width:'24px', height:'24px', display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:'6px', flexShrink:0 }}
                          onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.filter='brightness(0.88)'}}
                          onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.filter='none'}}
                          onClick={() => navigate(`/forum/topic/${topic.id}`)}>
                          <FiArrowUpRight size={11} />
                        </Box>
                        <Box as="button" title={topic.is_locked ? 'Unlock topic' : 'Lock topic'}
                          style={{ background: topic.is_locked ? BLUE_LT : RED_LT, border:`1px solid ${(topic.is_locked?BLUE:RED)}40`, color: topic.is_locked?BLUE:RED, cursor:'pointer', width:'24px', height:'24px', display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:'6px', flexShrink:0 }}
                          onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.filter='brightness(0.88)'}}
                          onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.filter='none'}}
                          onClick={() => handleLockTopic(topic.id)}>
                          {topic.is_locked ? <FiUnlock size={11} /> : <FiLock size={11} />}
                        </Box>
                        <Box as="button" title={topic.is_pinned ? 'Unpin topic' : 'Pin topic'}
                          style={{ background: topic.is_pinned ? GREEN_LT : AMBER_LT, border:`1px solid ${(topic.is_pinned?GREEN:AMBER)}40`, color: topic.is_pinned?GREEN:AMBER, cursor:'pointer', width:'24px', height:'24px', display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:'6px', flexShrink:0 }}
                          onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.filter='brightness(0.88)'}}
                          onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.filter='none'}}
                          onClick={() => handlePinTopic(topic.id)}>
                          <FiBookmark size={11} />
                        </Box>
                      </Flex>
                    </Flex>
                  )
                })}
              </Box></Box>
            )}
          </Box>

          {(topics?.count ?? 0) > 10 && (
            <Flex justify="space-between" align="center" mt={3} px={1}>
              <Box as="button" px="12px" py="6px" borderRadius="8px" fontSize="13px" fontWeight={500}
                style={{ background:WHITE, border:`1px solid ${GRAY200}`, color:(!topics?.previous||topicsLoading)?GRAY300:GRAY600, cursor:(!topics?.previous||topicsLoading)?'not-allowed':'pointer' }}
                onClick={() => { if (topics?.previous&&!topicsLoading) setTopicsPage((p)=>Math.max(1,p-1)) }}>← Previous</Box>
              <Text fontSize="12px" color={GRAY400}>{topics?.count} total</Text>
              <Box as="button" px="12px" py="6px" borderRadius="8px" fontSize="13px" fontWeight={500}
                style={{ background:WHITE, border:`1px solid ${GRAY200}`, color:(!topics?.next||topicsLoading)?GRAY300:GRAY600, cursor:(!topics?.next||topicsLoading)?'not-allowed':'pointer' }}
                onClick={() => { if (topics?.next&&!topicsLoading) setTopicsPage((p)=>p+1) }}>Next →</Box>
            </Flex>
          )}
        </Box>
      )}

      {activeTab === 'audit' && (() => {
        const auditActionColor = (action: string): { bg: string; color: string } => {
          const a = action.toLowerCase()
          if (a.includes('ban') || a.includes('suspend') || a.includes('remove') || a.includes('delete')) return { bg: RED_LT, color: RED }
          if (a.includes('warn')) return { bg: AMBER_LT, color: AMBER }
          if (a.includes('unlock') || a.includes('restore') || a.includes('unban') || a.includes('confirm')) return { bg: GREEN_LT, color: GREEN }
          if (a.includes('lock') || a.includes('dismiss') || a.includes('pause')) return { bg: BLUE_LT, color: BLUE }
          return { bg: GRAY100, color: GRAY600 }
        }
        const auditTargetLabels: Record<string, string> = {
          all: 'All', user: 'Users', report: 'Reports', handshake: 'Handshakes', comment: 'Comments', forum_topic: 'Topics',
        }
        return (
          <Box>
            {/* Filter pills */}
            <Flex gap={2} mb={4} align="center" wrap="wrap">
              {(Object.entries(auditTargetLabels) as [AuditTargetFilter, string][]).map(([val, label]) => {
                const on = auditTarget === val
                return (
                  <Box as="button" key={val} px="12px" borderRadius="full" fontSize="12px" fontWeight={500}
                    style={{ height:'32px', display:'inline-flex', alignItems:'center', cursor:'pointer', transition:'all 0.12s',
                      background: on ? GRAY800 : WHITE, border:`1px solid ${on ? GRAY800 : GRAY200}`, color: on ? WHITE : GRAY500 }}
                    onClick={() => { setAuditPage(1); setAuditTarget(val) }}>{label}</Box>
                )
              })}
              {auditLogs?.count != null && (
                <Text fontSize="12px" color={GRAY400} ml="auto">{auditLogs.count} entries</Text>
              )}
            </Flex>

            {/* Table card */}
            <Box bg={WHITE} borderRadius="12px" border={`1px solid ${GRAY200}`} overflow="hidden"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              {auditLoading ? (
                <Flex py={12} justify="center"><Spinner color={GREEN} /></Flex>
              ) : (auditLogs?.results || []).length === 0 ? (
                <Flex py={12} justify="center" direction="column" align="center" gap={2}>
                  <FiActivity size={20} color={GRAY300} />
                  <Text fontSize="13px" color={GRAY400}>No audit log entries for the selected filter</Text>
                </Flex>
              ) : (
                <Box overflowX="auto"><Box minW="580px">
                  {/* Header */}
                  <Flex px={5} py="10px" bg={GRAY50} borderBottom={`1px solid ${GRAY200}`} align="center">
                    {[['Action','130px'], ['Target','110px'], ['Admin','120px'], ['Reason','flex'], ['Date','76px']].map(([h,w]) => (
                      <Box key={h} w={w==='flex'?undefined:w} flex={w==='flex'?1:undefined} flexShrink={0}>
                        <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em">{h}</Text>
                      </Box>
                    ))}
                  </Flex>
                  {(auditLogs?.results || []).map((entry, idx) => {
                    const isLast = idx === (auditLogs?.results || []).length - 1
                    const ac = auditActionColor(entry.action_type)
                    return (
                      <Flex key={entry.id} align="flex-start" px={5} py="10px"
                        borderBottom={isLast ? 'none' : `1px solid ${GRAY100}`}
                        style={{ transition:'background 0.12s' }}
                        onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.background=GRAY50}}
                        onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.background=''}}>
                        {/* Action */}
                        <Box w="130px" flexShrink={0} pr={2}>
                          <Box display="inline-flex" px="7px" py="2px" borderRadius="6px" fontSize="11px" fontWeight={600}
                            style={{ background:ac.bg, color:ac.color, whiteSpace:'nowrap' }}>
                            {formatAuditAction(entry.action_type)}
                          </Box>
                        </Box>
                        {/* Target */}
                        <Box w="110px" flexShrink={0} pr={2}>
                          <Text fontSize="12px" fontWeight={500} color={GRAY700}
                            style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {entry.target_entity}
                          </Text>
                          <Text fontSize="10px" color={GRAY400}
                            style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {String(entry.target_id).slice(0, 8)}…
                          </Text>
                        </Box>
                        {/* Admin */}
                        <Box w="120px" flexShrink={0} pr={2}>
                          <Text fontSize="12px" fontWeight={600} color={GRAY800}
                            style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {entry.admin_name}
                          </Text>
                        </Box>
                        {/* Reason */}
                        <Box flex={1} minW={0} pr={3}>
                          <Text fontSize="12px" color={GRAY500} style={{ lineHeight: 1.55, whiteSpace: 'normal' }}>
                            {entry.reason || '—'}
                          </Text>
                        </Box>
                        {/* Date */}
                        <Box w="76px" flexShrink={0}>
                          <Text fontSize="11px" color={GRAY400}>
                            {new Date(entry.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}
                          </Text>
                          <Text fontSize="10px" color={GRAY300}>
                            {new Date(entry.created_at).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}
                          </Text>
                        </Box>
                      </Flex>
                    )
                  })}
                </Box></Box>
              )}
            </Box>

            {(auditLogs?.count ?? 0) > 10 && (
              <Flex justify="space-between" align="center" mt={3} px={1}>
                <Box as="button" px="12px" py="6px" borderRadius="8px" fontSize="13px" fontWeight={500}
                  style={{ background:WHITE, border:`1px solid ${GRAY200}`, color:(!auditLogs?.previous||auditLoading)?GRAY300:GRAY600, cursor:(!auditLogs?.previous||auditLoading)?'not-allowed':'pointer' }}
                  onClick={() => { if (auditLogs?.previous&&!auditLoading) setAuditPage((p)=>Math.max(1,p-1)) }}>← Previous</Box>
                <Text fontSize="12px" color={GRAY400}>{auditLogs?.count} total</Text>
                <Box as="button" px="12px" py="6px" borderRadius="8px" fontSize="13px" fontWeight={500}
                  style={{ background:WHITE, border:`1px solid ${GRAY200}`, color:(!auditLogs?.next||auditLoading)?GRAY300:GRAY600, cursor:(!auditLogs?.next||auditLoading)?'not-allowed':'pointer' }}
                  onClick={() => { if (auditLogs?.next&&!auditLoading) setAuditPage((p)=>p+1) }}>Next →</Box>
              </Flex>
            )}
          </Box>
        )
      })()}

      {activeTab === 'reports' && openReportId && (
        <Box position="fixed" inset={0} zIndex={1500} style={{ background: 'rgba(15,23,42,0.36)', backdropFilter: 'blur(2px)' }} onClick={closeOpenReportPanel}>
          <Box
            position="absolute" top={0} right={0} h="100vh"
            w={{ base: '100%', md: '740px', lg: '820px' }}
            bg={WHITE} borderLeft={`1px solid ${GRAY200}`}
            style={{ boxShadow: '-16px 0 48px rgba(0,0,0,0.14)' }}
            overflowY="auto" onClick={(e) => e.stopPropagation()}
          >
            {/* Panel header */}
            <Flex
              px={{ base: 4, md: 5 }} py="14px" align="center" justify="space-between"
              bg={WHITE} borderBottom={`1px solid ${GRAY100}`}
              position="sticky" top={0} zIndex={10}
            >
              <Flex align="center" gap="10px">
                <Box w="32px" h="32px" borderRadius="9px" display="flex" alignItems="center" justifyContent="center" flexShrink={0}
                  style={{ background: AMBER_LT, color: AMBER }}>
                  <FiAlertTriangle size={14} />
                </Box>
                <Box>
                  <Text fontSize="14px" fontWeight={700} color={GRAY800} lineHeight={1.2}>Report Detail</Text>
                  <Text fontSize="11px" color={GRAY400}>Quick review · click outside to close</Text>
                </Box>
              </Flex>
              <Box as="button" w="28px" h="28px" borderRadius="7px" display="flex" alignItems="center" justifyContent="center"
                style={{ background: GRAY100, border: `1px solid ${GRAY200}`, color: GRAY500, cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = GRAY200 }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = GRAY100 }}
                onClick={closeOpenReportPanel}>
                <FiX size={13} />
              </Box>
            </Flex>
            <Box p={{ base: 4, md: 5 }}>

            {openReportLoading ? (
              <Flex py={10} justify="center"><Spinner /></Flex>
            ) : !openReport ? (
              <Text fontSize="sm" color={GRAY600}>Report could not be loaded.</Text>
            ) : (
              <>
                {(() => {
                  const reportedProfilePath = openReport.reported_user ? `/admin/users/${openReport.reported_user}` : null
                  const reporterProfilePath = openReport.reporter ? `/admin/users/${openReport.reporter}` : null
                  const reportedServicePath = openReport.reported_service ? `/service-detail/${openReport.reported_service}` : null
                  const ownerUserId = openReport.reported_service_owner || openReport.reported_user || null
                  const hasReportedUserInfo = !!(openReport.reported_user_name || openReport.reported_user_email || openReport.reported_user_karma_score != null)
                  const hasReportedUserCard = hasReportedUserInfo || !!ownerUserId
                  const hasServiceInfo = !!(
                    openReport.reported_service
                    || openReport.reported_service_title
                    || openReport.reported_service_type
                    || openReport.reported_service_status
                    || openReport.reported_service_description
                    || openReport.reported_service_location
                    || openReport.reported_service_hours != null
                    || openReportService
                  )
                  const serviceType = openReport.reported_service_type || openReportService?.type
                  const serviceStatus = openReport.reported_service_status || openReportService?.status
                  const serviceTitle = openReport.reported_service_title || openReportService?.title
                  const serviceDescription = openReport.reported_service_description || openReportService?.description
                  const serviceLocation = openReport.reported_service_location
                    || (openReportService
                      ? (openReportService.location_type === 'Online'
                        ? 'Online'
                        : (openReportService.location_area || asLabel(openReportService.location_type)))
                      : null)
                  const serviceHours = openReport.reported_service_hours
                    ?? (openReportService?.duration != null ? Number(openReportService.duration) : null)
                  const hasForumInfo = !!(
                    openReport.reported_forum_topic
                    || openReport.reported_forum_topic_title
                    || openReport.reported_forum_post
                    || openReport.reported_forum_post_excerpt
                  )
                  const isForumReport = !!(openReport.reported_forum_topic || openReport.reported_forum_post)
                  const isServiceReport = !!openReport.reported_service
                  const canCloseServiceFromReport = canCloseReportedService(openReport)
                  const isServiceAlreadyClosed = openReport.reported_service_status === 'Cancelled' || openReportService?.status === 'Cancelled'
                  const forumTopicPath = openReport.reported_forum_topic ? `/forum/topic/${openReport.reported_forum_topic}` : null
                  const hasHandshakeInfo = !!(openReport.related_handshake || openReport.handshake_status || openReport.handshake_scheduled_time || openReport.handshake_hours != null)

                  const statusColor = openReport.status === 'pending' ? AMBER : openReport.status === 'resolved' ? GREEN : GRAY500
                  const statusBg = openReport.status === 'pending' ? AMBER_LT : openReport.status === 'resolved' ? GREEN_LT : GRAY100
                  const typeMap: Record<string, string> = {
                    no_show: 'No-Show', inappropriate_content: 'Inappropriate', service_issue: 'Service Issue',
                    spam: 'Spam', scam: 'Scam / Fraud', harassment: 'Harassment', other: 'Other',
                  }
                  const reporterInitials = (openReport.reporter_name || 'U').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
                  const reportedInitials = (openReport.reported_user_name || openReport.reported_service_owner_name || 'U').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()

                  const PanelCard = ({ children, mb = 3, fill }: { children: React.ReactNode; mb?: number; fill?: boolean }) => (
                    <Box bg={WHITE} border={`1px solid ${GRAY200}`} borderRadius="12px" overflow="hidden" mb={mb}
                      h={fill ? '100%' : undefined}
                      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)', display: fill ? 'flex' : undefined, flexDirection: fill ? 'column' : undefined }}>
                      {children}
                    </Box>
                  )
                  const PanelSectionHead = ({ label, right }: { label: string; right?: React.ReactNode }) => (
                    <Flex align="center" justify="space-between" px={4} py="10px" borderBottom={`1px solid ${GRAY100}`} bg={GRAY50}>
                      <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em">{label}</Text>
                      {right}
                    </Flex>
                  )
                  const StatChip = ({ label, value, color, bg, border }: { label: string; value: React.ReactNode; color?: string; bg?: string; border?: string }) => (
                    <Box px={3} py="6px" borderRadius="8px" style={{ background: bg ?? GRAY50, border: `1px solid ${border ?? GRAY200}` }}>
                      <Text fontSize="9px" fontWeight={600} color={color ?? GRAY400} textTransform="uppercase" letterSpacing="0.06em">{label}</Text>
                      <Text fontSize="15px" fontWeight={700} color={color ?? GRAY800}>{value}</Text>
                    </Box>
                  )
                  const PanelActionBtn = ({ label, icon, accent, accentLt, onClick, disabled }: { label: string; icon?: React.ReactNode; accent: string; accentLt: string; onClick: () => void; disabled?: boolean }) => (
                    <Box as="button" px="12px" borderRadius="8px" fontSize="12px" fontWeight={600}
                      style={{ background: accentLt, border: `1px solid ${accent}40`, color: accent, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.38 : 1, height: '30px', display: 'inline-flex', alignItems: 'center', gap: '5px', transition: 'filter 0.12s', whiteSpace: 'nowrap' }}
                      onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.filter = 'brightness(0.88)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = 'none' }}
                      onClick={() => { if (!disabled) onClick() }}>
                      {icon}<span>{label}</span>
                    </Box>
                  )

                  return (
                    <>
                      {/* ── Meta row ── */}
                      <Flex align="center" gap="6px" mb={4} wrap="wrap">
                        <Box px="9px" py="3px" borderRadius="full" fontSize="11px" fontWeight={600}
                          style={{ background: statusBg, color: statusColor, border: `1px solid ${statusColor}50` }}>
                          {asLabel(openReport.status)}
                        </Box>
                        <Box px="9px" py="3px" borderRadius="full" fontSize="11px" fontWeight={500}
                          style={{ background: GRAY100, color: GRAY600, border: `1px solid ${GRAY200}` }}>
                          {typeMap[openReport.type] || asLabel(openReport.type)}
                        </Box>
                        {openReport.related_handshake && (
                          <Flex align="center" gap="4px" px="9px" py="3px" borderRadius="full" fontSize="11px" fontWeight={500}
                            style={{ background: BLUE_LT, color: BLUE, border: `1px solid ${BLUE}40` }}>
                            <FiLink2 size={9} />Handshake
                          </Flex>
                        )}
                        <Text fontSize="11px" color={GRAY400} ml="auto">
                          {new Date(openReport.created_at).toLocaleString()}
                        </Text>
                      </Flex>

                      {/* ── People row ── */}
                      <Flex gap={3} direction={{ base: 'column', md: 'row' }} mb={3} align="stretch">
                        {/* Reporter */}
                        <Box flex={1} minW={0} display="flex" flexDirection="column">
                          <PanelCard mb={0} fill>
                            <PanelSectionHead label="Reporter"
                              right={reporterProfilePath && (
                                <Box as="button" title="View admin profile"
                                  style={{ background:GRAY100, border:`1px solid ${GRAY200}`, color:GRAY600, cursor:'pointer', width:'24px', height:'24px', display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:'6px' }}
                                  onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.filter='brightness(0.88)'}}
                                  onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.filter='none'}}
                                  onClick={() => navigate(reporterProfilePath, { state: { from: 'reports' } })}>
                                  <FiArrowUpRight size={11} />
                                </Box>
                              )} />
                            <Box px={4} py={3}>
                              <Flex align="center" gap="10px" mb={3}>
                                <Box w="34px" h="34px" borderRadius="9px" display="flex" alignItems="center" justifyContent="center" flexShrink={0}
                                  style={{ background: AMBER_LT, color: AMBER, fontWeight: 700, fontSize: '12px' }}>
                                  {reporterInitials}
                                </Box>
                                <Box minW={0}>
                                  <Text fontWeight={600} fontSize="13px" color={GRAY800}
                                    style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{openReport.reporter_name || 'Unknown'}</Text>
                                  <Text fontSize="11px" color={GRAY400}
                                    style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{openReport.reporter_email || '—'}</Text>
                                </Box>
                              </Flex>
                              <Flex gap={2} mb={3}>
                                <StatChip label="Karma" value={openReport.reporter_karma_score ?? '—'} />
                                <StatChip label="Warnings" value={openReport.reporter_warning_count ?? 0}
                                  color={openReport.reporter_warning_count ? RED : undefined}
                                  bg={openReport.reporter_warning_count ? RED_LT : undefined}
                                  border={openReport.reporter_warning_count ? RED + '40' : undefined} />
                              </Flex>
                              <Box style={{ borderLeft: `2px solid ${AMBER}50`, paddingLeft: '10px' }}>
                                <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb="4px">Statement</Text>
                                <Text fontSize="12px" color={GRAY600} lineHeight={1.6}>{openReport.description || 'No statement.'}</Text>
                              </Box>
                            </Box>
                          </PanelCard>
                        </Box>

                        {/* Reported user */}
                        {hasReportedUserCard && (
                          <Box flex={1} minW={0} display="flex" flexDirection="column">
                            <PanelCard mb={0} fill>
                              <PanelSectionHead label="Reported user"
                                right={reportedProfilePath && (
                                  <Box as="button" title="View admin profile"
                                    style={{ background:GRAY100, border:`1px solid ${GRAY200}`, color:GRAY600, cursor:'pointer', width:'24px', height:'24px', display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:'6px' }}
                                    onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.filter='brightness(0.88)'}}
                                    onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.filter='none'}}
                                    onClick={() => navigate(reportedProfilePath, { state: { from: 'reports' } })}>
                                    <FiArrowUpRight size={11} />
                                  </Box>
                                )} />
                              <Box px={4} py={3}>
                                <Flex align="center" gap="10px" mb={3}>
                                  <Box w="34px" h="34px" borderRadius="9px" display="flex" alignItems="center" justifyContent="center" flexShrink={0}
                                    style={{ background: RED_LT, color: RED, fontWeight: 700, fontSize: '12px' }}>
                                    {reportedInitials}
                                  </Box>
                                  <Box minW={0}>
                                    <Text fontWeight={600} fontSize="13px" color={GRAY800}
                                      style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{openReport.reported_user_name || openReport.reported_service_owner_name || 'Unknown'}</Text>
                                    <Text fontSize="11px" color={GRAY400}
                                      style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{openReport.reported_user_email || openReport.reported_service_owner_email || '—'}</Text>
                                  </Box>
                                </Flex>
                                <Flex gap={2} mb={ownerUserId ? 3 : 0}>
                                  <StatChip label="Karma" value={openReport.reported_user_karma_score ?? openReport.reported_service_owner_karma_score ?? '—'} />
                                </Flex>
                                {ownerUserId && (
                                  <Box style={{ borderTop: `1px solid ${GRAY100}` }} pt={3}>
                                    <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb={2}>Quick actions</Text>
                                    <Flex gap={2} wrap="wrap">
                                      <PanelActionBtn label="Warn" icon={<FiAlertCircle size={11} />} accent={AMBER} accentLt={AMBER_LT} onClick={warnOpenReportOwner} disabled={openReportActionLoading} />
                                      <PanelActionBtn label="Suspend" icon={<FiUserX size={11} />} accent={RED} accentLt={RED_LT} onClick={suspendOpenReportOwner} disabled={openReportActionLoading} />
                                    </Flex>
                                  </Box>
                                )}
                              </Box>
                            </PanelCard>
                          </Box>
                        )}
                      </Flex>

                      {/* ── Service context ── */}
                      {hasServiceInfo && (
                        <PanelCard>
                          <PanelSectionHead label="Reported service"
                            right={reportedServicePath && (
                              <Box as="button" title="Open service"
                                style={{ background:BLUE_LT, border:`1px solid ${BLUE}40`, color:BLUE, cursor:'pointer', width:'24px', height:'24px', display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:'6px' }}
                                onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.filter='brightness(0.88)'}}
                                onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.filter='none'}}
                                onClick={() => navigate(reportedServicePath)}>
                                <FiArrowUpRight size={11} />
                              </Box>
                            )} />
                          <Box px={4} py={3}>
                            <Text fontWeight={600} fontSize="13px" color={GRAY800} mb={2}>{serviceTitle || 'Untitled service'}</Text>
                            <Flex gap={2} wrap="wrap" mb={2}>
                              {serviceType && <Box px="7px" py="2px" borderRadius="6px" fontSize="11px" fontWeight={500} style={{ background: BLUE_LT, color: BLUE }}>{asLabel(serviceType)}</Box>}
                              {serviceStatus && <Box px="7px" py="2px" borderRadius="6px" fontSize="11px" fontWeight={500} style={{ background: GRAY100, color: GRAY600 }}>{asLabel(serviceStatus)}</Box>}
                              {serviceLocation && <Flex align="center" gap="3px" px="7px" py="2px" borderRadius="6px" fontSize="11px" fontWeight={500} style={{ background: GRAY100, color: GRAY600 }}><FiMapPin size={9} />{serviceLocation}</Flex>}
                              {serviceHours != null && <Flex align="center" gap="3px" px="7px" py="2px" borderRadius="6px" fontSize="11px" fontWeight={500} style={{ background: GREEN_LT, color: GREEN }}><FiClock size={9} />{serviceHours}h</Flex>}
                            </Flex>
                            {serviceDescription && (
                              <Text fontSize="12px" color={GRAY500} lineHeight={1.6}
                                style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {serviceDescription}
                              </Text>
                            )}
                          </Box>
                        </PanelCard>
                      )}

                      {/* ── Forum context ── */}
                      {hasForumInfo && (
                        <PanelCard>
                          <PanelSectionHead label="Forum context"
                            right={<Flex gap={2}>
                              {forumTopicPath && (
                                <Box as="button" title="View topic"
                                  style={{ background:PURPLE_LT, border:`1px solid ${PURPLE}40`, color:PURPLE, cursor:'pointer', width:'24px', height:'24px', display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:'6px' }}
                                  onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.filter='brightness(0.88)'}}
                                  onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.filter='none'}}
                                  onClick={() => navigate(forumTopicPath)}>
                                  <FiArrowUpRight size={11} />
                                </Box>
                              )}
                            </Flex>} />
                          <Box px={4} py={3}>
                            <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb="4px">Topic</Text>
                            <Text fontWeight={600} fontSize="13px" color={GRAY800} mb={openReport.reported_forum_post_excerpt ? 3 : 0}>{openReport.reported_forum_topic_title || 'Unavailable'}</Text>
                            {openReport.reported_forum_post_excerpt && (
                              <>
                                <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb="4px">Reported reply</Text>
                                <Box style={{ borderLeft: `2px solid ${PURPLE}50`, paddingLeft: '10px' }}>
                                  <Text fontSize="12px" color={GRAY600} lineHeight={1.6}>{openReport.reported_forum_post_excerpt}</Text>
                                </Box>
                              </>
                            )}
                          </Box>
                        </PanelCard>
                      )}

                      {/* ── Handshake context ── */}
                      {hasHandshakeInfo && (
                        <PanelCard>
                          <PanelSectionHead label="Handshake" />
                          <Flex gap={2} wrap="wrap" align="center" px={4} py={3}>
                            {openReport.handshake_status && <Box px="7px" py="2px" borderRadius="6px" fontSize="11px" fontWeight={500} style={{ background: BLUE_LT, color: BLUE }}>{asLabel(openReport.handshake_status)}</Box>}
                            {openReport.handshake_hours != null && <Flex align="center" gap="3px" px="7px" py="2px" borderRadius="6px" fontSize="11px" fontWeight={500} style={{ background: GREEN_LT, color: GREEN }}><FiClock size={9} />{openReport.handshake_hours}h</Flex>}
                            {openReport.handshake_scheduled_time && <Flex align="center" gap="4px" fontSize="12px" color={GRAY500}><FiCalendar size={11} />{new Date(openReport.handshake_scheduled_time).toLocaleString()}</Flex>}
                          </Flex>
                        </PanelCard>
                      )}

                      {/* ── Moderator notes + Actions ── */}
                      <PanelCard mb={0}>
                        <PanelSectionHead label="Moderator notes"
                          right={
                            <Box as="button" px="10px" borderRadius="7px" fontSize="11px" fontWeight={500}
                              style={{ background: GRAY100, color: GRAY600, border: `1px solid ${GRAY200}`, cursor: 'pointer', height: '24px', display: 'inline-flex', alignItems: 'center' }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = GRAY200 }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = GRAY100 }}
                              onClick={() => setIsNotesExpanded((prev) => !prev)}>
                              {isNotesExpanded ? 'Collapse' : 'Expand'}
                            </Box>
                          } />
                        <Box px={4} py={3}>
                          {isNotesExpanded ? (
                            <Textarea
                              value={reportNotes[openReport.id] || ''}
                              onChange={(e) => setReportNotes((prev) => ({ ...prev, [openReport.id]: e.target.value }))}
                              placeholder="Add moderation notes, reasoning, or case summary…"
                              minH="90px" bg={GRAY50} borderColor={GRAY200} borderRadius="9px" fontSize="12px" mb={3} />
                          ) : (
                            <Box style={{ borderLeft: `2px solid ${GRAY200}`, paddingLeft: '10px' }} mb={3}>
                              <Text fontSize="12px" color={(reportNotes[openReport.id] || '').trim() ? GRAY600 : GRAY400} lineHeight={1.6}>
                                {(reportNotes[openReport.id] || '').trim() || 'No notes — click Expand to add.'}
                              </Text>
                            </Box>
                          )}
                          <Box style={{ borderTop: `1px solid ${GRAY100}` }} pt={3}>
                            <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb={2}>Actions</Text>
                            <Flex gap={2} wrap="wrap">
                              {!isForumReport && (
                                <PanelActionBtn label="Confirm no-show" icon={<FiCheck size={11} />} accent={GREEN} accentLt={GREEN_LT}
                                  onClick={() => resolveOpenReport('confirm_no_show')}
                                  disabled={openReportActionLoading || !openReport.related_handshake || hasPendingLinkedHandshake(openReport) || isEventNotStartedForNoShow(openReport)} />
                              )}
                              <PanelActionBtn label="Dismiss" icon={<FiX size={11} />} accent={BLUE} accentLt={BLUE_LT}
                                onClick={() => resolveOpenReport('dismiss')} disabled={openReportActionLoading} />
                              <PanelActionBtn label="Remove from event" icon={<FiUserX size={11} />} accent={RED} accentLt={RED_LT}
                                onClick={() => resolveOpenReport('remove_from_event')}
                                disabled={openReportActionLoading || !canRemoveReportedUserFromEvent(openReport)} />
                              {isServiceReport && canCloseServiceFromReport && (
                                <PanelActionBtn
                                  label={isServiceAlreadyClosed ? 'Already closed' : 'Close service'}
                                  icon={isServiceAlreadyClosed ? <FiSlash size={11} /> : <FiLock size={11} />}
                                  accent={RED} accentLt={RED_LT}
                                  onClick={closeOpenReportedService}
                                  disabled={openReportActionLoading || isServiceAlreadyClosed} />
                              )}
                              {isForumReport && (
                                <PanelActionBtn
                                  label={`Delete ${openReport.reported_forum_post ? 'reply' : 'topic'}`}
                                  icon={<FiTrash2 size={11} />} accent={RED} accentLt={RED_LT}
                                  onClick={deleteOpenReportedForumContent}
                                  disabled={openReportActionLoading || (!openReport.reported_forum_post && !openReport.reported_forum_topic)} />
                              )}
                              {!isForumReport && (
                                <PanelActionBtn label="Pause handshake" icon={<FiPauseCircle size={11} />} accent={AMBER} accentLt={AMBER_LT}
                                  onClick={pauseOpenReport}
                                  disabled={openReportActionLoading || !openReport.related_handshake || hasPendingLinkedHandshake(openReport)} />
                              )}
                            </Flex>
                            {!isForumReport && !openReport.related_handshake && (
                              <Text fontSize="11px" color={GRAY400} mt={2}>No linked handshake — no-show &amp; pause disabled.</Text>
                            )}
                            {!isForumReport && openReport.reported_service_type === 'Event' && !canRemoveReportedUserFromEvent(openReport) && (
                              <Text fontSize="11px" color={GRAY400} mt={2}>Remove from event is available only for active reported event participants.</Text>
                            )}
                            {!isForumReport && hasPendingLinkedHandshake(openReport) && (
                              <Text fontSize="11px" color={GRAY400} mt={2}>Pending handshake — no-show &amp; pause disabled.</Text>
                            )}
                            {!isForumReport && isEventNotStartedForNoShow(openReport) && (
                              <Text fontSize="11px" color={GRAY400} mt={2}>Event not started — no-show confirm disabled.</Text>
                            )}
                          </Box>
                        </Box>
                      </PanelCard>
                    </>
                  )
                })()}
              </>
            )}
          </Box>
          </Box>
        </Box>
      )}
      </Box>
    </AdminLayout>

    {/* ── Modals ─────────────────────────────────────────────────────────── */}
    <AdminConfirmModal
      isOpen={!!confirmModal?.open}
      title={confirmModal?.title ?? ''}
      description={confirmModal?.description ?? ''}
      confirmLabel={confirmModal?.confirmLabel ?? 'Confirm'}
      accent={confirmModal?.accent ?? GREEN}
      accentLt={confirmModal?.accentLt ?? GREEN_LT}
      onConfirm={submitConfirmModal}
      onClose={() => setConfirmModal(null)}
      loading={confirmModalLoading}
    />
    <AdminWarnModal
      isOpen={warnModal.open}
      userName={warnModal.user ? userDisplayName(warnModal.user) : ''}
      onConfirm={submitWarn}
      onClose={() => setWarnModal({ open: false, user: null, loading: false })}
      loading={warnModal.loading}
    />
    <AdminKarmaModal
      isOpen={karmaModal.open}
      userName={karmaModal.user ? userDisplayName(karmaModal.user) : ''}
      onConfirm={submitKarma}
      onClose={() => setKarmaModal({ open: false, user: null, loading: false })}
      loading={karmaModal.loading}
    />
  </>
  )
}

export default AdminDashboard
