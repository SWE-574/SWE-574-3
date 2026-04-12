import { useCallback, useMemo } from "react";
import { Alert } from "react-native";
import {
  approveHandshake,
  approveCancellationHandshake,
  cancelHandshake,
  confirmHandshake,
  getHandshake,
  rejectCancellationHandshake,
  requestCancellationHandshake,
  requestHandshakeChanges,
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
  isCurrentUserServiceOwner?: boolean;
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
  isCurrentUserServiceOwner = false,
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

  /**
   * Whether the provider/service-owner has already proposed session details.
   * Until this is true, the approve/decline actions must be hidden — the
   * backend will reject them with "Provider must initiate the handshake first".
   */
  const providerInitiated = useMemo(() => {
    if (!handshake) return false;
    return !!(handshake.provider_initiated as boolean | undefined);
  }, [handshake]);

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

  /**
   * Web parity:
   * - Pending action ownership is based on SERVICE OWNERSHIP, not provider role.
   * - Offer: service owner == provider
   * - Need/Want: service owner == receiver
   *
   * Therefore:
   * - service owner initiates
   * - non-owner/requester approves or declines after details are proposed
   */
  const canApprovePending = useMemo(
    () => isPendingLike && !isCurrentUserServiceOwner && providerInitiated,
    [isCurrentUserServiceOwner, isPendingLike, providerInitiated],
  );

  const canDeclinePending = useMemo(
    () => isPendingLike && !isCurrentUserServiceOwner && providerInitiated,
    [isCurrentUserServiceOwner, isPendingLike, providerInitiated],
  );

  const canInitiatePending = useMemo(
    () => isPendingLike && isCurrentUserServiceOwner && !providerInitiated,
    [isCurrentUserServiceOwner, isPendingLike, providerInitiated],
  );

  const canCancelPending = useMemo(() => isPendingLike, [isPendingLike]);

  const canConfirmCompletion = useMemo(
    () => isAcceptedLike || isAwaitingSecondConfirmationLike,
    [isAcceptedLike, isAwaitingSecondConfirmationLike],
  );

  const canRequestCancellation = useMemo(
    () => Boolean(handshake?.can_request_cancellation),
    [handshake?.can_request_cancellation],
  );

  const canRespondToCancellation = useMemo(
    () => Boolean(handshake?.can_respond_to_cancellation),
    [handshake?.can_respond_to_cancellation],
  );

  const cancellationRequestedByName = useMemo(
    () =>
      typeof handshake?.cancellation_requested_by_name === "string"
        ? handshake.cancellation_requested_by_name
        : null,
    [handshake?.cancellation_requested_by_name],
  );

  const hasCancellationRequest = useMemo(
    () => Boolean(handshake?.cancellation_requested_at),
    [handshake?.cancellation_requested_at],
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
              updated = await requestHandshakeChanges(handshakeId);
              break;
            case "cancel":
              updated = await cancelHandshake(handshakeId);
              break;
            case "confirm":
              updated = await confirmHandshake(handshakeId);
              break;
            case "requestCancellation":
              updated = await requestCancellationHandshake(handshakeId);
              break;
            case "approveCancellation":
              updated = await approveCancellationHandshake(handshakeId);
              break;
            case "rejectCancellation":
              updated = await rejectCancellationHandshake(handshakeId);
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
          "Request changes",
          "Ask the service owner to revise the proposed session details?",
          [
            { text: "Keep", style: "cancel" },
            { text: "Request changes", onPress: runner },
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

      if (type === "requestCancellation") {
        Alert.alert(
          "Request cancellation",
          "Send a cancellation request to the other participant?",
          [
            { text: "Keep handshake", style: "cancel" },
            { text: "Request cancellation", style: "destructive", onPress: runner },
          ],
        );
        return;
      }

      if (type === "approveCancellation") {
        Alert.alert(
          "Approve cancellation",
          "Approve this cancellation request and close the handshake?",
          [
            { text: "Keep handshake", style: "cancel" },
            { text: "Approve cancellation", style: "destructive", onPress: runner },
          ],
        );
        return;
      }

      if (type === "rejectCancellation") {
        Alert.alert(
          "Keep handshake",
          "Reject this cancellation request and keep the handshake active?",
          [
            { text: "Back", style: "cancel" },
            { text: "Keep handshake", onPress: runner },
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
      // Provider has NOT yet proposed session details
      if (!providerInitiated) {
        if (!isCurrentUserServiceOwner) {
          // Current user is the requester — waiting for the service owner to propose
          return {
            tone: "warning" as const,
            title: "Waiting for session details",
            description:
              "Your interest has been received. The service owner will share the session details (time, location, duration) before you can approve.",
          };
        }
        // Current user owns the service — they need to propose session details
        return {
          tone: "warning" as const,
          title: "Session details required",
          description:
            "Someone has expressed interest in your service. Share the session details (time, location, duration) to continue.",
        };
      }

      // Service owner HAS proposed session details
      if (!isCurrentUserServiceOwner) {
        // Current user is the requester — can now approve or decline
        return {
          tone: "warning" as const,
          title: "Session details received",
          description:
            "The service owner has shared the session details. Review and approve to confirm the exchange, or decline if the details do not work for you.",
        };
      }
      // Current user is the service owner — waiting for requester to approve
      return {
        tone: "info" as const,
        title: "Waiting for approval",
        description:
          "Session details have been sent. The other participant can now approve or decline your proposal.",
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
    isCurrentUserServiceOwner,
    isPendingLike,
    providerInitiated,
  ]);

  return {
    handshakeStatus,
    handshakeRole,
    isPendingLike,
    isAcceptedLike,
    isAwaitingSecondConfirmationLike,
    isCompletedLike,
    isClosedLike,
    providerInitiated,
    canSendMessages,
    canInitiatePending,
    canApprovePending,
    canDeclinePending,
    canCancelPending,
    canConfirmCompletion,
    canRequestCancellation,
    canRespondToCancellation,
    cancellationRequestedByName,
    hasCancellationRequest,
    loadHandshake,
    runHandshakeAction,
    handshakeBanner,
  };
}
