import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  useRoute,
  useNavigation,
  type CompositeNavigationProp,
} from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { MessagesStackParamList } from "../../navigation/MessagesStack";
import type { BottomTabParamList } from "../../navigation/BottomTabNavigator";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  normalizeMessage,
  type ChatMessageApi,
  type ChatMessagesResponse,
} from "../../api/chatMessages";
import { getChat } from "../../api/chats";
import { initiateHandshake, reportHandshake } from "../../api/handshakes";
import { colors } from "../../constants/colors";
import { useAuth } from "../../context/AuthContext";
import { formatStatusLabel } from "../../utils/chatUtils";
import type { Handshake } from "../../api/handshakes";
import type {
  ActionType,
  ChatMessageWithMeta,
  NavProps,
} from "../../types/chatTypes";

type ChatScreenNavigation = CompositeNavigationProp<
  NativeStackNavigationProp<MessagesStackParamList, "Chat">,
  BottomTabNavigationProp<BottomTabParamList>
>;
import { useChatWebSocket } from "../../hooks/useChatWebSocket";
import { useHandshake } from "../../hooks/useHandshake";
import { ChatMessageBubble } from "../components/chat/ChatMessageBubble";
import { ChatHandshakeBanner } from "../components/chat/ChatHandshakeBanner";
import type { SessionDetails } from "../components/chat/ChatHandshakeBanner";
import { ChatApproveDetailsModal } from "../components/chat/ChatApproveDetailsModal";
import { ChatSessionDetailsModal } from "../components/chat/ChatSessionDetailsModal";
import { ChatEvaluationModal } from "../components/chat/ChatEvaluationModal";
import { ChatInitiateHandshakeModal } from "../components/chat/ChatInitiateHandshakeModal";
import { ChatInputBar } from "../components/chat/ChatInputBar";
import { ChatTopMeta } from "../components/chat/ChatTopMeta";
import { ChatStepBar } from "../components/chat/ChatStepBar";

