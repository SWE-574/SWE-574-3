import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Service } from "../../api/types";
import {
  getFeatured,
  type FeaturedResponse,
  type FeaturedService,
} from "../../api/featured";
import { colors } from "../../constants/colors";
import FeaturedServiceCard from "./FeaturedServiceCard";
import {
  formatDistanceKm,
  type Coordinates,
  getCapacityRatio,
  getServiceDistanceKm,
  isInPersonService,
  isNearlyFullService,
} from "../../utils/discovery";

type TabKey = "friends" | "nearby" | "nearly_full";

interface TabConfig {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
}

const TABS: TabConfig[] = [
  {
    key: "friends",
    label: "Friends",
    icon: "people-outline",
    iconActive: "people",
  },
  {
    key: "nearby",
    label: "Nearby",
    icon: "location-outline",
    iconActive: "location",
  },
  {
    key: "nearly_full",
    label: "Nearly Full",
    icon: "time-outline",
    iconActive: "time",
  },
];

interface FeaturedSectionProps {
  services: Service[];
  onServicePress: (id: string) => void;
  userLocation: Coordinates | null;
  locationStatus: "idle" | "granted" | "denied";
}

export default function FeaturedSection({
  services,
  onServicePress,
  userLocation,
  locationStatus,
}: FeaturedSectionProps) {
  const [featuredData, setFeaturedData] = useState<FeaturedResponse | null>(null);
  const [apiFailed, setApiFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("friends");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getFeatured()
      .then((data) => {
        if (cancelled) return;
        setFeaturedData(data);
      })
      .catch(() => {
        if (!cancelled) setApiFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const normalizeFeaturedService = (item: FeaturedService): Service => ({
    id: String(item.id),
    title: item.title,
    description: "",
    type: item.type,
    duration: "",
    location_type: item.location_area ? "In-Person" : "",
    location_area: item.location_area,
    status: "Active",
    max_participants: item.max_participants,
    participant_count: item.participant_count,
    created_at: item.created_at,
    tags: item.tags,
    user: item.user,
  });

  const friendsItems = useMemo(
    () =>
      (featuredData?.friends ?? []).map((item) => ({
        service: normalizeFeaturedService(item),
        contextBadge:
          item.friend_count && item.friend_count > 0
            ? {
                text: `${item.friend_count} friend${item.friend_count > 1 ? "s" : ""}`,
                icon: "people" as const,
                tone: "purple" as const,
              }
            : undefined,
      })),
    [featuredData],
  );

  const nearbyItems = useMemo(
    () =>
      userLocation
        ? services
            .map((service) => ({
              service,
              distanceKm: getServiceDistanceKm(service, userLocation),
            }))
            .filter(
              (item): item is { service: Service; distanceKm: number } =>
                item.distanceKm !== null && isInPersonService(item.service),
            )
            .sort((a, b) => a.distanceKm - b.distanceKm)
            .slice(0, 8)
            .map((item) => ({
              service: item.service,
              contextBadge: {
                text: formatDistanceKm(item.distanceKm),
                icon: "location" as const,
                tone: "green" as const,
              },
            }))
        : [],
    [services, userLocation],
  );

  const nearlyFullItems = useMemo(
    () =>
      services
        .filter(isNearlyFullService)
        .sort((a, b) => {
          const ratioDifference = getCapacityRatio(b) - getCapacityRatio(a);
          if (ratioDifference !== 0) {
            return ratioDifference;
          }

          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        })
        .slice(0, 8)
        .map((service) => ({
          service,
          contextBadge: {
            text: `${service.participant_count ?? 0}/${service.max_participants} spots taken`,
            icon: "time" as const,
            tone: "red" as const,
          },
        })),
    [services],
  );

  const itemsByTab = {
    friends: friendsItems,
    nearby: nearbyItems,
    nearly_full: nearlyFullItems,
  };

  useEffect(() => {
    const firstNonEmptyTab =
      TABS.find((tab) => itemsByTab[tab.key].length > 0)?.key ?? "friends";

    if (itemsByTab[activeTab].length === 0 && activeTab !== firstNonEmptyTab) {
      setActiveTab(firstNonEmptyTab);
    }
  }, [activeTab, friendsItems.length, nearbyItems.length, nearlyFullItems.length]);

  const currentItems = itemsByTab[activeTab];

  const getEmptyMessage = () => {
    if (activeTab === "friends") {
      return apiFailed
        ? "Friend activity is unavailable right now."
        : "Follow people to see their activity here.";
    }

    if (activeTab === "nearby") {
      if (locationStatus === "denied") {
        return "Enable location in Filters to see services nearby.";
      }

      if (locationStatus === "idle" || !userLocation) {
        return "Turn on Nearby To You in Filters to populate this tab.";
      }

      return "No nearby services yet for your current area.";
    }

    return "No nearly full services right now.";
  };

  if (loading && !featuredData && services.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.headerTitle}>Featured</Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.GREEN} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Featured</Text>
      </View>

      {/* Tab pills */}
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
      >
        {TABS.map((tab) => {
          const isSelected = activeTab === tab.key;
          const items = itemsByTab[tab.key];
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.pill, isSelected && styles.pillSelected]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isSelected ? tab.iconActive : tab.icon}
                size={14}
                color={isSelected ? colors.WHITE : colors.GRAY500}
              />
              <Text style={[styles.pillLabel, isSelected && styles.pillLabelSelected]}>
                {tab.label}
              </Text>
              {items.length === 0 && (
                <View style={[styles.emptyDot, isSelected && styles.emptyDotSelected]} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Card row or empty message */}
      {currentItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{getEmptyMessage()}</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cardRow}
        >
          {currentItems.map((item) => (
            <FeaturedServiceCard
              key={String(item.service.id)}
              service={item.service}
              contextBadge={item.contextBadge}
              onPress={() => onServicePress(String(item.service.id))}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
    marginTop: 4,
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
  tabRow: {
    paddingHorizontal: 16,
    marginBottom: 10,
    paddingRight: 24,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
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
    fontSize: 13,
    color: colors.GRAY500,
    fontWeight: "600",
    marginLeft: 5,
  },
  pillLabelSelected: {
    color: colors.WHITE,
  },
  emptyDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.GRAY300,
    marginLeft: 6,
  },
  emptyDotSelected: {
    backgroundColor: colors.GREEN_LT,
  },
  cardRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 30,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 13,
    color: colors.GRAY400,
    textAlign: "center",
  },
});
