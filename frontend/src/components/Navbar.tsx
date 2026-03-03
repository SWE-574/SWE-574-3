import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Box, Flex, Text, Button, HStack } from '@chakra-ui/react'
import {
  FiMessageSquare,
  FiUser,
  FiBell,
  FiLogOut,
  FiChevronDown,
  FiPlusCircle,
  FiGrid,
  FiMessageCircle,
} from 'react-icons/fi'
import { useAuthStore } from '@/store/useAuthStore'

// ─── Design tokens (aligned with ChatPage / DashboardPage) ─────────────────
const YELLOW   = '#F8C84A'
const GREEN    = '#2D5C4E'
const GREEN_LT = '#F0FDF4'
const GRAY50   = '#F9FAFB'
const GRAY100  = '#F3F4F6'
const GRAY200  = '#E5E7EB'
const GRAY500  = '#6B7280'
const GRAY700  = '#374151'
const GRAY800  = '#1F2937'
const GRAY900  = '#111827'
const WHITE    = '#FFFFFF'

// ─── Helpers ───────────────────────────────────────────────────────────────
function initials(user: { first_name?: string; last_name?: string; email?: string } | null) {
  if (!user) return '?'
  const first = user.first_name?.[0] ?? ''
  const last = user.last_name?.[0] ?? ''
  if (first || last) return `${first}${last}`.toUpperCase()
  return (user.email?.[0] ?? '?').toUpperCase()
}

// ─── Dropdown ──────────────────────────────────────────────────────────────
interface DropdownProps {
  trigger: React.ReactNode
  children: React.ReactNode
}

function Dropdown({ trigger, children }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={() => setOpen((v) => !v)} style={{ cursor: 'pointer' }}>
        {trigger}
      </div>
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            background: WHITE,
            border: `1px solid ${GRAY200}`,
            borderRadius: '14px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
            zIndex: 100,
            minWidth: '192px',
            overflow: 'hidden',
          }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}

interface DropdownItemProps {
  onClick?: () => void
  icon?: React.ReactNode
  children: React.ReactNode
  danger?: boolean
}

function DropdownItem({ onClick, icon, children, danger }: DropdownItemProps) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 16px',
        fontSize: '14px',
        fontWeight: 500,
        color: danger ? '#DC2626' : GRAY700,
        cursor: 'pointer',
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.background = danger ? '#FEF2F2' : GRAY50
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
      }}
    >
      {icon && (
        <span style={{ color: danger ? '#DC2626' : GRAY500, display: 'flex' }}>
          {icon}
        </span>
      )}
      {children}
    </div>
  )
}

// ─── NavLink ───────────────────────────────────────────────────────────────
interface NavLinkProps {
  to: string
  icon?: React.ReactNode
  children: React.ReactNode
  active?: boolean
}

function NavLink({ to, icon, children, active }: NavLinkProps) {
  return (
    <Link
      to={to}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        borderRadius: '10px',
        fontSize: '14px',
        fontWeight: active ? 600 : 500,
        color: active ? WHITE : GRAY700,
        background: active ? GREEN : 'transparent',
        textDecoration: 'none',
        transition: 'background 0.15s ease, color 0.15s ease',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          ;(e.currentTarget as HTMLAnchorElement).style.background = GRAY100
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          ;(e.currentTarget as HTMLAnchorElement).style.background = 'transparent'
        }
      }}
    >
      {icon}
      {children}
    </Link>
  )
}

