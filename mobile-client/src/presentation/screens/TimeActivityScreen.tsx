import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
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

const PAGE_SIZE = 20;
const ACTIVE_HANDSHAKE_STATUSES = new Set(["accepted", "checked_in", "attended"]);

const FILTERS: Array<{ key: TransactionDirection; label: string }> = [
  { key: "all", label: "All" },
  { key: "credit", label: "Received" },
  { key: "debit", label: "Shared" },
];

type ExpectedAgreement = {
  id: string;
  service_title: string;
  service_type?: Handshake["service_type"];
  is_current_user_provider: boolean;
  counterpart_name: string;
  counterpart_avatar_url?: string | null;
  status: Handshake["status"];
  reserved_delta: number;
  expected_delta: number;
  note: string;
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

function transactionCounterpartName(transaction: Transaction): string {
  const counterpart = transaction.counterpart;
  if (!counterpart) return "System";
  const fullName = `${counterpart.first_name ?? ""} ${counterpart.last_name ?? ""}`.trim();
  return fullName || counterpart.email || "Unknown user";
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
): ExpectedAgreement | null {
  const hours = Number(handshake.provisioned_hours ?? 0);
  if (hours <= 0) return null;

  const isProvider = handshake.is_current_user_provider === true;

  return {
    id: handshake.id,
    service_title: String(handshake.service_title ?? "Untitled service"),
    service_type: handshake.service_type,
    is_current_user_provider: isProvider,
    counterpart_name: handshakeCounterpartName(handshake, currentUserName),
    counterpart_avatar_url: handshake.counterpart?.avatar_url ?? null,
    status: handshake.status,
    reserved_delta: isProvider ? 0 : -hours,
    expected_delta: isProvider ? hours : 0,
    note: isProvider
      ? "Time expected after completion"
      : "Already reserved at acceptance",
  };
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
        ? { ...role, stateLabel: "Received" }
        : { ...role, stateLabel: "Shared" };
  }
}

function roleLabel(isCurrentUserProvider?: boolean) {
  return isCurrentUserProvider ? "Provider" : "Receiver";
}

function SummaryCard({
  label,
  value,
  accent,
  signed = false,
}: {
  label: string;
  value: number;
  accent: { color: string; bg: string };
  signed?: boolean;
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <View style={[styles.summaryValuePill, { backgroundColor: accent.bg }]}>
        <Text style={[styles.summaryValueText, { color: accent.color }]}>
          {signed ? formatAmount(value) : formatHours(value)}
        </Text>
      </View>
    </View>
  );
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
        Your shared time activity will appear here once you start completing exchanges with other members.
      </Text>
    </View>
  );
}

