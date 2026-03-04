import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { Box, Flex, Text, Button, VStack, HStack, Grid } from '@chakra-ui/react'
import { FiClock, FiArrowRight } from 'react-icons/fi'
import { MapView } from '@/components/MapView'
import { serviceAPI } from '@/services/serviceAPI'
import type { Service } from '@/types'
import { GREEN, GREEN_LT, YELLOW, GRAY50, GRAY100, GRAY200, GRAY500, GRAY600, GRAY800, GRAY900, WHITE } from '@/theme/tokens'
import { Logo } from '@/components/Logo'

// ─── Animated Hero SVG ────────────────────────────────────────────────────────
// Recreated with ultra-smooth CSS keyframes and an elegant design matching the
// "Calm Confidence" UX guidelines and the provided reference screenshot.
function AnimatedHeroSVG() {
  return (
    <Box position="relative" w="100%" h="460px" borderRadius="16px" overflow="hidden" bg="#FAFAFA" border={`1px solid ${GRAY200}`}>
      <svg width="100%" height="100%" viewBox="0 0 800 460" xmlns="http://www.w3.org/2000/svg">
        <style>
          {`
            @keyframes hive-float-1 { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-12px); } }
            @keyframes hive-float-2 { 0%, 100% { transform: translateY(0px) translateX(0px); } 50% { transform: translateY(8px) translateX(-2px); } }
            @keyframes hive-float-3 { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }
            @keyframes hive-float-conn { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(6px); } }
            
            .smooth-card-1 { animation: hive-float-1 10s ease-in-out infinite; }
            .smooth-card-2 { animation: hive-float-2 12s ease-in-out infinite; }
            .smooth-card-3 { animation: hive-float-3 14s ease-in-out infinite; }
            .smooth-conn { animation: hive-float-conn 9s ease-in-out infinite; }
          `}
        </style>
        
        <defs>
          <filter id="heroShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="8" stdDeviation="16" floodOpacity="0.04" />
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.02" />
          </filter>
          <filter id="connShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="8" floodOpacity="0.05" />
          </filter>
        </defs>

        {/* Soft curving ground/horizon */}
        <ellipse cx="400" cy="560" rx="800" ry="200" fill="#F3F4F6" opacity="0.4" />

        {/* Background Hexagonal grid */}
        <g stroke="#E5E7EB" strokeWidth="1" fill="none" opacity="0.6" transform="translate(100, 60)">
          <path d="M 60 20 L 100 40 L 100 80 L 60 100 L 20 80 L 20 40 Z" />
          <path d="M 100 80 L 140 100 L 140 140 L 100 160 L 60 140 L 60 100 Z" />
          <path d="M 140 20 L 180 40 L 180 80 L 140 100 L 100 80 L 100 40 Z" />
          <path d="M 180 80 L 220 100 L 220 140 L 180 160 L 140 140 L 140 100 Z" />
        </g>

        {/* Card 2: Need (Left) */}
        <g className="smooth-card-2">
          <rect x="250" y="200" width="180" height="130" rx="12" fill="#FFFFFF" filter="url(#heroShadow)" />
          <rect x="265" y="215" width="36" height="36" rx="8" fill="#EFF6FF" />
          <circle cx="283" cy="233" r="7" fill="#3B82F6" />
          
          <rect x="315" y="222" width="60" height="6" rx="3" fill="#E5E7EB" />
          <rect x="315" y="236" width="45" height="6" rx="3" fill="#E5E7EB" />

          <rect x="265" y="265" width="145" height="6" rx="3" fill="#374151" />
          <rect x="265" y="280" width="100" height="6" rx="3" fill="#9CA3AF" />

          <rect x="265" y="300" width="145" height="14" rx="7" fill="#F3F4F6" />
        </g>

        {/* Card 3: Earn/Offer (Right Bottom) */}
        <g className="smooth-card-3">
          <rect x="520" y="230" width="190" height="120" rx="12" fill="#FFFFFF" filter="url(#heroShadow)" />
          
          <rect x="535" y="245" width="160" height="55" rx="8" fill="#FFFBEB" />
          <circle cx="615" cy="272" r="14" stroke="#F59E0B" strokeWidth="6" fill="none" opacity="0.8" />

          <rect x="535" y="315" width="110" height="8" rx="4" fill="#374151" />
          <rect x="535" y="330" width="70" height="6" rx="3" fill="#9CA3AF" />
        </g>

        {/* Central Connector / Avatar */}
        <g className="smooth-conn">
          <circle cx="455" cy="215" r="24" fill="#FFFFFF" filter="url(#connShadow)" />
          <circle cx="455" cy="215" r="18" fill="#D1FAE5" />
          {/* Abstract person */}
          <circle cx="455" cy="210" r="5" fill="#166534" />
          <path d="M444 223 C444 216 466 216 466 223" fill="none" stroke="#166534" strokeWidth="3" strokeLinecap="round" />
        </g>

        {/* Card 1: Check/Confirm (Top Right) */}
        <g className="smooth-card-1">
          <rect x="425" y="80" width="190" height="90" rx="12" fill="#FFFFFF" filter="url(#heroShadow)" />
          <rect x="440" y="95" width="40" height="40" rx="8" fill="#F0FDF4" />
          <path d="M452 115 L458 120 L468 108" fill="none" stroke="#166534" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          
          <rect x="495" y="102" width="80" height="8" rx="4" fill="#374151" />
          <rect x="495" y="120" width="55" height="8" rx="4" fill="#9CA3AF" />
          
          <rect x="440" y="150" width="160" height="6" rx="3" fill="#E5E7EB" />
        </g>
      </svg>
    </Box>
  )
}