// ─── Navbar ────────────────────────────────────────────────────────────────
const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const balance = user?.timebank_balance ?? 0

  return (
    <Box
      as="nav"
      position="sticky"
      top={0}
      zIndex={50}
      style={{
        background: 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${GRAY200}`,
        boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.04)',
      }}
    >
      <Flex
        maxW="1440px"
        mx="auto"
        px={8}
        h="64px"
        align="center"
        justify="space-between"
      >
        {/* ── Logo ─── */}
        <Link to="/" style={{ textDecoration: 'none' }}>
          <Flex align="center" gap={2}>
            <Box
              w="32px"
              h="32px"
              borderRadius="9px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              fontWeight="black"
              fontSize="16px"
              color={GREEN}
              style={{
                background: `linear-gradient(135deg, ${YELLOW} 0%, #f5b800 100%)`,
                boxShadow: '0 2px 6px rgba(248,200,74,0.4)',
              }}
            >
              H
            </Box>
            <Text fontWeight="800" fontSize="17px" color={GRAY900} letterSpacing="-0.3px">
              The Hive
            </Text>
          </Flex>
        </Link>

        {/* ── Nav links (authenticated) ─── */}
        {isAuthenticated && (
          <HStack gap={1}>
            <NavLink
              to="/dashboard"
              icon={<FiGrid size={15} />}
              active={location.pathname === '/dashboard'}
            >
              Browse
            </NavLink>
            <NavLink
              to="/forum"
              icon={<FiMessageCircle size={15} />}
              active={location.pathname.startsWith('/forum')}
            >
              Forum
            </NavLink>
            <NavLink
              to="/messages"
              icon={<FiMessageSquare size={15} />}
              active={location.pathname === '/messages'}
            >
              Messages
            </NavLink>
          </HStack>
        )}

        {/* ── Right side ─── */}
        <HStack gap={2}>
          {isAuthenticated ? (
            <>
              {/* Post service dropdown */}
              <Dropdown
                trigger={
                  <Flex
                    align="center"
                    gap="6px"
                    px="14px"
                    py="7px"
                    borderRadius="10px"
                    style={{
                      background: GREEN,
                      color: WHITE,
                      fontWeight: 600,
                      fontSize: '14px',
                      cursor: 'pointer',
                      transition: 'opacity 0.15s ease',
                      userSelect: 'none',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = '0.88' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = '1' }}
                  >
                    <FiPlusCircle size={15} />
                    Post Service
                    <FiChevronDown size={13} style={{ marginLeft: '2px' }} />
                  </Flex>
                }
              >
                <DropdownItem onClick={() => navigate('/post-offer')} icon={<FiPlusCircle size={14} />}>
                  Offer a Service
                </DropdownItem>
                <DropdownItem onClick={() => navigate('/post-need')} icon={<FiPlusCircle size={14} />}>
                  Request a Service
                </DropdownItem>
              </Dropdown>

              {/* Balance badge */}
              <Flex
                align="center"
                gap="5px"
                px="12px"
                py="5px"
                borderRadius="10px"
                style={{
                  background: GREEN_LT,
                  border: `1px solid #BBF7D0`,
                  fontSize: '13px',
                  fontWeight: 700,
                  color: GREEN,
                  letterSpacing: '-0.2px',
                }}
              >
                <span style={{ fontSize: '12px' }}>⏱</span>
                {balance.toFixed(1)}h
              </Flex>

              {/* Notifications */}
              <Box
                as="button"
                onClick={() => navigate('/notifications')}
                p="8px"
                borderRadius="10px"
                cursor="pointer"
                style={{ color: GRAY500, transition: 'background 0.15s ease' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = GRAY100 }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                <FiBell size={18} />
              </Box>

              {/* User dropdown */}
              <Dropdown
                trigger={
                  <Flex
                    align="center"
                    gap="6px"
                    p="5px"
                    borderRadius="10px"
                    style={{ cursor: 'pointer', transition: 'background 0.15s ease' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = GRAY100 }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                  >
                    <Box
                      w="34px"
                      h="34px"
                      borderRadius="full"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      fontWeight="700"
                      fontSize="13px"
                      overflow="hidden"
                      flexShrink={0}
                      style={{
                        background: YELLOW,
                        color: GREEN,
                        boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                      }}
                    >
                      {user?.avatar_url ? (
                        <img
                          src={user.avatar_url}
                          alt="avatar"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        initials(user)
                      )}
                    </Box>
                    <FiChevronDown size={13} style={{ color: GRAY500 }} />
                  </Flex>
                }
              >
                <Box
                  px="16px"
                  py="12px"
                  style={{ borderBottom: `1px solid ${GRAY100}` }}
                >
                  <Text fontSize="14px" fontWeight={700} color={GRAY800} letterSpacing="-0.2px">
                    {user?.first_name} {user?.last_name}
                  </Text>
                  <Text fontSize="12px" color={GRAY500} mt="1px">
                    {user?.email}
                  </Text>
                </Box>
                <Box py="4px">
                  <DropdownItem onClick={() => navigate('/profile')} icon={<FiUser size={14} />}>
                    My Profile
                  </DropdownItem>
                  {user?.is_admin && (
                    <DropdownItem onClick={() => navigate('/admin')} icon={<FiGrid size={14} />}>
                      Admin Panel
                    </DropdownItem>
                  )}
                </Box>
                <Box style={{ borderTop: `1px solid ${GRAY100}` }} py="4px">
                  <DropdownItem onClick={handleLogout} icon={<FiLogOut size={14} />} danger>
                    Log Out
                  </DropdownItem>
                </Box>
              </Dropdown>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/login')}
                style={{
                  color: GRAY700,
                  fontWeight: 500,
                  borderRadius: '10px',
                }}
              >
                Log In
              </Button>
              <Button
                size="sm"
                onClick={() => navigate('/register')}
                style={{
                  background: GREEN,
                  color: WHITE,
                  fontWeight: 600,
                  borderRadius: '10px',
                }}
              >
                Sign Up
              </Button>
            </>
          )}
        </HStack>
      </Flex>
    </Box>
  )
}

export default Navbar
