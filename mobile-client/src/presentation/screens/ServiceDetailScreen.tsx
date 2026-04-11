import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  StatusBar,
  Image,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Dimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  useRoute,
  useNavigation,
  type CompositeNavigationProp,
} from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { HomeStackParamList } from "../../navigation/HomeStack";
import type { BottomTabParamList } from "../../navigation/BottomTabNavigator";
import { getService, addServiceInterest } from "../../api/services";
import type { Service } from "../../api/types";
import { formatTimeAgo } from "../../utils/formatTimeAgo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../constants/colors";
import ImagePreviewModal from "../components/ImagePreviewModal";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SLIDER_WIDTH = SCREEN_WIDTH;
const HEADER_HEIGHT = 280;

const HEADER_PALETTE = ["#6a48d8", "#2e4bf0", "#e53935", "#2e7d32", "#f9a825"];

function headerColorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
  }
  return HEADER_PALETTE[Math.abs(hash) % HEADER_PALETTE.length];
}

function getInitials(firstName: string, lastName: string): string {
  const f = (firstName || "").trim().charAt(0) || "";
  const l = (lastName || "").trim().charAt(0) || "";
  return (f + l).toUpperCase() || "?";
}

type MediaItem = {
  id: string;
  file_url: string;
};

type ServiceDetailNavigation = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList, "ServiceDetail">,
  BottomTabNavigationProp<BottomTabParamList>
>;

