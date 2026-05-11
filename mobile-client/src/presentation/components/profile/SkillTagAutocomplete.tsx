import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  searchWikidataTags,
  type WikidataTagSuggestion,
} from "../../../api/tags";
import { colors } from "../../../constants/colors";

const MIN_QUERY = 2;
const DEBOUNCE_MS = 400;
const MAX_SUGGESTIONS = 8;

type Props = {
  selected: WikidataTagSuggestion[];
  onSelect: (tag: WikidataTagSuggestion) => void;
  disabled?: boolean;
};

export default function SkillTagAutocomplete({
  selected,
  onSelect,
  disabled = false,
}: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<WikidataTagSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Map<string, WikidataTagSuggestion[]>>(new Map());

  const runSearch = useCallback(
    async (q: string) => {
      abortRef.current?.abort();
      const trimmed = q.trim();
      if (trimmed.length < MIN_QUERY) {
        setSuggestions([]);
        setLoading(false);
        return;
      }

      const key = trimmed.toLowerCase();
      const selectedIds = new Set(selected.map((t) => t.id));
      const cached = cacheRef.current.get(key);
      if (cached) {
        setSuggestions(
          cached.filter((t) => !selectedIds.has(t.id)).slice(0, MAX_SUGGESTIONS),
        );
        setLoading(false);
        return;
      }

      abortRef.current = new AbortController();
      setLoading(true);
      try {
        const results = await searchWikidataTags(trimmed, abortRef.current.signal);
        cacheRef.current.set(key, results);
        setSuggestions(
          results.filter((t) => !selectedIds.has(t.id)).slice(0, MAX_SUGGESTIONS),
        );
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    },
    [selected],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      void runSearch(query);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const pick = (tag: WikidataTagSuggestion) => {
    onSelect(tag);
    setQuery("");
    setSuggestions([]);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Add a skill or interest</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search (e.g. cooking, design)…"
        placeholderTextColor={colors.GRAY400}
        editable={!disabled}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, disabled && styles.inputDisabled]}
      />
      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.GREEN} />
      ) : null}
      {suggestions.length > 0 ? (
        <View style={styles.suggestionsBox}>
          {/* Plain View + map — avoids VirtualizedList inside parent ScrollView (RN warning). */}
          {suggestions.map((item, index) => (
            <Pressable
              key={item.id}
              onPress={() => pick(item)}
              style={({ pressed }) => [
                styles.suggestionRow,
                index < suggestions.length - 1 && styles.suggestionRowDivider,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Add skill ${item.name}`}
            >
              <Text style={styles.suggestionTitle} numberOfLines={1}>
                {item.name}
              </Text>
              {item.description ? (
                <Text style={styles.suggestionDesc} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text style={styles.hint}>Type at least {MIN_QUERY} letters to search Wikidata.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GRAY700,
    marginBottom: 6,
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
  inputDisabled: {
    opacity: 0.55,
  },
  loader: {
    marginTop: 8,
  },
  suggestionsBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: colors.WHITE,
  },
  suggestionRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  suggestionRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.GRAY100,
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.GRAY800,
  },
  suggestionDesc: {
    fontSize: 11,
    color: colors.GRAY500,
    marginTop: 3,
    lineHeight: 15,
  },
  hint: {
    fontSize: 11,
    color: colors.GRAY400,
    marginTop: 6,
  },
});
