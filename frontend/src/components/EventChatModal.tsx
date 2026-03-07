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

interface EventChatPanelProps {
  service: Service
  onReportUser?: (userId: string, userName: string) => void
  reportingIssue?: boolean
  autoFocus?: boolean
}

interface EventChatModalProps extends EventChatPanelProps {
  isOpen: boolean
  onClose: () => void
}

function appendUniqueMessage(messages: PublicChatMessage[], incoming: PublicChatMessage) {
  if (messages.some((message) => message.id === incoming.id)) return messages
  return [...messages, incoming]
}

export function EventChatPanel({
  service,
  onReportUser,
  reportingIssue = false,
  autoFocus = true,
}: EventChatPanelProps) {
  const { user } = useAuthStore()
  const [messages, setMessages] = useState<PublicChatMessage[]>([])
  const [roomId, setRoomId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [fetchDone, setFetchDone] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const organizerId = service.user?.id ?? (service as unknown as { provider?: { id: string } }).provider?.id

  useEffect(() => {
    const ac = new AbortController()
    let cancelled = false

    eventChatAPI.getMessages(service.id, ac.signal)
      .then(({ room, messages: fetchedMessages }) => {
        if (cancelled) return
        setRoomId(room.id)
        setMessages(fetchedMessages.slice().reverse())
      })
      .catch((err) => {
        if (!ac.signal.aborted) {
          console.error('Failed to load event chat:', err)
          toast.error('Failed to load event chat')
        }
      })
      .finally(() => {
        if (!cancelled) setFetchDone(true)
      })

    return () => {
      cancelled = true
      ac.abort()
    }
  }, [service.id])

  const handleWsMessage = useCallback((message: PublicChatMessage) => {
    setMessages((prev) => appendUniqueMessage(prev, message))
  }, [])

  const wsUrl = roomId ? buildEventChatWsUrl(roomId) : ''
  const { isConnected, sendMessage: wsSend } = useWebSocket({
    url: wsUrl,
    onMessage: handleWsMessage,
    enabled: !!roomId,
  })

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

  useEffect(() => {
    if (!autoFocus || !inputRef.current) return
    const timeout = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(timeout)
  }, [autoFocus, roomId])

  const handleSend = async () => {
    const body = draft.trim()
    if (!body || isSending) return

    setDraft('')
    setIsSending(true)

    const sent = wsSend(body)
    if (!sent) {
      try {
        const message = await eventChatAPI.sendMessage(service.id, body)
        setMessages((prev) => appendUniqueMessage(prev, message))
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
      void handleSend()
    }
  }

  return (
    <Flex direction="column" h="100%" minH={0}>
      <Flex align="center" justify="space-between" gap={3} px={5} py={3} bg={GRAY50}
        borderBottom={`1px solid ${GRAY100}`}
      >
        <Flex align="center" gap={2} minW={0}>
          <FiUsers size={12} color={GRAY400} />
          <Text fontSize="11px" color={GRAY500}
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {service.participant_count ?? 0}/{service.max_participants} participants · Organizer &amp; participants can chat here
          </Text>
        </Flex>
        <Flex align="center" gap={2} color={isConnected ? GREEN : GRAY400} flexShrink={0}
          title={isConnected ? 'Connected' : 'Connecting…'}
        >
          {isConnected ? <FiWifi size={14} /> : <FiWifiOff size={14} />}
          <Text fontSize="11px" fontWeight={700}>{isConnected ? 'Live' : 'Retrying'}</Text>
        </Flex>
      </Flex>

      <Box flex={1} minH={0} overflowY="auto" px={5} py={4}>
        {!fetchDone ? (
          <Flex align="center" justify="center" h="100%">
            <Text fontSize="13px" color={GRAY400}>Loading messages…</Text>
          </Flex>
        ) : messages.length === 0 ? (
          <Flex direction="column" align="center" justify="center" h="100%" gap={3}>
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
            {messages.map((message) => {
              const isMe = message.sender_id === user?.id
              const isOrganizer = message.sender_id === organizerId
              const canReportSender = !isMe && !!onReportUser && !!message.sender_id

              return (
                <Box
                  key={message.id}
                  display="flex"
                  flexDirection={isMe ? 'row-reverse' : 'row'}
                  alignItems="flex-end"
                  gap={2}
                  mb={1}
                >
                  {!isMe && (
                    <Avatar name={message.sender_name || '?'} size={28} bg={isOrganizer ? AMBER : GRAY400} />
                  )}
                  <Box maxW="75%">
                    {!isMe && (
                      <Flex align="center" gap={2} mb="2px" ml="2px">
                        <Text fontSize="11px" fontWeight={600} color={isOrganizer ? AMBER : GRAY700}>
                          {message.sender_name}
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
                      </Flex>
                    )}
                    <Box
                      px={3}
                      py={2}
                      borderRadius="16px"
                      bg={isMe ? AMBER : GRAY50}
                      color={isMe ? WHITE : GRAY800}
                      border={isMe ? 'none' : `1px solid ${GRAY100}`}
                    >
                      <Text fontSize="13px" lineHeight={1.45} whiteSpace="pre-wrap">{message.body}</Text>
                    </Box>
                    <Flex align="center" justify={isMe ? 'flex-end' : 'space-between'} mt="3px" px="4px" gap={3}>
                      <Text fontSize="10px" color={GRAY400}>
                        {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      {!isMe && canReportSender && (
                        <Box
                          as="button"
                          display="inline-flex"
                          alignItems="center"
                          gap={1}
                          fontSize="10px"
                          fontWeight={600}
                          color={reportingIssue ? GRAY400 : RED}
                          onClick={() => {
                            if (!reportingIssue) onReportUser?.(message.sender_id, message.sender_name)
                          }}
                          style={{ background: 'none', border: 'none', cursor: reportingIssue ? 'not-allowed' : 'pointer', opacity: reportingIssue ? 0.6 : 1 }}
                        >
                          <FiFlag size={10} />
                          Report
                        </Box>
                      )}
                    </Flex>
                  </Box>
                </Box>
              )
            })}
            <div ref={bottomRef} />
          </Stack>
        )}
      </Box>

      <Box px={5} py={4} borderTop={`1px solid ${GRAY100}`}>
        <Flex gap={3} align="flex-end">
          <Textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message the event…"
            resize="none"
            minH="96px"
            bg={WHITE}
            borderColor={GRAY200}
            _focusVisible={{ borderColor: AMBER, boxShadow: `0 0 0 1px ${AMBER}` }}
          />
          <Box
            as="button"
            w="44px"
            h="44px"
            borderRadius="12px"
            bg={draft.trim() ? AMBER : GRAY100}
            color={draft.trim() ? WHITE : GRAY400}
            display="flex"
            alignItems="center"
            justifyContent="center"
            onClick={() => { void handleSend() }}
            aria-label="Send event message"
            style={{ border: 'none', cursor: draft.trim() && !isSending ? 'pointer' : 'not-allowed', opacity: isSending ? 0.7 : 1, flexShrink: 0 }}
          >
            <FiSend size={16} />
          </Box>
        </Flex>
      </Box>
    </Flex>
  )
}

export default function EventChatModal({ isOpen, onClose, service, onReportUser, reportingIssue = false }: EventChatModalProps) {
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
          <Box
            as="button" onClick={onClose}
            w="30px" h="30px" borderRadius="8px" bg={WHITE}
            display="flex" alignItems="center" justifyContent="center"
            style={{ border: `1px solid ${GRAY200}`, cursor: 'pointer' }}
          >
            <FiX size={14} color={GRAY500} />
          </Box>
        </Flex>

        <Box flex={1} minH={0}>
          <EventChatPanel key={service.id} service={service} onReportUser={onReportUser} reportingIssue={reportingIssue} />
        </Box>
      </Box>
    </Box>
  )
}
