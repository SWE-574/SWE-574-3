import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Box, Flex, Text } from '@chakra-ui/react'
import {
  FiActivity,
  FiMessageSquare,
  FiUser,
  FiBell,
  FiLogOut,
  FiChevronDown,
  FiPlusCircle,
  FiGrid,
  FiMessageCircle,
  FiMenu,
  FiX,
  FiLayers,
} from 'react-icons/fi'
import { useAuthStore } from '@/store/useAuthStore'

import {
  YELLOW, GREEN, GREEN_LT, RED, RED_LT,
  GRAY50, GRAY100, GRAY200, GRAY500, GRAY600, GRAY700, GRAY800, GRAY900,
  WHITE,
} from '@/theme/tokens'
import { Logo } from '@/components/Logo'
import { NotificationDropdown } from '@/components/NotificationDropdown'
// ─── Helpers ───────────────────────────────────────────────────────────────

function initials(user: { first_name?: string; last_name?: string; email?: string } | null) {
  if (!user) return '?'
  const f = user.first_name?.[0] ?? ''
  const l = user.last_name?.[0] ?? ''
  return (f || l) ? `${f}${l}`.toUpperCase() : (user.email?.[0] ?? '?').toUpperCase()
}

// ─── Dropdown ──────────────────────────────────────────────────────────────

function Dropdown({ trigger, children }: { trigger: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={() => setOpen((v) => !v)} style={{ cursor: 'pointer' }}>{trigger}</div>
      {open && (
        <div
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 8px)',
            background: WHITE, border: `1px solid ${GRAY200}`, borderRadius: '14px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
            zIndex: 100, minWidth: '192px', overflow: 'hidden',
          }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}

function DropdownItem({ onClick, icon, children, danger }: {
  onClick?: () => void; icon?: React.ReactNode; children: React.ReactNode; danger?: boolean
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 16px', fontSize: '14px', fontWeight: 500,
        color: danger ? RED : GRAY700, cursor: 'pointer', transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = danger ? RED_LT : GRAY50 }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
    >
      {icon && <span style={{ color: danger ? RED : GRAY500, display: 'flex' }}>{icon}</span>}
      {children}
    </div>
  )
}

// ─── NavLink ───────────────────────────────────────────────────────────────

function NavLink({ to, icon, children, active }: {
  to: string; icon?: React.ReactNode; children: React.ReactNode; active?: boolean
}) {
  return (
    <Link
      to={to}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '6px 12px', borderRadius: '10px', fontSize: '14px',
        fontWeight: active ? 600 : 500,
        color: active ? WHITE : GRAY700,
        background: active ? GREEN : 'transparent',
        textDecoration: 'none', transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLAnchorElement).style.background = GRAY100 }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLAnchorElement).style.background = 'transparent' }}
    >
      {icon}{children}
    </Link>
  )
}

// ─── Mobile NavLink ────────────────────────────────────────────────────────

function MobileNavLink({ to, icon, children, active, onClick }: {
  to: string; icon?: React.ReactNode; children: React.ReactNode; active?: boolean; onClick: () => void
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 16px', fontSize: '15px', fontWeight: active ? 700 : 500,
        color: active ? GREEN : GRAY800, background: active ? GREEN_LT : 'transparent',
        borderRadius: '10px', textDecoration: 'none',
        borderLeft: active ? `3px solid ${GREEN}` : '3px solid transparent',
      }}
    >
      <span style={{ color: active ? GREEN : GRAY500, display: 'flex' }}>{icon}</span>
      {children}
    </Link>
  )
}

// ─── Main Navbar ────────────────────────────────────────────────────────────

