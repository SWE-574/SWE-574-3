import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Flex, Text, Button, Textarea, VStack, HStack, Avatar,
} from '@chakra-ui/react'
import { FiArrowLeft, FiArrowRight, FiCheck, FiCamera, FiX } from 'react-icons/fi'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/useAuthStore'
import { userAPI, dataURLtoBlob } from '@/services/userAPI'
import { tagAPI } from '@/services/tagAPI'

import type { Tag } from '@/types'
import {
  GREEN, GREEN_LT, GREEN_MD,
  GRAY50, GRAY100, GRAY200, GRAY300, GRAY400, GRAY500, GRAY600, GRAY700, GRAY800,
  WHITE,
} from '@/theme/tokens'
import { Logo } from '@/components/Logo'
import ImageCropModal from '@/components/ImageCropModal'
import WikidataTagAutocomplete from '@/components/WikidataTagAutocomplete'
import ProfileLocationSearch from '@/components/profile/ProfileLocationSearch'

const STEPS = [
  { id: 1, title: 'Welcome' },
  { id: 2, title: 'Photo & Location' },
  { id: 3, title: 'About You' },
  { id: 4, title: 'Your Skills' },
]

// ── Component ─────────────────────────────────────────────────────────────────
const OnboardingPage = () => {
  const navigate  = useNavigate()
  const { user, updateUserOptimistically, refreshUser } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep]       = useState(1)
  const [isSaving, setIsSaving] = useState(false)

  // Step 2
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [location, setLocation]           = useState('')

  // Crop modal
  const [cropModal, setCropModal] = useState<{ open: boolean; src: string }>({ open: false, src: '' })

  // Step 3
  const [bio, setBio] = useState('')

  // Step 4
  const [skills, setSkills] = useState<Tag[]>([])

  const progress = (step / STEPS.length) * 100

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be smaller than 5 MB'); return }
    const reader = new FileReader()
    reader.onload = (ev) => setCropModal({ open: true, src: ev.target?.result as string })
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleCropConfirm = useCallback((croppedDataUrl: string) => {
    setAvatarPreview(croppedDataUrl)
    setCropModal({ open: false, src: '' })
  }, [])

  const handleCropCancel = useCallback(() => {
    setCropModal({ open: false, src: '' })
  }, [])

  const addSkill = useCallback((tag: Tag) => {
    setSkills(prev => prev.some(t => t.id === tag.id) ? prev : [...prev, tag])
  }, [])

  const removeSkill = useCallback((id: string) => {
    setSkills(prev => prev.filter(t => t.id !== id))
  }, [])

  const handleComplete = async () => {
    setIsSaving(true)
    try {
      // Resolve all skills to real DB tags (creates via POST /api/tags/ if needed)
      const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      const resolvedSkills = await Promise.all(
        skills.map(async (tag) => {
          if (isUuid(tag.id)) return tag
          return tagAPI.ensureInDb(tag)
        })
      )

      const fd = new FormData()
      fd.append('bio', bio)
      fd.append('location', location)
      resolvedSkills.forEach(t => fd.append('skill_ids', t.id))
      fd.append('is_onboarded', 'true')
      if (avatarPreview) {
        fd.append('avatar', dataURLtoBlob(avatarPreview), 'avatar.jpg')
      }
      const updated = await userAPI.updateMe(fd)
      updateUserOptimistically({ ...updated, is_onboarded: true })
      await refreshUser()
      toast.success('Welcome to The Hive!')
      navigate('/dashboard')
    } catch {
      updateUserOptimistically({ is_onboarded: true })
      toast.success('Welcome to The Hive!')
      navigate('/dashboard')
    } finally {
      setIsSaving(false)
    }
  }

  // ── Steps ────────────────────────────────────────────────────────────────────
  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <VStack gap={6} textAlign="center" py={6}>
            <Box w="72px" h="72px" borderRadius="16px" bg={GREEN_LT} border={`2px solid ${GREEN_MD}`}
              display="flex" alignItems="center" justifyContent="center">
              <Logo size={44} />
            </Box>
            <VStack gap={2}>
              <Text fontSize="xl" fontWeight="700" color={GRAY800}>Welcome, {user?.first_name || 'Friend'}!</Text>
              <Text fontSize="sm" color={GRAY500} maxW="300px">
                Let's set up your profile so the community can get to know you.
              </Text>
            </VStack>
            <Box bg={GREEN_LT} borderRadius="12px" p={4} maxW="320px" w="full" border={`1px solid ${GREEN_MD}`}>
              <VStack gap={2} align="start">
                {[
                  '🎯 Share your skills with neighbours',
                  '🤝 Exchange time — not money',
                  '⏰ Start with 3 hours of shared time',
                ].map(item => (
                  <Text key={item} fontSize="sm" color={GRAY700}>{item}</Text>
                ))}
              </VStack>
            </Box>
            <Box bg={WHITE} borderRadius="10px" px={5} py={3}
              border={`1px solid ${GRAY200}`} boxShadow="0 1px 4px rgba(0,0,0,0.06)">
              <Text fontSize="sm" color={GRAY700} fontWeight="600">
                🕐 Your time available:{' '}
                <span style={{ color: GREEN }}>{user?.timebank_balance ?? 3} hours</span>
              </Text>
            </Box>
          </VStack>
        )

      case 2:
        return (
          <VStack gap={6} py={4}>
            <VStack gap={1} textAlign="center">
              <Text fontSize="lg" fontWeight="700" color={GRAY800}>Photo & Location</Text>
              <Text fontSize="sm" color={GRAY500}>Help others find and recognise you</Text>
            </VStack>

            {/* Avatar with crop */}
            <VStack gap={2}>
              <Box position="relative" cursor="pointer" onClick={() => fileInputRef.current?.click()}
                style={{ transition: 'opacity 0.15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.85'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}>
                {avatarPreview ? (
                  <Box w="96px" h="96px" borderRadius="full" overflow="hidden"
                    style={{ border: `3px solid ${WHITE}`, boxShadow: '0 2px 10px rgba(0,0,0,0.18)' }}>
                    <img src={avatarPreview} alt="preview"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </Box>
                ) : (
                  <Avatar.Root size="2xl">
                    <Avatar.Image src={user?.avatar_url ?? undefined} />
                    <Avatar.Fallback style={{ background: GREEN_LT, color: GREEN, fontWeight: 700 }}>
                      {user?.first_name?.[0]}{user?.last_name?.[0]}
                    </Avatar.Fallback>
                  </Avatar.Root>
                )}
                <Box position="absolute" bottom={0} right={0} bg={GREEN} borderRadius="full"
                  w="28px" h="28px" display="flex" alignItems="center" justifyContent="center"
                  border={`2px solid ${WHITE}`}>
                  <FiCamera size={12} color={WHITE} />
                </Box>
              </Box>
              <Text fontSize="xs" color={GRAY400}>Click to upload — a crop editor will open</Text>
              <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={handleAvatarFileChange} />
            </VStack>

            {/* Location */}
            <Box w="full" maxW="360px">
              <label htmlFor="onb-location"
                style={{ fontSize: '13px', fontWeight: 500, color: GRAY700, display: 'block', marginBottom: '6px' }}>
                Location <span style={{ color: GRAY400, fontWeight: 400 }}>(optional)</span>
              </label>
              <ProfileLocationSearch
                id="onb-location"
                value={location}
                onChange={setLocation}
                label="Location"
                placeholder="Search city, district, or address"
                helperText="Pick a suggestion to show your neighbourhood consistently."
              />
            </Box>
          </VStack>
        )

      case 3:
        return (
          <VStack gap={6} py={4}>
            <VStack gap={1} textAlign="center">
              <Text fontSize="lg" fontWeight="700" color={GRAY800}>About You</Text>
              <Text fontSize="sm" color={GRAY500}>Tell the community about yourself</Text>
            </VStack>
            <Box w="full" maxW="400px">
              <label htmlFor="onb-bio"
                style={{ fontSize: '13px', fontWeight: 500, color: GRAY700, display: 'block', marginBottom: '6px' }}>
                Bio <span style={{ color: GRAY400, fontWeight: 400 }}>(optional)</span>
              </label>
              <Textarea id="onb-bio" value={bio} onChange={e => setBio(e.target.value)}
                placeholder="Hi! I love cooking and teaching music…"
                borderColor={GRAY300} borderRadius="8px" fontSize="sm"
                _focus={{ borderColor: GREEN, boxShadow: `0 0 0 3px ${GREEN}22` }}
                rows={5} maxLength={500} />
              <Text fontSize="xs" color={GRAY400} mt={1} textAlign="right">{bio.length}/500</Text>
            </Box>
          </VStack>
        )

      case 4:
        return (
          <VStack gap={5} py={4}>
            <VStack gap={1} textAlign="center">
              <Text fontSize="lg" fontWeight="700" color={GRAY800}>Your Skills</Text>
              <Text fontSize="sm" color={GRAY500}>Search Wikidata or type your own skill and press Enter</Text>
            </VStack>

            {/* Selected chips */}
            {skills.length > 0 && (
              <Box w="full" maxW="400px">
                <Text fontSize="xs" fontWeight="600" color={GRAY500} mb={2}>Selected ({skills.length}):</Text>
                <Flex flexWrap="wrap" gap={2}>
                  {skills.map(tag => (
                    <Flex key={tag.id} align="center" gap={1}
                      bg={GREEN_LT} border={`1px solid ${GREEN_MD}`} borderRadius="full" px={3} py="5px">
                      <Text fontSize="xs" color={GREEN} fontWeight="600">{tag.name}</Text>
                      <button type="button" onClick={() => removeSkill(tag.id)}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: GREEN, display: 'flex', marginLeft: '4px' }}>
                        <FiX size={11} />
                      </button>
                    </Flex>
                  ))}
                </Flex>
              </Box>
            )}

            {/* Autocomplete — overflow visible so dropdown isn't clipped */}
            <Box w="full" maxW="400px" style={{ position: 'relative', zIndex: 50 }}>
              <WikidataTagAutocomplete
                selectedTags={skills}
                onAddTag={addSkill}
                disabled={skills.length >= 15}
                accent={GREEN}
              />
            </Box>

            {skills.length === 0 && (
              <Box w="full" maxW="400px" p={4} borderRadius="10px"
                border={`1px dashed ${GRAY300}`} bg={GRAY50} textAlign="center">
                <Text fontSize="xs" color={GRAY400}>
                  No skills added yet. Search Wikidata tags above.
                </Text>
              </Box>
            )}
          </VStack>
        )

      default:
        return null
    }
  }

  return (
    <Box bg={GRAY50} minH="100vh">
      {/* ── Top bar ── */}
      <Box position="fixed" top={0} left={0} right={0} zIndex={10}
        bg={WHITE} borderBottom={`1px solid ${GRAY200}`} boxShadow="0 1px 4px rgba(0,0,0,0.06)">
        <Box h="3px" bg={GRAY100}>
          <Box h="full" bg={GREEN} style={{ width: `${progress}%`, transition: 'width 0.35s ease' }} />
        </Box>
        <Flex maxW="560px" mx="auto" px={4} h="52px" align="center" justify="space-between">
          <HStack gap={2}>
            <Logo size={22} />
            <Text fontSize="sm" fontWeight="600" color={GRAY700}>
              Step {step} of {STEPS.length} — {STEPS[step - 1].title}
            </Text>
          </HStack>
          <Box as="button"
            onClick={() => { updateUserOptimistically({ is_onboarded: true }); navigate('/dashboard') }}
            fontSize="xs" color={GRAY400} fontWeight={500} px={3} py={1} borderRadius="6px"
            _hover={{ bg: GRAY100, color: GRAY600 }} transition="all 0.15s">
            Skip for now
          </Box>
        </Flex>
      </Box>

      {/* ── Content ── */}
      <Flex justify="center" px={4} pt="80px" pb="100px">
        <Box w="full" maxW="520px">
          <Box bg={WHITE} borderRadius="16px" border={`1px solid ${GRAY200}`}
            boxShadow="0 4px 24px rgba(0,0,0,0.08)" p={8}
            style={{ overflow: step === 4 ? 'visible' : 'hidden' }}>
            {renderStep()}
          </Box>
        </Box>
      </Flex>

      {/* ── Bottom navigation ── */}
      <Box position="fixed" bottom={0} left={0} right={0}
        bg={WHITE} borderTop={`1px solid ${GRAY200}`} boxShadow="0 -1px 4px rgba(0,0,0,0.06)"
        py={4} px={4}>
        <Flex maxW="560px" mx="auto" gap={3}>
          <Button variant="outline" size="md" flex={1}
            onClick={() => step > 1 && setStep(step - 1)}
            disabled={step === 1}
            style={{ borderRadius: '8px', borderColor: GRAY200, color: GRAY600, fontWeight: 500, fontSize: '14px' }}>
            <FiArrowLeft size={14} style={{ marginRight: 6 }} />
            Back
          </Button>

          {step < STEPS.length ? (
            <Button size="md" flex={1} onClick={() => setStep(step + 1)}
              style={{ background: GREEN, color: WHITE, borderRadius: '8px', fontWeight: 600, fontSize: '14px' }}>
              Continue
              <FiArrowRight size={14} style={{ marginLeft: 6 }} />
            </Button>
          ) : (
            <Button size="md" flex={1} onClick={handleComplete} loading={isSaving} loadingText="Saving…"
              style={{ background: GREEN, color: WHITE, borderRadius: '8px', fontWeight: 600, fontSize: '14px' }}>
              Let's go!
              <FiCheck size={14} style={{ marginLeft: 6 }} />
            </Button>
          )}
        </Flex>
      </Box>

      {/* ── Crop Modal ── */}
      <ImageCropModal
        isOpen={cropModal.open}
        imageSrc={cropModal.src}
        aspect={1}
        cropShape="round"
        title="Crop Profile Photo"
        onConfirm={handleCropConfirm}
        onCancel={handleCropCancel}
      />
    </Box>
  )
}

export default OnboardingPage