// ─── Custom SVG Icons for "How it works" ──────────────────────────────────────
function CommunityIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>
         {`
           @keyframes orb1 { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
           @keyframes orb2 { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(4px); } }
           .orb-1 { animation: orb1 4s ease-in-out infinite; }
           .orb-2 { animation: orb2 5s ease-in-out infinite; }
         `}
      </style>
      <defs>
         <linearGradient id="iconGradient1" x1="0" y1="0" x2="40" y2="40">
            <stop stopColor={YELLOW} />
            <stop offset="1" stopColor="#D97706" />
         </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="20" fill="#FFFBEB" />
      <circle cx="20" cy="15" r="5" fill="url(#iconGradient1)" />
      <path d="M12 30C12 25 16 22 20 22C24 22 28 25 28 30" stroke="url(#iconGradient1)" strokeWidth="3" strokeLinecap="round" />
      
      <g className="orb-1">
        <circle cx="10" cy="16" r="3" fill={YELLOW} opacity="0.6" />
        <path d="M6 28C6 24 9 22 12 22" stroke={YELLOW} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      </g>
      
      <g className="orb-2">
        <circle cx="30" cy="18" r="3" fill={YELLOW} opacity="0.6" />
        <path d="M34 28C34 24 31 22 28 22" stroke={YELLOW} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      </g>
    </svg>
  )
}

function TimeIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>
         {`
           @keyframes clockSpin { 100% { transform: rotate(360deg); } }
           .clock-hand { transform-origin: 20px 20px; animation: clockSpin 12s linear infinite; }
         `}
      </style>
      <circle cx="20" cy="20" r="20" fill={GREEN_LT} />
      <circle cx="20" cy="20" r="12" stroke={GREEN} strokeWidth="2.5" />
      <path className="clock-hand" d="M20 12V20L25 25" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TrustIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
       <style>
          {`
            @keyframes shieldPulse { 0%, 100% { opacity: 0.1; } 50% { opacity: 0.25; } }
            @keyframes dotPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.2); } }
            .shield-glow { animation: shieldPulse 4s ease-in-out infinite; }
            .trust-dot { transform-origin: 20px 20px; animation: dotPulse 3s ease-in-out infinite; }
          `}
       </style>
       <circle cx="20" cy="20" r="20" fill="#EFF6FF" />
       
       <path className="shield-glow" d="M20 32L10 25V15L20 8L30 15V25L20 32Z" fill="#1D4ED8" stroke="#1D4ED8" strokeWidth="1.5" strokeLinejoin="round" />
       <path d="M20 28L13 23V17L20 12L27 17V23L20 28Z" fill="#1D4ED8" stroke="#1D4ED8" strokeWidth="1.5" strokeLinejoin="round"/>
       <circle className="trust-dot" cx="20" cy="20" r="3" fill="#FFFFFF" />
    </svg>
  )
}

