/**
 * MainSidebar — used by DashboardPage only.
 * Shows: user card, time bank balance, stats, quick post actions,
 *        location filter, and "my listings" widget.
 * Navigation links are intentionally NOT here — they live in the Navbar.
 */
import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Box, Flex, Grid, Text, VStack } from '@chakra-ui/react'
import {
  FiNavigation, FiMapPin, FiLoader, FiPlus, FiLayers, FiZap, FiAward, FiMenu,
} from 'react-icons/fi'
import { useAuthStore } from '@/store/useAuthStore'
import {
  GREEN, GREEN_LT, AMBER, AMBER_LT, BLUE, BLUE_LT,
  GRAY50, GRAY100, GRAY200, GRAY400, GRAY500, GRAY600, GRAY700, GRAY800, WHITE,
} from '@/theme/tokens'

function initials(u?: { first_name?: string; last_name?: string; email?: string } | null) {
  if (!u) return '?'
  const f = u.first_name?.[0] ?? ''
  const l = u.last_name?.[0] ?? ''
  return (f || l) ? `${f}${l}`.toUpperCase() : (u.email?.[0] ?? '?').toUpperCase()
}

function fullName(u?: { first_name?: string; last_name?: string; email?: string } | null) {
  if (!u) return 'User'
  const n = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()
  return n || u.email || 'User'
}

