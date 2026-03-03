import { useState, useEffect, useRef, useCallback } from 'react'
import { useForm, Controller, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import {
  Box, Flex, Grid, Input, Spinner, Stack, Text, Textarea,
} from '@chakra-ui/react'
import { FiX, FiPlus, FiImage, FiClock, FiMapPin, FiCalendar, FiTag } from 'react-icons/fi'
import { toast } from 'sonner'
import { serviceAPI } from '@/services/serviceAPI'
import { tagAPI } from '@/services/tagAPI'
import type { Tag } from '@/types'

import {
  GREEN, GREEN_LT,
  BLUE, BLUE_LT,
  RED,
  GRAY50, GRAY100, GRAY200, GRAY300, GRAY400, GRAY500, GRAY700, GRAY800,
  WHITE,
} from '@/theme/tokens'

// ─── Zod schema ───────────────────────────────────────────────────────────────

const schema = z
  .object({
    title:            z.string().min(3, 'Title must be at least 3 characters').max(200),
    description:      z.string().min(10, 'Description must be at least 10 characters').max(5000),
    duration:         z.coerce.number().positive('Duration must be greater than 0').max(999),
    location_type:    z.enum(['In-Person', 'Online']),
    location_area:    z.string().optional(),
    max_participants: z.coerce.number().int().positive('Must be at least 1').max(100),
    schedule_type:    z.enum(['One-Time', 'Recurrent']),
    schedule_details: z.string().max(500).optional(),
  })
  .refine(
    (d) => d.location_type !== 'In-Person' || (d.location_area && d.location_area.trim().length > 0),
    { message: 'Location area is required for in-person services', path: ['location_area'] },
  )

type FormValues = z.infer<typeof schema>

// ─── Section label ────────────────────────────────────────────────────────────

function Section({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Flex align="center" gap={2} mb={4}>
        <Box color={GRAY400}>{icon}</Box>
        <Text fontSize="12px" fontWeight={700} color={GRAY500}
          style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}
        >
          {label}
        </Text>
      </Flex>
      {children}
    </Box>
  )
}

// ─── Form label ───────────────────────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <Text fontSize="13px" fontWeight={600} color={GRAY700} mb="6px">
      {children}
      {required && <Text as="span" color={RED} ml="3px">*</Text>}
    </Text>
  )
}

// ─── Error text ───────────────────────────────────────────────────────────────

function ErrTxt({ msg }: { msg?: string }) {
  if (!msg) return null
  return <Text fontSize="11px" color={RED} mt="4px">{msg}</Text>
}

// ─── Styled input wrapper ─────────────────────────────────────────────────────

const inputStyle = {
  borderRadius: '10px',
  border: `1px solid ${GRAY200}`,
  fontSize: '14px',
  color: GRAY800,
  background: WHITE,
  transition: 'border-color 0.15s, box-shadow 0.15s',
}

// ─── Segmented control ────────────────────────────────────────────────────────

