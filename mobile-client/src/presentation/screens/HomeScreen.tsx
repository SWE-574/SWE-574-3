import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  Pressable,
  TouchableOpacity,
  RefreshControl,
  Modal,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import * as Location from "expo-location";
import Slider from "@react-native-community/slider";
import type { HomeStackParamList } from "../../navigation/HomeStack";
import type { BottomTabParamList } from "../../navigation/BottomTabNavigator";
import { listServices, type ServicesListParams } from "../../api/services";
import { Service } from "../../api/types";
import ServiceCard from "../components/ServiceCard";
import FeaturedSection from "../components/FeaturedSection";
import { colors } from "../../constants/colors";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  getServiceDistanceKm,
  isInPersonService,
  isNearlyFullService,
  isOnlineService,
  isRecurringService,
  type Coordinates,
} from "../../utils/discovery";

type ServiceTypeFilter = "all" | "Offer" | "Need" | "Event";
type LocationFilter = "all" | "nearby" | "in_person" | "online";
type SortFilter = "latest" | "hot";
type LocationStatus = "idle" | "granted" | "denied";
type ToggleFilterKey = "recurringOnly" | "nearlyFullOnly";

interface DiscoveryFilters {
  serviceType: ServiceTypeFilter;
  locationMode: LocationFilter;
  sortBy: SortFilter;
  distanceKm: number;
  recurringOnly: boolean;
  nearlyFullOnly: boolean;
}

const DEFAULT_FILTERS: DiscoveryFilters = {
  serviceType: "all",
  locationMode: "all",
  sortBy: "latest",
  distanceKm: 15,
  recurringOnly: false,
  nearlyFullOnly: false,
};

interface ChipDef {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  selected: boolean;
  onPress: () => void;
}

