import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ReferenceLine,
} from 'recharts'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Box, Flex, Spinner, Text } from '@chakra-ui/react'
import {
  FiArrowLeft, FiAlertCircle, FiSlash, FiCheck, FiBarChart2,
  FiUser, FiMail, FiCalendar, FiClock, FiActivity, FiShield,
  FiMessageSquare, FiList, FiAlertTriangle, FiExternalLink,
} from 'react-icons/fi'
import { toast } from 'sonner'
import { adminAPI } from '@/services/adminAPI'
import { getErrorMessage } from '@/services/api'
import AdminLayout from '@/components/AdminLayout'
import { AdminConfirmModal, AdminKarmaModal, AdminWarnModal } from '@/components/AdminModals'
import { useAuthStore } from '@/store/useAuthStore'
import type { AdminTransaction, AdminUserDetail } from '@/types'
import {
  AMBER, AMBER_LT,
  BLUE, BLUE_LT,
  GREEN, GREEN_LT,
  GRAY50, GRAY100, GRAY200, GRAY400, GRAY500, GRAY600, GRAY700, GRAY800,
  PURPLE, PURPLE_LT,
  RED, RED_LT,
  WHITE,
} from '@/theme/tokens'

// ─── Small helpers ────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDatetime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatActionType(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function userInitials(u: AdminUserDetail): string {
  const f = u.first_name?.[0] ?? ''
  const l = u.last_name?.[0] ?? ''
  return (f + l).toUpperCase() || u.email[0].toUpperCase()
}

// ─── Layout primitives ────────────────────────────────────────────────────────

const Card = ({ children }: { children: React.ReactNode }) => (
  <Box bg={WHITE} border={`1px solid ${GRAY200}`} borderRadius="12px" overflow="hidden"
    style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
    {children}
  </Box>
)

const SectionHead = ({ label }: { label: string }) => (
  <Flex align="center" px={4} py="10px" borderBottom={`1px solid ${GRAY100}`} bg={GRAY50}>
    <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em">
      {label}
    </Text>
  </Flex>
)

const InfoRow = ({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: React.ReactNode; color?: string }) => (
  <Flex align="center" gap={3} px={4} py="10px" borderBottom={`1px solid ${GRAY100}`} _last={{ borderBottom: 'none' }}>
    <Icon size={14} color={GRAY400} style={{ flexShrink: 0 }} />
    <Text fontSize="12px" color={GRAY500} minW="140px" flexShrink={0}>{label}</Text>
    <Text fontSize="13px" fontWeight={500} color={color ?? GRAY800}>{value ?? '—'}</Text>
  </Flex>
)

// ─── Inline chart on hover ────────────────────────────────────────────────────

type ChartPoint = { label: string; value: number; source?: string }

