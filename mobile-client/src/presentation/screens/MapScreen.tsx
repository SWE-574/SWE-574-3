import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Location from "expo-location";
import WebView from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import Slider from "@react-native-community/slider";
import { colors } from "../../constants/colors";
import { listServices } from "../../api/services";
import type { Service, ServiceType } from "../../api/types";
import { getMapboxToken } from "../../constants/env";
import {
  pillIdentity,
  SIGNAL_CHIPS,
  type PillIdentity,
} from "../../utils/pillIdentity";
import { getServiceDistanceKm } from "../../utils/discovery";
import MapSearchResults, {
  type MapSearchResult,
} from "../components/MapSearchResults";
import { MAPBOX_HTML } from "../../../assets/mapboxHtml";

type SignalFilter = Exclude<PillIdentity, "default">;

// Istanbul city center — used when location permission is denied
const DEFAULT_LOCATION = { latitude: 41.0082, longitude: 28.9784 };
const MAPBOX_STYLE = "mapbox://styles/sgunes16/cmmc96rwc00c701qz7v0g8h9k";

/**
 * Rendered in place of the WebView when Mapbox is unavailable — token
 * missing in the build, network down, or the WebView itself errored.
 * Pre-fix the screen rendered an empty WebView and the user saw a blank
 * surface with no explanation (#453b).
 */
function MapUnavailable({
  onRetry,
  insetTop,
  reason,
}: {
  onRetry: () => void;
  insetTop: number;
  reason: "no-token" | "load-failed";
}) {
  const body =
    reason === "no-token"
      ? "Map service is not configured for this build. Check your connection or try a different build."
      : "Could not load the map. Check your connection and try again.";
  return (
    <View
      style={[unavailableStyles.container, { paddingTop: insetTop + 24 }]}
      accessibilityRole="alert"
      accessibilityLabel="Map unavailable"
    >
      <View style={unavailableStyles.iconWrap}>
        <Ionicons name="map-outline" size={36} color={colors.GREEN} />
      </View>
      <Text style={unavailableStyles.title}>Map unavailable</Text>
      <Text style={unavailableStyles.body}>{body}</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry loading the map"
        style={({ pressed }) => [
          unavailableStyles.retryBtn,
          pressed && { opacity: 0.85 },
        ]}
        testID="map-retry-button"
      >
        <Ionicons name="refresh" size={16} color={colors.WHITE} />
        <Text style={unavailableStyles.retryBtnText}>Retry</Text>
      </Pressable>
    </View>
  );
}

const unavailableStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    backgroundColor: colors.GRAY50,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.GREEN_LT,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.GRAY900,
    marginBottom: 6,
    textAlign: "center",
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.GRAY600,
    textAlign: "center",
    marginBottom: 16,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.GREEN,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.WHITE,
  },
});

type MapPayload = {
  id: string;
  type: ServiceType;
  lat: number;
  lng: number;
};

