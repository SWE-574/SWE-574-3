import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../constants/colors";
import { useAuth } from "../../context/AuthContext";
import {
  EMPTY_SUMMARY,
  listTransactions,
  type Transaction,
  type TransactionDirection,
  type TransactionSummary,
} from "../../api/transactions";
import { listHandshakes, type Handshake } from "../../api/handshakes";
import { getUserHistory } from "../../api/users";
import type { UserHistoryItem } from "../../api/types";
import type { ProfileStackParamList } from "../../navigation/ProfileStack";

const PAGE_SIZE = 20;
const ACTIVE_HANDSHAKE_STATUSES = new Set(["accepted", "checked_in", "attended"]);

const FILTERS: Array<{ key: TransactionDirection; label: string }> = [
  { key: "all", label: "All" },
  { key: "credit", label: "Earned" },
  { key: "debit", label: "Used" },
];
const SERVICE_TYPE_ORDER = ["Offer", "Need", "Event"] as const;

type ExpectedAgreement = {
  id: string;
  service_id?: string | null;
  service_title: string;
  service_type?: Handshake["service_type"];
  is_current_user_provider: boolean;
  counterpart_id?: string | null;
  counterpart_name: string;
  counterpart_avatar_url?: string | null;
  status: Handshake["status"];
  reserved_delta: number;
  expected_delta: number;
  note: string;
};

type EventHistoryItem = UserHistoryItem & {
  event_status: "completed" | "attended";
};

function formatHours(value: number): string {
  const absolute = Math.abs(value);
  const formatted = Number.isInteger(absolute)
    ? absolute.toString()
    : absolute.toFixed(2).replace(/\.?0+$/, "");
  return `${formatted}h`;
}

