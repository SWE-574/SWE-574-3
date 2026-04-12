import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ProfileStackParamList } from "../../navigation/ProfileStack";
import { getAchievementProgress } from "../../api/achievementProgress";
import type { AchievementProgressItem } from "../../api/achievementProgress";
import { getAchievementMeta } from "../../utils/achievementMeta";
import { colors } from "../../constants/colors";

function formatEarnedDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const headerBackStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: Platform.OS === "ios" ? 2 : 0,
    paddingVertical: 4,
    paddingRight: 10,
  },
  label: {
    fontSize: 17,
    color: "#1a1a1a",
    marginLeft: -6,
  },
});

export default function AchievementsListScreen() {
  const route =
    useRoute<RouteProp<ProfileStackParamList, "AchievementsList">>();
  const navigation =
    useNavigation<
      NativeStackNavigationProp<ProfileStackParamList, "AchievementsList">
    >();
  const { userId } = route.params;
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => getStyles(insets.bottom),
    [insets.bottom],
  );

  const goBackSafe = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate("ProfileHome");
    }
  }, [navigation]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <Pressable
          onPress={goBackSafe}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
          style={headerBackStyles.row}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons
            name="chevron-back"
            size={Platform.OS === "ios" ? 28 : 24}
            color="#1a1a1a"
          />
          <Text style={headerBackStyles.label}>Back</Text>
        </Pressable>
      ),
    });
  }, [navigation, goBackSafe]);

  const [items, setItems] = useState<AchievementProgressItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AchievementProgressItem | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAchievementProgress(userId);
      const sorted = [...data].sort((a, b) => {
        if (a.earned !== b.earned) return a.earned ? -1 : 1;
        return (
          (b.achievement.karma_points ?? 0) - (a.achievement.karma_points ?? 0)
        );
      });
      setItems(sorted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load achievements.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const earnedItems = useMemo(
    () => items.filter((item) => item.earned),
    [items],
  );
  const lockedItems = useMemo(
    () => items.filter((item) => !item.earned),
    [items],
  );
  const totalXp = useMemo(
    () =>
      earnedItems.reduce(
        (sum, item) => sum + (item.achievement.karma_points ?? 0),
        0,
      ),
    [earnedItems],
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <Text style={styles.pageTitle}>Achievements</Text>
          <Text style={styles.pageSubtitle}>
            Track the milestones unlocked and what you can work toward next in
            the community.
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <SummaryCard
            label="Unlocked"
            value={earnedItems.length}
            icon="ribbon-outline"
            accent={colors.GREEN}
            iconBg={colors.GREEN_LT}
          />
          <SummaryCard
            label="Locked"
            value={lockedItems.length}
            icon="lock-closed-outline"
            accent={colors.BLUE}
            iconBg={colors.BLUE_LT}
          />
          <SummaryCard
            label="XP earned"
            value={totalXp}
            icon="trending-up-outline"
            accent={colors.PURPLE}
            iconBg={colors.PURPLE_LT}
          />
        </View>

        {loading ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator size="large" color={colors.GREEN} />
            <Text style={styles.muted}>Loading achievements...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Could not load achievements</Text>
            <Text style={styles.errorBody}>{error}</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.centerBlock}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="ribbon-outline" size={28} color={colors.GRAY400} />
            </View>
            <Text style={styles.emptyTitle}>No achievements yet</Text>
            <Text style={styles.emptySub}>
              Complete exchanges and keep showing up for the community to unlock
              milestones.
            </Text>
          </View>
        ) : (
          <View style={styles.cardList}>
            {items.map((item) => (
              <AchievementCard
                key={item.badge_type}
                item={item}
                onPress={() => setSelected(item)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <DetailModal item={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  accent,
  iconBg,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  iconBg: string;
}) {
  return (
    <View style={summaryStyles.wrap}>
      <View style={[summaryStyles.accentBar, { backgroundColor: accent }]} />
      <View style={summaryStyles.inner}>
        <View style={[summaryStyles.iconBox, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={18} color={accent} />
        </View>
        <Text style={[summaryStyles.value, { color: accent }]}>{value}</Text>
        <Text style={summaryStyles.label} numberOfLines={2}>
          {label.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    overflow: "hidden",
  },
  accentBar: {
    height: 3,
    width: "100%",
  },
  inner: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 12,
    gap: 6,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 24,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.GRAY400,
    letterSpacing: 0.35,
    textAlign: "center",
    width: "100%",
    marginTop: 0,
  },
});

function AchievementCard({
  item,
  onPress,
}: {
  item: AchievementProgressItem;
  onPress: () => void;
}) {
  const meta = getAchievementMeta(item.badge_type);
  const locked = !item.earned;
  const hidden = !item.earned && item.achievement.is_hidden;
  const earnedDate = formatEarnedDate(item.earned_at);
  const current = item.current ?? 0;
  const threshold = item.threshold ?? 0;
  const pct = Math.max(0, Math.min(100, item.progress_percent));

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        cardStyles.outer,
        locked ? cardStyles.outerLocked : {},
        pressed && cardStyles.pressed,
      ]}
    >
      <View
        style={[
          cardStyles.top,
          {
            backgroundColor: locked ? colors.GRAY50 : colors.WHITE,
          },
        ]}
      >
        <View style={cardStyles.topRow}>
          <View
            style={[
              cardStyles.iconLarge,
              {
                backgroundColor: locked ? colors.GRAY100 : `${meta.color}22`,
              },
            ]}
          >
            <Ionicons
              name={hidden ? "lock-closed-outline" : meta.icon}
              size={22}
              color={locked ? colors.GRAY400 : meta.color}
            />
          </View>
          <View
            style={[
              cardStyles.rarityPill,
              {
                backgroundColor: locked ? colors.GRAY100 : `${meta.color}30`,
              },
            ]}
          >
            <Text
              style={[
                cardStyles.rarityText,
                { color: locked ? colors.GRAY500 : meta.color },
              ]}
            >
              {locked ? "Locked" : meta.rarity}
            </Text>
          </View>
        </View>
        <Text style={cardStyles.title}>
          {hidden ? "Hidden Achievement" : item.achievement.name}
        </Text>
        <Text style={cardStyles.desc}>
          {hidden
            ? "Keep contributing to reveal this community milestone."
            : item.achievement.description}
        </Text>
      </View>
      <View style={cardStyles.bottom}>
        {item.earned ? (
          <View style={cardStyles.earnedRow}>
            <View>
              <Text style={cardStyles.smallLabel}>Status</Text>
              <Text style={cardStyles.statusEarned}>
                {earnedDate ? `Earned ${earnedDate}` : "Achievement unlocked"}
              </Text>
            </View>
            <View style={cardStyles.xpCol}>
              <Text style={cardStyles.smallLabel}>XP</Text>
              <Text style={[cardStyles.xpValue, { color: meta.color }]}>
                +{item.achievement.karma_points ?? 0}
              </Text>
            </View>
          </View>
        ) : (
          <View>
            <View style={cardStyles.progressHeader}>
              <Text style={cardStyles.smallLabel}>Progress</Text>
              <Text style={cardStyles.progressFrac}>
                {threshold > 0 ? `${current} / ${threshold}` : `${pct}%`}
              </Text>
            </View>
            <View style={cardStyles.track}>
              <View
                style={[
                  cardStyles.fill,
                  { width: `${pct}%`, backgroundColor: meta.color },
                ]}
              />
            </View>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  outer: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    backgroundColor: colors.WHITE,
    marginBottom: 12,
    overflow: "hidden",
  },
  outerLocked: {
    opacity: 0.95,
  },
  pressed: {
    opacity: 0.92,
  },
  top: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  iconLarge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  rarityPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  rarityText: {
    fontSize: 10,
    fontWeight: "700",
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.GRAY800,
    marginBottom: 4,
  },
  desc: {
    fontSize: 13,
    color: colors.GRAY500,
    lineHeight: 20,
    minHeight: 40,
  },
  bottom: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.GRAY100,
  },
  earnedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  smallLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.GRAY400,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statusEarned: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.GREEN,
  },
  xpCol: { alignItems: "flex-end" },
  xpValue: {
    fontSize: 16,
    fontWeight: "800",
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  progressFrac: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.GRAY600,
  },
  track: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.GRAY100,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
});

function DetailModal({
  item,
  onClose,
}: {
  item: AchievementProgressItem | null;
  onClose: () => void;
}) {
  if (!item) return null;
  const meta = getAchievementMeta(item.badge_type);
  const hidden = !item.earned && item.achievement.is_hidden;
  const earnedDate = formatEarnedDate(item.earned_at);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={modalStyles.backdrop} onPress={onClose}>
        <Pressable
          style={modalStyles.sheet}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={modalStyles.sheetHeader}>
            <View
              style={[
                modalStyles.iconLarge,
                {
                  backgroundColor: hidden ? colors.GRAY100 : `${meta.color}22`,
                },
              ]}
            >
              <Ionicons
                name={hidden ? "lock-closed-outline" : meta.icon}
                size={24}
                color={hidden ? colors.GRAY400 : meta.color}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={modalStyles.sheetTitle}>
                {hidden ? "Hidden Achievement" : item.achievement.name}
              </Text>
              <Text style={modalStyles.sheetSub}>
                {item.earned ? "Unlocked milestone" : "Locked milestone"}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={26} color={colors.GRAY500} />
            </Pressable>
          </View>
          <ScrollView
            style={modalStyles.bodyScroll}
            showsVerticalScrollIndicator={false}
          >
            <Text style={modalStyles.bodyText}>
              {hidden
                ? "Keep contributing to reveal this community milestone."
                : item.achievement.description}
            </Text>
            <Text style={modalStyles.howLabel}>How to earn</Text>
            <Text style={modalStyles.howText}>{meta.howToEarn}</Text>
            {item.earned && (
              <>
                <Text style={modalStyles.howLabel}>Status</Text>
                <Text style={modalStyles.statusText}>
                  {earnedDate ? `Earned on ${earnedDate}` : "Achievement unlocked"}
                </Text>
                <Text style={modalStyles.howLabel}>XP</Text>
                <Text style={[modalStyles.xpBig, { color: meta.color }]}>
                  +{item.achievement.karma_points ?? 0}
                </Text>
              </>
            )}
            {!item.earned && !hidden && (
              <>
                <Text style={modalStyles.howLabel}>Progress</Text>
                <Text style={modalStyles.statusText}>
                  {item.threshold != null && item.threshold > 0
                    ? `${item.current ?? 0} / ${item.threshold}`
                    : `${item.progress_percent}% complete`}
                </Text>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  sheet: {
    backgroundColor: colors.WHITE,
    borderRadius: 22,
    maxHeight: "80%",
    paddingBottom: 16,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY100,
  },
  iconLarge: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.GRAY800,
  },
  sheetSub: {
    fontSize: 12,
    color: colors.GRAY500,
    marginTop: 2,
  },
  bodyScroll: {
    paddingHorizontal: 18,
    paddingTop: 14,
    maxHeight: 360,
  },
  bodyText: {
    fontSize: 14,
    color: colors.GRAY600,
    lineHeight: 22,
    marginBottom: 16,
  },
  howLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.GRAY400,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
    marginTop: 4,
  },
  howText: {
    fontSize: 14,
    color: colors.GRAY700,
    lineHeight: 22,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.GREEN,
  },
  xpBig: {
    fontSize: 22,
    fontWeight: "800",
  },
});

const getStyles = (bottomInset: number) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.GRAY50,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: Math.max(24, bottomInset + 16),
    },
    intro: {
      marginBottom: 20,
    },
    pageTitle: {
      fontSize: 26,
      fontWeight: "800",
      color: colors.GRAY800,
      marginBottom: 8,
    },
    pageSubtitle: {
      fontSize: 14,
      color: colors.GRAY500,
      lineHeight: 21,
    },
    summaryRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 22,
    },
    centerBlock: {
      alignItems: "center",
      paddingVertical: 40,
      gap: 10,
    },
    muted: {
      fontSize: 14,
      color: colors.GRAY500,
    },
    errorBox: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: `${colors.AMBER}55`,
      backgroundColor: colors.AMBER_LT,
      padding: 16,
    },
    errorTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.AMBER,
      marginBottom: 6,
    },
    errorBody: {
      fontSize: 14,
      color: colors.GRAY700,
    },
    emptyIconWrap: {
      width: 72,
      height: 72,
      borderRadius: 24,
      backgroundColor: colors.GRAY100,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.GRAY800,
    },
    emptySub: {
      fontSize: 14,
      color: colors.GRAY500,
      textAlign: "center",
      maxWidth: 320,
      lineHeight: 21,
    },
    cardList: {
      paddingBottom: 8,
    },
  });
