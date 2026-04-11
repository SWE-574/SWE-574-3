import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import * as ExpoLocation from "expo-location";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../../constants/colors";
import LeafletLocationPickerModal from "../service/LeafletLocationPickerModal";
import {
  getMapboxToken,
  searchMapboxLocations,
  reverseGeocodeLocation,
  type LocationValue,
} from "../../../utils/mapboxLocation";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    exact_location: string;
    exact_duration: number;
    scheduled_time: string;
    exact_location_lat?: number;
    exact_location_lng?: number;
  }) => Promise<void>;
  serviceType?: string;
  scheduleType?: string;
  maxParticipants?: number;
  serviceLocationType?: string;
  serviceLocationArea?: string | null;
  serviceExactLocation?: string | null;
  serviceLocationGuide?: string | null;
  serviceScheduledTime?: string | null;
  provisionedHours?: number;
};

type PickerMode = "date" | "time" | null;

function fmtDate(value: Date): string {
  return value.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTime(value: Date): string {
  return value.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatInitiateHandshakeModal({
  visible,
  onClose,
  onSubmit,
  serviceType,
  scheduleType,
  maxParticipants,
  serviceLocationType,
  serviceLocationArea,
  serviceExactLocation,
  serviceLocationGuide,
  serviceScheduledTime,
  provisionedHours,
}: Props) {
  const fixedGroupOffer =
    serviceType === "Offer" &&
    scheduleType === "One-Time" &&
    (maxParticipants ?? 1) > 1;
  const isOnline = serviceLocationType === "Online";
  const tokenAvailable = !!getMapboxToken();

  const [location, setLocation] = useState("");
  const [duration, setDuration] = useState(
    provisionedHours ? String(Math.max(1, Math.round(provisionedHours))) : "1",
  );
  const [dateTime, setDateTime] = useState<Date>(() => {
    const fallback = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return serviceScheduledTime ? new Date(serviceScheduledTime) : fallback;
  });
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationValue | null>(
    null,
  );
  const [locationInputFocused, setLocationInputFocused] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<LocationValue[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [resolvingCurrentLocation, setResolvingCurrentLocation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suppressLocationSearch = useRef(false);
  const autoSelectInitialLocation = useRef(false);
  const searchLockedUntilManualEdit = useRef(false);
  const searchRequestId = useRef(0);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    suppressLocationSearch.current = true;
    setLocation(serviceExactLocation ?? serviceLocationArea ?? "");
    setDuration(
      provisionedHours ? String(Math.max(1, Math.round(provisionedHours))) : "1",
    );
    setDateTime(
      serviceScheduledTime
        ? new Date(serviceScheduledTime)
        : new Date(Date.now() + 24 * 60 * 60 * 1000),
    );
    setSelectedLocation(null);
    setLocationInputFocused(false);
    setLocationSuggestions([]);
    setPickerMode(null);
    autoSelectInitialLocation.current = !isOnline && !fixedGroupOffer;
    searchLockedUntilManualEdit.current = false;
    searchRequestId.current += 1;
  }, [
    fixedGroupOffer,
    isOnline,
    provisionedHours,
    serviceExactLocation,
    serviceLocationArea,
    serviceScheduledTime,
    visible,
  ]);

  useEffect(() => {
    let active = true;

    if (!visible || isOnline || fixedGroupOffer || !tokenAvailable) {
      setLocationSuggestions([]);
      setLoadingLocations(false);
      return;
    }

    if (suppressLocationSearch.current) {
      suppressLocationSearch.current = false;
      return;
    }

    if (searchLockedUntilManualEdit.current) {
      setLocationSuggestions([]);
      setLoadingLocations(false);
      return;
    }

    if (location.trim().length < 2) {
      setLocationSuggestions([]);
      setLoadingLocations(false);
      return;
    }

    const handle = setTimeout(async () => {
      const requestId = ++searchRequestId.current;
      setLoadingLocations(true);
      try {
        const results = await searchMapboxLocations(location.trim(), "full");
        if (!active || requestId !== searchRequestId.current) return;
        const nextSuggestions = results.slice(0, 6);
        setLocationSuggestions(nextSuggestions);
      } catch {
        if (active && requestId === searchRequestId.current) {
          setLocationSuggestions([]);
        }
      } finally {
        if (active && requestId === searchRequestId.current) {
          setLoadingLocations(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [fixedGroupOffer, isOnline, location, tokenAvailable, visible]);

  useEffect(() => {
    let active = true;

    if (
      !visible ||
      isOnline ||
      fixedGroupOffer ||
      !tokenAvailable ||
      !autoSelectInitialLocation.current ||
      selectedLocation ||
      location.trim().length < 2
    ) {
      return;
    }

    const handle = setTimeout(async () => {
      try {
        const results = await searchMapboxLocations(location.trim(), "full");
        if (!active) return;
        const first = results[0];
        if (first) {
          applyResolvedLocation(first);
        } else {
          setLocationSuggestions([]);
        }
      } catch {
        if (active) setLocationSuggestions([]);
      } finally {
        autoSelectInitialLocation.current = false;
      }
    }, 0);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [
    fixedGroupOffer,
    isOnline,
    location,
    selectedLocation,
    tokenAvailable,
    visible,
  ]);

  const headerTitle = fixedGroupOffer
    ? "Share Offer Details"
    : "Initiate Handshake";

  const headerText = fixedGroupOffer
    ? "This group offer already has fixed session details. Share them with the requester."
    : "Propose the session time, duration and location. The requester will review and approve.";

  const effectiveLocation = useMemo(() => {
    if (isOnline) return "";
    return fixedGroupOffer ? serviceExactLocation ?? serviceLocationArea ?? "" : location;
  }, [fixedGroupOffer, isOnline, location, serviceExactLocation, serviceLocationArea]);

  const effectiveDuration = useMemo(() => {
    if (fixedGroupOffer && provisionedHours) {
      return Math.max(1, Math.round(provisionedHours));
    }
    return Math.max(1, Number.parseInt(duration, 10) || 1);
  }, [duration, fixedGroupOffer, provisionedHours]);

  const effectiveDateTime = useMemo(() => {
    if (fixedGroupOffer && serviceScheduledTime) {
      return new Date(serviceScheduledTime);
    }
    return dateTime;
  }, [dateTime, fixedGroupOffer, serviceScheduledTime]);

  const applyResolvedLocation = (value: LocationValue) => {
    searchRequestId.current += 1;
    suppressLocationSearch.current = true;
    searchLockedUntilManualEdit.current = true;
    setSelectedLocation(value);
    setLocation(value.fullAddress ?? value.label);
    setLocationSuggestions([]);
    setError(null);
  };

  const onDateTimeChange = (
    _event: DateTimePickerEvent,
    value?: Date,
  ) => {
    setPickerMode(null);
    if (!value) return;
    setDateTime((prev) => {
      const next = new Date(prev);
      next.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
      if (_event.type !== "dismissed" && pickerMode === "time") {
        next.setHours(value.getHours(), value.getMinutes(), 0, 0);
      } else if (_event.type !== "dismissed" && pickerMode === "date") {
        next.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
      }
      if (_event.type !== "dismissed" && pickerMode === "time") {
        next.setHours(value.getHours(), value.getMinutes(), 0, 0);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    setError(null);
    if (!isOnline && !effectiveLocation.trim()) {
      setError("Location is required.");
      return;
    }
    if (effectiveDateTime.getTime() <= Date.now()) {
      setError("Scheduled time must be in the future.");
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        exact_location: effectiveLocation.trim(),
        exact_duration: effectiveDuration,
        scheduled_time: effectiveDateTime.toISOString(),
        ...(selectedLocation
          ? {
              exact_location_lat: selectedLocation.lat,
              exact_location_lng: selectedLocation.lng,
            }
          : {}),
      });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to initiate handshake.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const useCurrentLocation = async () => {
    try {
      setResolvingCurrentLocation(true);
      searchRequestId.current += 1;
      searchLockedUntilManualEdit.current = true;
      setLocationSuggestions([]);
      const permission = await ExpoLocation.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert(
          "Permission required",
          "Location permission is required to use your current position.",
        );
        return;
      }

      const coords = await ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy.Balanced,
      });

      const resolved = await reverseGeocodeLocation(
        coords.coords.latitude,
        coords.coords.longitude,
      );

      const nextValue =
        resolved ??
        ({
          label: `${coords.coords.latitude.toFixed(5)}, ${coords.coords.longitude.toFixed(5)}`,
          fullAddress: `${coords.coords.latitude.toFixed(5)}, ${coords.coords.longitude.toFixed(5)}`,
          district: `${coords.coords.latitude.toFixed(5)}, ${coords.coords.longitude.toFixed(5)}`,
          lat: coords.coords.latitude,
          lng: coords.coords.longitude,
        } satisfies LocationValue);

      applyResolvedLocation(nextValue);
    } catch {
      Alert.alert("Location unavailable", "Please try again.");
    } finally {
      setResolvingCurrentLocation(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{headerTitle}</Text>
          <Text style={styles.subtitle}>{headerText}</Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {!isOnline && (
              <View style={styles.field}>
                <Text style={styles.label}>Exact Location</Text>
                {fixedGroupOffer ? (
                  <View style={styles.readonlyBox}>
                    <Text style={styles.readonlyText}>
                      {effectiveLocation || "No location provided"}
                    </Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.inputRow}>
                      <TextInput
                        value={location}
                        onChangeText={(value) => {
                          autoSelectInitialLocation.current = false;
                          searchLockedUntilManualEdit.current = false;
                          searchRequestId.current += 1;
                          setLocation(value);
                          if (!value.trim()) {
                            setSelectedLocation(null);
                            setLocationSuggestions([]);
                          }
                        }}
                        onFocus={() => setLocationInputFocused(true)}
                        onBlur={() => setLocationInputFocused(false)}
                        selection={
                          locationInputFocused ? undefined : { start: 0, end: 0 }
                        }
                        placeholder="Enter exact location"
                        placeholderTextColor={colors.GRAY400}
                        style={[styles.input, styles.inputRowField]}
                      />
                      {(location.length > 0 || selectedLocation) ? (
                        <Pressable
                          onPress={() => {
                            setLocation("");
                            setSelectedLocation(null);
                            setLocationSuggestions([]);
                            searchLockedUntilManualEdit.current = false;
                            searchRequestId.current += 1;
                            setError(null);
                          }}
                          style={styles.inputClearBtn}
                          hitSlop={8}
                        >
                          <Ionicons
                            name="close-circle"
                            size={18}
                            color={colors.GRAY400}
                          />
                        </Pressable>
                      ) : null}
                    </View>
                    {loadingLocations ? (
                      <Text style={styles.helperText}>Searching addresses...</Text>
                    ) : null}
                    {locationSuggestions.length > 0 ? (
                      <View style={styles.dropdown}>
                        {locationSuggestions.map((item) => (
                          <Pressable
                            key={`${item.lat}-${item.lng}-${item.fullAddress}`}
                            style={styles.dropdownItem}
                            onPress={() => applyResolvedLocation(item)}
                          >
                            <Text style={styles.dropdownTitle}>
                              {item.fullAddress ?? item.label}
                            </Text>
                            <Text style={styles.dropdownSubtitle}>
                              {item.district ?? item.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                    <View style={styles.locationActions}>
                      <Pressable
                        style={styles.locationActionButton}
                        onPress={useCurrentLocation}
                        disabled={resolvingCurrentLocation}
                      >
                        {resolvingCurrentLocation ? (
                          <ActivityIndicator size="small" color={colors.BLUE} />
                        ) : (
                          <Ionicons
                            name="locate-outline"
                            size={16}
                            color={colors.BLUE}
                          />
                        )}
                        <Text style={styles.locationActionText}>Current location</Text>
                      </Pressable>
                      <Pressable
                        style={styles.locationActionButton}
                        onPress={() => {
                          searchRequestId.current += 1;
                          searchLockedUntilManualEdit.current = true;
                          setLocationSuggestions([]);
                          setShowMapPicker(true);
                        }}
                      >
                        <Ionicons name="map-outline" size={16} color={colors.BLUE} />
                        <Text style={styles.locationActionText}>Pick on map</Text>
                      </Pressable>
                    </View>
                    {selectedLocation ? (
                      <View style={styles.selectedLocationCard}>
                        <Text style={styles.selectedLocationTitle}>Selected address</Text>
                        <Text style={styles.selectedLocationBody}>
                          {selectedLocation.fullAddress ?? selectedLocation.label}
                        </Text>
                        <Text style={styles.selectedLocationMeta}>
                          {selectedLocation.lat.toFixed(5)},{" "}
                          {selectedLocation.lng.toFixed(5)}
                        </Text>
                      </View>
                    ) : null}
                  </>
                )}
                {!!serviceLocationGuide && (
                  <Text style={styles.hint}>{serviceLocationGuide}</Text>
                )}
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Duration (hours)</Text>
              {fixedGroupOffer ? (
                <View style={styles.readonlyBox}>
                  <Text style={styles.readonlyText}>{effectiveDuration}h</Text>
                </View>
              ) : (
                <TextInput
                  value={duration}
                  onChangeText={setDuration}
                  placeholder="1"
                  keyboardType="number-pad"
                  placeholderTextColor={colors.GRAY400}
                  style={styles.input}
                />
              )}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Date</Text>
              <Pressable
                style={styles.pickerButton}
                onPress={() => !fixedGroupOffer && setPickerMode("date")}
              >
                <Text style={styles.pickerButtonText}>
                  {fmtDate(effectiveDateTime)}
                </Text>
              </Pressable>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Time</Text>
              <Pressable
                style={styles.pickerButton}
                onPress={() => !fixedGroupOffer && setPickerMode("time")}
              >
                <Text style={styles.pickerButtonText}>
                  {fmtTime(effectiveDateTime)}
                </Text>
              </Pressable>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable style={styles.cancelButton} onPress={onClose} disabled={loading}>
              <Text style={styles.cancelButtonText}>Close</Text>
            </Pressable>
            <Pressable
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.submitButtonText}>
                {loading ? "Saving..." : fixedGroupOffer ? "Share Details" : "Initiate"}
              </Text>
            </Pressable>
          </View>

          {pickerMode ? (
            <DateTimePicker
              value={effectiveDateTime}
              mode={pickerMode}
              minimumDate={pickerMode === "date" ? new Date() : undefined}
              is24Hour
              onChange={onDateTimeChange}
            />
          ) : null}

          <LeafletLocationPickerModal
            visible={showMapPicker}
            title="Choose location"
            description="Refine the exact address on the map."
            initialValue={selectedLocation}
            onClose={() => setShowMapPicker(false)}
            onConfirm={(value) => {
              applyResolvedLocation(value);
              setShowMapPicker(false);
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "88%",
    backgroundColor: colors.WHITE,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.GRAY900,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: colors.GRAY500,
  },
  scroll: {
    marginTop: 14,
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 8,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GRAY700,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.GRAY200,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.GRAY900,
    backgroundColor: colors.WHITE,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.GRAY200,
    borderRadius: 12,
    backgroundColor: colors.WHITE,
    minHeight: 48,
  },
  inputRowField: {
    flex: 1,
    borderWidth: 0,
    borderRadius: 0,
    minHeight: 48,
    backgroundColor: "transparent",
  },
  inputClearBtn: {
    paddingHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  readonlyBox: {
    borderWidth: 1,
    borderColor: colors.GRAY200,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: colors.GRAY50,
  },
  readonlyText: {
    fontSize: 14,
    color: colors.GRAY900,
  },
  hint: {
    fontSize: 12,
    color: colors.GRAY500,
    fontStyle: "italic",
  },
  helperText: {
    fontSize: 12,
    color: colors.GRAY500,
  },
  dropdown: {
    borderWidth: 1,
    borderColor: colors.GRAY200,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: colors.WHITE,
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.GRAY100,
  },
  dropdownTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.GRAY900,
  },
  dropdownSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: colors.GRAY500,
  },
  locationActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  locationActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.BLUE_LT,
  },
  locationActionText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.BLUE,
  },
  selectedLocationCard: {
    marginTop: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.GRAY50,
    borderWidth: 1,
    borderColor: colors.GRAY200,
  },
  selectedLocationTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.GRAY600,
    textTransform: "uppercase",
  },
  selectedLocationBody: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    color: colors.GRAY900,
    fontWeight: "600",
  },
  selectedLocationMeta: {
    marginTop: 4,
    fontSize: 12,
    color: colors.GRAY500,
  },
  pickerButton: {
    borderWidth: 1,
    borderColor: colors.GRAY200,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: colors.WHITE,
  },
  pickerButtonText: {
    fontSize: 15,
    color: colors.GRAY900,
  },
  errorText: {
    fontSize: 13,
    color: colors.RED,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 12,
  },
  cancelButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.GRAY100,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.GRAY700,
  },
  submitButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.GREEN,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.WHITE,
  },
});
