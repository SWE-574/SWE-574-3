import React, { useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../../constants/colors";
import {
  submitCombinedEvaluation,
  submitCombinedEventEvaluation,
} from "../../../api/reputation";

type TraitOption = {
  key: string;
  label: string;
  tone: "positive" | "negative";
  icon: keyof typeof Ionicons.glyphMap;
};

const SERVICE_TRAITS: TraitOption[] = [
  { key: "punctual", label: "Punctual", tone: "positive", icon: "time-outline" },
  { key: "helpful", label: "Helpful", tone: "positive", icon: "people-outline" },
  { key: "kindness", label: "Kind", tone: "positive", icon: "star-outline" },
  { key: "is_late", label: "Late", tone: "negative", icon: "alert-circle-outline" },
  { key: "is_unhelpful", label: "Unhelpful", tone: "negative", icon: "flag-outline" },
  { key: "is_rude", label: "Rude", tone: "negative", icon: "close-circle-outline" },
];

const EVENT_TRAITS: TraitOption[] = [
  { key: "well_organized", label: "Well Organized", tone: "positive", icon: "star-outline" },
  { key: "engaging", label: "Engaging", tone: "positive", icon: "people-outline" },
  { key: "welcoming", label: "Welcoming", tone: "positive", icon: "heart-outline" },
  { key: "disorganized", label: "Disorganized", tone: "negative", icon: "alert-circle-outline" },
  { key: "boring", label: "Boring", tone: "negative", icon: "flag-outline" },
  { key: "unwelcoming", label: "Unwelcoming", tone: "negative", icon: "close-circle-outline" },
];

type Props = {
  visible: boolean;
  handshakeId: string;
  counterpartName: string;
  isEventEvaluation?: boolean;
  alreadyReviewed?: boolean;
  onClose: () => void;
  onSubmitted?: () => Promise<void> | void;
};

export function ChatEvaluationModal({
  visible,
  handshakeId,
  counterpartName,
  isEventEvaluation = false,
  alreadyReviewed = false,
  onClose,
  onSubmitted,
}: Props) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const traitSet = isEventEvaluation ? EVENT_TRAITS : SERVICE_TRAITS;
  const positiveTraits = useMemo(
    () => traitSet.filter((t) => t.tone === "positive"),
    [traitSet],
  );
  const negativeTraits = useMemo(
    () => traitSet.filter((t) => t.tone === "negative"),
    [traitSet],
  );

  const reset = () => {
    setSelected({});
    setComment("");
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const toggle = (key: string) => {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async () => {
    if (submitting || alreadyReviewed) return;
    if (!Object.values(selected).some(Boolean)) {
      Alert.alert("Evaluation", "Please select at least one trait.");
      return;
    }

    setSubmitting(true);
    try {
      if (isEventEvaluation) {
        await submitCombinedEventEvaluation({
          handshake_id: handshakeId,
          positive: {
            well_organized: Boolean(selected.well_organized),
            engaging: Boolean(selected.engaging),
            welcoming: Boolean(selected.welcoming),
          },
          negative: {
            disorganized: Boolean(selected.disorganized),
            boring: Boolean(selected.boring),
            unwelcoming: Boolean(selected.unwelcoming),
          },
          comment,
        });
      } else {
        await submitCombinedEvaluation({
          handshake_id: handshakeId,
          positive: {
            punctual: Boolean(selected.punctual),
            helpful: Boolean(selected.helpful),
            kindness: Boolean(selected.kindness),
          },
          negative: {
            is_late: Boolean(selected.is_late),
            is_unhelpful: Boolean(selected.is_unhelpful),
            is_rude: Boolean(selected.is_rude),
          },
          comment,
        });
      }

      Alert.alert("Evaluation submitted", "Thank you for your feedback.");
      await onSubmitted?.();
      reset();
      onClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to submit evaluation.";
      Alert.alert("Evaluation failed", message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>
                {isEventEvaluation ? "Evaluate Organizer" : "Leave Evaluation"}
              </Text>
              <Text style={styles.subtitle}>Share feedback for {counterpartName}.</Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={handleClose}>
              <Ionicons name="close" size={18} color={colors.GRAY600} />
            </Pressable>
          </View>

          {alreadyReviewed ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoText}>You already reviewed this exchange.</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.sectionTitle}>Nice Traits</Text>
              <View style={styles.traitsWrap}>
                {positiveTraits.map((trait) => {
                  const active = Boolean(selected[trait.key]);
                  return (
                    <Pressable
                      key={trait.key}
                      style={[
                        styles.traitChip,
                        active && styles.traitChipPositiveActive,
                      ]}
                      onPress={() => toggle(trait.key)}
                    >
                      <Ionicons
                        name={trait.icon}
                        size={14}
                        color={active ? colors.GREEN : colors.GRAY500}
                      />
                      <Text
                        style={[
                          styles.traitChipText,
                          active && styles.traitChipTextPositiveActive,
                        ]}
                      >
                        {trait.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.sectionTitle, styles.sectionTitleDanger]}>
                Needs Improvement
              </Text>
              <View style={styles.traitsWrap}>
                {negativeTraits.map((trait) => {
                  const active = Boolean(selected[trait.key]);
                  return (
                    <Pressable
                      key={trait.key}
                      style={[
                        styles.traitChip,
                        active && styles.traitChipNegativeActive,
                      ]}
                      onPress={() => toggle(trait.key)}
                    >
                      <Ionicons
                        name={trait.icon}
                        size={14}
                        color={active ? colors.RED : colors.GRAY500}
                      />
                      <Text
                        style={[
                          styles.traitChipText,
                          active && styles.traitChipTextNegativeActive,
                        ]}
                      >
                        {trait.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                style={styles.commentInput}
                value={comment}
                onChangeText={setComment}
                placeholder="Comment (optional)"
                placeholderTextColor={colors.GRAY400}
                multiline
                textAlignVertical="top"
                maxLength={400}
              />
            </ScrollView>
          )}

          <View style={styles.footer}>
            <Pressable style={styles.secondaryBtn} onPress={handleClose} disabled={submitting}>
              <Text style={styles.secondaryBtnText}>Close</Text>
            </Pressable>
            {!alreadyReviewed ? (
              <Pressable
                style={styles.primaryBtn}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={colors.WHITE} />
                ) : (
                  <Text style={styles.primaryBtnText}>Submit</Text>
                )}
              </Pressable>
            ) : null}
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
    maxHeight: "86%",
    backgroundColor: colors.WHITE,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontSize: 19,
    fontWeight: "800",
    color: colors.GRAY900,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: colors.GRAY500,
    lineHeight: 19,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.GRAY100,
  },
  infoCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.GREEN_LT,
    borderWidth: 1,
    borderColor: colors.GREEN_MD,
  },
  infoText: {
    fontSize: 14,
    color: colors.GREEN,
    fontWeight: "700",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.GREEN,
    marginBottom: 8,
  },
  sectionTitleDanger: {
    color: colors.RED,
    marginTop: 14,
  },
  traitsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  traitChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    backgroundColor: colors.WHITE,
  },
  traitChipPositiveActive: {
    borderColor: colors.GREEN,
    backgroundColor: colors.GREEN_LT,
  },
  traitChipNegativeActive: {
    borderColor: colors.RED,
    backgroundColor: colors.RED_LT,
  },
  traitChipText: {
    fontSize: 13,
    color: colors.GRAY700,
    fontWeight: "600",
  },
  traitChipTextPositiveActive: {
    color: colors.GREEN,
  },
  traitChipTextNegativeActive: {
    color: colors.RED,
  },
  commentInput: {
    minHeight: 96,
    marginTop: 16,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    backgroundColor: colors.GRAY50,
    fontSize: 14,
    color: colors.GRAY900,
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 16,
  },
  secondaryBtn: {
    paddingHorizontal: 16,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.GRAY100,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.GRAY700,
  },
  primaryBtn: {
    paddingHorizontal: 18,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.WHITE,
  },
});
