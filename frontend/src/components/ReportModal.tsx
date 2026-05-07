import { useState } from 'react'
import { Box, Flex, Stack, Text, Textarea } from '@chakra-ui/react'
import { FiSend } from 'react-icons/fi'

import {
  RED,
  RED_LT,
  GRAY100,
  GRAY200,
  GRAY500,
  GRAY700,
  GRAY800,
  WHITE,
} from '@/theme/tokens'

export type ReportOption = {
  value: string
  label: string
  desc: string
}

export default function ReportModal({
  onClose,
  onSubmit,
  loading,
  options,
  title,
  subtitle,
  submitLabel = 'Submit Report',
  statementTriggerValue = 'other',
  zIndex = 2500,
}: {
  onClose: () => void
  onSubmit: (type: string, statement: string) => void
  loading: boolean
  options: ReportOption[]
  title: string
  subtitle: string
  submitLabel?: string
  statementTriggerValue?: string
  zIndex?: number
}) {
  const [selected, setSelected] = useState<string>(options[0]?.value ?? '')
  const [statement, setStatement] = useState('')

  const selectedValue = options.some((opt) => opt.value === selected)
    ? selected
    : (options[0]?.value ?? '')

  return (
    <Box
      position="fixed" inset={0} zIndex={zIndex}
      bg="rgba(0,0,0,0.55)"
      display="flex" alignItems="flex-start" justifyContent="center"
      overflowY="auto" p={4} onClick={onClose}
    >
      <Box
        bg={WHITE} borderRadius="20px" w="100%" maxW="440px" p={6} my="auto"
        boxShadow="0 20px 60px rgba(0,0,0,0.2)"
        onClick={(e) => e.stopPropagation()}
      >
        <Text fontWeight={800} fontSize="18px" color={GRAY800} mb="4px">{title}</Text>
        <Text fontSize="13px" color={GRAY500} mb={5}>{subtitle}</Text>
        <Stack gap={2} mb={5}>
          {options.map((opt) => {
            const isSelected = selectedValue === opt.value
            const isExpandable = opt.value === statementTriggerValue
            const expanded = isSelected && isExpandable
            return (
              <Box
                key={opt.value}
                as="label"
                display="flex" alignItems="flex-start" gap={3} p={3}
                borderRadius="10px" border="1px solid"
                borderColor={isSelected ? '#FCA5A5' : GRAY200}
                bg={isSelected ? RED_LT : WHITE}
                cursor="pointer"
                style={{ transition: 'border-color 0.15s, background 0.15s' }}
              >
                <input type="radio" name="reportType" value={opt.value}
                  checked={isSelected}
                  onChange={() => { setSelected(opt.value); setStatement('') }}
                  style={{ marginTop: '3px', accentColor: RED, flexShrink: 0 }} />
                <Box flex={1}>
                  <Text fontSize="14px" fontWeight={600} color={GRAY800}>{opt.label}</Text>
                  {!expanded && <Text fontSize="12px" color={GRAY500}>{opt.desc}</Text>}
                  {expanded && (
                    <Textarea
                      value={statement}
                      onChange={(e) => setStatement(e.target.value)}
                      placeholder="Something else not listed above."
                      rows={3}
                      fontSize="13px"
                      resize="none"
                      border={`1px solid #FCA5A5`}
                      borderRadius="8px"
                      mt={3}
                      bg={WHITE}
                      _focus={{ borderColor: RED, outline: 'none' }}
                      onClick={(e) => e.preventDefault()}
                    />
                  )}
                </Box>
              </Box>
            )
          })}
        </Stack>

        <Flex gap={2}>
          <Box as="button" flex={1} py="10px" borderRadius="10px"
            bg={GRAY100} color={GRAY700} fontSize="14px" fontWeight={600}
            onClick={onClose}
            style={{ border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.65 : 1 }}
          >
            Cancel
          </Box>
          <Box as="button" flex={1} py="10px" borderRadius="10px"
            bg={RED} color={WHITE} fontSize="14px" fontWeight={700}
            display="flex" alignItems="center" justifyContent="center" gap="6px"
            onClick={() => !loading && selectedValue && onSubmit(selectedValue, statement.trim())}
            style={{ opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer', border: 'none' }}
          >
            <FiSend size={14} /> {loading ? 'Submitting…' : submitLabel}
          </Box>
        </Flex>
      </Box>
    </Box>
  )
}
