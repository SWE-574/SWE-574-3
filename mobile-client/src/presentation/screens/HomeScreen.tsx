import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Image,
  TextInput,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { HomeStackParamList } from "../../navigation/HomeStack";
import { listServices } from "../../api/services";
import { Service } from "../../api/types";
import ServiceCard from "../components/ServiceCard";
import QuickFilters, { type QuickFilterId } from "../components/QuickFilters";
import { colors } from "../../constants/colors";

export default function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<HomeStackParamList, "HomeFeed">>();
  const [services, setServices] = useState<Service[]>([]);
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilterId>("all");

  useEffect(() => {
    listServices().then(({ results }) => {
      if (results) {
        setServices(results);
      } else {
        setServices([]);
      }
    });
  }, []);

  const filteredServices = useMemo(() => {
    let list = [...services];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          (s.description || "").toLowerCase().includes(q) ||
          s.tags?.some((t) => t.name.toLowerCase().includes(q)),
      );
    }
    switch (quickFilter) {
      case "online":
        list = list.filter(
          (s) =>
            s.location_type === "Online" ||
            (s.location_type && s.location_type.toLowerCase() === "online"),
        );
        break;
      case "recurrent":
        list = list.filter(
          (s) =>
            s.schedule_type === "Recurrent" ||
            (s.schedule_type && s.schedule_type.toLowerCase() === "recurrent"),
        );
        break;
      case "weekend":
        list = list.filter((s) =>
          (s.schedule_details || "").toLowerCase().includes("weekend"),
        );
        break;
      case "new":
        list = [...list].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        break;
      default:
        break;
    }
    return list;
  }, [services, search, quickFilter]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Image source={require("../../assets/icon.png")} style={styles.logo} />
        <Text style={styles.title}>The Hive</Text>
      </View>
      <View style={styles.searchContainer}>
        <TextInput
          placeholder="Search services, skills, tags..."
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <QuickFilters selectedId={quickFilter} onSelect={setQuickFilter} />
      <FlatList
        data={filteredServices}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() =>
              navigation.navigate("ServiceDetail", { id: item.id })
            }
          >
            <ServiceCard service={item} index={index} />
          </Pressable>
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.empty}>No services yet. Check back later.</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.WHITE,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY200,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  listContent: {
    paddingVertical: 16,
    paddingBottom: 32,
  },
  empty: {
    textAlign: "center",
    color: colors.GRAY500,
    paddingVertical: 32,
    fontSize: 15,
  },
  logo: {
    width: 32,
    height: 32,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.WHITE,
  },
  searchInput: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.GRAY100,
    fontSize: 14,
    color: "#1a1a1a",
    borderColor: colors.GRAY300,
    borderWidth: 1,
  },
});
