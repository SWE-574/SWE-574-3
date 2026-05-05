import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Dialog, Drawer, Flex, Portal, Text, Input, Textarea, Spinner,
} from '@chakra-ui/react'
import { FiX, FiUser, FiAlertCircle, FiTag, FiImage } from 'react-icons/fi'
import { toast } from 'sonner'
import type { User, BadgeProgress, Tag } from '@/types'
import { userAPI, dataURLtoBlob } from '@/services/userAPI'
import { tagAPI } from '@/services/tagAPI'
import { getErrorMessage } from '@/services/api'
import ImageCropModal from '@/components/ImageCropModal'
import WikidataTagAutocomplete from '@/components/WikidataTagAutocomplete'
import BadgeShowcase from './BadgeShowcase'
import {
  GRAY50, GRAY100, GRAY200, GRAY300, GRAY400, GRAY500, GRAY600, GRAY700, GRAY800,
  GREEN, GREEN_LT,
  AMBER, AMBER_LT,
  RED, RED_LT,
  WHITE,
} from '@/theme/tokens'

// ── Accent color options ────────────────────────────────────────────────────────
const ACCENT_COLORS = [
  { name: 'Indigo',  value: '#4338CA' },
  { name: 'Purple',  value: '#7C3AED' },
  { name: 'Blue',    value: '#1D4ED8' },
  { name: 'Green',   value: '#059669' },
  { name: 'Amber',   value: '#D97706' },
]

// ── Form field label ─────────────────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      fontSize="10px"
      fontWeight={700}
      color={GRAY500}
      textTransform="uppercase"
      letterSpacing="0.08em"
      mb="5px"
    >
      {children}
    </Text>
  )
}

// ── Section divider ─────────────────────────────────────────────────────────────
function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box mb={6}>
      <Text
        fontSize="13px"
        fontWeight={800}
        color={GRAY800}
        mb={4}
        pb="10px"
        borderBottom={`1px solid ${GRAY200}`}
      >
        {title}
      </Text>
      {children}
    </Box>
  )
}

// ── Form state type ─────────────────────────────────────────────────────────────
interface FormState {
  first_name: string
  last_name: string
  bio: string
  location: string
  featured_badges: string[]
  skills: Tag[]
  show_history: boolean
}

// ── Props ────────────────────────────────────────────────────────────────────────
type Props = {
  isOpen: boolean
  onClose: () => void
  user: User
  badgeProgress: BadgeProgress[]
  onSaved: (updated: User) => void
}

// ── Common IANA timezone list ─────────────────────────────────────────────────
const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Istanbul', 'Europe/Moscow',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Singapore',
  'Asia/Tokyo', 'Asia/Seoul', 'Australia/Sydney', 'Pacific/Auckland',
]

// ── Language options ──────────────────────────────────────────────────────────
const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'tr', label: 'Türkçe' },
]

