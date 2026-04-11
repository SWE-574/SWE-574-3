import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  getFeatured,
  type FeaturedResponse,
  type FeaturedService,
  type FeaturedProvider,
} from "../../api/featured";
import { colors } from "../../constants/colors";
import FeaturedServiceCard from "./FeaturedServiceCard";
import FeaturedProviderCard from "./FeaturedProviderCard";

type TabKey = "trending" | "friends" | "top_providers";

interface TabConfig {
  key: TabKey;
  label: string;
  iconActive: keyof typeof Ionicons.glyphMap;
  iconInactive: keyof typeof Ionicons.glyphMap;
  emptyMessage: string;
}

const TABS: TabConfig[] = [
  {
    key: "trending",
    label: "Trending",
    iconActive: "flame",
    iconInactive: "flame-outline",
    emptyMessage: "No trending services right now",
  },
  {
    key: "friends",
    label: "Friends",
    iconActive: "people",
    iconInactive: "people-outline",
    emptyMessage: "Follow people to see what interests them",
  },
  {
    key: "top_providers",
    label: "Top Providers",
    iconActive: "star",
    iconInactive: "star-outline",
    emptyMessage: "No top providers this week",
  },
];

interface FeaturedSectionProps {
  onServicePress?: (serviceId: string) => void;
  onProviderPress?: (providerId: string) => void;
}

export default function FeaturedSection({
  onServicePress,
  onProviderPress,
}: FeaturedSectionProps) {
  const [featuredData, setFeaturedData] = useState<FeaturedResponse | null>(
    null
  );
  const [activeTab, setActiveTab] = useState<TabKey>("trending");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getFeatured()
      .then((data) => {
        if (cancelled) return;
        setFeaturedData(data);

        // Pick first non-empty tab
        if (data.trending.length > 0) {
          setActiveTab("trending");
        } else if (data.friends.length > 0) {
          setActiveTab("friends");
        } else if (data.top_providers.length > 0) {
          setActiveTab("top_providers");
        }
      })
      .catch(() => {
        if (!cancelled) setFeaturedData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const renderServiceCard = useCallback(
    ({ item }: { item: FeaturedService }) => (
      <FeaturedServiceCard
        service={item}
        showFriendInfo={activeTab === "friends"}
        onPress={() => onServicePress?.(item.id)}
      />
    ),
    [activeTab, onServicePress]
  );

  const renderProviderCard = useCallback(
    ({ item }: { item: FeaturedProvider }) => (
      <FeaturedProviderCard
        provider={item}
        onPress={() => onProviderPress?.(item.id)}
      />
    ),
    [onProviderPress]
  );

  const serviceKeyExtractor = useCallback(
    (item: FeaturedService) => item.id,
    []
  );
  const providerKeyExtractor = useCallback(
    (item: FeaturedProvider) => item.id,
    []
  );

  // Loading state
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Featured</Text>
        </View>
        <View style={styles.placeholderRow}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.placeholderCard} />
          ))}
        </View>
      </View>
    );
  }

  // All empty or error
  if (!featuredData) return null;
  const allEmpty =
    featuredData.trending.length === 0 &&
    featuredData.friends.length === 0 &&
    featuredData.top_providers.length === 0;
  if (allEmpty) return null;

  const activeConfig = TABS.find((t) => t.key === activeTab)!;
  const isServiceTab = activeTab === "trending" || activeTab === "friends";
  const currentItems = isServiceTab
    ? (featuredData[activeTab] as FeaturedService[])
    : (featuredData.top_providers as FeaturedProvider[]);

  return (
    <View style={styles.container}>
      {/* Header row */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Featured</Text>
        <TouchableOpacity>
          <Text style={styles.seeAll}>See all →</Text>
        </TouchableOpacity>
      </View>

      {/* Tab pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
      >
        {TABS.map((tab) => {
          const isSelected = activeTab === tab.key;
          const hasItems =
            tab.key === "top_providers"
              ? featuredData.top_providers.length > 0
              : featuredData[tab.key].length > 0;

          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.pill, isSelected && styles.pillSelected]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isSelected ? tab.iconActive : tab.iconInactive}
                size={14}
                color={isSelected ? colors.WHITE : colors.GRAY500}
              />
              <Text
                style={[styles.pillLabel, isSelected && styles.pillLabelSelected]}
              >
                {tab.label}
              </Text>
              {!hasItems && (
                <View style={styles.emptyDot} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Card row or empty message */}
      {currentItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{activeConfig.emptyMessage}</Text>
        </View>
      ) : isServiceTab ? (
        <FlatList
          data={featuredData[activeTab] as FeaturedService[]}
          renderItem={renderServiceCard}
          keyExtractor={serviceKeyExtractor}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cardRow}
        />
      ) : (
        <FlatList
          data={featuredData.top_providers}
          renderItem={renderProviderCard}
          keyExtractor={providerKeyExtractor}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cardRow}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.GRAY800,
  },
  seeAll: {
    fontSize: 13,
    color: colors.GREEN,
    fontWeight: "500",
  },
  tabRow: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 12,
    marginRight: 8,
    backgroundColor: colors.WHITE,
    borderWidth: 1,
    borderColor: colors.GRAY200,
  },
  pillSelected: {
    backgroundColor: colors.GREEN,
    borderColor: colors.GREEN,
  },
  pillLabel: {
    fontSize: 12,
    color: colors.GRAY500,
    fontWeight: "400",
    marginLeft: 6,
  },
  pillLabelSelected: {
    color: colors.WHITE,
  },
  emptyDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.GRAY300,
    marginLeft: 4,
  },
  cardRow: {
    paddingHorizontal: 16,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 13,
    color: colors.GRAY400,
    textAlign: "center",
  },
  placeholderRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    opacity: 0.5,
  },
  placeholderCard: {
    width: 200,
    height: 140,
    borderRadius: 12,
    backgroundColor: colors.GRAY100,
    marginRight: 12,
  },
});