const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuthStore()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const mobileRef = useRef<HTMLDivElement>(null)

  const handleLogout = () => { logout(); navigate('/') }

  // Close mobile menu on route change
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  // Close mobile menu on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (mobileRef.current && !mobileRef.current.contains(e.target as Node)) setMobileOpen(false) }
    if (mobileOpen) document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [mobileOpen])

  const balance = Number(user?.timebank_balance ?? 0)
  const p       = location.pathname
  const isAdmin = ['admin', 'super_admin', 'moderator'].includes(user?.role ?? '') || user?.is_admin === true
  // On dashboard the sidebar already shows balance & post service — hide them from navbar
  const isDashboard = p === '/dashboard'

  return (
    <Box
      as="nav"
      position="sticky" top={{ base: 0, md: '8px' }} zIndex={50}
      ref={mobileRef}
      mx="auto" maxW="1440px"
      px={{ base: 0, md: 4 }}
      borderRadius={{ base: 0, md: '16px' }}
      mb={0}
      style={{
        background: WHITE,
        border: `1px solid ${GRAY200}`,
        boxShadow: '0 4px 20px rgba(0,0,0,0.07)',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      }}
    >
      <Flex maxW="1440px" mx="auto" px={{ base: 4, md: 8 }} h="64px" align="center" justify="space-between" position="relative">

        {/* Logo */}
        <Link to="/dashboard" style={{ textDecoration: 'none', flexShrink: 0 }}>
          <Flex align="center" gap={3}>
            <Logo size={32} />
            <Text fontWeight="800" fontSize="17px" color={GRAY900} letterSpacing="-0.3px">
              The Hive
            </Text>
          </Flex>
        </Link>

        {/* Desktop nav links — absolutely centered, always in middle of navbar */}
        {isAuthenticated && (
          <Flex
            align="center" gap={1} display={{ base: 'none', md: 'flex' }}
            position="absolute" left="50%" style={{ transform: 'translateX(-50%)' }}
          >
            <NavLink to="/dashboard" icon={<FiGrid size={15} />} active={p === '/dashboard'}>Browse</NavLink>
            <NavLink to="/forum" icon={<FiMessageCircle size={15} />} active={p.startsWith('/forum')}>Forum</NavLink>
            <NavLink to="/activity" icon={<FiActivity size={15} />} active={p === '/activity'}>Activity</NavLink>
            <NavLink to="/messages" icon={<FiMessageSquare size={15} />} active={p === '/messages' || p.startsWith('/messages/')}>Messages</NavLink>
          </Flex>
        )}

        {/* Desktop right side */}
        <Flex align="center" gap={2}>
          {isAuthenticated ? (
            <>
              {/* Post service — desktop (invisible on dashboard, keeps layout stable) */}
              <Box
                display={{ base: 'none', md: 'block' }}
                style={{ visibility: isDashboard ? 'hidden' : 'visible' }}
              >
                <Dropdown
                  trigger={
                    <Flex
                      align="center" gap="6px" px="14px" py="7px" borderRadius="10px"
                      style={{ background: GREEN, color: WHITE, fontWeight: 600, fontSize: '14px', cursor: 'pointer', userSelect: 'none' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = '0.88' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = '1' }}
                    >
                      <FiPlusCircle size={15} />
                      Post Service
                      <FiChevronDown size={13} />
                    </Flex>
                  }
                >
                  <DropdownItem onClick={() => navigate('/post-offer')} icon={<FiPlusCircle size={14} />}>Offer a Service</DropdownItem>
                  <DropdownItem onClick={() => navigate('/post-need')} icon={<FiPlusCircle size={14} />}>Request a Service</DropdownItem>
                  <DropdownItem onClick={() => navigate('/post-event')} icon={<FiPlusCircle size={14} />}>Create an Event</DropdownItem>
                </Dropdown>
              </Box>

              {/* Balance — desktop (invisible on dashboard, keeps layout stable) */}
              <Flex
                as="button"
                align="center" gap="5px" px="12px" py="5px" borderRadius="10px"
                display={{ base: 'none', sm: 'flex' }}
                onClick={() => navigate('/transaction-history')}
                style={{
                  background: GREEN_LT, border: `1px solid #BBF7D0`,
                  fontSize: '13px', fontWeight: 700, color: GREEN,
                  visibility: isDashboard ? 'hidden' : 'visible',
                  cursor: isDashboard ? 'default' : 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (!isDashboard) (e.currentTarget as HTMLDivElement).style.filter = 'brightness(0.98)'
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.filter = 'none'
                }}
              >
                <span style={{ fontSize: '12px' }}>⏱</span>
                {balance.toFixed(1)}h
              </Flex>

              {/* Notifications */}
              <Box display={{ base: 'none', sm: 'flex' }} alignItems="center">
                <NotificationDropdown />
              </Box>

              {/* User dropdown — desktop */}
              <Box display={{ base: 'none', md: 'block' }}>
                <Dropdown
                  trigger={
                    <Flex
                      data-testid="user-menu-trigger"
                      align="center" gap="6px" p="5px" borderRadius="10px"
                      style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = GRAY100 }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                    >
                      <Box
                        w="34px" h="34px" borderRadius="full" flexShrink={0}
                        display="flex" alignItems="center" justifyContent="center"
                        fontWeight="700" fontSize="13px" overflow="hidden"
                        style={{ background: YELLOW, color: GREEN, boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }}
                      >
                        {user?.avatar_url
                          ? <img src={user.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : initials(user)
                        }
                      </Box>
                      <FiChevronDown size={13} style={{ color: GRAY500 }} />
                    </Flex>
                  }
                >
                  <Box px="16px" py="12px" style={{ borderBottom: `1px solid ${GRAY100}` }}>
                    <Text fontSize="14px" fontWeight={700} color={GRAY800}>{user?.first_name} {user?.last_name}</Text>
                    <Text fontSize="12px" color={GRAY500} mt="1px">{user?.email}</Text>
                  </Box>
                  <Box py="4px">
                    <DropdownItem onClick={() => navigate('/profile')} icon={<FiUser size={14} />}>My Profile</DropdownItem>
                    {isAdmin && (
                      <DropdownItem onClick={() => navigate('/admin')} icon={<FiGrid size={14} />}>Admin Panel</DropdownItem>
                    )}
                  </Box>
                  <Box style={{ borderTop: `1px solid ${GRAY100}` }} py="4px">
                    <DropdownItem onClick={handleLogout} icon={<FiLogOut size={14} />} danger>Log Out</DropdownItem>
                  </Box>
                </Dropdown>
              </Box>

              {/* Mobile hamburger */}
              <Box
                as="button" display={{ base: 'flex', md: 'none' }}
                alignItems="center" justifyContent="center"
                w="36px" h="36px" borderRadius="10px"
                bg={mobileOpen ? GRAY100 : 'transparent'}
                color={GRAY600}
                onClick={() => setMobileOpen((v) => !v)}
                style={{ border: 'none', cursor: 'pointer', flexShrink: 0 }}
              >
                {mobileOpen ? <FiX size={20} /> : <FiMenu size={20} />}
              </Box>
            </>
          ) : (
            <>
              {/* Unauthenticated desktop */}
              <Box
                as="button" display={{ base: 'none', sm: 'block' }}
                px="14px" py="7px" borderRadius="10px"
                fontSize="14px" fontWeight={500} color={GRAY700}
                onClick={() => navigate('/login')}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as unknown as HTMLButtonElement).style.background = GRAY100 }}
                onMouseLeave={(e) => { (e.currentTarget as unknown as HTMLButtonElement).style.background = 'transparent' }}
              >
                Log In
              </Box>
              <Box
                as="button"
                px="14px" py="7px" borderRadius="10px"
                fontSize="14px" fontWeight={600} color={WHITE}
                onClick={() => navigate('/register')}
                style={{ background: GREEN, border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as unknown as HTMLButtonElement).style.opacity = '0.88' }}
                onMouseLeave={(e) => { (e.currentTarget as unknown as HTMLButtonElement).style.opacity = '1' }}
              >
                Sign Up
              </Box>
            </>
          )}
        </Flex>
      </Flex>

      {/* ── Mobile menu drawer ──────────────────────────────────────────────── */}
      {mobileOpen && isAuthenticated && (
        <Box
          display={{ base: 'block', md: 'none' }}
          bg={WHITE}
          borderTop={`1px solid ${GRAY100}`}
          boxShadow="0 8px 24px rgba(0,0,0,0.08)"
          px={4} py={3}
        >
          {/* User info strip */}
          <Flex align="center" gap={3} px={2} py={3} mb={2}
            borderBottom={`1px solid ${GRAY100}`}
          >
            <Box
              w="38px" h="38px" borderRadius="full" flexShrink={0}
              display="flex" alignItems="center" justifyContent="center"
              fontWeight="700" fontSize="14px" overflow="hidden"
              style={{ background: YELLOW, color: GREEN }}
            >
              {user?.avatar_url
                ? <img src={user.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initials(user)
              }
            </Box>
            <Box flex={1} minW={0}>
              <Text fontSize="14px" fontWeight={700} color={GRAY800}>{user?.first_name} {user?.last_name}</Text>
              <Text fontSize="11px" color={GRAY500}
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {user?.email}
              </Text>
            </Box>
            {/* Time bank inline */}
            <Flex as="button" align="center" gap="4px" px="10px" py="5px" borderRadius="9px"
              onClick={() => { navigate('/transaction-history'); setMobileOpen(false) }}
              style={{ background: GREEN_LT, border: `1px solid #BBF7D0`, fontSize: '13px', fontWeight: 700, color: GREEN, flexShrink: 0 }}
            >
              <span style={{ fontSize: '11px' }}>⏱</span>
              {balance.toFixed(1)}h
            </Flex>
          </Flex>

          {/* Nav links */}
          <Box mb={2}>
            <MobileNavLink to="/dashboard" icon={<FiGrid size={16} />} active={p === '/dashboard'} onClick={() => setMobileOpen(false)}>Browse</MobileNavLink>
            <MobileNavLink to="/forum" icon={<FiMessageCircle size={16} />} active={p.startsWith('/forum')} onClick={() => setMobileOpen(false)}>Forum</MobileNavLink>
            <MobileNavLink to="/messages" icon={<FiMessageSquare size={16} />} active={p === '/messages' || p.startsWith('/messages/')} onClick={() => setMobileOpen(false)}>Messages</MobileNavLink>
            <MobileNavLink to="/notifications" icon={<FiBell size={16} />} active={p === '/notifications'} onClick={() => setMobileOpen(false)}>Notifications</MobileNavLink>
            <MobileNavLink to="/profile" icon={<FiUser size={16} />} active={p === '/profile'} onClick={() => setMobileOpen(false)}>My Profile</MobileNavLink>
            {isAdmin && (
              <MobileNavLink to="/admin" icon={<FiGrid size={16} />} active={p === '/admin' || p.startsWith('/admin?')} onClick={() => setMobileOpen(false)}>
                Admin Panel
              </MobileNavLink>
            )}
          </Box>

          {/* Post service */}
          <Box borderTop={`1px solid ${GRAY100}`} pt={3} mb={2}>
            <Text fontSize="10px" fontWeight={700} color={GRAY500} px={2} mb={2}
              style={{ letterSpacing: '0.07em', textTransform: 'uppercase' }}
            >
              Post a Service
            </Text>
            <Flex gap={2} px={2}>
              <Box
                as="button" flex={1} py="10px" borderRadius="10px" bg={GREEN} color={WHITE}
                fontSize="14px" fontWeight={700}
                display="flex" alignItems="center" justifyContent="center" gap="6px"
                onClick={() => { navigate('/post-offer'); setMobileOpen(false) }}
              >
                <FiPlusCircle size={15} /> Offer
              </Box>
              <Box
                as="button" flex={1} py="10px" borderRadius="10px"
                style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}
                fontSize="14px" fontWeight={700}
                display="flex" alignItems="center" justifyContent="center" gap="6px"
                onClick={() => { navigate('/post-need'); setMobileOpen(false) }}
              >
                <FiLayers size={15} /> Need
              </Box>
              <Box
                as="button" flex={1} py="10px" borderRadius="10px"
                style={{ background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}
                fontSize="14px" fontWeight={700}
                display="flex" alignItems="center" justifyContent="center" gap="6px"
                onClick={() => { navigate('/post-event'); setMobileOpen(false) }}
              >
                <FiPlusCircle size={15} /> Event
              </Box>
            </Flex>
          </Box>

          {/* Logout */}
          <Box borderTop={`1px solid ${GRAY100}`} pt={2}>
            <Box
              as="button" w="full" py="10px" px="16px" borderRadius="10px"
              display="flex" alignItems="center" gap="10px"
              fontSize="14px" fontWeight={500} color={RED}
              bg="transparent"
              onClick={() => { handleLogout(); setMobileOpen(false) }}
              _hover={{ bg: RED_LT }} transition="background 0.15s"
            >
              <FiLogOut size={16} /> Log Out
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}

export default Navbar
