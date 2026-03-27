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
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ForumCategory } from "../../api/forum";
import { createTopic, listCategories } from "../../api/forum";
import { colors } from "../../constants/colors";
import type { ForumStackParamList } from "../../navigation/ForumStack";

type NavProp = NativeStackNavigationProp<ForumStackParamList, "CreateTopic">;

interface FieldErrors {
  title?: string;
  category?: string;
  body?: string;
}

export default function CreateTopicScreen() {
  const navigation = useNavigation<NavProp>();

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
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
          {/* Title */}
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={[styles.input, errors.title ? styles.inputError : null]}
            placeholder="What's this topic about?"
            placeholderTextColor={colors.GRAY400}
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
            }}
            maxLength={200}
            returnKeyType="next"
          />
          {errors.title ? (
            <Text style={styles.errorText}>{errors.title}</Text>
          ) : null}

          {/* Category dropdown */}
          <Text style={[styles.label, styles.labelSpaced]}>Category</Text>
          <Pressable
            ref={dropdownRef}
            style={[styles.dropdown, errors.category ? styles.inputError : null]}
            onPress={() => {
              dropdownRef.current?.measureInWindow((x, y, width, height) => {
                setDropdownLayout({ top: y + height - 1, left: x, width });
                setDropdownOpen(true);
              });
            }}
          >
            <Text
              style={[
                styles.dropdownText,
                !selectedCategory && styles.dropdownPlaceholder,
              ]}
              numberOfLines={1}
            >
              {selectedCategory ? selectedCategory.name : "Select a category…"}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.GRAY500} />
          </Pressable>
          {errors.category ? (
            <Text style={styles.errorText}>{errors.category}</Text>
          ) : null}

          {/* Body */}
          <Text style={[styles.label, styles.labelSpaced]}>Body</Text>
          <TextInput
            style={[styles.input, styles.bodyInput, errors.body ? styles.inputError : null]}
            placeholder="Share your thoughts..."
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
          {errors.body ? (
            <Text style={styles.errorText}>{errors.body}</Text>
          ) : null}

          {/* Submit */}
          <Pressable
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={colors.WHITE} />
            ) : (
              <Text style={styles.submitButtonText}>Post Topic</Text>
            )}
          </Pressable>
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
                      <Text
                        style={[styles.optionText, isSelected && styles.optionTextSelected]}
                      >
                        {item.name}
                      </Text>
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
    backgroundColor: colors.WHITE,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    padding: 20,
    paddingBottom: 48,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.GRAY700,
    marginBottom: 6,
  },
  labelSpaced: {
    marginTop: 20,
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
  dropdownText: {
    flex: 1,
    fontSize: 15,
    color: colors.GRAY900,
    marginRight: 8,
  },
  dropdownPlaceholder: {
    color: colors.GRAY400,
  },
  submitButton: {
    marginTop: 32,
    backgroundColor: colors.GREEN,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.WHITE,
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
    paddingHorizontal: 20,
  },
  optionRowSelected: {
    backgroundColor: colors.GREEN_LT,
  },
  optionText: {
    fontSize: 15,
    color: colors.GRAY900,
  },
  optionTextSelected: {
    fontWeight: "600",
    color: colors.GREEN,
  },
  separator: {
    height: 1,
    backgroundColor: colors.GRAY100,
    marginHorizontal: 20,
  },
  modalSpinner: {
    margin: 20,
  },
});
