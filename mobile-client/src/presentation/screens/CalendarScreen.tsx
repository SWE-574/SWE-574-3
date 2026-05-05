/**
 * CalendarScreen – full calendar view pushed from ProfileScreen.
 *
 * Layout (vertical stack):
 *   - Month grid header (prev/next chevrons, month title)
 *   - 7-column month grid (6 rows, today ringed, colored dots per item type)
 *   - Agenda list below: filtered by selected day if set, else grouped
 *     Today / Tomorrow / This week / Later
 *   - Empty state when no items
 *
 * No external calendar library – pure RN.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/colors";
import { fetchUpcoming } from "../../api/calendar";
import type { CalendarItem, CalendarConflict } from "../../api/calendar";
import {
  buildMonthGrid,
  groupItemsByAgenda,
  accentColorFor,
  formatItemRange,
  conflictMap,
  addDays,
  startOfDay,
  toDateString,
} from "../../utils/calendarItems";
import type { ProfileStackParamList } from "../../navigation/ProfileStack";

// ── Types ─────────────────────────────────────────────────────────────────

type CalNavigation = NativeStackNavigationProp<ProfileStackParamList>;

// ── Helpers ───────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_HEADERS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

// toDateString is imported from utils/calendarItems (shared utility).

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

// ── Month grid cell ───────────────────────────────────────────────────────

function GridCell({
  cell,
  selected,
  conflictItemIds,
  onPress,
}: {
  cell: ReturnType<typeof buildMonthGrid>[number][number];
  selected: boolean;
  conflictItemIds: Set<string>;
  onPress: () => void;
}) {
  const hasConflict = cell.items.some((item) => conflictItemIds.has(item.id));

  const dots = cell.items.slice(0, 3);

  return (
    <Pressable
      onPress={cell.isCurrentMonth ? onPress : undefined}
      style={({ pressed }) => [
        gridStyles.cell,
        cell.isToday && gridStyles.todayCell,
        selected && gridStyles.selectedCell,
        !cell.isCurrentMonth && gridStyles.otherMonthCell,
        pressed && cell.isCurrentMonth && { opacity: 0.8 },
      ]}
      accessibilityRole={cell.isCurrentMonth ? "button" : "none"}
      accessibilityLabel={`${cell.date.getDate()}, ${cell.items.length} events${hasConflict ? ", conflict" : ""}`}
    >
      <Text
        style={[
          gridStyles.dayNum,
          cell.isToday && gridStyles.todayDayNum,
          selected && gridStyles.selectedDayNum,
          !cell.isCurrentMonth && gridStyles.otherMonthDayNum,
        ]}
      >
        {cell.date.getDate()}
      </Text>

      <View style={gridStyles.dotsRow}>
        {dots.map((item, i) => (
          <View
            key={`${item.id}-${i}`}
            style={[
              gridStyles.dot,
              { backgroundColor: accentColorFor(item.accent_token) },
            ]}
          />
        ))}
        {hasConflict && (
          <View style={[gridStyles.dot, { backgroundColor: colors.AMBER }]} />
        )}
      </View>
    </Pressable>
  );
}

// ── Agenda item row ───────────────────────────────────────────────────────

function AgendaItemRow({
  item,
  conflictIds,
  onPress,
}: {
  item: CalendarItem;
  conflictIds: Set<string>;
  onPress: () => void;
}) {
  const accentColor = accentColorFor(item.accent_token);
  const timeStr = formatItemRange(item);
  const hasConflict = conflictIds.has(item.id);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        agendaStyles.card,
        hasConflict && agendaStyles.conflictCard,
        pressed && { opacity: 0.88 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${timeStr}${hasConflict ? ", conflict" : ""}`}
    >
      <View style={[agendaStyles.strip, { backgroundColor: accentColor }]} />
      <View style={agendaStyles.content}>
        <View style={agendaStyles.titleRow}>
          <Text style={agendaStyles.title} numberOfLines={1}>
            {item.title}
          </Text>
          {hasConflict && (
            <View
              style={agendaStyles.conflictChip}
              accessibilityLabel={`Conflicts with overlapping items`}
            >
              <Ionicons
                name="warning-outline"
                size={12}
                color={colors.AMBER}
              />
              <Text style={agendaStyles.conflictChipText}>Conflict</Text>
            </View>
          )}
        </View>

        <Text style={agendaStyles.time}>{timeStr}</Text>

        <View style={agendaStyles.metaRow}>
          {item.counterpart ? (
            <Text style={agendaStyles.counterpart} numberOfLines={1}>
              with {item.counterpart.name}
            </Text>
          ) : null}
          <View style={agendaStyles.locationPill}>
            <Ionicons
              name={
                item.location_type === "Online"
                  ? "videocam-outline"
                  : "location-outline"
              }
              size={11}
              color={colors.GRAY500}
            />
            <Text style={agendaStyles.locationText} numberOfLines={1}>
              {item.location_label ?? item.location_type}
            </Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.GRAY400} />
    </Pressable>
  );
}

// ── Agenda section header ─────────────────────────────────────────────────

function AgendaSectionHeader({ label }: { label: string }) {
  return (
    <View style={sectionStyles.header}>
      <Text style={sectionStyles.label}>{label}</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const navigation = useNavigation<CalNavigation>();

  const [items, setItems] = useState<CalendarItem[]>([]);
  const [conflicts, setConflicts] = useState<CalendarConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const refreshAbortRef = useRef<AbortController | null>(null);

  const today = useMemo(() => startOfDay(new Date()), []);
  const [currentMonth, setCurrentMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // TODO: Widen fetch window dynamically when currentMonth shifts beyond the
  //       60-day cap (i.e. track currentMonth in fetchData and refetch with
  //       from=startOfMonth-1m, to=endOfMonth+1m, capped at 120 days/request).
  //       For now we use the simpler approach: disable the [>] button once the
  //       user would navigate past the last fetched month (today+60d).
  const maxFetchedMonth = useMemo(() => {
    const limit = addDays(today, 60);
    return new Date(limit.getFullYear(), limit.getMonth(), 1);
  }, [today]);
  const isNextMonthDisabled = useMemo(
    () => currentMonth >= maxFetchedMonth,
    [currentMonth, maxFetchedMonth],
  );

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    const from = toDateString(today);
    const to = toDateString(addDays(today, 60));
    const res = await fetchUpcoming({ from, to }, signal);
    setItems(res.items ?? []);
    setConflicts(res.conflicts ?? []);
  }, [today]);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    setLoading(true);
    fetchData(ac.signal)
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setConflicts([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    // Cancel any in-flight refresh before starting a new one.
    refreshAbortRef.current?.abort();
    setRefreshing(true);
    const ac = new AbortController();
    refreshAbortRef.current = ac;
    fetchData(ac.signal)
      .catch(() => {})
      .finally(() => {
        if (!ac.signal.aborted) setRefreshing(false);
      });
  }, [fetchData]);

  // Abort any pending refresh when the screen unmounts.
  useEffect(() => {
    return () => { refreshAbortRef.current?.abort(); };
  }, []);

  // Build grid
  const monthGrid = useMemo(
    () => buildMonthGrid(currentMonth, items, conflicts),
    [currentMonth, items, conflicts],
  );

  // Build conflict set
  const conflictIds = useMemo(
    () => new Set<string>(conflicts.flatMap((c) => [c.item_id, ...c.overlaps_with])),
    [conflicts],
  );

  // Agenda data
  const agendaItems = useMemo(() => {
    if (selectedDay) {
      return items
        .filter((item) => {
          const itemDay = toDateString(startOfDay(new Date(item.start)));
          return itemDay === selectedDay;
        })
        .sort(
          (a, b) =>
            new Date(a.start).getTime() - new Date(b.start).getTime(),
        );
    }
    return null;
  }, [items, selectedDay]);

  const groups = useMemo(() => {
    if (agendaItems !== null) return null;
    return groupItemsByAgenda(items);
  }, [items, agendaItems]);

  const handleItemPress = (item: CalendarItem) => {
    if (item.link.type === "service" && item.service_id) {
      navigation.navigate("ServiceDetail", { id: item.service_id });
      return;
    }
    if (item.link.id) {
      navigation.navigate("ServiceDetail", { id: item.link.id });
    }
  };

  // ── Render agenda section ──
  const renderAgendaSection = (label: string, sectionItems: CalendarItem[]) => {
    if (sectionItems.length === 0) return null;
    return (
      <View key={label}>
        <AgendaSectionHeader label={label} />
        {sectionItems.map((item) => (
          <AgendaItemRow
            key={item.id}
            item={item}
            conflictIds={conflictIds}
            onPress={() => handleItemPress(item)}
          />
        ))}
      </View>
    );
  };

  const totalItems =
    groups
      ? groups.today.length +
        groups.tomorrow.length +
        groups.thisWeek.length +
        groups.later.length
      : (agendaItems?.length ?? 0);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.GREEN}
          />
        }
      >
        {/* ── Month grid section ── */}
        <View style={styles.monthSection}>
          {/* Month navigation header */}
          <View style={styles.monthHeader}>
            <Pressable
              onPress={() => setCurrentMonth((m) => addMonths(m, -1))}
              style={({ pressed }) => [styles.monthNav, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
            >
              <Ionicons name="chevron-back" size={22} color={colors.GRAY700} />
            </Pressable>

            <Text style={styles.monthTitle}>
              {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </Text>

            <Pressable
              onPress={isNextMonthDisabled ? undefined : () => setCurrentMonth((m) => addMonths(m, 1))}
              style={({ pressed }) => [
                styles.monthNav,
                isNextMonthDisabled && styles.monthNavDisabled,
                pressed && !isNextMonthDisabled && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                isNextMonthDisabled
                  ? "Showing next 60 days only"
                  : "Next month"
              }
              accessibilityState={{ disabled: isNextMonthDisabled }}
            >
              <Ionicons
                name="chevron-forward"
                size={22}
                color={isNextMonthDisabled ? colors.GRAY300 : colors.GRAY700}
              />
            </Pressable>
          </View>

          {/* Day-of-week headers */}
          <View style={styles.dayHeaders}>
            {DAY_HEADERS.map((d) => (
              <Text key={d} style={styles.dayHeader}>
                {d}
              </Text>
            ))}
          </View>

          {/* Month grid */}
          {loading ? (
            <ActivityIndicator
              color={colors.GREEN}
              style={{ paddingVertical: 32 }}
            />
          ) : (
            monthGrid.map((week, weekIndex) => (
              <View key={weekIndex} style={styles.weekRow}>
                {week.map((cell, dayIndex) => {
                  const key = toDateString(cell.date);
                  return (
                    <GridCell
                      key={`${weekIndex}-${dayIndex}`}
                      cell={cell}
                      selected={selectedDay === key}
                      conflictItemIds={conflictIds}
                      onPress={() =>
                        setSelectedDay((prev) =>
                          prev === key ? null : key,
                        )
                      }
                    />
                  );
                })}
              </View>
            ))
          )}

          {selectedDay ? (
            <Pressable
              onPress={() => setSelectedDay(null)}
              style={({ pressed }) => [
                styles.clearDayButton,
                pressed && { opacity: 0.75 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Show all upcoming events"
            >
              <Text style={styles.clearDayText}>Show all upcoming</Text>
            </Pressable>
          ) : null}
        </View>

        {/* ── Agenda section ── */}
        <View style={styles.agendaSection}>
          <View style={styles.agendaHeader}>
            <Text style={styles.agendaEyebrow}>
              {selectedDay
                ? new Intl.DateTimeFormat("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  }).format(new Date(selectedDay))
                : "UPCOMING"}
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator
              color={colors.GREEN}
              style={{ paddingVertical: 20 }}
            />
          ) : totalItems === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={40} color={colors.GRAY300} />
              <Text style={styles.emptyTitle}>
                Nothing on your calendar yet.
              </Text>
              <Text style={styles.emptySubtitle}>
                Accept an exchange or join an event to get started.
              </Text>
            </View>
          ) : agendaItems !== null ? (
            // Selected day items
            agendaItems.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No events on this day.</Text>
              </View>
            ) : (
              agendaItems.map((item) => (
                <AgendaItemRow
                  key={item.id}
                  item={item}
                  conflictIds={conflictIds}
                  onPress={() => handleItemPress(item)}
                />
              ))
            )
          ) : (
            // All grouped
            groups ? (
              <>
                {renderAgendaSection("Today", groups.today)}
                {renderAgendaSection("Tomorrow", groups.tomorrow)}
                {renderAgendaSection("This week", groups.thisWeek)}
                {renderAgendaSection("Later", groups.later)}
              </>
            ) : null
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const gridStyles = StyleSheet.create({
  cell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 5,
    borderRadius: 10,
    minHeight: 44,
  },
  todayCell: {
    borderWidth: 2,
    borderColor: colors.GREEN,
  },
  selectedCell: {
    backgroundColor: colors.GREEN,
  },
  otherMonthCell: {
    opacity: 0.35,
  },
  dayNum: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GRAY700,
  },
  todayDayNum: {
    color: colors.GREEN,
    fontWeight: "800",
  },
  selectedDayNum: {
    color: colors.WHITE,
    fontWeight: "800",
  },
  otherMonthDayNum: {
    color: colors.GRAY400,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 2,
    marginTop: 2,
    minHeight: 5,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});

const agendaStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    overflow: "hidden",
    marginBottom: 8,
  },
  conflictCard: {
    borderColor: colors.AMBER,
  },
  strip: {
    width: 4,
    alignSelf: "stretch",
  },
  content: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: colors.GRAY800,
  },
  conflictChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.AMBER_LT,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  conflictChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.AMBER,
  },
  time: {
    fontSize: 12,
    color: colors.GRAY500,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  counterpart: {
    fontSize: 11,
    color: colors.GRAY400,
    fontStyle: "italic",
    flexShrink: 1,
  },
  locationPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.GRAY100,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  locationText: {
    fontSize: 10,
    color: colors.GRAY600,
    fontWeight: "600",
  },
});

const sectionStyles = StyleSheet.create({
  header: {
    paddingVertical: 8,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY100,
    marginTop: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: colors.GRAY500,
    textTransform: "uppercase",
  },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.GRAY50,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  // Month section
  monthSection: {
    backgroundColor: colors.WHITE,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    padding: 14,
    shadowColor: colors.GRAY900,
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  monthNav: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: colors.GRAY100,
  },
  monthNavDisabled: {
    opacity: 0.4,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.GRAY800,
  },
  dayHeaders: {
    flexDirection: "row",
    marginBottom: 4,
  },
  dayHeader: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    color: colors.GRAY400,
    paddingVertical: 4,
  },
  weekRow: {
    flexDirection: "row",
  },
  clearDayButton: {
    alignSelf: "center",
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.GREEN_LT,
  },
  clearDayText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.GREEN,
  },
  // Agenda section
  agendaSection: {
    marginHorizontal: 16,
    marginTop: 14,
  },
  agendaHeader: {
    marginBottom: 10,
  },
  agendaEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: colors.GRAY500,
    textTransform: "uppercase",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.GRAY700,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.GRAY500,
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: 16,
  },
});
