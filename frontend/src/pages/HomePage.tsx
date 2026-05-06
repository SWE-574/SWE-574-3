import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Box, Button, Flex, Grid, HStack, Text, VStack } from '@chakra-ui/react'
import { FiArrowRight, FiClock, FiMapPin, FiRepeat, FiUsers } from 'react-icons/fi'

import { Logo } from '@/components/Logo'
import { serviceAPI, type PublicFeaturedResponse, type PublicFeaturedService } from '@/services/serviceAPI'
import { useAuthStore } from '@/store/useAuthStore'
import {
  AMBER, AMBER_LT, BLUE, BLUE_LT, GREEN, GREEN_LT, GRAY50, GRAY100, GRAY200,
  GRAY400, GRAY500, GRAY600, GRAY700, GRAY800, GRAY900, WHITE,
} from '@/theme/tokens'

// FR-457 — public landing page. Targets anonymous visitors only; authenticated
// users are redirected to /dashboard at the top of the component.

const HOW_IT_WORKS: { icon: React.ReactNode; title: string; body: string }[] = [
  {
    icon: <FiUsers size={20} />,
    title: '1. Join your neighbourhood',
    body: 'Sign up with an email. You start with 3 hours so you can join something on day one — no money, no strings.',
  },
  {
    icon: <FiRepeat size={20} />,
    title: '2. Share what you love',
    body: 'Host a conversation, teach a hobby, lead a walk, swap a recipe — anything you enjoy doing with others.',
  },
  {
    icon: <FiClock size={20} />,
    title: '3. Find your next thing',
    body: 'Browse what neighbours are sharing and join in. One hour given is one hour received — every hour counts the same.',
  },
]

function useDocumentMeta() {
  // The base index.html only carries a generic title; per-page metadata is set
  // here so search engines and link unfurlers see something specific to the
  // landing page (issue #457 acceptance criterion).
  useEffect(() => {
    const previousTitle = document.title
    document.title = 'The Hive — Share time and skills with your neighbours'

    function setMeta(selector: string, attr: 'name' | 'property', value: string, content: string) {
      let tag = document.head.querySelector<HTMLMetaElement>(selector)
      if (!tag) {
        tag = document.createElement('meta')
        tag.setAttribute(attr, value)
        document.head.appendChild(tag)
      }
      tag.setAttribute('content', content)
    }

    const description =
      'The Hive is a neighbourhood community for sharing skills, hobbies, and time. Teach, learn, walk, cook, talk — every hour given is an hour received, and every member starts with three.'

    setMeta('meta[name="description"]', 'name', 'description', description)
    setMeta('meta[property="og:title"]', 'property', 'og:title', 'The Hive — A neighbourhood for sharing time')
    setMeta('meta[property="og:description"]', 'property', 'og:description', description)
    setMeta('meta[property="og:type"]', 'property', 'og:type', 'website')

    return () => {
      document.title = previousTitle
    }
  }, [])
}

function FeaturedCard({ service, onClick }: { service: PublicFeaturedService; onClick: () => void }) {
  const tone =
    service.type === 'Need' ? { fg: BLUE, bg: BLUE_LT } :
    service.type === 'Event' ? { fg: AMBER, bg: AMBER_LT } :
    { fg: GREEN, bg: GREEN_LT }

  return (
    <Box
      as="button"
      onClick={onClick}
      textAlign="left"
      p={5}
      borderRadius="14px"
      style={{
        background: WHITE,
        border: `1px solid ${GRAY200}`,
        cursor: 'pointer',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.transform = 'translateY(-2px)'
        el.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.transform = 'translateY(0)'
        el.style.boxShadow = 'none'
      }}
    >
      <Flex align="center" gap={2} mb={3}>
        <Box
          px="9px" py="3px" borderRadius="full"
          fontSize="10px" fontWeight={700}
          textTransform="uppercase" letterSpacing="0.04em"
          style={{ background: tone.bg, color: tone.fg }}
        >
          {service.type}
        </Box>
        {service.location_area && (
          <Flex align="center" gap={1} fontSize="11px" color={GRAY500}>
            <FiMapPin size={11} />
            <Text>{service.location_area}</Text>
          </Flex>
        )}
      </Flex>
      <Text fontSize="15px" fontWeight={700} color={GRAY900} mb={1} lineHeight={1.3}>
        {service.title}
      </Text>
      <Text fontSize="12px" color={GRAY500}>
        Offered by {service.user.first_name} {service.user.last_name?.[0] ?? ''}.
      </Text>
    </Box>
  )
}