function formatAmount(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatHours(value)}`;
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function transactionCounterpartName(transaction: Transaction, currentUserId?: string): string {
  const counterpart = transaction.counterpart;
  if (!counterpart) return transactionContextLabel(transaction, currentUserId);
  if (currentUserId && counterpart.id === currentUserId) return "You";
  const fullName = `${counterpart.first_name ?? ""} ${counterpart.last_name ?? ""}`.trim();
  return fullName || counterpart.email || "Unknown user";
}

function isServiceLevelNeedTransaction(transaction: Transaction): boolean {
  return transaction.service_type === "Need" && !transaction.handshake_id;
}

function isCompletedTransactionContext(transaction: Transaction): boolean {
  return transaction.handshake_status === "completed" || transaction.service_status === "Completed";
}

function isOpenServiceLevelReservation(transaction: Transaction): boolean {
  if (!isServiceLevelNeedTransaction(transaction)) return false;

  const serviceStatus = transaction.service_status?.toLowerCase();
  if (!serviceStatus) return true;

  return !["completed", "cancelled", "canceled", "deleted"].includes(serviceStatus);
}

function transactionDisplayTitle(transaction: Transaction): string {
  if (transaction.service_title) return transaction.service_title;
  if (isServiceLevelNeedTransaction(transaction)) {
    if (transaction.transaction_type === "provision") return "Need reservation";
    if (transaction.transaction_type === "refund") return "Need cancelled";
  }
  if (transaction.transaction_type === "adjustment") return "Account adjustment";
  return "Account update";
}

function transactionActionTitle(transaction: Transaction): string {
  if (isCompletedTransactionContext(transaction) && transaction.transaction_type === "provision") {
    return transaction.amount < 0 ? "Time used" : "Time completed";
  }

  if (isServiceLevelNeedTransaction(transaction)) {
    if (transaction.transaction_type === "provision") return "Reserved for need";
    if (transaction.transaction_type === "refund") return "Reservation returned";
  }
  if (transaction.transaction_type === "transfer") {
    return transaction.amount >= 0 ? "Time earned" : "Time used";
  }
  if (transaction.transaction_type === "provision") return "Time reserved";
  if (transaction.transaction_type === "refund") return "Time returned";
  if (transaction.transaction_type === "adjustment") return "Balance adjusted";
  return transaction.transaction_type_display ?? "Time activity";
}

function transactionFriendlyDescription(transaction: Transaction): string {
  const title = transaction.service_title ?? "this activity";
  const hours = formatHours(Math.abs(transaction.amount));
  if (isCompletedTransactionContext(transaction) && transaction.transaction_type === "provision") {
    return transaction.amount < 0
      ? `${hours} used for a completed exchange.`
      : `${hours} completed for "${title}".`;
  }
  if (isServiceLevelNeedTransaction(transaction)) {
    if (transaction.transaction_type === "provision") return `${hours} set aside for your need.`;
    if (transaction.transaction_type === "refund") return `${hours} returned after the need was cancelled.`;
  }
  if (transaction.transaction_type === "transfer") {
    return transaction.amount >= 0
      ? `${hours} earned from a completed exchange.`
      : `${hours} used for a completed exchange.`;
  }
  if (transaction.transaction_type === "provision") return `${hours} reserved for "${title}".`;
  if (transaction.transaction_type === "refund") return `${hours} returned to your available time.`;
  if (transaction.transaction_type === "adjustment") return `${hours} balance adjustment.`;
  return `${hours} time activity entry.`;
}

function isOwnListingTransaction(transaction: Transaction): boolean {
  if (transaction.service_type === "Offer" || transaction.service_type === "Event") {
    return transaction.is_current_user_provider === true;
  }
  if (transaction.service_type === "Need") {
    return transaction.is_current_user_provider === false;
  }
  return false;
}

function transactionContextLabel(transaction: Transaction, currentUserId?: string): string {
  if (transaction.counterpart) {
    if (currentUserId && transaction.counterpart.id === currentUserId) {
      if (transaction.service_type === "Need" && transaction.transaction_type === "provision") {
        return "You reserved time";
      }
      if (transaction.service_type === "Need" && transaction.transaction_type === "refund") {
        return "Your time returned";
      }
      return "You";
    }
    const fullName = `${transaction.counterpart.first_name ?? ""} ${transaction.counterpart.last_name ?? ""}`.trim();
    return fullName || transaction.counterpart.email || "Community member";
  }
  if (isServiceLevelNeedTransaction(transaction)) {
    return transaction.transaction_type === "refund" ? "Reservation returned" : "Your need";
  }
  if (transaction.transaction_type === "adjustment") return "Account";
  return "Time activity";
}

function startOfLocalDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function handshakeCounterpartName(handshake: Handshake, currentUserName?: string) {
  const counterpart = handshake.counterpart;
  const fullName = counterpart
    ? `${counterpart.first_name ?? ""} ${counterpart.last_name ?? ""}`.trim()
    : "";

  if (fullName && fullName !== currentUserName) return fullName;
  if (counterpart?.email) return counterpart.email;
  if (handshake.provider_name && handshake.provider_name !== currentUserName) {
    return handshake.provider_name;
  }
  if (handshake.requester_name && handshake.requester_name !== currentUserName) {
    return handshake.requester_name;
  }
  return "Unknown user";
}

function activeHandshakeLabel(status: Handshake["status"]): string {
  if (status === "checked_in") return "Checked in";
  if (status === "attended") return "Attended";
  return "Session confirmed";
}

function toExpectedAgreement(
  handshake: Handshake,
  currentUserName?: string,
  currentUserId?: string,
): ExpectedAgreement | null {
  const hours = Number(handshake.provisioned_hours ?? 0);
  const isEvent = handshake.service_type === "Event";
  if (hours <= 0 && !isEvent) return null;

  const requesterId =
    typeof handshake.requester === "object" && handshake.requester !== null
      ? String((handshake.requester as { id?: string }).id ?? "")
      : String(handshake.requester ?? "");
  const isProvider = isEvent
    ? requesterId !== String(currentUserId ?? "")
    : handshake.is_current_user_provider === true;

  return {
    id: handshake.id,
    service_id: handshake.service_id ?? null,
    service_title: String(handshake.service_title ?? "Untitled service"),
    service_type: handshake.service_type,
    is_current_user_provider: isProvider,
    counterpart_id: handshake.counterpart?.id ?? null,
    counterpart_name: handshakeCounterpartName(handshake, currentUserName),
    counterpart_avatar_url: handshake.counterpart?.avatar_url ?? null,
    status: handshake.status,
    reserved_delta: isProvider ? 0 : -hours,
    expected_delta: isProvider ? hours : 0,
    note: isEvent
      ? "Event session"
      : isProvider
      ? "Time expected after completion"
      : "Already reserved at acceptance",
  };
}

function typeTone(type: "Offer" | "Need" | "Event") {
  if (type === "Offer") return { color: colors.GREEN, bg: colors.GREEN_LT };
  if (type === "Need") return { color: colors.BLUE, bg: colors.BLUE_LT };
  return { color: colors.AMBER, bg: colors.AMBER_LT };
}

function roleAccent(isProvider: boolean) {
  return isProvider
    ? {
        icon: "trending-up-outline" as const,
        color: colors.GREEN,
        bg: colors.GREEN_LT,
        label: "Provider",
      }
    : {
        icon: "trending-down-outline" as const,
        color: colors.AMBER,
        bg: colors.AMBER_LT,
        label: "Receiver",
      };
}

function transactionAccent(transaction: Transaction) {
  const role = roleAccent(transaction.is_current_user_provider === true);
  const isCompletedContext = isCompletedTransactionContext(transaction);

  switch (transaction.transaction_type) {
    case "transfer":
      return { ...role, stateLabel: "Completed" };
    case "refund":
      return {
        icon: "repeat-outline" as const,
        color: colors.PURPLE,
        bg: colors.PURPLE_LT,
        label: "Refund",
        stateLabel: "Refunded",
      };
    case "provision":
      if (isCompletedContext) return { ...role, stateLabel: "Completed" };
      return { ...role, stateLabel: "Reserved" };
    case "adjustment":
      return {
        icon: "flash-outline" as const,
        color: colors.GRAY700,
        bg: colors.GRAY100,
        label: "Adjustment",
        stateLabel: "Adjusted",
      };
    default:
      return transaction.amount >= 0
        ? { ...role, stateLabel: "Earned" }
        : { ...role, stateLabel: "Used" };
  }
}

function roleLabel(isCurrentUserProvider?: boolean) {
  return isCurrentUserProvider ? "Provider" : "Receiver";
}

function agreementRoleLabel(agreement: ExpectedAgreement) {
  if (agreement.service_type === "Event") {
    return agreement.is_current_user_provider ? "Organizer" : "Attendee";
  }
  return roleLabel(agreement.is_current_user_provider);
}

function EmptyState() {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconOuter}>
        <View style={styles.emptyIconInner}>
          <View style={styles.emptyIconCore}>
            <Ionicons name="time-outline" size={28} color={colors.GREEN} />
          </View>
        </View>
        <View style={styles.emptyChipTop}>
          <Text style={styles.emptyChipTopText}>+0h</Text>
        </View>
        <View style={styles.emptyChipBottom}>
          <Text style={styles.emptyChipBottomText}>Your Time</Text>
        </View>
      </View>
      <Text style={styles.emptyTitle}>No time activity yet</Text>
      <Text style={styles.emptySubtitle}>
        Your time activity will appear here once you start completing exchanges with other members.
      </Text>
    </View>
  );
}

export default function TimeActivityScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const currentUserName = `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [insightTransactions, setInsightTransactions] = useState<Transaction[]>([]);
  const [eventHistory, setEventHistory] = useState<EventHistoryItem[]>([]);
  const [summary, setSummary] = useState<TransactionSummary>(EMPTY_SUMMARY);
  const [activeAgreements, setActiveAgreements] = useState<ExpectedAgreement[]>([]);
  const [direction, setDirection] = useState<TransactionDirection>("all");
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isAgreementsOpen, setIsAgreementsOpen] = useState(false);
  const [isEventActivityOpen, setIsEventActivityOpen] = useState(false);
  const [openAgreementSections, setOpenAgreementSections] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(count / PAGE_SIZE)),
    [count],
  );
  const hasMore = page < totalPages;
  const activeAgreementDelta = useMemo(
    () =>
      activeAgreements.reduce(
        (sum, item) =>
          sum + (item.expected_delta !== 0 ? item.expected_delta : item.reserved_delta),
        0,
      ),
    [activeAgreements],
  );
  const activeAgreementServiceIds = useMemo(
    () => new Set(activeAgreements.map((item) => item.service_id).filter(Boolean)),
    [activeAgreements],
  );
  const activeAgreementByServiceId = useMemo(() => {
    const map = new Map<string, ExpectedAgreement>();
    for (const agreement of activeAgreements) {
      if (agreement.service_id && !map.has(agreement.service_id)) {
        map.set(agreement.service_id, agreement);
      }
    }
    return map;
  }, [activeAgreements]);
  const activeAgreementSections = useMemo(
    () =>
      SERVICE_TYPE_ORDER.map((type) => ({
        type,
        items: activeAgreements.filter((agreement) => agreement.service_type === type),
      })).filter((section) => section.items.length > 0),
    [activeAgreements],
  );
  const insightStats = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const dailyMap = new Map<string, number>();
    const serviceTypeCounts = { Offer: 0, Need: 0, Event: 0 };
    const serviceReservationByService = new Map<string, number>();
    let lastSevenDayHours = 0;
    let monthActivityCount = 0;

    for (const transaction of insightTransactions) {
      const createdAt = new Date(transaction.created_at);
      if (Number.isNaN(createdAt.getTime())) continue;

      const dayKey = startOfLocalDay(createdAt);
      dailyMap.set(dayKey, (dailyMap.get(dayKey) ?? 0) + 1);

      if (createdAt >= sevenDaysAgo) {
        lastSevenDayHours += Math.abs(transaction.amount);
      }
      if (createdAt >= monthStart) {
        monthActivityCount += 1;
      }

      if (transaction.service_type === "Offer") serviceTypeCounts.Offer += 1;
      if (transaction.service_type === "Need") serviceTypeCounts.Need += 1;
      if (transaction.service_type === "Event") serviceTypeCounts.Event += 1;

      if (
        isOpenServiceLevelReservation(transaction) &&
        transaction.service_id &&
        !activeAgreementServiceIds.has(transaction.service_id)
      ) {
        const current = serviceReservationByService.get(transaction.service_id) ?? 0;
        serviceReservationByService.set(transaction.service_id, current + transaction.amount);
      }
    }

    for (const event of eventHistory) {
      const completedAt = new Date(event.completed_date);
      if (Number.isNaN(completedAt.getTime())) continue;

      const dayKey = startOfLocalDay(completedAt);
      dailyMap.set(dayKey, (dailyMap.get(dayKey) ?? 0) + 1);
      serviceTypeCounts.Event += 1;

      if (completedAt >= monthStart) {
        monthActivityCount += 1;
      }
    }

    const serviceReservationNet = Array.from(serviceReservationByService.values())
      .reduce((sum, amount) => sum + amount, 0);
    const acceptedReservation = activeAgreements.reduce(
      (sum, agreement) => sum + Math.abs(Math.min(agreement.reserved_delta, 0)),
      0,
    );
    const reservedNow = acceptedReservation + Math.abs(Math.min(serviceReservationNet, 0));

    const calendarDays = Array.from({ length: 28 }, (_, index) => {
      const date = new Date(now);
      date.setDate(now.getDate() - (27 - index));
      const key = startOfLocalDay(date);
      return { key, count: dailyMap.get(key) ?? 0 };
    });

    return {
      reservedNow,
      lastSevenDayHours,
      monthActivityCount,
      calendarDays,
      serviceTypeCounts,
      receivedHours: summary.total_earned,
      sharedHours: Math.abs(summary.total_spent),
    };
  }, [activeAgreementServiceIds, activeAgreements, eventHistory, insightTransactions, summary.total_earned, summary.total_spent]);

  const loadInsights = useCallback(async () => {
    try {
      const allTransactions: Transaction[] = [];
      let nextPage = 1;
      let hasNextPage = true;

      while (hasNextPage) {
        const res = await listTransactions({
          page: nextPage,
          page_size: 100,
          direction: "all",
        });
        allTransactions.push(...res.results);
        hasNextPage = Boolean(res.next) && allTransactions.length < res.count;
        nextPage += 1;
      }

      setInsightTransactions(allTransactions);
    } catch {
      setInsightTransactions([]);
    }
  }, []);

  const loadTransactions = useCallback(
    async (targetPage: number, mode: "replace" | "append" = "replace") => {
      if (mode === "append") {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      if (mode === "replace") {
        setError(null);
      }

      try {
        const res = await listTransactions({
          page: targetPage,
          page_size: PAGE_SIZE,
          direction,
        });

        setSummary(res.summary ?? EMPTY_SUMMARY);
        setCount(res.count);
        setPage(targetPage);
        setTransactions((prev) =>
          mode === "append" ? [...prev, ...res.results] : res.results,
        );
      } catch (err) {
        if (mode === "replace") {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load your time activity.",
          );
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [direction],
  );

  const loadAgreements = useCallback(async () => {
    try {
      const res = await listHandshakes({ page: 1, page_size: 100 });
      const nextAgreements = (res.results ?? [])
        .filter((handshake) => ACTIVE_HANDSHAKE_STATUSES.has(handshake.status))
        .map((handshake) => toExpectedAgreement(handshake, currentUserName, user?.id))
        .filter((item): item is ExpectedAgreement => item !== null);

      setActiveAgreements(nextAgreements);
    } catch {
      setActiveAgreements([]);
    }
  }, [currentUserName, user?.id]);

  const loadEventHistory = useCallback(async () => {
    if (!user?.id) {
      setEventHistory([]);
      return;
    }

    try {
      const history = await getUserHistory(user.id, { page_size: 100 });
      setEventHistory(
        history
          .filter((item) => item.service_type === "Event")
          .map((item) => ({
            ...item,
            event_status: "completed",
          })),
      );
    } catch {
      setEventHistory([]);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadTransactions(1, "replace");
  }, [direction, loadTransactions]);

  useEffect(() => {
    void loadAgreements();
    void loadInsights();
    void loadEventHistory();
  }, [loadAgreements, loadEventHistory, loadInsights]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([loadTransactions(1, "replace"), loadAgreements(), loadInsights(), loadEventHistory()]);
    setIsRefreshing(false);
  }, [loadAgreements, loadEventHistory, loadInsights, loadTransactions]);

  const handleLoadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || isLoading) return;
    await loadTransactions(page + 1, "append");
  }, [hasMore, isLoading, isLoadingMore, loadTransactions, page]);

  const activityMix = useMemo(() => {
    type TypeBucket = {
      count: number;
      hours: number;
      earnedHours: number;
      usedHours: number;
      lastDate: Date | null;
    };
    const buckets: Record<"Offer" | "Need" | "Event", TypeBucket> = {
      Offer: { count: 0, hours: 0, earnedHours: 0, usedHours: 0, lastDate: null },
      Need: { count: 0, hours: 0, earnedHours: 0, usedHours: 0, lastDate: null },
      Event: { count: 0, hours: 0, earnedHours: 0, usedHours: 0, lastDate: null },
    };

    const bumpDate = (bucket: TypeBucket, date: Date) => {
      if (Number.isNaN(date.getTime())) return;
      if (!bucket.lastDate || date > bucket.lastDate) bucket.lastDate = date;
    };

    for (const transaction of insightTransactions) {
      const type = transaction.service_type;
      if (type !== "Offer" && type !== "Need" && type !== "Event") continue;
      const bucket = buckets[type];
      bucket.count += 1;
      const amount = transaction.amount;
      bucket.hours += Math.abs(amount);
      if (amount >= 0) bucket.earnedHours += amount;
      else bucket.usedHours += Math.abs(amount);
      bumpDate(bucket, new Date(transaction.created_at));
    }
    for (const event of eventHistory) {
      const bucket = buckets.Event;
      bucket.count += 1;
      const duration = Math.abs(Number(event.duration) || 0);
      bucket.hours += duration;
      bumpDate(bucket, new Date(event.completed_date));
    }

    const totalCount =
      buckets.Offer.count + buckets.Need.count + buckets.Event.count;
    return { buckets, totalCount };
  }, [eventHistory, insightTransactions]);

  const topPartner = useMemo(() => {
    type Bucket = {
      id: string;
      name: string;
      avatar_url?: string | null;
      count: number;
      hours: number;
    };
    const map = new Map<string, Bucket>();

    const bump = (
      id: string | undefined,
      name: string | undefined,
      avatar: string | undefined | null,
      hours: number,
    ) => {
      if (!id || !name || (user?.id && id === user.id)) return;
      const prev = map.get(id) ?? { id, name, avatar_url: avatar, count: 0, hours: 0 };
      prev.count += 1;
      prev.hours += hours;
      if (avatar && !prev.avatar_url) prev.avatar_url = avatar;
      map.set(id, prev);
    };

    for (const transaction of insightTransactions) {
      const cp = transaction.counterpart;
      if (!cp) continue;
      const fullName = `${cp.first_name ?? ""} ${cp.last_name ?? ""}`.trim() || cp.email;
      bump(cp.id, fullName, cp.avatar_url, Math.abs(transaction.amount));
    }
    for (const agreement of activeAgreements) {
      bump(
        agreement.counterpart_id ?? undefined,
        agreement.counterpart_name,
        agreement.counterpart_avatar_url,
        Math.abs(agreement.expected_delta || agreement.reserved_delta || 0),
      );
    }

    let best: Bucket | null = null;
    for (const bucket of map.values()) {
      if (
        !best ||
        bucket.count > best.count ||
        (bucket.count === best.count && bucket.hours > best.hours)
      ) {
        best = bucket;
      }
    }
    return best;
  }, [activeAgreements, insightTransactions, user?.id]);

  const timeFlowTotal = Math.max(1, insightStats.receivedHours + insightStats.sharedHours);
  const receivedShare = Math.round((insightStats.receivedHours / timeFlowTotal) * 100);
  const sharedShare = Math.round((insightStats.sharedHours / timeFlowTotal) * 100);

  const openServiceDetail = useCallback(
    (serviceId?: string | null) => {
      if (!serviceId) return;
      navigation.navigate("ServiceDetail", { id: String(serviceId) });
    },
    [navigation],
  );

  const openPublicProfile = useCallback(
    (userId?: string | null) => {
      if (!userId || userId === user?.id) return;
      navigation.navigate("PublicProfile", { userId: String(userId) });
    },
    [navigation, user?.id],
  );
  const toggleAgreementSection = useCallback((sectionType: string) => {
    setOpenAgreementSections((prev) => ({
      ...prev,
      [sectionType]: prev[sectionType] !== true,
    }));
  }, []);

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{
        paddingTop: 16,
        paddingBottom: Math.max(24, insets.bottom + 12),
      }}
      data={transactions}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => void handleRefresh()}
          tintColor={colors.GREEN}
        />
      }
      ListHeaderComponent={
        <>
          <View style={styles.heroCard}>
            <View style={styles.heroBlobOne} />
            <View style={styles.heroBlobTwo} />

            <View style={styles.heroHeaderRow}>
              <View style={styles.heroIconBubble}>
                <Ionicons name="time-outline" size={16} color={colors.WHITE} />
              </View>
              <Text style={styles.heroLabel}>Time Available</Text>
            </View>

            <Text style={styles.heroValue}>{formatHours(summary.current_balance)}</Text>

            <View style={styles.heroChipRow}>
              <View style={styles.heroChip}>
                <Ionicons name="trending-up-outline" size={12} color={colors.WHITE} />
                <Text style={styles.heroChipText}>
                  {formatHours(summary.total_earned)} earned
                </Text>
              </View>
              <View style={styles.heroChip}>
                <Ionicons name="trending-down-outline" size={12} color={colors.WHITE} />
                <Text style={styles.heroChipText}>
                  {formatHours(Math.abs(summary.total_spent))} used
                </Text>
              </View>
            </View>

            <View style={styles.heroBottomRow}>
              <View style={styles.heroSideCard}>
                <Text style={styles.heroSideLabel}>Top community partner</Text>
                {topPartner ? (
                  <Pressable
                    onPress={() => openPublicProfile(topPartner.id)}
                    style={({ pressed }) => [
                      styles.heroPartnerRow,
                      pressed && styles.pressed,
                    ]}
                  >
                    {topPartner.avatar_url ? (
                      <Image source={{ uri: topPartner.avatar_url }} style={styles.heroPartnerAvatar} />
                    ) : (
                      <View style={[styles.heroPartnerAvatar, styles.heroPartnerAvatarFallback]}>
                        <Text style={styles.heroPartnerInitial}>
                          {topPartner.name.trim().charAt(0).toUpperCase() || "?"}
                        </Text>
                      </View>
                    )}
                    <View style={{ flexShrink: 1 }}>
                      <Text style={styles.heroPartnerName} numberOfLines={1}>
                        {topPartner.name}
                      </Text>
                      <Text style={styles.heroPartnerMeta}>
                        {topPartner.count} {topPartner.count === 1 ? "exchange" : "exchanges"} · {formatHours(topPartner.hours)}
                      </Text>
                    </View>
                  </Pressable>
                ) : (
                  <View style={styles.heroPartnerRow}>
                    <View style={[styles.heroPartnerAvatar, styles.heroPartnerAvatarFallback]}>
                      <Ionicons name="person-outline" size={20} color={colors.WHITE} />
                    </View>
                    <View style={{ flexShrink: 1 }}>
                      <Text style={styles.heroPartnerName}>No partner yet</Text>
                      <Text style={styles.heroPartnerMeta}>Start an exchange to see your top partner.</Text>
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.heroSideCard}>
                <Text style={styles.heroSideLabel}>Activity pulse</Text>
                <View style={styles.heroPulseGrid}>
                  <View style={styles.heroPulseCell}>
                    <Text style={styles.heroPulseValue}>{insightStats.monthActivityCount}</Text>
                    <Text style={styles.heroPulseLabel}>Month</Text>
                  </View>
                  <View style={styles.heroPulseCell}>
                    <Text style={styles.heroPulseValue}>{formatHours(insightStats.reservedNow)}</Text>
                    <Text style={styles.heroPulseLabel}>Reserved</Text>
                  </View>
                  <View style={styles.heroPulseCell}>
                    <Text style={styles.heroPulseValue}>{formatHours(insightStats.lastSevenDayHours)}</Text>
                    <Text style={styles.heroPulseLabel}>Last 7d</Text>
                  </View>
                  <View style={styles.heroPulseCell}>
                    <Text style={styles.heroPulseValue}>
                      {activeAgreementDelta === 0 ? "0h" : formatAmount(activeAgreementDelta)}
                    </Text>
                    <Text style={styles.heroPulseLabel}>Active</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.insightCard}>
            <View style={styles.insightHeader}>
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.sectionTitle}>Activity insights</Text>
                <Text style={styles.insightSubtitle}>Your last 28 days at a glance</Text>
              </View>
              <View style={styles.insightChipRow}>
                <View style={styles.insightHeaderBadge}>
                  <Text style={styles.insightHeaderBadgeText}>
                    {insightStats.monthActivityCount} month
                  </Text>
                </View>
                <View style={[styles.insightHeaderBadge, { backgroundColor: colors.AMBER_LT }]}>
                  <Text style={[styles.insightHeaderBadgeText, { color: colors.AMBER }]}>
                    {formatHours(insightStats.reservedNow)} reserved
                  </Text>
                </View>
                {activeAgreementDelta !== 0 ? (
                  <View style={[styles.insightHeaderBadge, { backgroundColor: colors.BLUE_LT }]}>
                    <Text style={[styles.insightHeaderBadgeText, { color: colors.BLUE }]}>
                      {formatAmount(activeAgreementDelta)} active
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.insightPanel}>
              <View style={styles.insightPanelHeader}>
                <Text style={styles.insightPanelTitle}>28-day activity</Text>
                <Text style={styles.insightPanelHint}>
                  {formatHours(insightStats.lastSevenDayHours)} · last 7d
                </Text>
              </View>
              <View style={styles.calendarGrid}>
                {insightStats.calendarDays.map((day) => {
                  const intensity =
                    day.count === 0
                      ? styles.calendarCellEmpty
                      : day.count === 1
                        ? styles.calendarCellLow
                        : day.count <= 3
                          ? styles.calendarCellMedium
                          : styles.calendarCellHigh;
                  return <View key={day.key} style={[styles.calendarCell, intensity]} />;
                })}
              </View>
              <View style={styles.calendarLegend}>
                <Text style={styles.calendarLegendText}>Less</Text>
                {[
                  styles.calendarCellEmpty,
                  styles.calendarCellLow,
                  styles.calendarCellMedium,
                  styles.calendarCellHigh,
                ].map((style, i) => (
                  <View key={i} style={[styles.calendarLegendDot, style]} />
                ))}
                <Text style={styles.calendarLegendText}>More</Text>
              </View>
            </View>

            <View style={styles.insightPanel}>
              <Text style={styles.insightPanelTitle}>Time flow</Text>
              <View style={styles.timeFlowRow}>
                <View>
                  <View style={styles.timeFlowLabelRow}>
                    <View style={[styles.timeFlowDot, { backgroundColor: colors.GREEN }]} />
                    <Text style={styles.timeFlowLabel}>Earned</Text>
                  </View>
                  <Text style={[styles.timeFlowValue, { color: colors.GREEN }]}>
                    {formatHours(insightStats.receivedHours)}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <View style={styles.timeFlowLabelRow}>
                    <Text style={styles.timeFlowLabel}>Used</Text>
                    <View style={[styles.timeFlowDot, { backgroundColor: colors.AMBER }]} />
                  </View>
                  <Text style={[styles.timeFlowValue, { color: colors.AMBER }]}>
                    {formatHours(insightStats.sharedHours)}
                  </Text>
                </View>
              </View>
              <View style={styles.timeFlowTrack}>
                <View
                  style={[
                    styles.timeFlowReceived,
                    { flex: receivedShare > 0 ? receivedShare : 0 },
                  ]}
                />
                <View
                  style={[
                    styles.timeFlowShared,
                    { flex: sharedShare > 0 ? sharedShare : 0 },
                  ]}
                />
              </View>
            </View>

            <View style={styles.insightPanel}>
              <View style={styles.insightPanelHeader}>
                <View style={{ flexShrink: 1 }}>
                  <Text style={styles.insightPanelTitle}>Activity mix</Text>
                  <Text style={styles.insightPanelHint}>Hours, role and recency per type</Text>
                </View>
                <Text style={styles.activityMixTotal}>
                  {activityMix.totalCount} entries
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.activityMixList}
              >
                {SERVICE_TYPE_ORDER.map((typeKey) => {
                  const tone = typeTone(typeKey);
                  const bucket = activityMix.buckets[typeKey];
                  const total = Math.max(1, activityMix.totalCount);
                  const share = Math.round((bucket.count / total) * 100);
                  const lastSeen = bucket.lastDate
                    ? bucket.lastDate.toLocaleDateString(undefined, {
                        day: "2-digit",
                        month: "short",
                      })
                    : "—";
                  return (
                    <View key={typeKey} style={styles.activityMixCard}>
                      <View style={[styles.activityMixAccent, { backgroundColor: tone.color }]} />
                      <View style={styles.activityMixBody}>
                        <View style={styles.activityMixCardHeader}>
                          <View style={styles.activityMixHeaderLeft}>
                            <View style={[styles.activityMixDot, { backgroundColor: tone.color }]} />
                            <Text style={styles.activityMixType}>{typeKey}</Text>
                          </View>
                          <View
                            style={[
                              styles.activityMixSharePill,
                              { backgroundColor: tone.bg },
                            ]}
                          >
                            <Text style={[styles.activityMixShareText, { color: tone.color }]}>
                              {share}% of activity
                            </Text>
                          </View>
                        </View>

                        <View style={styles.activityMixValueRow}>
                          <Text style={styles.activityMixCount}>{bucket.count}</Text>
                          <Text style={styles.activityMixCountLabel}>
                            {bucket.count === 1 ? "entry" : "entries"}
                          </Text>
                          <View style={{ flex: 1 }} />
                          <Text style={styles.activityMixHours}>
                            {formatHours(bucket.hours)}
                          </Text>
                        </View>

                        <View style={styles.activityMixTrack}>
                          <View
                            style={[
                              styles.activityMixFill,
                              {
                                backgroundColor: tone.color,
                                width: `${Math.max(share, bucket.count > 0 ? 4 : 0)}%`,
                              },
                            ]}
                          />
                        </View>

                        {typeKey !== "Event" ? (
                          <View style={styles.activityMixChipRow}>
                            <View
                              style={[
                                styles.activityMixChip,
                                { backgroundColor: colors.GREEN_LT },
                              ]}
                            >
                              <Ionicons
                                name="trending-up-outline"
                                size={11}
                                color={colors.GREEN}
                              />
                              <Text
                                style={[styles.activityMixChipText, { color: colors.GREEN }]}
                              >
                                {formatHours(bucket.earnedHours)} earned
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.activityMixChip,
                                { backgroundColor: colors.AMBER_LT },
                              ]}
                            >
                              <Ionicons
                                name="trending-down-outline"
                                size={11}
                                color={colors.AMBER}
                              />
                              <Text
                                style={[styles.activityMixChipText, { color: colors.AMBER }]}
                              >
                                {formatHours(bucket.usedHours)} used
                              </Text>
                            </View>
                          </View>
                        ) : (
                          <View style={styles.activityMixChipRow}>
                            <View
                              style={[
                                styles.activityMixChip,
                                { backgroundColor: tone.bg },
                              ]}
                            >
                              <Text
                                style={[styles.activityMixChipText, { color: tone.color }]}
                              >
                                Time-free sessions
                              </Text>
                            </View>
                          </View>
                        )}

                        <View style={styles.activityMixFooter}>
                          <Ionicons name="time-outline" size={11} color={colors.GRAY500} />
                          <Text style={styles.activityMixFooterText}>
                            Last activity · {lastSeen}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          {activeAgreements.length > 0 ? (
            <View style={styles.sectionCard}>
              <Pressable
                onPress={() => setIsAgreementsOpen((prev) => !prev)}
                style={({ pressed }) => [
                  styles.sectionHeader,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.sectionDot, { backgroundColor: colors.BLUE }]} />
                <View style={styles.sectionHeaderTextWrap}>
                  <Text style={styles.sectionTitle}>Active Agreements</Text>
                  <Text style={styles.sectionDescription}>
                    {activeAgreements.length} ongoing session{activeAgreements.length === 1 ? "" : "s"}
                  </Text>
                </View>
                <View style={styles.sectionHeaderMeta}>
                  <View style={styles.upcomingChip}>
                    <Text style={styles.upcomingChipText}>
                      {activeAgreementDelta !== 0
                        ? `${formatAmount(activeAgreementDelta)} active`
                        : "No time change"}
                    </Text>
                  </View>
                  <Ionicons
                    name={isAgreementsOpen ? "chevron-up" : "chevron-down"}
                    size={20}
                    color={colors.GRAY700}
                  />
                </View>
              </Pressable>

              {isAgreementsOpen ? (
                <View style={styles.agreementsList}>
                  {activeAgreementSections.map((section) => {
                    const sectionTone = typeTone(section.type);
                    const sectionOpen = openAgreementSections[section.type] === true;
                    const sectionTotal = section.items.reduce(
                      (sum, agreement) =>
                        sum +
                        (agreement.expected_delta !== 0
                          ? agreement.expected_delta
                          : agreement.reserved_delta),
                      0,
                    );

                    return (
                      <View key={section.type}>
                        <Pressable
                          onPress={() => toggleAgreementSection(section.type)}
                          style={({ pressed }) => [
                            styles.agreementTypeHeader,
                            { backgroundColor: sectionTone.bg },
                            pressed && styles.pressed,
                          ]}
                        >
                          <View style={styles.agreementTypeTitleRow}>
                            <View
                              style={[
                                styles.agreementTypeDot,
                                { backgroundColor: sectionTone.color },
                              ]}
                            />
                            <Text
                              style={[
                                styles.agreementTypeTitle,
                                { color: sectionTone.color },
                              ]}
                            >
                              {section.type}
                            </Text>
                          </View>
                          <View style={styles.agreementTypeMetaRow}>
                            <Text
                              style={[
                                styles.agreementTypeMeta,
                                { color: sectionTone.color },
                              ]}
                            >
                              {section.items.length} active · {formatAmount(sectionTotal)}
                            </Text>
                            <Ionicons
                              name={sectionOpen ? "chevron-up" : "chevron-down"}
                              size={15}
                              color={sectionTone.color}
                            />
                          </View>
                        </Pressable>

                        {sectionOpen ? section.items.map((agreement, index) => {
                          const accent = roleAccent(agreement.is_current_user_provider);
                          const displayDelta =
                            agreement.expected_delta !== 0
                              ? agreement.expected_delta
                              : agreement.reserved_delta;
                          const valueColor =
                            displayDelta > 0
                              ? colors.GREEN
                              : displayDelta < 0
                                ? colors.AMBER
                                : colors.GRAY700;
                          const valueNote =
                            agreement.expected_delta !== 0
                              ? "After completion"
                              : agreement.reserved_delta !== 0
                                ? "Reserved now"
                                : "No time change";

                          return (
                            <View
                              key={agreement.id}
                              style={[
                                styles.agreementRow,
                                index > 0 && styles.agreementRowBorder,
                              ]}
                            >
                              <View style={styles.agreementLeft}>
                                <View
                                  style={[
                                    styles.iconBadge,
                                    { backgroundColor: accent.bg },
                                  ]}
                                >
                                  <Ionicons
                                    name={accent.icon}
                                    size={16}
                                    color={accent.color}
                                  />
                                </View>
                                <View style={styles.agreementTextWrap}>
                                  <Pressable
                                    onPress={() => openServiceDetail(agreement.service_id)}
                                    disabled={!agreement.service_id}
                                    style={({ pressed }) => pressed && styles.pressed}
                                  >
                                    <Text
                                      style={[
                                        styles.agreementTitle,
                                        agreement.service_id && styles.linkText,
                                      ]}
                                    >
                                      {agreement.service_title}
                                    </Text>
                                  </Pressable>
                                  <View style={styles.compactBadgeRow}>
                                    <Pressable
                                      onPress={() => openPublicProfile(agreement.counterpart_id)}
                                      disabled={!agreement.counterpart_id || agreement.counterpart_id === user?.id}
                                      style={({ pressed }) => [
                                        styles.neutralPill,
                                        pressed && styles.pressed,
                                      ]}
                                    >
                                      <Text style={styles.neutralPillText}>
                                        {agreement.counterpart_name}
                                      </Text>
                                    </Pressable>
                                    <View
                                      style={[
                                        styles.statePill,
                                        { backgroundColor: accent.bg },
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.statePillText,
                                          { color: accent.color },
                                        ]}
                                      >
                                        {agreementRoleLabel(agreement)}
                                      </Text>
                                    </View>
                                    {agreement.service_type ? (
                                      <View style={styles.neutralPill}>
                                        <Text style={styles.neutralPillText}>
                                          {agreement.service_type}
                                        </Text>
                                      </View>
                                    ) : null}
                                    <View style={styles.neutralPill}>
                                      <Text style={styles.neutralPillText}>
                                        {activeHandshakeLabel(agreement.status)}
                                      </Text>
                                    </View>
                                  </View>
                                </View>
                              </View>

                              <View style={styles.agreementRight}>
                                <Text style={[styles.agreementValue, { color: valueColor }]}>
                                  {displayDelta !== 0 ? formatAmount(displayDelta) : "No hours"}
                                </Text>
                                <Text style={styles.agreementNote}>{valueNote}</Text>
                              </View>
                            </View>
                          );
                        }) : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}

          {eventHistory.length > 0 ? (
            <View style={styles.sectionCard}>
              <Pressable
                onPress={() => setIsEventActivityOpen((prev) => !prev)}
                style={({ pressed }) => [
                  styles.sectionHeader,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.sectionDot, { backgroundColor: colors.AMBER }]} />
                <View style={styles.sectionHeaderTextWrap}>
                  <Text style={styles.sectionTitle}>Event Activity</Text>
                  <Text style={styles.sectionDescription}>
                    {eventHistory.length} event{eventHistory.length === 1 ? "" : "s"} joined or completed
                  </Text>
                </View>
                <View style={styles.sectionHeaderMeta}>
                  <View style={[styles.upcomingChip, { backgroundColor: colors.WHITE }]}>
                    <Text style={[styles.upcomingChipText, { color: colors.AMBER }]}>
                      {formatHours(eventHistory.reduce((sum, event) => sum + Number(event.duration || 0), 0))}
                    </Text>
                  </View>
                  <Ionicons
                    name={isEventActivityOpen ? "chevron-up" : "chevron-down"}
                    size={20}
                    color={colors.GRAY700}
                  />
                </View>
              </Pressable>

              {isEventActivityOpen ? (
              <View style={styles.agreementsList}>
                {eventHistory.slice(0, 5).map((event, index) => (
                  <View
                    key={`${event.service_id}-${event.completed_date}-${index}`}
                    style={[
                      styles.agreementRow,
                      index > 0 && styles.agreementRowBorder,
                    ]}
                  >
                    <View style={styles.agreementLeft}>
                      <View
                        style={[
                          styles.iconBadge,
                          { backgroundColor: colors.AMBER_LT },
                        ]}
                      >
                        <Ionicons name="calendar-outline" size={16} color={colors.AMBER} />
                      </View>
                      <View style={styles.agreementTextWrap}>
                        <Pressable
                          onPress={() => openServiceDetail(event.service_id)}
                          disabled={!event.service_id}
                          style={({ pressed }) => pressed && styles.pressed}
                        >
                          <Text
                            style={[
                              styles.agreementTitle,
                              event.service_id && styles.linkText,
                            ]}
                          >
                            {event.service_title}
                          </Text>
                        </Pressable>
                        <View style={styles.compactBadgeRow}>
                          <View style={styles.neutralPill}>
                            <Text style={styles.neutralPillText}>Event</Text>
                          </View>
                          <View style={styles.neutralPill}>
                            <Text style={styles.neutralPillText}>
                              {event.was_provider ? "Organizer" : "Attendee"}
                            </Text>
                          </View>
                          <Pressable
                            onPress={() => openPublicProfile(event.partner_id)}
                            disabled={!event.partner_id || event.partner_id === user?.id}
                            style={({ pressed }) => [
                              styles.neutralPill,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text style={styles.neutralPillText}>
                              {event.partner_name}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>

                    <View style={styles.agreementRight}>
                      <Text style={[styles.agreementValue, { color: colors.AMBER }]}>
                        {formatHours(Number(event.duration))}
                      </Text>
                      <Text style={styles.agreementNote}>
                        {formatDate(event.completed_date)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.filterRow}>
            {FILTERS.map((filter) => {
              const active = filter.key === direction;
              return (
                <Pressable
                  key={filter.key}
                  onPress={() => {
                    if (direction === filter.key) return;
                    setDirection(filter.key);
                  }}
                  style={({ pressed }) => [
                    styles.filterChip,
                    active && styles.filterChipActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      active && styles.filterChipTextActive,
                    ]}
                  >
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {error ? (
            <View style={styles.errorCard}>
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={colors.RED}
              />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </>
      }
      renderItem={({ item }) => {
        const accent = transactionAccent(item);
        const matchingAgreement =
          item.service_id && isServiceLevelNeedTransaction(item)
            ? activeAgreementByServiceId.get(item.service_id)
            : undefined;
        const counterpart =
          matchingAgreement?.counterpart_name ?? transactionCounterpartName(item, user?.id);
        const counterpartId = matchingAgreement?.counterpart_id ?? item.counterpart?.id ?? null;
        const counterpartAvatarUrl =
          matchingAgreement?.counterpart_avatar_url ?? item.counterpart?.avatar_url ?? null;
        const counterpartInitial = counterpart.trim().charAt(0).toUpperCase() || "?";
        const isRefund = item.transaction_type === "refund";
        const isPositive = item.amount >= 0;
        const amountColor = isRefund ? colors.PURPLE : isPositive ? colors.GREEN : colors.AMBER;
        const amountBg = isRefund ? colors.PURPLE_LT : isPositive ? colors.GREEN_LT : colors.AMBER_LT;
        return (
          <View style={styles.transactionCard}>
            <View style={styles.transactionTopRow}>
              <View style={styles.transactionTopLeft}>
                <View style={[styles.iconBadge, { backgroundColor: accent.bg }]}>
                  <Ionicons name={accent.icon} size={18} color={accent.color} />
                </View>
                <Pressable
                  onPress={() => openServiceDetail(item.service_id)}
                  disabled={!item.service_id}
                  style={({ pressed }) => [
                    styles.transactionHeadText,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.transactionAction} numberOfLines={1}>
                    {transactionActionTitle(item)}
                  </Text>
                  <Text
                    style={[
                      styles.transactionService,
                      item.service_id && styles.linkText,
                    ]}
                    numberOfLines={1}
                  >
                    {transactionDisplayTitle(item)}
                  </Text>
                </Pressable>
              </View>
              <View style={[styles.amountPill, { backgroundColor: amountBg }]}>
                <Text style={[styles.amountPillText, { color: amountColor }]}>
                  {formatAmount(item.amount)}
                </Text>
              </View>
            </View>

            <View style={[styles.transactionFooter, { paddingLeft: 46 }]}>
              <Pressable
                onPress={() => openPublicProfile(counterpartId)}
                disabled={!counterpartId || counterpartId === user?.id}
                style={({ pressed }) => [
                  styles.transactionWhoRow,
                  pressed && styles.pressed,
                ]}
              >
                {counterpartAvatarUrl ? (
                  <Image
                    source={{ uri: counterpartAvatarUrl }}
                    style={styles.whoAvatar}
                  />
                ) : (
                  <View style={[styles.whoAvatar, styles.whoAvatarFallback]}>
                    <Text style={styles.whoAvatarInitial}>{counterpartInitial}</Text>
                  </View>
                )}
                <Text style={styles.whoName} numberOfLines={1}>
                  {counterpart}
                </Text>
              </Pressable>
              <Text style={styles.transactionDate}>{formatDate(item.created_at)}</Text>
            </View>

          </View>
        );
      }}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListEmptyComponent={
        isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.GREEN} />
          </View>
        ) : (
          <EmptyState />
        )
      }
      ListFooterComponent={
        transactions.length > 0 ? (
          <View style={styles.footerWrap}>
            {isLoadingMore ? (
              <ActivityIndicator size="small" color={colors.GREEN} />
            ) : hasMore ? (
              <Pressable
                onPress={() => void handleLoadMore()}
                style={({ pressed }) => [
                  styles.loadMoreButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.loadMoreText}>Load more</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null
      }
      ListFooterComponentStyle={{ paddingTop: 16 }}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.GRAY50,
  },
  heroCard: {
    position: "relative",
    overflow: "hidden",
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.GREEN,
    shadowColor: colors.GREEN,
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  heroBlobOne: {
    position: "absolute",
    top: -60,
    right: -50,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  heroBlobTwo: {
    position: "absolute",
    bottom: -70,
    left: -30,
    width: 160,
    height: 160,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  heroHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  heroIconBubble: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.30)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.95)",
  },
  heroValue: {
    fontSize: 48,
    fontWeight: "900",
    color: colors.WHITE,
    lineHeight: 52,
  },
  heroChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    marginBottom: 12,
  },
  heroChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  heroChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.WHITE,
  },
  heroBottomRow: {
    flexDirection: "row",
    gap: 10,
  },
  heroSideCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.20)",
    borderColor: "rgba(255,255,255,0.30)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
  },
  heroSideLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "rgba(255,255,255,0.85)",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  heroPartnerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  heroPartnerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  heroPartnerAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  heroPartnerInitial: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.WHITE,
  },
  heroPartnerName: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.WHITE,
  },
  heroPartnerMeta: {
    fontSize: 9,
    fontWeight: "700",
    color: "rgba(255,255,255,0.85)",
    marginTop: 2,
  },
  heroPulseGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  heroPulseCell: {
    flex: 1,
    minWidth: "46%",
    paddingVertical: 4,
  },
  heroPulseValue: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.WHITE,
    lineHeight: 20,
  },
  heroPulseLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "rgba(255,255,255,0.85)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 3,
  },
  insightCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: colors.WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    padding: 14,
    shadowColor: colors.GRAY900,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  insightHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  insightSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GRAY500,
    lineHeight: 17,
    marginTop: 3,
  },
  insightChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 6,
    flexShrink: 1,
  },
  insightHeaderBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: colors.GREEN_LT,
  },
  insightHeaderBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.GREEN,
  },
  insightPanel: {
    borderRadius: 14,
    backgroundColor: colors.WHITE,
    borderWidth: 1,
    borderColor: colors.GRAY100,
    padding: 12,
    marginBottom: 10,
  },
  insightPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  insightPanelTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.GRAY900,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  insightPanelHint: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.GRAY500,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  calendarLegend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
    justifyContent: "flex-end",
  },
  calendarLegendDot: {
    width: 11,
    height: 11,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(45,92,78,0.18)",
  },
  calendarLegendText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.GRAY500,
  },
  timeFlowRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 4,
    marginBottom: 8,
  },
  timeFlowLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timeFlowDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  timeFlowLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.GRAY600,
  },
  timeFlowValue: {
    fontSize: 18,
    fontWeight: "900",
    marginTop: 2,
  },
  timeFlowTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.GRAY100,
    flexDirection: "row",
    overflow: "hidden",
  },
  timeFlowReceived: {
    backgroundColor: colors.GREEN,
  },
  timeFlowShared: {
    backgroundColor: colors.AMBER,
  },
  calendarCell: {
    width: 17,
    height: 17,
    borderRadius: 6,
    borderWidth: 1,
  },
  calendarCellEmpty: {
    backgroundColor: "#E5E7EB",
    borderColor: colors.GRAY200,
  },
  calendarCellLow: {
    backgroundColor: "#A7F3D0",
    borderColor: "rgba(45,92,78,0.16)",
  },
  calendarCellMedium: {
    backgroundColor: "#34D399",
    borderColor: "rgba(45,92,78,0.16)",
  },
  calendarCellHigh: {
    backgroundColor: colors.GREEN,
    borderColor: "rgba(45,92,78,0.22)",
  },
  activityMixTotal: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.GRAY600,
    backgroundColor: colors.GRAY100,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  activityMixList: {
    gap: 10,
    paddingRight: 8,
  },
  activityMixCard: {
    width: 276,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    backgroundColor: colors.WHITE,
    overflow: "hidden",
  },
  activityMixAccent: {
    height: 3,
    width: "100%",
  },
  activityMixBody: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  activityMixCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  activityMixHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  activityMixDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activityMixType: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.GRAY900,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  activityMixSharePill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  activityMixShareText: {
    fontSize: 10,
    fontWeight: "800",
  },
  activityMixValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  activityMixCount: {
    fontSize: 32,
    fontWeight: "900",
    lineHeight: 34,
    color: colors.GRAY900,
  },
  activityMixCountLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GRAY500,
  },
  activityMixHours: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.GRAY700,
  },
  activityMixTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.GRAY100,
    overflow: "hidden",
  },
  activityMixFill: {
    height: "100%",
    borderRadius: 999,
  },
  activityMixChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  activityMixChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  activityMixChipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  activityMixFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.GRAY100,
  },
  activityMixFooterText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.GRAY600,
  },
  sectionCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: colors.WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    overflow: "hidden",
    shadowColor: colors.GRAY900,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.GRAY50,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY200,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  eventSectionHeader: {
    backgroundColor: colors.GRAY50,
  },
  sectionHeaderTextWrap: {
    flex: 1,
  },
  sectionHeaderMeta: {
    alignItems: "flex-end",
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.GRAY900,
    marginBottom: 3,
  },
  sectionDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.GRAY500,
  },
  upcomingChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.WHITE,
  },
  upcomingChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.BLUE,
  },
  agreementsList: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  agreementTypeHeader: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  agreementTypeTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  agreementTypeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  agreementTypeTitle: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  agreementTypeMeta: {
    fontSize: 11,
    fontWeight: "800",
  },
  agreementTypeMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  agreementRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
  },
  agreementRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.GRAY100,
  },
  agreementLeft: {
    flex: 1,
    flexDirection: "row",
    gap: 10,
  },
  agreementTextWrap: {
    flex: 1,
  },
  agreementTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.GRAY800,
    marginBottom: 4,
  },
  agreementRight: {
    alignItems: "flex-end",
    minWidth: 96,
  },
  agreementValue: {
    fontSize: 14,
    fontWeight: "800",
    marginTop: 2,
  },
  agreementNote: {
    fontSize: 11,
    color: colors.GRAY500,
    textAlign: "right",
    marginTop: 4,
  },
  compactBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  neutralPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.GRAY100,
    alignSelf: "flex-start",
  },
  neutralPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.GRAY600,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    backgroundColor: colors.WHITE,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  filterChipActive: {
    backgroundColor: colors.GREEN,
    borderColor: colors.GREEN,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.GRAY600,
  },
  filterChipTextActive: {
    color: colors.WHITE,
    fontWeight: "700",
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.RED,
    backgroundColor: colors.RED_LT,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: colors.RED,
  },
  transactionCard: {
    marginHorizontal: 16,
    backgroundColor: colors.WHITE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 9,
    shadowColor: colors.GRAY900,
    shadowOpacity: 0.035,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  transactionTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  transactionTopLeft: {
    flex: 1,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  transactionHeadText: {
    flex: 1,
    minWidth: 0,
  },
  transactionAction: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.GRAY800,
  },
  transactionService: {
    fontSize: 13,
    color: colors.GRAY500,
    marginTop: 2,
  },
  amountPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  amountPillText: {
    fontSize: 13,
    fontWeight: "800",
  },
  transactionPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginLeft: 42,
  },
  tagPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  tagPillText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  transactionFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  transactionWhoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  whoAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.GRAY100,
  },
  whoAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  whoAvatarInitial: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.GRAY600,
  },
  whoName: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GRAY700,
    flex: 1,
  },
  transactionDate: {
    fontSize: 12,
    color: colors.GRAY500,
    fontWeight: "500",
  },
  transactionDescription: {
    fontSize: 12,
    color: colors.GRAY500,
    lineHeight: 17,
    marginLeft: 42,
  },
  statePill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statePillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  footerWrap: {
    alignItems: "center",
    paddingHorizontal: 16,
  },
  loadMoreButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    backgroundColor: colors.WHITE,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GRAY700,
  },
  emptyWrap: {
    paddingHorizontal: 24,
    paddingVertical: 48,
    alignItems: "center",
  },
  emptyIconOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.PURPLE_LT,
    marginBottom: 24,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconInner: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.WHITE,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconCore: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.GREEN_LT,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyChipTop: {
    position: "absolute",
    top: 8,
    right: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.AMBER_LT,
  },
  emptyChipTopText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.AMBER,
  },
  emptyChipBottom: {
    position: "absolute",
    bottom: 10,
    left: 0,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.BLUE_LT,
  },
  emptyChipBottomText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.BLUE,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.GRAY800,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.GRAY500,
    textAlign: "center",
  },
  loadingWrap: {
    paddingVertical: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.85,
  },
  linkText: {
    color: colors.GREEN,
    fontWeight: "700",
  },
});
