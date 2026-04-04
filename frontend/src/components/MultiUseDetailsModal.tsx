import { Box, Flex, Text, Spinner } from '@chakra-ui/react'
import { FiX } from 'react-icons/fi'
import {
  GRAY100, GRAY200, GRAY400, GRAY500, GRAY700, GRAY800, GRAY900, GREEN, GREEN_LT, WHITE,
} from '@/theme/tokens'

export interface MultiUseDetailItem {
  id: string
  title: string
  subtitle?: string
  meta?: string
  value?: string
  avatarUrl?: string | null
  onClick?: () => void
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?'
}

export default function MultiUseDetailsModal({
  isOpen,
  title,
  subtitle,
  items,
  onClose,
  loading = false,
  emptyMessage,
  /** When set, caps the scrollable list height (e.g. ~5 rows) so long lists scroll inside the modal */
  listMaxHeight,
}: {
  isOpen: boolean
  title: string
  subtitle?: string
  items: MultiUseDetailItem[]
  onClose: () => void
  loading?: boolean
  emptyMessage?: string
  listMaxHeight?: string
}) {
  if (!isOpen) return null

  return (
    <Box position="fixed" inset="0" zIndex={1400}>
      <Box position="absolute" inset="0" bg="rgba(15,23,42,0.48)" onClick={onClose} />
      <Flex position="relative" h="100%" align="center" justify="center" p={4}>
        <Box
          w="100%"
          maxW="560px"
          maxH="min(80vh, 720px)"
          overflow="hidden"
          borderRadius="20px"
          bg={WHITE}
          border={`1px solid ${GRAY200}`}
          boxShadow="0 24px 64px rgba(15,23,42,0.24)"
        >
          <Flex px={5} py={4} align="flex-start" justify="space-between" gap={4} borderBottom={`1px solid ${GRAY100}`}>
            <Box>
              <Text fontSize="18px" fontWeight={800} color={GRAY900}>{title}</Text>
              {subtitle && <Text mt={1} fontSize="13px" color={GRAY500}>{subtitle}</Text>}
            </Box>
            <Box
              as="button"
              onClick={onClose}
              w="36px"
              h="36px"
              borderRadius="10px"
              bg={GRAY100}
              color={GRAY700}
              border={`1px solid ${GRAY200}`}
              style={{ cursor: 'pointer' }}
            >
              <Flex align="center" justify="center" h="100%">
                <FiX size={16} />
              </Flex>
            </Box>
          </Flex>

          <Box
            px={5}
            py={3}
            overflowY="auto"
            maxH={listMaxHeight ?? 'calc(min(80vh, 720px) - 88px)'}
            minH={0}
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {loading ? (
              <Flex justify="center" py={12}>
                <Spinner color={GREEN} size="lg" />
              </Flex>
            ) : items.length === 0 ? (
              <Text fontSize="13px" color={GRAY500} py={8} textAlign="center">
                {emptyMessage ?? 'Nothing to show.'}
              </Text>
            ) : (
              items.map((item, index) => (
                <Flex
                  key={item.id}
                  align="center"
                  gap={3}
                  py={3}
                  borderTop={index === 0 ? 'none' : `1px solid ${GRAY100}`}
                  onClick={item.onClick}
                  style={{ cursor: item.onClick ? 'pointer' : 'default' }}
                >
                  {item.avatarUrl ? (
                    <Box
                      w="38px"
                      h="38px"
                      borderRadius="full"
                      flexShrink={0}
                      style={{ backgroundImage: `url(${item.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                    />
                  ) : (
                    <Flex
                      w="38px"
                      h="38px"
                      borderRadius="full"
                      flexShrink={0}
                      align="center"
                      justify="center"
                      bg={GREEN_LT}
                      color={GREEN}
                      fontSize="12px"
                      fontWeight={800}
                    >
                      {initials(item.title)}
                    </Flex>
                  )}

                  <Box flex={1} minW={0}>
                    <Text fontSize="13px" fontWeight={700} color={GRAY800} whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">
                      {item.title}
                    </Text>
                    {item.subtitle && (
                      <Text fontSize="12px" color={GRAY500} mt="2px">
                        {item.subtitle}
                      </Text>
                    )}
                    {item.meta && (
                      <Text fontSize="11px" color={GRAY400} mt="2px">
                        {item.meta}
                      </Text>
                    )}
                  </Box>

                  {item.value && (
                    <Text fontSize="12px" fontWeight={800} color={GRAY700} flexShrink={0}>
                      {item.value}
                    </Text>
                  )}
                </Flex>
              ))
            )}
          </Box>
        </Box>
      </Flex>
    </Box>
  )
}
