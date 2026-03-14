import { useCallback, useMemo } from "react";
import { Alert } from "react-native";
import {
  approveHandshake,
  cancelHandshake,
  confirmHandshake,
  declineHandshake,
  getHandshake,
  type Handshake,
} from "../api/handshakes";
import {
  formatStatusLabel,
  getIdLike,
  getEmailLike,
  normalizeStatus,
} from "../utils/chatUtils";
import type { ActionType, HandshakeRole } from "../types/chatTypes";

export type UseHandshakeParams = {
  handshakeId: string;
  handshake: Handshake | null;
  setHandshake: React.Dispatch<React.SetStateAction<Handshake | null>>;
  handshakeLoading: boolean;
  setHandshakeLoading: React.Dispatch<React.SetStateAction<boolean>>;
  actionLoading: ActionType | null;
  setActionLoading: React.Dispatch<React.SetStateAction<ActionType | null>>;
  actionError: string | null;
  setActionError: React.Dispatch<React.SetStateAction<string | null>>;
  currentUserId: string | undefined;
  currentUserEmail: string | undefined;
};

export function useHandshake({
  handshakeId,
  handshake,
  setHandshake,
  handshakeLoading,
  setHandshakeLoading,
  actionLoading,
  setActionLoading,
  actionError,
  setActionError,
  currentUserId,
  currentUserEmail,
}: UseHandshakeParams) {
  const handshakeStatus = useMemo(
    () => normalizeStatus(handshake?.status),
    [handshake?.status],
  );

  const handshakeRole = useMemo<HandshakeRole>(() => {
    if (!handshake || (!currentUserId && !currentUserEmail)) return "unknown";

    const initiatorId = getIdLike(handshake.initiator);
    const initiatorEmail = getEmailLike(handshake.initiator);

    if (
      (currentUserId && initiatorId && currentUserId === initiatorId) ||
      (currentUserEmail &&
        initiatorEmail &&
        currentUserEmail === initiatorEmail)
    ) {
      return "initiator";
    }

    return "other";
  }, [currentUserEmail, currentUserId, handshake]);

  const isPendingLike = useMemo(
    () =>
      [
        "PENDING",
        "INITIATED",
        "REQUESTED",
        "DETAILS_SUBMITTED",
        "AWAITING_APPROVAL",
        "WAITING_APPROVAL",
        "WAITING_FOR_APPROVAL",
        "NEEDS_APPROVAL",
        "REQUEST_CHANGES",
        "CHANGES_REQUESTED",
      ].includes(handshakeStatus),
    [handshakeStatus],
  );

  const isAcceptedLike = useMemo(
    () =>
      ["ACCEPTED", "APPROVED", "ACTIVE", "IN_PROGRESS", "SCHEDULED"].includes(
        handshakeStatus,
      ),
    [handshakeStatus],
  );

  const isAwaitingSecondConfirmationLike = useMemo(
    () =>
      [
        "AWAITING_SECOND_CONFIRMATION",
        "WAITING_SECOND_CONFIRMATION",
        "WAITING_FOR_CONFIRMATION",
        "PARTIALLY_CONFIRMED",
        "COMPLETION_PENDING",
        "PENDING_CONFIRMATION",
        "CONFIRMATION_PENDING",
      ].includes(handshakeStatus),
    [handshakeStatus],
  );

  const isCompletedLike = useMemo(
    () => ["COMPLETED", "CONFIRMED", "DONE"].includes(handshakeStatus),
    [handshakeStatus],
  );

  const isClosedLike = useMemo(
    () =>
      [
        "CANCELLED",
        "CANCELED",
        "DECLINED",
        "DENIED",
        "REJECTED",
        "EXPIRED",
        "CLOSED",
      ].includes(handshakeStatus),
    [handshakeStatus],
  );

  const canSendMessages = useMemo(() => {
    if (isClosedLike || isCompletedLike) return false;
    return true;
  }, [isClosedLike, isCompletedLike]);

  const canApprovePending = useMemo(
    () => isPendingLike && handshakeRole === "other",
    [handshakeRole, isPendingLike],
  );

  const canDeclinePending = useMemo(
    () => isPendingLike && handshakeRole === "other",
    [handshakeRole, isPendingLike],
  );

  const canCancelPending = useMemo(() => isPendingLike, [isPendingLike]);

  const canConfirmCompletion = useMemo(
    () => isAcceptedLike || isAwaitingSecondConfirmationLike,
    [isAcceptedLike, isAwaitingSecondConfirmationLike],
  );

  const loadHandshake = useCallback(async () => {
    if (!handshakeId) return;

    try {
      setHandshakeLoading(true);
      setActionError(null);
      const data = await getHandshake(handshakeId);
      setHandshake(data);
    } catch (e) {
      console.error("Failed to load handshake:", e);
      setActionError("Failed to load exchange status.");
    } finally {
      setHandshakeLoading(false);
    }
  }, [handshakeId, setHandshake, setActionError, setHandshakeLoading]);

  const runHandshakeAction = useCallback(
    async (type: ActionType) => {
      if (!handshakeId || actionLoading) return;

      const runner = async () => {
        setActionLoading(type);
        setActionError(null);

        try {
          let updated: Handshake;

          switch (type) {
            case "approve":
              updated = await approveHandshake(handshakeId);
              break;
            case "decline":
              updated = await declineHandshake(handshakeId);
              break;
            case "cancel":
              updated = await cancelHandshake(handshakeId);
              break;
            case "confirm":
              updated = await confirmHandshake(handshakeId);
              break;
            default:
              return;
          }

          setHandshake(updated);
          await loadHandshake();
        } catch (e) {
          console.error(`Failed to ${type} handshake:`, e);
          setActionError(`Failed to ${type} exchange.`);
        } finally {
          setActionLoading(null);
        }
      };

      if (type === "decline") {
        Alert.alert(
          "Decline request",
          "Are you sure you want to decline this exchange request?",
          [
            { text: "Keep", style: "cancel" },
            { text: "Decline", style: "destructive", onPress: runner },
          ],
        );
        return;
      }

      if (type === "cancel") {
        Alert.alert(
          "Cancel exchange",
          "Are you sure you want to cancel this exchange?",
          [
            { text: "Keep", style: "cancel" },
            { text: "Cancel exchange", style: "destructive", onPress: runner },
          ],
        );
        return;
      }

      if (type === "confirm") {
        Alert.alert(
          "Confirm completion",
          "Confirm that this exchange has been completed.",
          [
            { text: "Not yet", style: "cancel" },
            { text: "Confirm", onPress: runner },
          ],
        );
        return;
      }

      await runner();
    },
    [
      actionLoading,
      handshakeId,
      loadHandshake,
      setActionError,
      setActionLoading,
      setHandshake,
    ],
  );

  const handshakeBanner = useMemo(() => {
    if (handshakeLoading && !handshake) {
      return {
        tone: "neutral" as const,
        title: "Loading exchange status...",
        description:
          "Please wait while the current handshake state is fetched.",
      };
    }

    if (!handshake) {
      return {
        tone: "neutral" as const,
        title: "Exchange status unavailable",
        description:
          "Chat is available, but the handshake state could not be loaded.",
      };
    }

    if (isPendingLike) {
      if (handshakeRole === "initiator") {
        return {
          tone: "warning" as const,
          title: "Waiting for approval",
          description:
            "Your request is pending. The other participant can approve or decline the exchange details.",
        };
      }

      return {
        tone: "warning" as const,
        title: "Approval required",
        description:
          "This exchange is pending your review. You can approve or decline it from here.",
      };
    }

    if (isAcceptedLike) {
      return {
        tone: "success" as const,
        title: "Exchange accepted",
        description:
          "The exchange is active. Use chat to coordinate and confirm completion when it is done.",
      };
    }

    if (isAwaitingSecondConfirmationLike) {
      return {
        tone: "info" as const,
        title: "Waiting for final confirmation",
        description:
          "One side has already confirmed completion. The exchange will complete after the remaining confirmation.",
      };
    }

    if (isCompletedLike) {
      return {
        tone: "success" as const,
        title: "Exchange completed",
        description:
          "This exchange is completed. Chat history remains visible, but new messages are disabled.",
      };
    }

    if (isClosedLike) {
      return {
        tone: "danger" as const,
        title: "Exchange closed",
        description:
          "This exchange has been closed. Chat history remains visible, but new messages are disabled.",
      };
    }

    return {
      tone: "neutral" as const,
      title: formatStatusLabel(handshakeStatus || "UNKNOWN"),
      description: "The current exchange state is shown above.",
    };
  }, [
    formatStatusLabel,
    handshake,
    handshakeLoading,
    handshakeRole,
    handshakeStatus,
    isAcceptedLike,
    isAwaitingSecondConfirmationLike,
    isClosedLike,
    isCompletedLike,
    isPendingLike,
  ]);

  return {
    handshakeStatus,
    handshakeRole,
    isPendingLike,
    isAcceptedLike,
    isAwaitingSecondConfirmationLike,
    isCompletedLike,
    isClosedLike,
    canSendMessages,
    canApprovePending,
    canDeclinePending,
    canCancelPending,
    canConfirmCompletion,
    loadHandshake,
    runHandshakeAction,
    handshakeBanner,
  };
}