const HomePage = () => {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()
  const [featured, setFeatured] = useState<PublicFeaturedResponse | null>(null)

  useDocumentMeta()

  useEffect(() => {
    if (isAuthenticated) return
    const ac = new AbortController()
    serviceAPI
      .getPublicFeatured(ac.signal)
      .then(setFeatured)
      .catch(() => {
        // Fall back to empty state — the page must work even if the
        // featured endpoint is empty or unreachable (#457 AC).
        setFeatured({ trending: [], top_providers: [] })
      })
    return () => ac.abort()
  }, [isAuthenticated])

  // Authenticated users have no use for the marketing page — bounce to the app.
  // Done after the meta hook so SSR-style flashes don't leak the wrong title.
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const trending = featured?.trending ?? []

  return (
    <Box minH="100vh" bg={GRAY50}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <Box
        as="header"
        borderBottom={`1px solid ${GRAY200}`}
        bg="rgba(255,255,255,0.92)"
        css={{ backdropFilter: 'blur(10px)' }}
        position="sticky"
        top={0}
        zIndex={50}
      >
        <Flex maxW="1200px" mx="auto" px={{ base: 4, md: 8 }} py={4} align="center" justify="space-between">
          <Flex align="center" gap={3}>
            <Logo size={32} />
            <Text fontWeight={800} fontSize="18px" color={GRAY900} letterSpacing="-0.3px">
              The Hive
            </Text>
          </Flex>
          <HStack gap={3}>
            <Button
              variant="ghost" size="sm"
              onClick={() => navigate('/login')}
              color={GRAY800} _hover={{ bg: GRAY100 }}
              fontWeight={500}
            >
              Log in
            </Button>
            <Button
              size="sm"
              onClick={() => navigate('/register')}
              bg={GREEN} color={WHITE} borderRadius="8px" px={5}
              _hover={{ bg: '#254C40', transform: 'translateY(-1px)' }}
              transition="all 0.15s"
              fontWeight={600}
            >
              Sign up free
            </Button>
          </HStack>
        </Flex>
      </Box>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <Box as="section" maxW="1200px" mx="auto" px={{ base: 4, md: 8 }} py={{ base: 12, md: 20 }}>
        <Grid templateColumns={{ base: '1fr', lg: '1.1fr 1fr' }} gap={{ base: 10, lg: 16 }} alignItems="center">
          <VStack align="flex-start" gap={5}>
            <Flex
              align="center" gap={2}
              px={3} py={1.5}
              bg={GREEN_LT} color={GREEN}
              borderRadius="full"
              border={`1px solid ${GREEN}33`}
            >
              <FiClock size={13} />
              <Text fontSize="12px" fontWeight={700} letterSpacing="0.02em">
                3 hours waiting when you join
              </Text>
            </Flex>

            <Text
              as="h1"
              fontSize={{ base: '34px', md: '46px', lg: '54px' }}
              fontWeight={800}
              color={GRAY900}
              lineHeight={1.1}
              letterSpacing="-0.02em"
            >
              Share what you love
              <br />
              <Text as="span" color={GREEN}>with the people next door.</Text>
            </Text>

            <Text color={GRAY700} maxW="540px" fontSize="17px" lineHeight={1.55}>
              The Hive is a neighbourhood community for sharing skills, hobbies, and
              time — language practice, cooking, walks, repairs, conversation. No money
              changes hands. An hour given is an hour received, and you start with three
              of them.
            </Text>

            <HStack gap={3} pt={2} flexWrap="wrap">
              <Button
                size="lg"
                onClick={() => navigate('/register')}
                bg={GREEN} color={WHITE} borderRadius="10px" px={7}
                display="inline-flex" alignItems="center" gap={2}
                _hover={{ bg: '#254C40', transform: 'translateY(-2px)', boxShadow: '0 6px 18px rgba(45,92,78,0.22)' }}
                transition="all 0.18s"
                fontWeight={700}
              >
                Get my 3 hours <FiArrowRight />
              </Button>
              <Button
                size="lg" variant="outline"
                onClick={() => {
                  document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })
                }}
                borderRadius="10px" px={7}
                borderColor={GRAY200} color={GRAY800} bg={WHITE}
                _hover={{ bg: GRAY50, transform: 'translateY(-2px)' }}
                transition="all 0.18s"
                fontWeight={600}
              >
                How it works
              </Button>
              <Button
                size="lg" variant="ghost"
                onClick={() => navigate('/dashboard')}
                borderRadius="10px" px={5}
                color={GRAY700} _hover={{ bg: GRAY100 }}
                fontWeight={600}
              >
                Browse without signing up
              </Button>
            </HStack>
          </VStack>

          <Box
            position="relative"
            borderRadius="22px"
            overflow="hidden"
            boxShadow="0 18px 40px rgba(15, 30, 40, 0.10)"
            bg={WHITE}
            border={`1px solid ${GRAY200}`}
          >
            {/* Lightweight illustrative card stack — replaces the previous
                100-line inline SVG. A real product screenshot is the right
                long-term move; this is a clean placeholder until then. */}
            <Box bg={`linear-gradient(135deg, ${GREEN_LT} 0%, ${WHITE} 65%)`} p={{ base: 6, md: 8 }} minH={{ base: '320px', md: '380px' }}>
              <VStack align="stretch" gap={4}>
                <Box bg={WHITE} borderRadius="14px" p={4} boxShadow="0 4px 14px rgba(0,0,0,0.06)" border={`1px solid ${GRAY100}`}>
                  <Flex align="center" gap={2} mb={2}>
                    <Box w="32px" h="32px" borderRadius="full" bg={GREEN} />
                    <Box>
                      <Text fontSize="13px" fontWeight={700} color={GRAY900}>Elif K.</Text>
                      <Text fontSize="11px" color={GRAY500}>offers · Beşiktaş</Text>
                    </Box>
                  </Flex>
                  <Text fontSize="14px" fontWeight={600} color={GRAY900}>
                    Italian conversation over coffee
                  </Text>
                  <Flex justify="space-between" mt={2}>
                    <Text fontSize="11px" color={GRAY500}>1h chat</Text>
                    <Text fontSize="11px" color={GREEN} fontWeight={700}>1h ⟶</Text>
                  </Flex>
                </Box>

                <Box bg={WHITE} borderRadius="14px" p={4} boxShadow="0 4px 14px rgba(0,0,0,0.06)" border={`1px solid ${GRAY100}`} ml={6}>
                  <Flex align="center" gap={2} mb={2}>
                    <Box w="32px" h="32px" borderRadius="full" bg={BLUE} />
                    <Box>
                      <Text fontSize="13px" fontWeight={700} color={GRAY900}>Mehmet Y.</Text>
                      <Text fontSize="11px" color={GRAY500}>needs · Kadıköy</Text>
                    </Box>
                  </Flex>
                  <Text fontSize="14px" fontWeight={600} color={GRAY900}>
                    Looking for someone to teach me sourdough
                  </Text>
                  <Flex justify="space-between" mt={2}>
                    <Text fontSize="11px" color={GRAY500}>2h workshop</Text>
                    <Text fontSize="11px" color={BLUE} fontWeight={700}>⟵ 2h</Text>
                  </Flex>
                </Box>

                <Box bg={WHITE} borderRadius="14px" p={4} boxShadow="0 4px 14px rgba(0,0,0,0.06)" border={`1px solid ${GRAY100}`} ml={2}>
                  <Flex align="center" gap={2} mb={2}>
                    <Box w="32px" h="32px" borderRadius="full" bg={AMBER} />
                    <Box>
                      <Text fontSize="13px" fontWeight={700} color={GRAY900}>Selim G.</Text>
                      <Text fontSize="11px" color={GRAY500}>event · Üsküdar</Text>
                    </Box>
                  </Flex>
                  <Text fontSize="14px" fontWeight={600} color={GRAY900}>
                    Group walk and bird-watching, Sat 9am
                  </Text>
                  <Flex justify="space-between" mt={2}>
                    <Text fontSize="11px" color={GRAY500}>12 spots</Text>
                    <Text fontSize="11px" color={AMBER} fontWeight={700}>Free RSVP</Text>
                  </Flex>
                </Box>
              </VStack>
            </Box>
          </Box>
        </Grid>
      </Box>

      {/* ── What is a TimeBank ─────────────────────────────────────────────── */}
      <Box as="section" id="how-it-works" bg={WHITE} borderTop={`1px solid ${GRAY200}`} borderBottom={`1px solid ${GRAY200}`}>
        <Box maxW="1100px" mx="auto" px={{ base: 4, md: 8 }} py={{ base: 12, md: 16 }}>
          <Text
            as="h2"
            fontSize={{ base: '26px', md: '32px' }}
            fontWeight={700}
            color={GRAY900}
            mb={2}
            letterSpacing="-0.01em"
          >
            How The Hive works
          </Text>
          <Text fontSize="15px" color={GRAY600} maxW="640px" mb={8}>
            People share what they love with their neighbours and use time as the only thank-you.
            An hour of teaching guitar is worth the same as an hour of garden help — no skill counts more than another.
          </Text>

          <Grid templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }} gap={5}>
            {HOW_IT_WORKS.map((step) => (
              <Box
                key={step.title}
                p={5}
                borderRadius="14px"
                style={{ background: GRAY50, border: `1px solid ${GRAY100}` }}
              >
                <Flex
                  align="center" justify="center"
                  w="40px" h="40px" borderRadius="10px"
                  bg={WHITE} color={GREEN}
                  border={`1px solid ${GRAY200}`}
                  mb={4}
                >
                  {step.icon}
                </Flex>
                <Text fontSize="15px" fontWeight={700} color={GRAY900} mb={2}>
                  {step.title}
                </Text>
                <Text fontSize="13px" color={GRAY600} lineHeight={1.55}>
                  {step.body}
                </Text>
              </Box>
            ))}
          </Grid>
        </Box>
      </Box>

      {/* ── Featured services (live data) ─────────────────────────────────── */}
      {trending.length > 0 && (
        <Box as="section" maxW="1200px" mx="auto" px={{ base: 4, md: 8 }} py={{ base: 12, md: 16 }}>
          <Flex justify="space-between" align="flex-end" mb={6} flexWrap="wrap" gap={3}>
            <Box>
              <Text
                as="h2"
                fontSize={{ base: '24px', md: '28px' }}
                fontWeight={700}
                color={GRAY900}
                letterSpacing="-0.01em"
                mb={1}
              >
                What's happening on The Hive
              </Text>
              <Text fontSize="14px" color={GRAY500}>
                A live look at popular offers, needs, and events.
              </Text>
            </Box>
            <Button
              variant="ghost" size="sm"
              onClick={() => navigate('/register')}
              color={GREEN} _hover={{ bg: GREEN_LT }}
              fontWeight={600}
            >
              Join to see all <FiArrowRight />
            </Button>
          </Flex>

          <Grid templateColumns={{ base: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }} gap={4}>
            {trending.slice(0, 6).map((service) => (
              <FeaturedCard
                key={service.id}
                service={service}
                onClick={() => navigate(`/service-detail/${service.id}`)}
              />
            ))}
          </Grid>
        </Box>
      )}

      {/* ── Final CTA ─────────────────────────────────────────────────────── */}
      <Box as="section" bg={GREEN} color={WHITE}>
        <Box maxW="900px" mx="auto" px={{ base: 4, md: 8 }} py={{ base: 12, md: 16 }} textAlign="center">
          <Text fontSize={{ base: '24px', md: '32px' }} fontWeight={700} mb={3} letterSpacing="-0.01em">
            Your three hours are waiting.
          </Text>
          <Text fontSize="15px" color="rgba(255,255,255,0.85)" mb={6} maxW="600px" mx="auto">
            Sign up takes a minute. Find people to share time with, in whatever way you love.
          </Text>
          <Button
            size="lg"
            onClick={() => navigate('/register')}
            bg={WHITE} color={GREEN} borderRadius="10px" px={8}
            display="inline-flex" alignItems="center" gap={2}
            _hover={{ bg: GRAY50, transform: 'translateY(-2px)' }}
            transition="all 0.18s"
            fontWeight={700}
          >
            Create my account <FiArrowRight />
          </Button>
        </Box>
      </Box>

      <Box as="footer" bg={GRAY50} borderTop={`1px solid ${GRAY200}`}>
        <Flex
          maxW="1200px" mx="auto"
          px={{ base: 4, md: 8 }} py={6}
          align="center" justify="space-between"
          flexWrap="wrap" gap={3}
        >
          <Flex align="center" gap={2}>
            <Logo size={20} />
            <Text fontSize="12px" color={GRAY500}>
              The Hive · Share time with your neighbours
            </Text>
          </Flex>
          <Text fontSize="11px" color={GRAY400}>
            Time shared, neighbour to neighbour.
          </Text>
        </Flex>
      </Box>
    </Box>
  )
}

export default HomePage
