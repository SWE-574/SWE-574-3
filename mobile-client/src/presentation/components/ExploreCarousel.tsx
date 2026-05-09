import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { listServices } from "../../api/services";
import type { Service } from "../../api/types";
import { colors } from "../../constants/colors";
import FeaturedServiceCard from "./FeaturedServiceCard";

interface ExploreCarouselProps {
  onServicePress: (id: string) => void;
}

export default function ExploreCarousel({ onServicePress }: ExploreCarouselProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listServices({ explore_only: true, page_size: 10 })
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
  }, []);

  if (!loading && services.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.heading}>Try something new</Text>
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
