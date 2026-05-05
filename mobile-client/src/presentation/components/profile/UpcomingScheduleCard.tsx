/**
 * UpcomingScheduleCard – compact schedule preview for ProfileScreen (own profile only).
 *
 * Layout:
 *   - "UPCOMING" eyebrow + "[Open calendar →]" button
 *   - Horizontal 7-day strip (Mon–Sun of current week), each cell with date + colored dots
 *   - Up to 3 next agenda items as compact cards with accent strip
 *   - Empty state if no items
 *
 * Pressing "[Open calendar →]" navigates to CalendarScreen.
 * Pressing an agenda item navigates to the service/event/chat.
 */

import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors } from "../../../constants/colors";
import { fetchUpcoming } from "../../../api/calendar";
import type { CalendarItem } from "../../../api/calendar";
import {
  nextNItems,
  accentColorFor,
  formatItemRange,
  addDays,
  startOfDay,
  toDateString,
} from "../../../utils/calendarItems";
import type { ProfileStackParamList } from "../../../navigation/ProfileStack";

// ── Types ─────────────────────────────────────────────────────────────────

type ScheduleNavigation = NativeStackNavigationProp<ProfileStackParamList>;

interface WeekDay {
  date: Date;
  label: string;
  dayNum: string;
  items: CalendarItem[];
  isToday: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────

// toDateString is imported from utils/calendarItems (shared utility).

const WEEK_DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function buildWeekStrip(items: CalendarItem[], referenceDate: Date): WeekDay[] {
  const today = startOfDay(referenceDate);
  // Find Monday of the current week
  const dayOfWeek = today.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = addDays(today, mondayOffset);

  return WEEK_DAY_LABELS.map((label, i) => {
    const date = addDays(monday, i);
    const dateStart = date.getTime();
    const dateEnd = addDays(date, 1).getTime();

    const dayItems = items.filter((item) => {
      const itemStart = new Date(item.start).getTime();
      return itemStart >= dateStart && itemStart < dateEnd;
    });

    return {
      date,
      label,
      dayNum: String(date.getDate()),
      items: dayItems,
      isToday:
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate(),
    };
  });
}

// ── Week day cell ─────────────────────────────────────────────────────────

function WeekDayCell({
  day,
  selected,
  onPress,
}: {
  day: WeekDay;
  selected: boolean;
  onPress: () => void;
}) {
  const dots = day.items.slice(0, 3);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        cellStyles.cell,
        day.isToday && cellStyles.todayCell,
        selected && cellStyles.selectedCell,
        pressed && { opacity: 0.8 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${day.label} ${day.dayNum}, ${day.items.length} events`}
    >
      <Text
        style={[
          cellStyles.dayLabel,
          day.isToday && cellStyles.todayText,
          selected && cellStyles.selectedText,
        ]}
      >
        {day.label}
      </Text>
      <Text
        style={[
          cellStyles.dayNum,
          day.isToday && cellStyles.todayText,
          selected && cellStyles.selectedText,
        ]}
      >
        {day.dayNum}
      </Text>
      <View style={cellStyles.dots}>
        {dots.map((item) => (
          <View
            key={item.id}
            style={[
              cellStyles.dot,
              { backgroundColor: accentColorFor(item.accent_token) },
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

  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  // `now` is recomputed on each focus so long-running sessions fetch from the
  // correct date rather than a stale mount-time value.
  const [now, setNow] = useState(() => new Date());

  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
      const ac = new AbortController();

      // Refresh the reference date on every focus.
      const focusNow = new Date();
      setNow(focusNow);

      const from = toDateString(focusNow);
      const to = toDateString(addDays(focusNow, 60));

      setLoading(true);
      fetchUpcoming({ from, to }, ac.signal)
        .then((res) => {
          if (!cancelled) setItems(res.items ?? []);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
        ac.abort();
      };
    }, []),
  );

  const weekStrip = useMemo(() => buildWeekStrip(items, now), [items, now]);

  const visibleItems = useMemo(() => {
    if (selectedDayKey) {
      const day = weekStrip.find((d) => toDateString(d.date) === selectedDayKey);
      return day?.items ?? [];
    }
    return nextNItems(items, 3, now);
  }, [items, selectedDayKey, weekStrip, now]);

  const handleItemPress = (item: CalendarItem) => {
    if (item.link.type === "service" && item.service_id) {
      navigation.navigate("ServiceDetail", { id: item.service_id });
      return;
    }
    // chat and event links: navigate to ServiceDetail with link id as fallback
    if (item.link.id) {
      navigation.navigate("ServiceDetail", { id: item.link.id });
    }
  };

  const handleOpenCalendar = () => {
    navigation.navigate("Calendar");
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.eyebrow}>UPCOMING</Text>
        <Pressable
          onPress={handleOpenCalendar}
          style={({ pressed }) => [
            styles.openCalendarButton,
            pressed && { opacity: 0.75 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open full calendar"
        >
          <Text style={styles.openCalendarText}>Open calendar</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.GREEN} />
        </Pressable>
      </View>

      {/* 7-day strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.weekStrip}
      >
        {weekStrip.map((day) => {
          const key = toDateString(day.date);
          return (
            <WeekDayCell
              key={key}
              day={day}
              selected={selectedDayKey === key}
              onPress={() =>
                setSelectedDayKey((prev) => (prev === key ? null : key))
              }
            />
          );
        })}
      </ScrollView>

      {/* Agenda items */}
      <View style={styles.agendaList}>
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
              Nothing on your calendar yet.
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
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 12,
    minWidth: 38,
  },
  todayCell: {
    backgroundColor: colors.GREEN_LT,
  },
  selectedCell: {
    backgroundColor: colors.GREEN,
  },
  dayLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.GRAY500,
    marginBottom: 2,
  },
  dayNum: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.GRAY700,
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
  openCalendarButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  openCalendarText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GREEN,
  },
  weekStrip: {
    gap: 4,
    paddingBottom: 8,
    flexDirection: "row",
  },
  agendaList: {
    marginTop: 4,
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
