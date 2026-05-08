import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { listServices } from "../../api/services";
import type { Service } from "../../api/types";
import { colors } from "../../constants/colors";

interface ForYouSectionProps {
  onServicePress: (id: string) => void;
  /** Whether the current viewer is onboarded with skills; section hides otherwise. */
  enabled: boolean;
}

export default function ForYouSection({
  onServicePress,
  enabled,
}: ForYouSectionProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    listServices({ sort: "for_you" })
      .then((response) => {
        if (cancelled) return;
        setServices(response.results ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setServices([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled) return null;
  if (!loading && services.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Ionicons name="heart-outline" size={16} color={colors.PURPLE} />
        <Text style={styles.heading}>For you</Text>
      </View>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.PURPLE} />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {services.map((service) => (
            <Pressable
              key={service.id}
              onPress={() => onServicePress(String(service.id))}
              style={styles.card}
            >
              <Text style={styles.cardType}>{service.type}</Text>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {service.title}
              </Text>
              <Text style={styles.cardOwner} numberOfLines={1}>
                {service.user.first_name} {service.user.last_name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingTop: 12,
    paddingBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  heading: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.GRAY900,
    marginLeft: 6,
  },
  loadingRow: {
    paddingVertical: 16,
    alignItems: "center",
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  card: {
    width: 200,
    marginHorizontal: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.PURPLE_LT,
    borderWidth: 1,
    borderColor: colors.GRAY200,
  },
  cardType: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.PURPLE,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.GRAY900,
    marginBottom: 4,
  },
  cardOwner: {
    fontSize: 12,
    color: colors.GRAY500,
  },
});