// ─── Steps data ───────────────────────────────────────────────────────────────
const HOW_IT_WORKS = [
  {
    icon: <CommunityIcon />,
    title: 'Join the Community',
    body: 'Sign up and receive 3 TimeBank hours to get started. Browse services or post what you can offer to the community.',
  },
  {
    icon: <TimeIcon />,
    title: 'Share Your Time',
    body: 'Connect with others, negotiate schedules, and exchange services. Every hour you give earns you an hour to receive.',
  },
  {
    icon: <TrustIcon />,
    title: 'Build Connections',
    body: 'Grow your network, learn new skills, and contribute to a thriving community built on mutual support and trust.',
  },
]

// ─── Component ────────────────────────────────────────────────────────────────
const HomePage = () => {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()
  const [services, setServices] = useState<Service[]>([])

  useEffect(() => {
    serviceAPI
      .list()
      .then((data) => setServices(data.slice(0, 20)))
      .catch(() => {})
  }, [])

  return (
    <Box minH="100vh" bg={GRAY50}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <Box
        as="header"
        borderBottom={`1px solid ${GRAY200}`}
        bg="rgba(255,255,255,0.9)"
        css={{ backdropFilter: 'blur(10px)' }}
        position="sticky"
        top={0}
        zIndex={50}
      >
        <Flex maxW="1440px" mx="auto" px={8} py={4} align="center" justify="space-between">
          <Flex align="center" gap={3}>
            <Logo size={32} />
            <Text fontWeight="700" fontSize="xl" color={GRAY900} letterSpacing="-0.3px">
              The Hive
            </Text>
          </Flex>
          <HStack gap={4}>
            {isAuthenticated ? (
              <Button
                size="sm"
                onClick={() => navigate('/dashboard')}
                bg={GREEN}
                color={WHITE}
                borderRadius="8px"
                px={5}
                _hover={{ bg: '#254C40', transform: 'translateY(-1px)', boxShadow: '0 2px 8px rgba(45,92,78,0.2)' }}
                transition="all 0.2s"
                fontWeight="medium"
              >
                Go to App →
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/login')}
                  color={GRAY800}
                  _hover={{ bg: GRAY100 }}
                  fontWeight="medium"
                >
                  Log In
                </Button>
                <Button
                  size="sm"
                  onClick={() => navigate('/register')}
                  bg={GREEN}
                  color={WHITE}
                  borderRadius="8px"
                  px={5}
                  _hover={{ bg: '#254C40', transform: 'translateY(-1px)', boxShadow: '0 2px 8px rgba(45,92,78,0.2)' }}
                  transition="all 0.2s"
                  fontWeight="medium"
                >
                  Sign Up
                </Button>
              </>
            )}
          </HStack>
        </Flex>
      </Box>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <Box as="section" maxW="1440px" mx="auto" px={8} py={{ base: 12, md: 24 }}>
        <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={16} alignItems="center">
          {/* Left */}
          <VStack align="flex-start" gap={6}>
            <Flex
              align="center"
              gap={2}
              px={4}
              py={2}
              bg={WHITE}
              borderRadius="full"
              border={`1px solid ${GRAY200}`}
              boxShadow="0 1px 4px rgba(0,0,0,0.06)"
            >
              <Logo size={18} />
              <Text fontSize="sm" color={GRAY800} fontWeight="600">
                Community Time-Bank Platform
              </Text>
            </Flex>

            <Text
              as="h1"
              fontSize={{ base: '4xl', lg: '5xl', xl: '6xl' }}
              fontWeight="800"
              color={GRAY900}
              lineHeight="1.15"
              letterSpacing="-0.02em"
            >
              Connecting communities,
              <br />
              <Text as="span" color={GREEN}>
                sharing time
              </Text>
            </Text>

            <Text color={GRAY600} maxW="520px" fontSize="lg" lineHeight="1.6">
              Join a structured, intuitive platform where time is the true currency. 
              Share your skills, discover local needs, and build trust through a calm, 
              community-driven economy.
            </Text>

            <HStack gap={4} pt={4}>
              {isAuthenticated ? (
                <>
                  <Button
                    size="lg"
                    onClick={() => navigate('/dashboard')}
                    bg={GREEN}
                    color={WHITE}
                    borderRadius="8px"
                    px={8}
                    display="inline-flex"
                    alignItems="center"
                    gap={2}
                    _hover={{ bg: '#254C40', transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(45,92,78,0.2)' }}
                    transition="all 0.2s"
                    fontWeight="600"
                  >
                    Go to App <FiArrowRight />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => navigate('/dashboard')}
                    borderRadius="8px"
                    px={8}
                    borderColor={GRAY200}
                    color={GRAY800}
                    bg={WHITE}
                    _hover={{ bg: GRAY50, transform: 'translateY(-2px)' }}
                    transition="all 0.2s"
                    fontWeight="600"
                  >
                    Browse Services
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="lg"
                    onClick={() => navigate('/register')}
                    bg={GREEN}
                    color={WHITE}
                    borderRadius="8px"
                    px={8}
                    display="inline-flex"
                    alignItems="center"
                    gap={2}
                    _hover={{ bg: '#254C40', transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(45,92,78,0.2)' }}
                    transition="all 0.2s"
                    fontWeight="600"
                  >
                    Get Started <FiArrowRight />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => navigate('/dashboard')}
                    borderRadius="8px"
                    px={8}
                    borderColor={GRAY200}
                    color={GRAY800}
                    bg={WHITE}
                    _hover={{ bg: GRAY50, transform: 'translateY(-2px)' }}
                    transition="all 0.2s"
                    fontWeight="600"
                  >
                    Explore
                  </Button>
                </>
              )}
            </HStack>
          </VStack>

          {/* Right — animated hero svg */}
          <Box position="relative">
            <AnimatedHeroSVG />
            
            {/* Floating stat card */}
            <Box
              position="absolute"
              bottom="-24px"
              left="-24px"
              bg={WHITE}
              borderRadius="12px"
              boxShadow="0 4px 16px rgba(0,0,0,0.10)"
              p={5}
              border={`1px solid ${GRAY200}`}
              animation="float 6s ease-in-out infinite"
              css={{
                '@keyframes float': {
                  '0%': { transform: 'translateY(0px)' },
                  '50%': { transform: 'translateY(-10px)' },
                  '100%': { transform: 'translateY(0px)' }
                }
              }}
            >
              <Flex align="center" gap={4}>
                <Box
                  w="48px"
                  h="48px"
                  borderRadius="8px"
                  bg={GREEN_LT}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  border={`1px solid ${GRAY200}`}
                >
                  <FiClock size={24} color={GREEN} />
                </Box>
                <Box>
                  <Text fontWeight="700" color={GRAY900} fontSize="lg">
                    1,247 Hours
                  </Text>
                  <Text fontSize="sm" color={GRAY500}>
                    Shared This Month
                  </Text>
                </Box>
              </Flex>
            </Box>
          </Box>
        </Grid>
      </Box>

      {/* ── How It Works ────────────────────────────────────────────────────── */}
      <Box as="section" bg={WHITE} py={24} borderY={`1px solid ${GRAY200}`}>
        <Box maxW="1440px" mx="auto" px={8}>
          <VStack gap={4} mb={16} textAlign="center">
            <Text as="h2" fontSize="3xl" fontWeight="700" color={GRAY800}>
              A structure for sharing
            </Text>
            <Text color={GRAY600} maxW="2xl" fontSize="lg">
              The Hive is designed around a calm, clear model where time equals value. 
              No complicated pricing, just connection.
            </Text>
          </VStack>

          <Grid templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }} gap={12}>
            {HOW_IT_WORKS.map((step) => (
              <Box 
                key={step.title} 
                bg={WHITE} 
                p={8} 
                borderRadius="16px" 
                border={`1px solid ${GRAY200}`}
                boxShadow="0 1px 4px rgba(0,0,0,0.06)"
                transition="transform 0.15s, box-shadow 0.15s"
                _hover={{ transform: 'translateY(-4px)', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
              >
                <VStack gap={5} textAlign="left" align="flex-start">
                  <Box display="flex" alignItems="center" justifyContent="center">
                    {step.icon}
                  </Box>
                  <Box>
                    <Text as="h3" fontSize="xl" fontWeight="600" color={GRAY800} mb={3}>
                      {step.title}
                    </Text>
                    <Text color={GRAY600} lineHeight="1.6" fontSize="sm">
                      {step.body}
                    </Text>
                  </Box>
                </VStack>
              </Box>
            ))}
          </Grid>
        </Box>
      </Box>

      {/* ── Map Section ─────────────────────────────────────────────────────── */}
      <Box as="section" bg={GRAY50} py={24}>
        <Box maxW="1440px" mx="auto" px={8}>
          <VStack gap={4} mb={12} textAlign="center">
            <Text as="h2" fontSize="3xl" fontWeight="700" color={GRAY800}>
              Local needs, visualised
            </Text>
            <Text color={GRAY600} maxW="2xl" fontSize="lg">
              Explore offerings in your area. Our calm approach to data respects privacy 
              while keeping the community visible.
            </Text>
          </VStack>

          <Box 
            bg={WHITE} 
            borderRadius="16px" 
            p={2} 
            border={`1px solid ${GRAY200}`} 
            boxShadow="0 4px 24px rgba(0,0,0,0.08)"
          >
            <MapView
              services={services}
              height="480px"
              onServiceClick={(id) => navigate(`/service-detail/${id}`)}
            />
          </Box>
        </Box>
      </Box>

      {/* ── CTA banner ──────────────────────────────────────────────────────── */}
      <Box as="section" maxW="1440px" mx="auto" px={8} py={20}>
        <Box
          bg={GREEN}
          borderRadius="16px"
          p={16}
          textAlign="center"
          position="relative"
          overflow="hidden"
          boxShadow="0 4px 24px rgba(45,92,78,0.2)"
        >
          {/* Subtle SVG BG effect for CTA */}
          <svg
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0.05, pointerEvents: 'none' }}
          >
            <pattern id="pattern-circles" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
              <circle cx="20" cy="20" r="2" fill={WHITE}></circle>
            </pattern>
            <rect x="0" y="0" width="100%" height="100%" fill="url(#pattern-circles)"></rect>
          </svg>

          <VStack position="relative" zIndex={1} gap={6}>
            <Text as="h2" fontSize="3xl" fontWeight="700" color={WHITE}>
              Ready to structure your skills?
            </Text>
            <Text fontSize="lg" color="whiteAlpha.800" maxW="2xl" mx="auto">
              Join the calm, purposeful network where time is valued above all.
            </Text>
            <Button
              size="lg"
              onClick={() => navigate('/register')}
              bg={YELLOW}
              color={GRAY900}
              borderRadius="8px"
              px={8}
              fontWeight="600"
              display="inline-flex"
              alignItems="center"
              gap={2}
              _hover={{ bg: '#FFE58A', transform: 'translateY(-2px)' }}
              transition="all 0.2s"
              mt={4}
            >
              Create Account <FiArrowRight />
            </Button>
          </VStack>
        </Box>
      </Box>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <Box as="footer" borderTop={`1px solid ${GRAY200}`} bg={WHITE} py={10}>
        <Box maxW="1440px" mx="auto" px={8} textAlign="center">
          <Text fontSize="sm" color={GRAY500}>
            © {new Date().getFullYear()} The Hive. A structured time economy.
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

export default HomePage
