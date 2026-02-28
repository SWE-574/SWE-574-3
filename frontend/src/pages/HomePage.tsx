import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Flex, Text, Button, VStack, HStack, Grid } from '@chakra-ui/react'
import { FiClock, FiUsers, FiHeart, FiArrowRight } from 'react-icons/fi'
import { MapView } from '@/components/MapView'
import { serviceAPI } from '@/services/serviceAPI'
import type { Service } from '@/types'

const YELLOW = '#F8C84A'
const GREEN = '#2D5C4E'
const ORANGE = '#f97316'

// ─── Honeycomb logo icon (simple SVG) ────────────────────────────────────────
function HexLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <polygon
        points="16,2 28,9 28,23 16,30 4,23 4,9"
        fill={YELLOW}
        stroke={GREEN}
        strokeWidth="1.5"
      />
      <text x="16" y="21" textAnchor="middle" fontSize="13" fontWeight="bold" fill={GREEN}>
        H
      </text>
    </svg>
  )
}

// ─── Steps data ───────────────────────────────────────────────────────────────
const HOW_IT_WORKS = [
  {
    icon: <FiUsers size={32} color={ORANGE} />,
    title: 'Join the Community',
    body: 'Sign up and receive 3 TimeBank hours to get started. Browse services or post what you can offer to the community.',
  },
  {
    icon: <FiClock size={32} color={ORANGE} />,
    title: 'Share Your Time',
    body: 'Connect with others, negotiate schedules, and exchange services. Every hour you give earns you an hour to receive.',
  },
  {
    icon: <FiHeart size={32} color={ORANGE} />,
    title: 'Build Connections',
    body: 'Grow your network, learn new skills, and contribute to a thriving community built on mutual support and trust.',
  },
]

