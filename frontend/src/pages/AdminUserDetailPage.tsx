import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
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
import { useAuthStore } from '@/store/useAuthStore'
import type { AdminUserDetail } from '@/types'
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

// ─── Warn modal ───────────────────────────────────────────────────────────────

function WarnModal({ userId, onClose, onDone }: { userId: string; onClose: () => void; onDone: () => void }) {
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!msg.trim()) return
    setLoading(true)
    try {
      await adminAPI.warnUser(userId, msg.trim())
      toast.success('Warning issued')
      onDone()
    } catch (e) {
      toast.error(getErrorMessage(e) ?? 'Failed to warn user')
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
        <Text fontSize="15px" fontWeight={700} color={GRAY800} mb={3}>Issue Warning</Text>
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Describe the reason for this warning…"
          rows={4}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: '8px',
            border: `1px solid ${GRAY200}`, fontSize: '13px', color: GRAY800,
            resize: 'vertical', outline: 'none', fontFamily: 'inherit',
          }}
        />
        <Flex gap={2} justify="flex-end" mt={3}>
          <ActionBtn label="Cancel" icon={FiCheck} bg={GRAY100} hoverBg={GRAY200} color={GRAY600} onClick={onClose} />
          <ActionBtn label={loading ? 'Sending…' : 'Send Warning'} icon={FiAlertCircle}
            bg={BLUE_LT} hoverBg={BLUE + '40'} color={BLUE}
            onClick={submit} disabled={loading || !msg.trim()} />
        </Flex>
      </Box>
    </Flex>
  )
}

// ─── Karma modal ──────────────────────────────────────────────────────────────

function KarmaModal({ userId, currentKarma, onClose, onDone }: { userId: string; currentKarma: number; onClose: () => void; onDone: () => void }) {
  const [adj, setAdj] = useState('')
  const [loading, setLoading] = useState(false)
  const parsed = parseInt(adj, 10)
  const valid = !Number.isNaN(parsed) && parsed !== 0

  const submit = async () => {
    if (!valid) return
    setLoading(true)
    try {
      await adminAPI.adjustKarma(userId, parsed)
      toast.success(`Karma adjusted by ${parsed > 0 ? '+' : ''}${parsed}`)
      onDone()
    } catch (e) {
      toast.error(getErrorMessage(e) ?? 'Failed to adjust karma')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Flex position="fixed" inset={0} zIndex={200} align="center" justify="center"
      bg="rgba(0,0,0,0.45)" onClick={onClose}>
      <Box bg={WHITE} borderRadius="16px" p={6} w="360px" maxW="90vw"
        boxShadow="0 8px 40px rgba(0,0,0,0.18)"
        onClick={(e) => e.stopPropagation()}>
        <Text fontSize="15px" fontWeight={700} color={GRAY800} mb={1}>Adjust Karma</Text>
        <Text fontSize="12px" color={GRAY500} mb={3}>Current: {currentKarma}</Text>
        <input
          type="number"
          value={adj}
          onChange={(e) => setAdj(e.target.value)}
          placeholder="e.g. +10 or -5"
          style={{
            width: '100%', padding: '10px 12px', borderRadius: '8px',
            border: `1px solid ${GRAY200}`, fontSize: '13px', color: GRAY800,
            outline: 'none', fontFamily: 'inherit',
          }}
        />
        <Flex gap={2} justify="flex-end" mt={3}>
          <ActionBtn label="Cancel" icon={FiCheck} bg={GRAY100} hoverBg={GRAY200} color={GRAY600} onClick={onClose} />
          <ActionBtn label={loading ? 'Saving…' : 'Apply'} icon={FiBarChart2}
            bg={PURPLE_LT} hoverBg={PURPLE + '40'} color={PURPLE}
            onClick={submit} disabled={loading || !valid} />
        </Flex>
      </Box>
    </Flex>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminUserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const { user: adminUser } = useAuthStore()

  const [user, setUser] = useState<AdminUserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'warn' | 'karma' | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const isSelf = adminUser?.id === userId

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

  const handleToggleSuspend = async () => {
    if (!user || isSelf) return
    setActionLoading(true)
    try {
      if (user.is_active) {
        await adminAPI.banUser(user.id)
        toast.success('User suspended')
      } else {
        await adminAPI.unbanUser(user.id)
        toast.success('User reactivated')
      }
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
    <AdminLayout activeTab="users" onTabChange={(tab) => navigate(`/admin?tab=${tab}`)}>
      <Box p={{ base: 3, md: 5 }} maxW="960px" mx="auto">

        {/* Back */}
        <Flex
          as="button"
          align="center" gap={2} mb={4}
          fontSize="13px" fontWeight={500} color={GRAY600}
          onClick={() => navigate('/admin?tab=users')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = GRAY800 }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = GRAY600 }}
        >
          <FiArrowLeft size={14} /> Back to Users
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
                  {user.role === 'admin' && (
                    <Box px={2} py="2px" borderRadius="6px" bg={AMBER_LT} border={`1px solid ${AMBER}30`}>
                      <Text fontSize="11px" fontWeight={600} color={AMBER}>Admin</Text>
                    </Box>
                  )}
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
                  disabled={isSelf}
                />
                <ActionBtn
                  label={user.is_active ? 'Suspend' : 'Reactivate'}
                  icon={user.is_active ? FiSlash : FiCheck}
                  bg={user.is_active ? RED_LT : GREEN_LT}
                  hoverBg={(user.is_active ? RED : GREEN) + '40'}
                  color={user.is_active ? RED : GREEN}
                  onClick={handleToggleSuspend}
                  disabled={isSelf || actionLoading}
                />
                <ActionBtn
                  label="Karma"
                  icon={FiBarChart2}
                  bg={PURPLE_LT} hoverBg={PURPLE + '40'} color={PURPLE}
                  onClick={() => setModal('karma')}
                />
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
              <InfoRow icon={FiBarChart2} label="Karma Score" value={user.karma_score} />
              <InfoRow icon={FiList} label="Time Bank Balance" value={`${Math.floor(user.timebank_balance)} hrs`} />
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
      </Box>

      {modal === 'warn' && (
        <WarnModal userId={user.id} onClose={() => setModal(null)} onDone={() => { setModal(null); load() }} />
      )}
      {modal === 'karma' && (
        <KarmaModal userId={user.id} currentKarma={user.karma_score}
          onClose={() => setModal(null)} onDone={() => { setModal(null); load() }} />
      )}
    </AdminLayout>
  )
}
