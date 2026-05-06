import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import * as Location from "expo-location";
import { LeafletView, MapShapeType } from "react-native-leaflet-view";
import type {
  MapMarker,
  MapShape,
  WebviewLeafletMessage,
} from "react-native-leaflet-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { colors } from "../../constants/colors";
import { listServices } from "../../api/services";
import type { Service, ServiceType } from "../../api/types";

type FilterType = "all" | ServiceType;

// Istanbul city center — used when location permission is denied
const DEFAULT_LOCATION = { latitude: 41.0082, longitude: 28.9784 };

// ─── Marker helpers ───────────────────────────────────────────────────────────

const MARKER_COLOR: Record<ServiceType, string> = {
  Offer: colors.GREEN,
  Need: colors.BLUE,
  Event: colors.AMBER,
};

/**
 * Small solid dot marker used purely as a tap target inside the area circle.
 * Intentionally minimal — the large translucent shape carries the visual weight.
 */
function buildMarkerSvg(type: ServiceType): string {
  const fill = MARKER_COLOR[type] ?? colors.GRAY700;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"></svg>`;
}

/**
 * Builds large translucent Leaflet Circle shapes — one per service — that
 * highlight the approximate area (~650 m radius) without revealing the exact
 * location. Extra Leaflet path options (fillOpacity, opacity, weight) are
 * spread directly onto the react-leaflet Circle by the library.
 */
function buildAreaShapes(
  services: Service[],
): (MapShape & Record<string, unknown>)[] {
  return services.map((s) => {
    const color = MARKER_COLOR[s.type] ?? colors.GRAY700;
    return {
      shapeType: MapShapeType.CIRCLE,
      id: `area-${s.id}`,
      center: { lat: Number(s.location_lat), lng: Number(s.location_lng) },
      radius: 500,
      color,
      fillColor: color,
      fillOpacity: 0.4,
      opacity: 0,
      weight: 2,
    };
  });
}

/**
 * Tiny spiral jitter so co-located fuzzy markers don't perfectly overlap.
 * Same algorithm as the web MapView's stackJitter.
 */
function stackJitter(rank: number): { dLat: number; dLng: number } {
  if (rank === 0) return { dLat: 0, dLng: 0 };
  const angle = (rank * 137.5 * Math.PI) / 180;
  const r = 0.0005 * Math.sqrt(rank); // ~55 m max extra spread
  return { dLat: r * Math.sin(angle), dLng: r * Math.cos(angle) };
}

