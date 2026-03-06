import { Box, Button, Flex, Text } from '@chakra-ui/react'

interface AdminReauthBannerProps {
  message: string
  onReLogin: () => void | Promise<void>
  onDismiss?: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  variant?: 'inline' | 'page'
}

const AdminReauthBanner = ({
  message,
  onReLogin,
  onDismiss,
  secondaryLabel,
  onSecondary,
  variant = 'inline',
}: AdminReauthBannerProps) => {
  const isPage = variant === 'page'

  return (
    <Box
      mb={isPage ? 0 : 4}
      p={isPage ? 0 : 3}
      borderRadius={isPage ? undefined : '10px'}
      bg={isPage ? undefined : '#FEF2F2'}
      border={isPage ? undefined : '1px solid #FECACA'}
      color="#991B1B"
    >
      {isPage && <Text fontSize="xl" fontWeight={700} color="red.700">Access changed</Text>}
      <Text fontSize={isPage ? 'md' : 'sm'} mt={isPage ? 1 : 0}>{message}</Text>
      <Flex mt={4} gap={2} wrap="wrap">
        <Button size={isPage ? 'md' : 'sm'} colorPalette="red" onClick={onReLogin}>Log in again</Button>
        {onDismiss && (
          <Button size={isPage ? 'md' : 'sm'} variant="outline" onClick={onDismiss}>Dismiss</Button>
        )}
        {onSecondary && secondaryLabel && (
          <Button size={isPage ? 'md' : 'sm'} variant="outline" onClick={onSecondary}>{secondaryLabel}</Button>
        )}
      </Flex>
    </Box>
  )
}

export default AdminReauthBanner
