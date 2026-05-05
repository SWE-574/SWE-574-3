/**
 * UpcomingScheduleCard – compact schedule preview for ProfileScreen (own profile only).
 *
 * Layout:
 *   - "UPCOMING" eyebrow
 *   - Inline month calendar grid
 *   - Selected-day agenda items
 *   - Empty state if selected day has no items
 *
 * Pressing an agenda item navigates to the related service detail.
 */

import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors } from "../../../constants/colors";
import { fetchUpcoming } from "../../../api/calendar";
import type { CalendarConflict, CalendarItem } from "../../../api/calendar";
import { useAuth } from "../../../context/AuthContext";
import {
  accentColorFor,
  formatItemRange,
  buildMonthGrid,
  profileCalendarFetchRange,
  startOfDay,
  toDateString,
} from "../../../utils/calendarItems";
import type { ProfileStackParamList } from "../../../navigation/ProfileStack";

// ── Types ─────────────────────────────────────────────────────────────────

type ScheduleNavigation = NativeStackNavigationProp<ProfileStackParamList>;

// ── Helpers ───────────────────────────────────────────────────────────────

const MONTH_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function formatMonth(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatSelectedDay(dayKey: string | null): string {
  if (!dayKey) return "Select a day";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(new Date(`${dayKey}T12:00:00`));
}

// ── Month day cell ────────────────────────────────────────────────────────

function MonthDayCell({
  cell,
  selected,
  onPress,
}: {
  cell: ReturnType<typeof buildMonthGrid>[number][number];
  selected: boolean;
  onPress: () => void;
}) {
  const dots = cell.items.slice(0, 4);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        cellStyles.cell,
        !cell.isCurrentMonth && cellStyles.outsideMonthCell,
        cell.isToday && cellStyles.todayCell,
        cell.hasConflict && !selected && cellStyles.conflictCell,
        selected && cellStyles.selectedCell,
        pressed && { opacity: 0.8 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${cell.date.getDate()}, ${cell.items.length} events`}
    >
      <Text
        style={[
          cellStyles.dayNum,
          !cell.isCurrentMonth && cellStyles.outsideMonthText,
          cell.isToday && cellStyles.todayText,
          selected && cellStyles.selectedText,
        ]}
      >
        {cell.date.getDate()}
      </Text>
      <View style={cellStyles.dots}>
        {dots.map((item) => (
          <View
            key={item.id}
            style={[
              cellStyles.dot,
              { backgroundColor: accentColorFor(item.accent_token) },
              selected && { backgroundColor: colors.WHITE },
            ]}
          />
        ))}
      </View>
    </Pressable>
  );
}

// ── Agenda item card ──────────────────────────────────────────────────────

function AgendaItemCard({
  item,
  onPress,
}: {
  item: CalendarItem;
  onPress: () => void;
}) {
  const accentColor = accentColorFor(item.accent_token);
  const timeStr = formatItemRange(item);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        agendaStyles.card,
        pressed && { opacity: 0.88 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${timeStr}`}
    >
      <View
        style={[agendaStyles.accentStrip, { backgroundColor: accentColor }]}
      />
      <View style={agendaStyles.cardContent}>
        <Text style={agendaStyles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={agendaStyles.time} numberOfLines={1}>
          {timeStr}
        </Text>
        {item.counterpart ? (
          <Text style={agendaStyles.counterpart} numberOfLines={1}>
            with {item.counterpart.name}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.GRAY400} />
    </Pressable>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function UpcomingScheduleCard() {
  const navigation = useNavigation<ScheduleNavigation>();
  const { user } = useAuth();

  const [items, setItems] = useState<CalendarItem[]>([]);
  const [conflicts, setConflicts] = useState<CalendarConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(() =>
    toDateString(new Date()),
  );
  const [currentMonth, setCurrentMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
      const ac = new AbortController();

      // Refresh the reference date on every focus.
      const focusNow = new Date();
      setCurrentMonth(new Date(focusNow.getFullYear(), focusNow.getMonth(), 1));
      setSelectedDayKey(toDateString(focusNow));

      const { from, to } = profileCalendarFetchRange(focusNow, user?.date_joined);

      setLoading(true);
      fetchUpcoming({ from, to }, ac.signal)
        .then((res) => {
          if (!cancelled) {
            setItems(res.items ?? []);
            setConflicts(res.conflicts ?? []);
          }
        })
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
    }, [user?.date_joined]),
  );

  const monthGrid = useMemo(
    () => buildMonthGrid(currentMonth, items, conflicts),
    [currentMonth, items, conflicts],
  );

  const visibleItems = useMemo(() => {
    if (!selectedDayKey) return [];
    return items
      .filter((item) => toDateString(startOfDay(new Date(item.start))) === selectedDayKey)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [items, selectedDayKey]);

  const handleItemPress = (item: CalendarItem) => {
    if (item.service_id) {
      navigation.navigate("ServiceDetail", { id: item.service_id });
      return;
    }
    if (item.link.id) {
      navigation.navigate("ServiceDetail", { id: item.link.id });
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.eyebrow}>UPCOMING</Text>
      </View>

      <View style={styles.monthHeader}>
        <View style={styles.monthNav}>
          <Pressable
            onPress={() => setCurrentMonth((prev) => addMonths(prev, -1))}
            style={styles.monthNavButton}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
          >
            <Ionicons name="chevron-back" size={16} color={colors.GRAY700} />
          </Pressable>
          <Pressable
            onPress={() => setCurrentMonth((prev) => addMonths(prev, 1))}
            style={styles.monthNavButton}
            accessibilityRole="button"
            accessibilityLabel="Next month"
          >
            <Ionicons name="chevron-forward" size={16} color={colors.GRAY700} />
          </Pressable>
        </View>
        <Text style={styles.monthTitle}>{formatMonth(currentMonth)}</Text>
        <Pressable
          onPress={() => {
            const today = new Date();
            setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
            setSelectedDayKey(toDateString(today));
          }}
          style={styles.todayButton}
          accessibilityRole="button"
          accessibilityLabel="Go to today"
        >
          <Text style={styles.todayText}>Today</Text>
        </Pressable>
      </View>

      <View style={styles.dayLabels}>
        {MONTH_DAY_LABELS.map((label) => (
          <Text key={label} style={styles.dayHeaderText}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.monthGrid}>
        {monthGrid.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.monthRow}>
            {week.map((cell) => {
              const key = toDateString(cell.date);
              return (
                <MonthDayCell
                  key={key}
                  cell={cell}
                  selected={selectedDayKey === key}
                  onPress={() => setSelectedDayKey(key)}
                />
              );
            })}
          </View>
        ))}
      </View>

      {/* Agenda items */}
      <View style={styles.agendaList}>
        <Text style={styles.selectedDayTitle}>
          {formatSelectedDay(selectedDayKey)}
        </Text>
        {loading ? (
          <ActivityIndicator
            size="small"
            color={colors.GREEN}
            style={{ paddingVertical: 16 }}
          />
        ) : visibleItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="calendar-outline"
              size={24}
              color={colors.GRAY400}
            />
            <Text style={styles.emptyText}>
              Nothing scheduled on this day.
            </Text>
          </View>
        ) : (
          visibleItems.map((item) => (
            <AgendaItemCard
              key={item.id}
              item={item}
              onPress={() => handleItemPress(item)}
            />
          ))
        )}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const cellStyles = StyleSheet.create({
  cell: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    borderRadius: 10,
    flex: 1,
    minHeight: 42,
  },
  outsideMonthCell: {
    opacity: 0.45,
  },
  todayCell: {
    backgroundColor: colors.GREEN_LT,
  },
  conflictCell: {
    borderWidth: 1,
    borderColor: `${colors.AMBER}66`,
  },
  selectedCell: {
    backgroundColor: colors.GREEN,
  },
  dayNum: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.GRAY700,
  },
  outsideMonthText: {
    color: colors.GRAY400,
  },
  todayText: {
    color: colors.GREEN,
  },
  selectedText: {
    color: colors.WHITE,
  },
  dots: {
    flexDirection: "row",
    gap: 2,
    marginTop: 3,
    minHeight: 6,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
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
  accentStrip: {
    width: 4,
    alignSelf: "stretch",
  },
  cardContent: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.GRAY800,
    marginBottom: 2,
  },
  time: {
    fontSize: 12,
    color: colors.GRAY500,
    marginBottom: 1,
  },
  counterpart: {
    fontSize: 11,
    color: colors.GRAY400,
    fontStyle: "italic",
  },
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.WHITE,
    marginHorizontal: 16,
    marginTop: 14,
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: colors.GRAY500,
    textTransform: "uppercase",
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  monthNav: {
    flexDirection: "row",
    gap: 6,
  },
  monthNavButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.WHITE,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.GRAY800,
  },
  todayButton: {
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: colors.GREEN_LT,
  },
  todayText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.GREEN,
  },
  dayLabels: {
    flexDirection: "row",
    marginBottom: 4,
  },
  dayHeaderText: {
    flex: 1,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "800",
    color: colors.GRAY400,
  },
  monthGrid: {
    gap: 2,
  },
  monthRow: {
    flexDirection: "row",
    gap: 2,
  },
  agendaList: {
    marginTop: 12,
  },
  selectedDayTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.GRAY500,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: colors.GRAY500,
    textAlign: "center",
  },
});