const FILTER_CONFIG: {
  label: string;
  value: FilterType;
  activeColor: string;
}[] = [
  { label: "All", value: "all", activeColor: colors.GRAY700 },
  { label: "Offers", value: "Offer", activeColor: colors.GREEN },
  { label: "Needs", value: "Need", activeColor: colors.BLUE },
  { label: "Events", value: "Event", activeColor: colors.AMBER },
];

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [webViewContent, setWebViewContent] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locationResolved, setLocationResolved] = useState(false);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  const locationCheckedRef = useRef(false);

  const initialCenterRef = useRef({
    lat: DEFAULT_LOCATION.latitude,
    lng: DEFAULT_LOCATION.longitude,
  });

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const path = require("../../../assets/leaflet.html");
        const asset = Asset.fromModule(path);
        await asset.downloadAsync();
        const htmlContent = await new File(asset.localUri!).text();
        if (isMounted) setWebViewContent(htmlContent);
      } catch (error) {
        Alert.alert("Error loading map", JSON.stringify(error));
        console.error("Error loading map HTML:", error);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Resolve user location once; always mark resolved when done so the map
  // renders with the correct center from the start rather than snapping later.
  useEffect(() => {
    if (locationCheckedRef.current) return;
    locationCheckedRef.current = true;

    (async () => {
      try {
        let coords: { latitude: number; longitude: number } | null = null;

        const { granted } = await Location.getForegroundPermissionsAsync();
        if (granted) {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          coords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          };
        } else {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (permission.granted) {
            const pos = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            coords = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            };
          }
        }

        // if (coords) {
        //   // Write into the ref FIRST so the map mounts with the correct center
        //   // even if React hasn't flushed the setUserLocation state update yet.
        //   initialCenterRef.current = { lat: coords.latitude, lng: coords.longitude };
        //   setUserLocation(coords);
        // }
      } catch {
        // fall back to Istanbul default already set in initialCenterRef
      } finally {
        setLocationResolved(true);
      }
    })();
  }, []);

  // Fetch services whenever location resolves
  const fetchServices = useCallback(async () => {
    try {
      setIsLoadingServices(true);
      const params = userLocation
        ? {
            page_size: 500,
            lat: userLocation.latitude,
            lng: userLocation.longitude,
            distance: 500,
          }
        : { page_size: 500 };

      const { results } = await listServices(params);
      setServices(
        (results ?? []).filter(
          (s) =>
            s.location_lat &&
            s.location_lng &&
            !Number.isNaN(Number(s.location_lat)) &&
            !Number.isNaN(Number(s.location_lng)),
        ),
      );
    } catch (error) {
      console.error("Error fetching services for map:", error);
    } finally {
      setIsLoadingServices(false);
    }
  }, [userLocation]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  // Build markers for the active filter
  const visibleServices =
    activeFilter === "all"
      ? services
      : services.filter((s) => s.type === activeFilter);

  // Large translucent circles that show the approximate area (privacy-safe).
  const areaShapes = buildAreaShapes(visibleServices);

  // Small dot markers — stack-jittered so co-located ones don't perfectly
  // overlap. These serve as the tap target inside each area circle.
  const markers: MapMarker[] = (() => {
    const coordRank: Record<string, number> = {};
    return visibleServices.map((s) => {
      const lat = Number(s.location_lat);
      const lng = Number(s.location_lng);
      const key = `${(lat * 100).toFixed(0)}-${(lng * 100).toFixed(0)}`;
      const rank = coordRank[key] ?? 0;
      coordRank[key] = rank + 1;
      const { dLat, dLng } = stackJitter(rank);
      return {
        id: s.id,
        position: { lat: lat + dLat, lng: lng + dLng },
        icon: buildMarkerSvg(s.type),
        size: [22, 22] as [number, number],
        title: s.title,
      };
    });
  })();

  // Open the summary sheet when a marker is tapped
  const handleMessage = useCallback(
    (message: WebviewLeafletMessage) => {
      const markerID = message?.payload?.mapMarkerID;
      if (!markerID) return;
      const service = services.find((s) => s.id === markerID);
      if (service) setSelectedService(service);
    },
    [services],
  );

  const handleViewDetail = useCallback(() => {
    if (!selectedService) return;
    const id = selectedService.id;
    setSelectedService(null);
    navigation.navigate("ServiceDetail", { id });
  }, [selectedService, navigation]);

  if (!webViewContent || !locationResolved) {
    return (
      <View style={[styles.loading, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.GREEN} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LeafletView
        source={{ html: webViewContent }}
        mapCenterPosition={initialCenterRef.current}
        zoom={10}
        mapMarkers={markers}
        mapShapes={areaShapes as MapShape[]}
        onMessageReceived={handleMessage}
      />

      {/* Top overlay row: back button + filter pills */}
      <View style={[styles.overlayRow, { top: insets.top + 8 }]}>
        {navigation.canGoBack() && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-back" size={20} color={colors.WHITE} />
          </TouchableOpacity>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsContent}
          style={styles.pillsScroll}
        >
          {FILTER_CONFIG.map((f) => {
            const active = activeFilter === f.value;
            return (
              <TouchableOpacity
                key={f.value}
                onPress={() => setActiveFilter(f.value)}
                activeOpacity={0.8}
                style={[
                  styles.pill,
                  active && {
                    backgroundColor: f.activeColor,
                    borderColor: f.activeColor,
                  },
                ]}
              >
                <Text
                  style={[styles.pillText, active && styles.pillTextActive]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {isLoadingServices && (
          <ActivityIndicator
            size="small"
            color={colors.GREEN}
            style={styles.spinner}
          />
        )}
      </View>

      {/* Marker summary bottom sheet */}
      <Modal
        visible={!!selectedService}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedService(null)}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setSelectedService(null)}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />

            {selectedService && (
              <MarkerSheet
                service={selectedService}
                onClose={() => setSelectedService(null)}
                onViewDetail={handleViewDetail}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/* ─── Marker summary sheet content ─────────────────────────────────────── */

const TYPE_COLOR: Record<string, string> = {
  Offer: colors.GREEN,
  Need: colors.BLUE,
  Event: colors.AMBER,
};

const TYPE_LABEL: Record<string, string> = {
  Offer: "Offer",
  Need: "Need",
  Event: "Event",
};

function getInitials(first: string, last: string) {
  return (
    ((first || "").charAt(0) + (last || "").charAt(0)).toUpperCase() || "?"
  );
}

function MarkerSheet({
  service,
  onClose,
  onViewDetail,
}: {
  service: Service;
  onClose: () => void;
  onViewDetail: () => void;
}) {
  const accentColor = TYPE_COLOR[service.type] ?? colors.GRAY700;
  const displayName =
    [service.user.first_name, service.user.last_name]
      .filter(Boolean)
      .join(" ") || "Unknown";
  const initials = getInitials(service.user.first_name, service.user.last_name);
  const isRecurring = service.schedule_type === "Recurrent";

  return (
    <>
      {/* Header row */}
      <View style={sheetStyles.headerRow}>
        <View style={[sheetStyles.typeDot, { backgroundColor: accentColor }]} />
        <Text style={sheetStyles.title} numberOfLines={2}>
          {service.title}
        </Text>
        <View
          style={[
            sheetStyles.typeBadge,
            { backgroundColor: accentColor + "22" },
          ]}
        >
          <Text style={[sheetStyles.typeBadgeText, { color: accentColor }]}>
            {TYPE_LABEL[service.type]}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={22} color={colors.GRAY500} />
        </Pressable>
      </View>

      {/* Author */}
      <View style={sheetStyles.authorRow}>
        <View style={[sheetStyles.avatar, { backgroundColor: accentColor }]}>
          <Text style={sheetStyles.avatarText}>{initials}</Text>
        </View>
        <Text style={sheetStyles.authorName}>{displayName}</Text>
      </View>

      {/* Description */}
      <Text style={sheetStyles.description} numberOfLines={3}>
        {service.description || "—"}
      </Text>

      {/* Meta chips */}
      <View style={sheetStyles.chipsRow}>
        {!!service.duration && (
          <View style={sheetStyles.chip}>
            <Ionicons name="time-outline" size={13} color={colors.GRAY500} />
            <Text style={sheetStyles.chipText}>{service.duration}</Text>
          </View>
        )}
        {(service.location_area || service.location_type) && (
          <View style={sheetStyles.chip}>
            <Ionicons
              name="location-outline"
              size={13}
              color={colors.GRAY500}
            />
            <Text style={sheetStyles.chipText}>
              {service.location_area || service.location_type}
            </Text>
          </View>
        )}
        {!!service.schedule_details && (
          <View style={sheetStyles.chip}>
            <Ionicons
              name="calendar-outline"
              size={13}
              color={colors.GRAY500}
            />
            <Text style={sheetStyles.chipText}>{service.schedule_details}</Text>
          </View>
        )}
        {isRecurring && (
          <View
            style={[sheetStyles.chip, { backgroundColor: colors.PURPLE_LT }]}
          >
            <Ionicons name="repeat-outline" size={13} color={colors.PURPLE} />
            <Text style={[sheetStyles.chipText, { color: colors.PURPLE }]}>
              Recurring
            </Text>
          </View>
        )}
        <View style={sheetStyles.chip}>
          <Ionicons name="people-outline" size={13} color={colors.GRAY500} />
          <Text style={sheetStyles.chipText}>
            {service.participant_count ?? 0}/{service.max_participants}
          </Text>
        </View>
      </View>

      {/* Tags */}
      {service.tags?.length > 0 && (
        <View style={sheetStyles.tagsRow}>
          {service.tags.slice(0, 5).map((tag) => (
            <View key={tag.id} style={sheetStyles.tag}>
              <Text style={sheetStyles.tagText}>#{tag.name}</Text>
            </View>
          ))}
        </View>
      )}

      {/* CTA */}
      <Pressable
        style={[sheetStyles.viewDetailBtn, { backgroundColor: accentColor }]}
        onPress={onViewDetail}
      >
        <Text style={sheetStyles.viewDetailBtnText}>View Detail</Text>
        <Ionicons name="arrow-forward" size={16} color={colors.WHITE} />
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.WHITE,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.WHITE,
  },
  overlayRow: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.GREEN,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },
  pillsScroll: {
    flex: 1,
  },
  pillsContent: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 4,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.WHITE,
    borderWidth: 1.5,
    borderColor: colors.GRAY300,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  pillText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GRAY700,
  },
  pillTextActive: {
    color: colors.WHITE,
  },
  spinner: {
    marginLeft: 4,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.WHITE,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.GRAY200,
    alignSelf: "center",
    marginBottom: 16,
  },
});

const sheetStyles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  typeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: colors.GRAY900,
  },
  typeBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.WHITE,
  },
  authorName: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GRAY700,
  },
  description: {
    fontSize: 14,
    color: colors.GRAY700,
    lineHeight: 20,
    marginBottom: 12,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: colors.GRAY100,
  },
  chipText: {
    fontSize: 12,
    color: colors.GRAY600,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 16,
  },
  tag: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.GRAY200,
  },
  tagText: {
    fontSize: 12,
    color: colors.GRAY700,
  },
  viewDetailBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
  },
  viewDetailBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.WHITE,
  },
});