function SegmentedControl<T extends string>({
  value, onChange, options, accent,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  accent: string
}) {
  return (
    <Flex bg={GRAY100} p="3px" borderRadius="10px" gap="2px">
      {options.map((opt) => (
        <Box
          key={opt.value}
          as="button"
          type="button"
          flex={1} py="8px"
          borderRadius="8px"
          fontSize="13px"
          fontWeight={value === opt.value ? 700 : 500}
          bg={value === opt.value ? WHITE : 'transparent'}
          color={value === opt.value ? GRAY800 : GRAY500}
          boxShadow={value === opt.value ? '0 1px 4px rgba(0,0,0,0.08)' : 'none'}
          cursor="pointer"
          transition="all 0.12s"
          onClick={() => onChange(opt.value)}
          style={{
            border: 'none',
            outline: value === opt.value ? `2px solid ${accent}20` : 'none',
          }}
        >
          {opt.label}
        </Box>
      ))}
    </Flex>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ServiceForm({ type }: { type: 'Offer' | 'Need' }) {
  const navigate = useNavigate()
  const accent   = type === 'Offer' ? GREEN : BLUE
  const accentLt = type === 'Offer' ? GREEN_LT : BLUE_LT

  // Tags
  const [selectedTags, setSelectedTags]     = useState<Tag[]>([])
  const [tagQuery, setTagQuery]             = useState('')
  const [tagSuggestions, setTagSuggestions] = useState<Tag[]>([])
  const [tagLoading, setTagLoading]         = useState(false)
  const [showTagDrop, setShowTagDrop]       = useState(false)
  const tagAbortRef = useRef<AbortController | null>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)

  // Media
  const [mediaFiles, setMediaFiles]         = useState<File[]>([])
  const [mediaPreviews, setMediaPreviews]   = useState<string[]>([])
  const [submitting, setSubmitting]         = useState(false)

  const { register, handleSubmit, control, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: { location_type: 'Online', schedule_type: 'One-Time', max_participants: 1 },
  })

  const locType   = watch('location_type')
  const schedType = watch('schedule_type')

  // ── Tag autocomplete ────────────────────────────────────────────────────────

  const searchTags = useCallback(async (q: string) => {
    if (tagAbortRef.current) tagAbortRef.current.abort()
    if (!q.trim()) { setTagSuggestions([]); return }
    tagAbortRef.current = new AbortController()
    setTagLoading(true)
    try {
      const res = await tagAPI.search(q, tagAbortRef.current.signal)
      const sel = new Set(selectedTags.map((t) => t.id))
      setTagSuggestions(res.filter((t) => !sel.has(t.id)))
    } catch { /* aborted */ }
    finally { setTagLoading(false) }
  }, [selectedTags])

  useEffect(() => {
    const t = setTimeout(() => searchTags(tagQuery), 300)
    return () => clearTimeout(t)
  }, [tagQuery, searchTags])

  const addTag = (tag: Tag) => {
    setSelectedTags((p) => [...p, tag])
    setTagQuery(''); setTagSuggestions([]); setShowTagDrop(false)
    tagInputRef.current?.focus()
  }

  const createTag = async () => {
    const name = tagQuery.trim()
    if (!name) return
    try { addTag(await tagAPI.create(name)) }
    catch { toast.error('Failed to create tag') }
  }

  // ── Media ────────────────────────────────────────────────────────────────

  const handleMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 5 - mediaFiles.length)
    if (!files.length) return
    setMediaFiles((p) => [...p, ...files])
    files.forEach((f) => {
      const r = new FileReader()
      r.onload = (ev) => setMediaPreviews((p) => [...p, ev.target?.result as string])
      r.readAsDataURL(f)
    })
    e.target.value = ''
  }

  const removeMedia = (i: number) => {
    setMediaFiles((p) => p.filter((_, j) => j !== i))
    setMediaPreviews((p) => p.filter((_, j) => j !== i))
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('title', values.title)
      fd.append('description', values.description)
      fd.append('type', type)
      fd.append('duration', String(values.duration))
      fd.append('location_type', values.location_type)
      if (values.location_area) fd.append('location_area', values.location_area)
      fd.append('max_participants', String(values.max_participants))
      fd.append('schedule_type', values.schedule_type)
      if (values.schedule_details) fd.append('schedule_details', values.schedule_details)
      selectedTags.forEach((t) => fd.append('tags', t.id))
      mediaFiles.forEach((f) => fd.append('media', f))
      const created = await serviceAPI.create(fd)
      toast.success(`${type} posted successfully!`)
      navigate(`/service-detail/${created.id}`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Failed to post. Please try again.'
      toast.error(msg)
    } finally { setSubmitting(false) }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack gap={7}>

        {/* ── Basic Info ─────────────────────────────────────────────────── */}
        <Section icon={<FiTag size={14} />} label="Basic Info">
          <Stack gap={4}>
            <Box>
              <Label required>Title</Label>
              <Input
                placeholder={type === 'Offer' ? 'e.g. Guitar lessons for beginners' : 'e.g. Need help moving furniture'}
                {...register('title')}
                style={inputStyle}
                _focus={{ borderColor: accent, boxShadow: `0 0 0 2px ${accent}18` }}
              />
              <ErrTxt msg={errors.title?.message} />
            </Box>

            <Box>
              <Label required>Description</Label>
              <Textarea
                placeholder="Describe what you're offering or what you need in detail…"
                rows={4}
                {...register('description')}
                style={{ ...inputStyle, resize: 'vertical' }}
                _focus={{ borderColor: accent, boxShadow: `0 0 0 2px ${accent}18` }}
              />
              <ErrTxt msg={errors.description?.message} />
            </Box>
          </Stack>
        </Section>

        <Box h="1px" bg={GRAY100} />

        {/* ── Time & Place ───────────────────────────────────────────────── */}
        <Section icon={<FiClock size={14} />} label="Time & Place">
          <Stack gap={4}>
            <Grid templateColumns={{ base: '1fr', sm: '1fr 1fr' }} gap={4}>
              <Box>
                <Label required>Duration (hours)</Label>
                <Input
                  type="number" min={0.5} step={0.5} placeholder="e.g. 1.5"
                  {...register('duration')}
                  style={inputStyle}
                  _focus={{ borderColor: accent, boxShadow: `0 0 0 2px ${accent}18` }}
                />
                <ErrTxt msg={errors.duration?.message} />
              </Box>
              <Box>
                <Label required>{type === 'Offer' ? 'Max participants' : 'Helpers needed'}</Label>
                <Input
                  type="number" min={1} max={100} placeholder="1"
                  {...register('max_participants')}
                  style={inputStyle}
                  _focus={{ borderColor: accent, boxShadow: `0 0 0 2px ${accent}18` }}
                />
                <ErrTxt msg={errors.max_participants?.message} />
              </Box>
            </Grid>

            <Box>
              <Label required>Location</Label>
              <Controller
                name="location_type"
                control={control}
                render={({ field }) => (
                  <SegmentedControl
                    value={field.value}
                    onChange={field.onChange}
                    options={[{ value: 'Online', label: 'Online' }, { value: 'In-Person', label: 'In-Person' }]}
                    accent={accent}
                  />
                )}
              />
            </Box>

            {locType === 'In-Person' && (
              <Box>
                <Label required>
                  <FiMapPin size={12} style={{ display: 'inline', marginRight: 5 }} />
                  Location area
                </Label>
                <Input
                  placeholder="e.g. Kadıköy, Istanbul"
                  {...register('location_area')}
                  style={inputStyle}
                  _focus={{ borderColor: accent, boxShadow: `0 0 0 2px ${accent}18` }}
                />
                <ErrTxt msg={errors.location_area?.message} />
              </Box>
            )}

            <Box>
              <Label required>
                <FiCalendar size={12} style={{ display: 'inline', marginRight: 5 }} />
                Schedule
              </Label>
              <Controller
                name="schedule_type"
                control={control}
                render={({ field }) => (
                  <SegmentedControl
                    value={field.value}
                    onChange={field.onChange}
                    options={[{ value: 'One-Time', label: 'One-Time' }, { value: 'Recurrent', label: 'Recurring' }]}
                    accent={accent}
                  />
                )}
              />
            </Box>

            {schedType === 'Recurrent' && (
              <Box>
                <Label>Schedule details</Label>
                <Input
                  placeholder="e.g. Every Saturday 10–11 AM"
                  {...register('schedule_details')}
                  style={inputStyle}
                  _focus={{ borderColor: accent, boxShadow: `0 0 0 2px ${accent}18` }}
                />
                <ErrTxt msg={errors.schedule_details?.message} />
              </Box>
            )}

            {schedType === 'One-Time' && (
              <Box>
                <Label>Schedule details <Text as="span" fontSize="11px" color={GRAY400} fontWeight={400}>(optional)</Text></Label>
                <Input
                  placeholder="e.g. This weekend, flexible timing"
                  {...register('schedule_details')}
                  style={inputStyle}
                  _focus={{ borderColor: accent, boxShadow: `0 0 0 2px ${accent}18` }}
                />
              </Box>
            )}
          </Stack>
        </Section>

        <Box h="1px" bg={GRAY100} />

        {/* ── Tags ───────────────────────────────────────────────────────── */}
        <Section icon={<FiTag size={14} />} label="Tags">
          <Box>
            {/* Selected tags */}
            {selectedTags.length > 0 && (
              <Flex gap={2} flexWrap="wrap" mb={3}>
                {selectedTags.map((tag) => (
                  <Flex
                    key={tag.id} align="center" gap="5px"
                    px="10px" py="5px" borderRadius="full"
                    bg={accentLt} fontSize="12px" fontWeight={600}
                    color={accent}
                    border={`1px solid ${accent}30`}
                  >
                    #{tag.name}
                    <Box
                      as="button" type="button"
                      onClick={() => setSelectedTags((p) => p.filter((t) => t.id !== tag.id))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: accent }}
                    >
                      <FiX size={11} />
                    </Box>
                  </Flex>
                ))}
              </Flex>
            )}

            {/* Tag input */}
            <Box position="relative">
              <Flex
                align="center" gap={2}
                bg={WHITE} border={`1px solid ${GRAY200}`} borderRadius="10px"
                px={3} overflow="hidden"
                style={{ transition: 'border-color 0.15s, box-shadow 0.15s' }}
                _focusWithin={{ borderColor: accent, boxShadow: `0 0 0 2px ${accent}18` }}
              >
                <Spinner size="xs" display={tagLoading ? 'block' : 'none'} color="gray.400" />
                <FiTag size={13} color={GRAY400} style={{ flexShrink: 0, display: tagLoading ? 'none' : 'block' }} />
                <input
                  ref={tagInputRef}
                  value={tagQuery}
                  onChange={(e) => { setTagQuery(e.target.value); setShowTagDrop(true) }}
                  onFocus={() => setShowTagDrop(true)}
                  onBlur={() => setTimeout(() => setShowTagDrop(false), 150)}
                  placeholder={selectedTags.length >= 10 ? 'Max 10 tags reached' : 'Search or create tags…'}
                  disabled={selectedTags.length >= 10}
                  style={{
                    flex: 1, border: 'none', outline: 'none', background: 'transparent',
                    fontSize: '13px', color: GRAY800, padding: '9px 0',
                  }}
                />
              </Flex>

              {/* Dropdown */}
              {showTagDrop && (tagQuery.trim() || tagSuggestions.length > 0) && (
                <Box
                  position="absolute" zIndex={20} top="calc(100% + 6px)" left={0} right={0}
                  bg={WHITE} border={`1px solid ${GRAY200}`} borderRadius="12px"
                  boxShadow="0 8px 24px rgba(0,0,0,0.1)"
                  maxH="200px" overflowY="auto"
                >
                  {tagLoading && <Flex justify="center" p={3}><Spinner size="sm" /></Flex>}
                  {!tagLoading && tagSuggestions.map((tag) => (
                    <Box
                      key={tag.id} px={4} py="10px"
                      cursor="pointer" fontSize="13px" color={GRAY700}
                      onMouseDown={() => addTag(tag)}
                      _hover={{ bg: GRAY50 }}
                    >
                      #{tag.name}
                    </Box>
                  ))}
                  {!tagLoading && tagQuery.trim() && (
                    <Box
                      px={4} py="10px" cursor="pointer" fontSize="13px" fontWeight={600}
                      color={accent} display="flex" alignItems="center" gap="6px"
                      onMouseDown={createTag}
                      _hover={{ bg: accentLt }}
                    >
                      <FiPlus size={13} />
                      Create "{tagQuery.trim()}"
                    </Box>
                  )}
                  {!tagLoading && !tagQuery.trim() && tagSuggestions.length === 0 && (
                    <Box px={4} py="10px" color={GRAY400} fontSize="13px">Type to search tags</Box>
                  )}
                </Box>
              )}
            </Box>
            <Text fontSize="11px" color={GRAY400} mt="6px">
              Add up to 10 tags to help others find your {type.toLowerCase()}
            </Text>
          </Box>
        </Section>

        <Box h="1px" bg={GRAY100} />

        {/* ── Images ─────────────────────────────────────────────────────── */}
        <Section icon={<FiImage size={14} />} label="Photos">
          <Box>
            {mediaPreviews.length > 0 && (
              <Grid templateColumns="repeat(auto-fill, minmax(90px, 1fr))" gap={3} mb={3}>
                {mediaPreviews.map((src, i) => (
                  <Box key={i} position="relative" borderRadius="10px" overflow="hidden"
                    border={`1px solid ${GRAY200}`} style={{ aspectRatio: '1' }}
                  >
                    <img src={src} alt={`Preview ${i + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    <Box
                      as="button" type="button"
                      position="absolute" top="5px" right="5px"
                      w="20px" h="20px" borderRadius="full"
                      bg="rgba(0,0,0,0.55)" color={WHITE}
                      display="flex" alignItems="center" justifyContent="center"
                      onClick={() => removeMedia(i)}
                      style={{ border: 'none', cursor: 'pointer' }}
                    >
                      <FiX size={10} />
                    </Box>
                  </Box>
                ))}
              </Grid>
            )}

            {mediaFiles.length < 5 && (
              <Box
                as="label"
                display="flex" flexDirection="column" alignItems="center" justifyContent="center"
                gap={2} py={6} px={4}
                border={`2px dashed ${GRAY200}`} borderRadius="12px"
                cursor="pointer" textAlign="center"
                transition="all 0.15s"
                _hover={{ borderColor: GRAY300, bg: GRAY50 }}
              >
                <Box color={GRAY300}><FiImage size={24} /></Box>
                <Text fontSize="13px" color={GRAY500} fontWeight={500}>
                  Click to upload photos
                </Text>
                <Text fontSize="11px" color={GRAY400}>
                  {mediaFiles.length}/5 photos · PNG, JPG up to 10 MB each
                </Text>
                <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleMedia} />
              </Box>
            )}
          </Box>
        </Section>

        {/* ── Actions ────────────────────────────────────────────────────── */}
        <Flex justify="flex-end" gap={3} pt={2} borderTop={`1px solid ${GRAY100}`}>
          <Box
            as="button" type="button"
            px="20px" py="10px" borderRadius="10px"
            bg={GRAY100} color={GRAY700}
            fontSize="14px" fontWeight={600}
            onClick={() => navigate(-1)}
            disabled={submitting}
            style={{ border: 'none', cursor: submitting ? 'not-allowed' : 'pointer' }}
            _hover={{ bg: GRAY200 }} transition="background 0.15s"
          >
            Cancel
          </Box>
          <Box
            as="button" type="submit"
            px="24px" py="10px" borderRadius="10px"
            bg={accent} color={WHITE}
            fontSize="14px" fontWeight={700}
            style={{
              border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.75 : 1,
              transition: 'opacity 0.15s',
              display: 'flex', alignItems: 'center', gap: '7px',
            }}
            onMouseEnter={(e) => { if (!submitting) (e.currentTarget as HTMLButtonElement).style.opacity = '0.88' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = submitting ? '0.75' : '1' }}
          >
            {submitting && <Spinner size="xs" color="white" />}
            {submitting ? 'Posting…' : `Post ${type}`}
          </Box>
        </Flex>

      </Stack>
    </form>
  )
}