// ── Main component ────────────────────────────────────────────────────────────
const ProfileEditDrawer = ({ isOpen, onClose, user, badgeProgress, onSaved }: Props) => {
  const navigate = useNavigate()
  const initialForm = useCallback((): FormState => ({
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    bio: user.bio || '',
    location: user.location || '',
    featured_badges: user.featured_badges ?? [],
    skills: user.skills ? [...user.skills] : [],
    show_history: user.show_history ?? false,
  }), [user])

  const [form, setForm] = useState<FormState>(initialForm)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [bannerPreview, setBannerPreview] = useState<string | null>(null)
  const [accentColor, setAccentColor] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [featuredBadgesError, setFeaturedBadgesError] = useState<string | null>(null)

  // Crop modal
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [cropMode, setCropMode] = useState<'avatar' | 'banner'>('avatar')
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)

  // Confirm discard dialog
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  // Reset form when user or open state changes
  useEffect(() => {
    if (isOpen) {
      setForm(initialForm())
      setAvatarPreview(null)
      setBannerPreview(null)
      setFeaturedBadgesError(null)
      setConfirmDiscard(false)
    }
  }, [isOpen, initialForm])

  const dirty = (() => {
    if (avatarPreview) return true
    if (bannerPreview) return true
    if (form.first_name !== (user.first_name || '')) return true
    if (form.last_name !== (user.last_name || '')) return true
    if (form.bio !== (user.bio || '')) return true
    if (form.location !== (user.location || '')) return true
    if (form.show_history !== (user.show_history ?? false)) return true
    const origBadges = user.featured_badges ?? []
    if (JSON.stringify(form.featured_badges) !== JSON.stringify(origBadges)) return true
    const origSkillIds = (user.skills ?? []).map((t) => t.id).sort()
    const currSkillIds = form.skills.map((t) => t.id).sort()
    if (JSON.stringify(currSkillIds) !== JSON.stringify(origSkillIds)) return true
    return false
  })()

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { setCropMode('avatar'); setCropSrc(reader.result as string) }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleBannerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { setCropMode('banner'); setCropSrc(reader.result as string) }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleCropConfirm = (croppedDataUrl: string) => {
    if (cropMode === 'banner') {
      setBannerPreview(croppedDataUrl)
    } else {
      setAvatarPreview(croppedDataUrl)
    }
    setCropSrc(null)
  }

  const handleClose = () => {
    if (dirty) {
      setConfirmDiscard(true)
      return
    }
    onClose()
  }

  const handleDiscardConfirm = () => {
    setConfirmDiscard(false)
    onClose()
  }

  const handleSave = async () => {
    if (!dirty) return
    setSaving(true)
    setFeaturedBadgesError(null)
    try {
      // Resolve skills to real DB tags
      const isUuid = (id: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      const resolvedSkills = await Promise.all(
        form.skills.map((tag) => (isUuid(tag.id) ? tag : tagAPI.ensureInDb(tag))),
      )

      // Build diff — only include changed fields
      const fd = new FormData()
      if (form.first_name !== (user.first_name || '')) fd.append('first_name', form.first_name)
      if (form.last_name !== (user.last_name || '')) fd.append('last_name', form.last_name)
      if (form.bio !== (user.bio || '')) fd.append('bio', form.bio)
      if (form.location !== (user.location || '')) fd.append('location', form.location)
      if (form.show_history !== (user.show_history ?? false)) fd.append('show_history', String(form.show_history))

      // Skills
      const origSkillIds = (user.skills ?? []).map((t) => t.id).sort()
      const currSkillIds = resolvedSkills.map((t) => t.id).sort()
      if (JSON.stringify(currSkillIds) !== JSON.stringify(origSkillIds)) {
        resolvedSkills.forEach((t) => fd.append('skill_ids', t.id))
      }

      // Featured badges
      const origBadges = user.featured_badges ?? []
      if (JSON.stringify(form.featured_badges) !== JSON.stringify(origBadges)) {
        form.featured_badges.forEach((id) => fd.append('featured_badges', id))
        if (form.featured_badges.length === 0) {
          // Explicit empty — send the field to clear it
          fd.append('featured_badges', '')
        }
      }

      // Avatar
      if (avatarPreview) {
        const blob = dataURLtoBlob(avatarPreview)
        fd.append('avatar', blob, 'avatar.jpg')
      }

      // Banner / cover photo
      if (bannerPreview) {
        const blob = dataURLtoBlob(bannerPreview)
        fd.append('banner', blob, 'banner.jpg')
      }

      const updated = await userAPI.updateMe(fd)
      onSaved(updated)
      toast.success('Profile updated')
      onClose()
    } catch (err) {
      // Surface featured_badges validation errors
      const raw = err as { response?: { data?: { featured_badges?: string[] } } }
      const badgeErrors = raw?.response?.data?.featured_badges
      if (badgeErrors && badgeErrors.length > 0) {
        setFeaturedBadgesError(badgeErrors.join(' '))
      } else {
        toast.error(getErrorMessage(err))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Hidden file inputs */}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleAvatarFileChange}
      />
      <input
        ref={bannerInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleBannerFileChange}
      />

      {/* Image crop modal */}
      {cropSrc && (
        <ImageCropModal
          isOpen
          imageSrc={cropSrc}
          aspect={cropMode === 'banner' ? 3 : 1}
          cropShape={cropMode === 'banner' ? 'rect' : 'round'}
          title={cropMode === 'banner' ? 'Crop cover photo' : 'Crop avatar'}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropSrc(null)}
        />
      )}

      {/* Discard confirmation dialog — uses Chakra Dialog for focus trap, ESC, and ARIA */}
      <Dialog.Root
        role="alertdialog"
        open={confirmDiscard}
        onOpenChange={(e) => { if (!e.open) setConfirmDiscard(false) }}
        modal
      >
        <Portal>
          <Dialog.Backdrop style={{ zIndex: 3100 }} />
          <Dialog.Positioner style={{ zIndex: 3100 }}>
            <Dialog.Content
              bg={WHITE}
              borderRadius="16px"
              p={6}
              maxW="340px"
              w="calc(100% - 32px)"
              boxShadow="0 20px 60px rgba(0,0,0,0.22)"
            >
              <Dialog.Header pb={0}>
                <Flex align="center" gap={2}>
                  <Box p={2} borderRadius="8px" bg={AMBER_LT} color={AMBER}>
                    <FiAlertCircle size={16} />
                  </Box>
                  <Dialog.Title fontSize="15px" fontWeight={800} color={GRAY800}>
                    Discard changes?
                  </Dialog.Title>
                </Flex>
              </Dialog.Header>
              <Dialog.Body py={3}>
                <Text fontSize="13px" color={GRAY600}>
                  You have unsaved changes. Closing will discard them.
                </Text>
              </Dialog.Body>
              <Dialog.Footer pt={0}>
                <Flex gap={2} justify="flex-end" w="100%">
                  {/* "Keep editing" is the safer option — receives initial focus */}
                  <Dialog.CloseTrigger asChild>
                    <Box
                      as="button"
                      px="14px"
                      py="8px"
                      borderRadius="8px"
                      fontSize="13px"
                      fontWeight={600}
                      style={{ background: GRAY100, color: GRAY700, border: 'none', cursor: 'pointer' }}
                      data-testid="keep-editing-btn"
                    >
                      Keep editing
                    </Box>
                  </Dialog.CloseTrigger>
                  <Box
                    as="button"
                    px="14px"
                    py="8px"
                    borderRadius="8px"
                    fontSize="13px"
                    fontWeight={600}
                    style={{ background: RED_LT, color: RED, border: `1px solid ${RED}30`, cursor: 'pointer' }}
                    onClick={handleDiscardConfirm}
                    data-testid="discard-btn"
                  >
                    Discard
                  </Box>
                </Flex>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      {/* Chakra v3 Drawer — provides focus trap, ESC dismissal, and ARIA roles (spec §5.4) */}
      {/*
        CRITICAL 2 fix: All close paths (ESC, backdrop click) funnel through onOpenChange.
        The X button is a plain button (not Drawer.CloseTrigger) with onClick={handleClose},
        so there is exactly ONE call site for handleClose regardless of how the drawer closes.
      */}
      <Drawer.Root
        open={isOpen}
        onOpenChange={(e) => { if (!e.open) handleClose() }}
        placement="end"
        size="lg"
        closeOnInteractOutside={false}
      >
        <Portal>
          <Drawer.Backdrop style={{ backdropFilter: 'blur(2px)' }} />
          <Drawer.Positioner>
            <Drawer.Content
              bg={WHITE}
              boxShadow="-8px 0 40px rgba(0,0,0,0.18)"
              style={{ display: 'flex', flexDirection: 'column' }}
              w={{ base: '100%', md: '640px' }}
              maxW={{ base: '100%', md: '640px' }}
            >
              {/* Drawer header */}
              <Drawer.Header
                px={5}
                py={4}
                borderBottom={`1px solid ${GRAY200}`}
                flexShrink={0}
              >
                <Flex align="center" justify="space-between">
                  <Text fontSize="16px" fontWeight={800} color={GRAY800}>
                    Edit profile
                  </Text>
                  {/* Plain button — NOT Drawer.CloseTrigger to avoid double-fire with onOpenChange */}
                  <Box
                    as="button"
                    onClick={handleClose}
                    p={2}
                    borderRadius="8px"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: GRAY500 }}
                    aria-label="Close"
                  >
                    <FiX size={18} />
                  </Box>
                </Flex>
              </Drawer.Header>

              {/* Scrollable body */}
              <Drawer.Body flex={1} overflowY="auto" px={5} py={5}>

          {/* ── 1. Identity ──────────────────────────────────────────────── */}
          <DrawerSection title="Identity">
            <Flex gap={3} mb={3} direction={{ base: 'column', sm: 'row' }}>
              <Box flex={1}>
                <FieldLabel>First name</FieldLabel>
                <Input
                  value={form.first_name}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                  bg={GRAY50}
                  borderColor={GRAY200}
                  borderRadius="8px"
                  fontSize="13px"
                  aria-label="First name"
                />
              </Box>
              <Box flex={1}>
                <FieldLabel>Last name</FieldLabel>
                <Input
                  value={form.last_name}
                  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                  bg={GRAY50}
                  borderColor={GRAY200}
                  borderRadius="8px"
                  fontSize="13px"
                  aria-label="Last name"
                />
              </Box>
            </Flex>
            <Box mb={3}>
              <FieldLabel>Username</FieldLabel>
              <Input
                value={user.email.split('@')[0]}
                readOnly
                bg={GRAY100}
                borderColor={GRAY200}
                borderRadius="8px"
                fontSize="13px"
                color={GRAY500}
                aria-label="Username (read only)"
              />
              <Text fontSize="11px" color={GRAY400} mt="4px">Username cannot be changed.</Text>
            </Box>
            <Box mb={3}>
              <FieldLabel>City / Location</FieldLabel>
              <Input
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="City, Country"
                bg={GRAY50}
                borderColor={GRAY200}
                borderRadius="8px"
                fontSize="13px"
                aria-label="City or location"
              />
            </Box>
            <Flex gap={3} mb={3} direction={{ base: 'column', sm: 'row' }}>
              <Box flex={1}>
                {/* TODO: wire timezone to backend once user.timezone field is available */}
                <FieldLabel>Timezone</FieldLabel>
                <Box
                  as="select"
                  defaultValue="UTC"
                  bg={GRAY50}
                  borderColor={GRAY200}
                  borderRadius="8px"
                  fontSize="13px"
                  px="10px"
                  h="40px"
                  w="100%"
                  aria-label="Timezone"
                  style={{ border: `1px solid ${GRAY200}`, color: GRAY700 }}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </Box>
              </Box>
              <Box flex={1}>
                {/* TODO: wire language to backend once user.language field is available */}
                <FieldLabel>Language</FieldLabel>
                <Box
                  as="select"
                  defaultValue="en"
                  bg={GRAY50}
                  borderColor={GRAY200}
                  borderRadius="8px"
                  fontSize="13px"
                  px="10px"
                  h="40px"
                  w="100%"
                  aria-label="Language"
                  style={{ border: `1px solid ${GRAY200}`, color: GRAY700 }}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </Box>
              </Box>
            </Flex>
          </DrawerSection>

          {/* ── 2. About you ─────────────────────────────────────────────── */}
          <DrawerSection title="About you">
            <Box mb={3}>
              <Flex justify="space-between" mb="5px">
                <FieldLabel>Bio</FieldLabel>
                <Text fontSize="10px" color={form.bio.length > 260 ? AMBER : GRAY400} fontWeight={600}>
                  {form.bio.length}/280
                </Text>
              </Flex>
              <Textarea
                value={form.bio}
                onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value.slice(0, 280) }))}
                placeholder="Tell others about yourself…"
                rows={4}
                bg={GRAY50}
                borderColor={GRAY200}
                borderRadius="8px"
                fontSize="13px"
                resize="vertical"
                aria-label="Bio"
                aria-describedby="bio-counter"
              />
              <Text id="bio-counter" srOnly>{form.bio.length} of 280 characters used</Text>
            </Box>
          </DrawerSection>

          {/* ── 3. Avatar & accent ───────────────────────────────────────── */}
          <DrawerSection title="Avatar & Accent">
            <Flex align="center" gap={4} mb={4}>
              <Box
                w="64px"
                h="64px"
                borderRadius="full"
                overflow="hidden"
                border={`2px solid ${GRAY200}`}
                style={{ background: GRAY100, flexShrink: 0 }}
              >
                {(avatarPreview || user.avatar_url) ? (
                  <img
                    src={avatarPreview || user.avatar_url}
                    alt="Current avatar"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <Flex w="100%" h="100%" align="center" justify="center">
                    <FiUser size={24} color={GRAY400} />
                  </Flex>
                )}
              </Box>
              <Box>
                <Box
                  as="button"
                  onClick={() => avatarInputRef.current?.click()}
                  px="14px"
                  py="8px"
                  borderRadius="8px"
                  fontSize="12px"
                  fontWeight={600}
                  style={{ background: GREEN_LT, color: GREEN, border: `1px solid ${GREEN}30`, cursor: 'pointer', display: 'inline-block' }}
                >
                  Change avatar
                </Box>
                <Text fontSize="11px" color={GRAY500} mt="6px">JPG or PNG, max 5MB</Text>
              </Box>
            </Flex>

            {/* Cover photo */}
            <Box mb={4}>
              <FieldLabel>Cover photo</FieldLabel>
              <Box
                h="80px"
                borderRadius="10px"
                overflow="hidden"
                border={`1px solid ${GRAY200}`}
                mb={2}
                style={{ background: GRAY100, position: 'relative' }}
              >
                {(bannerPreview || user.banner_url) ? (
                  <img
                    src={bannerPreview || user.banner_url}
                    alt="Cover"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <Flex w="100%" h="100%" align="center" justify="center">
                    <FiImage size={22} color={GRAY400} />
                  </Flex>
                )}
              </Box>
              <Box
                as="button"
                onClick={() => bannerInputRef.current?.click()}
                px="14px"
                py="8px"
                borderRadius="8px"
                fontSize="12px"
                fontWeight={600}
                style={{ background: GREEN_LT, color: GREEN, border: `1px solid ${GREEN}30`, cursor: 'pointer', display: 'inline-block' }}
              >
                Upload cover photo
              </Box>
              <Text fontSize="11px" color={GRAY500} mt="6px">JPG or PNG, recommended 3:1 ratio</Text>
            </Box>

            {/* Accent color picker — TODO: persist to backend once field is added */}
            <Box>
              <FieldLabel>Accent color (UI preview only)</FieldLabel>
              <Flex gap={2} flexWrap="wrap">
                {ACCENT_COLORS.map((ac) => (
                  <Box
                    key={ac.value}
                    as="button"
                    w="32px"
                    h="32px"
                    borderRadius="full"
                    onClick={() => setAccentColor(ac.value)}
                    style={{
                      background: ac.value,
                      border: accentColor === ac.value ? `3px solid ${GRAY800}` : `2px solid ${GRAY200}`,
                      cursor: 'pointer',
                      transition: 'border 0.1s',
                    }}
                    aria-label={ac.name}
                    title={ac.name}
                  />
                ))}
              </Flex>
              <Text fontSize="11px" color={GRAY400} mt="6px">
                {/* TODO: wire accent color to backend when field is available */}
                Accent color is currently cosmetic only.
              </Text>
            </Box>
          </DrawerSection>

          {/* ── 4. Skills & interests ────────────────────────────────────── */}
          <DrawerSection title="Skills & Interests">
            {form.skills.length > 0 && (
              <Flex wrap="wrap" gap="6px" mb="10px">
                {form.skills.map((tag) => (
                  <Flex
                    key={tag.id}
                    align="center"
                    gap="4px"
                    px="9px"
                    py="4px"
                    borderRadius="20px"
                    fontSize="12px"
                    fontWeight={500}
                    style={{ background: GREEN_LT, color: GREEN, border: `1px solid ${GREEN}40` }}
                  >
                    <FiTag size={10} />
                    {tag.name}
                    <Box
                      as="button"
                      ml="2px"
                      onClick={() => setForm((f) => ({ ...f, skills: f.skills.filter((t) => t.id !== tag.id) }))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: GREEN, padding: 0, display: 'flex', lineHeight: 1 }}
                      aria-label={`Remove ${tag.name}`}
                    >
                      <FiX size={11} />
                    </Box>
                  </Flex>
                ))}
              </Flex>
            )}
            <WikidataTagAutocomplete
              selectedTags={form.skills}
              onAddTag={(tag) =>
                setForm((f) => ({
                  ...f,
                  skills: f.skills.some((t) => t.id === tag.id) ? f.skills : [...f.skills, tag],
                }))
              }
              disabled={form.skills.length >= 15}
              accent={GREEN}
            />
            <Text fontSize="11px" color={GRAY400} mt="4px">{form.skills.length}/15 tags</Text>
          </DrawerSection>

          {/* ── 5. Showcase badges ───────────────────────────────────────── */}
          <DrawerSection title="Showcase badges">
            {featuredBadgesError && (
              <Flex
                align="center"
                gap={2}
                px={3}
                py="10px"
                mb={3}
                borderRadius="8px"
                bg={RED_LT}
                border={`1px solid ${RED}30`}
              >
                <FiAlertCircle size={14} color={RED} />
                <Text fontSize="12px" color={RED}>{featuredBadgesError}</Text>
              </Flex>
            )}
            <BadgeShowcase
              variant="picker"
              allBadges={badgeProgress}
              selected={form.featured_badges}
              onChange={(ids) => setForm((f) => ({ ...f, featured_badges: ids }))}
            />
          </DrawerSection>

          {/* ── 6. Account & privacy ─────────────────────────────────────── */}
          <DrawerSection title="Account & Privacy">
            {/* Show history toggle */}
            <Flex
              align="center"
              gap={3}
              mb={4}
              style={{ cursor: 'pointer' }}
              onClick={() => setForm((f) => ({ ...f, show_history: !f.show_history }))}
            >
              <Box
                w="18px"
                h="18px"
                borderRadius="4px"
                flexShrink={0}
                style={{
                  background: form.show_history ? GREEN : WHITE,
                  border: `2px solid ${form.show_history ? GREEN : GRAY300}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {form.show_history && (
                  <Box w="8px" h="8px" borderRadius="2px" style={{ background: WHITE }} />
                )}
              </Box>
              <Box>
                <Text fontSize="13px" fontWeight={600} color={GRAY700}>Show exchange history on public profile</Text>
                <Text fontSize="11px" color={GRAY500}>Others can see your completed exchanges.</Text>
              </Box>
            </Flex>

            {/* Account links */}
            <Flex direction="column" gap={2}>
              <a
                href="/change-email"
                style={{ fontSize: '13px', fontWeight: 600, color: GREEN, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                Change email address →
              </a>
              {/* Change password: navigates to own profile settings tab where password change lives */}
              <Box
                as="button"
                style={{ fontSize: '13px', fontWeight: 600, color: GREEN, background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px', padding: 0, textAlign: 'left' }}
                onClick={() => { onClose(); navigate('/profile') }}
              >
                Change password →
              </Box>
            </Flex>
          </DrawerSection>
              </Drawer.Body>

              {/* Sticky footer */}
              <Drawer.Footer
                px={5}
                py={4}
                borderTop={`1px solid ${GRAY200}`}
                flexShrink={0}
                bg={WHITE}
              >
                <Flex align="center" justify="flex-end" gap={2} w="100%">
                  <Box
                    as="button"
                    onClick={handleClose}
                    px="16px"
                    py="9px"
                    borderRadius="8px"
                    fontSize="13px"
                    fontWeight={600}
                    style={{ background: GRAY100, color: GRAY700, border: 'none', cursor: 'pointer' }}
                  >
                    Cancel
                  </Box>
                  <Box
                    as="button"
                    data-testid="save-changes-btn"
                    onClick={dirty && !saving ? handleSave : undefined}
                    aria-disabled={!dirty || saving}
                    px="16px"
                    py="9px"
                    borderRadius="8px"
                    fontSize="13px"
                    fontWeight={600}
                    style={{
                      background: dirty && !saving ? GREEN : GRAY200,
                      color: dirty && !saving ? WHITE : GRAY500,
                      border: 'none',
                      cursor: dirty && !saving ? 'pointer' : 'not-allowed',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'background 0.12s',
                    }}
                  >
                    {saving && <Spinner size="xs" />}
                    Save changes
                  </Box>
                </Flex>
              </Drawer.Footer>
            </Drawer.Content>
          </Drawer.Positioner>
        </Portal>
      </Drawer.Root>
    </>
  )
}

export default ProfileEditDrawer
