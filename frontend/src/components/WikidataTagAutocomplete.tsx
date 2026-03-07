import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Flex, Input, Spinner, Text } from '@chakra-ui/react'
import { tagAPI } from '@/services/tagAPI'
import type { Tag } from '@/types'

import { GRAY50, GRAY200, GRAY400, WHITE } from '@/theme/tokens'

interface WikidataTagAutocompleteProps {
  selectedTags: Tag[]
  onAddTag: (tag: Tag) => void
  disabled?: boolean
  accent: string
}

export default function WikidataTagAutocomplete({
  selectedTags,
  onAddTag,
  disabled = false,
  accent,
}: WikidataTagAutocompleteProps) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Tag[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const abortRef = useRef<AbortController | null>(null)

  const searchTags = useCallback(async (searchQuery: string) => {
    abortRef.current?.abort()

    if (!searchQuery.trim()) {
      setSuggestions([])
      setHighlightedIndex(-1)
      return
    }

    abortRef.current = new AbortController()
    setLoading(true)

    try {
      const results = await tagAPI.search(searchQuery, abortRef.current.signal)
      const existingIds = new Set(selectedTags.map((tag) => tag.id))
      const filtered = results.filter((tag) => !existingIds.has(tag.id))
      setSuggestions(filtered)
      setHighlightedIndex(filtered.length > 0 ? 0 : -1)
    } catch {
      setSuggestions([])
      setHighlightedIndex(-1)
    } finally {
      setLoading(false)
    }
  }, [selectedTags])

  useEffect(() => {
    const timer = setTimeout(() => searchTags(query), 300)
    return () => clearTimeout(timer)
  }, [query, searchTags])

  useEffect(() => () => abortRef.current?.abort(), [])

  const addSuggestion = (tag: Tag) => {
    onAddTag(tag)
    setQuery('')
    setSuggestions([])
    setOpen(false)
    setHighlightedIndex(-1)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (suggestions.length === 0) return
      setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (suggestions.length === 0) return
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1))
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        addSuggestion(suggestions[highlightedIndex])
      }
      return
    }

    if (event.key === 'Escape') {
      setOpen(false)
      setHighlightedIndex(-1)
    }
  }

  return (
    <Box position="relative">
      <Input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? 'Max 10 tags reached' : 'Search Wikidata tags…'}
        disabled={disabled}
        borderRadius="10px"
        border={`1px solid ${GRAY200}`}
        fontSize="13px"
        _focus={{ borderColor: accent, boxShadow: `0 0 0 2px ${accent}18` }}
      />

      {open && (query.trim() || suggestions.length > 0) && (
        <Box
          position="absolute"
          zIndex={20}
          top="calc(100% + 6px)"
          left={0}
          right={0}
          bg={WHITE}
          border={`1px solid ${GRAY200}`}
          borderRadius="12px"
          boxShadow="0 8px 24px rgba(0,0,0,0.1)"
          maxH="220px"
          overflowY="auto"
        >
          {loading && (
            <Flex justify="center" p={3}>
              <Spinner size="sm" />
            </Flex>
          )}

          {!loading && suggestions.map((tag, index) => (
            <Box
              key={tag.id}
              px={4}
              py="10px"
              cursor="pointer"
              fontSize="13px"
              bg={index === highlightedIndex ? GRAY50 : 'transparent'}
              _hover={{ bg: GRAY50 }}
              onMouseDown={() => addSuggestion(tag)}
            >
              {tag.name}
            </Box>
          ))}

          {!loading && query.trim() && suggestions.length === 0 && (
            <Box px={4} py="10px">
              <Text color={GRAY400} fontSize="13px">No matching Wikidata tags found</Text>
            </Box>
          )}

          {!loading && !query.trim() && suggestions.length === 0 && (
            <Box px={4} py="10px">
              <Text color={GRAY400} fontSize="13px">Type to search Wikidata tags</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}