export default function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<HomeStackParamList, "HomeFeed">>();
  const tabNavigation =
    useNavigation<BottomTabNavigationProp<BottomTabParamList>>();
  const [services, setServices] = useState<Service[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [chipsVisible, setChipsVisible] = useState(false);
  const [filters, setFilters] = useState<DiscoveryFilters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] =
    useState<DiscoveryFilters>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [resolvingLocation, setResolvingLocation] = useState(false);
  const locationCheckedRef = useRef(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (locationCheckedRef.current) return;
    locationCheckedRef.current = true;

    (async () => {
      try {
        const { granted } = await Location.getForegroundPermissionsAsync();
        if (granted) {
          setResolvingLocation(true);
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setUserLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
          setLocationStatus("granted");
        }
      } catch {
        // Silent fail -- user hasn't granted yet, that's fine
      } finally {
        setResolvingLocation(false);
      }
    })();
  }, []);

  const ensureDeviceLocation =
    useCallback(async (): Promise<Coordinates | null> => {
      if (userLocation) return userLocation;

      try {
        setResolvingLocation(true);
        const permission = await Location.requestForegroundPermissionsAsync();

        if (!permission.granted) {
          setLocationStatus("denied");
          setLocationMessage(
            "Location permission is required to show services nearby.",
          );
          return null;
        }

        const currentPosition = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const coordinates = {
          latitude: currentPosition.coords.latitude,
          longitude: currentPosition.coords.longitude,
        };

        setUserLocation(coordinates);
        setLocationStatus("granted");
        setLocationMessage(null);
        return coordinates;
      } catch (error) {
        setLocationStatus("denied");
        setLocationMessage(
          error instanceof Error
            ? error.message
            : "Unable to access your location right now.",
        );
        return null;
      } finally {
        setResolvingLocation(false);
      }
    }, [userLocation]);

  useEffect(() => {
    if (
      filters.locationMode === "nearby" &&
      !userLocation &&
      !resolvingLocation
    ) {
      ensureDeviceLocation();
    }
  }, [
    ensureDeviceLocation,
    filters.locationMode,
    resolvingLocation,
    userLocation,
  ]);

  const fetchServices = useCallback(async () => {
    try {
      setLoadError(null);
      setIsLoading(true);

      const params: ServicesListParams = {
        page_size: 30,
        search: debouncedSearch || undefined,
        sort: filters.sortBy,
        type:
          filters.serviceType !== "all" && filters.serviceType !== "Event"
            ? filters.serviceType
            : undefined,
      };

      if (filters.locationMode === "nearby" && userLocation) {
        params.lat = userLocation.latitude;
        params.lng = userLocation.longitude;
        params.distance = filters.distanceKm;
      }

      const { results } = await listServices(params);
      setServices(results ?? []);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to load services.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, filters, userLocation]);

  useEffect(() => {
    if (
      filters.locationMode === "nearby" &&
      !userLocation &&
      locationStatus !== "denied"
    ) {
      return;
    }
    fetchServices();
  }, [fetchServices, filters.locationMode, locationStatus, userLocation]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchServices().finally(() => setRefreshing(false));
  }, [fetchServices]);

  const filteredServices = useMemo(() => {
    let list = [...services];

    switch (filters.serviceType) {
      case "Offer":
      case "Need":
      case "Event":
        list = list.filter((s) => s.type === filters.serviceType);
        break;
    }

    switch (filters.locationMode) {
      case "nearby":
        list = userLocation
          ? list
              .map((s) => ({
                s,
                d: getServiceDistanceKm(s, userLocation),
              }))
              .filter(
                (item): item is { s: Service; d: number } =>
                  item.d !== null && item.d <= filters.distanceKm,
              )
              .sort((a, b) => a.d - b.d)
              .map((item) => item.s)
          : [];
        break;
      case "in_person":
        list = list.filter(isInPersonService);
        break;
      case "online":
        list = list.filter(isOnlineService);
        break;
    }

    if (filters.recurringOnly) list = list.filter(isRecurringService);
    if (filters.nearlyFullOnly) list = list.filter(isNearlyFullService);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          (s.description || "").toLowerCase().includes(q) ||
          s.tags?.some((t) => t.name.toLowerCase().includes(q)),
      );
    }

    return list;
  }, [filters, search, services, userLocation]);

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (filters.serviceType !== "all") c++;
    if (filters.locationMode !== "all") c++;
    if (filters.sortBy !== "latest") c++;
    if (filters.recurringOnly) c++;
    if (filters.nearlyFullOnly) c++;
    return c;
  }, [filters]);

  const quickChips: ChipDef[] = useMemo(
    () => [
      {
        id: "nearby",
        label:
          filters.locationMode === "nearby" && userLocation
            ? `Nearby ${Math.round(filters.distanceKm)} km`
            : "Nearby",
        icon: "navigate-outline",
        selected: filters.locationMode === "nearby",
        onPress: async () => {
          if (filters.locationMode === "nearby") {
            setFilters((c) => ({ ...c, locationMode: "all" }));
            return;
          }
          const coords = await ensureDeviceLocation();
          if (coords) setFilters((c) => ({ ...c, locationMode: "nearby" }));
        },
      },
      {
        id: "hot",
        label: "Hot",
        icon: "flame-outline",
        selected: filters.sortBy === "hot",
        onPress: () =>
          setFilters((c) => ({
            ...c,
            sortBy: c.sortBy === "hot" ? "latest" : "hot",
          })),
      },
      {
        id: "events",
        label: "Events",
        icon: "calendar-outline",
        selected: filters.serviceType === "Event",
        onPress: () =>
          setFilters((c) => ({
            ...c,
            serviceType: c.serviceType === "Event" ? "all" : "Event",
          })),
      },
      {
        id: "online",
        label: "Online",
        icon: "wifi-outline",
        selected: filters.locationMode === "online",
        onPress: () =>
          setFilters((c) => ({
            ...c,
            locationMode: c.locationMode === "online" ? "all" : "online",
          })),
      },
      {
        id: "full",
        label: "Nearly Full",
        icon: "hourglass-outline",
        selected: filters.nearlyFullOnly,
        onPress: () =>
          setFilters((c) => ({ ...c, nearlyFullOnly: !c.nearlyFullOnly })),
      },
      {
        id: "recurring",
        label: "Recurring",
        icon: "repeat-outline",
        selected: filters.recurringOnly,
        onPress: () =>
          setFilters((c) => ({ ...c, recurringOnly: !c.recurringOnly })),
      },
    ],
    [ensureDeviceLocation, filters, userLocation],
  );

  const handleServicePress = useCallback(
    (id: string) => navigation.navigate("ServiceDetail", { id: String(id) }),
    [navigation],
  );

  const listHeader = (
    <FeaturedSection
      services={filteredServices}
      onServicePress={handleServicePress}
      userLocation={userLocation}
      locationStatus={locationStatus}
      maxNearbyKm={filters.distanceKm}
    />
  );

  const showNearbyStatus =
    filters.locationMode === "nearby" &&
    (resolvingLocation || locationMessage != null);

  const showLocationBanner =
    locationStatus === "idle" && !userLocation && !resolvingLocation;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() =>
            tabNavigation.navigate("PostService", { screen: "PostService" })
          }
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="add-circle-outline" size={28} color={colors.GREEN} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterButton,
            (chipsVisible || activeFilterCount > 0) &&
              styles.filterButtonActive,
          ]}
          onPress={() => setChipsVisible((v) => !v)}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Ionicons
            name={chipsVisible ? "chevron-up" : "options-outline"}
            size={18}
            color={
              chipsVisible || activeFilterCount > 0
                ? colors.WHITE
                : colors.GRAY600
            }
          />
          <Text
            style={[
              styles.filterButtonLabel,
              (chipsVisible || activeFilterCount > 0) &&
                styles.filterButtonLabelActive,
            ]}
          >
            Filters
          </Text>
          {activeFilterCount > 0 && (
            <View style={styles.filterCountBadge}>
              <Text style={styles.filterCountText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate("Notifications")}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="notifications-outline"
            size={24}
            color={colors.GRAY600}
          />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Ionicons
            name="search-outline"
            size={18}
            color={colors.GRAY500}
            style={styles.searchIcon}
          />
          <TextInput
            placeholder="Search services, skills, tags..."
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholderTextColor={colors.GRAY400}
          />
        </View>
      </View>

      {/* Location banner -- shown when permission not yet requested */}
      {showLocationBanner && (
        <Pressable
          style={styles.locationBanner}
          onPress={() => ensureDeviceLocation()}
        >
          <Ionicons name="location-outline" size={18} color={colors.GREEN} />
          <Text style={styles.locationBannerText}>
            Enable location for nearby services
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.GRAY400} />
        </Pressable>
      )}

      {/* Collapsible quick-filter chips */}
      {chipsVisible && (
        <View style={styles.chipsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScroll}
          >
            {quickChips.map((chip) => (
              <TouchableOpacity
                key={chip.id}
                activeOpacity={0.7}
                onPress={chip.onPress}
                style={[styles.chip, chip.selected && styles.chipSelected]}
              >
                <Ionicons
                  name={chip.icon}
                  size={16}
                  color={chip.selected ? colors.WHITE : colors.GRAY600}
                />
                <Text
                  style={[
                    styles.chipLabel,
                    chip.selected && styles.chipLabelSelected,
                  ]}
                >
                  {chip.label}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.chipMore}
              onPress={() => {
                setDraftFilters(filters);
                setFiltersOpen(true);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="options-outline" size={16} color={colors.GREEN} />
              <Text style={styles.chipMoreLabel}>More</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* Nearby status message (only when nearby filter active) */}
      {showNearbyStatus && (
        <View style={styles.statusRow}>
          {resolvingLocation ? (
            <>
              <ActivityIndicator size="small" color={colors.GREEN} />
              <Text style={styles.statusText}>
                Finding services near you...
              </Text>
            </>
          ) : (
            <Text style={styles.statusText}>{locationMessage}</Text>
          )}
        </View>
      )}

      {/* Load error (not location-related) */}
      {loadError && !showNearbyStatus && (
        <View style={styles.statusRow}>
          <Text style={styles.statusText}>{loadError}</Text>
        </View>
      )}

      <FlatList
        data={filteredServices}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() =>
              navigation.navigate("ServiceDetail", { id: String(item.id) })
            }
          >
            <ServiceCard service={item} index={index} />
          </Pressable>
        )}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.GREEN}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {filters.locationMode === "nearby" && locationStatus === "denied"
              ? "Enable location permission to see services nearby."
              : "No services match these filters right now."}
          </Text>
        }
      />

      {/* Filters modal */}
      <Modal
        visible={filtersOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFiltersOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setFiltersOpen(false)}
        >
          <Pressable
            style={styles.modalContent}
            onPress={() => {}}
          >
            <Text style={styles.modalTitle}>Filters</Text>
            <Text style={styles.modalSubtitle}>
              Refine what shows up on your Home feed.
            </Text>

            <Text style={styles.sectionTitle}>Service Type</Text>
            <View style={styles.optionGrid}>
              {(["all", "Offer", "Need", "Event"] as const).map((type) => {
                const selected = draftFilters.serviceType === type;
                const label =
                  type === "all" ? "All" : type === "Need" ? "Want" : type;
                return (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.segmentButton,
                      selected && styles.segmentButtonSelected,
                    ]}
                    onPress={() =>
                      setDraftFilters((c) => ({ ...c, serviceType: type }))
                    }
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.segmentButtonLabel,
                        selected && styles.segmentButtonLabelSelected,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Location</Text>
            <View style={styles.optionGrid}>
              {(
                [
                  { id: "all", label: "All" },
                  { id: "nearby", label: "Nearby" },
                  { id: "in_person", label: "In Person" },
                  { id: "online", label: "Online" },
                ] as const
              ).map((option) => {
                const selected = draftFilters.locationMode === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[
                      styles.segmentButton,
                      selected && styles.segmentButtonSelected,
                    ]}
                    onPress={() =>
                      setDraftFilters((c) => ({
                        ...c,
                        locationMode: option.id as LocationFilter,
                      }))
                    }
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.segmentButtonLabel,
                        selected && styles.segmentButtonLabelSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {draftFilters.locationMode === "nearby" && (
              <>
                <Text style={styles.sectionTitle}>
                  Nearby Radius: {Math.round(draftFilters.distanceKm)} km
                </Text>
                <View style={styles.sliderContainer}>
                  <Text style={styles.sliderBound}>1 km</Text>
                  <Slider
                    style={styles.slider}
                    minimumValue={1}
                    maximumValue={50}
                    step={1}
                    value={draftFilters.distanceKm}
                    onValueChange={(val) =>
                      setDraftFilters((c) => ({
                        ...c,
                        distanceKm: Math.round(val),
                      }))
                    }
                    minimumTrackTintColor={colors.GREEN}
                    maximumTrackTintColor={colors.GRAY300}
                    thumbTintColor={colors.GREEN}
                  />
                  <Text style={styles.sliderBound}>50 km</Text>
                </View>
              </>
            )}

            <Text style={styles.sectionTitle}>Sort</Text>
            <View style={styles.optionGrid}>
              {(
                [
                  { id: "latest", label: "Latest" },
                  { id: "hot", label: "Hot" },
                ] as const
              ).map((option) => {
                const selected = draftFilters.sortBy === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[
                      styles.segmentButton,
                      selected && styles.segmentButtonSelected,
                    ]}
                    onPress={() =>
                      setDraftFilters((c) => ({
                        ...c,
                        sortBy: option.id as SortFilter,
                      }))
                    }
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.segmentButtonLabel,
                        selected && styles.segmentButtonLabelSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Extra</Text>
            {(
              [
                {
                  key: "recurringOnly",
                  label: "Recurring only",
                  icon: "repeat-outline",
                },
                {
                  key: "nearlyFullOnly",
                  label: "Nearly full only",
                  icon: "hourglass-outline",
                },
              ] as const satisfies ReadonlyArray<{
                key: ToggleFilterKey;
                label: string;
                icon: React.ComponentProps<typeof Ionicons>["name"];
              }>
            ).map((option) => {
              const selected = draftFilters[option.key];
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.modalOption,
                    selected && styles.modalOptionActive,
                  ]}
                  onPress={() =>
                    setDraftFilters((c) => ({
                      ...c,
                      [option.key]: !c[option.key],
                    }))
                  }
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name={option.icon}
                    size={18}
                    color={selected ? colors.GREEN : colors.GRAY500}
                  />
                  <Text
                    style={[
                      styles.modalOptionText,
                      selected && styles.modalOptionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {selected && (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={colors.GREEN}
                      style={{ marginLeft: "auto" }}
                    />
                  )}
                </TouchableOpacity>
              );
            })}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryAction}
                onPress={() => setDraftFilters(DEFAULT_FILTERS)}
                activeOpacity={0.75}
              >
                <Text style={styles.secondaryActionText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryAction}
                onPress={async () => {
                  if (draftFilters.locationMode === "nearby") {
                    const coords = await ensureDeviceLocation();
                    if (!coords) return;
                  }
                  setFilters(draftFilters);
                  setFiltersOpen(false);
                }}
                activeOpacity={0.75}
              >
                <Text style={styles.primaryActionText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.WHITE,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.GRAY300,
    gap: 4,
  },
  filterButtonActive: {
    backgroundColor: colors.GREEN,
    borderColor: colors.GREEN,
  },
  filterButtonLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.GRAY600,
  },
  filterButtonLabelActive: {
    color: colors.WHITE,
  },
  filterCountBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.WHITE,
    marginLeft: 4,
    paddingHorizontal: 4,
  },
  filterCountText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.GREEN,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 6,
    backgroundColor: colors.WHITE,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: colors.GRAY100,
    borderColor: colors.GRAY300,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1a1a1a",
  },
  locationBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.GREEN_LT,
    borderRadius: 10,
    gap: 8,
  },
  locationBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: colors.GREEN,
  },
  chipsContainer: {
    backgroundColor: colors.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY200,
  },
  chipsScroll: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: colors.WHITE,
    borderWidth: 1,
    borderColor: colors.GRAY300,
    borderRadius: 18,
    gap: 5,
  },
  chipSelected: {
    backgroundColor: colors.GREEN,
    borderColor: colors.GREEN,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.GRAY600,
  },
  chipLabelSelected: {
    color: colors.WHITE,
  },
  chipMore: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.GREEN,
    borderRadius: 18,
    gap: 5,
    borderStyle: "dashed",
  },
  chipMoreLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GREEN,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: colors.GRAY100,
  },
  statusText: {
    flex: 1,
    fontSize: 12,
    color: colors.GRAY500,
  },
  listContent: {
    paddingBottom: 32,
  },
  empty: {
    textAlign: "center",
    color: colors.GRAY500,
    paddingVertical: 32,
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: colors.WHITE,
    borderRadius: 16,
    padding: 20,
    width: "88%",
    maxWidth: 360,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.GRAY800,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: colors.GRAY500,
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.GRAY800,
    marginBottom: 10,
    marginTop: 10,
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  segmentButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.GRAY300,
    backgroundColor: colors.WHITE,
  },
  segmentButtonSelected: {
    backgroundColor: colors.GREEN,
    borderColor: colors.GREEN,
  },
  segmentButtonLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GRAY700,
  },
  segmentButtonLabelSelected: {
    color: colors.WHITE,
  },
  sliderContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  sliderBound: {
    fontSize: 11,
    color: colors.GRAY500,
    fontWeight: "500",
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
    gap: 10,
  },
  modalOptionActive: {
    backgroundColor: colors.GREEN_LT,
  },
  modalOptionText: {
    fontSize: 15,
    color: colors.GRAY700,
  },
  modalOptionTextActive: {
    color: colors.GREEN,
    fontWeight: "600",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    gap: 12,
  },
  secondaryAction: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.GRAY300,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionText: {
    color: colors.GRAY700,
    fontSize: 14,
    fontWeight: "600",
  },
  primaryAction: {
    flex: 1.4,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionText: {
    color: colors.WHITE,
    fontSize: 14,
    fontWeight: "700",
  },
});