function toPayload(services: Service[]): MapPayload[] {
  return services
    .map((s) => ({
      id: s.id,
      type: s.type,
      lat: Number(s.location_lat),
      lng: Number(s.location_lng),
    }))
    .filter((p) => !Number.isNaN(p.lat) && !Number.isNaN(p.lng));
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const webViewRef = useRef<WebView>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locationResolved, setLocationResolved] = useState(false);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [activeSignals, setActiveSignals] = useState<Set<SignalFilter>>(
    () => new Set(),
  );
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [distanceKm, setDistanceKm] = useState(15);
  const [showRangeSlider, setShowRangeSlider] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapInited, setMapInited] = useState(false);
  // Bumped on Retry to force the WebView and the asset-load effect to remount.
  // WebViews don't expose a clean reload-on-error API, so a key change is the
  // most reliable reset path.
  const [mapAttempt, setMapAttempt] = useState(0);
  const [mapLoadFailed, setMapLoadFailed] = useState(false);
  const mapboxToken = getMapboxToken();

  const locationCheckedRef = useRef(false);
  const drawerAnim = useRef(new Animated.Value(0)).current;

  // The WebView HTML used to live in `assets/mapbox.html` and was loaded
  // through Asset.downloadAsync + File.text(). That round-trip got cached
  // by both Expo Asset and the iOS app sandbox, so a fresh build of the
  // simulator app would still serve the previous HTML body until the user
  // deleted the app — every time the bridge logic changed it looked like
  // the fix had not landed. Inlining the HTML as a string constant keeps
  // it in the JS bundle, so a Metro reload always serves the newest copy
  // and there is no asynchronous load to fail.
  const retryMap = useCallback(() => {
    setMapLoadFailed(false);
    setMapReady(false);
    setMapInited(false);
    setMapAttempt((value) => value + 1);
  }, []);

  // Resolve user location once. When permission is denied or unavailable, fall
  // back to Istanbul so the map is centered somewhere sensible from the start.
  useEffect(() => {
    if (locationCheckedRef.current) return;
    locationCheckedRef.current = true;

    (async () => {
      try {
        // Fast path: last-known position returns immediately without warming
        // up GPS. Seeds the map with a real origin while the fresh fix is
        // still pending, so the camera doesn't sit on Istanbul for 5+ seconds
        // on cold start.
        const last = await Location.getLastKnownPositionAsync().catch(
          () => null,
        );
        if (last) {
          setUserLocation({
            latitude: last.coords.latitude,
            longitude: last.coords.longitude,
          });
        }

        const { granted } = await Location.getForegroundPermissionsAsync();
        let permission = granted;
        if (!permission) {
          const request = await Location.requestForegroundPermissionsAsync();
          permission = request.granted;
        }
        if (permission) {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setUserLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        }
      } catch {
        // fall back to Istanbul / last-known
      } finally {
        setLocationResolved(true);
      }
    })();
  }, []);

  const post = useCallback((payload: Record<string, unknown>) => {
    // postMessage hands the JSON across the bridge as data, so nothing is
    // ever spliced into a JS string for injectJavaScript to evaluate.
    // mapbox.html's window/document message listeners forward to handle().
    webViewRef.current?.postMessage(JSON.stringify(payload));
  }, []);

  // Init the map as soon as the WebView is ready. We deliberately do NOT
  // wait on the GPS fix — iOS getCurrentPositionAsync can take 5–8s on a cold
  // start, and blocking the map behind that is the dominant load-time cost.
  // If no user location is known yet, fall back to Istanbul and fly to the
  // real fix when it arrives (see effect below).
  const initWithUserRef = useRef(false);
  useEffect(() => {
    if (mapInited) return;
    if (!mapReady) return;
    const haveUser = !!userLocation;
    const center = userLocation
      ? { lat: userLocation.latitude, lng: userLocation.longitude }
      : { lat: DEFAULT_LOCATION.latitude, lng: DEFAULT_LOCATION.longitude };
    post({
      type: "init",
      token: mapboxToken,
      style: MAPBOX_STYLE,
      center,
      zoom: 11,
      services: toPayload(services),
      user: userLocation
        ? { lat: userLocation.latitude, lng: userLocation.longitude }
        : null,
    });
    if (haveUser) initWithUserRef.current = true;
    setMapInited(true);
  }, [mapReady, userLocation, services, post, mapInited, mapboxToken]);

  // If init ran before GPS resolved, fly to the user once the fresh fix
  // arrives so they don't have to tap "find me" themselves.
  useEffect(() => {
    if (!mapInited) return;
    if (!userLocation) return;
    if (initWithUserRef.current) return;
    initWithUserRef.current = true;
    post({
      type: "setUser",
      lat: userLocation.latitude,
      lng: userLocation.longitude,
    });
    post({
      type: "flyTo",
      lat: userLocation.latitude,
      lng: userLocation.longitude,
    });
  }, [mapInited, userLocation, post]);

  const recenterOnUser = useCallback(async () => {
    try {
      const { granted } = await Location.getForegroundPermissionsAsync();
      let permission = granted;
      if (!permission) {
        const req = await Location.requestForegroundPermissionsAsync();
        permission = req.granted;
      }
      if (!permission) {
        Alert.alert(
          "Location off",
          "Enable location for The Hive in iOS Settings to recenter on your position.",
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const next = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };
      setUserLocation(next);
      post({ type: "setUser", lat: next.latitude, lng: next.longitude });
      post({ type: "flyTo", lat: next.latitude, lng: next.longitude });
    } catch {
      // best-effort
    }
  }, [post]);

  // Hold the latest location in a ref so fetchServices can read it without
  // re-firing when GPS refines from last-known to a fresh fix. Pre-fix we
  // re-fetched listServices twice on every cold start.
  const userLocationRef = useRef(userLocation);
  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  // The distance param is only forwarded when the viewer has opened the
  // range slider -- without that gate, the iOS simulator default location
  // (San Francisco) sits ~10,000 km from the demo seed and a 15 km cutoff
  // silently filters every row out of the response. Mirrors
  // `radiusFilterEnabled` on the web dashboard.
  const fetchServices = useCallback(async () => {
    try {
      setIsLoadingServices(true);
      const loc = userLocationRef.current;
      const params = loc
        ? {
            page_size: 200,
            lat: loc.latitude,
            lng: loc.longitude,
            ...(showRangeSlider ? { distance: distanceKm } : {}),
          }
        : { page_size: 200 };

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
  }, [distanceKm, showRangeSlider]);

  // Wait for the location resolution to settle before the first fetch so we
  // make one call, not two — once with no coords, once with coords.
  useEffect(() => {
    if (!locationResolved) return;
    fetchServices();
  }, [locationResolved, fetchServices]);

  // 250ms is the same debounce used by the web Browse search; tighter feels
  // jittery while typing, looser delays the dropdown long enough that users
  // start to wonder whether the query took.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 250);
    return () => clearTimeout(id);
  }, [searchQuery]);

  // Markers reflect signal selection but ignore the search query — the
  // search box drives the dropdown surface, not the pin set. Pre-fix, typing
  // "yoga" made every other pin disappear with no list to back it up.
  const visibleServices = useMemo(() => {
    if (activeSignals.size === 0) return services;
    return services.filter((s) => {
      const id = pillIdentity(s);
      return id !== "default" && activeSignals.has(id);
    });
  }, [services, activeSignals]);

  const lowerQuery = debouncedQuery.toLowerCase();
  const searchResults = useMemo<MapSearchResult[]>(() => {
    if (!lowerQuery) return [];
    return visibleServices
      .filter((s) => {
        const haystack = [
          s.title,
          s.description,
          ...(s.tags ?? []).map((t) => t.name),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(lowerQuery);
      })
      .map((service) => ({
        service,
        distanceKm: getServiceDistanceKm(
          service,
          userLocation
            ? {
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
              }
            : null,
        ),
      }));
  }, [visibleServices, lowerQuery, userLocation]);

  const showResultsDropdown = debouncedQuery.length > 0 && searchFocused;

  // Push the visible service set to the WebView whenever it changes (after init).
  useEffect(() => {
    if (!mapInited) return;
    post({ type: "updateServices", services: toPayload(visibleServices) });
  }, [visibleServices, mapInited, post]);

  useEffect(() => {
    Animated.spring(drawerAnim, {
      toValue: selectedService ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 90,
    }).start();
  }, [selectedService, drawerAnim]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let parsed: { type?: string; id?: string; message?: string } | null = null;
      try {
        parsed = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (!parsed) return;
      switch (parsed.type) {
        case "loaded":
        case "ready":
          // mapbox.html sends "loaded" once the IIFE runs (which is right
          // after the synchronous mapbox-gl.js script tag finishes), and
          // sends "ready" later from inside map.on("load"). The init post
          // is gated on mapReady, so if we only flipped the flag on "ready"
          // we'd deadlock — "ready" can never fire because it lives
          // inside init(), which never runs because we never post init.
          // Either signal is sufficient evidence that mapboxgl is alive
          // and we can safely send the init payload across the bridge.
          setMapReady(true);
          break;
        case "markerPress": {
          const service = services.find((s) => s.id === parsed!.id);
          if (service) setSelectedService(service);
          break;
        }
        case "error":
          if (parsed.message) console.warn("[MapScreen]", parsed.message);
          break;
      }
    },
    [services],
  );

  const handleSelectResult = useCallback(
    (service: Service) => {
      const lat = Number(service.location_lat);
      const lng = Number(service.location_lng);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        post({ type: "flyTo", lat, lng, zoom: 14 });
      }
      setSelectedService(service);
      setSearchFocused(false);
      setSearchQuery("");
    },
    [post],
  );

  const toggleSignal = useCallback((id: SignalFilter) => {
    setActiveSignals((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleViewDetail = useCallback(() => {
    if (!selectedService) return;
    const id = selectedService.id;
    setSelectedService(null);
    navigation.navigate("ServiceDetail", { id });
  }, [selectedService, navigation]);

  // Mapbox unavailable surfaces — replaces the silent empty WebView pre-fix
  // (#453b). Two paths reach this branch:
  //   - no token configured for the build (server / env mis-config), OR
  //   - the HTML asset failed to load (typical sign of being offline).
  if (!mapboxToken || mapLoadFailed) {
    return (
      <MapUnavailable
        onRetry={retryMap}
        insetTop={insets.top}
        reason={!mapboxToken ? "no-token" : "load-failed"}
      />
    );
  }

  const drawerTranslate = drawerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [DRAWER_HEIGHT, 0],
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <WebView
        key={`mapbox-${mapAttempt}`}
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{ html: MAPBOX_HTML, baseUrl: "https://localhost" }}
        onMessage={handleMessage}
        onError={() => setMapLoadFailed(true)}
        onHttpError={() => setMapLoadFailed(true)}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        style={styles.webview}
        scalesPageToFit={false}
        scrollEnabled={false}
        bounces={false}
      />

      {/* Top overlay: search bar + filter pills */}
      <View style={[styles.topOverlay, { top: insets.top + 8 }]}>
        <View style={styles.searchRow}>
          {navigation.canGoBack() && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-back" size={20} color={colors.WHITE} />
            </TouchableOpacity>
          )}
          <View style={styles.searchInputWrap}>
            <Ionicons
              name="search-outline"
              size={16}
              color={colors.GRAY500}
              style={{ marginRight: 6 }}
            />
            <TextInput
              value={searchQuery}
              onChangeText={(value) => {
                setSearchQuery(value);
                if (value.length > 0) setSearchFocused(true);
              }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search title, description, tags…"
              placeholderTextColor={colors.GRAY400}
              style={styles.searchInput}
              returnKeyType="search"
            />
            {searchQuery.length > 0 ? (
              <Pressable
                hitSlop={8}
                onPress={() => {
                  setSearchQuery("");
                  setSearchFocused(false);
                }}
              >
                <Ionicons name="close-circle" size={16} color={colors.GRAY400} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {showResultsDropdown ? (
          <MapSearchResults
            results={searchResults}
            onSelect={handleSelectResult}
            emptyLabel={`No matches for "${debouncedQuery}"`}
          />
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsContent}
          style={styles.pillsScroll}
        >
          {SIGNAL_CHIPS.map((chip) => {
            const active = activeSignals.has(chip.id);
            return (
              <TouchableOpacity
                key={chip.id}
                onPress={() => toggleSignal(chip.id)}
                activeOpacity={0.8}
                style={[
                  styles.pill,
                  active && {
                    backgroundColor: chip.color,
                    borderColor: chip.color,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={chip.label}
                testID={`map-signal-${chip.id}`}
              >
                <Text
                  style={[styles.pillText, active && styles.pillTextActive]}
                >
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            onPress={() => setShowRangeSlider((v) => !v)}
            activeOpacity={0.8}
            style={[
              styles.pill,
              showRangeSlider && {
                backgroundColor: colors.GREEN,
                borderColor: colors.GREEN,
              },
            ]}
          >
            <Text
              style={[
                styles.pillText,
                showRangeSlider && styles.pillTextActive,
              ]}
            >
              Range · {distanceKm}km
            </Text>
          </TouchableOpacity>
          {isLoadingServices && (
            <ActivityIndicator
              size="small"
              color={colors.GREEN}
              style={styles.spinner}
            />
          )}
        </ScrollView>

        {showRangeSlider ? (
          <View style={styles.rangeRow}>
            <Text style={styles.rangeLabel}>1km</Text>
            <Slider
              style={styles.rangeSlider}
              minimumValue={1}
              maximumValue={50}
              step={1}
              value={distanceKm}
              onSlidingComplete={(v) => setDistanceKm(Math.round(v))}
              minimumTrackTintColor={colors.GREEN}
              maximumTrackTintColor={colors.GRAY300}
              thumbTintColor={colors.GREEN}
            />
            <Text style={styles.rangeLabel}>50km</Text>
          </View>
        ) : null}
      </View>

      {/* Find-me FAB */}
      <TouchableOpacity
        style={[
          styles.findMeFab,
          {
            bottom:
              insets.bottom +
              (selectedService ? DRAWER_HEIGHT + 12 : 24),
          },
        ]}
        onPress={recenterOnUser}
        activeOpacity={0.85}
      >
        <Ionicons name="locate" size={22} color={colors.GREEN} />
      </TouchableOpacity>

      {/* Persistent bottom drawer for the selected service */}
      <Animated.View
        style={[
          styles.drawer,
          {
            paddingBottom: insets.bottom + 12,
            transform: [{ translateY: drawerTranslate }],
          },
        ]}
        pointerEvents={selectedService ? "auto" : "none"}
      >
        <View style={styles.sheetHandle} />
        {selectedService ? (
          <MarkerSheet
            service={selectedService}
            onClose={() => setSelectedService(null)}
            onViewDetail={handleViewDetail}
          />
        ) : null}
      </Animated.View>
    </View>
  );
}

const DRAWER_HEIGHT = 360;

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
  const isRecurring =
    service.type === "Event" && service.schedule_type === "Recurrent";

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
  webview: {
    flex: 1,
    backgroundColor: colors.WHITE,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.WHITE,
  },
  topOverlay: {
    position: "absolute",
    left: 12,
    right: 12,
    gap: 10,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.WHITE,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.GRAY900,
    paddingVertical: 0,
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
    flexGrow: 0,
  },
  pillsContent: {
    flexDirection: "row",
    alignItems: "center",
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
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.WHITE,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  rangeLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.GRAY500,
  },
  rangeSlider: {
    flex: 1,
    height: 28,
  },
  findMeFab: {
    position: "absolute",
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.WHITE,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.GRAY200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 6,
  },
  drawer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: DRAWER_HEIGHT,
    backgroundColor: colors.WHITE,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 10,
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
