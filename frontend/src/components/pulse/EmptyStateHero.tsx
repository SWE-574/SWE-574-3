import { Box, Button, Stack, Text } from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'

interface Props {
  reason: 'no_skills' | 'no_recommendations'
}

const COPY: Record<Props['reason'], { title: string; body: string; ctaLabel: string; ctaTarget: string }> = {
  no_skills: {
    title: 'Add your skills to unlock For You picks',
    body: "We rank services based on your interests, follows, and the people who've collaborated near you. Pick three skills to start.",
    ctaLabel: 'Add skills',
    ctaTarget: '/onboarding',
  },
  no_recommendations: {
    title: 'No personalised picks yet',
    body: "Your For You feed is quiet right now. Browse the Worth a look lane below — that's where the engine surfaces fresh providers and rediscovered gems.",
    ctaLabel: 'Edit interests',
    ctaTarget: '/onboarding',
  },
}

export default function EmptyStateHero({ reason }: Props) {
  const navigate = useNavigate()
  const { title, body, ctaLabel, ctaTarget } = COPY[reason]
  return (
    <Box
      borderRadius="18px"
      p="22px 24px"
      background="linear-gradient(135deg, rgba(45, 92, 78, 0.08) 0%, rgba(248, 200, 74, 0.10) 100%)"
      borderWidth="1px"
      borderColor="green.100"
      data-testid="empty-state-hero"
    >
      <Stack gap={3} maxW="640px">
        <Text
          fontSize="11px"
          fontWeight={700}
          color="green.700"
          textTransform="uppercase"
          letterSpacing="0.05em"
        >
          ★ Pulse
        </Text>
        <Text fontSize="22px" fontWeight={700} color="gray.900">
          {title}
        </Text>
        <Text fontSize="14px" color="gray.700">
          {body}
        </Text>
        <Box>
          <Button
            colorPalette="green"
            onClick={() => navigate(ctaTarget)}
            aria-label={ctaLabel}
          >
            {ctaLabel}
          </Button>
        </Box>
      </Stack>
    </Box>
  )
}
