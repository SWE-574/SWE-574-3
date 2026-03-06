import { useState, useEffect, useRef, useCallback, type KeyboardEvent, type MouseEvent } from 'react'
import { Box, Flex, Stack, Text, Textarea } from '@chakra-ui/react'
import { FiX, FiSend, FiMessageSquare, FiUsers, FiWifi, FiWifiOff, FiFlag } from 'react-icons/fi'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/useAuthStore'
import { eventChatAPI, buildEventChatWsUrl } from '@/services/conversationAPI'
import type { PublicChatMessage } from '@/services/conversationAPI'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { Service } from '@/types'

import {
  AMBER, AMBER_LT,
  GREEN,
  RED,
  GRAY50, GRAY100, GRAY200, GRAY400, GRAY500, GRAY700, GRAY800,
  WHITE,
} from '@/theme/tokens'

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 30, bg = AMBER }: { name: string; size?: number; bg?: string }) {
  const initials = name.split(' ').map((n) => n[0] ?? '').join('').toUpperCase().slice(0, 2)
  return (
    <Box w={`${size}px`} h={`${size}px`} borderRadius="full" bg={bg} color={WHITE}
      display="flex" alignItems="center" justifyContent="center"
      fontSize={`${Math.round(size * 0.38)}px`} fontWeight={700} flexShrink={0}
    >
      {initials}
    </Box>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean
  onClose: () => void
  service: Service
  onReportUser?: (userId: string, userName: string) => void
  reportingIssue?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EventChatModal({
  isOpen,
  onClose,
  service,
  onReportUser,
  reportingIssue = false,
}: Props) {
  const { user } = useAuthStore()
  const [messages, setMessages] = useState<PublicChatMessage[]>([])
  const [roomId, setRoomId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [fetchDone, setFetchDone] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const isLoading = isOpen && !fetchDone
  const organizerId = service.user?.id ?? (service as unknown as { provider?: { id: string } }).provider?.id

  // ── Fetch messages on open ────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) {
      // Cleanup runs async (after render), so this is safe
      return () => { setFetchDone(false) }
    }
    const ac = new AbortController()
    let cancelled = false
    eventChatAPI.getMessages(service.id, ac.signal)
      .then(({ room, messages: msgs }) => {
        if (cancelled) return
        setRoomId(room.id)
        setMessages(msgs.slice().reverse()) // API returns newest-first; we want chronological
      })
      .catch((err) => {
        if (!ac.signal.aborted) {
          console.error('Failed to load event chat:', err)
          toast.error('Failed to load event chat')
        }
      })
      .finally(() => { if (!cancelled) setFetchDone(true) })
    return () => { cancelled = true; ac.abort() }
  }, [isOpen, service.id])

  // ── WebSocket ─────────────────────────────────────────────────────────────

  const handleWsMessage = useCallback((msg: PublicChatMessage) => {
    setMessages((prev: PublicChatMessage[]) => {
      // Deduplicate by id
      if (prev.some((m: PublicChatMessage) => m.id === msg.id)) return prev
      return [...prev, msg]
    })
  }, [])

  const wsUrl = roomId ? buildEventChatWsUrl(roomId) : ''
  const { isConnected, sendMessage: wsSend } = useWebSocket({
    url: wsUrl,
    onMessage: handleWsMessage,
    enabled: isOpen && !!roomId,
  })

  // ── Auto-scroll ───────────────────────────────────────────────────────────

  useEffect(() => {
    const el = bottomRef.current
    if (!el) return
    let node: HTMLElement | null = el.parentElement
    while (node) {
      if (node.scrollHeight > node.clientHeight) {
        node.scrollTop = node.scrollHeight
        return
      }
      node = node.parentElement
    }
  }, [messages])

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [isOpen, roomId])

  // ── Send message ──────────────────────────────────────────────────────────

  const handleSend = async () => {
    const body = draft.trim()
    if (!body || isSending) return
    setDraft('')
    setIsSending(true)

    // Try WebSocket first
    const sent = wsSend(body)
    if (!sent) {
      // Fallback to REST
      try {
        const msg = await eventChatAPI.sendMessage(service.id, body)
        setMessages((prev: PublicChatMessage[]) => {
          if (prev.some((m: PublicChatMessage) => m.id === msg.id)) return prev
          return [...prev, msg]
        })
      } catch {
        toast.error('Failed to send message')
        setDraft(body)
      }
    }
    setIsSending(false)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isOpen) return null

  return (
    <Box
      position="fixed" inset={0} zIndex={1000}
      bg="rgba(0,0,0,0.55)"
      display="flex" alignItems="center" justifyContent="center"
      p={4}
      onClick={onClose}
    >
      <Box
        bg={WHITE} borderRadius="20px" w="100%" maxW="560px"
        boxShadow="0 20px 60px rgba(0,0,0,0.2)"
        onClick={(e: MouseEvent) => e.stopPropagation()}
        h="min(85vh, 700px)" display="flex" flexDirection="column"
      >
        {/* Header */}
        <Flex align="center" justify="space-between" px={6} py={4}
          borderBottom={`1px solid ${GRAY100}`}
          bg={AMBER_LT} borderTopRadius="20px"
        >
          <Flex align="center" gap={3}>
            <Box w="36px" h="36px" borderRadius="10px" bg={AMBER} color={WHITE}
              display="flex" alignItems="center" justifyContent="center"
            >
              <FiMessageSquare size={16} />
            </Box>
            <Box>
              <Text fontSize="15px" fontWeight={800} color={GRAY800}>Event Chat</Text>
              <Text fontSize="11px" color={GRAY500} mt="1px"
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}
              >
                {service.title}
              </Text>
            </Box>
          </Flex>
          <Flex align="center" gap={3}>
            {/* Connection indicator */}
            <Box color={isConnected ? GREEN : GRAY400} title={isConnected ? 'Connected' : 'Connecting…'}>
              {isConnected ? <FiWifi size={14} /> : <FiWifiOff size={14} />}
            </Box>
            <Box
              as="button" onClick={onClose}
              w="30px" h="30px" borderRadius="8px" bg={WHITE}
              display="flex" alignItems="center" justifyContent="center"
              style={{ border: `1px solid ${GRAY200}`, cursor: 'pointer' }}
            >
              <FiX size={14} color={GRAY500} />
            </Box>
          </Flex>
        </Flex>

        {/* Participant hint */}
        <Flex align="center" gap={2} px={6} py="8px" bg={GRAY50}
          borderBottom={`1px solid ${GRAY100}`}
        >
          <FiUsers size={11} color={GRAY400} />
          <Text fontSize="11px" color={GRAY500}>
            {service.participant_count ?? 0}/{service.max_participants} participants
            {' · '}Organizer &amp; participants can chat here
          </Text>
        </Flex>

        {/* Messages area */}
        <Box flex={1} overflowY="auto" px={5} py={4}>
          {isLoading ? (
            <Flex align="center" justify="center" h="full">
              <Text fontSize="13px" color={GRAY400}>Loading messages…</Text>
            </Flex>
          ) : messages.length === 0 ? (
            <Flex direction="column" align="center" justify="center" h="full" gap={3}>
              <Box w="48px" h="48px" borderRadius="full" bg={AMBER_LT}
                display="flex" alignItems="center" justifyContent="center"
                color={AMBER} fontSize="22px"
              >
                <FiMessageSquare />
              </Box>
              <Text fontSize="13px" color={GRAY400} textAlign="center">
                No messages yet. Start the conversation!
              </Text>
            </Flex>
          ) : (
            <Stack gap={1}>
              {messages.map((msg: PublicChatMessage) => {
                const isMe = msg.sender_id === user?.id
                const isOrganizer = msg.sender_id === organizerId
                const canReportSender = !isMe && !!onReportUser && !!msg.sender_id
                return (
                  <Box
                    key={msg.id}
                    display="flex"
                    flexDirection={isMe ? 'row-reverse' : 'row'}
                    alignItems="flex-end"
                    gap={2}
                    mb={1}
                  >
                    {!isMe && (
                      <Avatar
                        name={msg.sender_name || '?'}
                        size={28}
                        bg={isOrganizer ? AMBER : GRAY400}
                      />
                    )}
                    <Box maxW="75%">
                      {!isMe && (
                        <Flex align="center" gap={2} mb="2px" ml="2px">
                          <Text fontSize="11px" fontWeight={600}
                            color={isOrganizer ? AMBER : GRAY700}
                          >
                            {msg.sender_name}
                          </Text>
                          {isOrganizer && (
                            <Box px="5px" py="1px" borderRadius="full"
                              fontSize="9px" fontWeight={700}
                              bg={AMBER_LT} color={AMBER}
                              border={`1px solid ${AMBER}30`}
                            >
                              Organizer
                            </Box>
                          )}
                          {canReportSender && (
                            <Box
                              as="button"
                              display="inline-flex"
                              alignItems="center"
                              gap={1}
                              fontSize="10px"
                              fontWeight={600}
                              color={reportingIssue ? GRAY400 : GRAY500}
                              onClick={() => {
                                if (!reportingIssue && onReportUser) {
                                  onReportUser(msg.sender_id, msg.sender_name || 'this user')
                                }
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: reportingIssue ? 'not-allowed' : 'pointer',
                                opacity: reportingIssue ? 0.7 : 1,
                              }}
                              onMouseEnter={(e) => {
                                if (!reportingIssue) {
                                  (e.currentTarget as unknown as HTMLButtonElement).style.color = RED
                                }
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as unknown as HTMLButtonElement).style.color = reportingIssue ? GRAY400 : GRAY500
                              }}
                            >
                              <FiFlag size={10} />
                              {'Report user'}
                            </Box>
                          )}
                        </Flex>
                      )}
                      <Box
                        px="12px" py="8px"
                        borderRadius={isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px'}
                        bg={isMe ? AMBER : GRAY100}
                        color={isMe ? WHITE : GRAY800}
                        fontSize="13px"
                        lineHeight={1.5}
                        style={{ wordBreak: 'break-word' }}
                      >
                        {msg.body}
                      </Box>
                      <Text
                        fontSize="10px" color={GRAY400} mt="2px"
                        textAlign={isMe ? 'right' : 'left'}
                        px="4px"
                      >
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </Box>
                  </Box>
                )
              })}
              <Box ref={bottomRef} />
            </Stack>
          )}
        </Box>

        {/* Input area */}
        <Flex gap={2} px={5} py={4} borderTop={`1px solid ${GRAY100}`} bg={GRAY50}
          borderBottomRadius="20px" align="flex-end"
        >
          <Textarea
            ref={inputRef}
            value={draft}
            onChange={(e: { target: { value: string } }) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            rows={1}
            resize="none"
            fontSize="13px"
            bg={WHITE}
            border={`1px solid ${GRAY200}`}
            borderRadius="12px"
            px="14px" py="10px"
            _focus={{ borderColor: AMBER, boxShadow: `0 0 0 2px ${AMBER}18` }}
            style={{ minHeight: '42px', maxHeight: '100px' }}
          />
          <Box
            as="button"
            w="42px" h="42px" minW="42px"
            borderRadius="12px"
            bg={draft.trim() ? AMBER : GRAY200}
            color={draft.trim() ? WHITE : GRAY400}
            display="flex" alignItems="center" justifyContent="center"
            onClick={handleSend}
            style={{
              border: 'none',
              cursor: draft.trim() && !isSending ? 'pointer' : 'not-allowed',
              opacity: isSending ? 0.7 : 1,
              transition: 'background 0.15s, opacity 0.15s',
            }}
          >
            <FiSend size={16} />
          </Box>
        </Flex>
      </Box>
    </Box>
  )
}
