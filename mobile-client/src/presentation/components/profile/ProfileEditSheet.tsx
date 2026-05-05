/**
 * ProfileEditSheet – bottom-sheet style profile editor.
 *
 * Uses React Native Modal with animationType="slide" (native slide-up on both platforms).
 * On iOS, presentationStyle="pageSheet" gives the native sheet appearance.
 * On Android it falls back to a full slide-up overlay.
 *
 * Sections (in order):
 *   1. Identity         – first name, last name, username (read-only), city
 *   2. About you        – bio (280 char limit + counter), profession
 *   3. Avatar           – "Change avatar" button (delegates to existing image picker)
 *   4. Skills & interests – text list editor (TODO: WikidataTagAutocomplete)
 *   5. Showcase badges  – BadgeShowcase picker variant
 *   6. Account & privacy – email link, password link, public visibility toggle (UI only)
 *
 * Footer: sticky [Cancel] + [Save changes] (disabled until dirty).
 * PATCH sends only changed fields (diff).
 * Discard confirm via Alert.alert on close-with-unsaved.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../../constants/colors";
import { patchMe } from "../../../api/users";
import type { UserSummary } from "../../../api/types";
import BadgeShowcase from "./BadgeShowcase";
import type { BadgeProgress } from "./BadgeShowcase";
import type { BadgeDetail } from "../../../api/calendar";
import {
  getMapboxToken,
  searchMapboxLocations,
  type LocationValue,
} from "../../../utils/mapboxLocation";

// ── Types ─────────────────────────────────────────────────────────────────

export interface ProfileEditSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the updated user object after a successful save */
  onSaveSuccess: (updated: UserSummary) => void;
  user: UserSummary & {
    location?: string | null;
    avatar_url?: string | null;
    banner_url?: string | null;
    /** Profession / headline */
    profession?: string | null;
    featured_badges?: string[];
    featured_badges_detail?: BadgeDetail[];
    /** User's skill tags from the API (read-only list). */
    skills?: Array<{ id: string; name: string }>;
  };
  /** Full badge progress list – loaded lazily when the sheet opens */
  badgeProgress?: BadgeProgress[];
  /** Called when the user taps "Change avatar" */
  onAvatarChangePress?: () => void;
  /** Called when the user taps "Change cover photo" */
  onCoverPhotoChangePress?: () => void;
  /** Called when the user taps "Change email" */
  onChangeEmailPress?: () => void;
  /** Called when the user taps "Change password" */
  onChangePasswordPress?: () => void;
  initialTab?: EditTabKey;
  presentation?: "modal" | "screen";
}

type EditableFields = {
  first_name: string;
  last_name: string;
  bio: string;
  location: string;
  profession: string;
  featured_badges: string[];
  banner_url: string;
};

type EditTabKey = "identity" | "photos" | "skills" | "showcase" | "privacy";

const EDIT_TABS: Array<{ key: EditTabKey; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: "identity", label: "Identity", icon: "person-outline" },
  { key: "photos", label: "Photos", icon: "images-outline" },
  { key: "skills", label: "Skills", icon: "sparkles-outline" },
  { key: "showcase", label: "Showcase", icon: "ribbon-outline" },
  { key: "privacy", label: "Privacy", icon: "shield-checkmark-outline" },
];

// ── Diff helper ───────────────────────────────────────────────────────────

function diffFields(
  original: EditableFields,
  current: EditableFields,
): Partial<Record<keyof EditableFields, string | string[]>> {
  const diff: Partial<Record<keyof EditableFields, string | string[]>> = {};

  if (current.first_name !== original.first_name) {
    diff.first_name = current.first_name;
  }
  if (current.last_name !== original.last_name) {
    diff.last_name = current.last_name;
  }
  if (current.bio !== original.bio) {
    diff.bio = current.bio;
  }
  if (current.location !== original.location) {
    diff.location = current.location;
  }
  if (current.profession !== original.profession) {
    diff.profession = current.profession;
  }
  if (
    JSON.stringify(current.featured_badges) !==
    JSON.stringify(original.featured_badges)
  ) {
    diff.featured_badges = current.featured_badges;
  }
  if (current.banner_url !== original.banner_url) {
    diff.banner_url = current.banner_url;
  }

  return diff;
}

function isDirty(original: EditableFields, current: EditableFields): boolean {
  return Object.keys(diffFields(original, current)).length > 0;
}

// ── Section header ────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={sectionStyles.header}>
      <Text style={sectionStyles.title}>{title}</Text>
    </View>
  );
}