function Avatar({ u, size = 36 }: { u?: { first_name?: string; last_name?: string; email?: string; avatar_url?: string | null } | null; size?: number }) {
  return (
    <Box
      w={`${size}px`} h={`${size}px`} borderRadius="full" flexShrink={0}
      bg={GREEN} color={WHITE} overflow="hidden"
      display="flex" alignItems="center" justifyContent="center"
      fontSize={`${Math.round(size * 0.34)}px`} fontWeight={700}
    >
      {u?.avatar_url
        ? <img src={u.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initials(u)
      }
    </Box>
  )
}

function StatPill({ label, value, bg, color }: { label: string; value: number; bg: string; color: string }) {
  return (
    <Flex direction="column" align="center" justify="center" px={3} py="10px" borderRadius="12px" bg={bg} flex={1} gap="2px">
      <Text fontSize="18px" fontWeight={800} color={color} lineHeight={1}>{value}</Text>
      <Text fontSize="10px" fontWeight={600} color={color} style={{ opacity: 0.7, letterSpacing: '0.03em' }}>{label}</Text>
    </Flex>
  )
}

interface MainSidebarProps {
  pendingHs?: number
  acceptedHs?: number
  completedHs?: number
  myServices?: Array<{ id: string; title: string; type?: string }>
  incomingMap?: Map<string, Array<{ status: string }>>
  locationEnabled?: boolean
  locationLoading?: boolean
  locationError?: string | null
  userLocation?: { lat: number; lng: number } | null
  distanceKm?: number
  distanceLabel?: string
  toggleLocation?: () => void
  setDistanceKm?: (v: number) => void
  hideLocationFilters?: boolean
}

export function MainSidebar({
  pendingHs = 0, acceptedHs = 0, completedHs = 0,
  myServices = [], incomingMap = new Map(),
  locationEnabled, locationLoading, locationError, userLocation, distanceKm, distanceLabel,
  toggleLocation, setDistanceKm,
  hideLocationFilters = false,
}: MainSidebarProps) {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuthStore()
  const balance = user?.timebank_balance ?? null
  const achievementsCount = user?.achievements?.length ?? user?.badges?.length ?? 0

  return (
    <Box
      w="268px" minW="268px"
      bg={WHITE} borderRight={`1px solid ${GRAY200}`}
      display="flex" flexDirection="column"
      h="100%" overflow="hidden"
    >
      {/* ── User card + balance ── */}
      <Box px={4} pt={5} pb={4} borderBottom={`1px solid ${GRAY100}`}>
        {isAuthenticated && user ? (
          <>
            <Flex align="center" gap={3} mb={4}>
              <Avatar u={user} size={44} />
              <Box flex={1} minW={0}>
                <Text fontSize="14px" fontWeight={700} color={GRAY800}
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fullName(user)}
                </Text>
                <Text fontSize="11px" color={GRAY400}
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.email}
                </Text>
                {/* Role badge */}
                {(() => {
                  const isAdmin = (user as { is_admin?: boolean; role?: string }).is_admin || (user as { role?: string }).role === 'admin'
                  const isMod   = (user as { role?: string }).role === 'moderator'
                  const label = isAdmin ? 'Admin' : isMod ? 'Moderator' : 'Member'
                  const bg    = isAdmin ? AMBER_LT : isMod ? '#EDE9FE' : GREEN_LT
                  const color = isAdmin ? AMBER    : isMod ? '#7C3AED' : GREEN
                  return (
                    <Box display="inline-flex" mt="4px" px={2} py="1px" borderRadius="20px" bg={bg}>
                      <Text fontSize="10px" fontWeight={700} color={color}>{label}</Text>
                    </Box>
                  )
                })()}
              </Box>
            </Flex>

            {/* Time bank widget */}
            <Box
              as="button"
              w="full"
              display="block"
              borderRadius="14px" p="14px" mb={3} position="relative" overflow="hidden"
              onClick={() => navigate('/transaction-history')}
              style={{
                background: `linear-gradient(135deg, ${GREEN} 0%, #1a3d35 100%)`,
                border: 'none',
                padding: '14px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'transform 0.12s ease, box-shadow 0.12s ease',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
                ;(e.currentTarget as HTMLElement).style.boxShadow = '0 8px 20px rgba(17,24,39,0.18)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
                ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
              }}
            >
              <Box style={{ position: 'absolute', top: '-20px', right: '-20px', width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
              <Flex align="center" gap="5px" mb="5px">
                <FiZap size={11} color="rgba(255,255,255,0.65)" />
                <Text fontSize="10px" fontWeight={600} color="rgba(255,255,255,0.65)"
                  style={{ letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                  Your Time
                </Text>
              </Flex>
              <Flex align="baseline" gap="5px">
                <Text fontSize="28px" fontWeight={800} color={WHITE} lineHeight={1}>
                  {balance !== null ? balance : '—'}
                </Text>
                <Text fontSize="12px" color="rgba(255,255,255,0.55)" fontWeight={500}>hours</Text>
              </Flex>
              {user.karma_score !== undefined && user.karma_score > 0 && (
                <Flex align="center" gap="4px" mt="7px">
                  <FiAward size={10} color="rgba(255,255,255,0.55)" />
                  <Text fontSize="10px" color="rgba(255,255,255,0.55)">{user.karma_score} karma</Text>
                </Flex>
              )}
            </Box>

            {/* Stats row */}
            <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap="5px">
              <StatPill label="Pending"  value={pendingHs}   bg={AMBER_LT} color={AMBER} />
              <StatPill label="Active"   value={acceptedHs}  bg={GREEN_LT} color={GREEN} />
              <StatPill label="Done"     value={completedHs} bg={BLUE_LT}  color={BLUE}  />
              <Box
                as="button"
                onClick={() => navigate('/achievements')}
                borderRadius="12px"
                style={{ cursor: 'pointer', border: 'none', background: 'transparent', padding: 0, textAlign: 'left' }}
              >
                <StatPill label="Achievements" value={achievementsCount} bg="#F3E8FF" color="#7C3AED" />
              </Box>
            </Grid>
          </>
        ) : (
          <>
            <Text fontSize="15px" fontWeight={700} color={GRAY800} mb={1}>Welcome to Hive</Text>
            <Text fontSize="12px" color={GRAY500} mb={4}>Sign in to access your dashboard.</Text>
            <Flex gap={2}>
              <Box as="button" flex={1} py="9px" borderRadius="9px" bg={GREEN} color={WHITE}
                fontSize="13px" fontWeight={700} textAlign="center"
                onClick={() => navigate('/login')} _hover={{ opacity: 0.9 }}>
                Sign In
              </Box>
              <Box as="button" flex={1} py="9px" borderRadius="9px" bg={GRAY100} color={GRAY700}
                fontSize="13px" fontWeight={600} textAlign="center"
                onClick={() => navigate('/register')} _hover={{ bg: GRAY200 }}>
                Register
              </Box>
            </Flex>
          </>
        )}
      </Box>

      {/* ── Post a Service ── */}
      {isAuthenticated && (
        <Box px={4} py={3} borderBottom={`1px solid ${GRAY100}`}>
          <Text fontSize="10px" fontWeight={700} color={GRAY400} mb={3}
            style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Post a Service
          </Text>
          <Flex gap={2} flexWrap="wrap">
            <Box as="button" flex={1} minW="58px" py="8px" borderRadius="9px" bg={GREEN} color={WHITE}
              fontSize="12px" fontWeight={700}
              display="flex" alignItems="center" justifyContent="center" gap="4px"
              onClick={() => navigate('/post-offer')} _hover={{ opacity: 0.9 }}>
              <FiPlus size={12} /> Offer
            </Box>
            <Box as="button" flex={1} minW="58px" py="8px" borderRadius="9px" bg={BLUE_LT} color={BLUE}
              fontSize="12px" fontWeight={700}
              display="flex" alignItems="center" justifyContent="center" gap="4px"
              border="1px solid #BFDBFE"
              onClick={() => navigate('/post-need')} _hover={{ bg: '#DBEAFE' }}>
              <FiLayers size={12} /> Need
            </Box>
            <Box as="button" flex={1} minW="58px" py="8px" borderRadius="9px"
              fontSize="12px" fontWeight={700}
              display="flex" alignItems="center" justifyContent="center" gap="4px"
              bg="#FFFBEB" color="#D97706" border="1px solid #FDE68A"
              onClick={() => navigate('/post-event')}
              _hover={{ bg: '#FEF3C7' }}>
              <FiPlus size={12} /> Event
            </Box>
          </Flex>
        </Box>
      )}

      {/* ── Location + My Listings ── scrollable */}
      <Box flex={1} overflowY="auto" px={4} py={4}>

        {!hideLocationFilters && toggleLocation && (
          <Box mb={4}>
            <Text fontSize="10px" fontWeight={700} color={GRAY400} mb={3}
              style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Location
            </Text>
            <Box as="button" w="full" py="8px" px="11px" borderRadius="9px" mb={2}
              bg={locationEnabled ? GREEN : GRAY100}
              color={locationEnabled ? WHITE : GRAY700}
              fontSize="12px" fontWeight={600}
              display="flex" alignItems="center" gap="6px"
              onClick={() => !locationLoading && toggleLocation()}
              style={{ cursor: locationLoading ? 'not-allowed' : 'pointer', opacity: locationLoading ? 0.65 : 1 }}>
              {locationLoading
                ? <><FiLoader size={12} /> Getting location…</>
                : locationEnabled
                  ? <><FiMapPin size={12} /> By distance — ON</>
                  : <><FiNavigation size={12} /> Enable location</>}
            </Box>
            {locationError && <Text fontSize="11px" color="red.500" mb={2}>{locationError}</Text>}
            {userLocation && (
              <Box>
                <Flex justify="space-between" mb="6px">
                  <Text fontSize="11px" color={GRAY600} fontWeight={500}>
                    {locationEnabled ? `${distanceKm} km` : 'Disabled'}
                  </Text>
                  <Text fontSize="11px" color={GRAY400}>{locationEnabled ? distanceLabel : '—'}</Text>
                </Flex>
                <input
                  type="range" min={1} max={50} step={1} value={distanceKm}
                  onChange={(e) => { setDistanceKm?.(Number(e.target.value)); if (!locationEnabled) toggleLocation?.() }}
                  style={{ width: '100%', accentColor: GREEN, height: '4px', cursor: 'pointer', opacity: locationEnabled ? 1 : 0.5 }}
                />
                <Flex justify="space-between" mt="4px">
                  <Text fontSize="9px" color={GRAY400}>1 km</Text>
                  <Text fontSize="9px" color={GRAY400}>50 km</Text>
                </Flex>
              </Box>
            )}
          </Box>
        )}

        {isAuthenticated && myServices.length > 0 && !hideLocationFilters && (
          <>
            <Text fontSize="10px" fontWeight={700} color={GRAY400} mb={3}
              style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              My Listings ({myServices.length})
            </Text>
            <VStack gap={2} align="stretch">
              {myServices.slice(0, 4).map((s: { id: string; title: string; type?: string }) => {
                const incoming = (incomingMap ?? new Map()).get(s.id) ?? []
                const pc = incoming.filter((h: { status: string }) => h.status === 'pending').length
                return (
                  <Box key={s.id} as="button" w="full" textAlign="left"
                    px={3} py="8px" borderRadius="9px" bg={GRAY50}
                    border={`1px solid ${GRAY100}`}
                    borderLeft={`3px solid ${s.type === 'Offer' ? GREEN : s.type === 'Event' ? AMBER : BLUE}`}
                    onClick={() => navigate(`/service-detail/${s.id}`)}
                    _hover={{ bg: GRAY100 }}>
                    <Flex align="center" justify="space-between">
                      <Text fontSize="12px" fontWeight={600} color={GRAY700}
                        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '152px' }}>
                        {s.title}
                      </Text>
                      {pc > 0 && (
                        <Box w="16px" h="16px" borderRadius="full" bg="#f97316" color={WHITE}
                          display="flex" alignItems="center" justifyContent="center" fontSize="9px" fontWeight={800}>
                          {pc}
                        </Box>
                      )}
                    </Flex>
                  </Box>
                )
              })}
              {myServices.length > 4 && (
                <Text fontSize="11px" color={GRAY400} textAlign="center">
                  +{myServices.length - 4} more
                </Text>
              )}
            </VStack>
          </>
        )}
      </Box>
    </Box>
  )
}

// ─── SidebarLayout — generic wrapper (used by DashboardPage) ──────────────────

export function SidebarLayout({ children, sidebarProps = {} }: { children: React.ReactNode; sidebarProps?: MainSidebarProps }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const loc = useLocation()

  useEffect(() => {
    const t = setTimeout(() => setSidebarOpen(false), 0)
    return () => clearTimeout(t)
  }, [loc.pathname])

  return (
    <Box bg={GRAY50} minH="calc(100vh - 64px)" py={{ base: 0, md: '16px' }} px={{ base: 0, md: '16px' }}>
      <Box
        maxW="1440px" mx="auto"
        h={{ base: 'calc(100vh - 64px)', md: 'calc(100vh - 96px)' }}
        borderRadius={{ base: 0, md: '20px' }}
        boxShadow={{ base: 'none', md: '0 4px 24px rgba(0,0,0,0.08)' }}
        border={{ base: 'none', md: `1px solid ${GRAY200}` }}
        display="flex" overflow="hidden" position="relative"
      >
        <Box
          display={{ base: sidebarOpen ? 'flex' : 'none', lg: 'flex' }}
          position={{ base: 'absolute', lg: 'relative' }}
          zIndex={{ base: 20, lg: 'auto' }}
          top={0} left={0} bottom={0}
          flexShrink={0}
        >
          <MainSidebar {...sidebarProps} />
        </Box>

        {sidebarOpen && (
          <Box
            display={{ base: 'block', lg: 'none' }}
            position="absolute" inset={0} zIndex={10}
            bg="rgba(0,0,0,0.4)"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <Flex direction="column" flex={1} h="100%" overflow="hidden" minW={0} bg={GRAY50} position="relative">
          <Box display={{ base: 'flex', lg: 'none' }} px={4} py={3} bg={WHITE}
            borderBottom={`1px solid ${GRAY200}`} alignItems="center" flexShrink={0} zIndex={5}>
            <Box as="button" onClick={() => setSidebarOpen(true)} color={GRAY700} mr={3}>
              <FiMenu size={22} />
            </Box>
            <Text fontSize="16px" fontWeight={700} color={GRAY800}>The Hive</Text>
          </Box>
          {children}
        </Flex>
      </Box>
    </Box>
  )
}
