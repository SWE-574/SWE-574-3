import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Box, Flex, Stack, Text, Input, Textarea, Button } from '@chakra-ui/react'
import { FiArrowLeft, FiSend, FiChevronDown } from 'react-icons/fi'
import { toast } from 'sonner'
import { forumAPI } from '@/services/forumAPI'
import type { ForumCategory } from '@/types'
import {
  GREEN, GREEN_LT,
  GRAY50, GRAY100, GRAY200, GRAY300, GRAY400, GRAY500, GRAY600, GRAY700, GRAY800, WHITE, RED,
} from '@/theme/tokens'

const schema = z.object({
  category: z.string().min(1, 'Please select a category'),
  title:    z.string().min(5, 'Title must be at least 5 characters').max(200, 'Title too long'),
  body:     z.string().min(20, 'Body must be at least 20 characters').max(10_000, 'Body too long'),
})

type FormData = z.infer<typeof schema>

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <Text fontSize="12px" color={RED} mt={1}>{msg}</Text>
}

export default function ForumCreateTopic() {
  const navigate           = useNavigate()
  const [searchParams]     = useSearchParams()
  const preselectedSlug    = searchParams.get('category') ?? ''

  const [categories, setCategories] = useState<ForumCategory[]>([])
  const [catLoading, setCatLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [charCount, setCharCount]   = useState(0)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { category: '', title: '', body: '' },
  })

  const bodyValue = watch('body')
  useEffect(() => setCharCount(bodyValue?.length ?? 0), [bodyValue])

  useEffect(() => {
    const ctrl = new AbortController()
    forumAPI.listCategories(ctrl.signal)
      .then((data) => {
        const active = data.filter((c) => c.is_active)
        setCategories(active)
        const preselected = active.find((c) => c.slug === preselectedSlug)
        const defaultCategory = preselected?.id ?? active[0]?.id ?? ''
        reset({ category: defaultCategory, title: '', body: '' })
      })
      .catch(() => {})
      .finally(() => setCatLoading(false))
    return () => ctrl.abort()
  }, [preselectedSlug, reset])

  const onSubmit = async (data: FormData) => {
    setSubmitting(true)
    try {
      const topic = await forumAPI.createTopic({
        title:    data.title.trim(),
        body:     data.body.trim(),
        category: data.category,
      })
      toast.success('Topic created!')
      navigate(`/forum/topic/${topic.id}`)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string; non_field_errors?: string[] } } })
        ?.response?.data?.detail
        ?? (e as Error)?.message
        ?? 'Failed to create topic'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const selectedCat = categories.find((c) => c.id === watch('category'))

  return (
    <Box bg={GRAY50} minH="calc(100vh - 64px)" py={{ base: 4, md: 6 }} px={{ base: 3, md: 6 }}>
      <Box maxW="720px" mx="auto">

        {/* Back */}
        <Flex
          as="button" align="center" gap={2} mb={5}
          color={GRAY500} fontSize="13px" cursor="pointer"
          _hover={{ color: GRAY700 }}
          onClick={() => navigate(selectedCat ? `/forum/category/${selectedCat.slug}` : '/forum')}
        >
          <FiArrowLeft size={14} />
          {selectedCat ? selectedCat.name : 'Forum'}
        </Flex>

        {/* Page title */}
        <Text fontSize={{ base: '20px', md: '26px' }} fontWeight={800} color={GRAY800} mb={6}>
          New Topic
        </Text>

        <Box
          as="form"
          onSubmit={handleSubmit(onSubmit)}
          bg={WHITE}
          borderRadius="20px"
          border={`1px solid ${GRAY200}`}
          boxShadow="0 2px 12px rgba(0,0,0,0.06)"
          p={{ base: 5, md: 7 }}
        >
          <Stack gap={6}>

            {/* Category selector */}
            <Box>
              <Text fontSize="13px" fontWeight={600} color={GRAY700} mb={2}>
                Category <Text as="span" color={RED}>*</Text>
              </Text>
              {catLoading ? (
                <Box h="40px" bg={GRAY200} borderRadius="10px" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
              ) : (
                <Box position="relative">
                  <Box
                    as="select"
                    {...register('category')}
                    w="100%"
                    h="44px"
                    px={3}
                    fontSize="14px"
                    color={GRAY800}
                    bg={WHITE}
                    border={`1px solid ${errors.category ? RED : GRAY300}`}
                    borderRadius="12px"
                    cursor="pointer"
                    outline="none"
                    style={{ appearance: 'none', paddingRight: '36px' }}
                    _focus={{ borderColor: GREEN }}
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </Box>
                  <Box position="absolute" right={3} top="50%" transform="translateY(-50%)" pointerEvents="none" color={GRAY400}>
                    <FiChevronDown size={16} />
                  </Box>
                </Box>
              )}
              <FieldError msg={errors.category?.message} />
            </Box>

            {/* Title */}
            <Box>
              <Text fontSize="13px" fontWeight={600} color={GRAY700} mb={2}>
                Title <Text as="span" color={RED}>*</Text>
              </Text>
              <Input
                {...register('title')}
                placeholder="A clear, descriptive title for your topic"
                fontSize="14px"
                h="44px"
                border={`1px solid ${errors.title ? RED : GRAY300}`}
                borderRadius="12px"
                bg={GRAY50}
                _focus={{ borderColor: GREEN, bg: WHITE, outline: 'none' }}
                _placeholder={{ color: GRAY400 }}
              />
              <Flex justify="space-between" mt={1}>
                <FieldError msg={errors.title?.message} />
                <Text fontSize="11px" color={GRAY400}>{watch('title')?.length ?? 0}/200</Text>
              </Flex>
            </Box>

            {/* Body */}
            <Box>
              <Text fontSize="13px" fontWeight={600} color={GRAY700} mb={2}>
                Body <Text as="span" color={RED}>*</Text>
              </Text>
              <Textarea
                {...register('body')}
                placeholder="Share your thoughts, question, or information in detail…"
                rows={10}
                fontSize="14px"
                resize="vertical"
                border={`1px solid ${errors.body ? RED : GRAY300}`}
                borderRadius="12px"
                bg={GRAY50}
                _focus={{ borderColor: GREEN, bg: WHITE, outline: 'none' }}
                _placeholder={{ color: GRAY400 }}
              />
              <Flex justify="space-between" mt={1}>
                <FieldError msg={errors.body?.message} />
                <Text fontSize="11px" color={charCount > 10_000 ? RED : GRAY400}>{charCount}/10,000</Text>
              </Flex>
            </Box>

            {/* Tips */}
            <Box bg={GREEN_LT} borderRadius="12px" p={4} border={`1px solid #BBF7D0`}>
              <Text fontSize="12px" fontWeight={700} color={GREEN} mb={2}>Tips for a great topic</Text>
              <Stack gap={1}>
                {[
                  'Use a specific title that summarises your topic.',
                  'Provide enough context so others can help.',
                  'Be respectful and constructive.',
                ].map((tip) => (
                  <Flex key={tip} align="flex-start" gap={2}>
                    <Text fontSize="11px" color={GREEN} mt="2px">•</Text>
                    <Text fontSize="12px" color={GRAY600}>{tip}</Text>
                  </Flex>
                ))}
              </Stack>
            </Box>

            {/* Submit */}
            <Flex justify="flex-end" gap={3} pt={2} borderTop={`1px solid ${GRAY100}`}>
              <Button
                variant="ghost" borderRadius="10px" size="sm" color={GRAY500}
                onClick={() => navigate(-1)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  background: submitting ? GRAY300 : GREEN,
                  color: WHITE,
                  border: 'none',
                  borderRadius: '10px',
                  padding: '8px 20px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background 0.15s',
                }}
              >
                <FiSend size={14} />
                {submitting ? 'Creating…' : 'Create Topic'}
              </button>
            </Flex>
          </Stack>
        </Box>
      </Box>
    </Box>
  )
}
