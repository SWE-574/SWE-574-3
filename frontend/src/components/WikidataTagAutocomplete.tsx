import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Flex, Input, Spinner, Text } from '@chakra-ui/react'
import { tagAPI } from '@/services/tagAPI'
import type { Tag } from '@/types'

interface WikidataTagAutocompleteProps {
  selectedTags: Tag[]
  onAddTag: (tag: Tag) => void
  disabled?: boolean
  accent: 'orange' | 'blue'
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
    if (abortRef.current) abortRef.current.abort()

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

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  const addSuggestion = (tag: Tag) => {
    onAddTag(tag)
    setQuery('')
    setSuggestions([])
    setOpen(false)
    setHighlightedIndex(-1)
  }

  const createCustomTag = () => {
    const name = query.trim()
    if (!name) return

    const exists = selectedTags.some((tag) => tag.name.toLowerCase() === name.toLowerCase())
    if (exists) {
      setQuery('')
      setSuggestions([])
      setOpen(false)
      setHighlightedIndex(-1)
      return
    }

    onAddTag({ id: `custom:${name.toLowerCase()}`, name })
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
      } else {
        createCustomTag()
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
        placeholder="Search Wikidata tags or add custom tags…"
        disabled={disabled}
      />

      {open && (query.trim() || suggestions.length > 0) && (
        <Box
          position="absolute"
          zIndex={10}
          top="100%"
          left={0}
          right={0}
          bg="white"
          border="1px solid"
          borderColor="gray.200"
          borderRadius="md"
          boxShadow="md"
          maxH="220px"
          overflowY="auto"
          mt={1}
        >
          {loading && (
            <Flex justify="center" p={3}>
              <Spinner size="sm" />
            </Flex>
          )}

          {!loading && suggestions.map((tag, index) => (
            <Box
              key={tag.id}
              px={3}
              py={2}
              cursor="pointer"
              bg={index === highlightedIndex ? `${accent}.50` : 'transparent'}
              _hover={{ bg: `${accent}.50` }}
              onMouseDown={() => addSuggestion(tag)}
            >
              {tag.name}
            </Box>
          ))}

          {!loading && query.trim() && (
            <Box
              px={3}
              py={2}
              cursor="pointer"
              color={`${accent}.600`}
              fontWeight="medium"
              _hover={{ bg: `${accent}.50` }}
              onMouseDown={createCustomTag}
            >
              + Create “{query.trim()}”
            </Box>
          )}

          {!loading && !query.trim() && suggestions.length === 0 && (
            <Box px={3} py={2}>
              <Text color="gray.500" fontSize="sm">Type to search Wikidata tags</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}
