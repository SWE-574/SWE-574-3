import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { colors } from "../../../constants/colors";
import {
  reverseGeocodeLocation,
  type LocationValue,
} from "../../../utils/mapboxLocation";

type Props = {
  visible: boolean;
  title: string;
  description: string;
  initialValue: LocationValue | null;
  onClose: () => void;
  onConfirm: (value: LocationValue) => void;
};

const DEFAULT_CENTER = {
  lat: 41.0082,
  lng: 28.9784,
};

function buildLeafletHtml(selected: LocationValue | null): string {
  const center = selected ?? DEFAULT_CENTER;
  const markerJs = selected
    ? `marker = L.marker([${selected.lat}, ${selected.lng}]).addTo(map);`
    : "";

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
    />
    <link
      rel="stylesheet"
      href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    />
    <style>
      html, body, #map {
        height: 100%;
        margin: 0;
        padding: 0;
        background: #f3f4f6;
      }
      .leaflet-container {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      const map = L.map('map', { zoomControl: false }).setView(
        [${center.lat}, ${center.lng}],
        15
      );

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      let marker = null;
      ${markerJs}

      map.on('click', function(event) {
        const { lat, lng } = event.latlng;
        if (marker) {
          marker.setLatLng([lat, lng]);
        } else {
          marker = L.marker([lat, lng]).addTo(map);
        }
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'map-press',
          lat,
          lng
        }));
      });
    </script>
  </body>
</html>`;
}

export default function LeafletLocationPickerModal({
  visible,
  title,
  description,
  initialValue,
  onClose,
  onConfirm,
}: Props) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<LocationValue | null>(initialValue);
  const [resolving, setResolving] = useState(false);
  const mapHtml = useMemo(() => buildLeafletHtml(selected), [selected]);

  useEffect(() => {
    if (visible) {
      setSelected(initialValue);
    }
  }, [initialValue, visible]);

  const handleMessage = async (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message?.type !== "map-press") return;

      const lat = Number(message.lat);
      const lng = Number(message.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      setResolving(true);
      const resolved = await reverseGeocodeLocation(lat, lng);
      if (resolved) {
        setSelected({
          ...resolved,
          lat,
          lng,
        });
        return;
      }

      setSelected({
        label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        fullAddress: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        district: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        lat,
        lng,
      });
    } catch {
      // Ignore malformed webview payloads.
    } finally {
      setResolving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Pressable style={styles.iconButton} onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.GRAY800} />
          </Pressable>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>{title}</Text>
            <Text style={styles.headerSubtitle}>{description}</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.mapCard}>
          <WebView
            originWhitelist={["*"]}
            source={{ html: mapHtml }}
            onMessage={handleMessage}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="small" color={colors.GREEN} />
              </View>
            )}
          />
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Text style={styles.infoEyebrow}>Selected location</Text>
            {resolving ? (
              <ActivityIndicator size="small" color={colors.GREEN} />
            ) : null}
          </View>
          <Text style={styles.infoTitle}>
            {selected?.fullAddress ?? "Tap the map to place the pin"}
          </Text>
          <Text style={styles.infoMeta}>
            {selected
              ? `${selected.lat.toFixed(5)}, ${selected.lng.toFixed(5)}`
              : "Tap anywhere on the map to choose the location"}
          </Text>
        </View>

        <View style={[styles.footer, { paddingBottom: Math.max(16, insets.bottom) }]}>
          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[
              styles.primaryButton,
              !selected && styles.primaryButtonDisabled,
            ]}
            onPress={() => selected && onConfirm(selected)}
            disabled={!selected}
          >
            <Text style={styles.primaryButtonText}>Use this location</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.GRAY50,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.WHITE,
    borderWidth: 1,
    borderColor: colors.GRAY200,
  },
  headerTextWrap: {
    flex: 1,
    paddingHorizontal: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.GRAY900,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.GRAY500,
    marginTop: 2,
  },
  headerSpacer: {
    width: 40,
  },
  mapCard: {
    marginHorizontal: 16,
    marginTop: 4,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.GRAY200,
    height: 360,
    backgroundColor: colors.WHITE,
  },
  loadingOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.WHITE,
  },
  infoCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.WHITE,
    borderWidth: 1,
    borderColor: colors.GRAY200,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  infoEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.GRAY500,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  infoTitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
    color: colors.GRAY900,
  },
  infoMeta: {
    fontSize: 12,
    color: colors.GRAY500,
    marginTop: 6,
  },
  footer: {
    marginTop: "auto",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    backgroundColor: colors.WHITE,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.GRAY700,
  },
  primaryButton: {
    flex: 1.4,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.WHITE,
  },
});