export default function ChatScreen() {
  const { params } = useRoute<NavProps["route"]>();
  const navigation = useNavigation<ChatScreenNavigation>();
  const { user } = useAuth();

  const {
    handshakeId,
    serviceId,
    otherUserName,
    serviceTitle,
    otherUserId,
    otherUserAvatarUrl,
    isProvider,
    serviceType,
    scheduleType,
    maxParticipants,
    serviceLocationType,
    serviceLocationArea,
    serviceExactLocation,
    serviceLocationGuide,
    serviceScheduledTime,
    provisionedHours,
  } = params ?? {
    handshakeId: "",
    serviceId: undefined,
    otherUserName: "Chat",
    serviceTitle: undefined,
    otherUserId: undefined,
    otherUserAvatarUrl: undefined,
    isProvider: undefined,
    serviceType: undefined,
    scheduleType: undefined,
    maxParticipants: undefined,
    serviceLocationType: undefined,
    serviceLocationArea: undefined,
    serviceExactLocation: undefined,
    serviceLocationGuide: undefined,
    serviceScheduledTime: undefined,
    provisionedHours: undefined,
  };

  const [messages, setMessages] = useState<ChatMessageWithMeta[]>([]);
  const [inputText, setInputText] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [handshake, setHandshake] = useState<Handshake | null>(null);
  const [handshakeLoading, setHandshakeLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<ActionType | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showInitiateModal, setShowInitiateModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showSessionDetailsModal, setShowSessionDetailsModal] = useState(false);
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);

  const listRef = useRef<FlatList<ChatMessageWithMeta>>(null);

  const currentUserId = user?.id ? String(user.id) : undefined;
  const currentUserEmail = user?.email;
  const handshakeRecord = handshake as Record<string, unknown> | null;

  const title = useMemo(
    () => serviceTitle || otherUserName || "Messages",
    [otherUserName, serviceTitle],
  );
  const isCurrentUserServiceOwner = useMemo(() => {
    const liveServiceType =
      typeof handshakeRecord?.service_type === "string"
        ? handshakeRecord.service_type
        : serviceType;
    const liveIsCurrentUserProvider =
      typeof handshakeRecord?.is_current_user_provider === "boolean"
        ? (handshakeRecord.is_current_user_provider as boolean)
        : isProvider;

    if (typeof liveIsCurrentUserProvider !== "boolean") return false;
    const isOffer =
      liveServiceType?.toLowerCase() !== "need" &&
      liveServiceType?.toLowerCase() !== "want";
    return isOffer ? liveIsCurrentUserProvider : !liveIsCurrentUserProvider;
  }, [handshakeRecord, isProvider, serviceType]);

  const openOtherUserPublicProfile = useCallback(() => {
    if (!otherUserId) return;
    // Navigate within the Messages stack so a proper back button is rendered
    navigation.navigate("UserPublicProfile", { userId: otherUserId });
  }, [navigation, otherUserId]);

  const openServiceDetail = useCallback(() => {
    if (!serviceId) return;
    navigation.navigate("ServiceDetail", { id: serviceId });
  }, [navigation, serviceId]);

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const normalizeIncomingMessage = useCallback(
    (raw: Record<string, unknown>): ChatMessageWithMeta => {
      return normalizeMessage(raw) as ChatMessageWithMeta;
    },
    [],
  );

  const dedupeMessages = useCallback((items: ChatMessageWithMeta[]) => {
    const map = new Map<string, ChatMessageWithMeta>();
    for (const item of items) {
      map.set(item.id, item);
    }
    return Array.from(map.values()).sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return aTime - bTime;
    });
  }, []);

  const sameLogicalMessage = useCallback(
    (a: ChatMessageWithMeta, b: ChatMessageWithMeta) => {
      const aText = (a.body ?? a.content ?? "").trim();
      const bText = (b.body ?? b.content ?? "").trim();
      const sameSender =
        (!!a.sender_id && !!b.sender_id && a.sender_id === b.sender_id) ||
        (!!a.sender && !!b.sender && a.sender === b.sender);
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return sameSender && aText === bText && Math.abs(aTime - bTime) < 15000;
    },
    [],
  );

  const mergeIncomingMessage = useCallback(
    (prev: ChatMessageWithMeta[], incoming: ChatMessageWithMeta) => {
      const next = [...prev];
      const pendingIndex = next.findIndex(
        (m) => m.pending && sameLogicalMessage(m, incoming),
      );
      if (pendingIndex !== -1) {
        next[pendingIndex] = { ...incoming, pending: false };
        return dedupeMessages(next);
      }
      return dedupeMessages([...next, incoming]);
    },
    [dedupeMessages, sameLogicalMessage],
  );

  const loadMessages = useCallback(async () => {
    if (!handshakeId) return;
    try {
      setLoadingMessages(true);
      const data = (await getChat(handshakeId)) as unknown;
      const results = Array.isArray((data as { results?: unknown[] }).results)
        ? (data as ChatMessagesResponse).results
        : [];
      const normalized = results.map(
        (m: ChatMessageApi | Record<string, unknown>) =>
          normalizeIncomingMessage(m as Record<string, unknown>),
      );
      setMessages(dedupeMessages(normalized));
      scrollToBottom(false);
    } catch (e) {
      console.error("Failed to load messages:", e);
    } finally {
      setLoadingMessages(false);
    }
  }, [dedupeMessages, handshakeId, normalizeIncomingMessage, scrollToBottom]);

  const {
    handshakeStatus,
    canSendMessages,
    canInitiatePending,
    canApprovePending,
    canCancelPending,
    canConfirmCompletion,
    canRequestCancellation,
    canRespondToCancellation,
    cancellationRequestedByName,
    hasCancellationRequest,
    isAwaitingSecondConfirmationLike,
    isPendingLike,
    isAcceptedLike,
    isCompletedLike,
    isClosedLike,
    providerInitiated,
    loadHandshake,
    runHandshakeAction,
    handshakeBanner,
  } = useHandshake({
    handshakeId,
    handshake,
    isCurrentUserServiceOwner,
    setHandshake,
    handshakeLoading,
    setHandshakeLoading,
    actionLoading,
    setActionLoading,
    actionError,
    setActionError,
    currentUserId,
    currentUserEmail,
  });

  const {
    connected,
    error,
    setError,
    sendMessage: wsSendMessage,
    reconnectAttempts,
  } = useChatWebSocket({
    handshakeId,
    setMessages,
    setHandshake,
    mergeIncomingMessage,
    normalizeIncomingMessage,
    loadMessages,
    loadHandshake,
    scrollToBottom,
  });

  useEffect(() => {
    loadHandshake();
  }, [loadHandshake]);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitleText} numberOfLines={1}>
            {title}
          </Text>
          {!!serviceType ? (
            <View style={styles.headerTypeBadge}>
              <Text style={styles.headerTypeBadgeText}>{serviceType}</Text>
            </View>
          ) : null}
        </View>
      ),
      headerBackTitle: "Back",
    });
  }, [navigation, serviceType, title]);

  const sessionDetails = useMemo<SessionDetails | null>(() => {
    if (!handshake) return null;
    const shouldShowDetails = isAcceptedLike || (isPendingLike && providerInitiated);
    if (!shouldShowDetails) return null;
    const h = handshake as Record<string, unknown>;
    return {
      exact_location: (h.exact_location as string | null) ?? null,
      scheduled_time: (h.scheduled_time as string | null) ?? null,
      exact_duration: (h.exact_duration as number | null) ?? null,
      provisioned_hours: (h.provisioned_hours as number | null) ?? null,
      exact_location_maps_url:
        (h.exact_location_maps_url as string | null) ?? null,
      exact_location_guide:
        (h.exact_location_guide as string | null) ?? null,
      is_online: (h.service_location_type as string | null) === "Online",
    };
  }, [handshake, isAcceptedLike, isPendingLike, providerInitiated]);

  const completionState = useMemo(() => {
    if (!handshake) {
      return {
        myConfirmed: false,
        otherConfirmed: false,
        counterpartName: otherUserName,
      };
    }

    const h = handshake as Record<string, unknown>;
    const isCurrentUserProvider =
      typeof h.is_current_user_provider === "boolean"
        ? (h.is_current_user_provider as boolean)
        : typeof isProvider === "boolean"
          ? isProvider
          : false;
    const providerConfirmed = !!h.provider_confirmed_complete;
    const receiverConfirmed = !!h.receiver_confirmed_complete;
    const counterpart = h.counterpart as
      | { first_name?: string; last_name?: string; email?: string }
      | undefined;
    const counterpartName =
      [counterpart?.first_name, counterpart?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      counterpart?.email ||
      otherUserName;

    return {
      myConfirmed: isCurrentUserProvider ? providerConfirmed : receiverConfirmed,
      otherConfirmed: isCurrentUserProvider ? receiverConfirmed : providerConfirmed,
      counterpartName,
    };
  }, [handshake, isProvider, otherUserName]);

  const displayHandshakeBanner = useMemo(() => {
    if (hasCancellationRequest) {
      return {
        tone: "danger" as const,
        title: "Cancellation requested",
        description: cancellationRequestedByName
          ? `${cancellationRequestedByName} requested cancellation for this exchange.`
          : "There is an active cancellation request for this exchange.",
      };
    }

    if (completionState.myConfirmed || completionState.otherConfirmed) {
      return {
        tone: "success" as const,
        title: "Exchange completed",
        description:
          completionState.myConfirmed && completionState.otherConfirmed
            ? "Both sides confirmed completion."
            : "The exchange has entered the completion stage. Open details to review the final actions.",
      };
    }

    return handshakeBanner;
  }, [
    cancellationRequestedByName,
    completionState.myConfirmed,
    completionState.otherConfirmed,
    handshakeBanner,
    hasCancellationRequest,
  ]);

  const evaluationWindow = useMemo(() => {
    const h = handshake as Record<string, unknown> | null;
    const userHasReviewed = Boolean(h?.user_has_reviewed);
    const liveServiceType =
      typeof h?.service_type === "string" ? h.service_type : serviceType;
    const isEventEvaluation = String(liveServiceType ?? "").toLowerCase() === "event";
    const statusValue = typeof h?.status === "string" ? h.status.toLowerCase() : "";
    const eligibleStatus = statusValue === "completed";

    if (!eligibleStatus || userHasReviewed) {
      return {
        isOpen: false,
        label: userHasReviewed ? "Already reviewed" : null,
        isEventEvaluation,
        userHasReviewed,
      };
    }

    let deadlineMs: number | null = null;
    if (typeof h?.evaluation_window_ends_at === "string" && h.evaluation_window_ends_at) {
      const parsed = new Date(h.evaluation_window_ends_at).getTime();
      if (!Number.isNaN(parsed)) deadlineMs = parsed;
    } else if (
      typeof h?.evaluation_window_starts_at === "string" &&
      h.evaluation_window_starts_at
    ) {
      const start = new Date(h.evaluation_window_starts_at).getTime();
      if (!Number.isNaN(start)) deadlineMs = start + 48 * 60 * 60 * 1000;
    }

    if (typeof h?.evaluation_window_closed_at === "string" && h.evaluation_window_closed_at) {
      return {
        isOpen: false,
        label: "Evaluation window closed",
        isEventEvaluation,
        userHasReviewed,
      };
    }

    if (deadlineMs == null) {
      return {
        isOpen: true,
        label: "48h window active",
        isEventEvaluation,
        userHasReviewed,
      };
    }

    const remainingMs = deadlineMs - Date.now();
    if (remainingMs <= 0) {
      return {
        isOpen: false,
        label: "Evaluation window closed",
        isEventEvaluation,
        userHasReviewed,
      };
    }

    const totalMinutes = Math.ceil(remainingMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return {
      isOpen: true,
      label: `${hours}h ${minutes}m left`,
      isEventEvaluation,
      userHasReviewed,
    };
  }, [handshake, serviceType]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadMessages(), loadHandshake()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadHandshake, loadMessages]);

  const handleInitiateHandshake = useCallback(
    async (payload: {
      exact_location: string;
      exact_duration: number;
      scheduled_time: string;
      exact_location_lat?: number;
      exact_location_lng?: number;
    }) => {
      setActionError(null);
      setActionLoading("initiate");
      try {
        const updated = await initiateHandshake(handshakeId, payload);
        setHandshake(updated);
        await Promise.all([loadHandshake(), loadMessages()]);
      } catch (e) {
        console.error("Failed to initiate handshake:", e);
        const message =
          e instanceof Error ? e.message : "Failed to initiate handshake.";
        setActionError(message);
        throw e;
      } finally {
        setActionLoading(null);
      }
    },
    [handshakeId, loadHandshake, loadMessages],
  );

  const handleReportParticipant = useCallback(async () => {
    if (!handshakeId || actionLoading) return;
    setActionError(null);
    setActionLoading("reportParticipant");
    try {
      await reportHandshake(handshakeId, {
        issue_type: "other",
        description: "",
      });
      await Promise.all([loadHandshake(), loadMessages()]);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to report participant.";
      setActionError(message);
    } finally {
      setActionLoading(null);
    }
  }, [actionLoading, handshakeId, loadHandshake, loadMessages]);

  const sendMessage = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;

    if (!canSendMessages) {
      setError("You cannot send messages for this exchange anymore.");
      return;
    }

    if (!connected) {
      setError("Socket is not connected.");
      return;
    }

    const now = new Date().toISOString();
    const pendingId = `pending-${Date.now()}`;
    const displayName = user
      ? [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
        user.email ||
        "You"
      : "You";

    const optimistic: ChatMessageWithMeta = {
      id: pendingId,
      body: text,
      content: text,
      created_at: now,
      sender_id: currentUserId,
      sender: currentUserId,
      sender_name: displayName,
      handshake_id: handshakeId,
      pending: true,
    };

    setMessages((prev) => dedupeMessages([...prev, optimistic]));
    setInputText("");
    scrollToBottom();

    try {
      wsSendMessage(text);
    } catch (e) {
      setError("Failed to send message.");
      setMessages((prev) => prev.filter((m) => m.id !== pendingId));
    }
  }, [
    inputText,
    canSendMessages,
    connected,
    user,
    currentUserId,
    currentUserEmail,
    handshakeId,
    dedupeMessages,
    scrollToBottom,
    wsSendMessage,
    setError,
  ]);

  const formatTime = useCallback((value?: string) => {
    if (!value) return "";
    return new Date(value).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, []);

  const isOwnMessage = useCallback(
    (item: ChatMessageWithMeta) => {
      if (currentUserId && item.sender_id) {
        return String(currentUserId) === String(item.sender_id);
      }
      if (currentUserId && item.sender) {
        return String(currentUserId) === String(item.sender);
      }
      if (currentUserEmail && item.sender) {
        return currentUserEmail === item.sender;
      }
      return false;
    },
    [currentUserEmail, currentUserId],
  );

  const renderMessage = useCallback(
    ({ item, index }: { item: ChatMessageWithMeta; index: number }) => {
      const own = isOwnMessage(item);
      const previous = messages[index - 1];
      const previousOwn = previous ? isOwnMessage(previous) : false;
      const previousSenderKey = String(previous?.sender_id ?? previous?.sender ?? "");
      const currentSenderKey = String(item.sender_id ?? item.sender ?? "");
      const showAvatar =
        !own && (!previous || previousOwn || previousSenderKey !== currentSenderKey);
      const senderName = item.sender_name ?? otherUserName;
      const avatarUrl = item.sender_avatar_url;

      return (
        <ChatMessageBubble
          item={item}
          isOwn={own}
          showAvatar={showAvatar}
          senderName={senderName}
          avatarUrl={avatarUrl}
          formatTime={formatTime}
        />
      );
    },
    [formatTime, isOwnMessage, messages, otherUserName],
  );

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        <ChatTopMeta
          otherUserName={otherUserName}
          otherUserAvatarUrl={otherUserAvatarUrl}
          serviceTitle={serviceTitle}
          handshakeStatus={handshakeStatus}
          formatStatusLabel={formatStatusLabel}
          connected={connected}
          reconnectAttempts={reconnectAttempts}
          onViewProfile={
            otherUserId ? openOtherUserPublicProfile : undefined
          }
          onOpenService={serviceId ? openServiceDetail : undefined}
        />

        <ChatStepBar
          isPending={isPendingLike}
          isAccepted={isAcceptedLike}
          isCompleted={isCompletedLike}
          isClosed={isClosedLike}
          providerInitiated={providerInitiated}
        />

        <ChatHandshakeBanner
          banner={displayHandshakeBanner}
          canInitiatePending={canInitiatePending}
          canApprovePending={canApprovePending}
          canCancelPending={canCancelPending}
          canConfirmCompletion={canConfirmCompletion}
          canRequestCancellation={canRequestCancellation}
          canRespondToCancellation={canRespondToCancellation}
          hasCancellationRequest={hasCancellationRequest}
          cancellationRequestedByName={cancellationRequestedByName}
          canReportNoShow={isAcceptedLike || isAwaitingSecondConfirmationLike}
          hasSessionDetails={!!sessionDetails}
          canLeaveEvaluation={evaluationWindow.isOpen}
          evaluationLabel={evaluationWindow.label}
          isAwaitingSecondConfirmationLike={isAwaitingSecondConfirmationLike}
          myConfirmed={completionState.myConfirmed}
          otherConfirmed={completionState.otherConfirmed}
          counterpartName={completionState.counterpartName}
          actionLoading={actionLoading}
          sessionDetails={sessionDetails}
          onInitiate={() => setShowInitiateModal(true)}
          onReviewApprove={() => setShowApproveModal(true)}
          onOpenSessionDetails={() => setShowSessionDetailsModal(true)}
          onCancel={() => runHandshakeAction("cancel")}
          onConfirm={() => runHandshakeAction("confirm")}
          onRequestCancellation={() => runHandshakeAction("requestCancellation")}
          onApproveCancellation={() => runHandshakeAction("approveCancellation")}
          onRejectCancellation={() => runHandshakeAction("rejectCancellation")}
          onReportNoShow={handleReportParticipant}
          onOpenEvaluation={() => setShowEvaluationModal(true)}
        />

        {error ? (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={refreshAll}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {actionError ? (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>{actionError}</Text>
            <TouchableOpacity onPress={loadHandshake}>
              <Text style={styles.retryText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {loadingMessages && messages.length === 0 ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={colors.BLUE} />
            <Text style={styles.centerStateText}>Loading messages...</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.listContent,
              messages.length === 0 && styles.emptyListContent,
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollToBottom(false)}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={refreshAll} />
            }
            ListEmptyComponent={
              <View style={styles.centerState}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={34}
                  color={colors.GRAY400}
                />
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.centerStateText}>
                  {canSendMessages
                    ? "Start the conversation by sending a message."
                    : "This conversation is read-only now, but the history remains accessible."}
                </Text>
              </View>
            }
          />
        )}

        <ChatInputBar
          value={inputText}
          onChangeText={setInputText}
          onSend={sendMessage}
          placeholder={
            !connected
              ? "Connecting..."
              : canSendMessages
                ? "Type a message..."
                : "Messaging disabled for this exchange"
          }
          editable={connected && canSendMessages}
          sendDisabled={!connected || !canSendMessages || !inputText.trim()}
        />

        <ChatInitiateHandshakeModal
          visible={showInitiateModal}
          onClose={() => setShowInitiateModal(false)}
          onSubmit={handleInitiateHandshake}
          serviceType={serviceType}
          scheduleType={scheduleType}
          maxParticipants={maxParticipants}
          serviceLocationType={
            serviceLocationType ??
            ((handshake as Record<string, unknown> | null)?.service_location_type as
              | string
              | undefined)
          }
          serviceLocationArea={serviceLocationArea}
          serviceExactLocation={serviceExactLocation}
          serviceLocationGuide={serviceLocationGuide}
          serviceScheduledTime={serviceScheduledTime}
          provisionedHours={
            provisionedHours ??
            ((handshake as Record<string, unknown> | null)?.provisioned_hours as
              | number
              | undefined)
          }
        />

        <ChatApproveDetailsModal
          visible={showApproveModal}
          sessionDetails={sessionDetails}
          actionLoading={
            actionLoading === "approve" || actionLoading === "decline"
              ? actionLoading
              : null
          }
          onClose={() => setShowApproveModal(false)}
          onApprove={() => {
            setShowApproveModal(false);
            runHandshakeAction("approve");
          }}
          onDecline={() => {
            setShowApproveModal(false);
            runHandshakeAction("decline");
          }}
        />

        <ChatSessionDetailsModal
          visible={showSessionDetailsModal}
          sessionDetails={sessionDetails}
          bannerTitle={handshakeBanner.title}
          bannerDescription={handshakeBanner.description}
          canInitiatePending={canInitiatePending}
          canApprovePending={canApprovePending}
          canCancelPending={canCancelPending}
          canConfirmCompletion={canConfirmCompletion}
          isAwaitingSecondConfirmationLike={isAwaitingSecondConfirmationLike}
          myConfirmed={completionState.myConfirmed}
          otherConfirmed={completionState.otherConfirmed}
          counterpartName={completionState.counterpartName}
          hasCancellationRequest={hasCancellationRequest}
          cancellationRequestedByName={cancellationRequestedByName}
          canRequestCancellation={canRequestCancellation}
          canRespondToCancellation={canRespondToCancellation}
          canReportParticipant={isAcceptedLike || isAwaitingSecondConfirmationLike}
          canLeaveEvaluation={evaluationWindow.isOpen}
          evaluationLabel={evaluationWindow.label}
          actionLoading={actionLoading}
          onClose={() => setShowSessionDetailsModal(false)}
          onInitiate={() => {
            setShowSessionDetailsModal(false);
            setShowInitiateModal(true);
          }}
          onReviewApprove={() => {
            setShowSessionDetailsModal(false);
            runHandshakeAction("approve");
          }}
          onCancel={() => {
            setShowSessionDetailsModal(false);
            runHandshakeAction("cancel");
          }}
          onConfirm={() => {
            setShowSessionDetailsModal(false);
            runHandshakeAction("confirm");
          }}
          onRequestCancellation={() => {
            setShowSessionDetailsModal(false);
            runHandshakeAction("requestCancellation");
          }}
          onApproveCancellation={() => {
            setShowSessionDetailsModal(false);
            runHandshakeAction("approveCancellation");
          }}
          onRejectCancellation={() => {
            setShowSessionDetailsModal(false);
            runHandshakeAction("rejectCancellation");
          }}
          onReportParticipant={() => {
            setShowSessionDetailsModal(false);
            void handleReportParticipant();
          }}
          onOpenEvaluation={() => {
            setShowSessionDetailsModal(false);
            setShowEvaluationModal(true);
          }}
        />

        <ChatEvaluationModal
          visible={showEvaluationModal}
          handshakeId={handshakeId}
          counterpartName={completionState.counterpartName}
          isEventEvaluation={evaluationWindow.isEventEvaluation}
          alreadyReviewed={evaluationWindow.userHasReviewed}
          onClose={() => setShowEvaluationModal(false)}
          onSubmitted={refreshAll}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: 240,
  },
  headerTitleText: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: "700",
    color: colors.GRAY900,
  },
  headerTypeBadge: {
    minHeight: 22,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: colors.BLUE_LT,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTypeBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.BLUE,
  },
  container: {
    flex: 1,
    backgroundColor: colors.WHITE,
  },
  keyboardView: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  errorBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#FEF2F2",
    borderBottomWidth: 1,
    borderBottomColor: "#FECACA",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  errorText: {
    flex: 1,
    color: colors.RED,
    fontSize: 13,
    marginRight: 12,
  },
  retryText: {
    color: colors.BLUE,
    fontSize: 13,
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  centerState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  centerStateText: {
    marginTop: 10,
    fontSize: 14,
    color: colors.GRAY500,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "700",
    color: colors.GRAY900 ?? "#111827",
  },
});