export default function TimeActivityScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const currentUserName = `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<TransactionSummary>(EMPTY_SUMMARY);
  const [activeAgreements, setActiveAgreements] = useState<ExpectedAgreement[]>([]);
  const [direction, setDirection] = useState<TransactionDirection>("all");
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isAgreementsOpen, setIsAgreementsOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(count / PAGE_SIZE)),
    [count],
  );
  const hasMore = page < totalPages;
  const upcomingDelta = useMemo(
    () => activeAgreements.reduce((sum, item) => sum + item.expected_delta, 0),
    [activeAgreements],
  );
  const expectedBalance = useMemo(
    () => summary.current_balance + upcomingDelta,
    [summary.current_balance, upcomingDelta],
  );

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
        .map((handshake) => toExpectedAgreement(handshake, currentUserName))
        .filter((item): item is ExpectedAgreement => item !== null);

      setActiveAgreements(nextAgreements);
    } catch {
      setActiveAgreements([]);
    }
  }, [currentUserName]);

  useEffect(() => {
    void loadTransactions(1, "replace");
  }, [direction, loadTransactions]);

  useEffect(() => {
    void loadAgreements();
  }, [loadAgreements]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([loadTransactions(1, "replace"), loadAgreements()]);
    setIsRefreshing(false);
  }, [loadAgreements, loadTransactions]);

  const handleLoadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || isLoading) return;
    await loadTransactions(page + 1, "append");
  }, [hasMore, isLoading, isLoadingMore, loadTransactions, page]);

  const summaryCards = [
    {
      key: "available",
      label: "Time Available",
      value: summary.current_balance,
      accent: { color: colors.PURPLE, bg: colors.PURPLE_LT },
      signed: false,
    },
    {
      key: "upcoming",
      label: "Upcoming Time",
      value: expectedBalance,
      accent: { color: colors.BLUE, bg: colors.BLUE_LT },
      signed: true,
    },
    {
      key: "received",
      label: "Time Received",
      value: summary.total_earned,
      accent: { color: colors.GREEN, bg: colors.GREEN_LT },
      signed: false,
    },
    {
      key: "shared",
      label: "Time Shared",
      value: summary.total_spent,
      accent: { color: colors.RED, bg: colors.RED_LT },
      signed: false,
    },
  ];

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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.summaryRow}
          >
            {summaryCards.map((card) => (
              <SummaryCard
                key={card.key}
                label={card.label}
                value={card.value}
                accent={card.accent}
                signed={card.signed}
              />
            ))}
          </ScrollView>

          {activeAgreements.length > 0 ? (
            <View style={styles.sectionCard}>
              <Pressable
                onPress={() => setIsAgreementsOpen((prev) => !prev)}
                style={({ pressed }) => [
                  styles.sectionHeader,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.sectionHeaderTextWrap}>
                  <Text style={styles.sectionTitle}>Active Agreements</Text>
                  <Text style={styles.sectionDescription}>
                    Upcoming shows what will change after completion.
                  </Text>
                </View>
                <View style={styles.sectionHeaderMeta}>
                  <View style={styles.upcomingChip}>
                    <Text style={styles.upcomingChipText}>
                      {upcomingDelta !== 0
                        ? `Upcoming ${formatAmount(upcomingDelta)}`
                        : "No upcoming change"}
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
                  {activeAgreements.map((agreement, index) => {
                    const accent = roleAccent(agreement.is_current_user_provider);
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
                            <Text style={styles.agreementTitle}>
                              {agreement.service_title}
                            </Text>
                            <View style={styles.compactBadgeRow}>
                              <View style={styles.neutralPill}>
                                <Text style={styles.neutralPillText}>
                                  {agreement.counterpart_name}
                                </Text>
                              </View>
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
                                  {roleLabel(agreement.is_current_user_provider)}
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
                          {agreement.reserved_delta !== 0 ? (
                            <View
                              style={[
                                styles.statePill,
                                { backgroundColor: colors.RED_LT, marginBottom: 6 },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.statePillText,
                                  { color: colors.RED },
                                ]}
                              >
                                Reserved {formatAmount(agreement.reserved_delta)}
                              </Text>
                            </View>
                          ) : null}
                          <Text
                            style={[
                              styles.agreementValue,
                              {
                                color:
                                  agreement.expected_delta > 0
                                    ? colors.GREEN
                                    : agreement.expected_delta < 0
                                      ? colors.RED
                                      : colors.GRAY700,
                              },
                            ]}
                          >
                            {agreement.expected_delta !== 0
                              ? formatAmount(agreement.expected_delta)
                              : "No change"}
                          </Text>
                          <Text style={styles.agreementNote}>Upcoming</Text>
                        </View>
                      </View>
                    );
                  })}
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
        return (
          <View style={styles.transactionCard}>
            <View style={styles.transactionLeft}>
              <View style={[styles.iconBadge, { backgroundColor: accent.bg }]}>
                <Ionicons name={accent.icon} size={16} color={accent.color} />
              </View>
              <View style={styles.transactionTextWrap}>
                <Text style={styles.transactionTitle}>
                  {item.service_title || "System update"}
                </Text>
                <View style={styles.compactBadgeRow}>
                  <View
                    style={[
                      styles.statePill,
                      { backgroundColor: accent.bg },
                    ]}
                  >
                    <Text style={[styles.statePillText, { color: accent.color }]}>
                      {accent.stateLabel}
                    </Text>
                  </View>
                  <View style={styles.neutralPill}>
                    <Text style={styles.neutralPillText}>
                      {transactionCounterpartName(item)}
                    </Text>
                  </View>
                  <View style={styles.neutralPill}>
                    <Text style={styles.neutralPillText}>
                      {roleLabel(item.is_current_user_provider)}
                    </Text>
                  </View>
                  {item.service_type ? (
                    <View style={styles.neutralPill}>
                      <Text style={styles.neutralPillText}>{item.service_type}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.transactionDate}>{formatDate(item.created_at)}</Text>
              </View>
            </View>

            <View style={styles.transactionRight}>
              <Text
                style={[
                  styles.transactionAmount,
                  { color: item.amount >= 0 ? colors.GREEN : colors.RED },
                ]}
              >
                {formatAmount(item.amount)}
              </Text>
            </View>
          </View>
        );
      }}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
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
  summaryRow: {
    paddingHorizontal: 16,
    gap: 10,
    paddingTop: 2,
    paddingBottom: 14,
  },
  summaryCard: {
    width: 154,
    backgroundColor: colors.WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    padding: 14,
    shadowColor: colors.GRAY900,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: colors.GRAY500,
    marginBottom: 12,
  },
  summaryValuePill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  summaryValueText: {
    fontSize: 13,
    fontWeight: "700",
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
    backgroundColor: colors.BLUE_LT,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY200,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
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
    fontWeight: "600",
    color: colors.GRAY700,
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.GRAY600,
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
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    backgroundColor: colors.WHITE,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  filterChipActive: {
    backgroundColor: colors.GREEN_LT,
    borderColor: colors.GREEN,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GRAY600,
  },
  filterChipTextActive: {
    color: colors.GREEN,
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    shadowColor: colors.GRAY900,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  transactionLeft: {
    flex: 1,
    flexDirection: "row",
    gap: 10,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  transactionTextWrap: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.GRAY800,
    marginBottom: 6,
  },
  transactionDate: {
    fontSize: 11,
    color: colors.GRAY400,
    marginTop: 6,
  },
  transactionRight: {
    alignItems: "flex-end",
    minWidth: 82,
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 4,
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
});
