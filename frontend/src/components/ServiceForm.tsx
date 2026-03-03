import { useState } from 'react'
import { useForm, Controller, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import {
  Box, Button, Field, Flex, Grid, Input, NativeSelect,
  Stack, Text, Textarea, Badge, CloseButton, Image,
} from '@chakra-ui/react'
import { toast } from 'sonner'
import { serviceAPI } from '@/services/serviceAPI'
import WikidataTagAutocomplete from '@/components/WikidataTagAutocomplete'
import type { Tag } from '@/types'

// ── Zod schema ────────────────────────────────────────────────────────────────
const schema = z
  .object({
    title: z.string().min(3, 'Title must be at least 3 characters').max(200),
    description: z.string().min(10, 'Description must be at least 10 characters').max(5000),
    duration: z.coerce
      .number()
      .positive('Duration must be greater than 0')
      .max(999, 'Duration too large'),
    location_type: z.enum(['In-Person', 'Online']),
    location_area: z.string().optional(),
    max_participants: z.coerce
      .number()
      .int()
      .positive('Must be at least 1')
      .max(100),
    schedule_type: z.enum(['One-Time', 'Recurrent']),
    schedule_details: z.string().max(500).optional(),
  })
  .refine(
    (d) => d.location_type !== 'In-Person' || (d.location_area && d.location_area.trim().length > 0),
    { message: 'Location area is required for in-person services', path: ['location_area'] },
  )

type FormValues = z.infer<typeof schema>

// ── Props ─────────────────────────────────────────────────────────────────────
interface ServiceFormProps {
  type: 'Offer' | 'Need'
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ServiceForm({ type }: ServiceFormProps) {
  const navigate = useNavigate()
  const accent = type === 'Offer' ? 'orange' : 'blue'

  // Tags state
  const [selectedTags, setSelectedTags] = useState<Tag[]>([])

  // Media state
  const [mediaFiles, setMediaFiles] = useState<File[]>([])
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([])

  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: {
      location_type: 'Online',
      schedule_type: 'One-Time',
      max_participants: 1,
    },
  })

  const locationType = watch('location_type')

  const addTag = (tag: Tag) => {
    setSelectedTags((prev) => {
      const exists = prev.some((existingTag) => existingTag.id === tag.id)
      return exists ? prev : [...prev, tag]
    })
  }

  const removeTag = (id: string) => setSelectedTags((prev) => prev.filter((t) => t.id !== id))

  // ── Media upload ────────────────────────────────────────────────────────────
  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    const remaining = 5 - mediaFiles.length
    const toAdd = files.slice(0, remaining)
    if (toAdd.length === 0) return

    setMediaFiles((prev) => [...prev, ...toAdd])
    toAdd.forEach((file) => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        setMediaPreviews((prev) => [...prev, ev.target?.result as string])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const removeMedia = (index: number) => {
    setMediaFiles((prev) => prev.filter((_, i) => i !== index))
    setMediaPreviews((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  const onSubmit = async (values: FormValues) => {
    setSubmitting(true)
    try {
      const tagIds: string[] = []
      const tagNames: string[] = []

      selectedTags.forEach((tag) => {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tag.id)
        const isWikidataQid = /^Q\d+$/i.test(tag.id)

        if (isUuid || isWikidataQid) {
          tagIds.push(tag.id)
          return
        }

        const cleanedName = tag.name.trim()
        if (cleanedName) tagNames.push(cleanedName)
      })

      const payload = {
        title: values.title,
        description: values.description,
        type,
        duration: values.duration,
        location_type: values.location_type,
        location_area: values.location_area || undefined,
        max_participants: values.max_participants,
        schedule_type: values.schedule_type,
        schedule_details: values.schedule_details || undefined,
        tag_ids: tagIds.length > 0 ? tagIds : undefined,
        tag_names: tagNames.length > 0 ? tagNames : undefined,
      }

      let created
      if (mediaFiles.length === 0) {
        created = await serviceAPI.create(payload)
      } else {
        const formData = new FormData()
        formData.append('title', values.title)
        formData.append('description', values.description)
        formData.append('type', type)
        formData.append('duration', String(values.duration))
        formData.append('location_type', values.location_type)
        if (values.location_area) formData.append('location_area', values.location_area)
        formData.append('max_participants', String(values.max_participants))
        formData.append('schedule_type', values.schedule_type)
        if (values.schedule_details) formData.append('schedule_details', values.schedule_details)

        tagIds.forEach((id) => formData.append('tag_ids', id))
        tagNames.forEach((name) => formData.append('tag_names', name))
        mediaFiles.forEach((file) => formData.append('media', file))

        created = await serviceAPI.create(formData)
      }

      toast.success(`${type} posted successfully!`)
      navigate(`/service-detail/${created.id}`)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Failed to post. Please try again.'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack gap={6}>

        {/* Title */}
        <Field.Root invalid={!!errors.title}>
          <Field.Label>Title <Text as="span" color="red.500">*</Text></Field.Label>
          <Input
            placeholder={type === 'Offer' ? 'e.g. Guitar lessons for beginners' : 'e.g. Need help moving furniture'}
            {...register('title')}
          />
          {errors.title && <Field.ErrorText>{errors.title.message}</Field.ErrorText>}
        </Field.Root>

        {/* Description */}
        <Field.Root invalid={!!errors.description}>
          <Field.Label>Description <Text as="span" color="red.500">*</Text></Field.Label>
          <Textarea
            placeholder="Describe what you're offering or what you need in detail…"
            rows={5}
            {...register('description')}
          />
          {errors.description && <Field.ErrorText>{errors.description.message}</Field.ErrorText>}
        </Field.Root>

        {/* Duration + Max participants */}
        <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4}>
          <Field.Root invalid={!!errors.duration}>
            <Field.Label>Duration (hours) <Text as="span" color="red.500">*</Text></Field.Label>
            <Input type="number" min={0.5} step={0.5} placeholder="e.g. 1.5" {...register('duration')} />
            {errors.duration && <Field.ErrorText>{errors.duration.message}</Field.ErrorText>}
          </Field.Root>

          <Field.Root invalid={!!errors.max_participants}>
            <Field.Label>
              {type === 'Offer' ? 'Max participants' : 'Helpers needed'}
              <Text as="span" color="red.500"> *</Text>
            </Field.Label>
            <Input type="number" min={1} max={100} placeholder="1" {...register('max_participants')} />
            {errors.max_participants && <Field.ErrorText>{errors.max_participants.message}</Field.ErrorText>}
          </Field.Root>
        </Grid>

        {/* Location type */}
        <Field.Root invalid={!!errors.location_type}>
          <Field.Label>Location type <Text as="span" color="red.500">*</Text></Field.Label>
          <Controller
            name="location_type"
            control={control}
            render={({ field }) => (
              <NativeSelect.Root>
                <NativeSelect.Field {...field}>
                  <option value="Online">Online</option>
                  <option value="In-Person">In-Person</option>
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            )}
          />
        </Field.Root>

        {/* Location area (conditional) */}
        {locationType === 'In-Person' && (
          <Field.Root invalid={!!errors.location_area}>
            <Field.Label>Location area <Text as="span" color="red.500">*</Text></Field.Label>
            <Input placeholder="e.g. Kadıköy, Istanbul" {...register('location_area')} />
            {errors.location_area && <Field.ErrorText>{errors.location_area.message}</Field.ErrorText>}
          </Field.Root>
        )}

        {/* Schedule type + details */}
        <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4}>
          <Field.Root invalid={!!errors.schedule_type}>
            <Field.Label>Schedule type <Text as="span" color="red.500">*</Text></Field.Label>
            <Controller
              name="schedule_type"
              control={control}
              render={({ field }) => (
                <NativeSelect.Root>
                  <NativeSelect.Field {...field}>
                    <option value="One-Time">One-Time</option>
                    <option value="Recurrent">Recurrent</option>
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              )}
            />
          </Field.Root>

          <Field.Root invalid={!!errors.schedule_details}>
            <Field.Label>Schedule details</Field.Label>
            <Input placeholder="e.g. Every Saturday 10–11 AM" {...register('schedule_details')} />
            {errors.schedule_details && <Field.ErrorText>{errors.schedule_details.message}</Field.ErrorText>}
          </Field.Root>
        </Grid>

        {/* Tags */}
        <Field.Root>
          <Field.Label>Tags</Field.Label>
          <Box>
            <Flex gap={2} wrap="wrap" mb={selectedTags.length > 0 ? 2 : 0}>
              {selectedTags.map((tag) => (
                <Badge key={tag.id} colorPalette={accent} size="md" px={2} py={1} borderRadius="full">
                  {tag.name}
                  <CloseButton
                    size="xs"
                    ml={1}
                    onClick={() => removeTag(tag.id)}
                    aria-label={`Remove tag ${tag.name}`}
                  />
                </Badge>
              ))}
            </Flex>

            <WikidataTagAutocomplete
              selectedTags={selectedTags}
              onAddTag={addTag}
              disabled={selectedTags.length >= 10}
              accent={accent}
            />
          </Box>
          <Field.HelperText>Add up to 10 tags to help others find your {type.toLowerCase()}</Field.HelperText>
        </Field.Root>

        {/* Media upload */}
        <Field.Root>
          <Field.Label>Images <Text as="span" color="gray.500" fontWeight="normal" fontSize="sm">(optional, max 5)</Text></Field.Label>
          {mediaPreviews.length > 0 && (
            <Grid templateColumns="repeat(auto-fill, minmax(100px, 1fr))" gap={3} mb={3}>
              {mediaPreviews.map((src, i) => (
                <Box key={i} position="relative" borderRadius="md" overflow="hidden">
                  <Image src={src} alt={`Preview ${i + 1}`} w="100%" h="100px" objectFit="cover" />
                  <CloseButton
                    size="sm"
                    position="absolute"
                    top={1}
                    right={1}
                    bg="blackAlpha.600"
                    color="white"
                    _hover={{ bg: 'blackAlpha.800' }}
                    onClick={() => removeMedia(i)}
                    aria-label="Remove image"
                  />
                </Box>
              ))}
            </Grid>
          )}
          {mediaFiles.length < 5 && (
            <Box
              as="label"
              display="block"
              border="2px dashed"
              borderColor={`${accent}.200`}
              borderRadius="md"
              p={6}
              textAlign="center"
              cursor="pointer"
              _hover={{ borderColor: `${accent}.400`, bg: `${accent}.50` }}
              transition="all 0.2s"
            >
              <Text color="gray.500" fontSize="sm">
                Click to upload images ({mediaFiles.length}/5)
              </Text>
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleMediaChange}
              />
            </Box>
          )}
        </Field.Root>

        {/* Submit */}
        <Flex justify="flex-end" gap={3} pt={2}>
          <Button variant="outline" onClick={() => navigate(-1)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            colorPalette={accent}
            loading={submitting}
            loadingText="Posting…"
          >
            Post {type}
          </Button>
        </Flex>

      </Stack>
    </form>
  )
}

