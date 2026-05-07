/**
 * QRAttendanceModal – dual-purpose modal for QR attendance:
 *   - Participant: scan QR code via camera OR type attendance code manually.
 *   - Organizer: display QR code + attendance code for participants.
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import { colors } from "../../../constants/colors";
import { generateQRToken, type QRTokenResponse } from "../../../api/services";

// ─── Participant: scan QR or enter code ───────────────────────────────────

type ParticipantProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (code: string) => void;
  loading?: boolean;
};

export function QRScannerModal({ visible, onClose, onSubmit, loading }: ParticipantProps) {
  const [mode, setMode] = useState<"scan" | "manual">("scan");
  const [code, setCode] = useState("");
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setCode("");
      scannedRef.current = false;
      setMode("scan");
    }
  }, [visible]);

  const handleBarCodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (scannedRef.current || loading) return;
      scannedRef.current = true;
      try {
        const parsed = JSON.parse(data);
        if (parsed.token) {
          onSubmit(parsed.token);
          return;
        }
      } catch {
        // not JSON — treat as raw token/code
      }
      onSubmit(data);
    },
    [onSubmit, loading],
  );

  const cameraReady = permission?.granted;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>Verify Attendance</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color={colors.GRAY600} />
          </TouchableOpacity>
        </View>

        {/* Tab toggle */}
        <View style={s.tabs}>
          <TouchableOpacity
            style={[s.tab, mode === "scan" && s.tabActive]}
            onPress={() => { setMode("scan"); scannedRef.current = false; }}
          >
            <Ionicons name="qr-code-outline" size={16} color={mode === "scan" ? colors.WHITE : colors.GRAY700} />
            <Text style={[s.tabText, mode === "scan" && s.tabTextActive]}>Scan QR</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tab, mode === "manual" && s.tabActive]}
            onPress={() => setMode("manual")}
          >
            <Ionicons name="keypad-outline" size={16} color={mode === "manual" ? colors.WHITE : colors.GRAY700} />
            <Text style={[s.tabText, mode === "manual" && s.tabTextActive]}>Enter Code</Text>
          </TouchableOpacity>
        </View>

        {mode === "scan" ? (
          <View style={s.scanContainer}>
            {!cameraReady ? (
              <View style={s.permissionBox}>
                <Ionicons name="camera-outline" size={48} color={colors.GRAY400} />
                <Text style={s.permissionText}>Camera access is needed to scan the QR code</Text>
                <TouchableOpacity style={s.permissionBtn} onPress={requestPermission}>
                  <Text style={s.permissionBtnText}>Allow Camera</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <CameraView
                  style={s.camera}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={scannedRef.current ? undefined : handleBarCodeScanned}
                />
                {loading && (
                  <View style={s.scanOverlay}>
                    <ActivityIndicator size="large" color={colors.WHITE} />
                    <Text style={s.scanOverlayText}>Verifying…</Text>
                  </View>
                )}
                <Text style={s.scanHint}>Point camera at the organizer's QR code</Text>
              </>
            )}
          </View>
        ) : (
          <View style={s.manualContainer}>
            <Text style={s.manualLabel}>Enter the 6-character code from the organizer</Text>
            <TextInput
              style={s.codeInput}
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              maxLength={6}
              placeholder="ABC123"
              placeholderTextColor={colors.GRAY300}
              autoCapitalize="characters"
              autoFocus
            />
            <TouchableOpacity
              style={[s.submitBtn, code.length < 4 && s.submitBtnDisabled]}
              disabled={code.length < 4 || loading}
              onPress={() => onSubmit(code)}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.WHITE} />
              ) : (
                <Text style={s.submitBtnText}>Confirm Attendance</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─── Organizer: display QR + code ─────────────────────────────────────────

type OrganizerProps = {
  visible: boolean;
  onClose: () => void;
  serviceId: string;
};

export function QRDisplayModal({ visible, onClose, serviceId }: OrganizerProps) {
  const [data, setData] = useState<QRTokenResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await generateQRToken(serviceId);
      setData(res);
      // Auto-regenerate 10s before expiry
      const ms = new Date(res.expires_at).getTime() - Date.now() - 10_000;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (ms > 0) timerRef.current = setTimeout(generate, ms);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not generate QR token.");
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    if (visible) generate();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [visible, generate]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Attendance QR</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color={colors.GRAY600} />
          </TouchableOpacity>
        </View>

        <View style={s.qrDisplayContainer}>
          {loading && !data ? (
            <ActivityIndicator size="large" color={colors.GREEN} />
          ) : data ? (
            <>
              <View style={s.qrBox}>
                <QRCode value={data.qr_payload} size={220} />
              </View>
              <Text style={s.attendanceCode}>{data.attendance_code}</Text>
              <Text style={s.qrHint}>Participants scan this QR or enter the code above</Text>
              <TouchableOpacity
                style={s.regenerateBtn}
                onPress={generate}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.WHITE} />
                ) : (
                  <>
                    <Ionicons name="refresh-outline" size={16} color={colors.WHITE} />
                    <Text style={s.regenerateBtnText}>Regenerate</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.WHITE,
    paddingTop: Platform.OS === "ios" ? 56 : 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.GRAY800,
  },

  // Tabs
  tabs: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: colors.GRAY100,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: colors.GREEN,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GRAY700,
  },
  tabTextActive: {
    color: colors.WHITE,
  },

  // Scanner
  scanContainer: { flex: 1, marginHorizontal: 20 },
  camera: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  scanOverlayText: {
    color: colors.WHITE,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8,
  },
  scanHint: {
    textAlign: "center",
    color: colors.GRAY500,
    fontSize: 13,
    marginTop: 12,
    marginBottom: 24,
  },

  // Permission
  permissionBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  permissionText: {
    fontSize: 14,
    color: colors.GRAY500,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  permissionBtn: {
    backgroundColor: colors.GREEN,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  permissionBtnText: {
    color: colors.WHITE,
    fontWeight: "700",
    fontSize: 14,
  },

  // Manual entry
  manualContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
    alignItems: "center",
  },
  manualLabel: {
    fontSize: 14,
    color: colors.GRAY500,
    marginBottom: 20,
    textAlign: "center",
  },
  codeInput: {
    width: "100%",
    textAlign: "center",
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 8,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: colors.GRAY200,
    borderRadius: 14,
    color: colors.GRAY800,
  },
  submitBtn: {
    width: "100%",
    marginTop: 20,
    backgroundColor: colors.GREEN,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  submitBtnDisabled: {
    backgroundColor: colors.GRAY200,
  },
  submitBtnText: {
    color: colors.WHITE,
    fontSize: 15,
    fontWeight: "700",
  },

  // Organizer QR display
  qrDisplayContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  qrBox: {
    padding: 20,
    backgroundColor: colors.WHITE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  attendanceCode: {
    marginTop: 24,
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 6,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: colors.GRAY800,
  },
  qrHint: {
    marginTop: 8,
    fontSize: 13,
    color: colors.GRAY500,
    textAlign: "center",
  },
  regenerateBtn: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.GREEN,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  regenerateBtnText: {
    color: colors.WHITE,
    fontSize: 14,
    fontWeight: "700",
  },
});
