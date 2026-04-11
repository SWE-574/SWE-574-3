import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type View as RNView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ForumCategory } from "../../api/forum";
import { createTopic, listCategories } from "../../api/forum";
import { colors } from "../../constants/colors";
import type { ForumStackParamList } from "../../navigation/ForumStack";

type NavProp = NativeStackNavigationProp<ForumStackParamList, "CreateTopic">;
type CreateTopicRouteProp = RouteProp<ForumStackParamList, "CreateTopic">;

interface FieldErrors {
  title?: string;
  category?: string;
  body?: string;
}

function getCategoryTone(color?: string | null) {
  switch (color) {
    case "blue":
      return { bg: colors.BLUE, light: colors.BLUE_LT };
    case "purple":
      return { bg: colors.PURPLE, light: colors.PURPLE_LT };
    case "amber":
    case "orange":
      return { bg: colors.AMBER, light: colors.AMBER_LT };
    case "red":
      return { bg: colors.RED, light: colors.RED_LT };
    case "green":
    default:
      return { bg: colors.GREEN, light: colors.GREEN_LT };
  }
}

function getCategoryIconName(icon: string) {
  switch (icon) {
    case "book-open":
      return "book-outline" as const;
    case "calendar":
      return "calendar-outline" as const;
    case "users":
      return "people-outline" as const;
    case "star":
      return "star-outline" as const;
    case "lightbulb":
      return "bulb-outline" as const;
    case "globe":
      return "globe-outline" as const;
    case "code":
      return "code-slash-outline" as const;
    case "heart":
      return "heart-outline" as const;
    case "home":
      return "home-outline" as const;
    case "tool":
      return "construct-outline" as const;
    case "award":
      return "trophy-outline" as const;
    case "message-square":
    default:
      return "chatbubble-ellipses-outline" as const;
  }
}

