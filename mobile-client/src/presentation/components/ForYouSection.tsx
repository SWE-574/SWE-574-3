import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { listServices } from "../../api/services";
import type { Service } from "../../api/types";
import { colors } from "../../constants/colors";
import FeaturedServiceCard from "./FeaturedServiceCard";

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
        <Ionicons name="heart-outline" size={16} color={colors.GRAY700} />
        <Text style={styles.heading}>For you</Text>
      </View>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.GRAY500} />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {services.map((service) => (
            <FeaturedServiceCard
              key={service.id}
              service={service}
              onPress={() => onServicePress(String(service.id))}
            />
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
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
});