// ── Form field ────────────────────────────────────────────────────────────

function FormField({
  label,
  value,
  onChangeText,
  multiline = false,
  maxLength,
  readOnly = false,
  placeholder,
  keyboardType,
  autoCapitalize,
  helperText,
}: {
  label: string;
  value: string;
  onChangeText?: (text: string) => void;
  multiline?: boolean;
  maxLength?: number;
  readOnly?: boolean;
  placeholder?: string;
  keyboardType?: TextInput["props"]["keyboardType"];
  autoCapitalize?: TextInput["props"]["autoCapitalize"];
  helperText?: string;
}) {
  return (
    <View style={fieldStyles.group}>
      <View style={fieldStyles.labelRow}>
        <Text style={fieldStyles.label}>{label}</Text>
        {readOnly && (
          <Text style={fieldStyles.readOnlyTag}>read-only</Text>
        )}
        {maxLength !== undefined && (
          <Text
            style={[
              fieldStyles.counter,
              value.length > maxLength * 0.9 && fieldStyles.counterWarn,
            ]}
          >
            {value.length}/{maxLength}
          </Text>
        )}
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={!readOnly}
        multiline={multiline}
        maxLength={maxLength}
        placeholder={placeholder ?? label}
        placeholderTextColor={colors.GRAY400}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={autoCapitalize ?? "sentences"}
        textAlignVertical={multiline ? "top" : "center"}
        style={[
          fieldStyles.input,
          multiline && fieldStyles.multilineInput,
          readOnly && fieldStyles.readOnlyInput,
        ]}
      />
      {helperText ? (
        <Text style={fieldStyles.helperText}>{helperText}</Text>
      ) : null}
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function ProfileEditSheet({
  visible,
  onClose,
  onSaveSuccess,
  user,
  badgeProgress = [],
  onAvatarChangePress,
  onCoverPhotoChangePress,
  onChangeEmailPress,
  onChangePasswordPress,
  initialTab = "identity",
  presentation = "modal",
}: ProfileEditSheetProps) {
  const insets = useSafeAreaInsets();

  const buildInitial = (): EditableFields => ({
    first_name: user.first_name ?? "",
    last_name: user.last_name ?? "",
    bio: user.bio ?? "",
    location: user.location ?? "",
    profession: user.profession ?? "",
    featured_badges: user.featured_badges ?? [],
    banner_url: user.banner_url ?? "",
  });

  // Skills: local removal only (read-only list from API).
  // Decision: no PATCH endpoint exists for skills in mobile-client (only web has
  // WikidataTagAutocomplete). We render existing chips with X-to-remove for UX,
  // but removal is UI-only until a backend skill endpoint is exposed to mobile.
  // TODO: wire removals to a PATCH /users/me/ with selected_tags when supported.
  const [localSkills, setLocalSkills] = useState<Array<{ id: string; name: string }>>(
    user.skills ?? [],
  );

  const [form, setForm] = useState<EditableFields>(buildInitial);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EditTabKey>(initialTab);
  const [locationSuggestions, setLocationSuggestions] = useState<LocationValue[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);
  // UI-only public visibility toggle (no backend support yet)
  const [isPublic, setIsPublic] = useState(true);

  const originalRef = useRef<EditableFields>(buildInitial());

  // Reset form when sheet opens
  useEffect(() => {
    if (visible) {
      const initial = buildInitial();
      setForm(initial);
      originalRef.current = initial;
      setSaveError(null);
      setLocalSkills(user.skills ?? []);
      setActiveTab(initialTab);
      setLocationSuggestions([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab, visible]);

  useEffect(() => {
    let active = true;
    const query = form.location.trim();

    if (!visible || activeTab !== "identity" || !getMapboxToken() || query.length < 2) {
      setLocationSuggestions([]);
      setLocationLoading(false);
      return;
    }

    setLocationLoading(true);
    const timer = setTimeout(() => {
      searchMapboxLocations(query, "full")
        .then((results) => {
          if (active) setLocationSuggestions(results.slice(0, 5));
        })
        .catch(() => {
          if (active) setLocationSuggestions([]);
        })
        .finally(() => {
          if (active) setLocationLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [activeTab, form.location, visible]);

  const dirty = useMemo(
    () => isDirty(originalRef.current, form),
    [form],
  );

  const handleClose = () => {
    if (dirty) {
      Alert.alert(
        "Discard changes?",
        "You have unsaved changes. Discard them and close?",
        [
          { text: "Keep editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: onClose,
          },
        ],
      );
      return;
    }
    onClose();
  };

  const handleSave = async () => {
    if (!dirty) return;

    const diff = diffFields(originalRef.current, form);
    setSaving(true);
    setSaveError(null);

    try {
      const updated = await patchMe(
        diff as Parameters<typeof patchMe>[0],
      );
      onSaveSuccess(updated);
      onClose();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Could not save your profile.",
      );
    } finally {
      setSaving(false);
    }
  };

  const setField = (key: keyof EditableFields) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const content = (
      <KeyboardAvoidingView
        style={[
          styles.keyboardLayer,
          presentation === "screen" && styles.screenKeyboardLayer,
        ]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
      <View
        style={[
          styles.sheetContainer,
          presentation === "screen" && styles.sheetContainerScreen,
          { paddingBottom: insets.bottom + 8 },
        ]}
      >
        {/* Sheet header */}
        <View style={styles.sheetHeader}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.sheetEyebrow}>Profile settings</Text>
              <Text style={styles.sheetTitle}>Edit profile</Text>
            </View>
            <Pressable
              onPress={handleClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={colors.GRAY700} />
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabRow}
          >
            {EDIT_TABS.map((tab) => {
              const selected = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={({ pressed }) => [
                    styles.tabButton,
                    selected && styles.tabButtonActive,
                    pressed && { opacity: 0.82 },
                  ]}
                >
                  <Ionicons
                    name={tab.icon}
                    size={14}
                    color={selected ? colors.GREEN : colors.GRAY500}
                  />
                  <Text
                    style={[
                      styles.tabButtonText,
                      selected && styles.tabButtonTextActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Scrollable content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {activeTab === "identity" ? (
            <>
              <SectionHeader title="Identity" />
              <FormField
                label="First name"
                value={form.first_name}
                onChangeText={setField("first_name")}
              />
              <FormField
                label="Last name"
                value={form.last_name}
                onChangeText={setField("last_name")}
              />
              <FormField
                label="Username"
                value={user.email?.split("@")[0] ?? ""}
                readOnly
                helperText="Username cannot be changed."
              />
              <View style={fieldStyles.group}>
                <Text style={fieldStyles.label}>City / Location</Text>
                <View style={styles.locationInputWrap}>
                  <Ionicons name="location-outline" size={17} color={colors.GRAY500} />
                  <TextInput
                    value={form.location}
                    onChangeText={setField("location")}
                    placeholder="Search a city, district, or address"
                    placeholderTextColor={colors.GRAY400}
                    style={styles.locationInput}
                    autoCapitalize="words"
                  />
                  {locationLoading ? (
                    <ActivityIndicator size="small" color={colors.GREEN} />
                  ) : null}
                </View>
                {locationSuggestions.length > 0 ? (
                  <View style={styles.locationSuggestions}>
                    {locationSuggestions.map((item) => (
                      <Pressable
                        key={`${item.lat}-${item.lng}-${item.fullAddress ?? item.label}`}
                        onPress={() => {
                          setForm((prev) => ({
                            ...prev,
                            location: item.fullAddress ?? item.label,
                          }));
                          setLocationSuggestions([]);
                        }}
                        style={({ pressed }) => [
                          styles.locationSuggestionRow,
                          pressed && { backgroundColor: colors.GREEN_LT },
                        ]}
                      >
                        <Ionicons name="pin-outline" size={15} color={colors.GREEN} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.locationSuggestionTitle} numberOfLines={1}>
                            {item.district ?? item.label}
                          </Text>
                          <Text style={styles.locationSuggestionText} numberOfLines={1}>
                            {item.fullAddress ?? item.label}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>

              <SectionHeader title="About you" />
              <FormField
                label="Bio"
                value={form.bio}
                onChangeText={setField("bio")}
                multiline
                maxLength={280}
                placeholder="Tell the community a bit about yourself..."
              />
              <FormField
                label="Profession"
                value={form.profession}
                onChangeText={setField("profession")}
                placeholder="e.g. Graphic designer"
              />
            </>
          ) : null}

          {activeTab === "photos" ? (
            <>
              <SectionHeader title="Avatar & cover photo" />
              <View style={styles.photoGrid}>
                <TouchableOpacity
                  onPress={onAvatarChangePress}
                  style={styles.photoActionCard}
                  accessibilityRole="button"
                  accessibilityLabel="Change avatar"
                >
                  <Ionicons name="camera-outline" size={20} color={colors.GREEN} />
                  <Text style={styles.photoActionTitle}>Profile photo</Text>
                  <Text style={styles.photoActionText}>Update your avatar.</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onCoverPhotoChangePress}
                  style={styles.photoActionCard}
                  accessibilityRole="button"
                  accessibilityLabel="Change cover photo"
                >
                  <Ionicons name="image-outline" size={20} color={colors.GREEN} />
                  <Text style={styles.photoActionTitle}>Cover photo</Text>
                  <Text style={styles.photoActionText}>Refresh the hero banner.</Text>
                </TouchableOpacity>
              </View>
              {form.banner_url ? (
                <View style={styles.coverPreviewWrapper}>
                  <Image
                    source={{ uri: form.banner_url }}
                    style={styles.coverPreview}
                    accessibilityLabel="Current cover photo"
                    accessibilityIgnoresInvertColors
                  />
                </View>
              ) : null}
            </>
          ) : null}

          {activeTab === "skills" ? (
            <>
              <SectionHeader title="Skills & interests" />
              {localSkills.length > 0 ? (
                <View style={styles.skillsWrap}>
                  {localSkills.map((skill) => (
                    <View key={skill.id} style={styles.skillChip}>
                      <Text style={styles.skillChipText}>{skill.name}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.todoSection}>
                  <Ionicons name="sparkles-outline" size={16} color={colors.GRAY500} />
                  <Text style={styles.todoText}>No skills yet.</Text>
                </View>
              )}
              <View style={styles.todoSection}>
                <Ionicons name="information-circle-outline" size={16} color={colors.GRAY500} />
                <Text style={styles.todoText}>
                  Skill editing is read-only on mobile for now. Use the web profile to add or remove skills.
                </Text>
              </View>
            </>
          ) : null}

          {activeTab === "showcase" ? (
            <>
              <SectionHeader title="Showcase badges" />
              <BadgeShowcase
                variant="picker"
                mode="own"
                badgeProgress={badgeProgress}
                selectedIds={form.featured_badges}
                onSelectionChange={(ids) =>
                  setForm((prev) => ({ ...prev, featured_badges: ids }))
                }
              />
            </>
          ) : null}

          {activeTab === "privacy" ? (
            <>
              <SectionHeader title="Account & privacy" />
              <Pressable
                onPress={onChangeEmailPress}
                style={({ pressed }) => [
                  styles.linkRow,
                  pressed && { opacity: 0.75 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Change email"
              >
                <Ionicons name="mail-outline" size={18} color={colors.GRAY600} />
                <Text style={styles.linkRowText}>Change email</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.GRAY400} />
              </Pressable>
              <Pressable
                onPress={onChangePasswordPress}
                style={({ pressed }) => [
                  styles.linkRow,
                  pressed && { opacity: 0.75 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Change password"
              >
                <Ionicons name="lock-closed-outline" size={18} color={colors.GRAY600} />
                <Text style={styles.linkRowText}>Change password</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.GRAY400} />
              </Pressable>
              <View style={styles.toggleRow}>
                <Ionicons name="eye-outline" size={18} color={colors.GRAY600} />
                <Text style={styles.toggleRowText}>Public profile</Text>
                <Switch
                  value={isPublic}
                  onValueChange={setIsPublic}
                  trackColor={{ false: colors.GRAY200, true: colors.GREEN_MD }}
                  thumbColor={isPublic ? colors.GREEN : colors.GRAY400}
                  accessibilityLabel="Toggle public profile visibility"
                />
              </View>
              <Text style={styles.disabledHelp}>
                Public visibility is shown here for parity with web settings and will be saved when the backend setting is exposed to mobile.
              </Text>
            </>
          ) : null}

          {/* Error display */}
          {saveError ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.RED} />
              <Text style={styles.errorText}>{saveError}</Text>
            </View>
          ) : null}

          <View style={{ height: 24 }} />
        </ScrollView>

        {/* Sticky footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.cancelButton}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => void handleSave()}
            style={[
              styles.saveButton,
              (!dirty || saving) && styles.saveButtonDisabled,
            ]}
            disabled={!dirty || saving}
            accessibilityRole="button"
            accessibilityLabel={saving ? "Saving…" : "Save changes"}
          >
            <Text style={styles.saveButtonText}>
              {saving ? "Saving…" : "Save changes"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      </KeyboardAvoidingView>
  );

  if (presentation === "screen") {
    return <View style={styles.screenRoot}>{content}</View>;
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={handleClose}
    >
      <View style={styles.modalBackdrop}>
        {content}
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const sectionStyles = StyleSheet.create({
  header: {
    paddingVertical: 10,
    marginTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY100,
    marginBottom: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.GREEN,
    textTransform: "uppercase",
  },
});

const fieldStyles = StyleSheet.create({
  group: {
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 5,
    gap: 6,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: colors.GRAY700,
  },
  readOnlyTag: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.GRAY400,
    backgroundColor: colors.GRAY100,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  counter: {
    fontSize: 11,
    color: colors.GRAY400,
    fontWeight: "600",
  },
  counterWarn: {
    color: colors.AMBER,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.GRAY200,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.GRAY800,
    backgroundColor: colors.WHITE,
  },
  multilineInput: {
    minHeight: 80,
    paddingTop: 10,
  },
  readOnlyInput: {
    backgroundColor: colors.GRAY50,
    color: colors.GRAY500,
  },
  helperText: {
    fontSize: 11,
    color: colors.GRAY400,
    marginTop: 4,
    fontStyle: "italic",
  },
});

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.42)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  keyboardLayer: {
    width: "100%",
    maxWidth: 540,
  },
  screenRoot: {
    flex: 1,
    backgroundColor: colors.GRAY50,
  },
  screenKeyboardLayer: {
    flex: 1,
    maxWidth: undefined,
  },
  sheetContainer: {
    backgroundColor: colors.WHITE,
    borderRadius: 24,
    overflow: "hidden",
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.68)",
    shadowColor: colors.GRAY900,
    shadowOpacity: 0.26,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 18,
  },
  sheetContainerScreen: {
    flex: 1,
    maxHeight: undefined,
    borderRadius: 0,
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  sheetHeader: {
    paddingTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY100,
    backgroundColor: colors.WHITE,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.GRAY300,
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 20,
    paddingBottom: 12,
    justifyContent: "space-between",
  },
  sheetEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.GREEN,
    marginBottom: 2,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.GRAY800,
  },
  closeButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  tabRow: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    backgroundColor: colors.GRAY50,
  },
  tabButtonActive: {
    backgroundColor: colors.GREEN_LT,
    borderColor: "rgba(45, 92, 78, 0.28)",
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.GRAY500,
  },
  tabButtonTextActive: {
    color: colors.GREEN,
  },
  locationInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.WHITE,
  },
  locationInput: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.GRAY800,
  },
  locationSuggestions: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: colors.WHITE,
  },
  locationSuggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY100,
  },
  locationSuggestionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.GRAY800,
  },
  locationSuggestionText: {
    fontSize: 12,
    color: colors.GRAY500,
    marginTop: 1,
  },
  photoGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  photoActionCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    borderRadius: 16,
    backgroundColor: colors.GRAY50,
    padding: 12,
    minHeight: 104,
    justifyContent: "space-between",
  },
  photoActionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.GRAY800,
    marginTop: 10,
  },
  photoActionText: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.GRAY500,
    marginTop: 2,
  },
  avatarButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.GREEN,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: "flex-start",
    marginBottom: 16,
  },
  avatarButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.GREEN,
  },
  coverPreviewWrapper: {
    marginBottom: 10,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.GRAY200,
  },
  coverPreview: {
    width: "100%",
    height: 80,
    resizeMode: "cover",
  },
  coverButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.GREEN,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: "flex-start",
    marginBottom: 16,
  },
  coverButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.GREEN,
  },
  todoSection: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.GRAY100,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  todoText: {
    flex: 1,
    fontSize: 13,
    color: colors.GRAY600,
    lineHeight: 18,
  },
  disabledHelp: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.GRAY500,
    marginTop: 8,
  },
  skillsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  skillChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.GREEN_LT,
    borderWidth: 1,
    borderColor: "rgba(45, 92, 78, 0.2)",
  },
  skillChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GREEN,
  },
  skillChipRemove: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY100,
  },
  linkRowText: {
    flex: 1,
    fontSize: 14,
    color: colors.GRAY700,
    fontWeight: "500",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    marginBottom: 4,
  },
  toggleRowText: {
    flex: 1,
    fontSize: 14,
    color: colors.GRAY700,
    fontWeight: "500",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.RED_LT,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: colors.RED,
    fontWeight: "600",
  },
  // Footer
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.GRAY100,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.GRAY600,
  },
  saveButton: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: colors.GREEN,
    alignItems: "center",
  },
  saveButtonDisabled: {
    backgroundColor: colors.GRAY200,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.WHITE,
  },
});