export default function CreateTopicScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<CreateTopicRouteProp>();
  const preselectedCategoryId = route.params?.categoryId ?? "";

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string>(preselectedCategoryId);
  const [body, setBody] = useState("");
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownLayout, setDropdownLayout] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const dropdownRef = useRef<RNView>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    listCategories()
      .then(setCategories)
      .catch(() => {/* non-critical */});
  }, []);

  const selectedCategory = categories.find((c) => c.id === categoryId) ?? null;
  const selectedTone = getCategoryTone(selectedCategory?.color);

  const validate = useCallback((): FieldErrors => {
    const e: FieldErrors = {};
    if (!title.trim()) {
      e.title = "Title is required.";
    } else if (title.trim().length > 200) {
      e.title = "Title must be 200 characters or fewer.";
    }
    if (!categoryId) {
      e.category = "Please select a category.";
    }
    if (!body.trim()) {
      e.body = "Body is required.";
    } else if (body.trim().length < 10) {
      e.body = "Body must be at least 10 characters.";
    }
    return e;
  }, [title, categoryId, body]);

  const handleSubmit = useCallback(async () => {
    const fieldErrors = validate();
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await createTopic({
        title: title.trim(),
        category: categoryId,
        body: body.trim(),
      });
      navigation.goBack();
    } catch (err: unknown) {
      if (err && typeof err === "object") {
        const apiErr = err as Record<string, unknown>;
        const fieldErrs: FieldErrors = {};
        if (typeof apiErr.title === "string") fieldErrs.title = apiErr.title;
        if (typeof apiErr.category === "string") fieldErrs.category = apiErr.category;
        if (typeof apiErr.body === "string") fieldErrs.body = apiErr.body;
        if (Object.keys(fieldErrs).length > 0) {
          setErrors(fieldErrs);
          return;
        }
      }
      Alert.alert("Error", "Failed to create topic. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [validate, title, categoryId, body, navigation]);

  const handleSelectCategory = useCallback((cat: ForumCategory) => {
    setCategoryId(cat.id);
    setErrors((prev) => ({ ...prev, category: undefined }));
    setDropdownOpen(false);
  }, []);

  return (
    <SafeAreaView edges={["top"]} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.GRAY900} />
        </Pressable>
        <Text style={styles.headerTitle}>New Topic</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.heroCard}>
            <View style={styles.heroAccent} />
            <Text style={styles.heroKicker}>COMMUNITY FORUM</Text>
            <Text style={styles.heroTitle}>Start a new topic</Text>
            <Text style={styles.heroDescription}>
              Ask a question, open a discussion, or share something useful with the community.
            </Text>

            <View style={styles.heroTipsRow}>
              <View style={styles.heroTip}>
                <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.GREEN} />
                <Text style={styles.heroTipText}>Clear title</Text>
              </View>
              <View style={styles.heroTip}>
                <Ionicons name="sparkles-outline" size={14} color={colors.GREEN} />
                <Text style={styles.heroTipText}>Useful context</Text>
              </View>
              <View style={styles.heroTip}>
                <Ionicons name="people-outline" size={14} color={colors.GREEN} />
                <Text style={styles.heroTipText}>Invite replies</Text>
              </View>
            </View>
          </View>

          <View style={styles.formCard}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Title</Text>
              <Text style={styles.counterText}>{title.trim().length}/200</Text>
            </View>
            <Text style={styles.fieldHint}>Keep it short and specific so people know what to open.</Text>
            <TextInput
              style={[styles.input, errors.title ? styles.inputError : null]}
              placeholder="What do you want to discuss?"
              placeholderTextColor={colors.GRAY400}
              value={title}
              onChangeText={(v) => {
                setTitle(v);
                if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
              }}
              maxLength={200}
              returnKeyType="next"
            />
            {errors.title ? <Text style={styles.errorText}>{errors.title}</Text> : null}
          </View>

          <View style={styles.formCard}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Category</Text>
              {selectedCategory ? (
                <View
                  style={[
                    styles.selectedCategoryBadge,
                    { backgroundColor: selectedTone.light },
                  ]}
                >
                  <Text
                    style={[
                      styles.selectedCategoryBadgeText,
                      { color: selectedTone.bg },
                    ]}
                  >
                    Selected
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.fieldHint}>Choose the best fit so the right people find it faster.</Text>
            <Pressable
              ref={dropdownRef}
              style={[
                styles.dropdown,
                selectedCategory && {
                  borderColor: selectedTone.bg,
                  backgroundColor: selectedTone.light,
                },
                errors.category ? styles.inputError : null,
              ]}
              onPress={() => {
                dropdownRef.current?.measureInWindow((x, y, width, height) => {
                  setDropdownLayout({ top: y + height - 1, left: x, width });
                  setDropdownOpen(true);
                });
              }}
            >
              <View style={styles.dropdownContent}>
                <View
                  style={[
                    styles.dropdownIconWrap,
                    {
                      backgroundColor: selectedCategory ? selectedTone.bg : colors.GRAY100,
                    },
                  ]}
                >
                  <Ionicons
                    name={getCategoryIconName(selectedCategory?.icon ?? "message-square")}
                    size={16}
                    color={selectedCategory ? colors.WHITE : colors.GRAY500}
                  />
                </View>
                <View style={styles.dropdownTextWrap}>
                  <Text
                    style={[
                      styles.dropdownText,
                      !selectedCategory && styles.dropdownPlaceholder,
                      selectedCategory && { color: selectedTone.bg },
                    ]}
                    numberOfLines={1}
                  >
                    {selectedCategory ? selectedCategory.name : "Select a category"}
                  </Text>
                  <Text style={styles.dropdownSubtext} numberOfLines={1}>
                    {selectedCategory
                      ? selectedCategory.description || "Category selected"
                      : "Browse forum categories"}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-down" size={16} color={colors.GRAY500} />
            </Pressable>
            {errors.category ? <Text style={styles.errorText}>{errors.category}</Text> : null}
          </View>

          <View style={styles.formCard}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Message</Text>
              <Text style={styles.counterText}>{body.trim().length}/10000</Text>
            </View>
            <Text style={styles.fieldHint}>
              Add enough detail so others can understand and respond meaningfully.
            </Text>
            <TextInput
              style={[styles.input, styles.bodyInput, errors.body ? styles.inputError : null]}
              placeholder="Share your thoughts, question, or story..."
              placeholderTextColor={colors.GRAY400}
              value={body}
              onChangeText={(v) => {
                setBody(v);
                if (errors.body) setErrors((prev) => ({ ...prev, body: undefined }));
              }}
              multiline
              maxLength={10000}
              textAlignVertical="top"
            />
            {errors.body ? <Text style={styles.errorText}>{errors.body}</Text> : null}
          </View>

          <View style={styles.submitPanel}>
            <Pressable
              style={[
                styles.submitButton,
                { backgroundColor: selectedCategory ? selectedTone.bg : colors.GREEN },
                submitting && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.WHITE} />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={18} color={colors.WHITE} />
                  <Text style={styles.submitButtonText}>Post Topic</Text>
                </>
              )}
            </Pressable>
            <Text style={styles.submitHint}>
              Your topic will appear in the forum feed right after posting.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Category dropdown modal */}
      <Modal
        visible={dropdownOpen}
        transparent
        animationType="none"
        onRequestClose={() => setDropdownOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setDropdownOpen(false)}>
          {dropdownLayout && (
            <View
              style={[
                styles.dropdownList,
                {
                  top: dropdownLayout.top,
                  left: dropdownLayout.left,
                  width: dropdownLayout.width,
                },
              ]}
            >
              <FlatList
                data={categories}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const isSelected = item.id === categoryId;
                  return (
                    <Pressable
                      style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                      onPress={() => handleSelectCategory(item)}
                    >
                      <View style={styles.optionLeft}>
                        <View
                          style={[
                            styles.optionIcon,
                            {
                              backgroundColor: isSelected
                                ? getCategoryTone(item.color).bg
                                : colors.GRAY100,
                            },
                          ]}
                        >
                          <Ionicons
                            name={getCategoryIconName(item.icon)}
                            size={15}
                            color={isSelected ? colors.WHITE : colors.GRAY500}
                          />
                        </View>
                        <View style={styles.optionTextWrap}>
                          <Text
                            style={[styles.optionText, isSelected && styles.optionTextSelected]}
                          >
                            {item.name}
                          </Text>
                          <Text style={styles.optionDescription} numberOfLines={1}>
                            {item.description || "Forum category"}
                          </Text>
                        </View>
                      </View>
                      {isSelected && (
                        <Ionicons name="checkmark" size={18} color={colors.GREEN} />
                      )}
                    </Pressable>
                  );
                }}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                ListEmptyComponent={
                  <ActivityIndicator
                    size="small"
                    color={colors.GREEN}
                    style={styles.modalSpinner}
                  />
                }
              />
            </View>
          )}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.GRAY50,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY200,
  },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: colors.GRAY900,
  },
  headerSpacer: {
    width: 30,
  },
  formContent: {
    padding: 16,
    paddingBottom: 48,
  },
  heroCard: {
    backgroundColor: colors.WHITE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    padding: 18,
    marginBottom: 14,
    shadowColor: colors.GRAY900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  heroAccent: {
    height: 4,
    width: "100%",
    borderRadius: 999,
    backgroundColor: colors.GREEN,
    marginBottom: 14,
  },
  heroKicker: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.GREEN,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.GRAY900,
    marginBottom: 8,
  },
  heroDescription: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.GRAY600,
  },
  heroTipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  heroTip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.GREEN_LT,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  heroTipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.GREEN,
  },
  formCard: {
    backgroundColor: colors.WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    padding: 16,
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.GRAY700,
  },
  counterText: {
    fontSize: 12,
    color: colors.GRAY500,
  },
  fieldHint: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.GRAY500,
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.GRAY200,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: colors.GRAY900,
    backgroundColor: colors.GRAY50,
  },
  inputError: {
    borderColor: colors.RED,
  },
  bodyInput: {
    minHeight: 140,
  },
  errorText: {
    fontSize: 13,
    color: colors.RED,
    marginTop: 4,
  },
  selectedCategoryBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  selectedCategoryBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.GRAY200,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.GRAY50,
  },
  dropdownContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
  },
  dropdownIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  dropdownTextWrap: {
    flex: 1,
  },
  dropdownText: {
    fontSize: 15,
    color: colors.GRAY900,
    fontWeight: "600",
  },
  dropdownPlaceholder: {
    color: colors.GRAY400,
  },
  dropdownSubtext: {
    marginTop: 2,
    fontSize: 12,
    color: colors.GRAY500,
  },
  submitPanel: {
    paddingTop: 4,
  },
  submitButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.WHITE,
  },
  submitHint: {
    marginTop: 10,
    fontSize: 12,
    textAlign: "center",
    color: colors.GRAY500,
  },
  // Modal
  modalOverlay: {
    flex: 1,
  },
  dropdownList: {
    position: "absolute",
    backgroundColor: colors.WHITE,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    borderTopWidth: 0,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    maxHeight: 240,
    shadowColor: colors.GRAY900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
    overflow: "hidden",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  optionRowSelected: {
    backgroundColor: colors.GREEN_LT,
  },
  optionLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
  },
  optionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  optionTextWrap: {
    flex: 1,
  },
  optionText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.GRAY900,
  },
  optionTextSelected: {
    fontWeight: "700",
    color: colors.GREEN,
  },
  optionDescription: {
    marginTop: 2,
    fontSize: 12,
    color: colors.GRAY500,
  },
  separator: {
    height: 1,
    backgroundColor: colors.GRAY100,
    marginHorizontal: 16,
  },
  modalSpinner: {
    margin: 20,
  },
});
