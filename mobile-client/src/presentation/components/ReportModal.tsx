import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../constants/colors";

export type ReportType =
  | "inappropriate_content"
  | "spam"
  | "harassment"
  | "scam"
  | "other"
  | "service_issue"
  | "no_show";

export interface ReportOption {
  value: ReportType;
  label: string;
}

export interface ReportModalRequest {
  type: ReportType;
  description?: string;
}

const DEFAULT_REPORT_OPTIONS: ReportOption[] = [
  { value: "inappropriate_content", label: "Inappropriate Content" },
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "scam", label: "Scam or Fraud" },
  { value: "other", label: "Other" },
];

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (req: ReportModalRequest) => Promise<void>;
  targetLabel?: string;
  title?: string;
  subtitle?: string;
  options?: ReportOption[];
}

export default function ReportModal({
  visible,
  onClose,
  onSubmit,
  targetLabel = "content",
  title,
  subtitle = "Select a reason to help our moderators review this report.",
  options = DEFAULT_REPORT_OPTIONS,
}: ReportModalProps) {
  const initialType = options[0]?.value ?? "other";
  const [selectedType, setSelectedType] = useState<ReportType>(initialType);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    if (submitting) return;
    setSelectedType(initialType);
    setDescription("");
    onClose();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit({ type: selectedType, description: description.trim() || undefined });
      setSelectedType(initialType);
      setDescription("");
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <View style={styles.flagIconWrap}>
              <Ionicons name="flag" size={18} color={colors.RED} />
            </View>
            <Text style={styles.title}>{title ?? `Report ${targetLabel}`}</Text>
            <Pressable onPress={handleClose} hitSlop={8} disabled={submitting}>
              <Ionicons name="close" size={22} color={colors.GRAY500} />
            </Pressable>
          </View>

          <Text style={styles.subtitle}>
            {subtitle}
          </Text>

          <ScrollView style={styles.optionList} showsVerticalScrollIndicator={false}>
            {options.map((opt) => (
              <Pressable
                key={opt.value}
                style={[
                  styles.optionRow,
                  selectedType === opt.value && styles.optionRowSelected,
                ]}
                onPress={() => setSelectedType(opt.value)}
              >
                <View
                  style={[
                    styles.radio,
                    selectedType === opt.value && styles.radioSelected,
                  ]}
                >
                  {selectedType === opt.value && <View style={styles.radioDot} />}
                </View>
                <Text
                  style={[
                    styles.optionLabel,
                    selectedType === opt.value && styles.optionLabelSelected,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <TextInput
            style={styles.descriptionInput}
            value={description}
            onChangeText={setDescription}
            placeholder="Additional details (optional)"
            placeholderTextColor={colors.GRAY400}
            multiline
            maxLength={500}
            textAlignVertical="top"
            editable={!submitting}
          />

          <View style={styles.actions}>
            <Pressable
              style={[styles.cancelBtn]}
              onPress={handleClose}
              disabled={submitting}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.WHITE} />
              ) : (
                <Text style={styles.submitBtnText}>Submit Report</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
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
    backgroundColor: colors.WHITE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.GRAY200,
    alignSelf: "center",
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  flagIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.RED_LT,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: colors.GRAY900,
  },
  subtitle: {
    fontSize: 13,
    color: colors.GRAY500,
    marginBottom: 14,
    lineHeight: 19,
  },
  optionList: {
    maxHeight: 260,
    marginBottom: 14,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    marginBottom: 8,
    gap: 10,
  },
  optionRowSelected: {
    borderColor: colors.RED,
    backgroundColor: colors.RED_LT,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.GRAY300,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: colors.RED,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.RED,
  },
  optionLabel: {
    fontSize: 14,
    color: colors.GRAY700,
  },
  optionLabelSelected: {
    color: colors.RED,
    fontWeight: "600",
  },
  descriptionInput: {
    borderWidth: 1,
    borderColor: colors.GRAY200,
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    color: colors.GRAY900,
    backgroundColor: colors.GRAY50,
    minHeight: 72,
    marginBottom: 16,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.GRAY100,
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.GRAY700,
  },
  submitBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.RED,
    alignItems: "center",
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.WHITE,
  },
});