export default function ServiceDetailScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<HomeStackParamList, "ServiceDetail">>();
  const navigation = useNavigation<ServiceDetailNavigation>();

  const styles = useMemo(
    () => getStyles(insets.top, insets.bottom),
    [insets.top, insets.bottom],
  );

  const { id } = route.params;
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [interestLoading, setInterestLoading] = useState(false);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [modalInitialIndex, setModalInitialIndex] = useState(0);

  const sliderRef = useRef<FlatList<MediaItem>>(null);

  useEffect(() => {
    getService(id)
      .then(setService)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleExpressInterest = () => {
    setInterestLoading(true);

    addServiceInterest(id)
      .then(() => {
        Alert.alert("Success", "Your interest has been sent to the provider.");
      })
      .catch((e) => {
        Alert.alert(
          "Error",
          e instanceof Error ? e.message : "Could not send interest.",
        );
      })
      .finally(() => setInterestLoading(false));
  };

  const onSliderMomentumEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SLIDER_WIDTH);
    setActiveImageIndex(index);
  };

  const openImageModal = (index: number) => {
    setModalInitialIndex(index);
    setImageModalVisible(true);
  };

  const openProviderPublicProfile = () => {
    const userId = service?.user?.id;
    if (!userId) return;
    navigation.navigate("Profile", {
      screen: "PublicProfile",
      params: { userId },
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.loadingWrap}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={colors.BLUE} />
            <Text style={styles.loadingText}>Loading service details...</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !service) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.errorTopBar}>
          <TouchableOpacity
            style={styles.backButtonLight}
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-back" size={20} color="#1a1a1a" />
          </TouchableOpacity>
        </View>

        <View style={styles.loadingWrap}>
          <View style={styles.errorCard}>
            <Ionicons
              name="alert-circle-outline"
              size={44}
              color="#9e9e9e"
              style={{ marginBottom: 10 }}
            />
            <Text style={styles.errorTitle}>Something went wrong</Text>
            <Text style={styles.errorText}>{error ?? "Service not found"}</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const headerColor = headerColorFor(service.id);
  const isOffer = service.type === "Offer";
  const isEvent = service.type === "Event";
  const providerSectionLabel = isOffer
    ? "Service Provider"
    : isEvent
      ? "Event Organizer"
      : "Posted by";
  const viewProfileLinkColor = isEvent
    ? colors.AMBER
    : isOffer
      ? colors.GREEN
      : colors.BLUE;
  const displayName =
    [service.user.first_name, service.user.last_name]
      .filter(Boolean)
      .join(" ") || "Unknown";
  const initials = getInitials(service.user.first_name, service.user.last_name);
  const isRecurring = service.schedule_type === "Recurrent";

  const mediaItems = (service.media ?? []).filter(
    (item): item is MediaItem => Boolean(item?.file_url),
  );
  const hasMedia = mediaItems.length > 0;

  const detailItems = [
    service.duration
      ? {
          key: "duration",
          icon: "time-outline" as const,
          text: service.duration,
        }
      : null,
    service.location_area || service.location_type
      ? {
          key: "location",
          icon: "location-outline" as const,
          text: service.location_area || service.location_type || "",
        }
      : null,
    service.schedule_type || service.schedule_details
      ? {
          key: "schedule",
          icon: "calendar-outline" as const,
          text: `${service.schedule_type ?? ""}${
            service.schedule_details ? ` · ${service.schedule_details}` : ""
          }`,
        }
      : null,
    {
      key: "participants",
      icon: "people-outline" as const,
      text: `Up to ${service.max_participants} participant${
        service.max_participants !== 1 ? "s" : ""
      }`,
    },
    isRecurring
      ? {
          key: "recurring",
          icon: "repeat-outline" as const,
          text: "Recurring",
          highlight: true,
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    icon: keyof typeof Ionicons.glyphMap;
    text: string;
    highlight?: boolean;
  }>;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      <StatusBar barStyle={hasMedia ? "light-content" : "light-content"} />

      {hasMedia ? (
        <View style={styles.headerImageWrap}>
          <FlatList
            ref={sliderRef}
            data={mediaItems}
            keyExtractor={(_, index) => `media-${index}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onSliderMomentumEnd}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                activeOpacity={0.95}
                onPress={() => openImageModal(index)}
                style={styles.slide}
              >
                <Image
                  source={{ uri: item.file_url }}
                  style={styles.headerImage}
                />
              </TouchableOpacity>
            )}
          />

          <View
            style={[
              styles.headerTopBarAbsolute,
              { paddingTop: insets.top + 8 },
            ]}
          >
            <TouchableOpacity
              style={styles.backButtonDark}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.sliderFooter}>
            <View
              style={[
                styles.typeBadge,
                service.type === "Offer"
                  ? styles.typeOffer
                  : service.type === "Need"
                    ? styles.typeWant
                    : styles.typeEvent,
              ]}
            >
              <Text
                style={
                  service.type === "Offer"
                    ? styles.typeOfferBadgeText
                    : service.type === "Need"
                      ? styles.typeWantBadgeText
                      : styles.typeEventBadgeText
                }
              >
                {service.type}
              </Text>
            </View>

            {mediaItems.length > 1 ? (
              <View style={styles.pagination}>
                {mediaItems.map((_, index) => (
                  <View
                    key={`dot-${index}`}
                    style={[
                      styles.dot,
                      activeImageIndex === index && styles.activeDot,
                    ]}
                  />
                ))}
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={[styles.header, { backgroundColor: headerColor }]}>
          <View style={styles.headerOverlayTopLeft} />
          <View style={styles.headerOverlayBottomRight} />

          <View style={styles.headerTopRow}>
            <TouchableOpacity
              style={styles.backButtonDark}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.headerContent}>
            <View
              style={[
                styles.typeBadge,
                isOffer ? styles.typeOffer : styles.typeWant,
              ]}
            >
              <Text
                style={
                  isOffer ? styles.typeOfferBadgeText : styles.typeWantBadgeText
                }
              >
                {service.type}
              </Text>
            </View>

            <Text style={styles.headerTitle}>{service.title}</Text>
          </View>
        </View>
      )}

      <View style={styles.contentContainer}>
        <View style={styles.contentCard}>
          <Text style={styles.serviceTitle}>{service.title}</Text>

          <View style={styles.userSection}>
            <View style={styles.providerHeaderRow}>
              <Text style={styles.providerHeaderLabel}>
                {providerSectionLabel}
              </Text>
              {service.user.id ? (
                <TouchableOpacity
                  onPress={openProviderPublicProfile}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                  accessibilityRole="link"
                  accessibilityLabel="View profile"
                >
                  <Text
                    style={[
                      styles.viewProfileLink,
                      { color: viewProfileLinkColor },
                    ]}
                  >
                    View Profile →
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.userRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>

              <View style={styles.userMeta}>
                <Text style={styles.userName}>{displayName}</Text>
                <View style={styles.timeRow}>
                  <Ionicons
                    name="time-outline"
                    size={13}
                    color="#8a8f98"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.timeAgo}>
                    {formatTimeAgo(service.created_at)}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Description</Text>
            <Text style={styles.description}>{service.description || "—"}</Text>
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Details</Text>
            <View style={styles.detailsCard}>
              {detailItems.map((item, index) => (
                <View key={item.key}>
                  <View style={styles.detailRow}>
                    <View
                      style={[
                        styles.detailIconWrap,
                        item.highlight && styles.detailIconWrapHighlight,
                      ]}
                    >
                      <Ionicons
                        name={item.icon}
                        size={17}
                        color={item.highlight ? "#6a1b9a" : "#5f6368"}
                      />
                    </View>
                    <Text
                      style={[
                        styles.detailText,
                        item.highlight && styles.recurringText,
                      ]}
                    >
                      {item.text}
                    </Text>
                  </View>

                  {index !== detailItems.length - 1 ? (
                    <View style={styles.detailDivider} />
                  ) : null}
                </View>
              ))}
            </View>
          </View>

          {service.tags?.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionLabel}>Tags</Text>
              <View style={styles.tagsRow}>
                {service.tags.map((tag) => (
                  <View key={tag.id} style={styles.tag}>
                    <Text style={styles.tagText}>#{tag.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.ctaButton, interestLoading && styles.ctaDisabled]}
            onPress={handleExpressInterest}
            disabled={interestLoading}
            activeOpacity={0.9}
          >
            {interestLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="heart-outline" size={18} color="#fff" />
                <Text style={styles.ctaText}>Express interest</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ImagePreviewModal
        visible={imageModalVisible}
        images={mediaItems.map((item) => item.file_url)}
        initialIndex={modalInitialIndex}
        onClose={() => setImageModalVisible(false)}
      />
    </ScrollView>
  );
}

const getStyles = (topInset: number, bottomInset: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.WHITE,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: Math.max(28, bottomInset + 14),
    },
    loadingWrap: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 24,
    },
    contentContainer: {
      marginTop: -10,
    },
    loadingCard: {
      backgroundColor: "#fff",
      borderRadius: 24,
      paddingVertical: 28,
      paddingHorizontal: 26,
      alignItems: "center",
      shadowColor: "#000",
      shadowOpacity: 0.06,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
      minWidth: 220,
    },
    loadingText: {
      marginTop: 14,
      fontSize: 15,
      color: "#6b7280",
      fontWeight: "500",
    },
    errorTopBar: {
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    errorCard: {
      backgroundColor: "#fff",
      borderRadius: 24,
      paddingVertical: 28,
      paddingHorizontal: 22,
      alignItems: "center",
      shadowColor: "#000",
      shadowOpacity: 0.06,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    errorTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: "#1f2937",
      marginBottom: 8,
    },
    errorText: {
      fontSize: 15,
      color: "#6b7280",
      textAlign: "center",
      lineHeight: 22,
    },
    header: {
      position: "relative",
      paddingTop: topInset + 8,
      paddingHorizontal: 18,
      paddingBottom: 38,
      overflow: "hidden",
    },
    headerImageWrap: {
      width: "100%",
      height: HEADER_HEIGHT,
      backgroundColor: "#eaecef",
      position: "relative",
    },
    headerTopBarAbsolute: {
      position: "absolute",
      top: 0,
      left: 18,
      right: 18,
      zIndex: 10,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    slide: {
      width: SLIDER_WIDTH,
      height: HEADER_HEIGHT,
    },
    headerImage: {
      width: "100%",
      height: "100%",
      resizeMode: "cover",
    },
    sliderFooter: {
      position: "absolute",
      bottom: 14,
      left: 16,
      right: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    pagination: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(0,0,0,0.18)",
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: "rgba(255,255,255,0.55)",
      marginHorizontal: 3,
    },

    activeDot: {
      width: 18,
      backgroundColor: "#fff",
    },

    headerOverlayTopLeft: {
      position: "absolute",
      width: 180,
      height: 180,
      borderRadius: 999,
      backgroundColor: "rgba(255,255,255,0.10)",
      top: -60,
      left: -30,
    },

    headerOverlayBottomRight: {
      position: "absolute",
      width: 220,
      height: 220,
      borderRadius: 999,
      backgroundColor: "rgba(255,255,255,0.08)",
      right: -80,
      bottom: -90,
    },

    headerTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 28,
      zIndex: 2,
    },

    headerContent: {
      paddingRight: 8,
      zIndex: 2,
    },

    backButtonDark: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: "rgba(0,0,0,0.28)",
      alignItems: "center",
      justifyContent: "center",
    },

    backButtonLight: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: "#ffffff",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },

    typeBadge: {
      alignSelf: "flex-start",
      paddingVertical: 7,
      paddingHorizontal: 13,
      borderRadius: 999,
    },

    typeOffer: {
      backgroundColor: "rgba(240, 253, 244, 0.95)",
    },

    typeWant: {
      backgroundColor: "rgba(239, 246, 255, 0.95)",
    },

    typeEvent: {
      backgroundColor: "rgba(255, 245, 238, 0.95)",
    },
    typeOfferBadgeText: {
      fontSize: 12,
      fontWeight: "800",
      color: colors.GREEN,
      letterSpacing: 0.4,
    },
    typeWantBadgeText: {
      fontSize: 12,
      fontWeight: "800",
      color: colors.BLUE,
      letterSpacing: 0.4,
    },
    typeEventBadgeText: {
      fontSize: 12,
      fontWeight: "800",
      color: colors.AMBER,
      letterSpacing: 0.4,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: "800",
      color: "#fff",
      lineHeight: 34,
      letterSpacing: -0.3,
    },
    contentCard: {
      backgroundColor: "#fff",
      borderRadius: 28,
      padding: 18,
      shadowColor: "#0f172a",
      shadowOpacity: 0.08,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
      elevation: 5,
    },
    serviceTitle: {
      fontSize: 26,
      fontWeight: "800",
      color: "#1f2937",
      lineHeight: 32,
      marginBottom: 16,
      letterSpacing: -0.3,
    },
    userSection: {
      marginBottom: 10,
    },
    providerHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    providerHeaderLabel: {
      fontSize: 12,
      fontWeight: "800",
      color: "#98a2b3",
      textTransform: "uppercase",
      letterSpacing: 0.9,
      flex: 1,
      marginRight: 8,
    },
    viewProfileLink: {
      fontSize: 12,
      fontWeight: "600",
    },
    userRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#fafbff",
      borderRadius: 18,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: "#eef1f6",
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: "#2e7d32",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
      shadowColor: "#2e7d32",
      shadowOpacity: 0.16,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    avatarText: {
      fontSize: 17,
      fontWeight: "800",
      color: "#fff",
    },
    userMeta: {
      flex: 1,
    },
    userName: {
      fontSize: 16,
      fontWeight: "800",
      color: "#1f2937",
    },
    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 4,
    },
    timeAgo: {
      fontSize: 13,
      color: "#8a8f98",
      fontWeight: "500",
    },

    sectionBlock: {
      marginTop: 14,
    },

    sectionLabel: {
      fontSize: 12,
      fontWeight: "800",
      color: "#98a2b3",
      textTransform: "uppercase",
      letterSpacing: 0.9,
      marginBottom: 10,
      marginTop: 2,
    },

    description: {
      fontSize: 15,
      color: "#374151",
      lineHeight: 24,
    },

    detailsCard: {
      backgroundColor: "#fbfcfe",
      borderRadius: 18,
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: "#edf1f7",
    },

    detailRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
    },

    detailIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: "#f1f4f8",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
    },

    detailIconWrapHighlight: {
      backgroundColor: "#f4e8fb",
    },

    detailText: {
      fontSize: 15,
      color: "#475467",
      flex: 1,
      lineHeight: 22,
      fontWeight: "500",
    },

    recurringText: {
      color: "#6a1b9a",
      fontWeight: "700",
    },

    detailDivider: {
      height: 1,
      backgroundColor: "#eef2f6",
      marginLeft: 44,
    },

    tagsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },

    tag: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: "#f3f5f9",
      borderWidth: 1,
      borderColor: "#ebeff5",
    },

    tagText: {
      fontSize: 13,
      color: "#475467",
      fontWeight: "600",
    },

    ctaButton: {
      minHeight: 56,
      borderRadius: 16,
      backgroundColor: "#1a1a1a",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      marginTop: 24,
      shadowColor: "#000",
      shadowOpacity: 0.14,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },

    ctaDisabled: {
      opacity: 0.72,
    },

    ctaText: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.WHITE,
      letterSpacing: 0.2,
    },
  });