// ─── Component ────────────────────────────────────────────────────────────────
const HomePage = () => {
  const navigate = useNavigate()
  const [services, setServices] = useState<Service[]>([])

  useEffect(() => {
    serviceAPI
      .list()
      .then((data) => setServices(data.slice(0, 20)))
      .catch(() => {})
  }, [])

  return (
    <Box minH="100vh" bg="linear-gradient(to bottom, #fffbeb, #ffffff)">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <Box
        as="header"
        borderBottom="1px solid"
        borderColor="orange.100"
        bg="rgba(255,255,255,0.85)"
        backdropFilter="blur(10px)"
        position="sticky"
        top={0}
        zIndex={50}
      >
        <Flex maxW="1440px" mx="auto" px={8} py={4} align="center" justify="space-between">
          <Flex align="center" gap={2}>
            <HexLogo />
            <Text fontWeight="700" fontSize="lg" color="gray.900">
              The Hive
            </Text>
          </Flex>
          <HStack gap={3}>
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
              style={{
                background: ORANGE,
                color: '#fff',
                borderRadius: '9999px',
                padding: '0 20px',
              }}
            >
              Sign Up
            </Button>
          </HStack>
        </Flex>
      </Box>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <Box as="section" maxW="1440px" mx="auto" px={8} py={20}>
        <Grid templateColumns="1fr 1fr" gap={16} alignItems="center">
          {/* Left */}
          <VStack align="flex-start" gap={6}>
            <Flex
              align="center"
              gap={2}
              px={4}
              py={2}
              bg="orange.50"
              borderRadius="full"
              border="1px solid"
              borderColor="orange.200"
            >
              <HexLogo size={16} />
              <Text fontSize="sm" color="orange.800" fontWeight={500}>
                Community Time-Bank Platform
              </Text>
            </Flex>

            <Text
              as="h1"
              fontSize={{ base: '3xl', lg: '4xl', xl: '5xl' }}
              fontWeight="800"
              color="gray.900"
              lineHeight="1.15"
            >
              Connecting Communities,
              <br />
              Sharing Time
            </Text>

            <Text color="gray.600" maxW="480px" fontSize="lg" lineHeight={1.7}>
              Join a vibrant community where time is the currency. Share your skills, learn from
              others, and build meaningful connections through mutual support and collaboration.
            </Text>

            <HStack gap={4}>
              <Button
                size="lg"
                onClick={() => navigate('/register')}
                style={{
                  background: ORANGE,
                  color: '#fff',
                  borderRadius: '9999px',
                  padding: '0 28px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                Get Started <FiArrowRight />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate('/login')}
                style={{ borderRadius: '9999px', padding: '0 28px' }}
              >
                Log In
              </Button>
            </HStack>
          </VStack>

          {/* Right — hero image */}
          <Box position="relative">
            <Box borderRadius="2xl" overflow="hidden" boxShadow="2xl">
              <img
                src="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=800&q=80"
                alt="Community sharing"
                style={{ width: '100%', height: '420px', objectFit: 'cover' }}
              />
            </Box>
            {/* Floating stat card */}
            <Box
              position="absolute"
              bottom="-24px"
              left="-24px"
              bg="white"
              borderRadius="xl"
              boxShadow="lg"
              p={5}
              border="1px solid"
              borderColor="orange.100"
            >
              <Flex align="center" gap={3}>
                <Box
                  w="44px"
                  h="44px"
                  borderRadius="full"
                  bg="orange.50"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <FiClock size={20} color={ORANGE} />
                </Box>
                <Box>
                  <Text fontWeight="700" color="gray.900">
                    1,247 Hours
                  </Text>
                  <Text fontSize="sm" color="gray.500">
                    Shared This Month
                  </Text>
                </Box>
              </Flex>
            </Box>
          </Box>
        </Grid>
      </Box>

      {/* ── How It Works ────────────────────────────────────────────────────── */}
      <Box as="section" bg="white" py={20} borderY="1px solid" borderColor="gray.100">
        <Box maxW="1440px" mx="auto" px={8}>
          <VStack gap={4} mb={16} textAlign="center">
            <Text as="h2" fontSize="3xl" fontWeight="800" color="gray.900">
              How It Works
            </Text>
            <Text color="gray.600" maxW="2xl" fontSize="lg">
              The Hive uses a time-based economy where everyone's time is valued equally. No money
              changes hands—just skills, knowledge, and community spirit.
            </Text>
          </VStack>

          <Grid templateColumns="repeat(3, 1fr)" gap={12}>
            {HOW_IT_WORKS.map((step) => (
              <VStack key={step.title} gap={4} textAlign="center">
                <Box
                  w="72px"
                  h="72px"
                  borderRadius="full"
                  bg="orange.50"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  {step.icon}
                </Box>
                <Text as="h3" fontSize="xl" fontWeight="700" color="gray.900">
                  {step.title}
                </Text>
                <Text color="gray.600" lineHeight={1.7}>
                  {step.body}
                </Text>
              </VStack>
            ))}
          </Grid>
        </Box>
      </Box>

      {/* ── CTA banner ──────────────────────────────────────────────────────── */}
      <Box as="section" maxW="1440px" mx="auto" px={8} py={20}>
        <Box
          bg="linear-gradient(135deg, #f59e0b, #f97316)"
          borderRadius="3xl"
          p={16}
          textAlign="center"
          color="white"
        >
          <Text as="h2" fontSize="3xl" fontWeight="800" mb={4}>
            Ready to Join The Hive?
          </Text>
          <Text fontSize="lg" mb={8} opacity={0.9} maxW="2xl" mx="auto">
            Start sharing your time and skills with a community that values what you have to offer.
          </Text>
          <Button
            size="lg"
            onClick={() => navigate('/register')}
            style={{
              background: 'white',
              color: ORANGE,
              borderRadius: '9999px',
              padding: '0 32px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            Create Your Account <FiArrowRight />
          </Button>
        </Box>
      </Box>

      {/* ── Map Section ─────────────────────────────────────────────────────── */}
      <Box as="section" bg="white" py={20} borderY="1px solid" borderColor="gray.100">
        <Box maxW="1440px" mx="auto" px={8}>
          <VStack gap={4} mb={12} textAlign="center">
            <Text as="h2" fontSize="3xl" fontWeight="800" color="gray.900">
              Explore Services Across Istanbul
            </Text>
            <Text color="gray.600" maxW="2xl" fontSize="lg">
              Discover in-person services available in different districts. Each location shows
              approximate areas to protect privacy.
            </Text>
          </VStack>

          <MapView
            services={services}
            height="440px"
            onServiceClick={(id) => navigate(`/service-detail/${id}`)}
          />
        </Box>
      </Box>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <Box as="footer" borderTop="1px solid" borderColor="gray.200" py={8}>
        <Box maxW="1440px" mx="auto" px={8} textAlign="center">
          <Text fontSize="sm" color="gray.500">
            © {new Date().getFullYear()} The Hive. Building communities through shared time.
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

export default HomePage