function HoverChart({
  children, data, color, chartType = 'line', scoreData,
}: {
  children: React.ReactNode
  data: ChartPoint[]
  color: string
  chartType?: 'line' | 'bar'
  scoreData?: ChartPoint[]
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const anchorRef = useRef<HTMLSpanElement | null>(null)

  const handleEnter = () => {
    if (anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + window.scrollY - 4, left: r.left + window.scrollX + r.width / 2 })
    }
    setOpen(true)
  }

  const chart = open && data.length > 0 && createPortal(
    <div
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      style={{
        position: 'absolute', top: pos.top, left: pos.left,
        transform: 'translateX(-50%)', zIndex: 9999, paddingTop: '4px',
      }}
    >
      <div style={{
        background: WHITE, border: `1px solid ${GRAY200}`, borderRadius: '10px',
        padding: '12px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        width: '220px',
      }}>
        {chartType === 'bar' && (
          <>
            <div style={{ fontSize: '10px', color: GRAY400, marginBottom: '2px' }}>Δ change</div>
            <ResponsiveContainer width="100%" height={80}>
              <BarChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: GRAY400 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: GRAY400 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => Math.round(v).toString()} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: '11px', borderRadius: '6px', border: `1px solid ${GRAY200}`, padding: '4px 8px' }}
                  formatter={(v: number, _name: string, props: { payload?: ChartPoint }) => {
                    const rounded = Math.round(v)
                    const src = props?.payload?.source === 'admin' ? 'admin' : 'evaluation'
                    return [rounded > 0 ? `+${rounded}` : `${rounded}`, `Δ karma (${src})`]
                  }}
                  labelStyle={{ color: GRAY600 }}
                />
                <ReferenceLine y={0} stroke={GRAY200} />
                <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {scoreData && scoreData.length > 0 && (
              <>
                <div style={{ fontSize: '10px', color: GRAY400, margin: '6px 0 2px' }}>Score over time</div>
                <ResponsiveContainer width="100%" height={80}>
                  <LineChart data={scoreData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: GRAY400 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: GRAY400 }} tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={(v: number) => Math.round(v).toString()} />
                    <Tooltip
                      contentStyle={{ fontSize: '11px', borderRadius: '6px', border: `1px solid ${GRAY200}`, padding: '4px 8px' }}
                      formatter={(v: number) => [Math.round(v), 'Karma score']}
                      labelStyle={{ color: GRAY600 }}
                    />
                    <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 2, fill: color }} />
                  </LineChart>
                </ResponsiveContainer>
              </>
            )}
          </>
        )}
        {chartType === 'line' && (
          <ResponsiveContainer width="100%" height={90}>
            <LineChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: GRAY400 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9, fill: GRAY400 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ fontSize: '11px', borderRadius: '6px', border: `1px solid ${GRAY200}`, padding: '4px 8px' }}
                formatter={(v: number) => [`${v} hrs`, 'Balance']}
                labelStyle={{ color: GRAY600 }}
              />
              <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 2, fill: color }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>,
    document.body,
  )

  return (
    <span
      ref={anchorRef}
      onMouseEnter={data.length > 0 ? handleEnter : undefined}
      onMouseLeave={() => setOpen(false)}
      style={{
        cursor: data.length > 0 ? 'default' : undefined,
        borderBottom: data.length > 0 ? `1px dashed ${GRAY400}` : undefined,
        paddingBottom: data.length > 0 ? '1px' : undefined,
      }}
    >
      {children}
      {chart}
    </span>
  )
}

// ─── Hoverable stat box with lazy-loaded item popover ────────────────────────

interface StatItem { id: string; title: string; href: string }

function HoverStatBox({
  value, label, color, items,
}: {
  value: number
  label: string
  color: string
  items?: StatItem[]
}) {
  const [open, setOpen] = useState(false)
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0, width: 0 })
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()

  const handleEnter = () => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setPopoverPos({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX + rect.width / 2,
        width: rect.width,
      })
    }
    setOpen(true)
  }

  const handleLeave = () => setOpen(false)

  const canHover = !!items && value > 0

  const popover = open && canHover && createPortal(
    <div
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={handleLeave}
      style={{
        position: 'absolute',
        // Extend upward by 4px so there's no gap between anchor and popover
        top: popoverPos.top - 4,
        left: popoverPos.left,
        transform: 'translateX(-50%)',
        zIndex: 9999,
        // 4px transparent padding at top bridges the visual gap
        paddingTop: '4px',
      }}
    >
      <div style={{
        background: WHITE,
        border: `1px solid ${GRAY200}`,
        borderRadius: '10px',
        minWidth: '200px',
        maxWidth: '280px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        overflow: 'hidden',
      }}>
        {items!.length > 0 ? (
          items!.map((item, i) => (
            <div
              key={item.id}
              onClick={() => { setOpen(false); navigate(item.href) }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px',
                borderBottom: i < items!.length - 1 ? `1px solid ${GRAY100}` : 'none',
                cursor: 'pointer',
                background: WHITE,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = GRAY50 }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = WHITE }}
            >
              <span style={{
                fontSize: '12px', color: GRAY700, fontWeight: 500,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '210px',
              }}>
                {item.title}
              </span>
              <span style={{ color, flexShrink: 0, marginLeft: '8px', display: 'flex' }}>
                <FiExternalLink size={12} />
              </span>
            </div>
          ))
        ) : (
          <div style={{ fontSize: '12px', color: GRAY500, padding: '10px 12px' }}>No items</div>
        )}
      </div>
    </div>,
    document.body,
  )

  return (
    <Box
      ref={anchorRef}
      flex={1} textAlign="center" py={3} px={2}
      cursor={canHover ? 'default' : undefined}
      onMouseEnter={canHover ? handleEnter : undefined}
      onMouseLeave={canHover ? handleLeave : undefined}
      bg={open && canHover ? GRAY50 : undefined}
      transition="background 0.1s"
    >
      <Text fontSize="20px" fontWeight={700} color={color}>{value}</Text>
      <Text fontSize="11px" color={GRAY500} mt="2px">{label}</Text>
      {popover}
    </Box>
  )
}

