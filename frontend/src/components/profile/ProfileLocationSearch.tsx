import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Flex, Spinner, Text } from '@chakra-ui/react'
import { FiCheckCircle, FiSearch, FiX } from 'react-icons/fi'
import { searchLocations } from '@/utils/location'
import {
  GRAY200, GRAY400, GRAY500, GRAY700, GRAY800,
  GREEN, WHITE,
} from '@/theme/tokens'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

type LocationSuggestion = Awaited<ReturnType<typeof searchLocations>>[number]

type Props = {
  value: string
  onChange: (value: string) => void
  id?: string
  label?: string
  placeholder?: string
  helperText?: string
}

function formatCityDistrict(item: LocationSuggestion): string {
  const parts = item.address
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !['Türkiye', 'Turkey'].includes(part))

  if (parts.length >= 2) {
    const district = item.district && parts.includes(item.district) ? item.district : parts[0]
    const districtIndex = parts.indexOf(district)
    const city = parts[districtIndex + 1] ?? parts[1]
    if (city && city !== district) return `${city} / ${district}`
  }

  return item.district || parts[0] || item.address
}

export default function ProfileLocationSearch({
  value,
  onChange,
  id = 'profile-location',
  label = 'City / Location',
  placeholder = 'Search address, district, or city',
  helperText,
}: Props) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<LocationSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [showDrop, setShowDrop] = useState(false)
  const [confirmedValue, setConfirmedValue] = useState(value)
  const requestIdRef = useRef(0)

  const runSearch = useCallback(async (nextQuery: string, requestId: number) => {
    if (!MAPBOX_TOKEN || nextQuery.trim().length < 2) {
      if (requestId === requestIdRef.current) setResults([])
      return
    }

    setLoading(true)
    const matches = await searchLocations(nextQuery, MAPBOX_TOKEN)
    if (requestId !== requestIdRef.current) return
    setResults(matches)
    setLoading(false)
  }, [])

  useEffect(() => {
    const nextRequestId = requestIdRef.current + 1
    requestIdRef.current = nextRequestId

    const timer = window.setTimeout(() => {
      void runSearch(query, nextRequestId)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [query, runSearch])

  const handleSelect = (item: LocationSuggestion) => {
    const next = formatCityDistrict(item)
    setConfirmedValue(next)
    setQuery(next)
    setResults([])
    setShowDrop(false)
    onChange(next)
  }

  const handleChange = (next: string) => {
    setQuery(next)
    setShowDrop(true)
    setConfirmedValue('')
    onChange(next)
  }

  const handleClear = () => {
    setConfirmedValue('')
    setQuery('')
    setResults([])
    setShowDrop(false)
    onChange('')
  }

  const confirmed = Boolean(value) && value === confirmedValue && value === query

  return (
    <Box position="relative">
      <label
        htmlFor={id}
        style={{ fontSize: '13px', fontWeight: 600, color: GRAY700, display: 'block', marginBottom: '6px' }}
      >
        {label}
      </label>
      <Flex
        align="center"
        gap={2}
        bg={WHITE}
        border={`1px solid ${confirmed ? GREEN : GRAY200}`}
        borderRadius="10px"
        px={3}
        _focusWithin={{ borderColor: GREEN, boxShadow: `0 0 0 2px ${GREEN}18` }}
      >
        {loading ? (
          <Spinner size="xs" color="gray.400" flexShrink={0} />
        ) : confirmed ? (
          <FiCheckCircle size={13} color={GREEN} style={{ flexShrink: 0 }} />
        ) : (
          <FiSearch size={13} color={GRAY400} style={{ flexShrink: 0 }} />
        )}
        <input
          id={id}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setShowDrop(true) }}
          onBlur={() => window.setTimeout(() => setShowDrop(false), 140)}
          placeholder={MAPBOX_TOKEN ? placeholder : 'Mapbox token is not set'}
          disabled={!MAPBOX_TOKEN}
          aria-label={label}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: '14px',
            color: GRAY800,
            padding: '10px 0',
          }}
        />
        {query && (
          <Box
            as="button"
            onMouseDown={(e) => { e.preventDefault(); handleClear() }}
            aria-label="Clear location"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: GRAY400, padding: 2, display: 'flex' }}
          >
            <FiX size={13} />
          </Box>
        )}
      </Flex>
      {helperText && (
        <Text fontSize="11px" color={GRAY500} mt="5px">{helperText}</Text>
      )}
      {showDrop && (results.length > 0 || loading) && (
        <Box
          position="absolute"
          zIndex={50}
          top="calc(100% + 6px)"
          left={0}
          right={0}
          bg={WHITE}
          border={`1px solid ${GRAY200}`}
          borderRadius="12px"
          boxShadow="0 12px 28px rgba(0,0,0,0.14)"
          maxH="240px"
          overflowY="auto"
        >
          {loading && <Flex justify="center" p={3}><Spinner size="sm" /></Flex>}
          {!loading && results.map((item) => (
            <Box
              key={item.id}
              px={4}
              py="10px"
              cursor="pointer"
              onMouseDown={() => handleSelect(item)}
              _hover={{ bg: 'gray.50' }}
            >
              <Text fontSize="13px" fontWeight={700} color={GRAY800}>
                {item.district || item.address}
              </Text>
              <Text fontSize="11px" color={GRAY500} mt="2px">
                {item.address}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
