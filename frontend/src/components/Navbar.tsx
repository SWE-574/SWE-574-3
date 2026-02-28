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

// ─── Brand colours ─────────────────────────────────────────────────────────
const YELLOW = '#F8C84A'
const GREEN = '#2D5C4E'

// ─── Helpers ───────────────────────────────────────────────────────────────
function initials(user: { first_name?: string; last_name?: string; email?: string } | null) {
  if (!user) return '?'
  const first = user.first_name?.[0] ?? ''
  const last = user.last_name?.[0] ?? ''
  if (first || last) return `${first}${last}`.toUpperCase()
  return (user.email?.[0] ?? '?').toUpperCase()
}

// ─── Dropdown menu ─────────────────────────────────────────────────────────
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
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
            zIndex: 100,
            minWidth: '180px',
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
        color: danger ? '#dc2626' : '#374151',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.background = danger ? '#fef2f2' : '#f9fafb'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
      }}
    >
      {icon && <span style={{ opacity: 0.7 }}>{icon}</span>}
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
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: active ? 600 : 400,
        color: active ? GREEN : '#374151',
        background: active ? `${YELLOW}44` : 'transparent',
        textDecoration: 'none',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          ;(e.currentTarget as HTMLAnchorElement).style.background = '#f9fafb'
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
      bg="white"
      borderBottom="1px solid"
      borderColor="gray.100"
      boxShadow="0 1px 4px rgba(0,0,0,0.06)"
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
              bg={YELLOW}
              borderRadius="8px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              fontWeight="black"
              fontSize="16px"
              color={GREEN}
            >
              H
            </Box>
            <Text fontWeight="700" fontSize="lg" color="gray.900">
              The Hive
            </Text>
          </Flex>
        </Link>

        {/* ── Nav links (authenticated) ─── */}
        {isAuthenticated && (
          <HStack gap={1}>
            <NavLink to="/dashboard" icon={<FiGrid size={15} />} active={location.pathname === '/dashboard'}>
              Browse
            </NavLink>
            <NavLink to="/forum" icon={<FiMessageCircle size={15} />} active={location.pathname.startsWith('/forum')}>
              Forum
            </NavLink>
            <NavLink to="/messages" icon={<FiMessageSquare size={15} />} active={location.pathname === '/messages'}>
              Messages
            </NavLink>
          </HStack>
        )}

        {/* ── Right side ─── */}
        <HStack gap={3}>
          {isAuthenticated ? (
            <>
              {/* Post service dropdown */}
              <Dropdown
                trigger={
                  <Button
                    size="sm"
                    style={{ background: YELLOW, color: GREEN, fontWeight: 600, borderRadius: '9999px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <FiPlusCircle size={15} />
                    Post Service
                    <FiChevronDown size={13} />
                  </Button>
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
              <Box
                px={3}
                py={1}
                bg="#fffbeb"
                border="1px solid #fde68a"
                borderRadius="9999px"
                fontSize="13px"
                fontWeight={600}
                color={GREEN}
                display="flex"
                alignItems="center"
                gap={1}
              >
                ⏱ {balance.toFixed(1)}h
              </Box>

              {/* Notifications */}
              <Box
                as="button"
                onClick={() => navigate('/notifications')}
                p={2}
                borderRadius="9999px"
                _hover={{ bg: 'gray.100' }}
                cursor="pointer"
                color="gray.600"
              >
                <FiBell size={18} />
              </Box>

              {/* User dropdown */}
              <Dropdown
                trigger={
                  <Flex align="center" gap={2} p={1} borderRadius="9999px" _hover={{ bg: 'gray.100' }}>
                    <Box
                      w="34px"
                      h="34px"
                      borderRadius="full"
                      bg={YELLOW}
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      fontWeight="700"
                      fontSize="13px"
                      color={GREEN}
                      overflow="hidden"
                      flexShrink={0}
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
                    <FiChevronDown size={13} style={{ color: '#6b7280' }} />
                  </Flex>
                }
              >
                <Box px={4} py={3} borderBottom="1px solid #f3f4f6">
                  <Text fontSize="14px" fontWeight={600} color="gray.900">
                    {user?.first_name} {user?.last_name}
                  </Text>
                  <Text fontSize="12px" color="gray.500">
                    {user?.email}
                  </Text>
                </Box>
                <DropdownItem onClick={() => navigate('/profile')} icon={<FiUser size={14} />}>
                  My Profile
                </DropdownItem>
                {user?.is_admin && (
                  <DropdownItem onClick={() => navigate('/admin')} icon={<FiGrid size={14} />}>
                    Admin Panel
                  </DropdownItem>
                )}
                <DropdownItem onClick={handleLogout} icon={<FiLogOut size={14} />} danger>
                  Log Out
                </DropdownItem>
              </Dropdown>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/login')}
                style={{ color: '#374151' }}
              >
                Log In
              </Button>
              <Button
                size="sm"
                onClick={() => navigate('/register')}
                style={{ background: GREEN, color: '#fff', borderRadius: '9999px' }}
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