// ─── Action button ────────────────────────────────────────────────────────────

function ActionBtn({
  label, icon: Icon, bg, hoverBg, color, onClick, disabled,
}: {
  label: string; icon: React.ElementType; bg: string; hoverBg: string; color: string
  onClick: () => void; disabled?: boolean
}) {
  return (
    <Box
      as="button"
      title={label}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
      display="inline-flex" alignItems="center" gap="6px"
      px={3} py="6px" borderRadius="8px" fontSize="12px" fontWeight={600}
      bg={bg} color={color} border={`1px solid ${hoverBg}`}
      opacity={disabled ? 0.4 : 1}
      cursor={disabled ? 'not-allowed' : 'pointer'}
      transition="filter 0.15s"
      onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.filter = 'brightness(0.92)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = 'none' }}
    >
      <Icon size={12} />
      {label}
    </Box>
  )
}


// ─── Role assign modal ────────────────────────────────────────────────────────

// Roles an actor with the given role may assign.  The backend enforces the same
// policy; this list gates the UI options for a good UX.
const ASSIGNABLE_ROLES_BY_ACTOR: Record<string, { value: string; label: string }[]> = {
  super_admin: [
    { value: 'admin', label: 'Admin' },
    { value: 'moderator', label: 'Moderator' },
    { value: 'member', label: 'Member' },
  ],
}

const ROLE_TIER: Record<string, number> = {
  super_admin: 3,
  admin: 2,
  moderator: 1,
  member: 0,
}

function RoleAssignModal({
  userId,
  currentRole,
  actorRole,
  onClose,
  onDone,
}: {
  userId: string
  currentRole: string
  actorRole: string
  onClose: () => void
  onDone: () => void
}) {
  const [selectedRole, setSelectedRole] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading] = useState(false)

  const assignableRoles = (ASSIGNABLE_ROLES_BY_ACTOR[actorRole] ?? []).filter(
    (r) => r.value !== currentRole,
  )

  // Actors may not change the role of a peer or superior
  const targetTier = ROLE_TIER[currentRole] ?? 0
  const actorTier = ROLE_TIER[actorRole] ?? 0
  const canAct = actorTier > targetTier && assignableRoles.length > 0

  const selectedLabel = assignableRoles.find((r) => r.value === selectedRole)?.label ?? selectedRole

  const submit = async () => {
    if (!selectedRole || !confirmed) return
    setLoading(true)
    try {
      await adminAPI.assignUserRole(userId, selectedRole)
      toast.success(`Role updated to ${selectedLabel}`)
      onDone()
    } catch (e) {
      toast.error(getErrorMessage(e) ?? 'Failed to assign role')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Flex position="fixed" inset={0} zIndex={200} align="center" justify="center"
      bg="rgba(0,0,0,0.45)" onClick={onClose}>
      <Box bg={WHITE} borderRadius="16px" p={6} w="420px" maxW="90vw"
        boxShadow="0 8px 40px rgba(0,0,0,0.18)"
        onClick={(e) => e.stopPropagation()}>
        <Text fontSize="15px" fontWeight={700} color={GRAY800} mb={1}>Assign Role</Text>
        <Text fontSize="12px" color={GRAY500} mb={4}>Current role: <strong>{currentRole}</strong></Text>

        {!canAct ? (
          <Text fontSize="13px" color={RED} mb={4}>
            You do not have permission to change this user's role.
          </Text>
        ) : (
          <>
            <Text fontSize="12px" color={GRAY600} mb={2}>New role</Text>
            <select
              value={selectedRole}
              onChange={(e) => { setSelectedRole(e.target.value); setConfirmed(false) }}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px',
                border: `1px solid ${GRAY200}`, fontSize: '13px', color: GRAY800,
                outline: 'none', fontFamily: 'inherit', background: WHITE,
                marginBottom: '16px',
              }}
            >
              <option value="">Select a role…</option>
              {assignableRoles.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>

            {selectedRole && (
              <Box
                bg={AMBER_LT} border={`1px solid ${AMBER}30`} borderRadius="8px"
                p={3} mb={4}
              >
                <Text fontSize="12px" color={GRAY700}>
                  Are you sure you want to change this user's role to{' '}
                  <strong>{selectedLabel}</strong>? This action will be logged in the audit trail.
                </Text>
                <Flex align="center" gap={2} mt={2}>
                  <input
                    id="role-confirm"
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <label htmlFor="role-confirm" style={{ fontSize: '12px', color: GRAY700, cursor: 'pointer' }}>
                    I understand this will change the user's permissions
                  </label>
                </Flex>
              </Box>
            )}
          </>
        )}

        <Flex gap={2} justify="flex-end" mt={2}>
          <ActionBtn label="Cancel" icon={FiCheck} bg={GRAY100} hoverBg={GRAY200} color={GRAY600} onClick={onClose} />
          {canAct && (
            <ActionBtn
              label={loading ? 'Saving…' : 'Assign Role'}
              icon={FiShield}
              bg={AMBER_LT} hoverBg={AMBER + '40'} color={AMBER}
              onClick={submit}
              disabled={loading || !selectedRole || !confirmed}
            />
          )}
        </Flex>
      </Box>
    </Flex>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminUserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { user: adminUser } = useAuthStore()

  const fromTab = (location.state as { from?: string } | null)?.from ?? 'users'
  const backLabel = fromTab === 'reports' ? 'Back to Reports & Flags' : 'Back to Users'

  const [user, setUser] = useState<AdminUserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'warn' | 'karma' | 'role' | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [warnLoading, setWarnLoading] = useState(false)
  const [suspendConfirm, setSuspendConfirm] = useState(false)

  const [transactions, setTransactions] = useState<AdminTransaction[]>([])
  const [txLoading, setTxLoading] = useState(false)
  const [txPage, setTxPage] = useState(1)
  const [txTotal, setTxTotal] = useState(0)
  const TX_PAGE_SIZE = 10

  const loadTransactions = async (page: number) => {
    if (!userId) return
    setTxLoading(true)
    try {
      const res = await adminAPI.getUserTransactions(userId, page, TX_PAGE_SIZE)
      setTransactions(res.results)
      setTxTotal(res.count)
      setTxPage(page)
    } catch {
      // silently ignore — non-critical
    } finally {
      setTxLoading(false)
    }
  }

  const isSelf = adminUser?.id === userId
  const actorTier = ROLE_TIER[adminUser?.role ?? ''] ?? 0
  const targetTier = ROLE_TIER[user?.role ?? ''] ?? 0
  // Ban/karma: actor must be strictly above target.
  const canActOnTarget = !isSelf && !!user && actorTier > targetTier
  // Warn: peers at the same tier may warn each other; acting upward is still blocked.
  const canWarnTarget = !isSelf && !!user && actorTier >= targetTier

  const load = async () => {
    if (!userId) return
    setLoading(true)
    try {
      const data = await adminAPI.getUserDetail(userId)
      setUser(data)
    } catch (e) {
      toast.error(getErrorMessage(e) ?? 'Failed to load user')
      navigate('/admin?tab=users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadTransactions(1) }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleSuspend = () => {
    if (!canActOnTarget) return
    setSuspendConfirm(true)
  }

  const executeSuspend = async () => {
    if (!user) return
    setActionLoading(true)
    try {
      if (user.is_active) {
        await adminAPI.banUser(user.id)
        toast.success('User suspended')
      } else {
        await adminAPI.unbanUser(user.id)
        toast.success('User reactivated')
      }
      setSuspendConfirm(false)
      await load()
    } catch (e) {
      toast.error(getErrorMessage(e) ?? 'Action failed')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <AdminLayout activeTab="users" onTabChange={(tab) => navigate(`/admin?tab=${tab}`)}>
        <Flex h="100%" align="center" justify="center">
          <Spinner color={GREEN} />
        </Flex>
      </AdminLayout>
    )
  }

  if (!user) return null

  const statusColor = user.is_active ? GREEN : RED
  const statusBg = user.is_active ? GREEN_LT : RED_LT
  const statusLabel = user.is_active ? 'Active' : 'Suspended'
  const hasActiveBan = user.is_event_banned_until && new Date(user.is_event_banned_until) > new Date()
  const hasOrganizerBan = user.is_organizer_banned_until && new Date(user.is_organizer_banned_until) > new Date()

  return (
    <AdminLayout activeTab={fromTab === 'reports' ? 'reports' : 'users'} onTabChange={(tab) => navigate(`/admin?tab=${tab}`)}>
      <Box p={{ base: 3, md: 5 }} maxW="960px" mx="auto">

        {/* Back */}
        <Flex
          as="button"
          align="center" gap={2} mb={4}
          fontSize="13px" fontWeight={500} color={GRAY600}
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = GRAY800 }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = GRAY600 }}
        >
          <FiArrowLeft size={14} /> {backLabel}
        </Flex>

        {/* Header card — profile info + stats unified */}
        <Card>
          <Box p={5}>
            <Flex align="flex-start" gap={4} wrap="wrap">
              {/* Avatar */}
              <Flex w="56px" h="56px" borderRadius="50%" bg={GREEN} align="center" justify="center" flexShrink={0}>
                {user.avatar_url
                  ? <img src={user.avatar_url} style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover' }} alt="" />
                  : <Text fontSize="20px" fontWeight={700} color={WHITE}>{userInitials(user)}</Text>
                }
              </Flex>

              {/* Name / email */}
              <Box flex={1} minW={0}>
                <Flex align="center" gap={2} wrap="wrap">
                  <Text fontSize="18px" fontWeight={700} color={GRAY800}>
                    {user.first_name} {user.last_name}
                  </Text>
                  <Box px={2} py="2px" borderRadius="6px" bg={statusBg}
                    border={`1px solid ${statusColor}30`}>
                    <Text fontSize="11px" fontWeight={600} color={statusColor}>{statusLabel}</Text>
                  </Box>
                  {/* Role badge — shown for every non-member role */}
                  {user.role !== 'member' && (() => {
                    const roleColors: Record<string, { bg: string; border: string; text: string; label: string }> = {
                      super_admin: { bg: RED_LT,    border: RED + '30',    text: RED,    label: 'Super Admin' },
                      admin:       { bg: AMBER_LT,  border: AMBER + '30',  text: AMBER,  label: 'Admin' },
                      moderator:   { bg: PURPLE_LT, border: PURPLE + '30', text: PURPLE, label: 'Moderator' },
                    }
                    const c = roleColors[user.role]
                    if (!c) return null
                    return (
                      <Box px={2} py="2px" borderRadius="6px" bg={c.bg} border={`1px solid ${c.border}`}>
                        <Text fontSize="11px" fontWeight={600} color={c.text}>{c.label}</Text>
                      </Box>
                    )
                  })()}
                  {!user.is_verified && (
                    <Box px={2} py="2px" borderRadius="6px" bg={GRAY100} border={`1px solid ${GRAY200}`}>
                      <Text fontSize="11px" fontWeight={600} color={GRAY500}>Unverified</Text>
                    </Box>
                  )}
                </Flex>
                <Text fontSize="13px" color={GRAY500} mt="2px">{user.email}</Text>
                {user.location && <Text fontSize="12px" color={GRAY400} mt="2px">{user.location}</Text>}
              </Box>

              {/* Actions */}
              <Flex gap={2} flexShrink={0} wrap="wrap">
                <ActionBtn
                  label="Warn"
                  icon={FiAlertCircle}
                  bg={BLUE_LT} hoverBg={BLUE + '40'} color={BLUE}
                  onClick={() => setModal('warn')}
                  disabled={!canWarnTarget}
                />
                <ActionBtn
                  label={user.is_active ? 'Suspend' : 'Reactivate'}
                  icon={user.is_active ? FiSlash : FiCheck}
                  bg={user.is_active ? RED_LT : GREEN_LT}
                  hoverBg={(user.is_active ? RED : GREEN) + '40'}
                  color={user.is_active ? RED : GREEN}
                  onClick={handleToggleSuspend}
                  disabled={!canActOnTarget || actionLoading}
                />
                <ActionBtn
                  label="Karma"
                  icon={FiBarChart2}
                  bg={PURPLE_LT} hoverBg={PURPLE + '40'} color={PURPLE}
                  onClick={() => setModal('karma')}
                  disabled={!canActOnTarget}
                />
                {/* Role button: only super_admin can assign roles. */}
                {!isSelf && adminUser?.role === 'super_admin' && (ROLE_TIER[user.role] ?? 0) < 3 && (
                  <ActionBtn
                    label="Role"
                    icon={FiShield}
                    bg={AMBER_LT} hoverBg={AMBER + '40'} color={AMBER}
                    onClick={() => setModal('role')}
                  />
                )}
              </Flex>
            </Flex>
          </Box>

          {/* Stats strip inside the same card */}
          <Flex borderTop={`1px solid ${GRAY100}`} wrap="wrap">
            {([
              {
                value: user.offers_count, label: 'Offers', color: GREEN,
                items: (user.recent_offers ?? []).map(s => ({ id: s.id, title: s.title, href: `/service-detail/${s.id}` })),
              },
              {
                value: user.requests_count, label: 'Requests', color: BLUE,
                items: (user.recent_requests ?? []).map(s => ({ id: s.id, title: s.title, href: `/service-detail/${s.id}` })),
              },
              {
                value: user.events_count, label: 'Events', color: AMBER,
                items: (user.recent_events ?? []).map(s => ({ id: s.id, title: s.title, href: `/service-detail/${s.id}` })),
              },
              {
                value: user.handshakes_as_requester_count, label: 'As Requester', color: PURPLE,
                items: (user.recent_handshakes_as_requester ?? []).map(h => ({ id: h.id, title: h.title, href: `/service-detail/${h.service_id}` })),
              },
              {
                value: user.handshakes_as_provider_count, label: 'As Provider', color: '#0D9488',
                items: (user.recent_handshakes_as_provider ?? []).map(h => ({ id: h.id, title: h.title, href: `/service-detail/${h.service_id}` })),
              },
              {
                value: user.forum_topics_count, label: 'Forum Topics', color: GRAY600,
                items: (user.recent_forum_topics ?? []).map(t => ({ id: t.id, title: t.title, href: `/forum/topic/${t.id}` })),
              },
            ] as Array<{ value: number; label: string; color: string; items?: StatItem[] }>).map((s, i, arr) => (
              <Box key={s.label} flex={1} minW="80px"
                borderRight={i < arr.length - 1 ? `1px solid ${GRAY100}` : 'none'}>
                <HoverStatBox {...s} />
              </Box>
            ))}
          </Flex>
        </Card>

        <Flex gap={4} mt={4} align="flex-start" wrap="wrap">
          {/* Left column */}
          <Box flex={1} minW="260px">
            <Card>
              <SectionHead label="Account Information" />
              <InfoRow icon={FiMail} label="Email" value={user.email} />
              <InfoRow icon={FiUser} label="Role" value={user.role === 'admin' ? 'Admin' : 'Member'} />
              <InfoRow icon={FiCalendar} label="Registered" value={fmtDate(user.date_joined)} />
              <InfoRow icon={FiClock} label="Last Login" value={fmtDatetime(user.last_login)} />
              <InfoRow icon={FiShield} label="Email Verified"
                value={user.is_verified ? 'Yes' : 'No'}
                color={user.is_verified ? GREEN : RED}
              />
              <InfoRow icon={FiActivity} label="Onboarded"
                value={user.is_onboarded ? 'Yes' : 'No'}
                color={user.is_onboarded ? GREEN : GRAY500}
              />
              <InfoRow icon={FiBarChart2} label="Karma Score" value={
                <HoverChart
                  color={PURPLE}
                  chartType="bar"
                  data={(user.karma_adjustments ?? []).map(p => ({
                    label: fmtDate(p.created_at),
                    value: p.delta,
                    source: p.label,
                  }))}
                  scoreData={(user.karma_adjustments ?? []).map(p => ({
                    label: fmtDate(p.created_at),
                    value: p.karma,
                  }))}
                >
                  {user.karma_score}
                </HoverChart>
              } />
              <InfoRow icon={FiList} label="Time Bank Balance" value={
                <HoverChart
                  color={GREEN}
                  chartType="line"
                  data={[...transactions].reverse().map(t => ({
                    label: fmtDate(t.created_at),
                    value: parseFloat(t.balance_after),
                  }))}
                >
                  {`${Math.floor(user.timebank_balance)} hrs`}
                </HoverChart>
              } />
              <InfoRow icon={FiAlertTriangle} label="No-show Count"
                value={user.no_show_count}
                color={user.no_show_count > 0 ? AMBER : GRAY800}
              />
            </Card>
          </Box>

          {/* Right column */}
          <Box flex={1} minW="260px" display="flex" flexDirection="column" gap={4}>

            {/* Flags */}
            {(hasActiveBan || hasOrganizerBan || user.locked_until) && (
              <Card>
                <SectionHead label="Active Flags" />
                {hasActiveBan && (
                  <InfoRow icon={FiSlash} label="Event Join Ban Until"
                    value={fmtDate(user.is_event_banned_until)} color={RED} />
                )}
                {hasOrganizerBan && (
                  <InfoRow icon={FiSlash} label="Event Create Ban Until"
                    value={fmtDate(user.is_organizer_banned_until)} color={RED} />
                )}
                {user.locked_until && new Date(user.locked_until) > new Date() && (
                  <InfoRow icon={FiAlertTriangle} label="Account Locked Until"
                    value={fmtDatetime(user.locked_until)} color={AMBER} />
                )}
              </Card>
            )}

            {/* Bio */}
            {user.bio && (
              <Card>
                <SectionHead label="Bio" />
                <Box px={4} py={3}>
                  <Text fontSize="13px" color={GRAY700} whiteSpace="pre-wrap">{user.bio}</Text>
                </Box>
              </Card>
            )}

            {/* Recent admin actions */}
            <Card>
              <SectionHead label="Recent Admin Actions" />
              {user.recent_admin_actions.length === 0 ? (
                <Box px={4} py={3}>
                  <Text fontSize="12px" color={GRAY400}>No admin actions recorded.</Text>
                </Box>
              ) : (
                user.recent_admin_actions.map((action, i) => (
                  <Flex key={i} align="flex-start" gap={3} px={4} py="10px"
                    borderBottom={i < user.recent_admin_actions.length - 1 ? `1px solid ${GRAY100}` : 'none'}>
                    <FiMessageSquare size={13} color={GRAY400} style={{ marginTop: 2, flexShrink: 0 }} />
                    <Box>
                      <Text fontSize="12px" fontWeight={600} color={GRAY700}>
                        {formatActionType(action.action_type)}
                      </Text>
                      {action.reason && (
                        <Text fontSize="11px" color={GRAY500} mt="1px">{action.reason}</Text>
                      )}
                      <Text fontSize="10px" color={GRAY400} mt="2px">{fmtDatetime(action.created_at)}</Text>
                    </Box>
                  </Flex>
                ))
              )}
            </Card>

          </Box>
        </Flex>

        {/* Transaction History */}
        <Box mt={4}>
          <Card>
            <SectionHead label="Transaction History" />
            {txLoading ? (
              <Flex justify="center" py={4}><Spinner color={GREEN} /></Flex>
            ) : transactions.length === 0 ? (
              <Box px={4} py={3}>
                <Text fontSize="12px" color={GRAY400}>No transactions recorded.</Text>
              </Box>
            ) : (
              <>
                {transactions.map((tx, i) => {
                  const isCredit = parseFloat(tx.amount) > 0
                  const amountColor = isCredit ? GREEN : RED
                  const typeLabel: Record<string, string> = {
                    provision: 'Reserved',
                    transfer: 'Transferred',
                    refund: 'Refunded',
                    adjustment: 'Adjusted',
                  }
                  return (
                    <Flex key={tx.id} align="center" gap={3} px={4} py="10px"
                      borderBottom={i < transactions.length - 1 ? `1px solid ${GRAY100}` : 'none'}>
                      <Box w="80px" flexShrink={0}>
                        <Box px={2} py="2px" borderRadius="6px" display="inline-block"
                          bg={isCredit ? GREEN_LT : RED_LT}
                          style={{ border: `1px solid ${amountColor}30` }}>
                          <Text fontSize="10px" fontWeight={600} color={amountColor}>
                            {typeLabel[tx.transaction_type] ?? tx.transaction_type}
                          </Text>
                        </Box>
                      </Box>
                      <Box flex={1} minW={0}>
                        <Text fontSize="12px" color={GRAY700}
                          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {tx.description}
                        </Text>
                        {tx.service_title && (
                          <Text fontSize="11px" color={GRAY400} mt="1px"
                            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tx.service_title}
                          </Text>
                        )}
                      </Box>
                      <Box textAlign="right" flexShrink={0}>
                        <Text fontSize="13px" fontWeight={700} color={amountColor}>
                          {isCredit ? '+' : ''}{parseFloat(tx.amount).toFixed(1)} hrs
                        </Text>
                        <Text fontSize="10px" color={GRAY400}>
                          bal: {parseFloat(tx.balance_after).toFixed(1)} hrs
                        </Text>
                      </Box>
                      <Box w="90px" textAlign="right" flexShrink={0}>
                        <Text fontSize="11px" color={GRAY500}>{fmtDate(tx.created_at)}</Text>
                      </Box>
                    </Flex>
                  )
                })}

                {/* Pagination */}
                {txTotal > TX_PAGE_SIZE && (
                  <Flex align="center" justify="space-between" px={4} py="10px"
                    borderTop={`1px solid ${GRAY100}`}>
                    <Text fontSize="12px" color={GRAY500}>
                      {(txPage - 1) * TX_PAGE_SIZE + 1}–{Math.min(txPage * TX_PAGE_SIZE, txTotal)} of {txTotal}
                    </Text>
                    <Flex gap={2}>
                      <Box as="button"
                        aria-disabled={txPage === 1}
                        onClick={txPage > 1 ? () => loadTransactions(txPage - 1) : undefined}
                        px={3} py="4px" borderRadius="7px" fontSize="12px" fontWeight={500}
                        bg={GRAY100} color={GRAY600}
                        style={{ border: `1px solid ${GRAY200}`, cursor: txPage === 1 ? 'not-allowed' : 'pointer', opacity: txPage === 1 ? 0.4 : 1 }}>
                        Prev
                      </Box>
                      <Box as="button"
                        aria-disabled={txPage * TX_PAGE_SIZE >= txTotal}
                        onClick={txPage * TX_PAGE_SIZE < txTotal ? () => loadTransactions(txPage + 1) : undefined}
                        px={3} py="4px" borderRadius="7px" fontSize="12px" fontWeight={500}
                        bg={GRAY100} color={GRAY600}
                        style={{ border: `1px solid ${GRAY200}`, cursor: txPage * TX_PAGE_SIZE >= txTotal ? 'not-allowed' : 'pointer', opacity: txPage * TX_PAGE_SIZE >= txTotal ? 0.4 : 1 }}>
                        Next
                      </Box>
                    </Flex>
                  </Flex>
                )}
              </>
            )}
          </Card>
        </Box>
      </Box>

      <AdminWarnModal
        isOpen={modal === 'warn'}
        userName={[user.first_name, user.last_name].filter(Boolean).join(' ') || user.email}
        onConfirm={async (msg) => {
          setWarnLoading(true)
          try {
            await adminAPI.warnUser(user.id, msg)
            toast.success('Warning issued')
            setModal(null); load()
          } catch (e) {
            toast.error(getErrorMessage(e) ?? 'Failed to warn user')
          } finally {
            setWarnLoading(false)
          }
        }}
        onClose={() => setModal(null)}
        loading={warnLoading}
      />
      {modal === 'karma' && (
        <AdminKarmaModal
          isOpen
          userName={[user.first_name, user.last_name].filter(Boolean).join(' ') || user.email}
          currentKarma={user.karma_score}
          userId={user.id}
          onDone={() => { setModal(null); load() }}
          onClose={() => setModal(null)}
        />
      )}
      <AdminConfirmModal
        isOpen={suspendConfirm}
        title={user.is_active ? 'Suspend User' : 'Reactivate User'}
        description={
          user.is_active
            ? `Are you sure you want to suspend ${[user.first_name, user.last_name].filter(Boolean).join(' ') || user.email}? They will lose access to the platform.`
            : `Are you sure you want to reactivate ${[user.first_name, user.last_name].filter(Boolean).join(' ') || user.email}? They will regain full access.`
        }
        confirmLabel={user.is_active ? 'Suspend' : 'Reactivate'}
        accent={user.is_active ? RED : GREEN}
        accentLt={user.is_active ? RED_LT : GREEN_LT}
        onConfirm={executeSuspend}
        onClose={() => setSuspendConfirm(false)}
        loading={actionLoading}
      />
      {modal === 'role' && (
        <RoleAssignModal
          userId={user.id}
          currentRole={user.role}
          actorRole={adminUser?.role ?? ''}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); load() }}
        />
      )}
    </AdminLayout>
  )
}
